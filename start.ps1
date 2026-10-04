<#
  CueKit - Dev-Start-Skript
  Startet das Frontend (Vite) und die native Desktop-App im selben Fenster
  und beendet alles sauber bei Tastendruck.
#>

$ErrorActionPreference = 'Stop'
$RootDir = $PSScriptRoot

Write-Host "Starte CueKit Entwicklungsumgebung..." -ForegroundColor Cyan

# Hilfsfunktion zum Beenden eines Prozessbaums (inkl. Child-Prozesse wie Node)
function Kill-ProcessTree($procId) {
    if ($procId -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
        taskkill /PID $procId /T /F 2>$null | Out-Null
    }
}

# 1. Frontend starten (Vite)
Write-Host "-> Starte Frontend (Vite) auf Port 5200..." -ForegroundColor Yellow
$frontendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory "$RootDir\frontend" -PassThru -NoNewWindow

# Kleiner Puffer, damit Vite starten kann, bevor die Desktop-App loslegt
Start-Sleep -Seconds 3

# 2. Desktop App starten
Write-Host "-> Starte Desktop App (inkl. Backend auf Port 5201)..." -ForegroundColor Yellow
$backendProcess = Start-Process -FilePath "dotnet.exe" -ArgumentList "watch run -- --dev-url=http://localhost:5200 --urls=http://localhost:5201" -WorkingDirectory "$RootDir\desktop\Deck.Desktop" -PassThru -NoNewWindow

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "   Dienste laufen! Ausgabe erscheint hier im Fenster." -ForegroundColor Green
Write-Host "   Drücke eine beliebige Taste, um beide Dienste zu beenden..." -ForegroundColor Magenta
Write-Host "========================================================`n" -ForegroundColor Green

# Warte auf Tastendruck
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host "`nFahre Dienste herunter..." -ForegroundColor Yellow

# Prozesse inkl. Kind-Prozesse (Node, Desktop App) beenden
if ($frontendProcess) { Kill-ProcessTree $frontendProcess.Id }
if ($backendProcess) { Kill-ProcessTree $backendProcess.Id }

Write-Host "Dienste erfolgreich beendet." -ForegroundColor Green
