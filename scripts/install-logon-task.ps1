# Install a Task Scheduler entry that starts pnpm dev at user logon.
# This keeps the API + Vite alive after a reboot (or session restart)
# without needing NSSM admin install. Runs in the user's context.
$ErrorActionPreference = 'Stop'

# Remove any existing
$existing = Get-ScheduledTask -TaskName 'DeploxDevServer' -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName 'DeploxDevServer' -Confirm:$false
}

$action = New-ScheduledTaskAction `
  -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
  -Argument '-NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath ''C:\nvm4w\nodejs\node.exe'' -ArgumentList ''C:\Users\naiti\AppData\Roaming\npm\pnpm.cmd'',''dev'' -WorkingDirectory ''C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'' -WindowStyle Hidden"' `
  -WorkingDirectory 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'

# Delay 60s after logon so Docker Desktop has a chance to start first
$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = 'PT1M'  # ISO 8601 duration: 1 minute

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName 'DeploxDevServer' `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -User $env:USERNAME `
  -Force | Out-Null

Write-Host "  registered: DeploxDevServer (1 min after logon)"
Get-ScheduledTask -TaskName 'DeploxDevServer' | Format-List TaskName, State, Author
