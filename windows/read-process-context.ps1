param([Parameter(Mandatory=$true)][int]$TargetPid)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  if ([IntPtr]::Size -ne 8) { throw '64-bit runtime required' }
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class TeamProcessContext {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr process, out bool wow64);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, int size, out IntPtr read);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int type, IntPtr[] info, int size, out int returned);
  static byte[] Read(IntPtr process, long address, int length) {
    var bytes = new byte[length]; IntPtr count;
    if (!ReadProcessMemory(process, new IntPtr(address), bytes, length, out count) || count.ToInt64() != length) throw new Exception("Read failed");
    return bytes;
  }
  public static Dictionary<string, object> Capture(int pid) {
    var handle = OpenProcess(0x410, false, pid);
    if (handle == IntPtr.Zero) throw new Exception("Access denied");
    try {
      bool wow64;
      if (!IsWow64Process(handle, out wow64) || wow64) throw new Exception("Unsupported process architecture");
      var info = new IntPtr[6]; int returned;
      if (NtQueryInformationProcess(handle, 0, info, 48, out returned) != 0) throw new Exception("Query failed");
      var parameters = BitConverter.ToInt64(Read(handle, info[1].ToInt64() + 0x20, 8), 0);
      var directoryLength = BitConverter.ToUInt16(Read(handle, parameters + 0x38, 2), 0);
      var directoryBuffer = BitConverter.ToInt64(Read(handle, parameters + 0x40, 8), 0);
      if (directoryLength == 0 || directoryLength > 32766) throw new Exception("Invalid working directory");
      var directory = Encoding.Unicode.GetString(Read(handle, directoryBuffer, directoryLength));
      var environmentPointer = BitConverter.ToInt64(Read(handle, parameters + 0x80, 8), 0);
      var characters = new List<byte>(); bool complete = false;
      for (int offset = 0; offset < 1048576 && !complete; offset += 2) {
        var character = Read(handle, environmentPointer + offset, 2);
        characters.AddRange(character);
        int n = characters.Count;
        complete = n >= 4 && characters[n-1] == 0 && characters[n-2] == 0 && characters[n-3] == 0 && characters[n-4] == 0;
      }
      if (!complete) throw new Exception("Incomplete environment");
      var environment = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
      foreach (var entry in Encoding.Unicode.GetString(characters.ToArray()).Split('\0')) {
        int separator = entry.IndexOf('=');
        if (separator > 0) environment[entry.Substring(0, separator)] = entry.Substring(separator + 1);
      }
      return new Dictionary<string, object> { {"env", environment}, {"cwd", directory} };
    } finally { CloseHandle(handle); }
  }
}
'@
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$TargetPid"
  if (-not $processInfo.ExecutablePath) { throw 'Process missing' }
  $result = [TeamProcessContext]::Capture($TargetPid)
  $result['path'] = $processInfo.ExecutablePath
  $result | ConvertTo-Json -Depth 4 -Compress
} catch {
  # Do not print process memory, arguments, environment or raw native exceptions.
  [Console]::Error.WriteLine('Unable to read process launch context')
  exit 2
}
