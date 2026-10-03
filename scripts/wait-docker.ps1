$env:Path = "$env:Path;C:\Program Files\Docker\Docker\resources\bin"

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        docker info *> $null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
    } catch {
        # swallow
    }
    Write-Host ("attempt {0}: not ready" -f $i)
    Start-Sleep -Seconds 3
}

if ($ready) {
    Write-Host ("READY after {0} tries" -f $i)
    docker info | Select-Object -First 25
} else {
    Write-Host "Engine did not start in 90s"
    exit 1
}