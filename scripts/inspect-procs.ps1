$ErrorActionPreference = 'Continue'

# Check if 21464, 23384 (cmd.exe parents) are alive
foreach ($p in @(8864, 21464, 23384, 17940, 20672, 20680, 22268, 22660, 21628)) {
    $exists = Get-Process -Id $p -ErrorAction SilentlyContinue
    if ($exists) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
        $ppid = if ($proc) { $proc.ParentProcessId } else { 0 }
        $name = if ($proc) { $proc.Name } else { '?' }
        Write-Host ("  PID={0,6} ALIVE name={1} ppid={2}" -f $p, $name, $ppid)
    } else {
        Write-Host ("  PID={0,6} GONE" -f $p)
    }
}