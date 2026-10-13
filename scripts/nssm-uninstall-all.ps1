<#
.SYNOPSIS
  Uninstall both NSSM services (DeploxDev + DeploxWatchdog).
  Stops each service, then removes it from the SCM. Idempotent.

  REQUIRES: Run as Administrator.
#>

$ErrorActionPreference = 'Continue'
$Services = @('DeploxDev','DeploxWatchdog')

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw "Run as Administrator." }

$nssm = (Get-Command nssm.exe -ErrorAction Stop).Source

foreach ($svc in $Services) {
    $existing = Get-Service -Name $svc -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Host "[$svc] not installed -- skipping"
        continue
    }
    Write-Host "[$svc] stopping"
    & nssm stop $svc 2>$null | Out-Null
    $timeout = (Get-Date).AddSeconds(15)
    while ((Get-Service -Name $svc -ErrorAction SilentlyContinue).Status -eq 'Running' -and (Get-Date) -lt $timeout) {
        Start-Sleep -Seconds 1
    }
    Write-Host "[$svc] removing"
    & nssm remove $svc confirm | Out-Null
}

Write-Host ""
Write-Host "Done. Verify with: Get-Service DeploxDev, DeploxWatchdog"
