param(
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot "android"
$sdkRoot = "E:\non\android-sdk\Sdk"
$javaHome = "C:\Program Files\Java\jdk-22"
$gradleHome = "E:\ford\.gradle-veloxion"
$buildRoot = "E:\ford\veloxion-capacitor-build"

if (-not (Test-Path -LiteralPath $sdkRoot)) {
  throw "Android SDK not found: $sdkRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $javaHome "bin\java.exe"))) {
  throw "JDK 21 or newer not found: $javaHome"
}

New-Item -ItemType Directory -Force -Path $gradleHome, $buildRoot | Out-Null

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:JAVA_HOME = $javaHome
$env:GRADLE_USER_HOME = $gradleHome
$env:VELOXION_ANDROID_BUILD_DIR = $buildRoot

& (Join-Path $projectRoot "node_modules\.bin\cap.cmd") sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location $androidRoot
try {
  $gradleTask = "assemble$Configuration"
  & ".\gradlew.bat" --project-cache-dir (Join-Path $gradleHome "project-cache") $gradleTask
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

$apkRelativePath = if ($Configuration -eq "Release") {
  "app\outputs\apk\release\app-release-unsigned.apk"
} else {
  "app\outputs\apk\debug\app-debug.apk"
}
$apk = Join-Path $buildRoot $apkRelativePath
if (-not (Test-Path -LiteralPath $apk)) {
  throw "APK was not created: $apk"
}

Write-Output "APK: $apk"
