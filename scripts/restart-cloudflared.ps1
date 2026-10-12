$ErrorActionPreference = 'Continue'

# 1) Kill existing cloudflared
Write-Host '--- 1. killing existing cloudflared ---'
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | ForEach-Object {
    Write-Host ("  killing PID={0} cmd={1}" -f $_.ProcessId, $_.CommandLine)
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

# 2) Start fresh cloudflared (hidden window)
Write-Host ''
Write-Host '--- 2. starting fresh cloudflared ---'
$cfExe = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$cfCfg = 'C:\Users\naiti\.cloudflared\config.yml'
$outLog = 'C:\Users\naiti\.cloudflared\cloudflared-restart.out.log'
$errLog = 'C:\Users\naiti\.cloudflared\cloudflared-restart.err.log'
if (Test-Path $outLog) { Remove-Item $outLog -Force }
if (Test-Path $errLog) { Remove-Item $errLog -Force }

Start-Process -FilePath $cfExe `
    -ArgumentList 'tunnel', '--config', $cfCfg, 'run', 'deplox-prod' `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog
Write-Host "  started cloudflared (hidden)"

# 3) Wait and verify
Write-Host ''
Write-Host '--- 3. waiting 8s for tunnel to connect ---'
Start-Sleep -Seconds 8

$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($cf) {
    Write-Host ("  cloudflared running: PID={0} Started={1:HH:mm:ss}" -f $cf.Id, $cf.StartTime)
} else {
    Write-Host '  ERROR: cloudflared is not running'
}

# 4) Show the new log
Write-Host ''
Write-Host '--- 4. cloudflared log tail ---'
if (Test-Path $errLog) {
    Write-Host '--- err.log ---'
    Get-Content $errLog | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
}
if (Test-Path $outLog) {
    Write-Host '--- out.log ---'
    Get-Content $outLog | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
}

# 5) Test deplox.site
Write-Host ''
Write-Host '--- 5. test public URLs ---'
$urls = @(
    'https://deplox.site/',
    'https://event-checkin-ec.deplox.site/',
    'https://glbitm-attendance-system-gas.deplox.site/'
)
foreach ($u in $urls) {
    $code = curl.exe -s -o /dev/null -w '%{http_code}' --max-time 15 $u
    Write-Host ("  $u -> $code")
}