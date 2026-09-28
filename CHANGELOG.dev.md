# Changelog (dev)

**[English](#english) · [Deutsch](#deutsch)**

Every commit gets its own entry here (technical, for developers). The customer-facing summary per
release lives in `CHANGELOG.md`.

# English

## v2026.9.1 - 2026-09-28 16:29

Initial scaffold of Baton - a free, community-extensible Stream Deck alternative for OBS.

- **Backend (`backend/`, `Deck.Server`, .NET 10, SQLite via EF Core 10):** `ServerHost.Build()` /
  `InitializeAsync()` so the service can run headless (Docker) or later embedded in the Windows
  desktop shell. Initial migration `20260928140554_Initial` (decks, pages/folders, buttons,
  automations, devices, settings). Default port 5202, bound to `0.0.0.0` for LAN access.
- **OBS:** own obs-websocket v5 client (`Obs/ObsWebSocketClient.cs`, Hello/Identify with SHA-256
  auth, requests, events) and `ObsService` (auto-reconnect with backoff, immutable `ObsSnapshot`
  of scenes, scene items, audio inputs, stream/record/replay/vcam/studio mode; debounced reload on
  structural events). Specific error texts (e.g. missing/wrong password, close code 4009).
- **Actions:** `ActionCatalog` (17 built-in actions incl. scene switch, source visibility, mute,
  stream/record/replay/vcam/studio, hotkey, delay, deck navigation) + `ActionExecutor` for
  multi-step actions; client-side `deck.*` steps are skipped on the server.
- **Automations:** `AutomationEngine` (OBS event triggers, `obs.sceneActiveFor` and
  `schedule.interval` timers, conditions, no parallel self-runs, last-run status).
- **Plugins:** `PluginHost` - out-of-process plugins over WebSocket `/plugins?key=…`
  (register/invoke/result/log, ID validation, 1 MB limit, 15 s timeout). Protocol in
  `docs/PLUGIN_PROTOCOL.md`, example in `plugins/example-hello/hello.ts`.
- **Auth:** per-device tokens (SHA-256 hashed, cached in `DeviceTokenCache`), roles Owner/Controller,
  first owner only via loopback (`BootstrapPolicy`, extra CIDRs via `Deck:BootstrapAllowedNetworks`
  for the dev stack), one-time 8-char pairing codes (5 min), rate limiter `auth` (10/min/IP,
  `QueueLimit = 0`). OBS password encrypted with DataProtection (DPAPI-protected key ring on Windows).
- **API/realtime:** controllers for decks/pages/buttons (move = swap via parking slot because of the
  unique index), devices, automations, settings, catalog, version/info/health, PWA manifest from
  `branding.json`. SignalR hub `/hub/deck` (`obsState`, `preview`, `decksChanged`, …); live preview
  via `GetSourceScreenshot` only while a device subscribed. Security headers + CSP.
- **Frontend (`frontend/`, React 19, Vite 8, TS 6, Tailwind 4, motion):** deck view (physical key
  look, active LED, press/shake feedback, LIVE/REC timers, focus/fullscreen mode, preview panel,
  portrait auto-rotation in `DeckGrid`), editor (dnd-kit palette from OBS, swap by drag, inspector
  with offline icon picker - tabler/mdi/simple-icons loaded per prefix -, colors, `StepEditor`
  multi-actions, folders, grid presets, "fill from OBS"), automations, devices with QR pairing,
  plugins, settings, 1/3–2/3 setup/pair page, `ErrorBoundary` (verbatim from PrimeSource),
  `ErrorScreen`, light/dark tokens with WCAG-checked contrast, component classes in
  `@layer components`.
- **Infra:** `docker-compose.yml` + `.dev.yml` (hot reload, fixed subnet `10.200.52.0/24`) +
  `.prod.yml` (`docker/Dockerfile.prod`, project `baton-live`), `start.ps1` (start/stop/restart/
  status/logs, `-Env dev|prod`, ports 5200–5202 from `ports.json`, LAN IP detection, PS 5.1-safe
  compose calls), post-commit version hook, `VERSIONS.md`, `QUELLEN.md`, README.
- **Licensing:** core GPL v3 (`LICENSE`), plugin SDK/examples MIT (`plugins/LICENSE`), trademark
  note + CLA in `CONTRIBUTING.md`.

# Deutsch

## v2026.9.1 - 2026-09-28 16:29

Erstes Grundgerüst von Baton – kostenlose, per Community erweiterbare Stream-Deck-Alternative für OBS.

- **Backend (`backend/`, `Deck.Server`, .NET 10, SQLite über EF Core 10):** `ServerHost.Build()` /
  `InitializeAsync()`, damit der Dienst headless (Docker) oder später eingebettet in der
  Windows-Desktop-Hülle läuft. Erste Migration `20260928140554_Initial` (Decks, Seiten/Ordner,
  Buttons, Automationen, Geräte, Einstellungen). Standardport 5202 auf `0.0.0.0` für LAN-Zugriff.
- **OBS:** eigener obs-websocket-v5-Client (`Obs/ObsWebSocketClient.cs`, Hello/Identify mit
  SHA-256-Auth, Requests, Events) und `ObsService` (Auto-Reconnect mit Backoff, unveränderlicher
  `ObsSnapshot` aus Szenen, Quellen, Audio, Stream/Aufnahme/Replay/VCam/Studio-Modus; entprelltes
  Nachladen bei Strukturänderungen). Konkrete Fehlertexte (z.B. fehlendes/falsches Passwort, Close-Code 4009).
- **Aktionen:** `ActionCatalog` (17 eingebaute Aktionen inkl. Szenenwechsel, Quelle ein/aus, Mute,
  Stream/Aufnahme/Replay/VCam/Studio, Hotkey, Warten, Deck-Navigation) + `ActionExecutor` für
  Multi-Actions; clientseitige `deck.*`-Schritte überspringt der Server.
- **Automationen:** `AutomationEngine` (OBS-Event-Auslöser, Timer `obs.sceneActiveFor` und
  `schedule.interval`, Bedingungen, keine parallelen Eigenläufe, Status des letzten Laufs).
- **Plugins:** `PluginHost` – Plugins als eigene Prozesse per WebSocket `/plugins?key=…`
  (register/invoke/result/log, ID-Prüfung, 1-MB-Limit, 15-s-Timeout). Protokoll in
  `docs/PLUGIN_PROTOCOL.md`, Beispiel in `plugins/example-hello/hello.ts`.
- **Auth:** Token pro Gerät (SHA-256-gehasht, Cache `DeviceTokenCache`), Rollen Besitzer/Steuergerät,
  erster Besitzer nur per Loopback (`BootstrapPolicy`, zusätzliche Netze über
  `Deck:BootstrapAllowedNetworks` für den Dev-Stack), einmalige 8-stellige Kopplungscodes (5 min),
  Rate-Limiter `auth` (10/min/IP, `QueueLimit = 0`). OBS-Passwort per DataProtection verschlüsselt
  (Schlüsselring unter Windows zusätzlich per DPAPI).
- **API/Echtzeit:** Controller für Decks/Seiten/Buttons (Verschieben = Tausch über Parkplatz wegen
  Unique-Index), Geräte, Automationen, Einstellungen, Katalog, Version/Info/Health, PWA-Manifest aus
  `branding.json`. SignalR-Hub `/hub/deck` (`obsState`, `preview`, `decksChanged`, …); Live-Vorschau
  über `GetSourceScreenshot` nur solange ein Gerät sie abonniert. Security-Header + CSP.
- **Frontend (`frontend/`, React 19, Vite 8, TS 6, Tailwind 4, motion):** Deck-Ansicht (Look echter
  Tasten, Aktiv-LED, Druck-/Schüttel-Feedback, LIVE/REC-Timer, Fokus-/Vollbildmodus, Vorschau,
  automatische Drehung im Hochformat in `DeckGrid`), Editor (dnd-kit-Palette aus OBS, Tauschen per
  Ziehen, Inspektor mit Offline-Icon-Auswahl – tabler/mdi/simple-icons pro Präfix geladen –, Farben,
  `StepEditor` für Multi-Actions, Ordner, Raster-Vorlagen, „Aus OBS befüllen“), Automationen, Geräte
  mit QR-Kopplung, Plugins, Einstellungen, 1/3–2/3-Einrichtungs-/Kopplungsseite, `ErrorBoundary`
  (1:1 aus PrimeSource), `ErrorScreen`, Hell/Dunkel-Tokens mit WCAG-geprüften Kontrasten,
  Komponentenklassen in `@layer components`.
- **Infrastruktur:** `docker-compose.yml` + `.dev.yml` (Hot-Reload, festes Subnetz `10.200.52.0/24`)
  + `.prod.yml` (`docker/Dockerfile.prod`, Projekt `baton-live`), `start.ps1` (start/stop/restart/
  status/logs, `-Env dev|prod`, Ports 5200–5202 aus `ports.json`, LAN-IP-Erkennung, PS-5.1-feste
  Compose-Aufrufe), post-commit-Versions-Hook, `VERSIONS.md`, `QUELLEN.md`, README.
- **Lizenz:** Kern GPL v3 (`LICENSE`), Plugin-SDK/Beispiele MIT (`plugins/LICENSE`),
  Markenhinweis + CLA in `CONTRIBUTING.md`.
