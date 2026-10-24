param(
  [Parameter(Mandatory = $true)][string]$CredentialPath,
  [string]$SourceKeyPath,
  [string]$IssuerId,
  [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Veloxion EURO - App Store Connect (private local setup)'
$directory = Split-Path -Parent $CredentialPath
$env:CONNECTOR_ENV_PATH = $CredentialPath
$report = Join-Path $directory 'access-report.json'
$helper = Join-Path $PSScriptRoot 'app-store-local.mjs'
$setupSucceeded = $false

Write-Host 'VELOXION EURO - APP STORE CONNECT' -ForegroundColor Cyan
Write-Host 'Only eu.veloxion.app is being prepared. RUS certificates will not be revoked.'
Write-Host 'Do NOT enter your Apple Account password or paste a private key here.'
Write-Host ''
Write-Host 'You need a TEAM API key with Admin access for certificate provisioning.'
Write-Host 'Apple: Users and Access > Integrations > App Store Connect API > Team Keys'
Write-Host 'https://appstoreconnect.apple.com/access/integrations/api'
Write-Host 'An APNs AuthKey or an Individual API key will not work for this task.'
Write-Host ''

try {
  if (Test-Path -LiteralPath $CredentialPath) {
    Write-Host 'A credentials file already exists. It will NOT be overwritten.'
  } else {
    $sourceKey = $SourceKeyPath
    if (-not $sourceKey) { $sourceKey = Read-Host 'Path to the downloaded AuthKey_XXXXXXXXXX.p8 file (drag and drop is OK)' }
    $sourceKey = $sourceKey.Trim().Trim('"').Trim("'")
    $sourceKey = (Resolve-Path -LiteralPath $sourceKey).Path
    if ([IO.Path]::GetExtension($sourceKey) -ne '.p8') { throw 'Select a .p8 API key file.' }
    $keyId = ''
    if ([IO.Path]::GetFileName($sourceKey) -match '^AuthKey_([A-Z0-9]{10})\.p8$') { $keyId = $Matches[1] }
    if (-not $keyId) { $keyId = (Read-Host 'Key ID (10 characters, from the Team Keys page)').Trim() }
    if ($keyId -notmatch '^[A-Z0-9]{10}$') { throw 'Key ID must contain 10 uppercase letters/digits.' }
    if (-not $IssuerId) { $IssuerId = Read-Host 'Issuer ID (UUID displayed on the Team Keys page)' }
    $issuerId = $IssuerId.Trim()
    if ($issuerId -notmatch '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$') { throw 'Issuer ID must be the Team Keys UUID.' }
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $directory /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot secure the credentials directory.' }
    $privateKey = Join-Path $directory 'app-store-api-key.p8'
    if (Test-Path -LiteralPath $privateKey) { throw 'Private key destination already exists. Nothing was overwritten.' }
    Copy-Item -LiteralPath $sourceKey -Destination $privateKey -ErrorAction Stop
    $normalizedPath = $privateKey.Replace('\', '/')
    $content = "APP_STORE_CONNECT_KEY_IDENTIFIER=$keyId`nAPP_STORE_CONNECT_ISSUER_ID=$issuerId`nAPP_STORE_CONNECT_PRIVATE_KEY_FILE=`"$normalizedPath`"`n"
    $stream = [IO.File]::Open($CredentialPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes = [Text.UTF8Encoding]::new($false).GetBytes($content); $stream.Write($bytes, 0, $bytes.Length) }
    finally { $stream.Dispose() }
    $content = $null
    Write-Host 'Credentials saved outside the project, restricted to your account and SYSTEM.' -ForegroundColor Green
  }
  Write-Host 'Testing read-only access to Bundle IDs, certificates and profiles...'
  & node.exe $helper test --output $report
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Access failed. Review the safe error above. No Apple resources were changed.' -ForegroundColor Yellow
    Write-Host "Credentials file: $CredentialPath"
  } else {
    $setupSucceeded = $true
    Write-Host 'Connected. Tell the assistant: ready. It can now create the EURO Bundle ID/signing resources.' -ForegroundColor Green
  }
} catch {
  Write-Host 'Setup did not complete. No Apple resources were changed.' -ForegroundColor Red
  Write-Host $_.Exception.Message
}
Write-Host ''
if (-not $NoPause) { Read-Host 'Press Enter to close this window' | Out-Null }
if (-not $setupSucceeded) { exit 1 }
