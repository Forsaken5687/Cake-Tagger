param([int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $taggerRoot 'runtime/cpython/python.exe'
if (-not (Test-Path -LiteralPath $python)) { & (Join-Path $PSScriptRoot 'Setup.ps1') }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid local port.' }
# Reuse only a live, authenticated service identified by its saved session.
$sessionFile = Join-Path $taggerRoot 'data/session.json'
if (Test-Path -LiteralPath $sessionFile) {
    try {
        $session = Get-Content -Raw -LiteralPath $sessionFile | ConvertFrom-Json
        $pattern = '^http://127\.0\.0\.1:' + $Port + '/#[a-f0-9]{48}$'
        if ($session.url -match $pattern) {
            $token = ([uri]$session.url).Fragment.Substring(1)
            $status = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $Port + '/api/status') -Headers @{Authorization=('Bearer ' + $token)} -TimeoutSec 2
            if ($status.app -eq 'cake-tagger-browser-v1') {
                if ($status.backendImplementation -ne 'python') { throw 'Quit the running service before starting the updated version.' }
                Write-Host 'Cake Tagger is already running.'
                return
            }
        }
    } catch { if ($_.Exception.Message -eq 'Quit the running service before starting the updated version.') { throw } }
}
$listener = New-Object Net.Sockets.TcpClient
try { $listener.Connect('127.0.0.1', $Port); throw 'The local port is occupied. Quit the running service first.' }
catch [Net.Sockets.SocketException] { }
finally { $listener.Dispose() }
Start-Process -FilePath $python -ArgumentList @('-m', 'server', '--root', ('"' + $taggerRoot + '"'), '--port', $Port) -WorkingDirectory $taggerRoot -WindowStyle Hidden
