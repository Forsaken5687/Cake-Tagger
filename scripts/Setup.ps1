$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'assets.json') | ConvertFrom-Json
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
foreach ($asset in $manifest.assets) {
    $target = Join-Path $taggerRoot $asset.path
    if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $asset.sha256) {
        Write-Host ('Verified: ' + $asset.path)
        continue
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    $temporary = $target + '.download'
    try {
        Write-Host ('Downloading: ' + $asset.path)
        Invoke-WebRequest -UseBasicParsing -Uri $asset.url -OutFile $temporary
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $asset.sha256) { throw ('Checksum mismatch: ' + $asset.path) }
        Move-Item -LiteralPath $temporary -Destination $target -Force
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
}
Write-Host 'All dependencies are ready. Run Start.cmd to open the application.'
