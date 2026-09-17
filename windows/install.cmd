@echo off
setlocal
pushd "%~dp0"
title TeamCodex Windows Installer
set "PS_SCRIPT=%~dp0install-teamcodex.ps1"
if not exist "%PS_SCRIPT%" (
  if exist "%~dp0windows\install-teamcodex.ps1" (
    set "PS_SCRIPT=%~dp0windows\install-teamcodex.ps1"
  )
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"
popd
if %EXIT_CODE% neq 0 (
  echo.
  echo [TeamCodex] Installation failed with exit code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)
echo.
echo [TeamCodex] Done. Press any key to exit...
pause >nul
