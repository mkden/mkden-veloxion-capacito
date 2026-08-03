$ErrorActionPreference = "Stop"

$buildTools = "E:\non\android-sdk\Sdk\build-tools\36.0.0"
$releaseDirectory = "E:\ford\veloxion-capacitor-build\app\outputs\apk\release"
$unsignedApk = Join-Path $releaseDirectory "app-release-unsigned.apk"
$alignedApk = Join-Path $releaseDirectory "app-release-aligned.apk"
$installableApk = Join-Path $releaseDirectory "veloxion-release-installable.apk"
$debugKeystore = Join-Path $env:USERPROFILE ".android\debug.keystore"

foreach ($requiredPath in @($unsignedApk, $debugKeystore, (Join-Path $buildTools "zipalign.exe"), (Join-Path $buildTools "apksigner.bat"))) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required signing file not found: $requiredPath"
  }
}

& (Join-Path $buildTools "zipalign.exe") -p -f 4 $unsignedApk $alignedApk
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $buildTools "apksigner.bat") sign `
  --ks $debugKeystore `
  --ks-key-alias androiddebugkey `
  --ks-pass pass:android `
  --key-pass pass:android `
  --out $installableApk `
  $alignedApk
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $buildTools "apksigner.bat") verify --verbose $installableApk
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Remove-Item -LiteralPath $alignedApk -Force
Remove-Item -LiteralPath $unsignedApk -Force
Write-Output "Installable APK: $installableApk"
