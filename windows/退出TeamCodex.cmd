@echo off
setlocal
title TeamCodex Cleaner
echo ==================================================
echo         TeamCodex 一键完全退出与清理工具
echo ==================================================
echo.
echo [1/3] 正在终止所有 TeamCodex 托盘后台...
taskkill /F /FI "WINDOWTITLE eq TeamCodex*" 2>nul
wmic process where "name='powershell.exe' and (CommandLine like '%%tray-teamcodex%%' or CommandLine like '%%run-teamcodex%%')" call terminate 2>nul

echo [2/3] 正在终止协同后台服务...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":18765 :18766 :18767 :19877" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a 2>nul
)

echo [3/3] 正在清理任务栏残留图标...
powershell.exe -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);' -Name NativeMethods -Namespace Win32; [Win32.NativeMethods]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)" 2>nul

echo.
echo ==================================================
echo   TeamCodex 已完全退出并清理完毕！
echo ==================================================
timeout /t 2 >nul
exit /b 0
