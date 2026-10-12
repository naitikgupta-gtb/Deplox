<#
.SYNOPSIS
  Show status of the NSSM-managed DEPLOX services.
  No admin required.
#>

$Services = @('DeploxDev','DeploxWatchdog')

Write-Host "==== services ===="
foreach ($s in $Services) {
    $svc = Get-Service -Name $s -ErrorAction SilentlyContinue
    if ($svc) {
        $procId = (Get-WmiObject Win32_Service -Filter "Name='$s'" -ErrorAction SilentlyContinue).ProcessId
        $pidStr = if ($procId -and $procId -gt 0) { "PID=$procId" } else { "no pid" }
        Write-Host ("  {0,-18} {1,-10} {2,-12} {3}" -f $svc.Name, $svc.Status, $svc.StartType, $pidStr)
    } else {
        Write-Host "  $s : NOT INSTALLED"
    }
}

Write-Host ""
Write-Host "==== ports (5173 = Vite, 8080 = API) ===="
foreach ($port in 5173, 8080) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        Write-Host ("  :{0,-6} LISTEN  pid={1,-6} {2}" -f $port, $conn.OwningProcess, $p.ProcessName)
    } else {
        Write-Host "  :$port : NOT LISTENING"
    }
}

Write-Host ""
Write-Host "==== cloudflared tunnel ===="
$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($cf) {
    Write-Host "  cloudflared.exe PID=$($cf.Id) Started=$($cf.StartTime)"
} else {
    Write-Host "  cloudflared : NOT RUNNING"
}

Write-Host ""
Write-Host "==== quick public URL test ===="
$urls = @(
    'https://deplox.site/'
    'https://event-checkin-ec.deplox.site/'
)
foreach ($u in $urls) {
    try {
        $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10 -Method Head
        Write-Host ("  {0,-50} {1}" -f $u, $r.StatusCode)
    } catch {
        Write-Host ("  {0,-50} {1}" -f $u, $_.Exception.Message.Split([Environment]::NewLine)[0])
    }
}

Write-Host ""
Write-Host "==== recent watchdog log ===="
$log = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\watchdog.log'
if (Test-Path $log) {
    Get-Content $log -Tail 8 | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host "  no watchdog.log yet"
}
