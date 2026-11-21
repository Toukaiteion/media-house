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
    try {
        Remove-Item $OutDir -Recurse -Force -ErrorAction Stop
    }
    catch {
        # Usually because the browser still has a host process running, which
        # locks the exe/dll.
        Write-Host '    Could not delete the old build (files are in use).' -ForegroundColor Yellow
        Write-Host '    Close the MediaHouse tool panel and reload the page, or stop' -ForegroundColor Yellow
        Write-Host '    MediaHouseScraperHost.exe in Task Manager, then run this again.' -ForegroundColor Yellow
        throw
    }
}

Write-Host '==> Building host (net10.0-windows)' -ForegroundColor Cyan
dotnet publish (Join-Path $repoRoot 'host\MediaHouseScraperHost.csproj') -c Release -o $OutDir
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed (exit $LASTEXITCODE)" }

Write-Host '==> Copying commands.json and Python scraper' -ForegroundColor Cyan
Copy-Item (Join-Path $repoRoot 'host\commands.json') $OutDir -Force
Copy-Item (Join-Path $repoRoot 'scraper') $OutDir -Recurse -Force

Write-Host "==> Done: $OutDir" -ForegroundColor Green
Write-Host '    Edit commands.json in that folder to add your own commands.' -ForegroundColor Yellow
Get-ChildItem $OutDir | Select-Object Name, Length | Format-Table -AutoSize

# Rebuilding does not touch the registered manifest (host-manifest.json lives
# outside dist). Only remind the user when it has never been created.
$manifestPath = Join-Path $repoRoot 'host-manifest.json'
if (-not (Test-Path $manifestPath)) {
    Write-Host ''
    Write-Host '==> Native host is not registered yet. Run:' -ForegroundColor Yellow
    Write-Host '    powershell -ExecutionPolicy Bypass -File .\install.ps1'
}
