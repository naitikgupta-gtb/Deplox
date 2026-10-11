$ErrorActionPreference = 'Continue'

# Disable cert check
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# Try with HttpClient
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
        $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $u)
        $client = [System.Net.Http.HttpClient]::new()
        $client.Timeout = [TimeSpan]::FromSeconds(15)
        $task = $client.SendAsync($req)
        $task.Wait()
        $resp = $task.Result
        Write-Host ("  status={0}" -f [int]$resp.StatusCode)
        $resp.Dispose()
    } catch {
        Write-Host ("  ERROR: {0}" -f $_.Exception.Message)
    }
}