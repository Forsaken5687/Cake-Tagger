$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$taggerNode = Join-Path $taggerRoot 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $taggerNode)) { throw 'Node.js fehlt. Bitte zuerst Setup.cmd ausführen.' }
Push-Location $taggerRoot
try {
    foreach ($file in @('app.js', 'engine-worker.js', 'static.mjs', 'tagging.mjs', 'tag-policy.mjs', 'corrections.mjs')) {
        & $taggerNode --check $file
        if ($LASTEXITCODE -ne 0) { throw ('Syntaxprüfung fehlgeschlagen: ' + $file) }
    }
    & $taggerNode --test tests/corrections.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Tests fehlgeschlagen.' }
    Write-Host 'Alle Prüfungen erfolgreich.'
} finally { Pop-Location }
