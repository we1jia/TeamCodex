@echo off
setlocal
title TeamCodex Safe Exit
echo Requesting this TeamCodex control plane to stop.
echo Codex, shared Hub and external proxies will NOT be terminated.
powershell.exe -NoProfile -Command "try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:18767/api/shutdown' -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 5; Write-Host $r.message } catch { Write-Host 'Shutdown was not confirmed. Please exit from the TeamCodex tray. No processes were force-killed.' }"
echo Close the TeamCodex tray using its Exit menu if it is still visible.
pause
exit /b 0
