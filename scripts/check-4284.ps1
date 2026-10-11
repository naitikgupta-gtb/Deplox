$ErrorActionPreference = 'Continue'

# Inspect 4284 and its parents
foreach ($p in @(4284, 8864, 21464, 23384, 22268, 22660)) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
    if (-not $proc) { Write-Host ("PID={0,6} GONE" -f $p); continue }
    Write-Host ("PID={0,6} name={1,-10} ppid={2,6} session={3} user={4}" -f $p, $proc.Name, $proc.ParentProcessId, $proc.SessionId, $proc.GetOwner().User)
    $cl = $proc.CommandLine
    if ($cl) { Write-Host ("           cmd={0}" -f $cl.Substring(0, [Math]::Min(160, $cl.Length))) }
}