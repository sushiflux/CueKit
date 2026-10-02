[CmdletBinding()]
param(
    [double]$Duration = 14.5
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$BuildDir = Join-Path $ScriptDir 'build'

New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
Set-Location $ScriptDir

# 1. Soundtrack mit echten Instrumenten (Funk Drums, Bass, Horns, Guitars)
Write-Host "1/2 Erstelle echten Instrumental-Soundtrack..." -ForegroundColor Cyan
$env:VIDEO_DURATION = "$Duration"
node .\soundtrack.mjs
if ($LASTEXITCODE -ne 0) { throw "Soundtrack-Erstellung fehlgeschlagen." }

# 2. Bildgenaues 4K UHD 60fps Rendering direkt in die RTX 4090 NVENC Pipe
Write-Host "2/2 Rendere 4K UHD 60fps Frame-für-Frame mit 80 Mbit/s NVENC..." -ForegroundColor Cyan
node .\render.mjs
if ($LASTEXITCODE -ne 0) { throw "Video-Rendering fehlgeschlagen." }

$OutputFile = Join-Path $ScriptDir 'CueKit-Marketingvideo-4K.mp4'
Copy-Item -Path $OutputFile -Destination (Join-Path $ScriptDir 'CueKit-Marketingvideo-DE.mp4') -Force

$fileInfo = Get-Item $OutputFile
$fileSizeMb = [math]::Round($fileInfo.Length / 1MB, 2)

Write-Host "Fertig gerendert!" -ForegroundColor Green
Write-Host "Master-Datei: $OutputFile ($fileSizeMb MB, 3840x2160, 60fps, 80 Mbit/s NVENC)" -ForegroundColor Green
