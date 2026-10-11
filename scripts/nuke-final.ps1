$ErrorActionPreference = 'Continue'

# 1) Stop watchdog so it doesn't restart
Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cl -like '*deplox-watchdog.ps1*') { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
}
Disable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Start-Sleep -Seconds 2

# 2) Kill everything related. Top-down with taskkill /F /T on EVERY dev-related PID.
Write-Host '--- 2. collecting ALL dev-related PIDs ---'
$candidates = New-Object System.Collections.Generic.HashSet[int]
Get-CimInstance Win32_Process | Where-Object {
    $name = $_.Name
    $cl = $_.CommandLine
    if ($name -ne 'node.exe' -and $name -ne 'cmd.exe') { return $false }
    if (-not $cl) { return $false }
    return ($cl -like '*deplox*' -or $cl -like '*\.pnpm\tsx*' -or $cl -like '*\.pnpm\vite*' -or `
            $cl -like '*node_modules\.bin\tsx*' -or $cl -like '*node_modules\.bin\vite*' -or `
            $cl -like '*scripts\dev.mjs*' -or $cl -like '*preflight.cjs*')
} | ForEach-Object { $candidates.Add($_.ProcessId) | Out-Null }

# Also anyone LISTENING on 5173/8080
foreach ($port in @(5173, 8080)) {
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        ForEach-Object { $candidates.Add($_.OwningProcess) | Out-Null }
}

Write-Host ("  found {0} candidates" -f $candidates.Count)
foreach ($p in $candidates) { Write-Host ("    PID={0}" -f $p) }

# 3) Top-of-tree: for each candidate, walk UP to find the topmost ancestor
#    and then taskkill /F /T that. This kills the whole tree.
Write-Host ''
Write-Host '--- 3. finding topmost ancestors and killing whole trees ---'
$roots = New-Object System.Collections.Generic.HashSet[int]
foreach ($p in $candidates) {
    $cur = $p
    while ($true) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$cur" -ErrorAction SilentlyContinue
        if (-not $proc) { break }
        $parent = $proc.ParentProcessId
        if ($parent -le 1 -or $parent -eq $cur) { break }
        # don't walk above the launcher level
        $pcl = $proc.CommandLine
        if ($pcl -like '*deplox-watchdog.ps1*') { break }
        # if parent is also in our candidate set, walk up
        if ($candidates.Contains($parent) -or $roots.Contains($parent)) { $cur = $parent; continue }
        break
    }
    $roots.Add($cur) | Out-Null
}

# Also: kill the parent of dev.mjs (the node node scripts\dev.mjs launcher)
foreach ($p in $candidates) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
    if ($proc -and $proc.CommandLine -like '*scripts\dev.mjs*') {
        # also kill the node node scripts\dev.mjs launcher
        $rcl = $proc.CommandLine
        Write-Host ("  dev.mjs child PID={0} cmd={1}" -f $p, $rcl.Substring(0, [Math]::Min(120, $rcl.Length)))
    }
}

Write-Host ("  topmost roots to kill: {0}" -f $roots.Count)
foreach ($r in $roots) { Write-Host ("    ROOT PID={0}" -f $r) }

foreach ($r in $roots) {
    Write-Host ("  taskkill /F /T /PID $r")
    $out = cmd.exe /c "taskkill /F /T /PID $r" 2>&1
    Write-Host ("    -> $out" -f $out)
}

Start-Sleep -Seconds 4

# 4) Now verify ports free
Write-Host ''
Write-Host '--- 4. ports after kill ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { Write-Host ("  port {0} STILL owned by PID={1}" -f $port, $conn.OwningProcess) }
    else { Write-Host ("  port {0} FREE" -f $port) }
}

# 5) If still occupied, brute force: kill by direct Stop-Process -Force on port owner + parent walk
Write-Host ''
Write-Host '--- 5. brute-force port owner kill ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) { continue }
    $cur = $conn.OwningProcess
    $chain = @()
    while ($cur -gt 0) {
        $chain += $cur
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$cur" -ErrorAction SilentlyContinue
        if (-not $p) { break }
        $parent = $p.ParentProcessId
        if ($parent -le 1 -or $chain -contains $parent) { break }
        $cur = $parent
    }
    Write-Host ("  port {0} ancestor chain: {1}" -f $port, ($chain -join ' -> '))
    foreach ($c in $chain) {
        $ok = Stop-Process -Id $c -Force -PassThru -ErrorAction SilentlyContinue
        if ($ok) { Write-Host ("    Stop-Process PID={0} OK" -f $c) } else { Write-Host ("    Stop-Process PID={0} failed" -f $c) }
    }
}

Start-Sleep -Seconds 3

Write-Host ''
Write-Host '--- 6. ports after brute ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { Write-Host ("  port {0} STILL owned by PID={1}" -f $port, $conn.OwningProcess) }
    else { Write-Host ("  port {0} FREE" -f $port) }
}

# 7) Now start fresh dev.mjs
Write-Host ''
Write-Host '--- 7. starting fresh dev.mjs ---'
$logDir = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\services'
$devScript = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\scripts\dev.mjs'
Start-Process `
  -FilePath 'C:\nvm4w\nodejs\node.exe' `
  -ArgumentList "`"$devScript`"" `
  -WorkingDirectory 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox' `
  -WindowStyle Hidden `
  -RedirectStandardOutput "$logDir\pnpm-dev.out.log" `
  -RedirectStandardError "$logDir\pnpm-dev.err.log"
Add-Content -Path "$logDir\pnpm-dev.start.log" -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] fresh dev.mjs (final-nuke)") -Encoding UTF8

Write-Host 'Waiting 15s for ports...'
Start-Sleep -Seconds 15

Write-Host ''
Write-Host '--- 8. ports now ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
        $cmd = if ($proc -and $proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min(140, $proc.CommandLine.Length)) } else { '<no-cmdline>' }
        Write-Host ("  port {0} LISTENING PID={1} cmd={2}" -f $port, $conn.OwningProcess, $cmd)
    } else {
        Write-Host ("  port {0} NOT listening" -f $port)
    }
}

Write-Host ''
Write-Host '--- 9. visible windows ---'
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object Id, ProcessName, MainWindowTitle |
    Format-Table -AutoSize | Out-String | Write-Host

# 10) re-enable watchdog
Write-Host ''
Write-Host '--- 10. re-enable watchdog-ensure ---'
Enable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Write-Host 'Done.'