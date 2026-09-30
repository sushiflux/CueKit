<#
.SYNOPSIS
  Baut den Installer der Desktop-App mit Velopack (Setup.exe + Update-Pakete) nach artifacts\installer.

.DESCRIPTION
  1. scripts\desktop-build.ps1 (Oberflaeche + Huelle) -> artifacts\desktop
  2. vpk pack -> Ausgabeordner: <Produkt>-win-Setup.exe, Update-Pakete (.nupkg), RELEASES/Feed-Dateien
  Produktname, Firma und Version kommen aus branding.json bzw. version.txt (eine Quelle der Wahrheit).
  Signieren (spaeter): -SignParams "<signtool-Parameter>" oder -AzureSignFile "<metadata.json>" - ohne beides
  bleibt der Installer unsigniert (Windows SmartScreen warnt dann, siehe docs\DISTRIBUTION.md).

.PARAMETER Version        Version im SemVer-Format (Standard: aus version.txt, z.B. 2026.9.7). Fuer einen RC: 2026.9.7-rc1.
.PARAMETER Output         Zielordner, relativ zur Repo-Wurzel (Standard: artifacts\installer).
.PARAMETER Channel        Update-Kanal (Standard: win).
.PARAMETER KeepPrevious   Ausgabeordner nicht leeren: fruehere Releases bleiben liegen (fuer Delta-Updates). Ohne diesen
                          Schalter wird der Ordner geleert, weil vpk dieselbe Version nicht zweimal packt.
.PARAMETER SkipBuild      artifacts\desktop nicht neu bauen.
.PARAMETER SkipFrontend   Beim Bauen die Oberflaeche nicht neu bauen (wird an desktop-build.ps1 durchgereicht).
#>
param(
    [string]$Version,
    [string]$Output = 'artifacts\installer',
    [string]$Channel = 'win',
    [string]$SignParams,
    [string]$AzureSignFile,
    [switch]$KeepPrevious,
    [switch]$SkipBuild,
    [switch]$SkipFrontend
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$brand = Get-Content (Join-Path $root 'branding.json') -Raw | ConvertFrom-Json
if (-not $Version) {
    $raw = (Get-Content (Join-Path $root 'version.txt') -Raw).Trim().TrimStart('v')
    if ($raw -notmatch '^\d+\.\d+\.\d+') { throw "version.txt enthaelt keine gueltige Version: '$raw'" }
    $Version = $raw
}

if (-not $SkipBuild) {
    $build = @{}
    if ($SkipFrontend) { $build.SkipFrontend = $true }
    & (Join-Path $PSScriptRoot 'desktop-build.ps1') @build
}

$packDir = Join-Path $root 'artifacts\desktop'
$exe = "$($brand.productName).exe"
if (-not (Test-Path (Join-Path $packDir $exe))) { throw "$exe fehlt in $packDir - ohne -SkipBuild bauen." }

$out = Join-Path $root $Output
if ((Test-Path $out) -and -not $KeepPrevious) { Get-ChildItem $out -Force | Remove-Item -Recurse -Force }
New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Host "== Installer bauen: $($brand.productName) $Version ($Channel) ==" -ForegroundColor Cyan
Push-Location (Join-Path $root 'desktop')
try {
    dotnet tool restore | Out-Null
    $vpk = @(
        'pack',
        '--packId', $brand.productName,
        '--packTitle', $brand.productName,
        '--packAuthors', $brand.company,
        '--packVersion', $Version,
        '--packDir', $packDir,
        '--mainExe', $exe,
        '--icon', (Join-Path $root 'branding\icon.ico'),
        '--splashImage', (Join-Path $root 'branding\installer-splash.png'),
        '--splashProgressColor', '#5b4bf5',
        '--runtime', 'win-x64',
        '--channel', $Channel,
        '--outputDir', $out
    )
    if ($SignParams) { $vpk += @('--signParams', $SignParams) }
    if ($AzureSignFile) { $vpk += @('--azureTrustedSignFile', $AzureSignFile) }
    dotnet vpk @vpk
    if ($LASTEXITCODE -ne 0) { throw 'vpk pack fehlgeschlagen' }
}
finally { Pop-Location }

Write-Host ''
Get-ChildItem $out -File | ForEach-Object { '{0,-52} {1,8:N1} MB' -f $_.Name, ($_.Length / 1MB) }
if (-not $SignParams -and -not $AzureSignFile) {
    Write-Host 'Hinweis: unsigniert - Windows SmartScreen zeigt eine Warnung (docs\DISTRIBUTION.md).' -ForegroundColor Yellow
}
