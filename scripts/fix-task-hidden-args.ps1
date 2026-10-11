$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Deplox = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'
$StartLauncher = Join-Path $Deplox 'scripts\start-pnpm-dev.ps1'
$EnsureLauncher = Join-Path $Deplox 'scripts\ensure-watchdog.ps1'

# Re-register DeploxDevServer with -WindowStyle Hidden in the action arguments.
# `Settings.Hidden = True` alone is unreliable on Win10/11; the action needs
# `-WindowStyle Hidden` so the spawned powershell.exe never allocates a
# visible console.
Write-Host '--- Re-registering DeploxDevServer ---'
Unregister-ScheduledTask -TaskName 'DeploxDevServer' -Confirm:$false

$action1 = New-ScheduledTaskAction `
    -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartLauncher`"" `
    -WorkingDirectory $Deplox

$trig1 = New-ScheduledTaskTrigger -AtLogOn -Delay 'PT1M'
$trig1.Enabled = $true

$sett1 = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew `
    -Hidden

Register-ScheduledTask `
    -TaskName 'DeploxDevServer' `
    -Action $action1 `
    -Trigger $trig1 `
    -Settings $sett1 `
    -Principal (New-ScheduledTaskPrincipal -UserId 'Naitik' -LogonType Interactive -RunLevel Limited) `
    -Description 'Start deplox pnpm dev silently on user logon (1 min grace).' `
    -Force | Out-Null

Write-Host 'DeploxDevServer re-registered with -WindowStyle Hidden in Arguments.'
Start-Sleep -Seconds 1

# Re-register deplox-watchdog-ensure with the same fix
Write-Host '--- Re-registering deplox-watchdog-ensure ---'
Unregister-ScheduledTask -TaskName 'deplox-watchdog-ensure' -Confirm:$false

$action2 = New-ScheduledTaskAction `
    -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$EnsureLauncher`"" `
    -WorkingDirectory $Deplox

$trig2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
$trig2.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)).Repetition
$trig2.Repetition.Interval = 'PT2M'
$trig2.Repetition.Duration = 'P3650D'

$sett2 = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
    -MultipleInstances IgnoreNew `
    -Hidden

Register-ScheduledTask `
    -TaskName 'deplox-watchdog-ensure' `
    -Action $action2 `
    -Trigger $trig2 `
    -Settings $sett2 `
    -Principal (New-ScheduledTaskPrincipal -UserId 'Naitik' -LogonType Interactive -RunLevel Limited) `
    -Description 'Ensure the deplox watchdog is alive (every 2 min).' `
    -Force | Out-Null

Write-Host 'deplox-watchdog-ensure re-registered with -WindowStyle Hidden in Arguments.'

Write-Host ''
Write-Host '=== Verifying ==='
foreach ($name in @('DeploxDevServer', 'deplox-watchdog-ensure')) {
    $t = Get-ScheduledTask -TaskName $name
    $a = $t.Actions[0]
    $hasHidden = $a.Arguments -like '*-WindowStyle Hidden*'
    Write-Host ("{0,-32} Hidden={1,-5} ActionHas-Hidden={2,-5} Args={3}" -f `
        $t.TaskName, $t.Settings.Hidden, $hasHidden, $a.Arguments)
}