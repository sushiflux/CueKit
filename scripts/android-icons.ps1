<#
.SYNOPSIS
  Erzeugt die Android-Launcher-Icons (mipmap-*) aus branding\icon.ico. Nur noetig, wenn sich das Logo aendert.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Drawing

# icon.ico enthaelt PNG-Bilder (PNG-in-ICO): das groesste herausloesen
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $root 'branding\icon.ico'))
$count = [BitConverter]::ToUInt16($bytes, 4)
$best = $null
for ($i = 0; $i -lt $count; $i++) {
    $e = 6 + 16 * $i
    $w = if ($bytes[$e] -eq 0) { 256 } else { [int]$bytes[$e] }
    if (-not $best -or $w -gt $best.W) { $best = @{ W = $w; Size = [BitConverter]::ToUInt32($bytes, $e + 8); Offset = [BitConverter]::ToUInt32($bytes, $e + 12) } }
}
$png = New-Object byte[] $best.Size
[Array]::Copy($bytes, $best.Offset, $png, 0, $best.Size)
$big = [System.Drawing.Image]::FromStream((New-Object System.IO.MemoryStream(, $png)))

$sizes = @{ 'mipmap-mdpi' = 48; 'mipmap-hdpi' = 72; 'mipmap-xhdpi' = 96; 'mipmap-xxhdpi' = 144; 'mipmap-xxxhdpi' = 192 }
foreach ($dir in $sizes.Keys) {
    $px = $sizes[$dir]
    $target = Join-Path $root "android\app\src\main\res\$dir"
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    $bmp = New-Object System.Drawing.Bitmap($px, $px)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($big, 0, 0, $px, $px)
    $g.Dispose()
    $bmp.Save((Join-Path $target 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}
$big.Dispose()
Write-Host 'Android-Icons erzeugt.' -ForegroundColor Green
