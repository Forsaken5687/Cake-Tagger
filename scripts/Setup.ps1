$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'assets.json') | ConvertFrom-Json
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$assets = @($manifest.assets) + @($manifest.python.runtime) + @($manifest.python.wheels | ForEach-Object { [pscustomobject]@{path=('runtime/archives/' + $_.file);url=$_.url;sha256=$_.sha256} })
foreach ($asset in $assets) {
    $target = Join-Path $taggerRoot $asset.path
    if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $asset.sha256) { continue }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    $temporary = $target + '.download'
    try {
        Write-Host ('Downloading: ' + $asset.path)
        Invoke-WebRequest -UseBasicParsing -Uri $asset.url -OutFile $temporary
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $asset.sha256) { throw ('Checksum mismatch: ' + $asset.path) }
        Move-Item -LiteralPath $temporary -Destination $target -Force
    } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
}
$runtime = Join-Path $taggerRoot 'runtime/cpython'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
Expand-Archive -LiteralPath (Join-Path $taggerRoot $manifest.python.runtime.path) -DestinationPath $runtime -Force
# Isolated search paths exclude user-site packages and PYTHONPATH.
$searchPaths = @('python313.zip', '.', 'Lib/site-packages', '../../src/server', '../../scripts', '../../tests', 'import site')
$searchPaths | Set-Content -LiteralPath (Join-Path $runtime 'python313._pth') -Encoding ascii
$python = Join-Path $runtime 'python.exe'
& $python (Join-Path $PSScriptRoot 'install_runtime.py')
if ($LASTEXITCODE -ne 0) { throw 'Python dependency setup failed.' }
& $python -c 'import onnxruntime,numpy; assert onnxruntime.__version__ == "1.30.0"; assert numpy.__version__ == "2.4.4"'
if ($LASTEXITCODE -ne 0) { throw 'Python runtime verification failed.' }
Write-Host 'Dependencies are ready. Run Start.cmd to start the local service.'
