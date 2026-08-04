param(
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot "android"
$sdkRoot = "E:\non\android-sdk\Sdk"
$javaHome = "C:\Program Files\Java\jdk-22"
$gradleHome = Join-Path $projectRoot ".gradle-user"

if (-not (Test-Path -LiteralPath $sdkRoot)) {
  throw "Android SDK not found: $sdkRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $javaHome "bin\java.exe"))) {
  throw "JDK not found: $javaHome"
}

New-Item -ItemType Directory -Force -Path $gradleHome | Out-Null

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:JAVA_HOME = $javaHome
$env:GRADLE_USER_HOME = $gradleHome
Remove-Item Env:VELOXION_ANDROID_BUILD_DIR -ErrorAction SilentlyContinue

& (Join-Path $projectRoot "node_modules\.bin\cap.cmd") sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location $androidRoot
try {
  $gradleTask = "assemble$Configuration"
  & ".\gradlew.bat" $gradleTask --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

$outputDirectory = if ($Configuration -eq "Release") {
  Join-Path $androidRoot "app\build\outputs\apk\release"
} else {
  Join-Path $androidRoot "app\build\outputs\apk\debug"
}
$apkPattern = if ($Configuration -eq "Release") { "*-unsigned.apk" } else { "*.apk" }
$apk = Get-ChildItem -Path $outputDirectory -Filter $apkPattern -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $apk) {
  throw "APK was not created in: $outputDirectory"
}

Write-Output "APK: $apk"
