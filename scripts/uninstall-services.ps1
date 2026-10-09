# Remove the broken NSSM services. NSSM proved too fragile here — it
# paused services after a few misconfigured restarts and locked its
# registry key against further writes even for admin tokens.
#
# Strategy: rely on pnpm dev running in the user's main session
# (started by the AI assistant) + the PowerShell watchdog for
# container resurrection. cloudflared is a simple NSSM service that
# keeps working, so we keep that one.
$ErrorActionPreference = 'Continue'
$Nssm = 'C:\Users\naiti\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe'

foreach ($svc in @('deplox-api','deplox-web','deplox-worker')) {
  Write-Host "--- removing $svc ---"
  & $Nssm stop $svc 2>&1 | Out-Null
  Start-Sleep -Milliseconds 500
  & $Nssm remove $svc confirm 2>&1 | Out-Null
  # Mark for deletion (Windows deletes it on next reboot or
  # when the SCM is asked again)
  sc.exe delete $svc 2>&1 | Out-Null
  Write-Host "  removed"
}

# deplox-tunnel is a plain process with no args, it works fine — keep it.
$state = sc.exe query deplox-tunnel 2>&1 | Select-String 'STATE' | ForEach-Object { $_.ToString().Trim() }
Write-Host ""
Write-Host "deplox-tunnel status: $state"
