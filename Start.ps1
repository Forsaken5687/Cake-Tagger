$ErrorActionPreference = 'Stop'
$taggerRoot = $PSScriptRoot
$taggerNode = Join-Path $taggerRoot 'runtime\node.exe'
$taggerServer = Join-Path $taggerRoot 'static.mjs'
if (-not (Test-Path -LiteralPath $taggerNode)) { throw 'The bundled runtime is missing.' }
& $taggerNode (Join-Path $taggerRoot 'scripts/Setup-Native.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Native runtime setup failed. Run Setup.cmd first.' }
Start-Process -FilePath $taggerNode -ArgumentList @('"' + $taggerServer + '"') -WorkingDirectory $taggerRoot -WindowStyle Hidden
