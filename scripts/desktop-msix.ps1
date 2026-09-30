<#
.SYNOPSIS
  Baut ein MSIX-Paket der Desktop-App fuer den Microsoft Store nach artifacts\msix (ungesigniert) - optional testweise signiert.

.DESCRIPTION
  1. scripts\desktop-build.ps1 (Oberflaeche + Huelle) -> artifacts\desktop   (entfaellt mit -SkipBuild)
  2. Paketordner artifacts\msix\layout: Programmdateien + AppxManifest.xml + Logos (aus branding\icon.ico)
  3. makeappx pack -> artifacts\msix\<Produkt>_<Version>.msix
  Produktname, Firma und Version kommen aus branding.json bzw. version.txt. Die Paket-Identitaet (-IdentityName,
  -Publisher, -PublisherDisplayName) vergibt spaeter das Partner Center: dort unter "Produktidentitaet" kopieren
  und hier als Parameter uebergeben. Ohne diese Werte entsteht ein Testpaket mit Platzhalter-Identitaet.
  Den Store-Upload signiert Microsoft selbst - das Paket bleibt dafuer ungesigniert. Zum lokalen Ausprobieren
  (Sideload) mit -TestSign: erzeugt ein selbst signiertes Zertifikat (Publisher = -Publisher) und signiert damit;
  installieren laesst sich das erst, nachdem das .cer als Administrator in "Vertrauenswuerdige Personen" importiert wurde.

.PARAMETER Version              Vierteilige Version; Standard aus version.txt (2026.9.9 -> 2026.9.9.0).
.PARAMETER IdentityName         Package/Identity/Name (Partner Center). Standard: Platzhalter.
.PARAMETER Publisher            Package/Identity/Publisher, z.B. "CN=ABCD1234-..." (Partner Center). Standard: "CN=<Firma>".
.PARAMETER PublisherDisplayName Anzeigename des Herausgebers (Standard: Firma aus branding.json).
.PARAMETER TestSign             Mit selbst signiertem Testzertifikat signieren (nur lokales Sideload).
.PARAMETER SkipBuild            artifacts\desktop nicht neu bauen.
.PARAMETER SkipFrontend         Beim Bauen die Oberflaeche nicht neu bauen.
#>
param(
    [string]$Version,
    [string]$IdentityName,
    [string]$Publisher,
    [string]$PublisherDisplayName,
    [switch]$TestSign,
    [switch]$SkipBuild,
    [switch]$SkipFrontend
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$brand = Get-Content (Join-Path $root 'branding.json') -Raw | ConvertFrom-Json
if (-not $Version) {
    $raw = (Get-Content (Join-Path $root 'version.txt') -Raw).Trim().TrimStart('v')
    if ($raw -notmatch '^(\d+)\.(\d+)\.(\d+)') { throw "version.txt enthaelt keine gueltige Version: '$raw'" }
    $Version = "$($Matches[1]).$($Matches[2]).$($Matches[3]).0"
}
if ($Version -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw "Version muss vierteilig sein (a.b.c.d), ist aber '$Version'." }
$slug = ($brand.company -replace '[^A-Za-z0-9]', '') + '.' + ($brand.productName -replace '[^A-Za-z0-9]', '')
if (-not $IdentityName) { $IdentityName = $slug }
if (-not $Publisher) { $Publisher = "CN=$($brand.company)" }
if (-not $PublisherDisplayName) { $PublisherDisplayName = $brand.company }

function Find-SdkTool([string]$name) {
    $hit = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter $name -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $hit) { throw "$name nicht gefunden - Windows 10/11 SDK installieren (enthaelt makeappx und signtool)." }
    $hit.FullName
}

if (-not $SkipBuild) {
    $build = @{}
    if ($SkipFrontend) { $build.SkipFrontend = $true }
    & (Join-Path $PSScriptRoot 'desktop-build.ps1') @build
}

$src = Join-Path $root 'artifacts\desktop'
$exe = "$($brand.productName).exe"
if (-not (Test-Path (Join-Path $src $exe))) { throw "$exe fehlt in $src - ohne -SkipBuild bauen." }

$out = Join-Path $root 'artifacts\msix'
$layout = Join-Path $out 'layout'
if (Test-Path $out) { Get-ChildItem $out -Force | Remove-Item -Recurse -Force }
New-Item -ItemType Directory -Force -Path $layout, (Join-Path $layout 'Assets') | Out-Null

Write-Host "== MSIX bauen: $($brand.productName) $Version ==" -ForegroundColor Cyan
Copy-Item (Join-Path $src '*') $layout -Recurse -Force

# Logos aus branding\icon.ico (enthaelt 256 px): quadratisch skalieren
Add-Type -AssemblyName System.Drawing
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $root 'branding\icon.ico'))
$count = [BitConverter]::ToUInt16($bytes, 4)
$best = $null
for ($i = 0; $i -lt $count; $i++) {
    $e = 6 + 16 * $i
    $w = if ($bytes[$e] -eq 0) { 256 } else { [int]$bytes[$e] }
    if (-not $best -or $w -gt $best.W) { $best = @{ W = $w; Size = [BitConverter]::ToUInt32($bytes, $e + 8); Offset = [BitConverter]::ToUInt32($bytes, $e + 12) } }
}
$png = New-Object byte[] $best.Size
[Array]::Copy($bytes, $best.Offset, $png, 0, $best.Size)   # icon.ico enthaelt PNG-Bilder (PNG-in-ICO)
$big = [System.Drawing.Image]::FromStream((New-Object System.IO.MemoryStream(, $png)))
function Save-Logo([string]$file, [int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $side = [Math]::Min($w, $h) * 0.8
    $g.DrawImage($big, ($w - $side) / 2, ($h - $side) / 2, $side, $side)
    $g.Dispose()
    $bmp.Save((Join-Path $layout "Assets\$file"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}
Save-Logo 'StoreLogo.png' 50 50
Save-Logo 'Square44x44Logo.png' 44 44
Save-Logo 'Square150x150Logo.png' 150 150
Save-Logo 'Wide310x150Logo.png' 310 150
$big.Dispose()

$esc = { param($s) [System.Security.SecurityElement]::Escape($s) }
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap rescap">
  <Identity Name="$(& $esc $IdentityName)" Publisher="$(& $esc $Publisher)" Version="$Version" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>$(& $esc $brand.productName)</DisplayName>
    <PublisherDisplayName>$(& $esc $PublisherDisplayName)</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
    <Description>$(& $esc $brand.tagline)</Description>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="de-de" />
  </Resources>
  <Applications>
    <Application Id="App" Executable="$exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="$(& $esc $brand.productName)" Description="$(& $esc $brand.tagline)"
                          BackgroundColor="transparent"
                          Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
    <Capability Name="internetClient" />
    <Capability Name="privateNetworkClientServer" />
  </Capabilities>
</Package>
"@
Set-Content -Path (Join-Path $layout 'AppxManifest.xml') -Value $manifest -Encoding UTF8

$pkg = Join-Path $out ("{0}_{1}.msix" -f $brand.productName, $Version)
& (Find-SdkTool 'makeappx.exe') pack /d $layout /p $pkg /o | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'makeappx pack fehlgeschlagen' }

if ($TestSign) {
    $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher -KeyUsage DigitalSignature -FriendlyName "$($brand.productName) Test" `
        -CertStoreLocation 'Cert:\CurrentUser\My' -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
    $cer = Join-Path $out ("{0}-Test.cer" -f $brand.productName)
    Export-Certificate -Cert $cert -FilePath $cer | Out-Null
    & (Find-SdkTool 'signtool.exe') sign /fd SHA256 /sha1 $cert.Thumbprint $pkg | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'signtool sign fehlgeschlagen' }
    Write-Host "Testzertifikat: $cer (als Administrator in 'Vertrauenswuerdige Personen' importieren, dann das .msix doppelklicken)" -ForegroundColor Yellow
}

Write-Host "Fertig: $pkg" -ForegroundColor Green
