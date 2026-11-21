# Build the Native Messaging host for Windows.
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1
#
# NOTE: kept ASCII-only on purpose. Windows PowerShell 5.1 reads BOM-less .ps1
# files as ANSI, which mangles non-ASCII characters and can break parsing.
#
# The host targets net10.0-windows (the folder picker needs WinForms), so it
# can only be built on Windows.

param(
    [string]$OutDir = (Join-Path $PSScriptRoot 'dist')
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot

if (Test-Path $OutDir) {
    Write-Host "==> Cleaning $OutDir" -ForegroundColor DarkGray

    # Keep scrape-tmp: it holds the host's scratch dir (PyInstaller extraction,
    # Chrome profile cache). While a scrape is running those files are locked,
    # and deleting them would break the running job.
    Get-ChildItem $OutDir -Force | Where-Object { $_.Name -ne 'scrape-tmp' } | ForEach-Object {
        try {
            Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop
        }
        catch {
            Write-Host "    skipped (in use): $($_.Name)" -ForegroundColor Yellow
        }
    }

    # Leftover host process locks the exe/dll; tell the user instead of failing
    # with an obscure MSB3021.
    foreach ($locked in @('MediaHouseScraperHost.exe', 'MediaHouseScraperHost.dll')) {
        $target = Join-Path $OutDir $locked
        if (-not (Test-Path $target)) { continue }
        try {
            Rename-Item $target "$target.old" -ErrorAction Stop
            Remove-Item "$target.old" -Force -ErrorAction SilentlyContinue
        }
        catch {
            Write-Host "    $locked is still in use. Close the MediaHouse tool panel" -ForegroundColor Yellow
            Write-Host "    (or stop MediaHouseScraperHost.exe) and run this again." -ForegroundColor Yellow
            throw
        }
    }
}

Write-Host '==> Building host (net10.0-windows)' -ForegroundColor Cyan
dotnet publish (Join-Path $repoRoot 'host\MediaHouseScraperHost.csproj') -c Release -o $OutDir
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed (exit $LASTEXITCODE)" }

Write-Host '==> Copying commands.json and scraper scripts' -ForegroundColor Cyan
Copy-Item (Join-Path $repoRoot 'host\commands.json') $OutDir -Force
Copy-Item (Join-Path $repoRoot 'scraper') $OutDir -Recurse -Force

Write-Host "==> Done: $OutDir" -ForegroundColor Green
Write-Host '    Edit commands.json in that folder to add your own commands.' -ForegroundColor Yellow
Get-ChildItem $OutDir -File | Select-Object Name, Length | Format-Table -AutoSize

# Rebuilding does not touch the registered manifest (host-manifest.json lives
# outside dist). Only remind the user when it has never been created.
$manifestPath = Join-Path $repoRoot 'host-manifest.json'
if (-not (Test-Path $manifestPath)) {
    Write-Host ''
    Write-Host '==> Native host is not registered yet. Run:' -ForegroundColor Yellow
    Write-Host '    powershell -ExecutionPolicy Bypass -File .\install.ps1'
}
