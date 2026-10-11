$ErrorActionPreference = 'Stop'

function Snapshot-Windows {
    param([string]$Tag)
    $photos = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
              Select-Object Id, ProcessName, MainWindowTitle
    Write-Host "--- snapshot [$Tag] ---"
    $photos | Format-Table -AutoSize | Out-String | Write-Host
    return $photos
}

$snap0 = Snapshot-Windows 'BEFORE'

Write-Host ''
Write-Host 'Triggering DeploxDevServer now...'
schtasks /Run /TN 'DeploxDevServer' | Out-Null
Start-Sleep -Milliseconds 300
$snap1 = Snapshot-Windows 'AFTER DeploxDevServer'
$new1 = $snap1 | Where-Object { -not ($snap0 | Where-Object { $_.Id -eq $_.Id -and $_.MainWindowTitle -eq $_.MainWindowTitle }) }
if ($new1) {
    Write-Host 'NEW WINDOWS APPEARED (DeploxDevServer):'
    $new1 | Format-Table -AutoSize | Out-String | Write-Host
} else {
    Write-Host 'OK no new windows from DeploxDevServer.'
}

Write-Host ''
Write-Host 'Triggering deplox-watchdog-ensure now...'
schtasks /Run /TN 'deplox-watchdog-ensure' | Out-Null
Start-Sleep -Milliseconds 300
$snap2 = Snapshot-Windows 'AFTER watchdog-ensure'
$new2 = $snap2 | Where-Object { -not ($snap1 | Where-Object { $_.Id -eq $_.Id -and $_.MainWindowTitle -eq $_.MainWindowTitle }) }
if ($new2) {
    Write-Host 'NEW WINDOWS APPEARED (watchdog-ensure):'
    $new2 | Format-Table -AutoSize | Out-String | Write-Host
} else {
    Write-Host 'OK no new windows from watchdog-ensure.'
}

Write-Host ''
Write-Host 'Waiting 3s, then re-snapshot (covers any deferred window)...'
Start-Sleep -Seconds 3
$snap3 = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
         Select-Object Id, ProcessName, MainWindowTitle
$new3 = $snap3 | Where-Object { -not ($snap0 | Where-Object { $_.Id -eq $_.Id -and $_.MainWindowTitle -eq $_.MainWindowTitle }) }
if ($new3) {
    Write-Host 'NEW WINDOWS APPEARED (after 3s):'
    $new3 | Format-Table -AutoSize | Out-String | Write-Host
} else {
    Write-Host 'OK still no new windows after 3s.'
}