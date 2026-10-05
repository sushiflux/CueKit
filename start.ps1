<#
  CueKit - Dev-Start-Skript (Standard / Ohne Administratorrechte)
  Startet das Frontend (Vite) und die native Desktop-App im selben Fenster
  und beendet alles sauber bei Tastendruck.

  -Detached: startet beides im Hintergrund (ohne Fenster, Logs in .logs\) und kehrt sofort zurueck, ohne auf einen
  Tastendruck zu warten und ohne die Dienste zu beenden. Gedacht fuer automatisierte Neustarts (z.B. durch Claude);
  beendet wird dann mit dem naechsten Lauf von start.ps1 (raeumt Alt-Instanzen und Ports vorab auf).
#>
param([switch]$Detached)

$ErrorActionPreference = 'Stop'
$RootDir = $PSScriptRoot

Write-Host "Starte CueKit Entwicklungsumgebung (Standard)..." -ForegroundColor Cyan

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

    # 1b. Von einem frueheren Lauf uebrig gebliebene dotnet-watch-Prozesse (erkennbar am Dev-URL-Argument): sonst wartet
    #     "dotnet watch" nach dem Beenden der App weiter auf Dateiaenderungen und bleibt als Waise stehen.
    Get-CimInstance Win32_Process -Filter "Name='dotnet.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*--dev-url=http://localhost:5200*' } |
        ForEach-Object { Kill-ProcessTree $_.ProcessId }

    # 2. Desktop-App garantiert beenden
    Get-Process CueKit -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    cmd /c "taskkill /IM CueKit.exe /T /F >nul 2>&1"

    # 3. Ports 5200 (Vite) und 5201 (Backend) sauber freigeben
    foreach ($p in 5200, 5201) {
        $procIds = (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
        foreach ($procId in $procIds) {
            if ($procId -gt 4) {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                cmd /c "taskkill /PID $procId /T /F >nul 2>&1"
            }
        }
    }

    Write-Host "Alle Dienste und Fenster sauber beendet." -ForegroundColor Green
}

# Vorab noch laufende Alt-Instanzen & Ports freigeben:
Stop-AllCueKitProcesses | Out-Null

try {
    # Hintergrundmodus: kein Konsolenfenster, Ausgabe in .logs\ (sonst im selben Fenster wie gewohnt)
    $startArgs = @{ PassThru = $true }
    if ($Detached) {
        $logDir = Join-Path $RootDir '.logs'
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        $startArgs.WindowStyle = 'Hidden'
    } else {
        $startArgs.NoNewWindow = $true
    }

    # 1. Frontend starten (Vite)
    Write-Host "-> Starte Frontend (Vite) auf Port 5200..." -ForegroundColor Yellow
    if ($Detached) { $startArgs.RedirectStandardOutput = "$logDir\vite.log"; $startArgs.RedirectStandardError = "$logDir\vite.err.log" }
    $frontendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory "$RootDir\frontend" @startArgs

    # Kleiner Puffer, damit Vite starten kann, bevor die Desktop-App loslegt
    Start-Sleep -Seconds 3

    # 2. Desktop App starten
    Write-Host "-> Starte Desktop App (inkl. Backend auf Port 5201)..." -ForegroundColor Yellow
    if ($Detached) { $startArgs.RedirectStandardOutput = "$logDir\desktop.log"; $startArgs.RedirectStandardError = "$logDir\desktop.err.log" }
    $backendProcess = Start-Process -FilePath "dotnet.exe" -ArgumentList "watch run -- --dev-url=http://localhost:5200 --urls=http://localhost:5201" -WorkingDirectory "$RootDir\desktop\Deck.Desktop" @startArgs

    if ($Detached) {
        Write-Host "`nDienste im Hintergrund gestartet (Logs: .logs\). Beenden: .\start.ps1 starten und beenden, oder Prozesse CueKit/dotnet/node stoppen." -ForegroundColor Green
        return
    }

    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "   Dienste laufen! Ausgabe erscheint hier im Fenster." -ForegroundColor Green
    Write-Host "   Drücke eine beliebige Taste oder Strg+C zum Beenden..." -ForegroundColor Magenta
    Write-Host "========================================================`n" -ForegroundColor Green

    # Warte auf Tastendruck
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
finally {
    if (-not $Detached) { Stop-AllCueKitProcesses }
}
