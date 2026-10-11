$ErrorActionPreference = 'Continue'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class N {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcessToken(IntPtr h, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool GetTokenInformation(IntPtr h, int infoClass, IntPtr buf, uint bufLen, out uint retLen);
  public const uint PROCESS_TERMINATE = 0x0001;
  public const uint PROCESS_QUERY_INFORMATION = 0x0400;
  public const uint TOKEN_QUERY = 0x0008;
}
"@

function Win32-Kill {
    param([int]$ProcId)
    $h = [N]::OpenProcess([N]::PROCESS_TERMINATE -bor [N]::PROCESS_QUERY_INFORMATION, $false, $ProcId)
    if ($h -eq [IntPtr]::Zero) {
        $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Host ("  PID={0} OpenProcess failed err={1}" -f $ProcId, $err)
        return $false
    }
    $ok = [N]::TerminateProcess($h, 0)
    $err = if (-not $ok) { [System.Runtime.InteropServices.Marshal]::GetLastWin32Error() } else { 0 }
    [N]::CloseHandle($h) | Out-Null
    if ($ok) { Write-Host ("  PID={0} TerminateProcess OK" -f $ProcId) }
    else { Write-Host ("  PID={0} TerminateProcess failed err={1}" -f $ProcId, $err) }
    return $ok
}

# Collect PIDs
$pids = @()
foreach ($p in @(22268, 22660, 21464, 21460, 23384, 22892, 8864)) {
    if (Get-Process -Id $p -ErrorAction SilentlyContinue) { $pids += $p }
}

Write-Host ("Killing {0} PIDs via WinAPI TerminateProcess" -f $pids.Count)
foreach ($p in $pids) {
    Win32-Kill $p
}

Start-Sleep -Seconds 3

Write-Host ''
Write-Host '--- ports after WinAPI kill ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { Write-Host ("  port {0} STILL owned by PID={1}" -f $port, $conn.OwningProcess) }
    else { Write-Host ("  port {0} FREE" -f $port) }
}