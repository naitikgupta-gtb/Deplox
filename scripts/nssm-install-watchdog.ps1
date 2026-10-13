<#
.SYNOPSIS
  Install DeploxWatchdog as a proper Windows service via NSSM.

.DESCRIPTION
  Replaces the old Task Scheduler "watchdog-ensure" task. The watchdog
  PowerShell loop (scripts/deplox-watchdog.ps1) checks every 15s that
  Docker, Caddy, the per-project containers, pnpm dev, and the cloudflared
  tunnel are all running. If anything is down, it restarts it.

  Running the loop as an NSSM service (instead of as a Task Scheduler task)
  means it survives user logoff and is auto-restarted on crash.

  REQUIRES: Run as Administrator.
#>

$ErrorActionPreference = 'Stop'

$Repo = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'
$ServiceName = 'DeploxWatchdog'
$WatchdogScript = Join-Path $Repo 'scripts\deplox-watchdog.ps1'
$LogDir = Join-Path $Repo '.runlogs\services'
$OutLog = Join-Path $LogDir 'nssm-watchdog.out.log'
$ErrLog = Join-Path $LogDir 'nssm-watchdog.err.log'

$nssm = (Get-Command nssm.exe -ErrorAction Stop).Source
Write-Host "[nssm] using $nssm"

if (-not (Test-Path $WatchdogScript)) { throw "watchdog not found at $WatchdogScript" }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# If a previous install exists, remove it first.
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[nssm] removing existing service $ServiceName"
    & nssm stop $ServiceName 2>$null | Out-Null
    Start-Sleep -Seconds 2
    & nssm remove $ServiceName confirm 2>$null | Out-Null
    Start-Sleep -Seconds 1
}

# NSSM can run any exe; we point it at powershell.exe with the script as an
# argument. NSSM will then manage powershell as the child + the watchdog
# script as the grand-child.
$psExe = (Get-Command powershell.exe -ErrorAction Stop).Source

Write-Host "[nssm] installing $ServiceName"
& nssm install $ServiceName $psExe `
    '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$WatchdogScript`""
if ($LASTEXITCODE -ne 0) { throw "nssm install failed" }

& nssm set $ServiceName AppDirectory           $Repo
& nssm set $ServiceName AppStdout              $OutLog
& nssm set $ServiceName AppStderr              $ErrLog
& nssm set $ServiceName AppRotateFiles         1
& nssm set $ServiceName AppRotateBytes         5242880    # 5 MB (watchdog log is spammy)
& nssm set $ServiceName AppRotateOnline        1

# The watchdog is itself a loop. If it crashes (very rare), restart it
# after 10s. 3-retry throttling to avoid a crash-storm.
& nssm set $ServiceName AppRestartDelay        10000
& nssm set $ServiceName AppExitActions         Restart
& nssm set $ServiceName AppThrottle            10000
& nssm set $ServiceName AppThrottleAction      Restart

# Start AFTER the network so localhost ports are usable.
& nssm set $ServiceName DependOnService        "Docker"

# Service metadata
& nssm set $ServiceName DisplayName            "Deplox Watchdog (self-heal loop)"
& nssm set $ServiceName Description           "15s loop that keeps Docker, Caddy, deplox app containers, pnpm dev, and the cloudflared tunnel running. Last line of defence against a stuck process."
& nssm set $ServiceName Start                  SERVICE_AUTO_START
& nssm set $ServiceName ObjectName             LocalSystem

Write-Host "[nssm] starting $ServiceName"
& nssm start $ServiceName
if ($LASTEXITCODE -ne 0) {
    Write-Warning "nssm start returned non-zero. Check `Get-Service $ServiceName`."
}

Start-Sleep -Seconds 2
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "[nssm] $ServiceName is RUNNING"
} else {
    Write-Warning "[nssm] $ServiceName is NOT running. Tail the log:"
    Write-Warning "        Get-Content '$ErrLog' -Tail 30"
}

Write-Host ""
Write-Host "Done. Verify with:"
Write-Host "  Get-Service $ServiceName"
Write-Host "  Get-Content 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\watchdog.log' -Tail 30"
