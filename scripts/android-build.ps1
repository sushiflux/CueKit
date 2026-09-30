<#
.SYNOPSIS
  Baut die Android-App (APK) in Docker - es wird nichts auf dem PC installiert (kein Android Studio/SDK noetig).

.DESCRIPTION
  Startet einen Gradle-Container (JDK 17), laedt beim ersten Mal das Android-SDK in ein Docker-Volume
  (cuekit-android-sdk) und baut android\ -> artifacts\android\<Produkt>-<Version>.apk.
  Die Debug-APK ist mit dem Debug-Schluessel signiert: zum Ausprobieren per Sideload auf dem Handy reicht das; fuer
  den Play Store braucht es spaeter ein Release mit eigenem Schluessel.
  Produktname, Firma und Version kommen aus branding.json bzw. version.txt.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$brand = Get-Content (Join-Path $root 'branding.json') -Raw | ConvertFrom-Json
$version = (Get-Content (Join-Path $root 'version.txt') -Raw).Trim().TrimStart('v')
$out = Join-Path $root 'artifacts\android'
New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Host "== Android-App bauen: $($brand.productName) $version ==" -ForegroundColor Cyan
$env:MSYS_NO_PATHCONV = '1'
docker run --rm `
    -v "${root}:/work" `
    -v cuekit-android-sdk:/opt/android-sdk `
    -v cuekit-gradle-cache:/home/gradle/.gradle `
    -e GRADLE_USER_HOME=/home/gradle/.gradle `
    -u root `
    gradle:8.10-jdk17 bash /work/scripts/android-build-container.sh
if ($LASTEXITCODE -ne 0) { throw 'Android-Build fehlgeschlagen' }

$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) { throw "APK nicht gefunden: $apk" }
$dest = Join-Path $out ("{0}-{1}.apk" -f $brand.productName, $version)
Copy-Item $apk $dest -Force
Write-Host "Fertig: $dest ($([math]::Round((Get-Item $dest).Length / 1MB, 1)) MB)" -ForegroundColor Green
