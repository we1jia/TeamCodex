@echo off
setlocal
pushd "%~dp0"
title TeamCodex Windows Test Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-test.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
popd
if %EXIT_CODE% neq 0 (
  echo.
  echo [TeamCodex] TeamContext Windows test installation failed.
  pause
  exit /b %EXIT_CODE%
)
echo.
echo [TeamCodex] TeamContext Windows test installation completed.
pause

