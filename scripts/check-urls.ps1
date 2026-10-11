$urls = @(
    'https://deplox.site/',
    'https://event-checkin-ec.deplox.site/',
    'https://glbitm-attendance-system-gas.deplox.site/',
    'https://velvetbrew-coffee-vc.deplox.site/',
    'https://ember-coffee-ec.deplox.site/',
    'http://127.0.0.1:8080/health'
)
foreach ($u in $urls) {
    try {
        $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10 -SkipCertificateCheck
        Write-Host ("{0,-60} {1}" -f $u, $r.StatusCode)
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Host ("{0,-60} ERROR {1}" -f $u, $code)
    }
}