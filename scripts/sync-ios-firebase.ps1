$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot "GoogleService-Info.plist"
$targetPath = Join-Path $projectRoot "ios\\App\\App\\GoogleService-Info.plist"
$targetDir = Split-Path -Parent $targetPath

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

if ((Test-Path $sourcePath) -and ((Get-Item $sourcePath).Length -gt 0)) {
    Copy-Item $sourcePath $targetPath -Force
    Write-Host "Synced GoogleService-Info.plist to iOS app resources."
} else {
    Write-Host "GoogleService-Info.plist not found in capacitor root. Skipping iOS Firebase plist sync."
}
