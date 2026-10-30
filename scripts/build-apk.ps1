param(
    [switch]$SkipBuild,
    [switch]$NoBump,
    [string]$VersionName
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$versionFile = Join-Path $root 'android\version.json'

if (Test-Path $versionFile) {
    $versionInfo = Get-Content $versionFile -Raw | ConvertFrom-Json
} else {
    $versionInfo = [pscustomobject]@{ versionCode = 1; versionName = '1.0.0' }
}

$currentCode = [int]$versionInfo.versionCode
$currentName = [string]$versionInfo.versionName

if ($VersionName) {
    $versionName = $VersionName
    $versionCode = $currentCode + 1
} elseif ($NoBump) {
    $versionCode = $currentCode
    $versionName = $currentName
} else {
    $versionCode = $currentCode + 1
    $parts = @($currentName.Split('.'))
    while ($parts.Count -lt 3) { $parts += '0' }
    $parts[2] = [string]([int]$parts[2] + 1)
    $versionName = $parts -join '.'
}

$env:APP_VERSION = $versionName
$env:APP_VERSION_CODE = [string]$versionCode
$apkName = "DezhouNight-$versionName.apk"
Write-Host "Version: $versionName (versionCode $versionCode)"

function Resolve-JavaHome {
    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
        return $env:JAVA_HOME
    }
    $candidates = @()
    $candidates += 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
    Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { $candidates += $_.FullName }
    foreach ($path in $candidates) {
        if (Test-Path (Join-Path $path 'bin\javac.exe')) { return $path }
    }
    throw 'JDK not found. Install JDK 17+ or set JAVA_HOME.'
}

function Resolve-AndroidSdk {
    $candidates = @()
    if ($env:ANDROID_SDK_ROOT) { $candidates += $env:ANDROID_SDK_ROOT }
    if ($env:ANDROID_HOME) { $candidates += $env:ANDROID_HOME }
    $candidates += 'C:\Users\17462\AppData\Local\Temp\camel-android\sdk'
    $candidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
    foreach ($path in $candidates) {
        if ($path -and (Test-Path (Join-Path $path 'platforms\android-35\android.jar'))) {
            return $path
        }
    }
    throw 'Android SDK with android-35 not found. Set ANDROID_SDK_ROOT.'
}

$javaHome = Resolve-JavaHome
$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;$env:Path"

$sdk = Resolve-AndroidSdk
$buildTools = Join-Path $sdk 'build-tools\35.0.0'
$androidJar = Join-Path $sdk 'platforms\android-35\android.jar'
foreach ($tool in @('aapt2.exe', 'zipalign.exe', 'd8.bat', 'apksigner.bat')) {
    if (-not (Test-Path (Join-Path $buildTools $tool))) {
        throw "Missing build tool: $tool ($buildTools)"
    }
}

$main = Join-Path $root 'android\app\src\main'
$assets = Join-Path $main 'assets'
$build = Join-Path $root 'android\build'
$gen = Join-Path $build 'gen'
$classes = Join-Path $build 'classes'
$dexDir = Join-Path $build 'dex'

if (-not $SkipBuild) {
    Push-Location $root
    try {
        Write-Host '==> Build web single file'
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
    } finally {
        Pop-Location
    }
}

$distHtml = Join-Path $root 'dist\index.html'
if (-not (Test-Path $distHtml)) { throw 'dist/index.html is missing, run npm run build first' }

Remove-Item $build -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $gen, $classes, $dexDir, $assets | Out-Null

Write-Host '==> Generate launcher icons'
& (Join-Path $PSScriptRoot 'make-icons.ps1')

Copy-Item $distHtml (Join-Path $assets 'index.html') -Force
$distVoice = Join-Path $root 'dist\voice'
$nestedVoice = Join-Path $assets 'voice'
if (Test-Path $nestedVoice) { Remove-Item $nestedVoice -Recurse -Force }
if (Test-Path $distVoice) {
    # 扁平命名：Windows aapt2 在 ZIP 中可能把子目录写成反斜杠，Android 无法按 /assets/voice/x 读取。
    Get-ChildItem $distVoice -Directory | ForEach-Object {
        $profile = $_.Name
        Get-ChildItem $_.FullName -Filter *.mp3 | ForEach-Object {
            Copy-Item $_.FullName (Join-Path $assets "voice_${profile}_$($_.Name)") -Force
        }
    }
}

Write-Host '==> Compile resources'
& (Join-Path $buildTools 'aapt2.exe') compile --dir (Join-Path $main 'res') -o (Join-Path $build 'res.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }

& (Join-Path $buildTools 'aapt2.exe') link `
    -o (Join-Path $build 'base.apk') `
    -I $androidJar `
    --manifest (Join-Path $main 'AndroidManifest.xml') `
    --java $gen `
    -A $assets `
    -R (Join-Path $build 'res.zip') `
    --min-sdk-version 26 `
    --target-sdk-version 35 `
    --version-code $versionCode `
    --version-name $versionName `
    --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

Write-Host '==> Compile Java'
$javaFiles = @()
$javaFiles += (Get-ChildItem $gen -Recurse -Filter *.java | ForEach-Object FullName)
$javaFiles += (Get-ChildItem (Join-Path $main 'java') -Recurse -Filter *.java | ForEach-Object FullName)
& (Join-Path $javaHome 'bin\javac.exe') `
    -encoding UTF-8 -source 17 -target 17 -Xlint:-options `
    -cp $androidJar -d $classes $javaFiles
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

Write-Host '==> Build dex'
& (Join-Path $javaHome 'bin\jar.exe') cf (Join-Path $build 'classes.jar') -C $classes .
& (Join-Path $buildTools 'd8.bat') --release --min-api 26 --lib $androidJar --output $dexDir (Join-Path $build 'classes.jar')
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

Write-Host '==> Merge dex and resources'
$appApk = Join-Path $build 'app.apk'
Copy-Item (Join-Path $build 'base.apk') $appApk -Force
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($appApk, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, (Join-Path $dexDir 'classes.dex'), 'classes.dex',
        [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally {
    $zip.Dispose()
}

$check = [System.IO.Compression.ZipFile]::OpenRead($appApk)
try {
    $arsc = $check.Entries | Where-Object { $_.FullName -eq 'resources.arsc' }
    if ($arsc) {
        if ($arsc.CompressedLength -eq $arsc.Length) {
            $state = 'STORED'
        } else {
            $state = 'DEFLATED'
        }
        Write-Host "resources.arsc: $state"
        if ($state -ne 'STORED') { throw 'resources.arsc is compressed; Android 11+ cannot install' }
    }
} finally {
    $check.Dispose()
}

Write-Host '==> Align'
$aligned = Join-Path $build 'app-aligned.apk'
& (Join-Path $buildTools 'zipalign.exe') -f -p 4 $appApk $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

$keystore = Join-Path $root 'android\dezhounight.keystore'
$ksAlias = 'dezhounight'
$ksPass = 'dezhounight'
if (-not (Test-Path $keystore)) {
    Write-Host '==> Generate local signing key'
    & (Join-Path $javaHome 'bin\keytool.exe') -genkeypair `
        -keystore $keystore -alias $ksAlias -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $ksPass -keypass $ksPass `
        -dname 'CN=Dezhou Night,OU=Local,O=Dezhounight,L=Shanghai,ST=Shanghai,C=CN'
    if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}

Write-Host '==> Sign'
$finalApk = Join-Path $root "android\$apkName"
& (Join-Path $buildTools 'apksigner.bat') sign `
    --ks $keystore --ks-key-alias $ksAlias `
    --ks-pass "pass:$ksPass" --key-pass "pass:$ksPass" `
    --min-sdk-version 26 --out $finalApk $aligned
if ($LASTEXITCODE -ne 0) { throw 'apksigner sign failed' }

& (Join-Path $buildTools 'zipalign.exe') -c -v 4 $finalApk | Out-Null
& (Join-Path $buildTools 'apksigner.bat') verify --verbose $finalApk

$sizeMb = [Math]::Round((Get-Item $finalApk).Length / 1MB, 2)
$hash = (Get-FileHash $finalApk -Algorithm SHA256).Hash

$versionInfo = [pscustomobject]@{
    versionCode = $versionCode
    versionName = $versionName
}
$versionInfo | ConvertTo-Json | Set-Content $versionFile -Encoding UTF8

Write-Host ''
Write-Host "APK: $finalApk"
Write-Host "Version: $versionName (versionCode $versionCode)"
Write-Host "Size: $sizeMb MB"
Write-Host "SHA256: $hash"
