@echo off
setlocal
pushd "%~dp0"
title TeamCodex Console Launcher
set "PS_SCRIPT=%~dp0run-teamcodex.ps1"
if not exist "%PS_SCRIPT%" (
  if exist "%~dp0windows\run-teamcodex.ps1" (
    set "PS_SCRIPT=%~dp0windows\run-teamcodex.ps1"
  )
)
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"
popd
if %EXIT_CODE% neq 0 (
  echo.
  echo [TeamCodex] Launcher exited with code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

