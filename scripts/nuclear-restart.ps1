$ErrorActionPreference = 'Continue'

# NUCLEAR: kill ALL processes related to dev.mjs and their children, recursively
# Step 1: stop watchdog so it doesn't respawn during the gap
Write-Host '--- 1. stopping watchdog ---'
Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cl -like '*deplox-watchdog.ps1*') {
        Write-Host ("  watchdog PID={0}" -f $_.Id)
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}
Disable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Start-Sleep -Seconds 2

# Step 2: find ALL dev-related PIDs (including old cmd.exe parents and new dev.mjs)
Write-Host ''
Write-Host '--- 2. collecting dev-related PIDs ---'
$pids = New-Object System.Collections.Generic.HashSet[int]
Get-CimInstance Win32_Process -Filter "Name = 'node.exe' or Name = 'cmd.exe'" | ForEach-Object {
    $cl = $_.CommandLine
    if ($cl -like '*deplox*' -or $cl -like '*\.pnpm\tsx*' -or $cl -like '*\.pnpm\vite*' -or $cl -like '*node_modules\.bin\tsx*' -or $cl -like '*node_modules\.bin\vite*' -or $cl -like '*scripts\dev.mjs*' -or $cl -like '*preflight.cjs*') {
        $null = $pids.Add($_.ProcessId)
    }
}
Write-Host ("  found {0} PIDs" -f $pids.Count)
foreach ($p in $pids) {
    Write-Host ("    PID={0}" -f $p)
}

# Step 3: taskkill each with /F /T (kills process + all descendants)
Write-Host ''
Write-Host '--- 3. taskkill /F /T each ---'
foreach ($p in $pids) {
    Write-Host ("  killing PID={0}" -f $p)
    cmd.exe /c "taskkill /F /T /PID $p" 2>&1 | Out-String | Write-Host
}

Start-Sleep -Seconds 4

# Step 4: verify ports are free
Write-Host ''
Write-Host '--- 4. ports after nuke ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { Write-Host ("  port {0} STILL owned by PID={1}" -f $port, $conn.OwningProcess) }
    else { Write-Host ("  port {0} FREE" -f $port) }
}

# Step 5: verify no remaining dev processes
Write-Host ''
Write-Host '--- 5. remaining dev processes ---'
$remaining = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' or Name = 'cmd.exe'" | Where-Object {
    $cl = $_.CommandLine
    $cl -like '*deplox*' -or $cl -like '*\.pnpm\tsx*' -or $cl -like '*\.pnpm\vite*' -or $cl -like '*node_modules\.bin\tsx*' -or $cl -like '*node_modules\.bin\vite*' -or $cl -like '*scripts\dev.mjs*' -or $cl -like '*preflight.cjs*'
}
Write-Host ("  remaining: {0}" -f $remaining.Count)
$remaining | ForEach-Object { Write-Host ("    PID={0} name={1}" -f $_.ProcessId, $_.Name) }

# Step 6: start fresh dev.mjs
Write-Host ''
Write-Host '--- 6. starting fresh dev.mjs ---'
$logDir = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\services'
$devScript = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\scripts\dev.mjs'
Start-Process `
  -FilePath 'C:\nvm4w\nodejs\node.exe' `
  -ArgumentList "`"$devScript`"" `
  -WorkingDirectory 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox' `
  -WindowStyle Hidden `
  -RedirectStandardOutput "$logDir\pnpm-dev.out.log" `
  -RedirectStandardError "$logDir\pnpm-dev.err.log"

Add-Content -Path "$logDir\pnpm-dev.start.log" -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] pnpm dev launched via direct-node dev.mjs (NUCLEAR clean)") -Encoding UTF8

Write-Host 'Waiting 12s for ports...'
Start-Sleep -Seconds 12

Write-Host ''
Write-Host '--- 7. ports after fresh start ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
        $cmd = if ($p) { $p.CommandLine.Substring(0, [Math]::Min(120, $p.CommandLine.Length)) } else { '<unknown>' }
        Write-Host ("  port {0} LISTENING PID={1} cmd={2}" -f $port, $conn.OwningProcess, $cmd)
    } else {
        Write-Host ("  port {0} NOT listening" -f $port)
    }
}

Write-Host ''
Write-Host '--- 8. visible windows ---'
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object Id, ProcessName, MainWindowTitle |
    Format-Table -AutoSize | Out-String | Write-Host

# Step 9: re-enable watchdog
Write-Host ''
Write-Host '--- 9. re-enabling watchdog-ensure task ---'
Enable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Write-Host 'Done.'