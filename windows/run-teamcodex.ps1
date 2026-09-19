$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}


$WindowsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallRoot = Split-Path -Parent $WindowsRoot
$ServerPath = Join-Path $InstallRoot "server\dev_host.mjs"
$AttachPath = Join-Path $InstallRoot "inject\attach_codex.mjs"
$Port = if ($env:TEAM_CODEX_PORT) { [int]$env:TEAM_CODEX_PORT } else { 18765 }
$CdpPort = if ($env:TEAM_CODEX_CDP_PORT) { [int]$env:TEAM_CODEX_CDP_PORT } else { 18766 }
$DataRoot = Join-Path $InstallRoot "data"
$LogFile = Join-Path $DataRoot "launcher.log"

New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null

function Stop-OrphanNodeProcessesOnPorts {
  param([int[]]$Ports = @(18765, 18766, 18767, 19877))
  foreach ($p in $Ports) {
    try {
      $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
      foreach ($conn in $conns) {
        $procId = $conn.OwningProcess
        if ($procId -and $procId -gt 4) {
          $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
          if ($proc -and $proc.ProcessName -like "*node*") {
            Write-Host "[TeamCodex] 清理占用端口 $p 的孤立 Node 进程 (PID $procId)..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
          }
        }
      }
    } catch {}
    try {
      $lines = netstat -ano | Select-String ":$p\s+.*LISTENING\s+(\d+)"
      foreach ($match in $lines) {
        if ($match.Matches[0].Groups[1].Value) {
          $netPid = [int]$match.Matches[0].Groups[1].Value
          if ($netPid -gt 4) {
            $proc = Get-Process -Id $netPid -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -like "*node*") {
              Write-Host "[TeamCodex] 清理占用端口 $p 的孤立 Node 进程 (PID $netPid)..." -ForegroundColor Yellow
              Stop-Process -Id $netPid -Force -ErrorAction SilentlyContinue
            }
          }
        }
      }
    } catch {}
  }
}
Stop-OrphanNodeProcessesOnPorts -Ports @(18765, 19877)
Stop-OrphanNodeProcessesOnPorts -Ports @(18766, 18767)

# 清理已存在的旧托盘 powershell 实例，避免重复托盘图标
try {
  Get-Process -Name "powershell" -ErrorAction SilentlyContinue | Where-Object {
    $_.Id -ne $PID -and ($_.CommandLine -like "*tray-teamcodex*" -or $_.CommandLine -like "*run-teamcodex*")
  } | Stop-Process -Force -ErrorAction SilentlyContinue
} catch {}

$discoveryFile = Join-Path $InstallRoot "data\hub_discovery.json"
$discoveredHubUrl = $null
$discoveredRoomKey = "123456"
if (Test-Path -LiteralPath $discoveryFile) {
  try {
    $discContent = Get-Content -LiteralPath $discoveryFile -Raw -Encoding utf8 | ConvertFrom-Json
    if ($discContent -and $discContent.hub_url) {
      $discoveredHubUrl = [string]$discContent.hub_url
      Write-Host "[TeamCodex] 从共享通道读取中枢发现配置: $discoveredHubUrl" -ForegroundColor Cyan
      if ($discContent.rooms -and $discContent.rooms."1024" -and $discContent.rooms."1024".key) {
        $discoveredRoomKey = [string]$discContent.rooms."1024".key
      } elseif ($discContent.known_keys -and $discContent.known_keys."1024") {
        $discoveredRoomKey = [string]$discContent.known_keys."1024"
      }
    }
  } catch {
    Write-Host "[TeamCodex] 读取中枢发现文件失败: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

. (Join-Path $WindowsRoot "setup-runtime.ps1")
$nodePath = Ensure-TeamCodexRuntime -TargetDir $WindowsRoot
if (-not $nodePath) {
  throw "无法获取 Node.js 运行环境。"
}

function Log-Message {
  param([string]$Msg)
  $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $line = "[$timestamp] $Msg"
  Add-Content -Path $LogFile -Value $line -Encoding utf8
  Write-Host $line
}

function Wait-Endpoint {
  param(
    [string]$Url,
    [int]$Attempts = 40
  )
  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $result = Invoke-RestMethod -Uri $Url -TimeoutSec 1
      if ($result) { return $result }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  return $null
}

function Resolve-CodexPath {
  Log-Message "正在定位 Codex / ChatGPT 客户端..."

  $candidates = @()
  if ($env:TEAM_CODEX_EXE) { $candidates += $env:TEAM_CODEX_EXE }
  if ($env:TEAM_CONTEXT_CODEX_EXE) { $candidates += $env:TEAM_CONTEXT_CODEX_EXE }

  # 1. 优先从当前正在运行的进程直接获取绝对路径（毫秒级）
  $procs = Get-Process -Name @("Codex", "ChatGPT") -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    try {
      if ($p.Path -and (Test-Path -LiteralPath $p.Path -PathType Leaf)) {
        Log-Message "从运行中进程发现客户端: $($p.Path)"
        return (Resolve-Path -LiteralPath $p.Path).Path
      }
    } catch {}
  }

  # 2. 检查常见安装绝对路径（固定列表，瞬间完成）
  $fixedCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\ChatGPT\ChatGPT.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Codex\Codex.exe"),
    (Join-Path $env:LOCALAPPDATA "codex\Codex.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\OpenAI\ChatGPT\ChatGPT.exe"),
    (Join-Path $env:ProgramFiles "ChatGPT\ChatGPT.exe"),
    (Join-Path $env:ProgramFiles "Codex\Codex.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "ChatGPT\ChatGPT.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Codex\Codex.exe")
  )
  foreach ($cand in $fixedCandidates) {
    if ($cand -and (Test-Path -LiteralPath $cand -PathType Leaf)) {
      Log-Message "发现客户端: $cand"
      return (Resolve-Path -LiteralPath $cand).Path
    }
  }

  # 3. 检查 Windows Store (MSIX / UWP) 安装版本
  $appxList = Get-AppxPackage -Name "*ChatGPT*" -ErrorAction SilentlyContinue
  if (-not $appxList) { $appxList = Get-AppxPackage -Name "*Codex*" -ErrorAction SilentlyContinue }
  if (-not $appxList) { $appxList = Get-AppxPackage -Name "*OpenAI*" -ErrorAction SilentlyContinue }

  foreach ($appx in $appxList) {
    if ($appx -and $appx.InstallLocation) {
      $appxCandidates = @(
        (Join-Path $appx.InstallLocation "app\ChatGPT.exe"),
        (Join-Path $appx.InstallLocation "ChatGPT.exe"),
        (Join-Path $appx.InstallLocation "app\Codex.exe"),
        (Join-Path $appx.InstallLocation "Codex.exe")
      )
      foreach ($c in $appxCandidates) {
        if (Test-Path -LiteralPath $c -PathType Leaf) {
          Log-Message "从应用包发现客户端: $c"
          return (Resolve-Path -LiteralPath $c).Path
        }
      }
    }
  }

  # 4. 检查 PATH 环境变量
  foreach ($name in @("ChatGPT.exe", "Codex.exe")) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
      Log-Message "从 PATH 发现客户端: $($command.Source)"
      return $command.Source
    }
  }

  # 5. 从开始菜单快捷方式解析
  $wscript = New-Object -ComObject WScript.Shell
  $shortcutFolders = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs"
  )
  foreach ($folder in $shortcutFolders) {
    if (Test-Path -LiteralPath $folder) {
      $shortcuts = Get-ChildItem -LiteralPath $folder -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue
      foreach ($lnk in $shortcuts) {
        if ($lnk.Name -like "*ChatGPT*" -or $lnk.Name -like "*Codex*") {
          try {
            $target = $wscript.CreateShortcut($lnk.FullName).TargetPath
            if ($target -and (Test-Path -LiteralPath $target -PathType Leaf) -and ($target.EndsWith(".exe"))) {
              Log-Message "从开始菜单发现客户端: $target"
              return $target
            }
          } catch {}
        }
      }
    }
  }

  foreach ($cand in $candidates) {
    if ($cand -and (Test-Path -LiteralPath $cand -PathType Leaf)) { return (Resolve-Path -LiteralPath $cand).Path }
  }
  return $null
}

Log-Message "TeamCodex Windows 启动中 (Node: $nodePath, Port: $Port)"

# 1. 确定协同中枢目标地址 (优先读取共享中枢并自动探测 Mac 宿主机 Real E2E，坚决不在已发现宿主机时启动本地单机 Hub)
$targetHost = "http://127.0.0.1:$Port"
$candidateIps = @("10.211.55.2")
if ($discoveredHubUrl) {
  try {
    $u = [System.Uri]$discoveredHubUrl
    if ($u.Host -and -not $candidateIps.Contains($u.Host)) { $candidateIps = @($u.Host) + $candidateIps }
  } catch {}
}
try {
  $gw = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Select-Object -First 1).NextHop
  if ($gw -and -not $candidateIps.Contains($gw)) { $candidateIps += $gw }
} catch {}

$discoveredHost = $null
foreach ($ip in $candidateIps) {
  foreach ($p in @(18765, $Port)) {
    for ($retry = 1; $retry -le 3; $retry++) {
      try {
        $macHealth = Invoke-RestMethod -Uri "http://${ip}:${p}/api/health" -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($macHealth -and $macHealth.ok -and $macHealth.service -eq "team-context-hub") {
          $discoveredHost = "http://${ip}:${p}"
          break
        }
      } catch {}
      Start-Sleep -Milliseconds 300
    }
    if ($discoveredHost) { break }
  }
  if ($discoveredHost) { break }
}

if ($discoveredHost) {
  $targetHost = $discoveredHost
  Log-Message "成功发现 Mac 宿主机 TeamCodex 协同中枢: $targetHost (已启用 Real E2E，跳过本地单机 Hub 启动)"
} else {
  Log-Message "未检测到宿主机协同中枢，准备启动或复用本地单机 Hub..."
  $existingHealth = $null
  try { $existingHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1 } catch {}
  if (-not $existingHealth -or -not ($existingHealth.ok -and $existingHealth.service -eq "team-context-hub")) {
    Log-Message "正在启动 TeamCodex 本地服务..."
    Start-Process -FilePath $nodePath -ArgumentList @($ServerPath) -WorkingDirectory $InstallRoot -WindowStyle Hidden
    $ready = Wait-Endpoint -Url "http://127.0.0.1:$Port/api/health"
    if (-not $ready) {
      Log-Message "TeamCodex 本地服务启动超时。"
      throw "TeamCodex 本地服务未能正常启动，详见日志: $LogFile"
    }
    Log-Message "TeamCodex 服务就绪 (http://127.0.0.1:$Port)"
  } else {
    Log-Message "复用已有 TeamCodex 服务 (http://127.0.0.1:$Port)"
  }
}

function Stop-ProcessGracefully {
  param(
    [System.Diagnostics.Process[]]$Processes,
    [int]$TimeoutSeconds = 4
  )
  if (-not $Processes -or $Processes.Count -eq 0) { return }

  Log-Message "正在向当前运行的客户端发送窗口关闭消息 (优雅退出，保存草稿)..."
  foreach ($p in $Processes) {
    try {
      if (-not $p.HasExited) {
        $closed = $p.CloseMainWindow()
        if (-not $closed) {
          $p.Close()
        }
      }
    } catch {}
  }

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    $stillRunning = Get-Process -Name @("ChatGPT", "Codex") -ErrorAction SilentlyContinue
    if (-not $stillRunning) { break }
    Start-Sleep -Milliseconds 200
  }

  $remaining = Get-Process -Name @("ChatGPT", "Codex") -ErrorAction SilentlyContinue
  if ($remaining) {
    Log-Message "客户端在 ${TimeoutSeconds} 秒内未完全退出，执行安全清理..."
    foreach ($rem in $remaining) {
      try { Stop-Process -Id $rem.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    Start-Sleep -Milliseconds 500
  } else {
    Log-Message "原客户端已平滑优雅退出。"
  }
}

# 2. 检查是否有开放 CDP 的 Codex / ChatGPT 实例 (优先动态嗅探运行中实例已开放的任意 CDP 端口)
$detectedCdpPort = $null
try {
  $procCmds = Get-CimInstance Win32_Process -Filter "Name like '%ChatGPT%' or Name like '%Codex%'" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CommandLine
  foreach ($cmd in $procCmds) {
    if ($cmd -match "--remote-debugging-port=(\d+)") {
      $detectedCdpPort = [int]$matches[1]
      break
    }
  }
} catch {}

$cdpPortsToTry = @()
if ($detectedCdpPort) { $cdpPortsToTry += $detectedCdpPort }
if (-not $cdpPortsToTry.Contains($CdpPort)) { $cdpPortsToTry += $CdpPort }

$cdpReady = $null
foreach ($tryPort in $cdpPortsToTry) {
  try {
    $cdpReady = Invoke-RestMethod -Uri "http://127.0.0.1:$tryPort/json/version" -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($cdpReady) {
      $CdpPort = $tryPort
      Log-Message "检测到运行中 Codex 实例已启用 CDP 端口: $CdpPort，启用热挂载模式"
      break
    }
  } catch {}
}

if (-not $cdpReady) {
  # 检查是否有正在运行的 ChatGPT.exe 或 Codex.exe
  $running = Get-Process -Name @("ChatGPT", "Codex") -ErrorAction SilentlyContinue
  
  # 优先在进程还在运行的时候捕获其真实可执行文件路径
  $codexExe = Resolve-CodexPath

  if ($running) {
    Log-Message "检测到 ChatGPT/Codex 正在运行但未开启协同调试端口。"
    Log-Message "开始平滑接管：保存当前草稿并重启客户端..."
    Stop-ProcessGracefully -Processes $running -TimeoutSeconds 4
  }

  if ($codexExe) {
    Log-Message "正在以协同模式拉起 Codex/ChatGPT (调试端口: $CdpPort): $codexExe"
    $codexArgs = @(
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=$CdpPort"
    )
    Start-Process -FilePath $codexExe -ArgumentList $codexArgs -WorkingDirectory (Split-Path -Parent $codexExe)
    $cdpReady = Wait-Endpoint -Url "http://127.0.0.1:$CdpPort/json/version" -Attempts 40
    if ($cdpReady) {
      Log-Message "Codex/ChatGPT 协同调试通道已就绪！"
    } else {
      Log-Message "警告: 未能在预期时间内连通调试端口，请检查防火墙或进程是否启动。"
    }
  } else {
    Log-Message "未自动找到 ChatGPT.exe 或 Codex.exe。请手动启动 Codex 并添加 --remote-debugging-port=$CdpPort 参数。"
  }
}

$env:TEAM_CONTEXT_HOST = $targetHost
$env:TEAM_CONTEXT_PORT = [string]$Port
$env:TEAM_CONTEXT_CDP_URL = "http://127.0.0.1:$CdpPort"
$env:TEAM_CONTEXT_DEFAULT_ROOM = "1024"
$env:TEAM_CONTEXT_DEFAULT_ROOM_KEY = $discoveredRoomKey

$LauncherPath = Join-Path $InstallRoot "server\launcher_host.mjs"
Log-Message "正在启动本地控制面..."
Start-Process -FilePath $nodePath -ArgumentList @($LauncherPath) -WorkingDirectory $InstallRoot -WindowStyle Hidden

Log-Message "开始连接 Codex CDP 进行 TeamCodex 注入..."
Start-Process -FilePath $nodePath -ArgumentList @($AttachPath) -WorkingDirectory $InstallRoot -WindowStyle Hidden

$trayScript = Join-Path $WindowsRoot "tray-teamcodex.ps1"
if (Test-Path -LiteralPath $trayScript) {
  Log-Message "托盘控制板已启动"
  & $trayScript
} else {
  Log-Message "未找到托盘脚本，前台等待注入进程。"
  & $nodePath $AttachPath
}
