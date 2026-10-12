$ErrorActionPreference = 'Continue'
foreach ($p in @(5173, 8080, 8000, 2019)) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
        $cmd = if ($proc -and $proc.CommandLine) { $proc.CommandLine } else { '<no-cmdline>' }
        Write-Host ("port {0} LISTENING PID={1} cmd={2}" -f $p, $c.OwningProcess, $cmd.Substring(0, [Math]::Min(160, $cmd.Length)))
    } else {
        Write-Host ("port {0} free" -f $p)
    }
}
Write-Host ''
Write-Host '--- cloudflared log tail ---'
$log = 'C:\Users\naiti\.cloudflared\\cloudflared.log'
if (Test-Path $log) { Get-Content $log -Tail 15 }
Write-Host ''
Write-Host '--- Caddy recent logs ---'
docker logs infra-caddy-1 --tail 15 2>&1 | Select-Object -First 15 | Out-String