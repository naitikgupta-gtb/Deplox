<#
.SYNOPSIS
  Install DeploxDev as a proper Windows service via NSSM.

.DESCRIPTION
  Replaces the old Task Scheduler "DeploxDevServer" task with a real
  Windows service. Pros over Task Scheduler:

    - Survives user logoff (services run in Session 0, not user session)
    - Auto-restart on crash (NSSM Restart=on-failure)
    - Stdout/stderr captured to log files (no flashing console window)
    - I/O throttle (no CPU spin if the child goes haywire)

  The service runs `node scripts/dev.mjs` directly. dev.mjs already uses
  `windowsHide:true` and `process.execPath` so it spawns the API + Vite
  without any flashing cmd windows.

  REQUIRES: Run as Administrator (NSSM needs elevation to install services).
#>

$ErrorActionPreference = 'Stop'

$Repo = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'
$ServiceName = 'DeploxDev'
$NodeExe = 'C:\nvm4w\nodejs\node.exe'
$DevScript = Join-Path $Repo 'scripts\dev.mjs'
$LogDir = Join-Path $Repo '.runlogs\services'
$OutLog = Join-Path $LogDir 'nssm-deploxdev.out.log'
$ErrLog = Join-Path $LogDir 'nssm-deploxdev.err.log'

# Find nssm.exe on PATH
$nssm = (Get-Command nssm.exe -ErrorAction Stop).Source
Write-Host "[nssm] using $nssm"

# Pre-flight
if (-not (Test-Path $NodeExe)) { throw "node not found at $NodeExe" }
if (-not (Test-Path $DevScript)) { throw "dev.mjs not found at $DevScript" }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# If a previous install exists, remove it first so re-runs are idempotent.
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[nssm] removing existing service $ServiceName"
    & nssm stop $ServiceName 2>$null | Out-Null
    Start-Sleep -Seconds 2
    & nssm remove $ServiceName confirm 2>$null | Out-Null
    Start-Sleep -Seconds 1
}

Write-Host "[nssm] installing $ServiceName"
& nssm install $ServiceName $NodeExe "`"$DevScript`""
if ($LASTEXITCODE -ne 0) { throw "nssm install failed" }

# ----- Service configuration -----
& nssm set $ServiceName AppDirectory           $Repo
& nssm set $ServiceName AppStdout              $OutLog
& nssm set $ServiceName AppStderr              $ErrLog
& nssm set $ServiceName AppRotateFiles         1
& nssm set $ServiceName AppRotateBytes         10485760   # 10 MB
& nssm set $ServiceName AppRotateOnline        1

# Restart behaviour: wait 5s after a crash, then restart. Give up after 3
# attempts in a 60s window to avoid a tight crash loop.
& nssm set $ServiceName AppRestartDelay        5000
& nssm set $ServiceName AppExitActions         Restart
& nssm set $ServiceName AppThrottle            5000        # min 5s between restarts
& nssm set $ServiceName AppThrottleAction      Restart

# Service metadata
& nssm set $ServiceName DisplayName            "Deplox Dev (pnpm dev: API + Vite)"
& nssm set $ServiceName Description           "Runs apps/api (port 8080) and apps/web (port 5173) under scripts/dev.mjs. Powers deplox.site + customer subdomains in dev mode."
& nssm set $ServiceName Start                  SERVICE_AUTO_START
& nssm set $ServiceName ObjectName             LocalSystem

# Ensure the service can interact with the host network (loopback) and write
# logs into the repo's .runlogs. LocalSystem has the right defaults; we just
# make sure no extra deps are missing.

Write-Host "[nssm] starting $ServiceName"
& nssm start $ServiceName
if ($LASTEXITCODE -ne 0) {
    Write-Warning "nssm start returned non-zero. The service may still have started; check `Get-Service $ServiceName`."
}

Start-Sleep -Seconds 2
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "[nssm] $ServiceName is RUNNING (pid lookup via Get-Process node)"
    $node = Get-Process node -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($node) { Write-Host "        node PID=$($node.Id)" }
} else {
    Write-Warning "[nssm] $ServiceName is NOT running. Tail the log:"
    Write-Warning "        Get-Content '$ErrLog' -Tail 30"
}

Write-Host ""
Write-Host "Done. Verify with:"
Write-Host "  Get-Service $ServiceName"
Write-Host "  Get-Content '$OutLog' -Tail 20"
