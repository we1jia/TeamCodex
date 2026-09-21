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

# ==============================================================================
# 单实例互斥防抖机制 (杜绝二次双击进程互杀，唤醒旧实例后平滑退出)
# ==============================================================================
$appMutexName = "Local\TeamCodexAppMutex"
$createdNew = $false
$script:appMutex = $null
try {
  $script:appMutex = New-Object System.Threading.Mutex($true, $appMutexName, [ref]$createdNew)
} catch [System.Threading.AbandonedMutexException] {
  # 前序进程异常退出遗留的 AbandonedMutex，当前进程已自动接管所有权
  $createdNew = $true
} catch {
  $createdNew = $false
}

$isAlreadyRunning = (-not $createdNew)

# 辅助检测 1: 检查常驻托盘互斥体 Local\TeamCodexTrayMutex (微秒级无阻塞判定)
if (-not $isAlreadyRunning) {
  try {
    $trayMutexCheck = [System.Threading.Mutex]::OpenExisting("Local\TeamCodexTrayMutex")
    if ($trayMutexCheck) {
      $isAlreadyRunning = $true
      $trayMutexCheck.Dispose()
    }
  } catch {}
}

# 控制后台存活不代表托盘存在；托盘缺失时继续引导并恢复界面。

# 辅助检测 3: 检查已有 powershell 托盘进程
if (-not $isAlreadyRunning) {
  $existingTray = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    ($_.Name -like "*powershell*" -or $_.Name -like "*pwsh*") -and $_.ProcessId -ne $PID -and ($_.CommandLine -like "*tray-teamcodex*")
  }
  if ($existingTray) {
    $isAlreadyRunning = $true
  }
}

if ($isAlreadyRunning) {
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:18767/api/wake" -TimeoutSec 1 -ErrorAction SilentlyContinue | Out-Null
  } catch {}
  Write-Host "[TeamCodex] 检测到已有 TeamCodex 实例正在运行，唤醒已有实例并退出。" -ForegroundColor Cyan
  exit 0
}

# ==============================================================================
# 托盘秒级先行 (Instant Tray): 100毫秒内瞬间拉起常驻托盘，网络与后台服务完全异步执行
# ==============================================================================
$trayScript = Join-Path $WindowsRoot "tray-teamcodex.ps1"
if (Test-Path -LiteralPath $trayScript) {
  try {
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", "`"$trayScript`"") -WindowStyle Hidden
    Write-Host "[TeamCodex] 托盘进程已瞬间拉起并常驻任务栏通知区。" -ForegroundColor Green
  } catch {
    Write-Host "[TeamCodex] 托盘拉起异常: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

# 不按端口清理 Node：占用者可能是代理或其他 TeamCodex 安装实例。

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

function Test-HubHealthFast {
  param([string]$Url, [int]$TimeoutMs = 500)
  try {
    $req = [System.Net.WebRequest]::Create($Url)
    $req.Timeout = $TimeoutMs
    $req.ReadWriteTimeout = $TimeoutMs
    $req.Method = "GET"
    $resp = $req.GetResponse()
    $stream = $resp.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $text = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    $resp.Close()
    return ($text | ConvertFrom-Json)
  } catch {
    return $null
  }
}

$discoveredHost = $null
$candidateIps = $candidateIps | Select-Object -Unique
$portsToCheck = @(18765, $Port) | Select-Object -Unique

foreach ($ip in $candidateIps) {
  foreach ($p in $portsToCheck) {
    for ($retry = 1; $retry -le 1; $retry++) {
      try {
        $macHealth = Test-HubHealthFast -Url "http://${ip}:${p}/api/health" -TimeoutMs 500
        if ($macHealth -and $macHealth.ok -and $macHealth.service -eq "team-context-hub") {
          $discoveredHost = "http://${ip}:${p}"
          break
        }
      } catch {}
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

# Windows 的受控启动/重启由本地控制面独立完成，不能递归调用此带互斥锁的引导脚本。
# 已有 CDP 时观察器自动挂载；无 CDP 时面板要求明确确认，不在后台擅自接管客户端。

$env:TEAM_CONTEXT_HOST = $targetHost
$env:TEAM_CONTEXT_PORT = [string]$Port
# 不向观察器固定旧端口；账号切换后由目标主进程重新确定端口。
$env:TEAM_CONTEXT_DEFAULT_ROOM = "1024"
$env:TEAM_CONTEXT_DEFAULT_ROOM_KEY = $discoveredRoomKey

$LauncherPath = Join-Path $InstallRoot "server\bootstrap_launcher.mjs"
Log-Message "正在启动本地控制面..."
& $nodePath $LauncherPath
if ($LASTEXITCODE -ne 0) { throw "TeamCodex 控制后台未就绪，请查看诊断日志。" }

Log-Message "控制面将启动只跟随当前实例的观察器。无调试通道时，请在面板确认启动/重启。"

Log-Message "TeamCodex 后台协同链路初始化完成。"

# 保底检查：若托盘因异常未处于运行状态，则启动托盘
$trayStillRunning = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq "powershell.exe" -and $_.CommandLine -like "*tray-teamcodex*"
}
if (-not $trayStillRunning -and (Test-Path -LiteralPath $trayScript)) {
  Log-Message "托盘控制板未运行，执行保底启动"
  & $trayScript
} else {
  # 启动正常完成，释放启动脚本进程所持有的临时互斥体
  if ($script:appMutex) {
    try { $script:appMutex.ReleaseMutex() } catch {}
    try { $script:appMutex.Dispose() } catch {}
  }
}
