# Quellen

Wo Informationen für dieses Projekt nachgeschlagen wurden.

## OBS

| Quelle | Wo | Wofür |
|---|---|---|
| obs-websocket Protokoll v5 | https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md | Opcodes (Hello/Identify/Request/Event), Auth (SHA-256 aus Passwort+Salt, dann +Challenge), EventSubscription-Bits, alle Request-/Event-Namen in `backend/Obs/` und `backend/Actions/ActionExecutor.cs` |
| OBS WebSocket-Einstellungen | OBS → Werkzeuge → WebSocket-Server-Einstellungen | Standardport 4455, Passwort, Close-Code 4009 bei falschem Passwort |

| obs-websocket-Konfigurationsdatei | `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json` (Linux: `~/.config/obs-studio/…`, macOS: `~/Library/Application Support/obs-studio/…`) | Felder `server_enabled`, `server_port`, `auth_required`, `server_password` – Grundlage der automatischen Einrichtung in `backend/Obs/ObsDiscovery.cs` |

## Windows / Plattform

| Quelle | Wo | Wofür |
|---|---|---|
| RegisterHotKey (Win32) | https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-registerhotkey | Systemweite Tastenkürzel wie OBS, `MOD_NOREPEAT`, WM_HOTKEY auf dem registrierenden Thread – `backend/Hotkeys/GlobalHotkeyService.cs` |
| MapVirtualKeyEx | https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-mapvirtualkeyexa | Scancode → Virtual-Key je Tastaturlayout (QWERTZ-sicher) |
| Job Objects / JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | https://learn.microsoft.com/windows/win32/procthread/job-objects | Plugin-Prozesse enden mit Baton – `backend/Plugins/ChildProcessJob.cs` |
| Node.js „type stripping“ | https://nodejs.org/api/typescript.html | Plugins in TypeScript ohne Build-Schritt ausführen |

## Recht / Compliance

| Quelle | Wo | Wofür |
|---|---|---|
| EU Cyber Resilience Act, Verordnung (EU) 2024/2847 | https://eur-lex.europa.eu/eli/reg/2024/2847/oj | Meldepflichten ab 11.09.2026 (Art. 14), volle Pflichten ab 11.12.2027 – Checkliste in `docs/COMPLIANCE.md` |
| Digitale-Dienste-Gesetz § 5 (Impressum) | https://www.gesetze-im-internet.de/ddg/__5.html | Impressumspflicht der Download-Website |
| UrhG § 69e (Dekompilierung) | https://www.gesetze-im-internet.de/urhg/__69e.html | Grenze des Rückentwicklungsverbots in der EULA |

## Referenzprojekte (lokal)

| Quelle | Wo | Wofür |
|---|---|---|
| Betquat | `G:\Projekte\WebApps\Betquat\` | Vorlage für `start.ps1`, Compose-Aufteilung dev/prod, post-commit-Hook, Paketversionen |
| PrimeSource ErrorBoundary / ErrorScreen | `G:\Projekte\WebApps\PrimeSource\frontend\src\components\` | Absturzkonsole (1:1 übernommen), Aufbau der Statusseiten |

## Konkurrenz / Inspiration

| Quelle | Wo | Wofür |
|---|---|---|
| Elgato Stream Deck SDK | https://docs.elgato.com/streamdeck/sdk/introduction/getting-started | Plugins als eigene Prozesse per WebSocket – Vorbild für `docs/PLUGIN_PROTOCOL.md` |
| Touch Portal | https://www.touch-portal.com/ | Vergleich Funktionsumfang/Design |
