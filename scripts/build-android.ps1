param(
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Release",
  [ValidateSet("rus", "euro")]
  [string]$Region = "rus",
  [string]$FirebaseConfig = "",
  [string]$JavaHome = "",
  [string]$SdkRoot = "E:\non\android-sdk\Sdk",
  [ValidateRange(0, 2100000000)]
  [int]$VersionCode = 0,
  [string]$VersionName = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot "android"
if (-not $JavaHome) { $JavaHome = if ($env:JAVA_HOME -and (Test-Path -LiteralPath "$env:JAVA_HOME\bin\java.exe")) { $env:JAVA_HOME } else { "E:\SDK\jbr" } }
$gradleHome = Join-Path $projectRoot ".gradle-user"

if (-not (Test-Path -LiteralPath $sdkRoot)) {
  throw "Android SDK not found: $sdkRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $javaHome "bin\java.exe"))) {
  throw "JDK not found: $javaHome"
}

New-Item -ItemType Directory -Force -Path $gradleHome | Out-Null

$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:JAVA_HOME = $JavaHome
$env:VELOXION_APP_REGION = $Region
$env:GRADLE_USER_HOME = $gradleHome
Remove-Item Env:VELOXION_ANDROID_BUILD_DIR -ErrorAction SilentlyContinue

& (Join-Path $projectRoot "node_modules\.bin\cap.cmd") sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node (Join-Path $PSScriptRoot "prepare-android-region.mjs") $Region $FirebaseConfig
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location $androidRoot
try {
  $gradleTask = "assemble$Configuration"
  $extra = @()
  if ($VersionCode -gt 0) { $extra += "-PveloxionVersionCode=$VersionCode" }
  if ($VersionName) { $extra += "-PveloxionVersionName=$VersionName" }
  & ".\gradlew.bat" $gradleTask --no-daemon --console=plain @extra
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
