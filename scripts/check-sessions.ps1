$ErrorActionErrorAction = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'

# Check our session vs the protected processes' session
Write-Host '--- our session ---'
Write-Host ("my session = {0}, user = {1}\{2}" -f `
    (Get-Process -Id $PID).SessionId, `
    $env:USERDOMAIN, $env:USERNAME)

# Use WMI to inspect process session and owner
Write-Host ''
Write-Host '--- protected procs ---'
foreach ($p in @(22224, 22268, 22660, 8864, 21464, 21460, 4284)) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
    if (-not $proc) { Write-Host ("PID={0,6} GONE" -f $p); continue }
    $owner = '?'
    try { $owner = '{0}\{1}' -f $proc.GetOwner().Domain, $proc.GetOwner().User } catch { $owner = '<unreadable>' }
    Write-Host ("PID={0,6} session={1,3} name={2,-10} owner={3}" -f $p, $proc.SessionId, $proc.Name, $owner)
}

Write-Host ''
Write-Host '--- is PID 22224 our watchdog? ---'
$wd = Get-CimInstance Win32_Process -Filter "ProcessId=22224" -ErrorAction SilentlyContinue
if ($wd) {
    Write-Host ("cmd: {0}" -f $wd.CommandLine.Substring(0, [Math]::Min(200, $wd.CommandLine.Length)))
}