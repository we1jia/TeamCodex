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
  $child = Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile -NonInteractive -Command "Start-Sleep -Seconds 30"' -WorkingDirectory $fixture -UseNewEnvironment -WindowStyle Hidden -PassThru
  try {
    $reader = Join-Path $PSScriptRoot '..\windows\read-process-context.ps1'
    $snapshot = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $reader -TargetPid $child.Id | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $snapshot.env.SystemRoot) { throw 'Native context reader failed' }
    if ($snapshot.cwd.TrimEnd('\') -ine $fixture.TrimEnd('\')) { throw 'Native reader did not preserve working directory' }
  } finally {
    if (-not $child.HasExited) { Stop-Process -Id $child.Id -ErrorAction SilentlyContinue }
  }
  Write-Host 'Windows runtime compatibility checks passed.'
} finally {
  Remove-Item -LiteralPath $fixture -Recurse -Force
}
