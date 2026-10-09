# Set NSSM AppParameters directly via registry, then start
$ErrorActionPreference = 'Continue'

$Map = @{
  'deplox-api'    = 'dev:api'
  'deplox-web'    = 'dev:web'
  'deplox-worker' = 'dev:worker'
}

foreach ($pair in $Map.GetEnumerator()) {
  $svc = $pair.Key
  $arg = $pair.Value
  Write-Host "--- $svc ---"

  # Stop and reset the service throttling so NSSM doesn't refuse to start
  sc.exe stop $svc | Out-Null
  Start-Sleep -Milliseconds 800
  sc.exe failure $svc reset= 0 actions= | Out-Null
  # Delete AppExit* subkeys which record failed exits and put service in PAUSED
  $appExitPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$svc\Parameters\AppExit"
  foreach ($k in (Get-ChildItem -Path $appExitPath -ErrorAction SilentlyContinue)) {
    Remove-Item -Path $k.PSPath -Recurse -Force
  }

  # Write AppParameters directly
  $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$svc\Parameters"
  Set-ItemProperty -Path $regPath -Name AppParameters -Value $arg
  Write-Host "  AppParameters set to: $arg"
  reg query "HKLM\SYSTEM\CurrentControlSet\Services\$svc\Parameters" /v AppParameters

  # Start
  sc.exe start $svc | Out-Null
  Write-Host "  started"
}

Write-Host ""
Write-Host "Waiting 20s..."
Start-Sleep -Seconds 20

foreach ($svc in @('deplox-api','deplox-web','deplox-worker','deplox-tunnel')) {
  $state = sc.exe query $svc 2>&1 | Select-String 'STATE' | ForEach-Object { $_.ToString().Trim() }
  Write-Host "  $svc : $state"
}
