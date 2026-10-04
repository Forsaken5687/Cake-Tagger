$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$taggerNode = Join-Path $taggerRoot 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $taggerNode)) { throw 'Node.js is missing. Run Setup.cmd first.' }
Push-Location $taggerRoot
try {
    foreach ($file in @('webext-api.js', 'analysis-settings.mjs', 'preferences.mjs', 'settings-ui.mjs', 'i18n.mjs', 'messages.mjs', 'session-url.mjs', 'app.js', 'engine-worker.js', 'static.mjs', 'tagging.mjs', 'sampling.mjs', 'tag-policy.mjs', 'corrections.mjs')) {
        & $taggerNode --check $file
        if ($LASTEXITCODE -ne 0) { throw ('Syntax check failed: ' + $file) }
    }
    $testFiles = @(Get-ChildItem -LiteralPath tests -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
    foreach ($file in @(Get-ChildItem -LiteralPath extension -File | Where-Object { $_.Extension -in '.js', '.mjs' }) + @(Get-ChildItem -LiteralPath scripts -Filter 'Build-*.mjs')) {
        & $taggerNode --check $file.FullName
        if ($LASTEXITCODE -ne 0) { throw ('Syntax check failed: ' + $file.Name) }
    }
    & $taggerNode --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
    Write-Host 'All checks passed.'
} finally { Pop-Location }
