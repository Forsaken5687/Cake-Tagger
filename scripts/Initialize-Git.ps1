$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
Push-Location $taggerRoot
try {
    if (-not (Test-Path -LiteralPath '.git')) {
        & git init -b main
        if ($LASTEXITCODE -ne 0) { throw 'Git konnte nicht eingerichtet werden.' }
    }
    # --quiet returns a failure status for an unborn branch, without an error message.
    $headCommit = & git rev-parse --verify --quiet 'HEAD^{commit}'
    $hasCommit = $LASTEXITCODE -eq 0 -and $headCommit -match '^[a-f0-9]{40,64}$'
    if ($hasCommit) { Write-Host 'Git enthält bereits einen Commit. Keine Änderungen vorgenommen.'; return }
    if (Get-Process git -ErrorAction SilentlyContinue) { throw 'Ein Git-Prozess läuft noch. Bitte schließen und erneut versuchen.' }
    foreach ($lock in @('.git/config.lock', '.git/index.lock')) {
        if (Test-Path -LiteralPath $lock) { Remove-Item -LiteralPath $lock }
    }
    & git config --local core.autocrlf false
    if ($LASTEXITCODE -ne 0) { throw 'Git-Schreibzugriff fehlt.' }
    & git add --all
    if ($LASTEXITCODE -ne 0) { throw 'Dateien konnten nicht vorgemerkt werden.' }
    & git commit -m 'Initialize Cake Tagger with local analysis and sharing workflow'
    if ($LASTEXITCODE -ne 0) { throw 'Commit fehlgeschlagen. Bitte Git-Benutzername und E-Mail prüfen.' }
    Write-Host 'Git ist eingerichtet. Es wurde nichts veröffentlicht.'
} finally { Pop-Location }
