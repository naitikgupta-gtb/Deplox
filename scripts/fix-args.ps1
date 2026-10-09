# Fix NSSM service AppParameters (got lost during install)
$ErrorActionPreference = 'Continue'
$Nssm = 'C:\Users\naiti\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe'

# Map service name -> argument
$Map = @{
  'deplox-api'    = 'dev:api'
  'deplox-web'    = 'dev:web'
  'deplox-worker' = 'dev:worker'
}

# Stop them, set the right AppParameters, restart
foreach ($pair in $Map.GetEnumerator()) {
  $svc = $pair.Key
  $arg = $pair.Value
  Write-Host "--- $svc ---"
  & $Nssm stop $svc 2>&1 | Out-Null
  Start-Sleep -Milliseconds 500
  & $Nssm set $svc AppParameters $arg 2>&1 | Out-Null
  Write-Host "  AppParameters set: $arg"
  & $Nssm get $svc AppParameters 2>&1
  & $Nssm set $svc AppRestartDelay 5000 2>&1 | Out-Null
  & $Nssm set $svc AppThrottle 60000 2>&1 | Out-Null
  & $Nssm start $svc 2>&1 | Out-Null
  Write-Host "  started"
}

Write-Host ""
Write-Host "Waiting 20s for services to come up..."
Start-Sleep -Seconds 20

foreach ($svc in @('deplox-api','deplox-web','deplox-worker','deplox-tunnel')) {
  $state = sc.exe query $svc 2>&1 | Select-String 'STATE' | ForEach-Object { $_.ToString().Trim() }
  Write-Host "  $svc : $state"
}
