$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host '=== ALL TASK SCHEDULER TASKS (filtering deplox, powershell, docker) ==='
Get-ScheduledTask | Where-Object {
    $_.TaskName -match 'deplox|powershell|docker|cloudflare|node|pnpm' -or
    $_.TaskPath -match 'deplox|docker|cloudflare'
} | Select-Object TaskName, TaskPath, State, @{Name='Hidden';Expression={$_.Settings.Hidden}}, @{Name='Args';Expression={($_.Actions[0].Arguments -replace '"','') }} | Format-Table -AutoSize -Wrap | Out-String | Write-Host

Write-Host ''
Write-Host '=== STARTUP FOLDER items ==='
$startup = [Environment]::GetFolderPath('Startup')
Write-Host "Startup folder: $startup"
Get-ChildItem -Path $startup -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host ("  {0}  ({1})" -f $_.Name, $_.FullName)
}

Write-Host ''
Write-Host '=== HKCU Run registry ==='
Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue |
    Get-Member -MemberType NoteProperty | Where-Object { $_.Name -notmatch '^$|^Name|^PS' } |
    ForEach-Object { Write-Host ("  {0}" -f $_.Name) }

Write-Host ''
Write-Host '=== HKLM Run registry ==='
Get-ItemProperty -Path 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue |
    ForEach-Object {
        $_.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } |
        ForEach-Object { Write-Host ("  {0,-30} = {1}" -f $_.Name, $_.Value) }
    }

Write-Host ''
Write-Host '=== Recent pnpm-dev launcher log tail ==='
$log = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\services\pnpm-dev.start.log'
if (Test-Path $log) {
    Get-Content $log -Tail 15 | ForEach-Object { Write-Host $_ }
} else {
    Write-Host '(no log)'
}

Write-Host ''
Write-Host '=== Recent watchdog log full ==='
$log2 = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\watchdog.log'
if (Test-Path $log2) {
    Get-Content $log2 -Tail 15 | ForEach-Object { Write-Host $_ }
} else {
    Write-Host '(no log)'
}

Write-Host ''
Write-Host '=== Recent ensure-watchdog log full ==='
$log3 = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\watchdog-launcher.log'
if (Test-Path $log3) {
    Get-Content $log3 -Tail 15 | ForEach-Object { Write-Host $_ }
} else {
    Write-Host '(no log)'
}

Write-Host ''
Write-Host '=== Boot time ==='
$os = Get-CimInstance Win32_OperatingSystem
Write-Host ("LastBootUpTime: {0}" -f $os.LastBootUpTime)
Write-Host ("Now:            {0}" -f (Get-Date))
Write-Host ("Uptime:         {0}" -f ((Get-Date) - $os.LastBootUpTime))

Write-Host ''
Write-Host '=== Most recent PowerShell processes (last 20) ==='
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Select-Object ProcessId, CreationDate, CommandLine |
    Sort-Object CreationDate -Descending |
    Select-Object -First 10 |
    ForEach-Object {
        $cl = $_.CommandLine.Substring(0, [Math]::Min(180, $_.CommandLine.Length))
        Write-Host ("PID={0,6}  Created={1:HH:mm:ss}  Cmd={2}" -f $_.ProcessId, $_.CreationDate, $cl)
    }