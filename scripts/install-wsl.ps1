# Self-elevating WSL install script.
# Run this in a regular PowerShell — it will trigger UAC, get admin, install WSL.

# Self-elevation: if not already admin, restart as admin.
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Not admin — relaunching as admin (UAC prompt incoming)..." -ForegroundColor Yellow
    $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $MyInvocation.MyCommand.Path)
    Start-Process PowerShell -Verb RunAs -ArgumentList $args
    exit
}

Write-Host "ADMIN SHELL — running WSL install" -ForegroundColor Cyan
Write-Host ""
Write-Host "Step 1: Enabling WSL feature..." -ForegroundColor Green
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

Write-Host ""
Write-Host "Step 2: Enabling Virtual Machine Platform (required for WSL 2)..." -ForegroundColor Green
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host ""
Write-Host "Step 3: Setting WSL default version to 2..." -ForegroundColor Green
wsl --set-default-version 2

Write-Host ""
Write-Host "Step 4: Installing Ubuntu (default distro)..." -ForegroundColor Green
wsl --install --distribution Ubuntu

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "WSL INSTALL COMPLETE" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "NEXT STEP: Reboot your laptop." -ForegroundColor Yellow
Write-Host "  shutdown /r /t 0   (or Start menu > Power > Restart)"
Write-Host ""
Write-Host "After reboot, Ubuntu setup will ask for username + password."
Write-Host "Then come back and we'll enable Docker Desktop with WSL 2 backend."
Write-Host ""
Read-Host "Press Enter to close this window"