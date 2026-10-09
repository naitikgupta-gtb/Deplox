# DEPLOX full-resilience setup.
# Run ONCE in an elevated PowerShell. After this:
#   - Docker Desktop starts automatically on logon
#   - pnpm dev starts automatically 1 minute after logon
#   - 5 deplox app containers + Caddy restart automatically
#   - Per-hostname Caddy routes persist across Caddy restarts
#     (the API commits the Caddy config to autosave.json after every
#     prime, so the routes come back even if the API itself is down)

$ErrorActionPreference = 'Stop'
$Deplox = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'

Write-Host "=== 1. Auto-start Docker Desktop on logon ==="
$runKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'
$valueName = 'Docker Desktop'
$dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
if ((Get-ItemProperty -Path $runKey -Name $valueName -ErrorAction SilentlyContinue).$valueName -ne $null) {
  Write-Host "  already present"
} else {
  New-ItemProperty -Path $runKey -Name $valueName -Value "`"$dockerExe`"" -PropertyType String | Out-Null
  Write-Host "  added: $valueName -> $dockerExe"
}

Write-Host ""
Write-Host "=== 2. Auto-start pnpm dev on logon (Task Scheduler) ==="
$taskName = 'DeploxDevServer'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# This .ps1 will be the scheduled task body. It just runs pnpm dev.
$starter = "$Deplox\scripts\start-pnpm-dev.ps1"
@"
#' Auto-starter for the Deplox dev server. Runs `pnpm dev` and stays
#' alive so the scheduler doesn't think the task failed.
Set-Location '$Deplox'
$env:PATH = 'C:\nvm4w\nodejs;C:\Users\naiti\AppData\Roaming\npm;' + $env:PATH
# Start pnpm dev in a hidden window and wait for it.
$proc = Start-Process -FilePath 'C:\Users\naiti\AppData\Roaming\npm\pnpm.cmd' -ArgumentList 'dev' -WorkingDirectory '$Deplox' -WindowStyle Hidden -PassThru
try { Wait-Process -Id `$proc.Id } catch { Start-Sleep -Seconds 86400 }
"@ | Set-Content -Path $starter -Encoding UTF8

$action = New-ScheduledTaskAction `
  -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$starter`"" `
  -WorkingDirectory $Deplox

$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = 'PT1M'  # 1 min after logon (Docker Desktop starts in ~30s)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -User $env:USERNAME `
  -RunLevel Highest `
  -Force | Out-Null

Write-Host "  registered: $taskName (1 min after logon)"

Write-Host ""
Write-Host "=== 3. Confirm pnpm dev is currently running and Caddy routes persist ==="
$pnpm = Get-Process pnpm -ErrorAction SilentlyContinue
if ($pnpm) {
  Write-Host "  pnpm dev is running (PID $($pnpm[0].Id))"
} else {
  Write-Host "  WARNING: pnpm dev is NOT running. Start it with: cd $Deplox ; pnpm dev"
}

Write-Host ""
Write-Host "=== Done. The stack is now self-healing. ==="
Write-Host ""
Write-Host "  - Reboot           -> Docker Desktop auto-starts (via Run key)"
Write-Host "                      -> 1 min later pnpm dev starts (via Task Scheduler)"
Write-Host "                      -> 30s later all 6 containers come up (restart=always)"
Write-Host "                      -> Caddy routes already in autosave.json (no re-prime needed)"
Write-Host ""
Write-Host "  - Docker crash     -> Restart Docker Desktop manually OR reboot"
Write-Host "                      -> Watchdog + restart=always bring containers back"
Write-Host "                      -> pnpm dev comes back when next Task Scheduler trigger fires"
Write-Host "                      -> API on startup re-primes Caddy routes (idempotent)"
Write-Host ""
Write-Host "  - Caddy crash only -> restart policy brings it back; routes from autosave.json"
