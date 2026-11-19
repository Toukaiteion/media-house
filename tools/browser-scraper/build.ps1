# Build the Native Messaging host (Windows).
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1
#
# NOTE: kept ASCII-only on purpose. Windows PowerShell 5.1 reads BOM-less .ps1
# files as ANSI, which mangles non-ASCII characters and can break parsing.
#
# Single-file publish is intentionally not used: PublishSingleFile pulls in
# Microsoft.NET.ILLink.Tasks from NuGet, which fails on offline machines.

param(
    [string]$OutDir = (Join-Path $PSScriptRoot 'dist')
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (Test-Path $OutDir) {
    Write-Host "==> Cleaning $OutDir" -ForegroundColor DarkGray
    Remove-Item $OutDir -Recurse -Force
}

Write-Host '==> Building host (net10.0)' -ForegroundColor Cyan
dotnet publish (Join-Path $root 'host\MediaHouseScraperHost.csproj') -c Release -o $OutDir
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed (exit $LASTEXITCODE)" }

Write-Host '==> Copying config and Python scraper' -ForegroundColor Cyan
Copy-Item (Join-Path $root 'host\host.config.json') $OutDir -Force
Copy-Item (Join-Path $root 'scraper') $OutDir -Recurse -Force

Write-Host "==> Done: $OutDir" -ForegroundColor Green
Get-ChildItem $OutDir | Select-Object Name, Length | Format-Table -AutoSize
