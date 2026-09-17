@echo off
setlocal
pushd "%~dp0"
title TeamCodex Isolated Test
set "PS_SCRIPT=%~dp0run-test.ps1"
if not exist "%PS_SCRIPT%" (
  if exist "%~dp0windows\run-test.ps1" (
    set "PS_SCRIPT=%~dp0windows\run-test.ps1"
  )
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"
popd
if %EXIT_CODE% neq 0 (
  echo.
  echo [TeamCodex] Test stopped or exited with code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

