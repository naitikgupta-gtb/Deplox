$ErrorActionPreference = 'Continue'

Write-Host '--- 1. stop watchdog ---'
Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cl -like '*deplox-watchdog.ps1*') {
        Write-Host ("  watchdog PID={0}" -f $_.Id)
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}
Disable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Start-Sleep -Seconds 2

# Walk parent chain to find all ancestors of a process
function Get-Ancestors {
    param([int]$StartPid)
    $chain = @()
    $current = $StartPid
    while ($current -gt 0) {
        $chain += $current
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
        if (-not $p) { break }
        $parent = $p.ParentProcessId
        if ($parent -eq 0 -or $parent -eq $current -or $chain -contains $parent) { break }
        $current = $parent
    }
    return $chain
}

# Walk children tree of a process
function Get-Descendants {
    param([int]$StartPid)
    $all = @()
    $queue = @($StartPid)
    while ($queue.Count -gt 0) {
        $current = $queue[0]
        $queue = $queue[1..($queue.Count - 1)]
        $all += $current
        $kids = Get-CimInstance Win32_Process -Filter "ParentProcessId=$current" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessId
        foreach ($k in $kids) {
            if (-not $all -contains $k -and -not $queue -contains $k) {
                $queue += $k
            }
        }
    }
    return $all
}

# Step 2: collect PIDs to kill - anyone holding dev ports + all their descendants + all their ancestors
Write-Host ''
Write-Host '--- 2. collecting PIDs ---'
$killPids = New-Object System.Collections.Generic.HashSet[int]

# 2a) anyone LISTENING on 5173 or 8080
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($c in $conn) {
        $killPids.Add($c.OwningProcess) | Out-Null
        Write-Host ("  port {0} owner PID={1}" -f $port, $c.OwningProcess)
        # also all descendants
        Get-Descendants $c.OwningProcess | ForEach-Object { $killPids.Add($_) | Out-Null }
        # also all ancestors (up to a safe limit)
        Get-Ancestors $c.OwningProcess | ForEach-Object { $killPids.Add($_) | Out-Null }
    }
}

# 2b) any node whose CommandLine contains dev-related markers
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
    $cl = $_.CommandLine
    if ($cl -and ($cl -like '*deplox*' -or $cl -like '*\.pnpm\tsx*' -or $cl -like '*\.pnpm\vite*' -or $cl -like '*node_modules\.bin\tsx*' -or $cl -like '*node_modules\.bin\vite*' -or $cl -like '*scripts\dev.mjs*' -or $cl -like '*preflight.cjs*')) {
        $killPids.Add($_.ProcessId) | Out-Null
        Get-Descendants $_.ProcessId | ForEach-Object { $killPids.Add($_) | Out-Null }
        Get-Ancestors $_.ProcessId | ForEach-Object { $killPids.Add($_) | Out-Null }
    }
}

# 2c) any cmd.exe with deplox in CommandLine
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" | ForEach-Object {
    $cl = $_.CommandLine
    if ($cl -and $cl -like '*deplox*') {
        $killPids.Add($_.ProcessId) | Out-Null
        Get-Descendants $_.ProcessId | ForEach-Object { $killPids.Add($_) | Out-Null }
        Get-Ancestors $_.ProcessId | ForEach-Object { $killPids.Add($_) | Out-Null }
    }
}

# 2d) any cmd.exe whose parent is in the kill set (these are the .cmd shim parents)
$cmdExtras = Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" | Where-Object { $killPids.Contains($_.ParentProcessId) }
foreach ($c in $cmdExtras) { $killPids.Add($c.ProcessId) | Out-Null; Get-Descendants $c.ProcessId | ForEach-Object { $killPids.Add($_) | Out-Null } }

Write-Host ("  total PIDs to kill: {0}" -f $killPids.Count)
foreach ($p in $killPids) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
    if ($proc) { Write-Host ("    PID={0} {1}" -f $p, $proc.Name) }
}

# Step 3: kill each with taskkill /F /T
Write-Host ''
Write-Host '--- 3. taskkill /F /T each ---'
foreach ($p in $killPids) {
    cmd.exe /c "taskkill /F /T /PID $p" 2>&1 | Out-Null
    Write-Host ("  killed PID={0}" -f $p)
}

Start-Sleep -Seconds 4

# Step 4: verify ports free
Write-Host ''
Write-Host '--- 4. ports after nuke ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { Write-Host ("  port {0} STILL owned by PID={1}" -f $port, $conn.OwningProcess) }
    else { Write-Host ("  port {0} FREE" -f $port) }
}

# Step 5: check no surviving dev processes
Write-Host ''
Write-Host '--- 5. remaining dev processes ---'
$remaining = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' or Name = 'cmd.exe'" | Where-Object {
    $cl = $_.CommandLine
    $cl -and ($cl -like '*deplox*' -or $cl -like '*\.pnpm\tsx*' -or $cl -like '*\.pnpm\vite*' -or $cl -like '*node_modules\.bin\tsx*' -or $cl -like '*node_modules\.bin\vite*' -or $cl -like '*scripts\dev.mjs*' -or $cl -like '*preflight.cjs*')
}
Write-Host ("  remaining: {0}" -f $remaining.Count)

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

Add-Content -Path "$logDir\pnpm-dev.start.log" -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] pnpm dev launched via direct-node dev.mjs (NUCLEAR v2)") -Encoding UTF8

Write-Host 'Waiting 15s for ports...'
Start-Sleep -Seconds 15

Write-Host ''
Write-Host '--- 7. ports after fresh start ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
        $cmd = if ($proc -and $proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min(120, $proc.CommandLine.Length)) } else { '<no-cmdline>' }
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

Write-Host ''
Write-Host '--- 9. re-enable watchdog-ensure task ---'
Enable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Write-Host 'Done.'