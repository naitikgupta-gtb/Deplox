$ErrorActionPreference = 'Continue'

# Watch for new windows appearing over 60 seconds, logging each
$log = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\window-flash.log'
$known = @{}
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
    $known[$_.Id] = $_.MainWindowTitle
}
Write-Host ("starting with {0} known windows" -f $known.Count)

for ($i = 0; $i -lt 60; $i++) {
    $cur = @{}
    Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
        $cur[$_.Id] = @{
            Title = $_.MainWindowTitle
            Process = $_.ProcessName
        }
    }
    foreach ($k in $cur.Keys) {
        if (-not $known.ContainsKey($k)) {
            $ts = Get-Date -Format 'HH:mm:ss.fff'
            $line = "[$ts] NEW window PID=$k name=$($cur[$k].Process) title='$($cur[$k].Title)'"
            Write-Host $line
            Add-Content -Path $log -Value $line -Encoding UTF8
        }
    }
    $known = @{}
    foreach ($k in $cur.Keys) { $known[$k] = $cur[$k].Title }
    Start-Sleep -Seconds 1
}
Write-Host "DONE"