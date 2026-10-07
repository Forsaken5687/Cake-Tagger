$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $taggerRoot 'runtime/cpython/python.exe'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'assets.json') | ConvertFrom-Json
$runnerAsset = $manifest.development.javascriptRuntime
$javascript = Join-Path $taggerRoot $runnerAsset.path
if (-not (Test-Path -LiteralPath $python)) { throw 'Python is missing. Run Setup.cmd first.' }
if (-not (Test-Path -LiteralPath $javascript)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $javascript) | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri $runnerAsset.url -OutFile $javascript
}
if ((Get-FileHash -LiteralPath $javascript -Algorithm SHA256).Hash -ne $runnerAsset.sha256) { throw 'JavaScript test tool checksum mismatch.' }
Push-Location $taggerRoot
try {
    foreach ($script in @(Get-ChildItem -LiteralPath scripts -Filter '*.ps1')) {
        $parseTokens = $null; $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$parseTokens, [ref]$parseErrors) | Out-Null
        if ($parseErrors.Count) { throw ('PowerShell syntax check failed: ' + $script.Name) }
    }
    & $python -c 'import ast,pathlib; [ast.parse(p.read_text(encoding="utf-8-sig"),filename=str(p)) for folder in ("src/server","scripts","tests") for p in pathlib.Path(folder).rglob("*.py")]'
    if ($LASTEXITCODE -ne 0) { throw 'Python syntax check failed.' }
    & $python -m unittest discover -s tests -p 'test_*.py' -v
    if ($LASTEXITCODE -ne 0) { throw 'Python tests failed.' }
    $testFiles = @(Get-ChildItem -LiteralPath tests -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
    $sources = @(Get-ChildItem -LiteralPath src, extension -Recurse -File | Where-Object { $_.Extension -in '.js', '.mjs' })
    foreach ($file in $sources) {
        & $javascript --check $file.FullName
        if ($LASTEXITCODE -ne 0) { throw ('Syntax check failed: ' + $file.Name) }
    }
    & $javascript --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw 'Browser-module tests failed.' }
    Write-Host 'All checks passed.'
} finally { Pop-Location }
