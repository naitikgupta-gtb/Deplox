$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Deplox = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'
$logDir = Join-Path $Deplox '.runlogs\services'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

# 1) Stop watchdog so it doesn't keep spawning
Write-Host '--- 1. stop watchdog ---'
Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cl -like '*deplox-watchdog.ps1*') {
        Write-Host ("  kill watchdog PID={0}" -f $_.Id)
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}
Disable-ScheduledTask -TaskName 'deplox-watchdog-ensure' -ErrorAction SilentlyContinue | Out-Null
Write-Host '  watchdog DISABLED.'

# 2) Wait for ports to free
Start-Sleep -Seconds 2

# 3) Aggressive kill of any node/cmd with deplox content
Write-Host ''
Write-Host '--- 2. aggressive kill ---'
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='cmd.exe'" | Where-Object {
    $cl = $_.CommandLine
    $cl -and ($cl -like '*deplox*' -or $cl -like '*\.pnpm\tsx*' -or $cl -like '*\.pnpm\vite*' -or `
              $cl -like '*node_modules\.bin\tsx*' -or $cl -like '*node_modules\.bin\vite*' -or `
              $cl -like '*scripts\dev.mjs*' -or $cl -like '*preflight.cjs*' -or $cl -like '*pnpm-dev.mjs*')
}
Write-Host ("  found {0} processes" -f $procs.Count)
foreach ($p in $procs) {
    Write-Host ("    kill PID={0} {1}" -f $p.ProcessId, $p.Name)
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

# Also anyone holding 5173/8080
foreach ($port in @(5173, 8080)) {
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host ("    port {0} owner PID={1}" -f $port, $_.OwningProcess)
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 4

Write-Host ''
Write-Host '--- 3. verify ports free ---'
foreach ($port in @(5173, 8080)) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { Write-Host ("  port {0} STILL owned by PID={1}" -f $port, $c.OwningProcess) }
    else { Write-Host ("  port {0} FREE" -f $port) }
}

# 4) Start dev.mjs via .NET Process.Start (CreateNoWindow=true at kernel level)
Write-Host ''
Write-Host '--- 4. start dev.mjs via .NET ---'
$devScript = Join-Path $Deplox 'scripts\dev.mjs'
$outLog = Join-Path $logDir 'pnpm-dev.out.log'
$errLog = Join-Path $logDir 'pnpm-dev.err.log'

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'C:\nvm4w\nodejs\node.exe'
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$psi.WorkingDirectory = $Deplox
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
$psi.Arguments = '"' + $devScript + '"'

# Wire output to log files via async event handlers
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$outFS = [System.IO.File]::Create($outLog)
$errFS = [System.IO.File]::Create($errLog)
$proc.add_OutputDataReceived({ if ($_.Data) { $sw = [System.IO.StreamWriter]::new($outFS, [System.Text.Encoding]::UTF8); $sw.WriteLine($_.Data); $sw.Flush() } })
$proc.add_ErrorDataReceived({ if ($_.Data) { $sw = [System.IO.StreamWriter]::new($errFS, [System.Text.Encoding]::UTF8); $sw.WriteLine($_.Data); $sw.Flush() } })

$started = $proc.Start()
if (-not $started) { Write-Host '  FAILED to start'; exit 1 }
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()
Write-Host ("  dev.mjs started, PID={0}" -f $proc.Id)

Add-Content -Path (Join-Path $logDir 'pnpm-dev.start.log') -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] pnpm dev via .NET Process (CreateNoWindow=true, async I/O)") -Encoding UTF8

Write-Host '  Waiting 12s for ports...'
Start-Sleep -Seconds 12

Write-Host ''
Write-Host '--- 5. ports now ---'
foreach ($port in @(5173, 8080)) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) {
        $pp = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
        $cmd = if ($pp -and $pp.CommandLine) { $pp.CommandLine } else { '<no-cmdline>' }
        Write-Host ("  port {0} LISTENING PID={1} cmd={2}" -f $port, $c.OwningProcess, $cmd.Substring(0, [Math]::Min(180, $cmd.Length)))
    } else { Write-Host ("  port {0} NOT listening" -f $port) }
}

Write-Host ''
Write-Host '--- 6. dev-related procs ---'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*deplox*' -or $_.CommandLine -like '*\.pnpm\*' -or $_.CommandLine -like '*scripts\dev.mjs*') } | Select-Object ProcessId, ParentProcessId, @{N='Cmd';E={ $_.CommandLine.Substring(0, [Math]::Min(140, $_.CommandLine.Length)) }} | Format-Table -AutoSize -Wrap | Out-String | Write-Host

Write-Host ''
Write-Host '--- 7. visible windows ---'
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize | Out-String | Write-Host