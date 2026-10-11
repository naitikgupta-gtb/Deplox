$ErrorActionPreference = 'Stop'

Write-Host '=== DeploxDevServer task full details ==='
$t = Get-ScheduledTask -TaskName 'DeploxDevServer'
Write-Host ("Principal.UserId: {0}" -f $t.Principal.UserId)
Write-Host ("Settings.Hidden: {0}" -f $t.Settings.Hidden)
Write-Host ("Settings.MultipleInstances: {0}" -f $t.Settings.MultipleInstances)
Write-Host ("Settings.DisallowStartIfOnBatteries: {0}" -f $t.Settings.DisallowStartIfOnBatteries)
Write-Host 'Actions:'
foreach ($a in $t.Actions) {
    Write-Host ("  Execute={0}" -f $a.Execute)
    Write-Host ("  Arguments={0}" -f $a.Arguments)
    Write-Host ("  WorkingDirectory={0}" -f $a.WorkingDirectory)
}
Write-Host 'Triggers:'
foreach ($tr in $t.Triggers) {
    Write-Host ("  Type={0}  Enabled={1}  Delay={2}" -f $tr.Type, $tr.Enabled, $tr.Delay)
}

Write-Host ''
Write-Host '=== deplox-watchdog-ensure task full details ==='
$t = Get-ScheduledTask -TaskName 'deplox-watchdog-ensure'
Write-Host ("Principal.UserId: {0}" -f $t.Principal.UserId)
Write-Host ("Settings.Hidden: {0}" -f $t.Settings.Hidden)
Write-Host ("Settings.MultipleInstances: {0}" -f $t.Settings.MultipleInstances)
Write-Host 'Actions:'
foreach ($a in $t.Actions) {
    Write-Host ("  Execute={0}" -f $a.Execute)
    Write-Host ("  Arguments={0}" -f $a.Arguments)
    Write-Host ("  WorkingDirectory={0}" -f $a.WorkingDirectory)
}
Write-Host 'Triggers:'
foreach ($tr in $t.Triggers) {
    Write-Host ("  Type={0}  Enabled={1}" -f $tr.Type, $tr.Enabled)
    if ($tr.Repetition) {
        Write-Host ("  Repetition.Interval={0}" -f $tr.Repetition.Interval)
        Write-Host ("  Repetition.Duration={0}" -f $tr.Repetition.Duration)
    }
}

Write-Host ''
Write-Host '=== TASK HISTORY (last 10 of DeploxDevServer) ==='
try {
        Get-ScheduledTaskInfo -TaskName 'DeploxDevServer' | Format-List | Out-String | Write-Host
    } catch { Write-Host "(no info)" }

Write-Host ''
Write-Host '=== TASK HISTORY (last of watchdog-ensure) ==='
try {
        Get-ScheduledTaskInfo -TaskName 'deplox-watchdog-ensure' | Format-List | Out-String | Write-Host
    } catch { Write-Host "(no info)" }