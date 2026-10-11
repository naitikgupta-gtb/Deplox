Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*scripts*dev.mjs*' } | Select-Object ProcessId, CreationDate, @{N='Cmd';E={$_.CommandLine}} | Format-Table -AutoSize -Wrap | Out-String | Write-Host
Write-Host '---'
Write-Host 'ports:'
foreach ($port in @(5173, 5174, 5175, 5176, 8080)) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) {
        $pp = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
        $cmd = if ($pp -and $pp.CommandLine) { $pp.CommandLine } else { '<no-cmdline>' }
        Write-Host ("  port {0} PID={1} cmd={2}" -f $port, $c.OwningProcess, $cmd.Substring(0, [Math]::Min(160, $cmd.Length)))
    } else { Write-Host ("  port {0} free" -f $port) }
}