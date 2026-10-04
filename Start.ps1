$ErrorActionPreference = 'Stop'
$taggerRoot = $PSScriptRoot
$taggerNode = Join-Path $taggerRoot 'runtime\node.exe'
$taggerServer = Join-Path $taggerRoot 'static.mjs'
if (-not (Test-Path -LiteralPath $taggerNode)) { throw 'The bundled runtime is missing.' }
Start-Process -FilePath $taggerNode -ArgumentList @('"' + $taggerServer + '"') -WorkingDirectory $taggerRoot -WindowStyle Hidden
