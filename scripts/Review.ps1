$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Start.ps1')


    $reviewURL = 'http://127.0.0.1:8765/review.html'
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $response = Invoke-WebRequest -Uri $reviewURL -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch {}
        Start-Sleep -Milliseconds 300
    }
    if (-not $ready) { throw 'The review page is unavailable. Restart the local service after updating.' }
    Start-Process -FilePath $reviewURL
