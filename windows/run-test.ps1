$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}


$WindowsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallRoot = Split-Path -Parent $WindowsRoot
$ServerPath = Join-Path $InstallRoot "server\dev_host.mjs"
$AttachPath = Join-Path $InstallRoot "inject\attach_codex.mjs"
$SeedPath = Join-Path $InstallRoot "inject\seed_native_fixture.mjs"
$Port = if ($env:TEAM_CODEX_TEST_PORT) { [int]$env:TEAM_CODEX_TEST_PORT } else { 19877 }
$CdpPort = if ($env:TEAM_CODEX_TEST_CDP_PORT) { [int]$env:TEAM_CODEX_TEST_CDP_PORT } else { 19878 }
$ExpectedHubVersion = "3.2.0"
$DataRoot = Join-Path $env:TEMP "team-codex-test-data"
$ProfileRoot = Join-Path $InstallRoot "codex-profile"
$DataFile = Join-Path $DataRoot "messages.json"

# 引入架构自适应运行时保障
. (Join-Path $WindowsRoot "setup-runtime.ps1")

function Stop-OrphanNodeProcessesOnPorts {
  param([int[]]$Ports = @(18765, 19877))
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

function Resolve-CodexPath {
  Write-Host "[TeamCodex] 正在定位 Codex / ChatGPT 客户端..." -ForegroundColor Cyan

  $candidates = @()
  if ($env:TEAM_CODEX_EXE) { $candidates += $env:TEAM_CODEX_EXE }
  if ($env:TEAM_CONTEXT_CODEX_EXE) { $candidates += $env:TEAM_CONTEXT_CODEX_EXE }

  # 1. 优先从当前正在运行的进程直接获取绝对路径（毫秒级）
  $procs = Get-Process -Name @("Codex", "ChatGPT") -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    try {
      if ($p.Path -and (Test-Path -LiteralPath $p.Path -PathType Leaf)) {
        Write-Host "[TeamCodex] 从运行中进程发现客户端: $($p.Path)" -ForegroundColor Green
        return (Resolve-Path -LiteralPath $p.Path).Path
      }
    } catch {}
  }

  # 2. 检查常见安装绝对路径（固定列表，瞬间完成，坚决不全盘递归扫描）
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
      Write-Host "[TeamCodex] 发现客户端: $cand" -ForegroundColor Green
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
          Write-Host "[TeamCodex] 从应用包发现客户端: $c" -ForegroundColor Green
          return (Resolve-Path -LiteralPath $c).Path
        }
      }
    }
  }

  # 4. 检查 PATH 环境变量
  foreach ($name in @("ChatGPT.exe", "Codex.exe")) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
      Write-Host "[TeamCodex] 从 PATH 发现客户端: $($command.Source)" -ForegroundColor Green
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
              Write-Host "[TeamCodex] 从开始菜单发现客户端: $target" -ForegroundColor Green
              return $target
            }
          } catch {}
        }
      }
    }
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      Write-Host "[TeamCodex] 发现自定义客户端: $candidate" -ForegroundColor Green
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  return $null
}

function Wait-Endpoint {
  param(
    [string]$Url,
    [int]$Attempts = 60
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

function Stop-TestAttachProcesses {
  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "node.exe" -and ([string]$_.CommandLine).Contains($AttachPath) }
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-TestCodexProcesses {
  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { ($_.Name -eq "ChatGPT.exe" -or $_.Name -eq "Codex.exe") -and ([string]$_.CommandLine).Contains($ProfileRoot) }
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

# 1. 确保 Node.js 运行时就绪（ARM64 / x64 自动适配）
$nodePath = Ensure-TeamCodexRuntime -TargetDir $WindowsRoot
if (-not $nodePath) {
  throw "Node.js 运行时准备失败，无法启动测试。"
}
if (-not (Test-Path -LiteralPath $ServerPath)) {
  throw "测试套件不完整，缺少: $ServerPath"
}
if (-not (Test-Path -LiteralPath $AttachPath)) {
  throw "测试套件不完整，缺少: $AttachPath"
}
if (-not (Test-Path -LiteralPath $SeedPath)) {
  throw "测试套件不完整，缺少: $SeedPath"
}

$codexPath = Resolve-CodexPath
if (-not $codexPath) {
  throw "未找到 Windows 版 Codex/ChatGPT 可执行文件。请先在虚拟机中安装 ChatGPT，或设置环境变量 TEAM_CODEX_EXE 为 ChatGPT.exe 的完整路径。"
}

New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ProfileRoot | Out-Null

# 自动探测宿主机 Hub (支持 Parallels 虚拟机与 Mac 宿主机端到端协同测试)
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
        $health = Invoke-RestMethod -Uri "http://${ip}:${p}/api/health" -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($health -and $health.ok -and $health.service -eq "team-context-hub") {
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

$server = $null
$codex = $null
$attach = $null
try {
  Stop-TestAttachProcesses
  Stop-TestCodexProcesses

  if ($discoveredHost) {
    $targetHost = $discoveredHost
    Write-Host "[TeamCodex] 成功发现 Mac 宿主机 TeamCodex 协同中枢: $targetHost (已自动启用跨机协同模式！)" -ForegroundColor Green
    $env:TEAM_CONTEXT_DEFAULT_ROOM = "1024"
    $env:TEAM_CONTEXT_DEFAULT_ROOM_KEY = $discoveredRoomKey
    Write-Host "[TeamCodex] 默认协同空间已设置为 1024 (密钥已自动注入: $discoveredRoomKey)" -ForegroundColor Cyan
  } else {
    Write-Host "[TeamCodex] 未检测到宿主机 Hub，正在启动本地单机测试 Hub (端口 $Port)..." -ForegroundColor Cyan
    $existingHealth = $null
    try { $existingHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1 } catch {}
    if ($existingHealth) {
      if (-not ($existingHealth.ok -and $existingHealth.isolated -and $existingHealth.service -eq "team-context-hub")) {
        throw "端口 $Port 已被其他服务占用。"
      }
    } else {
      $server = Start-Process -FilePath $nodePath -ArgumentList @($ServerPath) -WorkingDirectory $InstallRoot -PassThru -WindowStyle Hidden
    }
    $readyHealth = Wait-Endpoint -Url "http://127.0.0.1:$Port/api/health"
    if (-not $readyHealth) {
      throw "TeamCodex 测试 Hub 启动超时。"
    }
    Write-Host "[TeamCodex] 本地测试协作 Hub 已就绪。" -ForegroundColor Green
  }

  $env:TEAM_CONTEXT_HOST = $targetHost
  $env:TEAM_CONTEXT_PORT = [string]$Port
  $env:TEAM_CONTEXT_DATA_DIR = $DataRoot
  $env:TEAM_CONTEXT_DATA_FILE = $DataFile
  if (-not $env:TEAM_CONTEXT_DEFAULT_ROOM) { $env:TEAM_CONTEXT_DEFAULT_ROOM = "1024" }
  if (-not $env:TEAM_CONTEXT_DEFAULT_ROOM_KEY) { $env:TEAM_CONTEXT_DEFAULT_ROOM_KEY = $discoveredRoomKey }
  $env:TEAM_CONTEXT_CDP_URL = "http://127.0.0.1:$CdpPort"

  Write-Host "[TeamCodex] 正在拉起独立测试窗口..." -ForegroundColor Cyan
  $codexArgs = @(
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=$CdpPort",
    "--user-data-dir=`"$ProfileRoot`"",
    "--no-first-run"
  )
  $codex = Start-Process -FilePath $codexPath -ArgumentList $codexArgs -WorkingDirectory $InstallRoot -PassThru
  if (-not (Wait-Endpoint -Url "http://127.0.0.1:$CdpPort/json/version")) {
    throw "Codex 实例未能在端口 $CdpPort 暴露 CDP 调试接口。"
  }
  Write-Host "[TeamCodex] Codex CDP 调试端口已连接。" -ForegroundColor Green

  & $nodePath $SeedPath
  Write-Host "==================================================" -ForegroundColor Green
  Write-Host "[TeamCodex] Windows 原生隔离测试已成功启动！" -ForegroundColor Green
  Write-Host "  - 架构模式: $(Get-SystemArchitecture)" -ForegroundColor Cyan
  Write-Host "  - Codex 程序: $codexPath"
  Write-Host "  - 隔离用户数据: $ProfileRoot"
  Write-Host "  - 测试 Hub 数据: $DataRoot"
  Write-Host "已在独立窗口中挂载 TeamCodex 侧边栏，按 Ctrl+C 可退出测试并清理环境。" -ForegroundColor Yellow
  Write-Host "==================================================" -ForegroundColor Green
  
  $attach = Start-Process -FilePath $nodePath -ArgumentList @($AttachPath) -WorkingDirectory $InstallRoot -PassThru -NoNewWindow
  Wait-Process -Id $attach.Id
} finally {
  if ($attach -and -not $attach.HasExited) { Stop-Process -Id $attach.Id -Force -ErrorAction SilentlyContinue }
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  Stop-TestAttachProcesses
  Stop-TestCodexProcesses
  if ($codex -and -not $codex.HasExited) { Stop-Process -Id $codex.Id -Force -ErrorAction SilentlyContinue }
}
