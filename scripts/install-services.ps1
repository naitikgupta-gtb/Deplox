# Stop any leftover pnpm/node dev processes (they keep dying as background tasks)
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -and ($_.Path -like '*\node.exe' -or $_.Path -like '*\pnpm*')
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Allow NSSM to print "Can't open service" for non-existent services without aborting.
$ErrorActionPreference = 'Continue'

$Nssm = 'C:\Users\naiti\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe'
$Deplox = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'
$LogsDir = "$Deplox\.runlogs\services"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Install-Service {
  param([string]$Name, [string]$Display, [string]$Exe, [string]$Args, [string]$StdOut, [string]$StdErr)

  # Remove any pre-existing service (silent on "doesn't exist").
  $existing = & $Nssm status $Name 2>&1
  if ($LASTEXITCODE -eq 0) {
    & $Nssm stop $Name 2>&1 | Out-Null
    & $Nssm remove $Name confirm 2>&1 | Out-Null
    Start-Sleep -Milliseconds 500
  }

  # Install fresh
  & $Nssm install $Name $Exe $Args 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAILED to install $Name (nssm exit $LASTEXITCODE)"
    return
  }

  & $Nssm set $Name DisplayName $Display 2>&1 | Out-Null
  & $Nssm set $Name Start SERVICE_AUTO_START 2>&1 | Out-Null
  & $Nssm set $Name AppStdout $StdOut 2>&1 | Out-Null
  & $Nssm set $Name AppStderr $StdErr 2>&1 | Out-Null
  & $Nssm set $Name AppRotateFiles 1 2>&1 | Out-Null
  & $Nssm set $Name AppRotateBytes 10485760 2>&1 | Out-Null
  & $Nssm set $Name AppRestartDelay 5000 2>&1 | Out-Null
  & $Nssm set $Name AppThrottle 60000 2>&1 | Out-Null
  Write-Host "  installed: $Name -> $Exe $Args"
}

# 1) deplox-api
Install-Service `
  -Name 'deplox-api' `
  -Display 'Deplox API (port 8080)' `
  -Exe 'C:\nvm4w\nodejs\node.exe' `
  -Args 'C:\Users\naiti\AppData\Roaming\npm\pnpm.ps1 dev:api' `
  -StdOut "$LogsDir\api.out.log" `
  -StdErr "$LogsDir\api.err.log"

# 2) deplox-web
Install-Service `
  -Name 'deplox-web' `
  -Display 'Deplox Web (Vite, port 5173)' `
  -Exe 'C:\nvm4w\nodejs\node.exe' `
  -Args 'C:\Users\naiti\AppData\Roaming\npm\pnpm.ps1 dev:web' `
  -StdOut "$LogsDir\web.out.log" `
  -StdErr "$LogsDir\web.err.log"

# 3) deplox-worker
Install-Service `
  -Name 'deplox-worker' `
  -Display 'Deplox Worker (BullMQ)' `
  -Exe 'C:\nvm4w\nodejs\node.exe' `
  -Args 'C:\Users\naiti\AppData\Roaming\npm\pnpm.ps1 dev:worker' `
  -StdOut "$LogsDir\worker.out.log" `
  -StdErr "$LogsDir\worker.err.log"

# 4) deplox-tunnel
Install-Service `
  -Name 'deplox-tunnel' `
  -Display 'Deplox Cloudflare Tunnel' `
  -Exe 'C:\Program Files (x86)\cloudflared\cloudflared.exe' `
  -Args 'tunnel --config C:\Users\naiti\.cloudflared\config.yml run deplox-prod' `
  -StdOut "$LogsDir\tunnel.out.log" `
  -StdErr "$LogsDir\tunnel.err.log"

# Set working directory for the pnpm services so .env loading works
foreach ($svc in @('deplox-api','deplox-web','deplox-worker')) {
  & $Nssm set $svc AppDirectory 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox' 2>&1 | Out-Null
}

# Start them all
foreach ($svc in @('deplox-api','deplox-web','deplox-worker','deplox-tunnel')) {
  & $Nssm start $svc 2>&1 | Out-Null
  Write-Host "  started: $svc"
}

# Also set the deplox app containers to restart=always so they survive Docker restarts
$containers = @(
  'deplox-dc01454b-8a40-44f3-9990-fc09c500f514',
  'deplox-88c11127-d0f7-4960-afa0-9ed601193989',
  'deplox-95bcf43c-8cc6-43f3-93f5-f56cf4814686',
  'deplox-b47e9775-3134-4fa9-8a4b-d825fb9cf4be'
)
foreach ($c in $containers) {
  docker update --restart=always $c 2>&1 | Out-Null
}
# Caddy should always restart too
docker update --restart=always infra-caddy-1 2>&1 | Out-Null

Write-Host ""
Write-Host "=== services installed. Status: ==="
foreach ($svc in @('deplox-api','deplox-web','deplox-worker','deplox-tunnel')) {
  $state = (sc.exe query $svc 2>&1 | Select-String 'STATE' | ForEach-Object { $_.ToString().Trim() })
  Write-Host "  $svc : $state"
}
