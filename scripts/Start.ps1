param([switch]$Review)
$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$taggerNode = Join-Path $taggerRoot 'runtime\node.exe'
$env:CAKE_TAGGER_NO_BROWSER = '1'
$taggerServer = Join-Path $taggerRoot 'src/server/server.mjs'
if (-not (Test-Path -LiteralPath $taggerNode)) { throw 'The bundled runtime is missing.' }
& $taggerNode (Join-Path $taggerRoot 'scripts/Setup-Native.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Native runtime setup failed. Run Setup.cmd first.' }
Start-Process -FilePath $taggerNode -ArgumentList @('"' + $taggerServer + '"') -WorkingDirectory $taggerRoot -WindowStyle Hidden

if ($Review) {
    $reviewURL = 'http://127.0.0.1:8765/review.html'
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $response = Invoke-WebRequest -Uri $reviewURL -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch {}
        Start-Sleep -Milliseconds 300
    }
    if (-not $ready) { throw 'The review page is unavailable. Restart the local service after updating.' }
    Start-Process -FilePath $reviewURL
}
