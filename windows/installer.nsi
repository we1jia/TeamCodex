; --------------------------------------------------
; TeamCodex Windows Installer (NSIS Script)
; --------------------------------------------------

!include "MUI2.nsh"
!include "FileFunc.nsh"

; General Configuration
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
!define MUI_FINISHPAGE_RUN "$INSTDIR\windows\run-silent.vbs"
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
  
  ; Write Core Files
  File /r "..\server"
  File /r "..\inject"
  File /r "..\ui"
  File /r "..\windows"
  File /r "..\data"
  File "..\README.md"
  
  ; Store Installation Folder
  WriteRegStr HKCU "Software\TeamCodex" "Install_Dir" "$INSTDIR"
  
  ; Create Uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  ; Register in Windows Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "DisplayName" "TeamCodex"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "DisplayIcon" "$INSTDIR\windows\assets\TeamCodex.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TeamCodex" "DisplayVersion" "1.0.0"
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
