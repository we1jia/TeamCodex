$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}


$SourceWindowsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceRoot = Split-Path -Parent $SourceWindowsRoot
$InstallRoot = Join-Path $env:LOCALAPPDATA "TeamCodex"
$IconFile = Join-Path $InstallRoot "windows\assets\TeamCodex.ico"

# 引入架构自适应支持
. (Join-Path $SourceWindowsRoot "setup-runtime.ps1")
$arch = Get-SystemArchitecture

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "       TeamCodex Windows 桌面应用一键安装器" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "[1/4] 检测系统架构: Windows $arch" -ForegroundColor Yellow
if ($arch -eq "arm64") {
  Write-Host "      模式: ARM64 原生 (Mac 虚拟机/Windows on ARM)" -ForegroundColor Green
} else {
  Write-Host "      模式: AMD64/x64 (标准 PC / 64位 Windows)" -ForegroundColor Green
}

# 创建安装目录前清理旧后台进程
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    $cmd -and ($cmd.Contains("team-context") -or $cmd.Contains("TeamCodex"))
  } catch { $false }
} | Stop-Process -Force -ErrorAction SilentlyContinue

# 创建安装目录
Write-Host "[2/4] 正在更新安装目录: $InstallRoot" -ForegroundColor Cyan

$dirs = @("server", "inject", "ui", "windows", "windows\assets", "data")
foreach ($d in $dirs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot $d) | Out-Null
}

# 复制文件
Write-Host "[3/4] 正在复制应用资源..." -ForegroundColor Cyan
Copy-Item (Join-Path $SourceRoot "server\*") (Join-Path $InstallRoot "server") -Recurse -Force
Copy-Item (Join-Path $SourceRoot "inject\*") (Join-Path $InstallRoot "inject") -Recurse -Force
Copy-Item (Join-Path $SourceRoot "ui\*") (Join-Path $InstallRoot "ui") -Recurse -Force
Copy-Item (Join-Path $SourceWindowsRoot "*") (Join-Path $InstallRoot "windows") -Recurse -Force

# 确保运行时就绪
$node = Ensure-TeamCodexRuntime -TargetDir (Join-Path $InstallRoot "windows")
Write-Host "      Node.js 运行时已就绪: $node" -ForegroundColor Green

# 创建快捷方式
Write-Host "[4/4] 正在生成桌面快捷方式..." -ForegroundColor Cyan
$shell = New-Object -ComObject WScript.Shell
$desktopPath = [Environment]::GetFolderPath("Desktop")

# 1. 主应用快捷方式（无黑框静默运行）
$mainShortcutPath = Join-Path $desktopPath "TeamCodex.lnk"
$shortcut = $shell.CreateShortcut($mainShortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$(Join-Path $InstallRoot 'windows\run-silent.vbs')`""
$shortcut.WorkingDirectory = (Join-Path $InstallRoot "windows")
$shortcut.Description = "TeamCodex 团队协作套件"
if (Test-Path -LiteralPath $IconFile) {
  $shortcut.IconLocation = "$IconFile,0"
}
$shortcut.Save()

# 2. 隔离测试模式快捷方式
$testShortcutPath = Join-Path $desktopPath "TeamCodex 隔离测试模式.lnk"
$testShortcut = $shell.CreateShortcut($testShortcutPath)
$testShortcut.TargetPath = (Join-Path $InstallRoot "windows\run-test.cmd")
$testShortcut.WorkingDirectory = (Join-Path $InstallRoot "windows")
$testShortcut.Description = "TeamCodex 虚拟机独立测试环境"
if (Test-Path -LiteralPath $IconFile) {
  $testShortcut.IconLocation = "$IconFile,0"
}
$testShortcut.Save()

Write-Host "==================================================" -ForegroundColor Green
Write-Host "  安装完成！桌面已生成专属快捷方式：" -ForegroundColor Green
Write-Host "  1. [TeamCodex] - 双击在后台静默运行并挂载到日常 Codex (无黑框)" -ForegroundColor White
Write-Host "  2. [TeamCodex 隔离测试模式] - 独立窗口测试（适用于虚拟机初测）" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor Green
