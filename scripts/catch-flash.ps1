# Bulletproof silent-spawn helper using .NET Process.Start with CreateNoWindow=true.
# Unlike Start-Process -WindowStyle Hidden, this uses the kernel CREATE_NO_WINDOW
# flag which means no console is ever allocated for the child. On Windows 10/11,
# Start-Process -WindowStyle Hidden has a known bug where a console is briefly
# created with the default style and then hidden — visible to the user as a flash.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Start-HiddenProcess {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory = (Get-Location).Path,
        [string]$StdoutLog = $null,
        [string]$StderrLog = $null
    )
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.WorkingDirectory = $WorkingDirectory
    foreach ($a in $ArgumentList) { $psi.ArgumentList.Add($a) }
    if ($StdoutLog)  { $psi.RedirectStandardOutput = $true; $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8 }
    if ($StderrLog)  { $psi.RedirectStandardError  = $true; $psi.StandardErrorEncoding  = [System.Text.Encoding]::UTF8 }
    $proc = [System.Diagnostics.Process]::Start($psi)
    return $proc
}

$Deplox = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'
$logDir = Join-Path $Deplox '.runlogs\services'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

# 1) Stop the watchdog completely
Write-Host '--- 1. stopping watchdog ---'
Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cl -like '*deplox-watchdog.ps1*') {
        Write-Host ("  killing watchdog PID={0}" -f $_.Id)
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}
Disable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Write-Host '  watchdog-ensure task DISABLED.'

# 2) Stop the admin-spawned dev.mjs so we can start fresh via .NET
Write-Host ''
Write-Host '--- 2. killing current dev.mjs children ---'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $cl = $_.CommandLine
    $cl -and ($cl -like '*deplox*' -or $cl -like '*\.pnpm\tsx*' -or $cl -like '*\.pnpm\vite*' -or $cl -like '*scripts\dev.mjs*' -or $cl -like '*preflight.cjs*')
} | ForEach-Object {
    Write-Host ("  killing PID={0}" -f $_.ProcessId)
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
foreach ($port in @(5173, 8080)) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ("  killed port {0} owner PID={1}" -f $port, $c.OwningProcess) }
}
Start-Sleep -Seconds 3

foreach ($port in @(5173, 8080)) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { Write-Host ("  WARN port {0} still owned by PID={1}" -f $port, $c.OwningProcess) }
    else { Write-Host ("  port {0} FREE" -f $port) }
}

# 3) Start dev.mjs via .NET Process.Start (CreateNoWindow=true at kernel level)
Write-Host ''
Write-Host '--- 3. starting dev.mjs via .NET (CreateNoWindow=true) ---'
$devScript = Join-Path $Deplox 'scripts\dev.mjs'
$outLog = Join-Path $logDir 'pnpm-dev.out.log'
$errLog = Join-Path $logDir 'pnpm-dev.err.log'
$proc = Start-HiddenProcess `
    -FilePath 'C:\nvm4w\nodejs\node.exe' `
    -ArgumentList @($devScript) `
    -WorkingDirectory $Deplox `
    -StdoutLog $outLog `
    -StderrLog $errLog
Write-Host ("  dev.mjs started, PID={0}" -f $proc.Id)

Add-Content -Path (Join-Path $logDir 'pnpm-dev.start.log') -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] pnpm dev via .NET Process.Start (CreateNoWindow=true)") -Encoding UTF8

Write-Host 'Waiting 12s for ports...'
Start-Sleep -Seconds 12

Write-Host ''
Write-Host '--- 4. ports after fresh start ---'
foreach ($port in @(5173, 8080)) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
        $cmd = if ($p -and $p.CommandLine) { $p.CommandLine } else { '<no-cmdline>' }
        Write-Host ("  port {0} LISTENING PID={1} cmd={2}" -f $port, $c.OwningProcess, $cmd.Substring(0, [Math]::Min(180, $cmd.Length)))
    } else { Write-Host ("  port {0} NOT listening" -f $port) }
}

Write-Host ''
Write-Host '--- 5. visible windows ---'
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize | Out-String | Write-Host