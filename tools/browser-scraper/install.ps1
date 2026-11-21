# Register the Native Messaging host for Chrome and Edge (current user, no admin).
# Usage:
#   powershell -ExecutionPolicy Bypass -File install.ps1
#   powershell -ExecutionPolicy Bypass -File install.ps1 -ExtensionId <32-char-id>
#
# If -ExtensionId is omitted, the script looks the extension up in the Chrome/Edge
# profile that has it loaded (Secure Preferences -> extensions.settings[].path),
# so you do not need to hunt for the ID manually.
#
# NOTE: kept ASCII-only on purpose. Windows PowerShell 5.1 reads BOM-less .ps1
# files as ANSI, which mangles non-ASCII characters and can break parsing.

param(
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId,

    [string]$HostName = 'com.mediahouse.scraper'
)

$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$dist = Join-Path $repoRoot 'dist'
$exe = Join-Path $dist 'MediaHouseScraperHost.exe'
$extDir = Join-Path $repoRoot 'extension'

# Keep the manifest OUTSIDE dist: build.ps1 wipes dist, and losing the manifest
# makes Chrome report "Specified native messaging host not found".
$manifestPath = Join-Path $repoRoot 'host-manifest.json'

function Find-ExtensionId {
    param([string]$ExtensionPath)

    $target = $ExtensionPath.TrimEnd('\')

    $browsers = @(
        @{ Name = 'Chrome';      Path = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data' },
        @{ Name = 'Chrome Beta'; Path = Join-Path $env:LOCALAPPDATA 'Google\Chrome Beta\User Data' },
        @{ Name = 'Edge';        Path = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data' },
        @{ Name = 'Chromium';    Path = Join-Path $env:LOCALAPPDATA 'Chromium\User Data' }
    )

    foreach ($browser in $browsers) {
        if (-not (Test-Path $browser.Path)) { continue }

        $profiles = Get-ChildItem $browser.Path -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }

        foreach ($profile in $profiles) {
            foreach ($fileName in @('Secure Preferences', 'Preferences')) {
                $prefsFile = Join-Path $profile.FullName $fileName
                if (-not (Test-Path $prefsFile)) { continue }

                try {
                    $text = [System.IO.File]::ReadAllText($prefsFile, [System.Text.Encoding]::UTF8)
                    $json = $text | ConvertFrom-Json
                } catch {
                    continue
                }

                $settings = $json.extensions.settings
                if ($null -eq $settings) { continue }

                foreach ($entry in $settings.PSObject.Properties) {
                    $extPath = $entry.Value.path
                    if (-not $extPath) { continue }
                    if ($extPath.TrimEnd('\') -ine $target) { continue }

                    return [pscustomobject]@{
                        Id      = $entry.Name
                        Browser = $browser.Name
                        Profile = $profile.Name
                    }
                }
            }
        }
    }

    return $null
}

if (-not (Test-Path $exe)) {
    Write-Host '==> Host not built yet, running build.ps1' -ForegroundColor Yellow
    & (Join-Path $repoRoot 'build.ps1')
    if (-not (Test-Path $exe)) { throw "Still cannot find $exe after build" }
}

if (-not $ExtensionId) {
    Write-Host "==> Looking for the extension loaded from $extDir" -ForegroundColor Cyan
    $found = Find-ExtensionId -ExtensionPath $extDir

    if ($null -eq $found) {
        Write-Host ''
        Write-Host 'Could not find the extension in any Chrome/Edge profile.' -ForegroundColor Yellow
        Write-Host '  1. Open chrome://extensions and enable Developer mode'
        Write-Host '  2. Click "Load unpacked" and pick:'
        Write-Host "     $extDir"
        Write-Host '  3. Run this script again.'
        Write-Host ''
        Write-Host 'If you already loaded it, copy the "ID:" shown on its card and run:'
        Write-Host '  install.ps1 -ExtensionId <id>'
        exit 1
    }

    $ExtensionId = $found.Id
    Write-Host "    found in $($found.Browser) / $($found.Profile): $ExtensionId" -ForegroundColor Green
}

Write-Host "==> Using extension id: $ExtensionId" -ForegroundColor Cyan

$manifest = [ordered]@{
    name            = $HostName
    description     = 'MediaHouse local tools host'
    path            = $exe
    type            = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
}

$json = $manifest | ConvertTo-Json -Depth 5

# Must be UTF-8 WITHOUT BOM: Chrome rejects a manifest that starts with a BOM.
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "==> Manifest: $manifestPath" -ForegroundColor Green

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
Write-Host '  1. Reload the extension on chrome://extensions (or restart the browser)'
Write-Host '  2. Open the extension options and save your server URL(s)'
Write-Host '  3. Open any page on your MediaHouse site - the tool button shows bottom-right'
Write-Host ''
Write-Host 'Uninstall:' -ForegroundColor DarkGray
Write-Host "  Remove-Item 'HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\$HostName' -Recurse"
Write-Host "  Remove-Item 'HKCU:\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\$HostName' -Recurse"
