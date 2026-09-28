# Baton

**Das kostenlose Stream-Deck für OBS – auf jedem Gerät, das du schon besitzt.**

Baton verwandelt Handy, Tablet oder Browser in ein Stream Deck: echte Tasten-Optik, Live-Status
aus OBS, Ordner, Multi-Aktionen, Automationen und eine offene Plugin-Schnittstelle für die
Community. Ohne Abo, ohne Tastenlimit.

> Der Produktname steht ausschließlich in [`branding.json`](branding.json). Technische Namen
> (`Deck.*`, Ordner, Pakete) sind bewusst neutral, damit ein Umbenennen nur diese Datei betrifft.

## Aufbau

```
PC (installierte App)                         Handy / Tablet / Browser
┌───────────────────────────────┐   WLAN     ┌───────────────────────┐
│ Tray + Fenster (Editor)       │◄──────────►│ Deck (PWA, Vollbild)  │
│ Dienst: ASP.NET Core + SQLite │  SignalR   └───────────────────────┘
│  ├─ OBS-Client (obs-websocket v5) ──► OBS (ws://127.0.0.1:4455)
│  ├─ Automations-Engine
│  └─ Plugin-Host  ◄── ws /plugins ── Community-Plugins (eigene Prozesse)
└───────────────────────────────┘
```

| Ordner | Inhalt |
|---|---|
| `backend/` | Dienst (`Deck.Server`): API, Echtzeit-Hub, OBS, Automationen, Plugins |
| `frontend/` | Oberfläche (React, Vite, TypeScript, Tailwind) – Deck **und** Editor |
| `docs/` | u.a. [Plugin-Protokoll](docs/PLUGIN_PROTOCOL.md) |
| `plugins/` | Beispiel-Plugin als Vorlage |

## Entwicklung

Voraussetzungen: Docker Desktop, OBS ≥ 28.

```powershell
.\start.ps1                 # Dev-Stack mit Hot-Reload  → http://localhost:5200
.\start.ps1 -Env prod       # Live-Stack (gebautes Image) → http://localhost:5202
.\start.ps1 -Action stop|restart|status|logs [-Env prod]
```

1. In OBS **Werkzeuge → WebSocket-Server-Einstellungen → aktivieren**.
2. `http://localhost:5200` öffnen → „Einrichten“ (dieser PC wird Besitzer-Gerät).
3. **Einstellungen → OBS-Verbindung**: Passwort eintragen.
4. **Editor → „Aus OBS befüllen“** – fertig ist das erste Deck.
5. **Geräte → Gerät koppeln**: QR-Code mit dem Handy scannen.

Ports kommen fest aus der globalen Registry (`baton`: 5200 Frontend, 5201 Backend, 5202 Live).

## Status

Fertig: Dienst, OBS-Anbindung, Deck, Editor (Drag & Drop, Ordner, Icons, Farben, Multi-Aktionen),
Automationen, Geräte-Kopplung per QR, Live-Vorschau, Plugin-Schnittstelle.

Geplant: Windows-Desktop-Hülle (Tray + WebView2 + Autostart) mit Installer (WiX + eigene WPF-
Oberfläche), erste offizielle Plugins (Photoshop, Lightroom, DaVinci Resolve), Mehrsprachigkeit.

## Lizenz

- Baton selbst: [GPL v3](LICENSE) – Forks müssen quelloffen und GPL bleiben.
- Plugin-SDK/Beispiele (`plugins/`) und Plugin-Protokoll: [MIT](plugins/LICENSE) – Plugins dürfen
  beliebig lizenziert werden.
- Name und Logo „Baton“ sind nicht Teil der GPL. Details und CLA: [CONTRIBUTING.md](CONTRIBUTING.md).

---

© 2026 SushiFlux Develop
