$ErrorActionPreference = 'Continue'
foreach ($port in @(5173, 8080)) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $c) { Write-Host ("port {0} free" -f $port); continue }
    $pid_ = $c.OwningProcess
    $p = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
    $name = if ($p) { $p.ProcessName } else { '?' }
    $cmd = ''
    if ($p) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$pid_" -ErrorAction SilentlyContinue
        if ($proc -and $proc.CommandLine) { $cmd = $proc.CommandLine }
    }
    if (-not $cmd) {
        $cmd = '<no-cmdline>'
    } else {
        $cmd = $cmd.Substring(0, [Math]::Min(180, $cmd.Length))
    }
    Write-Host ("port {0} PID={1} name={2} cmd={3}" -f $port, $pid_, $name, $cmd)
}
Write-Host ''
Write-Host '--- dev.mjs-related node processes ---'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*deplox*' -or $_.CommandLine -like '*\.pnpm\tsx*' -or $_.CommandLine -like '*\.pnpm\vite*' -or $_.CommandLine -like '*scripts\dev.mjs*' } | Select-Object ProcessId, ParentProcessId, @{N='Cmd';E={ if ($_.CommandLine) { $_.CommandLine.Substring(0, [Math]::Min(180, $_.CommandLine.Length)) } else { '<empty>' } }} | Format-Table -AutoSize -Wrap | Out-String | Write-Host
Write-Host ''
Write-Host '--- any cmd.exe with deplox in commandline ---'
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*deplox*' -or $_.CommandLine -like '*\.bin\tsx*' -or $_.CommandLine -like '*\.bin\vite*' } | Select-Object ProcessId, ParentProcessId, @{N='Cmd';E={ if ($_.CommandLine) { $_.CommandLine.Substring(0, [Math]::Min(180, $_.CommandLine.Length)) } else { '<empty>' } }} | Format-Table -AutoSize -Wrap | Out-String | Write-Host