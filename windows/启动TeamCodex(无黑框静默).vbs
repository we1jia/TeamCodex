Set ws = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = currentDir & "\run-teamcodex.ps1"
If Not fso.FileExists(psScript) Then
  If fso.FileExists(currentDir & "\windows\run-teamcodex.ps1") Then
    psScript = currentDir & "\windows\run-teamcodex.ps1"
  End If
End If
cmdLine = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """"
ws.Run cmdLine, 0, False

