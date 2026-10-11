# Make the DeploxDevServer Scheduled Task hidden so its PowerShell window
# does not flash on the user's screen at logon. Requires admin.
#
# Run ONCE in an elevated PowerShell:
#   1. Win+X, "Windows PowerShell (Admin)"  OR
#   2. Start Menu, type "PowerShell", right-click "Run as administrator"
# Then paste this whole file and press Enter.

$ErrorActionPreference = 'Stop'

# Apply the Hidden flag in-place so we don't have to re-register the task
# (re-registration would need the user to re-enter their logon password).
$task = Get-ScheduledTask -TaskName 'DeploxDevServer' -ErrorAction Stop
$task.Settings.Hidden = $true
Set-ScheduledTask -TaskName 'DeploxDevServer' -Settings $task.Settings

# Also hide the 2-min watchdog-ensure task in case it was re-created
# without the Hidden flag.
$task2 = Get-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue
if ($task2) {
  $task2.Settings.Hidden = $true
  Set-ScheduledTask -TaskName 'deplox-watchdog-ensure' -Settings $task2.Settings
}

Write-Host ''
Write-Host 'Done. Both tasks are now Hidden = True.' -ForegroundColor Green
Write-Host 'Verify: Get-ScheduledTask | Where-Object { $_.TaskName -like "*deplox*" -or $_.TaskName -like "*Deplox*" } | Format-Table TaskName, State, @{n="Hidden";e={$_.Settings.Hidden}}' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Reboot your laptop once and confirm no PowerShell window flashes.' -ForegroundColor Yellow