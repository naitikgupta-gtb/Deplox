# DEPLOX watchdog - runs forever, ensures pnpm dev (API :8080 + Vite :5173)
# and cloudflared are always up. Designed to be started at user logon by
# Task Scheduler, OR run as a 5-min recurring task.
#
# Every 15s it checks:
#   1) docker daemon - if down, start Docker Desktop and wait
#   2) deplox-deployed app containers - `docker ps` should show them running
#   3) pnpm dev - covers BOTH API :8080 and Vite :5173. If either port is
#      missing we treat the whole dev as down and restart it via the same
#      Task-Scheduler-safe launcher (`scripts/start-pnpm-dev.ps1`) that
#      `DeploxDevServer` uses.
#   4) cloudflared tunnel - restart if not running
#
# pnpm dev restart kills any node.exe holding port 5173 or 8080 first (in
# case a half-crashed pnpm dev left a zombie listener), then spawns a fresh
# `pnpm dev` via the launcher. The launcher detaches the child + writes
# logs, so this script returns immediately and Task Scheduler doesn't see
# the watchdog as "stuck Running".
#
# Logs every action to .runlogs/watchdog.log

# Force UTF-8 read so non-ASCII characters in messages (e.g. the em-dash
# we used to use) don't get mangled into `???` question marks by the
# default ASCII codepage on this Windows install.
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = 'Continue'
$Deplox = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'
$LogFile = "$Deplox\.runlogs\watchdog.log"
New-Item -ItemType Directory -Force -Path "$Deplox\.runlogs" | Out-Null

function Log {
  param([string]$Msg)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Msg"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Port-Listening {
  param([int]$Port)
  $conn = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
          Where-Object { $_.LocalPort -eq $Port }
  return $null -ne $conn
}

function Port-Owner-Pid {
  param([int]$Port)
  $conn = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
          Where-Object { $_.LocalPort -eq $Port } |
          Select-Object -First 1
  if ($conn) { return $conn.OwningProcess } else { return $null }
}

function Process-Running {
  param([string]$Name)
  $p = Get-Process -Name $Name -ErrorAction SilentlyContinue
  return $null -ne $p
}

function Restart-Pnpm-Dev {
  Log "  restarting pnpm dev (ports 5173/8080 missing)"

  # 1) Kill any stale node.exe holding either port. pnpm dev forks API + Vite,
  #    so the listeners are node processes, not pnpm. We use the OwningProcess
  #    from Get-NetTCPConnection so we don't accidentally kill unrelated
  #    node processes (e.g. cloudflared, or future workers).
  foreach ($port in @(5173, 8080)) {
    $pidOwner = Port-Owner-Pid $port
    if ($pidOwner -and $pidOwner -gt 0) {
      try {
        $p = Get-Process -Id $pidOwner -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -eq 'node') {
          Log "    killing stale node.exe PID=$pidOwner (port $port)"
          Stop-Process -Id $pidOwner -Force -ErrorAction SilentlyContinue
        } else {
          Log "    port $port owned by non-node process $pidOwner ($($p.ProcessName)) - leaving alone"
        }
      } catch {}
    }
  }

  # 2) Spawn a fresh pnpm dev via the canonical launcher. That launcher
  #    detaches the child + writes logs, so we just return.
  $launcher = Join-Path $Deplox 'scripts\start-pnpm-dev.ps1'
  if (Test-Path $launcher) {
    Start-Process -FilePath 'powershell.exe' `
      -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$launcher`"" `
      -WorkingDirectory $Deplox -WindowStyle Hidden
  } else {
    # Direct fallback: spawn node running scripts/dev.mjs (which uses
    # windowsHide:true on each child) so we don't flash cmd windows.
    Log "    launcher missing ($launcher) - falling back to node scripts/dev.mjs"
    $devScript = Join-Path $Deplox 'scripts\dev.mjs'
    Start-Process -FilePath 'C:\nvm4w\nodejs\node.exe' `
      -ArgumentList "`"$devScript`"" `
      -WorkingDirectory $Deplox -WindowStyle Hidden `
      -RedirectStandardOutput "$Deplox\.runlogs\services\pnpm-dev.out.log" `
      -RedirectStandardError "$Deplox\.runlogs\services\pnpm-dev.err.log"
  }
}

Log "==== watchdog boot ===="

# Wait for Docker to be ready (Docker Desktop can take ~30s to start)
$dockerReady = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $dockerReady = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}
if (-not $dockerReady) {
  Log "Docker not ready after 60s. Start Docker Desktop and watchdog will retry next cycle."
}

while ($true) {
  $needsAction = $false

  # 1) Docker daemon
  try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'not ready' }
  } catch {
    $needsAction = $true
    Log "Docker daemon down - starting Docker Desktop"
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -WindowStyle Hidden
    Start-Sleep -Seconds 30
    continue
  }

  # 2) Caddy container (orchestrator of the auto-subdomain routing)
  $caddy = docker ps -a --filter 'name=infra-caddy-1' --format '{{.Names}} {{.Status}}' 2>$null
  if ($caddy -notmatch 'Up ') {
    $needsAction = $true
    Log "Caddy container not running: '$caddy' - starting"
    docker start infra-caddy-1 2>&1 | Out-Null
  }

  # 3) deplox app containers
  $apps = @(
    'deplox-dc01454b-8a40-44f3-9990-fc09c500f514',
    'deplox-88c11127-d0f7-4960-afa0-9ed601193989',
    'deplox-95bcf43c-8cc6-43f3-93f5-f56cf4814686',
    'deplox-b47e9775-3134-4fa9-8a4b-d825fb9cf4be'
  )
  foreach ($c in $apps) {
    $st = docker ps -a --filter "name=$c" --format '{{.Status}}' 2>$null
    if ($st -notmatch '^Up ') {
      $needsAction = $true
      Log "App container $c down ($st) - starting"
      docker start $c 2>&1 | Out-Null
    }
  }

  # 4) pnpm dev (covers both API :8080 and Vite :5173). If either port is
  #    missing we treat the whole pnpm dev as down and restart it.
  if ((-not (Port-Listening 8080)) -or (-not (Port-Listening 5173))) {
    $needsAction = $true
    Restart-Pnpm-Dev
  }

  # 5) Cloudflare tunnel
  if (-not (Process-Running 'cloudflared')) {
    $needsAction = $true
    Log "cloudflared not running - starting tunnel"
    Start-Process -FilePath 'C:\Program Files (x86)\cloudflared\cloudflared.exe' `
      -ArgumentList 'tunnel','--config','C:\Users\naiti\.cloudflared\config.yml','run','deplox-prod' `
      -WindowStyle Hidden
  }

  if (-not $needsAction) {
    # All healthy - log less frequently to avoid spam
    if ((Get-Date).Minute % 5 -eq 0 -and (Get-Date).Second -lt 20) {
      Log "all healthy"
    }
  }

  Start-Sleep -Seconds 15
}