$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$taggerNode = Join-Path $taggerRoot 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $taggerNode)) { throw 'Node.js fehlt. Bitte zuerst Setup.cmd ausführen.' }
Push-Location $taggerRoot
try {
    foreach ($file in @('webext-api.js', 'analysis-settings.mjs', 'preferences.mjs', 'settings-ui.mjs', 'i18n.mjs', 'app.js', 'engine-worker.js', 'static.mjs', 'tagging.mjs', 'sampling.mjs', 'tag-policy.mjs', 'corrections.mjs')) {
        & $taggerNode --check $file
        if ($LASTEXITCODE -ne 0) { throw ('Syntaxprüfung fehlgeschlagen: ' + $file) }
    }
    $testFiles = @(Get-ChildItem -LiteralPath tests -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
    foreach ($file in @(Get-ChildItem -LiteralPath extension -File | Where-Object { $_.Extension -in '.js', '.mjs' }) + @(Get-ChildItem -LiteralPath scripts -Filter 'Build-*.mjs')) {
        & $taggerNode --check $file.FullName
        if ($LASTEXITCODE -ne 0) { throw ('Syntaxprüfung fehlgeschlagen: ' + $file.Name) }
    }
    & $taggerNode --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw 'Tests fehlgeschlagen.' }
    Write-Host 'Alle Prüfungen erfolgreich.'
} finally { Pop-Location }
