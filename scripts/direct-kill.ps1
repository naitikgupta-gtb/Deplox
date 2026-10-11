$ErrorActionPreference = 'Continue'

Write-Host '--- who has the ports RIGHT NOW ---'
foreach ($port in @(5173, 8080)) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
        $cmd = if ($proc) { $proc.CommandLine } else { '<no-proc>' }
        $name = if ($proc) { $proc.Name } else { '<unknown>' }
        $ppid = if ($proc) { $proc.ParentProcessId } else { 0 }
        Write-Host ("port {0} PID={1} name={2} parent={3} cmd={4}" -f $port, $conn.OwningProcess, $name, $ppid, $cmd)
    } else {
        Write-Host ("port {0} free" -f $port)
    }
}