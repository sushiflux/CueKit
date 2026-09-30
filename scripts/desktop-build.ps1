<#
.SYNOPSIS
  Baut die Desktop-App (Oberflaeche + Huelle) als eigenstaendigen Ordner nach artifacts\desktop.

.DESCRIPTION
  1. Oberflaeche bauen (frontend: npm run build)
  2. Huelle veroeffentlichen: self-contained win-x64 - die .NET-Laufzeit liegt im Ordner, Nutzer muessen
     nichts installieren (nur die WebView2-Laufzeit, die Windows 10/11 ohnehin mitbringen).
  Ausgabe ist die Grundlage fuer den Installer (desktop-pack.ps1) und den CI-Workflow.

.PARAMETER Configuration   Release (Standard) oder Debug.
.PARAMETER Output          Zielordner, relativ zur Repo-Wurzel (Standard: artifacts\desktop).
.PARAMETER SkipFrontend    Oberflaeche nicht neu bauen (frontend\dist wird unveraendert verwendet).
#>
param(
    [string]$Configuration = 'Release',
    [string]$Output = 'artifacts\desktop',
    [switch]$SkipFrontend
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root $Output

if (-not $SkipFrontend) {
    Write-Host '== Oberflaeche bauen ==' -ForegroundColor Cyan
    Push-Location (Join-Path $root 'frontend')
    try {
        if (-not (Test-Path 'node_modules')) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci fehlgeschlagen' } }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend-Build fehlgeschlagen' }
    }
    finally { Pop-Location }
}
elseif (-not (Test-Path (Join-Path $root 'frontend\dist\index.html'))) {
    throw 'frontend\dist fehlt - ohne -SkipFrontend bauen.'
}

Write-Host '== Huelle veroeffentlichen ==' -ForegroundColor Cyan
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
dotnet publish (Join-Path $root 'desktop\Deck.Desktop\Deck.Desktop.csproj') -c $Configuration -r win-x64 --self-contained true -o $out
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish fehlgeschlagen' }

$size = [math]::Round(((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB)
Write-Host "Fertig: $out ($size MB)" -ForegroundColor Green
