$ErrorActionPreference = 'Continue'

# Are the ports actually listening?
Write-Host '--- ports ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { Write-Host ("port {0} LISTENING PID={1}" -f $port, $conn.OwningProcess) }
    else { Write-Host ("port {0} NOT listening" -f $port) }
}

# Try to reach 5173/8080 from PowerShell directly
Write-Host ''
Write-Host '--- 5173 direct test ---'
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 5
    Write-Host ("5173 status={0}, length={1}" -f $r.StatusCode, $r.RawContentLength)
} catch {
    Write-Host ("5173 ERROR: {0}" -f $_.Exception.Message)
}

Write-Host ''
Write-Host '--- 8080/health direct test ---'
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/health' -UseBasicParsing -TimeoutSec 5
    Write-Host ("8080/health status={0}, content={1}" -f $r.StatusCode, $r.Content)
} catch {
    Write-Host ("8080/health ERROR: {0}" -f $_.Exception.Message)
}

# Look at API log
Write-Host ''
Write-Host '--- API log tail (last 15 lines) ---'
$apiLog = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\api.log'
if (Test-Path $apiLog) {
    Get-Content $apiLog -Tail 15 | ForEach-Object { Write-Host $_ }
} else {
    Write-Host '(no api.log)'
}

Write-Host ''
Write-Host '--- pnpm-dev.out.log tail ---'
$log = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\services\pnpm-dev.out.log'
if (Test-Path $log) {
    Get-Content $log -Tail 10 | ForEach-Object { Write-Host $_ }
}