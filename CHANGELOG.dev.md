# Changelog (dev)

**[English](#english) · [Deutsch](#deutsch)**

Every commit gets its own entry here (technical, for developers). The customer-facing summary per
release lives in `CHANGELOG.md`.

# English

## v2026.9.3 - 2026-09-28 21:29

Plugin installation (ZIP + catalog), system-wide hotkeys, deck backup/restore, streaming-software tabs.

- **Plugin packages:** `PluginPackage` validates/extracts ZIPs (manifest.json, Node-only entry `.js/.mjs/.ts`,
  zip-slip + size/entry limits, optional single root folder). `PluginManager` (hosted) installs/updates
  into `{DataDir}/plugins/{id}` (`InstalledPluginEntity`, migration `InstalledPlugins`), starts plugins
  with `node` after Kestrel is listening, passes `DECK_URL/DECK_KEY/DECK_PLUGIN_ID/DECK_PLUGIN_DIR`,
  keeps a 200-line log, restarts with backoff and stops after 5 quick crashes. `ChildProcessJob`
  (Windows job object, kill-on-close) ends plugins together with Baton even on crash/kill.
  `PluginCatalog` reads `Deck:PluginCatalogUrl` (index with `downloadUrl` + `sha256`, verified).
  `PluginsController` (`/api/plugins`, install/enable/restart/uninstall/log/catalog). Hub event
  `pluginsChanged`. Backend images ship Node.js 24 (`COPY --from=node:24-slim`).
- **Fix:** plugin WebSocket endpoint moved from `/plugins` to `/ws/plugins` – it shadowed the SPA route,
  so reloading the Plugins page returned the endpoint's JSON error.
- **System-wide hotkeys:** `GlobalHotkeyService` (Windows only, `Deck:GlobalHotkeys`) registers all
  button hotkeys via `RegisterHotKey` on a message-loop thread; `KeyboardEvent.code` mapped via scan
  code + `MapVirtualKeyEx` (layout-safe). Triggers server-side steps and broadcasts `keyTriggered`;
  conflicts (taken by other apps) exposed via `GET /api/hotkeys/status` and shown in the recorder.
  `HubNotifier.DecksChanged` event drives re-registration.
- **Backup:** `BackupController` – `GET /api/backup/export[?deckId]` (versioned format `baton-decks` v1,
  referenced automations included), `POST /api/backup/import` (always adds, remaps folder/automation
  ids, skips taken hotkeys, drops unknown actions, replaces the untouched default deck on a fresh
  install). UI: `BackupCard` in settings, "Exportieren" in the editor toolbar.
- **UI:** new Plugins page (tabs Installed/Catalog, ZIP drop zone with warning, log modal, developer
  section). Settings: "Streaming-Software" card with tabs OBS (functional) / Streamlabs / XSplit
  (placeholders until testable). `MadeWith` component ("Mit ♥ gemacht" / "Made with ♥", green heart),
  `madeIn` removed from `branding.json`.
- **Misc:** `ActionStep.Mode` no longer serialized (`[JsonIgnore]`); third-party notices include the
  bundled Node.js runtime; docs: package + catalog format in `docs/PLUGIN_PROTOCOL.md`.

## v2026.9.2 - 2026-09-28 20:57

Closed-source licensing, OBS auto-setup, editor/automations merged into the deck, hotkeys.

- **Fix – repository was incomplete:** `.gitignore` rule `data/` also matched `backend/Data/`
  (Git ignores case on Windows), so the data model, `AppDbContext` and all migrations were missing
  from v2026.9.1. Rules are now anchored at the repo root (`/data/`, `/keys/`, `/secrets/`) and
  `backend/Data/` is committed. Added `.gitattributes` (LF for `scripts/git-hooks/*`).
- **Licensing/compliance:** `LICENSE` is now a proprietary freeware EULA (DE/EN); plugin SDK +
  protocol stay MIT. `scripts/generate-third-party-notices.ts` builds `THIRD-PARTY-NOTICES.md` and
  `frontend/public/third-party-licenses.json` from shipped deps only (warns on copyleft/unknown),
  shown in Settings › About (`AboutCard.tsx`). `SECURITY.md`, `docs/COMPLIANCE.md` (CRA, GDPR,
  imprint checklist). `CONTRIBUTING.md` rewritten for plugin authors. Tailwind moved to devDependencies.
- **OBS connection:** `ObsDiscovery` reads obs-websocket `config.json` (port/password) and applies it
  on first run; `POST /api/settings/obs/discover` also scans the LAN for port 4455 (Hello probe).
  Docker profiles mount the host OBS config read-only. Invalid host/port no longer crashes the host
  (`TryBuildUri`; previously an unhandled `UriFormatException` stopped the service), loopback is
  mapped to `host.docker.internal` inside containers, IPv6 hosts bracketed, `host:port`/`ws://`
  input normalized on save. Error for unavailable requests now carries the concrete reason.
- **OBS state/actions:** snapshot extended by volume (dB), inputs, media inputs (playing), transitions,
  scene collections, profiles (+ events `InputVolumeChanged`, `MediaInput*`, `CurrentSceneTransitionChanged`,
  `CurrentProfileChanged`, reload on collection/transition changes). New actions: `obs.audio.volume`
  (up/down/set dB), `obs.media`, `obs.filter`, `obs.source.refresh`, `obs.transition.set`,
  `obs.collection`, `obs.profile`, `obs.record.chapter`, `obs.record.split`, `automation.toggle`;
  catalog categories `OBS · …`. `GET /api/settings/obs/filters`.
- **Automations as tiles:** `automation.toggle` tiles toggle a rule; disabled drafts may have no
  actions; `GET /api/automation-states` for all devices; hub `automationsChanged` on every change.
- **UI:** deck, editor and automations merged – `DeckPage` with `?edit=1` renders `deck/DeckEditor.tsx`
  (grouped `Palette` with variant chips, `TileMenu` context menus, `AutomationInspector`, drop onto
  multi-tiles appends steps). `EditorPage`/`AutomationsPage` removed (routes redirect). Deck uses the
  `AppShell` sidebar; deck actions moved into a rail next to the grid (`DeckGrid` `rail`). Live
  right-click menu (edit/delete, `deck/tileOps.ts`). Folders get an automatic "Startseite" tile
  (last row, centre). Volume level bar on keys. `.deck-key > *` ignores pointer events (fixes
  missing click/dblclick when the icon SVG re-rendered). Inspector rendered once per viewport
  (`useMediaQuery`).
- **Hotkeys:** `ButtonEntity.Hotkey` (unique, migration `ButtonHotkey`), format
  `Ctrl+Alt+Shift+Meta+<KeyboardEvent.code>`, validated server-side (standalone only F1–F24/numpad/
  media). `HotkeyRecorder`, key badge, shortcut overview; triggers any tile across decks while the
  deck page is focused.
- **Devices:** PC name (`Deck:HostName` / `COMPUTERNAME`) suggested at first setup (only to the
  bootstrap-eligible client); inline device rename; sidebar links own device to Devices.
- **start.ps1:** PS 5.1-safe compose calls, waits for Docker Desktop to release ports, fixed dev
  subnet `10.200.52.0/24` for the bootstrap allow-list.

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

## v2026.9.3 - 2026-09-28 21:29

Plugin-Installation (ZIP + Katalog), systemweite Tastenkürzel, Deck-Sicherung, Reiter „Streaming-Software“.

- **Plugin-Pakete:** `PluginPackage` prüft und entpackt ZIPs (manifest.json, nur Node-Startdateien
  `.js/.mjs/.ts`, Zip-Slip-Schutz, Größen-/Dateigrenzen, optional ein Wurzelordner). `PluginManager`
  (Hintergrunddienst) installiert/aktualisiert nach `{DataDir}/plugins/{id}` (`InstalledPluginEntity`,
  Migration `InstalledPlugins`), startet Plugins mit `node`, sobald Kestrel lauscht, übergibt
  `DECK_URL/DECK_KEY/DECK_PLUGIN_ID/DECK_PLUGIN_DIR`, führt ein 200-Zeilen-Protokoll, startet mit
  wachsender Pause neu und hält nach 5 schnellen Abstürzen an. `ChildProcessJob` (Windows-Job-Objekt,
  Kill-on-Close) beendet Plugins auch bei Absturz/hartem Beenden von Baton. `PluginCatalog` liest
  `Deck:PluginCatalogUrl` (Index mit `downloadUrl` + geprüftem `sha256`). `PluginsController`
  (`/api/plugins`: Installieren/Ein-Aus/Neustart/Deinstallieren/Protokoll/Katalog). Hub-Event
  `pluginsChanged`. Backend-Images enthalten Node.js 24 (`COPY --from=node:24-slim`).
- **Fix:** Plugin-WebSocket von `/plugins` nach `/ws/plugins` verlegt – er überdeckte die Seite
  „Plugins“, beim Neuladen kam die JSON-Fehlermeldung des Endpunkts.
- **Systemweite Tastenkürzel:** `GlobalHotkeyService` (nur Windows, `Deck:GlobalHotkeys`) meldet alle
  Kürzel per `RegisterHotKey` auf einem Thread mit Nachrichtenschleife an; `KeyboardEvent.code` wird
  über Scancode + `MapVirtualKeyEx` layoutsicher umgesetzt. Löst die Schritte serverseitig aus und
  sendet `keyTriggered`; von anderen Programmen belegte Kürzel über `GET /api/hotkeys/status`, Anzeige
  im Recorder. Neuregistrierung über das Event `HubNotifier.DecksChanged`.
- **Sicherung:** `BackupController` – `GET /api/backup/export[?deckId]` (versioniertes Format
  `baton-decks` v1 inkl. verknüpfter Automationen), `POST /api/backup/import` (legt immer zusätzlich an,
  biegt Ordner-/Automations-IDs um, lässt vergebene Kürzel aus, verwirft unbekannte Aktionen, ersetzt
  bei frischer Installation das unbenutzte Start-Deck). UI: `BackupCard` in den Einstellungen,
  „Exportieren“ in der Editor-Leiste.
- **Oberfläche:** neue Plugin-Seite (Reiter Installiert/Katalog, ZIP-Ablage mit Warnhinweis,
  Protokoll-Dialog, Entwickler-Bereich). Einstellungen: Karte „Streaming-Software“ mit Reitern OBS
  (funktionsfähig) / Streamlabs / XSplit (Platzhalter, bis testbar). Komponente `MadeWith`
  („Mit ♥ gemacht“ / „Made with ♥“, grünes Herz), `madeIn` aus `branding.json` entfernt.
- **Sonstiges:** `ActionStep.Mode` wird nicht mehr mitgespeichert (`[JsonIgnore]`); Drittanbieter-
  Hinweise enthalten die mitgelieferte Node.js-Laufzeit; Doku: Paket- und Katalogformat in
  `docs/PLUGIN_PROTOCOL.md`.

## v2026.9.2 - 2026-09-28 20:57

Closed-Source-Lizenz, automatische OBS-Einrichtung, Editor/Automationen im Deck, Tastenkürzel.

- **Fix – Repository war unvollständig:** Die `.gitignore`-Regel `data/` traf auch `backend/Data/`
  (Git ignoriert unter Windows Groß-/Kleinschreibung) – Datenmodell, `AppDbContext` und alle
  Migrationen fehlten in v2026.9.1. Regeln jetzt am Repo-Stamm verankert (`/data/`, `/keys/`,
  `/secrets/`), `backend/Data/` ist enthalten. Neu: `.gitattributes` (LF für `scripts/git-hooks/*`).
- **Lizenz/Compliance:** `LICENSE` ist jetzt eine proprietäre Freeware-EULA (DE/EN); Plugin-SDK und
  -Protokoll bleiben MIT. `scripts/generate-third-party-notices.ts` erzeugt `THIRD-PARTY-NOTICES.md`
  und `frontend/public/third-party-licenses.json` nur aus ausgelieferten Paketen (warnt bei Copyleft/
  unbekannt), sichtbar unter Einstellungen › Über (`AboutCard.tsx`). `SECURITY.md`,
  `docs/COMPLIANCE.md` (CRA, DSGVO, Impressum). `CONTRIBUTING.md` für Plugin-Autoren neu.
  Tailwind in die devDependencies verschoben.
- **OBS-Verbindung:** `ObsDiscovery` liest die obs-websocket-`config.json` (Port/Passwort) und
  übernimmt sie beim ersten Start; `POST /api/settings/obs/discover` sucht zusätzlich im LAN nach
  Port 4455 (Hello-Probe). Docker-Profile hängen die OBS-Konfiguration des Hosts schreibgeschützt
  ein. Ungültige Adresse/Port beendet den Dienst nicht mehr (`TryBuildUri`; vorher stoppte eine
  unbehandelte `UriFormatException` den Host), Loopback wird im Container auf `host.docker.internal`
  umgeleitet, IPv6 in Klammern, `host:port`/`ws://`-Eingaben werden beim Speichern zerlegt.
  Fehlermeldungen nennen den konkreten Grund.
- **OBS-Zustand/Aktionen:** Snapshot um Lautstärke (dB), Inputs, Medienquellen (läuft), Übergänge,
  Szenensammlungen und Profile erweitert (+ Events `InputVolumeChanged`, `MediaInput*`,
  `CurrentSceneTransitionChanged`, `CurrentProfileChanged`, Nachladen bei Sammlungs-/Übergangs-
  änderungen). Neue Aktionen: `obs.audio.volume` (lauter/leiser/fester dB-Wert), `obs.media`,
  `obs.filter`, `obs.source.refresh`, `obs.transition.set`, `obs.collection`, `obs.profile`,
  `obs.record.chapter`, `obs.record.split`, `automation.toggle`; Katalog-Kategorien `OBS · …`.
  `GET /api/settings/obs/filters`.
- **Automationen als Tasten:** `automation.toggle`-Tasten schalten eine Regel; ausgeschaltete
  Entwürfe dürfen leer sein; `GET /api/automation-states` für alle Geräte; Hub-Event
  `automationsChanged` bei jeder Änderung.
- **Oberfläche:** Deck, Editor und Automationen zusammengeführt – `DeckPage` rendert mit `?edit=1`
  `deck/DeckEditor.tsx` (gruppierte `Palette` mit Varianten-Chips, Kontextmenüs `TileMenu`,
  `AutomationInspector`, Ziehen auf Multifunktion hängt Schritte an). `EditorPage`/`AutomationsPage`
  entfernt (Routen leiten um). Deck nutzt die `AppShell`-Seitenleiste; Deck-Aktionen als Leiste am
  Raster (`DeckGrid` `rail`). Rechtsklick-Menü im Live-Deck (Bearbeiten/Löschen, `deck/tileOps.ts`).
  Ordner bekommen automatisch eine „Startseite“-Taste (letzte Reihe, mittig). Pegelbalken auf
  Lautstärke-Tasten. `.deck-key > *` ignoriert Zeiger-Ereignisse (behebt fehlendes click/dblclick,
  wenn das Icon-SVG neu gezeichnet wurde). Inspektor je Bildschirmgröße nur einmal gerendert
  (`useMediaQuery`).
- **Tastenkürzel:** `ButtonEntity.Hotkey` (eindeutig, Migration `ButtonHotkey`), Format
  `Ctrl+Alt+Shift+Meta+<KeyboardEvent.code>`, serverseitig geprüft (einzeln nur F1–F24/Ziffernblock/
  Medientasten). `HotkeyRecorder`, Etikett auf der Taste, Übersicht; löst jede Taste über alle
  Decks aus, solange das Deck im Vordergrund ist.
- **Geräte:** PC-Name (`Deck:HostName` / `COMPUTERNAME`) als Vorschlag bei der Ersteinrichtung (nur
  für den einrichtungsberechtigten Client); Geräte direkt umbenennen; eigener Name in der
  Seitenleiste verlinkt auf Geräte.
- **start.ps1:** PS-5.1-feste Compose-Aufrufe, wartet auf die Port-Freigabe durch Docker Desktop,
  festes Dev-Subnetz `10.200.52.0/24` für die Einrichtungs-Freigabe.

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
