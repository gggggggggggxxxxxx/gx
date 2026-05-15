# One-time git push to GitHub using a Personal Access Token (classic).
# Run in Windows PowerShell (blue window), from this folder:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
#   .\push-with-token.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$remoteClean = "https://github.com/gggggggggggxxxxxx/gx.git"

Write-Host "Token is used only for this push; origin URL is restored without the token at the end." -ForegroundColor Yellow
Write-Host ""

$user = Read-Host "GitHub username (login name, not email)"
if ([string]::IsNullOrWhiteSpace($user)) {
  throw "Username cannot be empty."
}

$secure = Read-Host "Personal Access Token (input hidden)" -AsSecureString
$BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR) | Out-Null
}

if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Token cannot be empty. Create one at: https://github.com/settings/tokens/new?type=classic (scope: repo)"
}

$remoteWithCred = "https://${user}:$([uri]::EscapeDataString($token))@github.com/gggggggggggxxxxxx/gx.git"

try {
  git remote set-url origin $remoteWithCred
  git push -u origin main
  if ($LASTEXITCODE -ne 0) {
    throw "git push failed with exit code: $LASTEXITCODE"
  }
  Write-Host ""
  Write-Host "Push OK. Open: https://github.com/gggggggggggxxxxxx/gx" -ForegroundColor Green
} finally {
  git remote set-url origin $remoteClean
  Write-Host "Restored origin URL (no token stored in remote)."
}
