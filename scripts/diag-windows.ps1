$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host '=== HIDDEN FLAGS ==='
$tasks = @('DeploxDevServer', 'deplox-watchdog-ensure')
foreach ($name in $tasks) {
    try {
        $t = Get-ScheduledTask -TaskName $name -ErrorAction Stop
        Write-Host ("{0,-32} Hidden={1,-5} State={2}" -f $t.TaskName, $t.Settings.Hidden, $t.State)
    } catch {
        Write-Host ("{0,-32} MISSING ({1})" -f $name, $_.Exception.Message)
    }
}

Write-Host ''
Write-Host '=== VISIBLE WINDOWS (MainWindowTitle ne "") ==='
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object Id, ProcessName, MainWindowTitle |
    Format-Table -AutoSize | Out-String | Write-Host

Write-Host '=== POWERSHELL PROCESSES (running) ==='
Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if (-not $cl) { $cl = '<no-cim>' }
    $clShort = $cl.Substring(0, [Math]::Min(140, $cl.Length))
    Write-Host ("PID={0,6}  Start={1:HH:mm:ss}  Cmd={2}" -f $_.Id, $_.StartTime, $clShort)
}

Write-Host ''
Write-Host '=== CMD PROCESSES (running) ==='
Get-Process cmd -ErrorAction SilentlyContinue | ForEach-Object {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if (-not $cl) { $cl = '<no-cim>' }
    $clShort = $cl.Substring(0, [Math]::Min(140, $cl.Length))
    Write-Host ("PID={0,6}  Start={1:HH:mm:ss}  Cmd={2}" -f $_.Id, $_.StartTime, $clShort)
}

Write-Host ''
Write-Host '=== Recent watchdog log tail ==='
$log = 'C:\Users\Users\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\watchdog.log'
if (Test-Path $log) {
    Get-Content $log -Tail 30 | ForEach-Object { Write-Host $_ }
} else {
    Write-Host "(no log)"
}

Write-Host ''
Write-Host '=== Recent ensure-watchdog log ==='
$log2 = 'C:\Users\Users\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\ensure-watchdog.log'
if (Test-Path $log2) {
    Get-Content $log2 -Tail 20 | ForEach-Object { Write-Host $_ }
} else {
    Write-Host "(no log)"
}