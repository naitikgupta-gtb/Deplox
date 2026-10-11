$ErrorActionPreference = 'Continue'

# Step 1: Stop the watchdog entirely so it doesn't keep respawning pnpm dev
Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cl -like '*deplox-watchdog.ps1*') {
        Write-Host ("  stopping watchdog PID={0}" -f $_.Id)
        Stop-Process -Id $_.Id -Force
    }
}
# Also disable the watchdog-ensure task for now so it doesn't re-spawn
Disable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Write-Host 'Watchdog stopped + ensure task disabled.'

Start-Sleep -Seconds 2

# Step 2: Kill ALL dev-related processes. Be brutal.
Write-Host ''
Write-Host '--- killing dev-related processes ---'
$patterns = @(
    'scripts\dev.mjs',
    'node_modules\.bin\tsx',
    'node_modules\.bin\vite',
    '\.pnpm\tsx@',
    '\.pnpm\vite@'
)
$victims = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' or Name = 'cmd.exe'"
foreach ($p in $victims) {
    foreach ($pat in $patterns) {
        if ($p.CommandLine -like "*$pat*") {
            Write-Host ("  killing PID={0} name={1}" -f $p.ProcessId, $p.Name)
            try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
            break
        }
    }
}

# Also kill any node holding ports 5173/8080
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $pname = (Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Write-Host ("  killing PID={0} ({1}) holding port {2}" -f $conn.OwningProcess, $pname, $port)
        try { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
    }
}

Start-Sleep -Seconds 3

# Step 3: Verify ports free
Write-Host ''
Write-Host '--- ports after cleanup ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { Write-Host ("  port {0} STILL in use (PID {1})" -f $port, $conn.OwningProcess) }
    else { Write-Host ("  port {0} free" -f $port) }
}

Write-Host ''
Write-Host '--- remaining node/cmd processes ---'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe' or Name = 'cmd.exe'" |
    Where-Object { $_.CommandLine -like '*deplox*' -or $_.CommandLine -like '*tsx*' -or $_.CommandLine -like '*vite*' } |
    Select-Object ProcessId, Name, @{N='Cmd';E={$_.CommandLine.Substring(0, [Math]::Min(120, $_.CommandLine.Length))}} |
    Format-Table -AutoSize -Wrap | Out-String | Write-Host

# Step 4: Start new dev.mjs
Write-Host ''
Write-Host '--- starting fresh dev.mjs ---'
$logDir = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\services'
$devScript = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\scripts\dev.mjs'
Start-Process `
  -FilePath 'C:\nvm4w\nodejs\node.exe' `
  -ArgumentList "`"$devScript`"" `
  -WorkingDirectory 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox' `
  -WindowStyle Hidden `
  -RedirectStandardOutput "$logDir\pnpm-dev.out.log" `
  -RedirectStandardError "$logDir\pnpm-dev.err.log"

Add-Content -Path "$logDir\pnpm-dev.start.log" -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] pnpm dev launched via direct-node dev.mjs (clean)") -Encoding UTF8

Write-Host 'Waiting 12s for ports...'
Start-Sleep -Seconds 12

foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $pname = (Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Write-Host ("  port {0} LISTENING (PID {1}, {2})" -f $port, $conn.OwningProcess, $pname)
    } else {
        Write-Host ("  port {0} NOT listening" -f $port)
    }
}

Write-Host ''
Write-Host '--- visible windows ---'
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object Id, ProcessName, MainWindowTitle |
    Format-Table -AutoSize | Out-String | Write-Host

Write-Host ''
Write-Host '--- re-enabling watchdog-ensure task ---'
Enable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Write-Host 'Done.'