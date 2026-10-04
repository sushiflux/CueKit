<#
  CueKit - Dev-Start-Skript
  Startet das Frontend (Vite) und die native Desktop-App in parallelen Fenstern.
#>

$ErrorActionPreference = 'Stop'
$RootDir = $PSScriptRoot

Write-Host "Starte CueKit Entwicklungsumgebung..." -ForegroundColor Cyan

# 1. Frontend starten (öffnet ein neues PowerShell-Fenster)
Write-Host "-> Starte Frontend (Vite)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$RootDir\frontend'; npm run dev`""

# Kleiner Puffer, damit Vite starten kann, bevor die Desktop-App loslegt
Start-Sleep -Seconds 3

# 2. Desktop App starten (öffnet ein neues PowerShell-Fenster)
Write-Host "-> Starte Desktop App (inkl. Backend auf Port 5201)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$RootDir\desktop\Deck.Desktop'; dotnet watch run -- --dev-url=http://localhost:5200 --urls=http://localhost:5201`""

Write-Host "Erledigt! Es wurden zwei neue Terminals für Hot-Reload geöffnet." -ForegroundColor Green
Write-Host "Du kannst dieses Fenster schließen, die beiden anderen Terminals halten die App am Leben." -ForegroundColor Gray
