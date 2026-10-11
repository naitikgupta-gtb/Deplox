$ErrorActionPreference = 'Continue'

# Check if my PowerShell is elevated
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$prin = New-Object Security.Principal.WindowsPrincipal($id)
Write-Host ("Current user: {0}" -f $id.Name)
Write-Host ("IsAdmin: {0}" -f $prin.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator))
Write-Host ("Token elevation type: {0}" -f $id.TokenElevationType)

# Check if MiniMax Code's terminal (which is what I am running inside) is elevated
$parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
$pproc = Get-CimInstance Win32_Process -Filter "ProcessId=$parent" -ErrorAction SilentlyContinue
if ($pproc) {
    Write-Host ("Parent: PID={0} name={1}" -f $parent, $pproc.Name)
}

# Check if I can see TOKEN elevation type of protected process 22268
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class T {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool OpenProcessToken(IntPtr h, uint access, out IntPtr token);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool CloseHandle(IntPtr h);
  public const uint PROCESS_QUERY_INFORMATION = 0x0400;
  public const uint TOKEN_QUERY = 0x0008;
}
"@

foreach ($p in @(22268, 22660)) {
    $h = [T]::OpenProcess([T]::PROCESS_QUERY_INFORMATION, $false, $p)
    if ($h -eq [IntPtr]::Zero) {
        $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Host ("PID={0} OpenProcess err={1} ({2})" -f $p, $err, (New-Object System.ComponentModel.Win32Exception($err)).Message)
    } else {
        [T]::CloseHandle($h) | Out-Null
        Write-Host ("PID={0} OpenProcess OK with QUERY_INFORMATION" -f $p)
    }
}