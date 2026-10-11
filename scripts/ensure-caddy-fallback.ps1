# One-shot recovery script. Re-adds the deplox.site catch-all route to
# Caddy if it's missing. Run this if https://deplox.site/ shows a white
# screen while the subdomains (event-checkin-ec.deplox.site etc.) still work.
#
# The catch-all is the route that forwards deplox.site to Vite on port 5173.
# Normally it's added automatically on every API startup by the new
# ensureDeploxSiteCatchAll() in apps/api/src/services/caddy.ts (just shipped
# in commit caddy-fallback-on-startup). This script is a manual safety net
# for when the API hasn't restarted yet but deplox.site is broken.

$ErrorActionPreference = 'Stop'
$body = @'
{
  "handle": [
    { "handler": "reverse_proxy", "upstreams": [ { "dial": "host.docker.internal:5173" } ] }
  ],
  "terminal": true
}
'@

$body | Out-File -FilePath "$PSScriptRoot\..\.runlogs\caddy-fallback.json" -Encoding UTF8

$res = Invoke-WebRequest -Uri 'http://localhost:2019/config/apps/http/servers/srv0/routes/' `
    -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing
Write-Host "POST /routes -> $($res.StatusCode)"

# If it returned 200/201, we're good. If 409, the catch-all already exists.
if ($res.StatusCode -ge 400) {
    Write-Host "(catch-all may already exist — verifying)"
}
$verify = Invoke-WebRequest -Uri 'http://localhost:2019/config/apps/http/servers/srv0/routes/' -UseBasicParsing
$routes = $verify.Content | ConvertFrom-Json
$catchAll = $routes | Where-Object { -not $_.PSObject.Properties['@id'] -and $_.handle.handler -eq 'reverse_proxy' }
if ($catchAll) {
    Write-Host "OK: deplox.site catch-all is present (dial=$($catchAll.handle.upstreams.dial))"
} else {
    Write-Host "WARN: catch-all still not present; check Caddy logs"
}