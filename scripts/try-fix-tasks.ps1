$ErrorActionPreference = 'Stop'

$Deplox = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'

foreach ($name in @('DeploxDevServer', 'deplox-watchdog-ensure')) {
    Write-Host "=== $name ==="
    try {
        $t = Get-ScheduledTask -TaskName $name -ErrorAction Stop
        $oldArgs = $t.Actions[0].Arguments
        if ($oldArgs -notlike '*-WindowStyle Hidden*') {
            $newArgs = $oldArgs -replace '^-NoProfile', '-NoProfile -WindowStyle Hidden'
            Write-Host "old: $oldArgs"
            Write-Host "new: $newArgs"
            $t.Actions[0].Arguments = $newArgs
            Set-ScheduledTask -InputObject $t | Out-Null
            Write-Host "UPDATED."
        } else {
            Write-Host "already has -WindowStyle Hidden; nothing to do."
        }
        $verify = (Get-ScheduledTask -TaskName $name).Actions[0].Arguments
        Write-Host "verify: $verify"
    } catch {
        Write-Host ("ERROR: {0}" -f $_.Exception.Message)
    }
    Write-Host ''
}