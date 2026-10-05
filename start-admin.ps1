<#
  CueKit - Dev-Start-Skript (MIT Administratorrechten)
  Fordert automatisch Administratorrechte (UAC) an, damit LibreHardwareMonitor
  Zugriff auf den Kernel-Treiber (WinRing0) für Hardware-Sensoren hat.
  Startet das Frontend (Vite) und die native Desktop-App im selben Fenster
  und beendet alles sauber bei Tastendruck.
#>

$ErrorActionPreference = 'Stop'
$RootDir = $PSScriptRoot

# Administrator-Prüfung & Selbstelevation:
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "-> Administratorrechte erforderlich: Fordere UAC-Erhöhung an..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "Starte CueKit Entwicklungsumgebung (als Administrator)..." -ForegroundColor Cyan

# Hilfsfunktion zum Beenden eines Prozessbaums (inkl. Child-Prozesse wie Node)
function Kill-ProcessTree($procId) {
    if ($procId -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
        cmd /c "taskkill /PID $procId /T /F >nul 2>&1"
    }
}

function Stop-AllCueKitProcesses {
    Write-Host "`nFahre alle CueKit-Dienste herunter..." -ForegroundColor Yellow

    # 1. Bekannte Prozesse beenden (Vite und dotnet watch)
    if ($frontendProcess) { Kill-ProcessTree $frontendProcess.Id }
    if ($backendProcess) { Kill-ProcessTree $backendProcess.Id }

    # 2. Desktop-App garantiert beenden (mit Admin-Rechten)
    cmd /c "taskkill /IM CueKit.exe /T /F >nul 2>&1"

    # 3. Ports 5200 (Vite) und 5201 (Backend) sauber freigeben
    foreach ($p in 5200, 5201) {
        $procIds = (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
        foreach ($procId in $procIds) {
            if ($procId -gt 4) {
                cmd /c "taskkill /PID $procId /T /F >nul 2>&1"
            }
        }
    }

    Write-Host "Alle Dienste und Fenster sauber beendet." -ForegroundColor Green
}

# Vorab noch laufende Alt-Instanzen & Ports freigeben:
Stop-AllCueKitProcesses | Out-Null

try {
    # 1. Frontend starten (Vite)
    Write-Host "-> Starte Frontend (Vite) auf Port 5200..." -ForegroundColor Yellow
    $frontendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory "$RootDir\frontend" -PassThru -NoNewWindow

    # Kleiner Puffer, damit Vite starten kann, bevor die Desktop-App loslegt
    Start-Sleep -Seconds 3

    # 2. Desktop App starten (erbt Administratorrechte)
    Write-Host "-> Starte Desktop App (inkl. Backend auf Port 5201)..." -ForegroundColor Yellow
    $backendProcess = Start-Process -FilePath "dotnet.exe" -ArgumentList "watch run -- --dev-url=http://localhost:5200 --urls=http://localhost:5201" -WorkingDirectory "$RootDir\desktop\Deck.Desktop" -PassThru -NoNewWindow

    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "   CueKit läuft (Administrator-Modus)! Ausgabe erscheint hier." -ForegroundColor Green
    Write-Host "   Drücke eine beliebige Taste oder Strg+C zum Beenden..." -ForegroundColor Magenta
    Write-Host "========================================================`n" -ForegroundColor Green

    # Warte auf Tastendruck
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
finally {
    Stop-AllCueKitProcesses
}
