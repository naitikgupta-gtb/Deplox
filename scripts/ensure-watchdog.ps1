# Ensure the deplox watchdog is running. Safe to call repeatedly (idempotent):
# if the watchdog is already running, exit immediately. Otherwise spawn it as
# a detached process and exit so Task Scheduler sees Completed.
#
# Designed to be the body of a 2-min recurring Task Scheduler task. The
# watchdog itself is a long-lived `while(true)` loop, but this script returns
# within a second, so Task Scheduler never sees it as stuck Running.

$ErrorActionPreference = 'SilentlyContinue'
$Deplox = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'
$Watchdog = Join-Path $Deplox 'scripts\deplox-watchdog.ps1'
$LogFile = Join-Path $Deplox '.runlogs\watchdog-launcher.log'
$WatchdogMarker = 'deplox-watchdog.ps1'

if (-not (Test-Path $Watchdog)) {
  Add-Content -Path $LogFile -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] watchdog script missing at $Watchdog") -Encoding UTF8
  exit 1
}

# Is the watchdog already running? Use WMI to find powershell.exe whose
# command line includes our marker script. This avoids the
# Start-Process-creates-an-explorer-child issue.
$existing = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
            Where-Object { $_.CommandLine -like "*$WatchdogMarker*" }
if ($existing) {
  # Already running — nothing to do.
  exit 0
}

# Spawn the watchdog fully detached. New window, no parent inheritance.
Start-Process -FilePath 'powershell.exe' `
  -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$Watchdog`"" `
  -WorkingDirectory $Deplox -WindowStyle Hidden

Add-Content -Path $LogFile -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] watchdog launched (was missing)") -Encoding UTF8
exit 0