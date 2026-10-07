param([ValidateRange(1,65535)][int]$Port=8765)
$ErrorActionPreference='Stop'
$taggerRoot=Split-Path -Parent $PSScriptRoot
$taggerNode=Join-Path $taggerRoot 'runtime/node.exe'
$taggerPython=Join-Path $taggerRoot 'runtime/python/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taggerPython)) { throw 'Run scripts/Setup-Python.ps1 first with a CPython 3.12 x64 executable.' }
& $taggerPython -c "import numpy, onnxruntime; assert onnxruntime.__version__ == '1.30.0'"
if ($LASTEXITCODE -ne 0) { throw 'Run scripts/Setup-Python.ps1 to restore the Python dependencies.' }
$taggerProbe=[Net.Sockets.TcpClient]::new()
try { $taggerProbe.Connect('127.0.0.1',$Port); throw "Port $Port is already in use. Quit the running backend before starting the Python variant." }
catch [Net.Sockets.SocketException] { } finally { $taggerProbe.Dispose() }
$taggerOldPort=$env:CAKE_TAGGER_PORT
$taggerOldBrowser=$env:CAKE_TAGGER_NO_BROWSER
try {
    $env:CAKE_TAGGER_PORT=[string]$Port
    $env:CAKE_TAGGER_NO_BROWSER='1'
    Start-Process -FilePath $taggerNode -ArgumentList @(('"'+(Join-Path $taggerRoot 'src/server/server.mjs')+'"'),'--python') -WorkingDirectory $taggerRoot -WindowStyle Hidden
} finally { $env:CAKE_TAGGER_PORT=$taggerOldPort; $env:CAKE_TAGGER_NO_BROWSER=$taggerOldBrowser }
Write-Host 'Python variant started. Use the existing Cake Tagger extension; settings are separate.'
