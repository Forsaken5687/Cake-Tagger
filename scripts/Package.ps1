param([switch]$IncludeUncommitted)
$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Push-Location $taggerRoot
try {
    $tracked = if ($IncludeUncommitted) { @(& git -c core.quotepath=false ls-files --cached --others --exclude-standard) } else { @(& git -c core.quotepath=false ls-files) }
    if ($LASTEXITCODE -ne 0 -or $tracked.Count -eq 0) { throw 'Keine versionierten Projektdateien gefunden.' }
    # Use the versioned allowlist, never copy the working folder recursively.
    $forbidden = '^(data|outputs|work|feedback|\.git|\.codex|\.agents)/|\.(mp4|m4v|webm|mov|mkv|avi|bak|log|tmp)$'
    if ($tracked | Where-Object { $_ -match $forbidden }) { throw 'Private oder generierte Dateien im Git-Index. Paket abgebrochen.' }
    $manifest = Get-Content -Raw -LiteralPath 'scripts/assets.json' | ConvertFrom-Json
    foreach ($asset in $manifest.assets) {
        $source = Join-Path $taggerRoot $asset.path
        if (-not (Test-Path -LiteralPath $source) -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $asset.sha256) { throw ('Abhängigkeit fehlt oder wurde verändert: ' + $asset.path + '. Bitte Setup.cmd ausführen.') }
    }
    New-Item -ItemType Directory -Force -Path 'outputs' | Out-Null
    $output = Join-Path $taggerRoot 'outputs/Cake-Tagger.zip'
    $temporary = $output + '.tmp'
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::Create)
    $archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $files = @($tracked + @($manifest.assets | ForEach-Object { $_.path }) | Sort-Object -Unique)
        foreach ($relative in $files) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $taggerRoot $relative), ('Cake-Tagger/' + $relative.Replace('\', '/')), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $archive.Dispose(); $stream.Dispose() }
    Move-Item -LiteralPath $temporary -Destination $output -Force
    Write-Host ('Paket erstellt: ' + $output)
} finally { Pop-Location }
