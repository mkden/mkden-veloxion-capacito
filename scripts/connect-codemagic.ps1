param([Parameter(Mandatory = $true)][string]$CredentialPath)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Veloxion - private Codemagic access'
$directory = Split-Path -Parent $CredentialPath
$env:CONNECTOR_ENV_PATH = $CredentialPath
$succeeded = $false
Write-Host 'VELOXION EURO + RUS - CODEMAGIC ACCESS' -ForegroundColor Cyan
Write-Host 'Open Codemagic > Account settings > API token.'
Write-Host 'Paste the token below. Input is hidden. Do NOT send it to chat.'
Write-Host 'This console only tests access. It does not start builds or publish apps.'
try {
  if (-not (Test-Path -LiteralPath $CredentialPath)) {
    $secret = Read-Host 'Codemagic API token' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); $secret.Dispose() }
    if ($token -notmatch '^[A-Za-z0-9_.-]{20,512}$') { throw 'The token format is invalid. No credential file was created.' }
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $directory /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE) { throw 'Cannot protect the credential directory.' }
    $stream = [IO.File]::Open($CredentialPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes = [Text.UTF8Encoding]::new($false).GetBytes("CODEMAGIC_API_TOKEN=$token`n"); $stream.Write($bytes, 0, $bytes.Length) }
    finally { $stream.Dispose(); $token = $null; if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) } }
  }
  & node.exe (Join-Path $PSScriptRoot 'codemagic-local.mjs') test --output (Join-Path $directory 'access-report.json')
  if ($LASTEXITCODE -eq 0) { $succeeded = $true; Write-Host 'Connected. Tell the assistant: ready.' -ForegroundColor Green }
  else { Write-Host 'Check the safe error above. No build was started.' -ForegroundColor Yellow }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red }
Read-Host 'Press Enter to close' | Out-Null
if (-not $succeeded) { exit 1 }
