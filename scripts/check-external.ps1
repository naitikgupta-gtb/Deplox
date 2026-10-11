$ErrorActionPreference = 'Continue'

# Try with full detail
$urls = @(
    'https://deplox.site/',
    'https://event-checkin-ec.deplox.site/',
    'https://glbitm-attendance-system-gas.deplox.site/',
    'https://velvetbrew-coffee-vc.deplox.site/',
    'https://ember-coffee-ec.deplox.site/'
)
foreach ($u in $urls) {
    Write-Host ("=== $u ===")
    try {
        $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 15 -SkipCertificateCheck -Method GET
        Write-Host ("  status={0}, length={1}" -f $r.StatusCode, $r.RawContentLength)
    } catch {
        $msg = $_.Exception.Message
        $inner = $_.Exception.InnerException
        if ($inner) { $msg += " | inner: " + $inner.Message }
        Write-Host ("  ERROR: {0}" -f $msg)
    }
}

# Caddy container status
Write-Host ''
Write-Host '--- Caddy container ---'
docker ps -a --filter 'name=infra-caddy-1' --format '{{.Names}} {{.Status}} {{.Ports}}' 2>&1 | Out-String | Write-Host

# Caddy logs tail
Write-Host ''
Write-Host '--- Caddy logs tail ---'
docker logs infra-caddy-1 --tail 10 2>&1 | Out-String | Write-Host