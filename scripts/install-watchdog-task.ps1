# Install Task Scheduler entry for the Deplox watchdog — runs at logon.
$ErrorActionPreference = 'Stop'

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument '-ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\scripts\deplox-watchdog.ps1' `
  -WorkingDirectory 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName 'DeploxWatchdog' `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -User $env:USERNAME `
  -Force | Out-Null

Write-Host "  registered: DeploxWatchdog (at logon)"
Get-ScheduledTask -TaskName 'DeploxWatchdog' | Format-List TaskName, State, Author
