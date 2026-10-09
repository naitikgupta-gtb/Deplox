# DEPLOX watchdog — runs forever, ensures dev/api + dev/web + cloudflared are
# always up. Designed to be started at user logon by Task Scheduler.
#
# Every 15s it checks:
#   1) docker daemon — if down, start Docker Desktop and wait
#   2) deplox-deployed app containers — `docker ps` should show them running
#   3) API on :8080 — restart `pnpm dev:api` if missing
#   4) Vite on :5173 — restart `pnpm dev:web` if missing
#   5) cloudflared tunnel — restart if not running
#
# Logs every action to .runlogs/watchdog.log
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

function Process-Running {
  param([string]$Name)
  $p = Get-Process -Name $Name -ErrorAction SilentlyContinue
  return $null -ne $p
}

function Start-IfNot {
  param([string]$Title, [string]$Exe, [string]$Args, [string]$WorkingDir = $Deplox)
  if (-not (Process-Running $Title)) {
    Log "  starting $Title (was down)"
    try {
      Start-Process -FilePath $Exe -ArgumentList $Args -WorkingDirectory $WorkingDir -WindowStyle Hidden
    } catch {
      Log "  FAILED to start $Title: $_"
    }
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
    Log "Docker daemon down — starting Docker Desktop"
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -WindowStyle Hidden
    Start-Sleep -Seconds 30
    continue
  }

  # 2) Caddy container (orchestrator of the auto-subdomain routing)
  $caddy = docker ps -a --filter 'name=infra-caddy-1' --format '{{.Names}} {{.Status}}' 2>$null
  if ($caddy -notmatch 'Up ') {
    $needsAction = $true
    Log "Caddy container not running: '$caddy' — starting"
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
      Log "App container $c down ($st) — starting"
      docker start $c 2>&1 | Out-Null
    }
  }

  # 4) API on :8080
  if (-not (Port-Listening 8080)) {
    $needsAction = $true
    Log "API :8080 not listening — starting pnpm dev:api"
    Start-Process -FilePath 'C:\nvm4w\nodejs\node.exe' `
      -ArgumentList 'C:\Users\naiti\AppData\Roaming\npm\pnpm.ps1','dev:api' `
      -WorkingDirectory $Deplox -WindowStyle Hidden
  }

  # 5) Vite on :5173
  if (-not (Port-Listening 5173)) {
    $needsAction = $true
    Log "Vite :5173 not listening — starting pnpm dev:web"
    Start-Process -FilePath 'C:\nvm4w\nodejs\node.exe' `
      -ArgumentList 'C:\Users\naiti\AppData\Roaming\npm\pnpm.ps1','dev:web' `
      -WorkingDirectory $Deplox -WindowStyle Hidden
  }

  # 6) Cloudflare tunnel
  if (-not (Process-Running 'cloudflared')) {
    $needsAction = $true
    Log "cloudflared not running — starting tunnel"
    Start-Process -FilePath 'C:\Program Files (x86)\cloudflared\cloudflared.exe' `
      -ArgumentList 'tunnel','--config','C:\Users\naiti\.cloudflared\config.yml','run','deplox-prod' `
      -WindowStyle Hidden
  }

  if (-not $needsAction) {
    # All healthy — log less frequently to avoid spam
    if ((Get-Date).Minute % 5 -eq 0 -and (Get-Date).Second -lt 20) {
      Log "all healthy"
    }
  }

  Start-Sleep -Seconds 15
}
