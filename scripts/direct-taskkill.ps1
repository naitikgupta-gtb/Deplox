$ErrorActionPreference = 'Continue'

# Direct taskkill (not via cmd.exe /c)
Write-Host '--- direct taskkill attempts ---'
foreach ($p in @(22268, 22660, 21464, 23384, 8864)) {
    Write-Host ("  taskkill /F /T /PID $p")
    $out = & taskkill.exe /F /T /PID $p 2>&1
    Write-Host ("    -> $out")
}

Start-Sleep -Seconds 2

Write-Host ''
Write-Host '--- ports after direct taskkill ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { Write-Host ("  port {0} STILL owned by PID={1}" -f $port, $conn.OwningProcess) }
    else { Write-Host ("  port {0} FREE" -f $port) }
}