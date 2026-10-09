# Stop any leftover pnpm/node dev processes (they keep dying as background tasks)
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -and ($_.Path -like '*\node.exe' -or $_.Path -like '*\pnpm*')
} | Stop-Process -Force -ErrorAction SilentlyContinue

$ErrorActionPreference = 'Stop'

$Nssm = 'C:\Users\naiti\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe'
$Deplox = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'
$LogsDir = "$Deplox\.runlogs\services"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Install-Service {
  param([string]$Name, [string]$Display, [string]$Exe, [string]$Args, [string]$StdOut, [string]$StdErr)
  # Remove existing if any
  & $Nssm stop $Name 2>$null
  & $Nssm remove $Name confirm 2>$null
  & $Nssm install $Name $Exe $Args | Out-Null
  & $Nssm set $Name DisplayName $Display | Out-Null
  & $Nssm set $Name Start SERVICE_AUTO_START | Out-Null
  & $Nssm set $Name AppStdout $StdOut | Out-Null
  & $Nssm set $Name AppStderr $StdErr | Out-Null
  & $Nssm set $Name AppRotateFiles 1 | Out-Null
  & $Nssm set $Name AppRotateBytes 10485760 | Out-Null
  & $Nssm set $Name AppRestartDelay 5000 | Out-Null
  # Throttle restart: if it dies within 60s, wait 60s before trying again
  & $Nssm set $Name AppThrottle 60000 | Out-Null
  Write-Host "  installed: $Name -> $Exe $Args"
}

# 1) deplox-api
Install-Service `
  -Name 'deplox-api' `
  -Display 'Deplox API (port 8080)' `
  -Exe 'C:\Program Files\nodejs\node.exe' `
  -Args 'C:\Program Files\nodejs\node_modules\pnpm\bin\pnpm.cjs dev:api' `
  -StdOut "$LogsDir\api.out.log" `
  -StdErr "$LogsDir\api.err.log"

# 2) deplox-web
Install-Service `
  -Name 'deplox-web' `
  -Display 'Deplox Web (Vite, port 5173)' `
  -Exe 'C:\Program Files\nodejs\node.exe' `
  -Args 'C:\Program Files\nodejs\node_modules\pnpm\bin\pnpm.cjs dev:web' `
  -StdOut "$LogsDir\web.out.log" `
  -StdErr "$LogsDir\web.err.log"

# 3) deplox-worker
Install-Service `
  -Name 'deplox-worker' `
  -Display 'Deplox Worker (BullMQ)' `
  -Exe 'C:\Program Files\nodejs\node.exe' `
  -Args 'C:\Program Files\nodejs\node_modules\pnpm\bin\pnpm.cjs dev:worker' `
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
  & $Nssm set $svc AppDirectory 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox' | Out-Null
}

# Start them all
foreach ($svc in @('deplox-api','deplox-web','deplox-worker','deplox-tunnel')) {
  & $Nssm start $svc | Out-Null
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
sc.exe query deplox-api | Select-Object -ExpandProperty Status
sc.exe query deplox-web | Select-Object -ExpandProperty Status
sc.exe query deplox-worker | Select-Object -ExpandProperty Status
sc.exe query deplox-tunnel | Select-Object -ExpandProperty Status
