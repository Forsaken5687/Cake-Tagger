param([switch]$IncludeUncommitted)
$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $taggerRoot 'runtime/cpython/python.exe') (Join-Path $PSScriptRoot 'package.py')
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed.' }
