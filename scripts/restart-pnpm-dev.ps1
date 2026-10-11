$ErrorActionPreference = 'Continue'

# Kill the current pnpm dev (the old one with .cmd shims flashing windows)
Write-Host '--- killing current pnpm dev ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host ("  killing PID={0} ({1}) holding port {2}" -f $p.Id, $p.ProcessName, $port)
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
# Also kill any node.exe children of dev.mjs and the launcher itself
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*scripts\dev.mjs*' -or $_.CommandLine -like '*\.bin\tsx*' -or $_.CommandLine -like '*\.bin\vite*' } |
    ForEach-Object {
        Write-Host ("  killing node.exe PID={0}" -f $_.ProcessId)
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" |
    Where-Object { $_.CommandLine -like '*\.bin\tsx*' -or $_.CommandLine -like '*\.bin\vite*' } |
    ForEach-Object {
        Write-Host ("  killing cmd.exe PID={0}" -f $_.ProcessId)
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 2

# Verify ports are free
foreach ($port in @(5173, 8080)) {
    $still = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($still) { Write-Host ("  WARNING: port {0} still in use" -f $port) }
}

# Start the new dev.mjs in background, fully hidden
$logDir = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\services'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

Write-Host '--- starting new dev.mjs ---'
$devScript = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\scripts\dev.mjs'
Start-Process `
  -FilePath 'C:\nvm4w\nodejs\node.exe' `
  -ArgumentList "`"$devScript`"" `
  -WorkingDirectory 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox' `
  -WindowStyle Hidden `
  -RedirectStandardOutput "$logDir\pnpm-dev.out.log" `
  -RedirectStandardError "$logDir\pnpm-dev.err.log"

Add-Content -Path "$logDir\pnpm-dev.start.log" -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] pnpm dev launched via direct-node dev.mjs") -Encoding UTF8
Write-Host 'Started. Waiting 10s for ports to come up...'
Start-Sleep -Seconds 10

foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host ("  port {0} LISTENING (PID {1})" -f $port, $conn.OwningProcess)
    } else {
        Write-Host ("  port {0} NOT listening" -f $port)
    }
}

Write-Host ''
Write-Host '--- visible windows after restart ---'
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object Id, ProcessName, MainWindowTitle |
    Format-Table -AutoSize | Out-String | Write-Host

Write-Host '--- all cmd.exe and node.exe with their commandlines ---'
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe' or Name = 'node.exe'" |
    Select-Object ProcessId, Name, @{Name='Cmd';Expression={ $_.CommandLine.Substring(0, [Math]::Min(140, $_.CommandLine.Length)) }} |
    Format-Table -AutoSize | Out-String | Write-Host