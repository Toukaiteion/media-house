# Register the Native Messaging host for Chrome and Edge (current user, no admin).
# Usage:
#   powershell -ExecutionPolicy Bypass -File install.ps1 -ExtensionId <32-char-extension-id>
#
# Get the extension ID from chrome://extensions with Developer mode enabled.
#
# NOTE: kept ASCII-only on purpose. Windows PowerShell 5.1 reads BOM-less .ps1
# files as ANSI, which mangles non-ASCII characters and can break parsing.

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId,

    [string]$HostName = 'com.mediahouse.scraper'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
$exe = Join-Path $dist 'MediaHouseScraperHost.exe'

if (-not (Test-Path $exe)) {
    Write-Host '==> Host not built yet, running build.ps1' -ForegroundColor Yellow
    & (Join-Path $root 'build.ps1')
    if (-not (Test-Path $exe)) { throw "Still cannot find $exe after build" }
}

$manifestPath = Join-Path $dist "$HostName.json"
$manifest = [ordered]@{
    name            = $HostName
    description     = 'MediaHouse local scraper host'
    path            = $exe
    type            = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
}

$json = $manifest | ConvertTo-Json -Depth 5

# Must be UTF-8 WITHOUT BOM: Chrome rejects a manifest that starts with a BOM.
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))

$targets = @(
    "HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\$HostName"
)

foreach ($key in $targets) {
    New-Item -Path $key -Force | Out-Null
    Set-ItemProperty -Path $key -Name '(default)' -Value $manifestPath
    Write-Host "==> Registered: $key" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Done. Next steps:' -ForegroundColor Cyan
Write-Host "  1. Check python / scraper paths in $dist\host.config.json"
Write-Host '  2. Reload the extension on chrome://extensions'
Write-Host '  3. Open the extension options and save your server URL'
Write-Host '  4. Open a movie detail page - the button shows bottom-right'
Write-Host ''
Write-Host 'Uninstall:' -ForegroundColor DarkGray
Write-Host "  Remove-Item 'HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\$HostName' -Recurse"
Write-Host "  Remove-Item 'HKCU:\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\$HostName' -Recurse"
