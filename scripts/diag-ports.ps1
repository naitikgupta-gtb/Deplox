$ErrorActionPreference = 'Continue'

Write-Host '--- ports 5173/8080 owners ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
        Write-Host ("port {0} PID={1} name={2} cmd={3}" -f $port, $conn.OwningProcess, $p.Name, $p.CommandLine.Substring(0, [Math]::Min(160, $p.CommandLine.Length)))
    } else {
        Write-Host ("port {0} free" -f $port)
    }
}

Write-Host ''
Write-Host '--- all node processes ---'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Select-Object ProcessId, ParentProcessId, CreationDate, @{N='Cmd';E={$_.CommandLine.Substring(0, [Math]::Min(160, $_.CommandLine.Length))}} |
    Sort-Object ProcessId |
    Format-Table -AutoSize -Wrap | Out-String | Write-Host

Write-Host ''
Write-Host '--- all cmd processes ---'
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" |
    Select-Object ProcessId, ParentProcessId, CreationDate, @{N='Cmd';E={$_.CommandLine.Substring(0, [Math]::Min(160, $_.CommandLine.Length))}} |
    Sort-Object ProcessId |
    Format-Table -AutoSize -Wrap | Out-String | Write-Host

Write-Host ''
Write-Host '--- visible windows ---'
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object Id, ProcessName, MainWindowTitle |
    Format-Table -AutoSize | Out-String | Write-Host