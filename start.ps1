<#
  CueKit - Docker-Stack fuer Entwicklung/Test. Start/Stopp/Status in einer Datei.

  .\start.ps1                     Startet den Dev-Stack (Hot-Reload, Default -Env dev)
  .\start.ps1 -Env prod           Startet den Live-Stack (gebautes Image, eigene Daten)
  .\start.ps1 -Action stop        Stoppt den Stack (Daten-Volumes bleiben erhalten)
  .\start.ps1 -Action restart     Stoppt und startet neu
  .\start.ps1 -Action status      Zeigt den Container-Status
  .\start.ps1 -Action logs        Folgt den Logs

  Das eigentliche Produkt ist die native Windows-App (Tray + Fenster). Dieser Stack ist die
  Entwicklungsumgebung. Secrets gibt es keine von Hand: der Dienst erzeugt seine Schluessel
  (DataProtection, Plugin-Schluessel) beim ersten Start selbst im Daten-Volume.
#>

param(
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs')]
    [string]$Action = 'start',

    [ValidateSet('dev', 'prod')]
    [string]$Env = 'dev',

    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$RootDir = $PSScriptRoot
Set-Location $RootDir

$ProductName = (Get-Content (Join-Path $RootDir 'branding.json') -Raw | ConvertFrom-Json).productName
$RegistryKey = 'cuekit'
$ProjectName = if ($Env -eq 'prod') { "$RegistryKey-live" } else { $RegistryKey }
$OverrideFile = Join-Path $RootDir "docker-compose.$Env.yml"
$EnvFile = Join-Path $RootDir ".env.$Env"
$PortRegistryFile = 'C:\Users\Flux\.claude\ports.json'

function Resolve-GitExe {
    $gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source
    if (-not $gitExe -and (Test-Path 'C:\Program Files\Git\cmd\git.exe')) { $gitExe = 'C:\Program Files\Git\cmd\git.exe' }
    return $gitExe
}

function Set-GitHooksPath {
    # post-commit haelt version.txt aktuell - ohne manuellen Setup-Schritt.
    $gitExe = Resolve-GitExe
    if (-not $gitExe -or -not (Test-Path (Join-Path $RootDir '.git'))) { return }
    try { & $gitExe -C $RootDir config core.hooksPath 'scripts/git-hooks' 2>$null } catch {}
}

function Get-LanIp {
    # IPv4 des Adapters mit Standard-Gateway (das echte Heim-/Studionetz, kein vEthernet/WSL).
    $cfg = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|VirtualBox|VMware' } |
        Select-Object -First 1
    if ($cfg) { return $cfg.IPv4Address.IPAddress | Select-Object -First 1 }
    return ''
}

function Test-PortFree([int]$Port) {
    return -not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Write-EnvFile {
    # Ports kommen fest aus der globalen Registry - kein stilles Ausweichen auf andere Ports.
    if (-not (Test-Path $PortRegistryFile)) { throw "Port-Registry nicht gefunden: $PortRegistryFile" }
    $ports = (Get-Content $PortRegistryFile -Raw | ConvertFrom-Json).$RegistryKey
    if (-not $ports) { throw "Kein '$RegistryKey'-Eintrag in $PortRegistryFile." }

    $map = if ($Env -eq 'prod') { @{ 'LIVE_PORT' = 'live' } } else { @{ 'FRONTEND_PORT' = 'frontend'; 'BACKEND_PORT' = 'backend' } }
    $lines = @()
    foreach ($key in $map.Keys) {
        $port = [int]$ports.($map[$key])
        if (-not $port) { throw "Kein Port '$($map[$key])' fuer '$RegistryKey' in $PortRegistryFile." }
        # Docker Desktop (wslrelay) gibt Ports nach "compose down" erst mit Verzoegerung frei -
        # kurz warten, bevor ein echter Konflikt gemeldet wird.
        for ($try = 0; $try -lt 10 -and -not (Test-PortFree $port); $try++) { Start-Sleep -Seconds 1 }
        if (-not (Test-PortFree $port)) {
            $owner = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            $proc = if ($owner) { (Get-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue).ProcessName } else { '?' }
            throw "Port $port ($key) ist belegt von Prozess '$proc'. Registrierter Port laut $PortRegistryFile - bitte den Konflikt aufloesen, es wird nicht automatisch ausgewichen."
        }
        $lines += "$key=$port"
    }
    $lines += "LAN_IP=$(Get-LanIp)"
    Set-Content -Path $EnvFile -Value $lines -Encoding utf8
}

function Invoke-Compose([string[]]$ComposeArgs) {
    $envArgs = if (Test-Path $EnvFile) { @('--env-file', $EnvFile) } else { @() }
    # Docker schreibt Fortschritt nach stderr - unter Windows PowerShell 5.1 mit "Stop" wuerde das
    # schon als Fehler abbrechen. Massgeblich ist allein der Exit-Code.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & docker compose -p $ProjectName -f docker-compose.yml -f $OverrideFile @envArgs @ComposeArgs 2>&1 | ForEach-Object { "$_" } }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw "docker compose $($ComposeArgs -join ' ') ist fehlgeschlagen (Exit Code $LASTEXITCODE)." }
}

function Wait-ForBackend([int]$Port, [int]$TimeoutSeconds = 240) {
    Write-Host "Warte auf den Dienst (erster Start laedt Pakete, das dauert etwas)..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { Write-Host "Dienst laeuft." -ForegroundColor Green; return }
        } catch {}
        Start-Sleep -Seconds 3
    }
    throw "Dienst antwortet nach $TimeoutSeconds s nicht. Pruefe: .\start.ps1 -Action logs -Env $Env"
}

if ($Action -eq 'restart') { Invoke-Compose @('down'); $Action = 'start' }

switch ($Action) {
    'stop' { Invoke-Compose @('down'); Write-Host "Gestoppt. Daten bleiben erhalten." -ForegroundColor Green; exit 0 }
    'status' { Invoke-Compose @('ps'); exit 0 }
    'logs' { Invoke-Compose @('logs', '-f', '--tail=100'); exit 0 }
}

Write-Host "Beende evtl. laufende eigene $ProductName-Container ($Env)..." -ForegroundColor Cyan
Invoke-Compose @('down', '--remove-orphans')

Write-EnvFile
Set-GitHooksPath

$upArgs = @('up', '-d')
if (-not $NoBuild) { $upArgs += '--build' }
Write-Host "Starte $ProductName ($Env)..." -ForegroundColor Cyan
Invoke-Compose $upArgs

$envValues = Get-Content $EnvFile | ConvertFrom-StringData
$lanIp = $envValues.LAN_IP
if ($Env -eq 'prod') {
    $port = [int]$envValues.LIVE_PORT
    Wait-ForBackend $port
    $uiPort = $port
} else {
    Wait-ForBackend ([int]$envValues.BACKEND_PORT)
    $uiPort = [int]$envValues.FRONTEND_PORT
}

$version = if (Test-Path (Join-Path $RootDir 'version.txt')) { (Get-Content (Join-Path $RootDir 'version.txt') -Raw).Trim() } else { 'v0.0.0' }
Write-Host "`n$ProductName laeuft ($version, Env=$Env):" -ForegroundColor Green
Write-Host "  Am PC:          http://localhost:$uiPort"
if ($lanIp) { Write-Host "  Handy/Tablet:   http://${lanIp}:$uiPort  (oder in der App unter Geraete per QR-Code koppeln)" }
Write-Host "  OBS:            Werkzeuge > WebSocket-Server-Einstellungen > aktivieren (Port 4455)"
Write-Host "`nStoppen: .\start.ps1 -Action stop -Env $Env   |   Logs: .\start.ps1 -Action logs -Env $Env"
