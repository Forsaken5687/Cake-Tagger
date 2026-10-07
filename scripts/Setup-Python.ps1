param([string]$PythonExecutable = 'python')
$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$taggerPython = Join-Path $taggerRoot 'runtime/python/Scripts/python.exe'
& $PythonExecutable -c "import sys; assert sys.version_info[:2] == (3, 12), 'CPython 3.12 is required for the pinned Windows wheels'"
if ($LASTEXITCODE -ne 0) { throw 'Install CPython 3.12 x64 or pass its executable with -PythonExecutable.' }
if (-not (Test-Path -LiteralPath $taggerPython)) {
    & $PythonExecutable -m venv --copies (Join-Path $taggerRoot 'runtime/python')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated Python environment.' }
}
& $taggerPython -m pip install --only-binary=:all: --require-hashes -r (Join-Path $PSScriptRoot 'python-requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Python dependency setup failed.' }
& $taggerPython -c "import numpy, onnxruntime; assert onnxruntime.__version__ == '1.30.0'"
if ($LASTEXITCODE -ne 0) { throw 'Python dependency verification failed.' }
Write-Host 'Python inference is ready. Use Start-Python.cmd after quitting the current backend.'
