$ErrorActionPreference = "Stop"

$SourceWindowsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceRoot = Split-Path -Parent $SourceWindowsRoot
$InstallRoot = Join-Path $env:LOCALAPPDATA "TeamContext-Test"

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot "server") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot "inject") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot "ui") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot "windows") | Out-Null
Copy-Item (Join-Path $SourceRoot "server\*") (Join-Path $InstallRoot "server") -Recurse -Force
Copy-Item (Join-Path $SourceRoot "inject\*") (Join-Path $InstallRoot "inject") -Recurse -Force
Copy-Item (Join-Path $SourceRoot "ui\*") (Join-Path $InstallRoot "ui") -Recurse -Force
Copy-Item (Join-Path $SourceWindowsRoot "mock-codex-host.html") (Join-Path $InstallRoot "windows") -Force
Copy-Item (Join-Path $SourceWindowsRoot "run-test.ps1") (Join-Path $InstallRoot "windows") -Force
Copy-Item (Join-Path $SourceWindowsRoot "setup-runtime.ps1") (Join-Path $InstallRoot "windows") -Force
if (Test-Path (Join-Path $SourceWindowsRoot "run-test.cmd")) {
    Copy-Item (Join-Path $SourceWindowsRoot "run-test.cmd") (Join-Path $InstallRoot "windows") -Force
}

$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "TeamContext Windows Test.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $InstallRoot 'windows\run-test.ps1')`""
$shortcut.WorkingDirectory = $InstallRoot
$shortcut.Description = "TeamContext Windows isolated test"
$shortcut.Save()

Write-Host "Installed to $InstallRoot"
Write-Host "Desktop shortcut: $shortcutPath"
Write-Host "This package is isolated and does not include local Codex conversations or real team data."
