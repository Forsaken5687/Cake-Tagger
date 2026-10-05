$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$taggerNode = Join-Path $taggerRoot 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $taggerNode)) { throw 'Node.js is missing. Run Setup.cmd first.' }
Push-Location $taggerRoot
try {
    foreach ($script in @(Get-ChildItem -LiteralPath scripts -Filter '*.ps1')) {
        $parseTokens = $null; $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$parseTokens, [ref]$parseErrors) | Out-Null
        if ($parseErrors.Count) { throw ('PowerShell syntax check failed: ' + $script.Name) }
    }
    $testFiles = @(Get-ChildItem -LiteralPath tests -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
    $sources = @(Get-ChildItem -LiteralPath src, extension, scripts -Recurse -File | Where-Object { $_.Extension -in '.js', '.mjs' })
    foreach ($file in $sources) {
        & $taggerNode --check $file.FullName
        if ($LASTEXITCODE -ne 0) { throw ('Syntax check failed: ' + $file.Name) }
    }
    & $taggerNode --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
    Write-Host 'All checks passed.'
} finally { Pop-Location }
