$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
Push-Location $taggerRoot
try {
    if (-not (Test-Path -LiteralPath '.git')) {
        & git init -b main
        if ($LASTEXITCODE -ne 0) { throw 'Git initialization failed.' }
    }
    # --quiet returns a failure status for an unborn branch, without an error message.
    $headCommit = & git rev-parse --verify --quiet 'HEAD^{commit}'
    $hasCommit = $LASTEXITCODE -eq 0 -and $headCommit -match '^[a-f0-9]{40,64}$'
    if ($hasCommit) { Write-Host 'Git already contains a commit. No changes made.'; return }
    if (Get-Process git -ErrorAction SilentlyContinue) { throw 'A Git process is still running. Close it and try again.' }
    foreach ($lock in @('.git/config.lock', '.git/index.lock')) {
        # A process check cannot prove that a lock is abandoned: another Git process may start.
        if (Test-Path -LiteralPath $lock) { throw ('Git lock exists: ' + $lock + '. Check for an active Git operation before removing an abandoned lock manually.') }
    }
    & git config --local core.autocrlf false
    if ($LASTEXITCODE -ne 0) { throw 'Git write access is unavailable.' }
    & git add --all
    if ($LASTEXITCODE -ne 0) { throw 'Could not stage files.' }
    & git commit -m 'Initialize Cake Tagger with local analysis and sharing workflow'
    if ($LASTEXITCODE -ne 0) { throw 'Commit failed. Check the Git user name and email.' }
    Write-Host 'Git is initialized. Nothing has been published.'
} finally { Pop-Location }
