$ErrorActionPreference = 'Continue'
foreach ($port in @(5173, 8080)) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
        $cmd = if ($p) { $p.CommandLine } else { '<no-proc>' }
        Write-Host ("port {0} PID={1} cmd={2}" -f $port, $c.OwningProcess, $cmd.Substring(0, [Math]::Min(180, $cmd.Length)))
    } else {
        Write-Host ("port {0} free" -f $port)
    }
}
Write-Host ''
Write-Host '--- visible windows ---'
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize | Out-String | Write-Host