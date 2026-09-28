# Quellen

Wo Informationen für dieses Projekt nachgeschlagen wurden.

## OBS

| Quelle | Wo | Wofür |
|---|---|---|
| obs-websocket Protokoll v5 | https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md | Opcodes (Hello/Identify/Request/Event), Auth (SHA-256 aus Passwort+Salt, dann +Challenge), EventSubscription-Bits, alle Request-/Event-Namen in `backend/Obs/` und `backend/Actions/ActionExecutor.cs` |
| OBS WebSocket-Einstellungen | OBS → Werkzeuge → WebSocket-Server-Einstellungen | Standardport 4455, Passwort, Close-Code 4009 bei falschem Passwort |

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
