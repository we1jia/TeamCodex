$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\windows\setup-runtime.ps1')
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('teamcodex-runtime-test-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $fixture | Out-Null
try {
  $oldNode = Join-Path $fixture 'node16.cmd'
  $newNode = Join-Path $fixture 'node20.cmd'
  $badNode = Join-Path $fixture 'broken.cmd'
  [IO.File]::WriteAllText($oldNode, "@echo off`r`necho v16.20.2`r`nexit /b 0`r`n")
  [IO.File]::WriteAllText($newNode, "@echo off`r`necho v20.18.0`r`nexit /b 0`r`n")
  [IO.File]::WriteAllText($badNode, "@echo off`r`necho invalid`r`nexit /b 1`r`n")
  if (Test-CompatibleNode $oldNode) { throw 'Node 16 must not be selected' }
  if (-not (Test-CompatibleNode $newNode)) { throw 'Node 20 should be usable' }
  if (Test-CompatibleNode $badNode) { throw 'Broken runtime must not be selected' }
  if (Test-CompatibleNode (Join-Path $fixture 'missing.exe')) { throw 'Missing runtime must not be selected' }
  function Find-InstalledNode { return $newNode }
  $selected = Ensure-TeamCodexRuntime -TargetDir $fixture
  if ($selected -ne $newNode) { throw 'A compatible system runtime should be reused without download' }
  # Explicit fixture environment: do not inherit runner credentials or assume
  # UseNewEnvironment retains process-only variables such as SystemRoot.
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = Join-Path $env:SystemRoot 'System32\PING.EXE'
  $startInfo.Arguments = '-n 30 127.0.0.1'
  $startInfo.WorkingDirectory = $fixture
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.EnvironmentVariables.Clear()
  $startInfo.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $startInfo.EnvironmentVariables['TEAM_CONTEXT_READER_TEST'] = 'context value with spaces=a'
  $child = [System.Diagnostics.Process]::Start($startInfo)
  try {
    $reader = Join-Path $PSScriptRoot '..\windows\read-process-context.ps1'
    $snapshot = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $reader -TargetPid $child.Id | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Native context reader failed' }
    if ($snapshot.env.TEAM_CONTEXT_READER_TEST -cne 'context value with spaces=a') { throw 'Native reader did not preserve environment values' }
    if ($snapshot.cwd.TrimEnd('\') -ine $fixture.TrimEnd('\')) { throw 'Native reader did not preserve working directory' }
  } finally {
    if (-not $child.HasExited) { Stop-Process -Id $child.Id -ErrorAction SilentlyContinue }
  }
  Write-Host 'Windows runtime compatibility checks passed.'
} finally {
  Remove-Item -LiteralPath $fixture -Recurse -Force
}
