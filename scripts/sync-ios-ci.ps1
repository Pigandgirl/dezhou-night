param(
    [string]$Repo = 'Pigandgirl/dezhounight-ios',
    [string]$Message = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP 'dezhounight-ios-sync'

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw 'ssh.exe not found; install OpenSSH Client first.'
}

if (Test-Path $tmp) {
    Remove-Item -Recurse -Force $tmp
}

# Git for Windows may pick its bundled ssh, which cannot resolve github.com on
# some Windows setups. Force the system OpenSSH client.
$ssh = (Get-Command ssh).Source -replace '\\', '/'
$env:GIT_SSH_COMMAND = "$ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes"

Write-Host "Cloning git@github.com:$Repo.git ..."
git clone -q "git@github.com:$Repo.git" $tmp

Remove-Item (Join-Path $tmp 'ios'), (Join-Path $tmp '.github') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $root 'ios') (Join-Path $tmp 'ios')
Copy-Item -Recurse (Join-Path $root '.github') (Join-Path $tmp '.github')
# Build artifacts are deliverables, not source: keep them out of the CI repo.
Remove-Item (Join-Path $tmp 'ios\dist'), (Join-Path $tmp 'ios\build') -Recurse -Force -ErrorAction SilentlyContinue
@('ios/dist/', 'ios/build/', 'build/', '*.xcarchive') |
    Set-Content (Join-Path $tmp '.gitignore') -Encoding utf8

Push-Location $tmp
try {
    git add -A
    $pending = git status --porcelain
    if (-not $pending) {
        Write-Host 'iOS build repo is already up to date.'
        return
    }
    if (-not $Message) {
        $Message = "chore: sync iOS shell $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
    git -c user.name='iOS Sync' -c user.email='ios-sync@local' commit -q -m $Message
    git push origin HEAD:main
    $sha = (git rev-parse --short HEAD)
    Write-Host "Pushed $sha to $Repo"
    gh run list -R $Repo --limit 1
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
