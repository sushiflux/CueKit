# Changelog (dev)

**[English](#english) · [Deutsch](#deutsch)**

Every commit gets its own entry here (technical, for developers). The customer-facing summary per
release lives in `CHANGELOG.md`.

# English

## v2026.9.6 - 2026-09-29 12:00

Add a "System" action category (volume, browser, live hardware monitoring), bind automations to
existing buttons instead of a separate automation tile, make action/field pickers context-aware,
and redesign the toggle-state indicator.

- **System actions** (`backend/Hardware/`, Windows-only, same `[SupportedOSPlatform("windows")]`
  pattern as `GlobalHotkeyService`): `SystemVolumeService` (Core Audio COM interop) and
  `SystemMonitorService` (LibreHardwareMonitorLib) for CPU/GPU load+temp and RAM load;
  `SystemMonitorBroadcaster` pushes a `systemState` SignalR snapshot every ~2s, gated by
  `SetSystemMonitor(bool)` subscriptions. New `ContainerSystemMonitor` (Development-only, non-
  Windows) reads `/proc/stat`/`/proc/meminfo` for the container's own CPU/RAM as a dev-stack
  fallback so the ring gauges show live numbers without a native Windows run - clearly flagged via
  `SystemMonitorSnapshot.Error`, never used outside `IsDevelopment()`. New `ActionCatalog` entries
  `system.volume`, `system.mute`, `system.browser.open`, `system.monitor.display` (category
  `System`); `ActionDefinition.DisplayOnly` flags the monitor action as a pure display tile (no
  action-type dropdown, no field picker in `StepEditor` - the palette entry already fixes the
  metric). New `FieldKind.Url`, validated server-side (http/https only) before `Process.Start`.
  Frontend: new `Palette.tsx` "System" group, `RingGauge.tsx` (SVG progress ring, 300°/60° gap) for
  the three load metrics, plain icon+value layout kept for the two temperature metrics.
- **Automation moved from its own tile to a panel on the button itself**: `AutomationEntity` gets
  a nullable `ButtonId` FK (cascade delete) and a new trigger `button.pressed` (fires after a
  button's own action steps complete, see `AutomationEngine.NotifyButtonPressed`); new endpoint
  `GET /api/buttons/{id}/automation`. The old `kind: 'automation'` palette tile and its dedicated
  `AutomationInspector` are gone from the "create new" flow; a normal button's `Inspector` now has
  an "Aktion"/"Automation" tab pair (new `ButtonAutomationPanel.tsx`), shown side-by-side instead
  of tabbed once the editor panel is wide enough (≥1600px, panel grows from 24rem to 46rem).
  `automation.toggle` (independent, non-button-bound automations) is untouched.
- **Context-aware pickers** (`StepEditor.tsx`): changing an existing step's action type now
  defaults to only that action's own category (with a toggle to show the full catalog) instead of
  always listing every category; a `displayOnly` step (e.g. a monitor tile) shows neither the
  action-type dropdown nor its field picker at all, since the palette entry already fixes it
  completely - editing one no longer offers to turn a "RAM load" tile into "CPU load" or a volume
  action.
- **Toggle-state indicator redesign** (`index.css`, `DeckKey.tsx`): the LED is now always rendered
  for any button with a real on/off state (`buttonHasToggleState`), lit in red or green rather than
  only lit-or-invisible - matching how a real mixing console's status LEDs stay lit in both states.
  Recessed bezel + separate lens/highlight layers for a physical look, legible against every key
  color/theme. New alternative per-button style, a simulated toggle switch (`ButtonEntity.ToggleStyle`,
  `'led' | 'switch'`, chosen in the Inspector next to the color picker).
- **Sidebar info card hover fix** (`AppInfoHint.tsx`): the card kept accepting pointer events during
  its exit animation, so briefly re-entering its old screen position right after leaving would
  reopen it; now `pointer-events` is explicitly `none` outside the fully-open state.
- New `branding/` folder convention (global CLAUDE.md) for logo/wordmark source files, applied here
  (`branding/logo.svg` canonical, `frontend/public/logo.svg` a synced copy).

## v2026.9.5 - 2026-09-29 08:01

Redesigned the sidebar footer into one combined info card, added the `branding/` brand-assets folder convention.

- `AppShell.tsx`: removed `ObsStatusDot` (OBS connection line dropped from the footer) and the
  inline "made with"/copyright block; footer now just centers the new `AppInfoHint`.
- New `AppInfoHint.tsx`: info icon in the sidebar footer that opens a floating card (hover/focus/
  click) showing, top to bottom, `<MadeWith />`, a logo+product-name+version block, then the
  copyright line — order and single-card layout per explicit request.
- `MadeWith.tsx`: wrapped output in one `<span className="whitespace-nowrap">` so "Mit ♥ gemacht" /
  "Made with ♥" always renders inline instead of wrapping word-by-word in narrow flex columns.
- New standing rule in the global CLAUDE.md: every project gets a dedicated `branding/` folder at
  the repo root for logo/wordmark source files, alongside `branding.json`. Set up in CueKit itself:
  `branding/logo.svg` is now the canonical source, `frontend/public/logo.svg` a synced copy (noted
  in this project's `CLAUDE.md`).

## v2026.9.4 - 2026-09-28 21:42

Renamed the product from the working title "Baton" to **CueKit**, new Q logo, project CLAUDE.md.

- `branding.json`: `productName` "CueKit", tagline "Dein Stream. Auf den Punkt.". New
  `frontend/public/logo.svg` (Q whose amber tail crosses the ring – deliberately not a magnifier).
- Product name removed from code: frontend strings use `branding.productName`
  (`PluginsPage`, `SettingsPage`), backend messages/comments are neutral; plugin log marker
  `[Baton]` → `[System]`; `generate-third-party-notices.ts` reads the name from `branding.json`.
- Docs renamed: `LICENSE` (EULA), README, CONTRIBUTING, SECURITY, `docs/COMPLIANCE.md`,
  `docs/PLUGIN_PROTOCOL.md`, VERSIONS, QUELLEN, example plugin.
- Technical: Compose projects `cuekit` / `cuekit-live`, `start.ps1` registry key `cuekit`
  (global `ports.json` key renamed, ports unchanged); backup format `cuekit-decks`, legacy
  `baton-decks` files still importable.
- Added `CLAUDE.md` (commands, architecture, repo conventions).

## v2026.9.3 - 2026-09-28 21:30

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

## v2026.9.6 - 2026-09-29 12:00

Neue Aktions-Kategorie „System" (Lautstärke, Browser, Live-Hardware-Monitoring), Automationen
werden jetzt an bestehende Tasten gebunden statt an eine eigene Automations-Kachel, Aktions-/
Feld-Auswahl reagiert auf den Kontext, und das Toggle-Zustands-Symbol wurde neu gestaltet.

- **System-Aktionen** (`backend/Hardware/`, nur nativ unter Windows, gleiches
  `[SupportedOSPlatform("windows")]`-Muster wie `GlobalHotkeyService`): `SystemVolumeService`
  (Core-Audio-COM-Interop) und `SystemMonitorService` (LibreHardwareMonitorLib) für CPU-/
  GPU-Auslastung+Temperatur sowie RAM-Auslastung; `SystemMonitorBroadcaster` sendet alle ~2s einen
  `systemState`-Schnappschuss per SignalR, nur solange mindestens ein Gerät per
  `SetSystemMonitor(bool)` abonniert hat. Neuer `ContainerSystemMonitor` (nur `Development`,
  Nicht-Windows) liest `/proc/stat`/`/proc/meminfo` für die eigenen Container-Werte als
  Entwickler-Notbehelf, damit die Ring-Anzeigen im Docker-Dev-Stack ohne nativen Windows-Lauf Live-
  Zahlen zeigen - klar über `SystemMonitorSnapshot.Error` gekennzeichnet, nie außerhalb von
  `IsDevelopment()` aktiv. Neue `ActionCatalog`-Einträge `system.volume`, `system.mute`,
  `system.browser.open`, `system.monitor.display` (Kategorie „System"); `ActionDefinition.DisplayOnly`
  markiert die Monitor-Aktion als reine Anzeige-Kachel (kein Aktionstyp-Dropdown, kein Feld-Picker
  im `StepEditor` - der Kennwert steht durch den Palette-Eintrag schon fest). Neuer `FieldKind.Url`,
  serverseitig geprüft (nur http/https) vor `Process.Start`. Frontend: neue „System"-Gruppe in
  `Palette.tsx`, `RingGauge.tsx` (SVG-Fortschrittsring, 300°/60°-Lücke) für die drei
  Auslastungswerte, unverändertes Icon+Zahl-Layout für die beiden Temperaturwerte.
- **Automation von eigener Kachel zu einem Bereich an der Taste selbst verschoben**:
  `AutomationEntity` bekommt eine nullable `ButtonId`-FK (Cascade-Delete) und einen neuen Trigger
  `button.pressed` (feuert, nachdem die eigenen Aktionsschritte der Taste durchgelaufen sind, siehe
  `AutomationEngine.NotifyButtonPressed`); neuer Endpunkt `GET /api/buttons/{id}/automation`. Die
  alte `kind: 'automation'`-Palette-Kachel samt eigenem `AutomationInspector` ist aus dem
  Neuanlage-Fluss verschwunden; der `Inspector` einer normalen Taste hat jetzt ein „Aktion"/
  „Automation"-Tab-Paar (neu: `ButtonAutomationPanel.tsx`), ab genug Breite (≥1600px, Panel wächst
  von 24rem auf 46rem) nebeneinander statt als Tabs. `automation.toggle` (eigenständige, nicht
  tastengebundene Automationen) bleibt unverändert.
- **Kontextsensitive Auswahlfelder** (`StepEditor.tsx`): Beim Ändern des Aktionstyps eines
  bestehenden Schritts wird standardmäßig nur die eigene Kategorie gezeigt (mit Umschalter für den
  vollen Katalog) statt immer aller Kategorien; ein `displayOnly`-Schritt (z.B. eine Monitor-Kachel)
  zeigt weder das Aktionstyp-Dropdown noch sein Feld-Auswahlfeld, da der Palette-Eintrag das schon
  vollständig festlegt - eine „RAM-Auslastung"-Kachel lässt sich nicht mehr nachträglich zu
  „CPU-Auslastung" oder einer Lautstärke-Aktion umbiegen.
- **Neugestaltung der Toggle-Zustandsanzeige** (`index.css`, `DeckKey.tsx`): Die LED wird jetzt
  immer für jede Taste mit echtem An/Aus-Zustand gerendert (`buttonHasToggleState`), rot oder grün
  leuchtend statt nur leuchtend-oder-unsichtbar - wie bei einem echten Mischpult, dessen Status-LEDs
  in beiden Zuständen leuchten. Eingelassene Fassung + getrennte Linsen-/Glanzpunkt-Ebenen für einen
  physischen Look, gut lesbar auf jeder Tastenfarbe/jedem Theme. Neuer alternativer, pro Taste
  wählbarer Stil, ein simulierter Kippschalter (`ButtonEntity.ToggleStyle`, `'led' | 'switch'`, im
  Inspector neben der Farbauswahl wählbar).
- **Hover-Fehler der Info-Karte in der Seitenleiste behoben** (`AppInfoHint.tsx`): Die Karte nahm
  während ihrer Ausblend-Animation weiterhin Zeigerereignisse an, wodurch ein kurzes erneutes
  Überfahren derselben Stelle sie direkt nach dem Verlassen wieder öffnete; `pointer-events` ist
  jetzt außerhalb des vollständig geöffneten Zustands explizit `none`.
- Neue `branding/`-Ordner-Konvention (globale CLAUDE.md) für Logo-/Wortmarken-Quelldateien, hier
  umgesetzt (`branding/logo.svg` als kanonische Quelle, `frontend/public/logo.svg` eine
  synchronisierte Kopie).

## v2026.9.5 - 2026-09-29 08:01

Fuß der Seitenleiste zu einer kombinierten Info-Karte überarbeitet, Konvention für einen
Marken-Assets-Ordner (`branding/`) eingeführt.

- `AppShell.tsx`: `ObsStatusDot` entfernt (OBS-Verbindungszeile raus aus dem Fuß) sowie den
  eingebetteten „Mit ♥ gemacht“/Copyright-Block; der Fuß zentriert jetzt nur noch die neue
  `AppInfoHint`.
- Neu `AppInfoHint.tsx`: Info-Symbol im Seitenleisten-Fuß, das per Hover/Fokus/Klick eine
  schwebende Karte öffnet – von oben nach unten `<MadeWith />`, ein Block mit Logo, Produktname
  und Version, darunter die Copyright-Zeile (Reihenfolge und einheitliche Karte wie ausdrücklich
  gewünscht).
- `MadeWith.tsx`: Ausgabe in ein einzelnes `<span className="whitespace-nowrap">` gepackt, damit
  „Mit ♥ gemacht“ / „Made with ♥“ immer nebeneinander steht statt in schmalen Flex-Spalten
  wortweise umzubrechen.
- Neue Standardregel in der globalen CLAUDE.md: jedes Projekt bekommt einen festen `branding/`-
  Ordner im Repo-Stamm für Logo-/Wortmarken-Quelldateien, neben `branding.json`. In CueKit selbst
  umgesetzt: `branding/logo.svg` ist jetzt die kanonische Quelle, `frontend/public/logo.svg` eine
  synchronisierte Kopie (im Projekt-`CLAUDE.md` vermerkt).

## v2026.9.4 - 2026-09-28 21:42

Produkt vom Arbeitstitel „Baton“ in **CueKit** umbenannt, neues Q-Logo, Projekt-CLAUDE.md.

- `branding.json`: `productName` „CueKit“, Slogan „Dein Stream. Auf den Punkt.“. Neues
  `frontend/public/logo.svg` (Q, dessen gelber Schweif durch den Ring läuft – bewusst keine Lupe).
- Produktname aus dem Code entfernt: Frontend-Texte nutzen `branding.productName`
  (`PluginsPage`, `SettingsPage`), Meldungen/Kommentare im Dienst sind neutral; Plugin-Protokoll-
  Markierung `[Baton]` → `[System]`; `generate-third-party-notices.ts` liest den Namen aus `branding.json`.
- Dokumente umbenannt: `LICENSE` (EULA), README, CONTRIBUTING, SECURITY, `docs/COMPLIANCE.md`,
  `docs/PLUGIN_PROTOCOL.md`, VERSIONS, QUELLEN, Beispiel-Plugin.
- Technik: Compose-Projekte `cuekit` / `cuekit-live`, `start.ps1`-Registry-Schlüssel `cuekit`
  (Schlüssel in der globalen `ports.json` umbenannt, Ports unverändert); Sicherungsformat
  `cuekit-decks`, alte `baton-decks`-Dateien bleiben importierbar.
- Neu: `CLAUDE.md` (Befehle, Architektur, Repo-Konventionen).

## v2026.9.3 - 2026-09-28 21:30

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
