$ErrorActionPreference = 'Continue'

# Check watchdog-ensure task state
Write-Host '--- watchdog-ensure task ---'
$t = Get-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue
if ($t) {
    Write-Host ("State: {0}" -f $t.State)
    Write-Host ("Hidden: {0}" -f $t.Settings.Hidden)
    Write-Host ("Args: {0}" -f $t.Actions[0].Arguments)
} else { Write-Host '(not found)' }

Write-Host ''
Write-Host '--- DeploxDevServer task ---'
$t = Get-ScheduledTask -TaskName 'DeploxDevServer' -ErrorAction SilentlyContinue
if ($t) {
    Write-Host ("State: {0}" -f $t.State)
    Write-Host ("Hidden: {0}" -f $t.Settings.Hidden)
    Write-Host ("Args: {0}" -f $t.Actions[0].Arguments)
}

Write-Host ''
Write-Host '--- visible windows ---'
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle, StartTime | Format-Table -AutoSize | Out-String | Write-Host

Write-Host '--- watchdog log tail ---'
$log = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\watchdog.log'
if (Test-Path $log) {
    Get-Content $log -Tail 10 | ForEach-Object { Write-Host $_ }
} else { Write-Host '(no log)' }

Write-Host '--- ensure-launcher log tail ---'
$log = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\watchdog-launcher.log'
if (Test-Path $log) {
    Get-Content $log -Tail 10 | ForEach-Object { Write-Host $_ }
} else { Write-Host '(no log)' }

Write-Host '--- pnpm-dev start log tail ---'
$log = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\services\pnpm-dev.start.log'
if (Test-Path $log) {
    Get-Content $log -Tail 15 | ForEach-Object { Write-Host $_ }
} else { Write-Host '(no log)' }