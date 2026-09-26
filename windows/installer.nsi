; --------------------------------------------------
; TeamCodex Windows Installer (NSIS Script)
; --------------------------------------------------

!include "MUI2.nsh"
!include "FileFunc.nsh"

; General Configuration
!define APP_VERSION "1.2.6"
Name "TeamCodex"
OutFile "..\TeamCodex-Setup.exe"
Unicode True
RequestExecutionLevel user

; Default Installation Directory ($LOCALAPPDATA\Programs\TeamCodex)
InstallDir "$LOCALAPPDATA\Programs\TeamCodex"
InstallDirRegKey HKCU "Software\TeamCodex" "Install_Dir"

; Interface Settings
!define MUI_ABORTWARNING
!define MUI_ICON "assets\TeamCodex.ico"
!define MUI_UNICON "assets\TeamCodex.ico"

; Welcome & Finish Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchTeamCodex
!define MUI_FINISHPAGE_RUN_TEXT "运行 TeamCodex"
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Language
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; Installer Section
Section "TeamCodex Core" SecCore
  SetOutPath "$INSTDIR"
  
  ; Explicit runtime allowlist: never include local data, keys, logs or data-directory.txt.
  File "..\version.json"
  File "..\README.md"
  CreateDirectory "$INSTDIR\data"

  SetOutPath "$INSTDIR\server"
  File "..\server\dev_host.mjs"
  File "..\server\launcher_host.mjs"
  File "..\server\codex_runtime.mjs"
  File "..\server\codex_runtime_policy.mjs"
  File "..\server\launch_context.mjs"
  File "..\server\runtime_identity.mjs"
  File "..\server\bootstrap_launcher.mjs"
  File "..\server\workspace_store.mjs"
  File "..\server\workspace_validation.mjs"
  File "..\server\workspace_routes.mjs"
  File "..\server\workspace_bundle.mjs"

  SetOutPath "$INSTDIR\inject"
  File "..\inject\attach_codex.mjs"
  File "..\inject\host_adapter.mjs"
  File "..\inject\composer_appearance.js"
  File "..\inject\cdp_websocket.mjs"
  File "..\inject\sidebar_fullscreen.js"
  File "..\inject\workspace.js"
  File "..\inject\workspace.css"
  File "..\inject\safety.mjs"
  File "..\inject\run_isolated.mjs"
  File "..\inject\verify_native_smoke.mjs"
  File "..\inject\inspect_theme.mjs"
  File "..\inject\seed_native_fixture.mjs"

  SetOutPath "$INSTDIR\ui"
  File "..\ui\index.html"
  File "..\ui\panel.html"
  File "..\ui\workspace.html"
  File "..\ui\workspace_boot.js"

  SetOutPath "$INSTDIR\windows"
  File "..\windows\install-teamcodex.ps1"
  File "..\windows\install-test.ps1"
  File "..\windows\run-test.ps1"
  File "..\windows\setup-runtime.ps1"
  File "..\windows\read-process-context.ps1"
  File "..\windows\run-teamcodex.ps1"
  File "..\windows\tray-teamcodex.ps1"
  File "..\windows\run-silent.vbs"
  File "..\windows\install-test.cmd"
  File "..\windows\install.cmd"
  File "..\windows\run-test.cmd"
  File "..\windows\一键安装到桌面.cmd"
  File "..\windows\启动TeamCodex(无黑框静默).vbs"
  File "..\windows\启动TeamCodex.cmd"
  File "..\windows\启动测试模式.cmd"
  File "..\windows\退出TeamCodex.cmd"
  File "..\windows\README.md"
  File "..\windows\mock-codex-host.html"

  SetOutPath "$INSTDIR\windows\assets"
  File "..\windows\assets\TeamCodex.ico"
  File "..\windows\assets\TeamContext.ico"
  File "..\windows\assets\TeamCodex.png"
  File "..\windows\assets\TeamCodex-32.png"
  SetOutPath "$INSTDIR\assets"
  File "..\assets\icon.png"
  SetOutPath "$INSTDIR"
  
  ; Store Installation Folder
  WriteRegStr HKCU "Software\TeamCodex" "Install_Dir" "$INSTDIR"
  
  ; Create Uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  ; Register in Windows Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "DisplayName" "TeamCodex"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "DisplayIcon" "$INSTDIR\windows\assets\TeamCodex.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "Publisher" "we1jia"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "NoRepair" 1
  
  ; Create Shortcuts (Silent execution via run-silent.vbs)
  CreateDirectory "$SMPROGRAMS\TeamCodex"
  CreateShortcut "$SMPROGRAMS\TeamCodex\TeamCodex.lnk" "wscript.exe" '"$INSTDIR\windows\run-silent.vbs"' "$INSTDIR\windows\assets\TeamCodex.ico" 0
  CreateShortcut "$SMPROGRAMS\TeamCodex\卸载 TeamCodex.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0
  CreateShortcut "$DESKTOP\TeamCodex.lnk" "wscript.exe" '"$INSTDIR\windows\run-silent.vbs"' "$INSTDIR\windows\assets\TeamCodex.ico" 0
SectionEnd

; Uninstaller Section
Section "Uninstall"
  Delete "$DESKTOP\TeamCodex.lnk"
  RMDir /r "$SMPROGRAMS\TeamCodex"
  
  ; Remove Registry Keys
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex"
  DeleteRegKey HKCU "Software\TeamCodex"
  
  ; Remove Files and Installation Directory
  RMDir /r "$INSTDIR"
SectionEnd

Function LaunchTeamCodex
  ExecShell "" "wscript.exe" '"$INSTDIR\windows\run-silent.vbs"'
FunctionEnd
