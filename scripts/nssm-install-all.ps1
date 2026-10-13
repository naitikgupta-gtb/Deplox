<#
.SYNOPSIS
  Install BOTH NSSM services for DEPLOX (DeploxDev + DeploxWatchdog).

.DESCRIPTION
  Convenience wrapper. Each service can also be installed individually via
  nssm-install-deploxdev.ps1 or nssm-install-watchdog.ps1.

  REQUIRES: Run as Administrator.
#>

$ErrorActionPreference = 'Continue'
$Repo = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'

# Check elevation
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "This script must be run as Administrator. Right-click PowerShell, choose 'Run as administrator', then re-run."
}

Write-Host "==== installing DeploxDev ===="
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo 'scripts\nssm-install-deploxdev.ps1')
if ($LASTEXITCODE -ne 0) { throw "DeploxDev install failed" }

Write-Host ""
Write-Host "==== installing DeploxWatchdog ===="
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo 'scripts\nssm-install-watchdog.ps1')
if ($LASTEXITCODE -ne 0) { throw "DeploxWatchdog install failed" }

Write-Host ""
Write-Host "==== status ===="
Get-Service DeploxDev, DeploxWatchdog | Format-Table Name, Status, StartType -AutoSize
Write-Host ""
Write-Host "Done. Test by rebooting the box -- both services should come back automatically."
