param(
    [string]$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$KeyStore = "$env:USERPROFILE\.android\genilink-citation-test.keystore",
    [string]$StorePassword = "android",
    [string]$JavaHome = $env:JAVA_HOME
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$tools = Join-Path $SdkRoot "build-tools\36.0.0"
$androidJar = Join-Path $SdkRoot "platforms\android-36.1\android.jar"
$output = Join-Path $root ".build"
$classes = Join-Path $output "classes"
$dex = Join-Path $output "dex"
New-Item -ItemType Directory -Path $classes, $dex -Force | Out-Null

$sources = @(Get-ChildItem -LiteralPath (Join-Path $root "src") -Filter "*.java" -Recurse |
    ForEach-Object { $_.FullName })
& javac -source 8 -target 8 -bootclasspath $androidJar -d $classes @sources
if ($LASTEXITCODE -ne 0) { throw "javac failed" }
if ($JavaHome) { $env:JAVA_HOME = $JavaHome }
& (Join-Path $tools "d8.bat") --lib $androidJar --output $dex @(
    Get-ChildItem -LiteralPath $classes -Filter "*.class" -Recurse |
        ForEach-Object { $_.FullName }
)
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }
$unsigned = Join-Path $output "unsigned.apk"
& (Join-Path $tools "aapt.exe") package -f -M (Join-Path $root "AndroidManifest.xml") `
    -I $androidJar -F $unsigned
if ($LASTEXITCODE -ne 0) { throw "aapt failed" }
Push-Location $dex
try {
    & (Join-Path $tools "aapt.exe") add $unsigned "classes.dex"
    if ($LASTEXITCODE -ne 0) { throw "aapt add failed" }
} finally {
    Pop-Location
}
$aligned = Join-Path $output "aligned.apk"
& (Join-Path $tools "zipalign.exe") -f 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

if (-not (Test-Path -LiteralPath $KeyStore)) {
    New-Item -ItemType Directory -Path (Split-Path $KeyStore -Parent) -Force | Out-Null
    & keytool -genkeypair -keystore $KeyStore -storepass $StorePassword `
        -keypass $StorePassword -alias citation-test -keyalg RSA -keysize 3072 `
        -validity 3650 -dname "CN=Genilink Citation Test"
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}
$apk = Join-Path $output "citation-receiver.apk"
& (Join-Path $tools "apksigner.bat") sign --ks $KeyStore `
    --ks-key-alias citation-test --ks-pass "pass:$StorePassword" `
    --key-pass "pass:$StorePassword" --out $apk $aligned
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }
& (Join-Path $tools "apksigner.bat") verify $apk
if ($LASTEXITCODE -ne 0) { throw "APK verification failed" }
Write-Output $apk
