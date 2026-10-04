# Changelog (dev)

**[English](#english) · [Deutsch](#deutsch)**

Every commit gets its own entry here (technical, for developers). The customer-facing summary per
release lives in `CHANGELOG.md`.

# English

## v2026.10.13-dev – 2026-10-04 10:07:00

SushiFlux Limited Edition (Dark & Snow), animated desk reflections, and curved LED strips without blinking.

- **SushiFlux Limited Edition Enclosures** (`HousePlate.tsx`, `housePlates.ts`, `index.css`): Added exclusive "SushiFlux Limited Edition" (`sushiflux`) and "SushiFlux Limited Edition Snow" (`sushiflux_snow`) as selectable physical chassis variants in the Appearance > Chassis settings.
  - **Dark Edition**: Obsidian-black chassis (`#020617`) with a `bg-black/80` keybed and orange (`#fb923c`) sheen.
  - **Snow Edition**: Bright white chassis (`#f1f5f9`) with a heavily contrasting dark keybed (`bg-slate-900/90`) and crisp shadows.
  - **Dynamic Underglow (Desk Reflection)**: Both variants cast a massive, soft `-inset-3` glow (`blur-2xl`) onto the desk behind the Stream Deck. Direct side LED strips were completely removed, leaving only the indirect shining effect ("Underglow").
  - **Curved Bottom LED Strip**: The hardware light bar at the bottom edge was rebuilt so the glow perfectly follows the rounded bottom corners of the deck (via `WebkitMask` with `linear-gradient` border clipping on `rounded-b-3xl`).
- **Non-blinking Gradient Animations** (`index.css`, `HousePlate.tsx`): All SushiFlux-specific lighting effects (header text, desk underglow, bottom LED curve) now use the newly added, fluid `animate-sf-gradient` CSS animation (background gradient shift from orange to rose to cyan via `background-position`), while the disruptive blinking (`animate-sf-pulse`) has been entirely removed.
- **Backend Prep for SushiFlux Custom Colors** (`SettingsService.cs`, `AppearanceController.cs`, `api/types.ts`): Extended `AppearanceSettings` / `AppearanceDto` with a new `SushiFluxColors` string array field to prepare for the upcoming UI color customizer.

## v2026.10.12-dev – 2026-10-03 01:35:58

Symmetrical corner LED and under-key diffusor backlight indicators, CueDeck Studio Pro physical chassis enclosure, and 4K 60fps marketing video pipeline with dedicated showcase scene.

- **Toggle indicator styles** (`frontend/src/components/DeckKey.tsx`, `frontend/src/index.css`, `frontend/src/pages/AppearancePage.tsx`, `frontend/src/api/types.ts`, `backend/Controllers/AppearanceController.cs`, `backend/Services/SettingsService.cs`): Extended `volumeIndicator` (`'led' | 'level' | 'corner' | 'glow'`) to 4 selectable hardware-inspired options in Appearance > "Zustandsdarstellung":
  - **Option 3: Eck-LED (`corner`)**: Rounded corner indicator positioned in the top-right corner of toggle keys. Designed with exact symmetrical radii (`border-top-right-radius: inherit; border-bottom-left-radius: var(--radius-key); border-top-left-radius: 0; border-bottom-right-radius: 0;`), multi-stop lens illumination, brushed chrome rim, glare specular highlight, and saturated LED diode core.
  - **Option 4: Diffusor-LED (`glow`)**: Stream Deck style under-key backlight diffusion with an intense central diode hotspot beneath the keycap, smooth radial falloff/vignette toward the edges (`radial-gradient`), and keycap edge bloom.
  - Backend validation in `SettingsService.ValidVolumeIndicators` and `AppearanceController.ValidVolumeIndicators` updated to accept `"corner"` and `"glow"`.
- **CueDeck Studio Pro enclosure plate** (`HousePlate.tsx`, `housePlates.ts`, `index.css`, `DeckPage.tsx`): Added CNC-milled physical desk chassis enclosure selectable under Appearance > Gehäuse (`studio-pro`). Features chamfered edge highlights, 4 hex corner screws, recessed key-well bed with brushed metal texture, dynamic status display bar (pulsing green power LED, current profile name, active key count), and subtle ambient RGB desk underglow.
- **4K marketing video pipeline** (`frontend/src/pages/MarketingVideo.tsx`, `frontend/src/App.tsx`, `marketing/video/`): Dedicated `/showcase` route and Node.js/FFmpeg automation pipeline (`render.mjs`, `render.ps1`, `soundtrack.mjs`) for deterministic 4K UHD (3840×2160) 60fps video capture via Chrome DevTools Protocol and hardware-accelerated NVIDIA NVENC encoding.
- **Post-commit hook & gitignore** (`scripts/git-hooks/post-commit`, `.gitignore`): Updated post-commit hook to maintain `-dev` suffix and seconds in changelog stamps; gitignore extended for marketing build artifacts and render outputs.
- **DOM nesting fix** (`AppearancePage.tsx`): Replaced nested `<p>` inside the indicator description with `<span>` to eliminate browser DOM nesting warnings.

## v2026.10.11 - 2026-10-01 01:49

Android app (pairing by QR code, image or typed code), faster system-mute feedback, house plate without screws and with metal between the keys, selectable state style (fill / icon only) with theme-checked contrast, smooth gradient on load rings, grey keys when the streaming software is not connected.

- **Android app** (`android/`, Kotlin WebView shell, minSdk 26): `MainActivity` + bundled start page `assets/connect/index.html` with three pairing paths - camera (`GmsBarcodeScanning`, no own camera permission), QR from an image (`BarcodeScanning` on `InputImage`, picked via `PickVisualMedia`) and address + code entry. Parses the existing pairing URL (`/pair?code=`), remembers the base address, loads the server UI full screen with the screen kept on, back-button menu to re-pair, connection errors with the concrete reason and retry. The `CueKitApp` JS bridge only acts on the bundled page. Cleartext HTTP allowed for the LAN (`network_security_config.xml`). Name/version from `branding.json`/`version.txt` in Gradle, logo copied from `branding/`. Built in Docker: `scripts/android-build.ps1` + `scripts/android-build-container.sh` (SDK cached in a volume), `scripts/android-icons.ps1`; `.gitignore` and `.gitattributes` (`*.sh` as LF) extended.
- **Devices page**: pairing is now the first card ("Neues Gerät koppeln" with "QR-Code anzeigen") instead of a header button that was easy to overlook; the pairing dialog names the app, shows address + code for manual entry and points to Settings > Network if the phone cannot connect.
- **Faster system mute/volume**: `SystemMonitorBroadcaster.WatchVolumeAsync` polls the Windows volume every 150 ms (only while someone watches) and pushes `systemState` immediately on a change; new `ISystemMonitor.RefreshVolume()` updates just the volume fields (before: only with the 2 s sensor tick).
- **House plate**: screws removed (`HousePlate.tsx`, `screwTone` dropped from `lib/housePlates.ts`, CSS removed); the brushed metal now runs under and between the keys, each key sits in a cut-out (`.house-plate-slot`, `DeckGrid` uses a larger gap when framed).
- **State style** (Appearance > "Zustandsdarstellung", setting `appearance.stateStyle` = `fill`|`icon`, `AppearanceController`/`SettingsService`, optional in the input for older clients): *fill* = on green, off red, white symbol/text; *icon only* = neutral key body, symbol/text/edge in state colour (tokens `--c-state-on-text`/`--c-state-off-text`, checked per theme: light >= 5.5:1, dark >= 6:1). `buttonStateKind()` separates on/off keys (off = red) from selections such as scenes (never red). `DeckKey` gets `stateStyle`, LED/status bar follow `data-led`. Light-theme fill tones are more saturated (4 % white instead of 28 %: white text >= 4.5:1); the red state uses pure white text/symbol (no pink tint) with a subtle shadow.
- **Load rings** (`RingGauge.tsx`): smooth green -> orange -> red gradient along the ring (60 slices coloured with `color-mix` in oklab) instead of three hard zones.
- **Keys without streaming software**: `isButtonUnavailable` (now via `STREAMING_SOFTWARE_PREFIXES`, ready for Streamlabs/XSplit) keys are fully greyscale (`grayscale(1)`) and a press in `DeckPage.press` only shows a hint - no server call, no shake. Keys with other steps (open browser, ...) keep working.
- Docs: `CLAUDE.md` (Android, platform/stack decision), `VERSIONS.md` (Android rows, latest not yet checked), `QUELLEN.md` (Android section). Not yet covered: third-party notices for the APK, Android release signing, real-device test of camera/image pairing.

## v2026.10.10 - 2026-10-01 00:30

Microsoft Store packaging (MSIX) and the release-candidate changelog.

- `scripts/desktop-msix.ps1`: stages `artifactsdesktop` plus a generated `AppxManifest.xml` (identity/publisher from the Partner Center via parameters, `runFullTrust`, `internetClient`, `privateNetworkClientServer`), logos from `branding/icon.ico`, packs with `makeappx`; `-TestSign` creates a self-signed cert for local sideload. Output stays unsigned for the Store upload.
- `Native.IsPackaged` (`GetCurrentPackageFullName`): in a package the tray menu hides "Mit Windows starten" (HKCU Run does not work there) and the Velopack update entries (the Store updates). Autostart via a manifest `StartupTask` is still open.
- `CHANGELOG.rc.md` (new): customer-readable changelog for release candidates, first section `v2026.9.9-rc1` covering everything since project start; the same text is the draft release notes.
- Docs: `CLAUDE.md` (MSIX command, packaged behaviour), `QUELLEN.md` (Partner Center/MSIX row). Public `cuekit-releases` repo created separately (README, privacy policy via GitHub Pages) for the Store listing and later updates.

## v2026.9.9 - 2026-09-30 17:48

First Windows release candidate (tag `-rc1`); pass the target runtime to Velopack.

- `scripts/desktop-pack.ps1`: `vpk pack --runtime win-x64` so the installer no longer falls back to the x86 default runtime check.
- Hook-stamped version files (`version.txt`, `backend/version.txt`) for v2026.9.8 and the changelog heading time.

## v2026.9.8 - 2026-09-30 17:46

Add the Windows desktop shell with a Velopack installer and a release workflow, live audio level meters, house plates instead of the deck background, new System actions, and OBS-offline handling.

- **Desktop shell** (`desktop/Deck.Desktop`, WinForms + WebView2, net10.0-windows): `ServiceHost` runs `ServerHost.Build` in-process; tray icon, single instance (named mutex + show event), close-to-tray, autostart (HKCU Run with `--tray`), persisted window bounds, dark title bar. Exe name/company/version come only from `branding.json`/`version.txt` (MSBuild property functions). `EulaGate` confirms `LICENSE` on first start, `UpdateService` (Velopack, `Deck:UpdateFeedUrl`, `--auto-update`, restart keeps the start args), `AppLog` (desktop.log). Backend: `ServerHost.ResolveDataDir`, `AddApplicationPart` so controllers are found when embedded.
- **Installer/CI**: `scripts/desktop-build.ps1`, `scripts/desktop-pack.ps1` (Velopack `vpk` via local tool manifest `desktop/dotnet-tools.json`), `branding/icon.ico`, `branding/installer-splash.png`, `.github/workflows/release.yml` (tag `v*-rcN` -> draft release, `v*` -> release, optional mirror to a public releases repo via `RELEASES_REPO`), `docs/DISTRIBUTION.md` (installer decision, SmartScreen/signing options, private-repo update feed), `.gitignore` (artifacts, signing keys). The third-party notices generator also scans the desktop project. Verified locally: install, uninstall (incl. autostart cleanup); update flow and the pack step in this environment are not verified (vpk post-process hit "access denied").
- **Live level meters**: obs-websocket `InputVolumeMeters` (subscription toggled via Reidentify, `ObsService.SetMetersWanted`, `ObsMeterLevel(Peak, InputPeak)`), `SystemVolumeService.ReadPeakDb` (IAudioMeterInformation), `MeterBroadcaster` + `DeckHub.SetMeters`; frontend `state/meters.ts` and `KeyMeter` in `DeckKey` (green/orange/red zones like OBS, gray input level while muted). Volume bar and meter only on source (mute) keys, not on volume up/down keys.
- **House plates** replace the deck background: `HousePlate.tsx`, `lib/housePlates.ts`, `DeckGrid` `frame`/`frameInset`; photo/pattern backgrounds and the image upload endpoints removed, `AppearanceController` reduced to `plate`. `SettingsService.SetManyAsync` + SQLite WAL fix multi-second appearance saves.
- **System actions**: `system.program.open`, `system.path.open`, `system.shutdown` (normal `/s /t 0`, force `/s /f /t 0`); palette order OBS, System, plugins, Deck; key labels shrink to fit instead of wrapping mid-word (`useFitLabel`).
- **OBS offline**: `ActionExecutor.ExecuteAsync` skips OBS steps when OBS is not connected and still runs the others (`PressResult.Notice`); OBS-only keys are dimmed (`isButtonUnavailable`, `data-unavailable`).
- Also: stronger pressed-key feedback and per-theme edge colors, live preview removed (`PreviewSubscribers`, screenshot loop, FPS setting), browser-side hotkey listener removed (service-side global hotkeys stay), sidebar info block without box, unused upload helpers removed.

## v2026.9.7 - 2026-09-29 19:11

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
- **Toggle-state indicator redesign** (`index.css`, `DeckKey.tsx`): normal deck buttons now always
  show a physical recessed LED for a real on/off state (`buttonHasToggleState`), lit red or green
  instead of lit-or-invisible. Separate bezel, lens, highlight and glow layers keep the indicator
  legible against every key color and theme. Press behavior remains globally selectable between
  spring return and staying visually pressed for stateful buttons.
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

## v2026.10.13-dev – 2026-10-04 10:07:00

SushiFlux Limited Edition (Dark & Snow), animierte Tisch-Reflektionen und geschwungene LED-Streifen ohne Blinken.

- **SushiFlux Limited Edition Gehäuse** (`HousePlate.tsx`, `housePlates.ts`, `index.css`): Zusätzliche exklusive "SushiFlux Limited Edition" (Modell `sushiflux`) und "SushiFlux Limited Edition Snow" (Modell `sushiflux_snow`) als wählbare physische Gehäuse unter Aussehen > Gehäuse integriert.
  - **Dark Edition**: Tiefschwarzes Gehäuse (`#020617`) mit `bg-black/80` Tastenwanne und orangenem (`#fb923c`) Glanzlicht.
  - **Snow Edition**: Helles, weißes Gehäuse (`#f1f5f9`) mit stark kontrastierendem dunklen Tastenbett (`bg-slate-900/90`) und eisigen, dezenten Schatten.
  - **Dynamisches Underglow (Tisch-Reflektion)**: Beide Varianten werfen einen massiven, weichen `-inset-3` Glow (`blur-2xl`) auf den Tisch hinter dem Stream Deck. Seitliche direkte LED-Leisten wurden komplett entfernt, sodass nur noch der indirekte Shining-Effekt ("Unterbodenbeleuchtung") sichtbar bleibt.
  - **Geschwungener unterer LED-Streifen**: Die Hardware-Leiste am unteren Rand des Decks wurde so umgebaut, dass der Leuchtstreifen exakt der Abrundung der unteren Ecken des Decks folgt (`WebkitMask` mit `linear-gradient` border clipping auf `rounded-b-3xl`).
- **Nicht-blinkende Verlauf-Animationen** (`index.css`, `HousePlate.tsx`): Alle SushiFlux-spezifischen Lichteffekte (Header-Text, Tisch-Underglow, untere LED-Leiste) nutzen jetzt die neu hinzugefügte, flüssige `animate-sf-gradient` CSS-Animation (Hintergrund-Farbverlauf von Orange über Rosa zu Cyan, animiert über `background-position`), das als störend empfundene Blinken (`animate-sf-pulse`) wurde restlos entfernt.
- **Backend Vorbereitung für SushiFlux Custom Colors** (`SettingsService.cs`, `AppearanceController.cs`, `api/types.ts`): Die Datenstruktur `AppearanceSettings` / `AppearanceDto` wurde um ein neues Feld `SushiFluxColors` (String-Array) erweitert, um den Nutzern später im UI die Farbgestaltung des SushiFlux-Farbverlaufs zu ermöglichen.

## v2026.10.12-dev – 2026-10-03 01:35:58

Symmetrische Eck-LED und Diffusor-Tastenhintergrundbeleuchtung, physisches CueDeck Studio Pro Chassis-Gehäuse sowie 4K-60fps-Marketing-Videopipeline mit dedizierter Showcase-Szene.

- **Umschalt-Zustandsindikatoren** (`frontend/src/components/DeckKey.tsx`, `frontend/src/index.css`, `frontend/src/pages/AppearancePage.tsx`, `frontend/src/api/types.ts`, `backend/Controllers/AppearanceController.cs`, `backend/Services/SettingsService.cs`): Einstellung `volumeIndicator` (`'led' | 'level' | 'corner' | 'glow'`) unter Aussehen > „Zustandsdarstellung“ auf 4 hardware-inspirierte Optionen erweitert:
  - **Option 3: Eck-LED (`corner`)**: Abgerundeter Ecken-Indikator in der oberen rechten Ecke von Umschalt-Tasten. Besitzt exakt symmetrische Radien (`border-top-right-radius: inherit; border-bottom-left-radius: var(--radius-key); border-top-left-radius: 0; border-bottom-right-radius: 0;`), mehrstufige Linsen-Ausleuchtung, gebürstete Chrom-Einfassung, Glanzlicht-Reflexion und eine gesättigte LED-Kerndiode.
  - **Option 4: Diffusor-LED (`glow`)**: Tasten-Hintergrundbeleuchtung im Stream-Deck-Stil mit intensivem zentralem Dioden-Hotspot unter der Tastenkappe, weichem radialem Helligkeitsabfall zu den Rändern (`radial-gradient`) und Kappen-Innenbloom.
  - Backend-Validierung in `SettingsService.ValidVolumeIndicators` und `AppearanceController.ValidVolumeIndicators` um `"corner"` und `"glow"` erweitert.
- **CueDeck Studio Pro Gehäuse** (`HousePlate.tsx`, `housePlates.ts`, `index.css`, `DeckPage.tsx`): Neues physisches Desk-Chassis unter Aussehen > Gehäuse (`studio-pro`) wählbar. Mit CNC-Aluminium-Fasen, 4 Sechskantschrauben in den Ecken, versenkter Tastenwanne in gebürstetem Metall, dynamischer Statusleiste (pulsierende grüne Betriebs-LED, Profilname, Tastenanzahl) und dezentem RGB-Unterbodenlicht.
- **4K-Marketing-Videopipeline** (`frontend/src/pages/MarketingVideo.tsx`, `frontend/src/App.tsx`, `marketing/video/`): Eigene `/showcase`-Route und Node.js/FFmpeg-Automationspipeline (`render.mjs`, `render.ps1`, `soundtrack.mjs`) für bildgenaue 4K-UHD-Aufzeichnung (3840×2160 bei 60 fps) über Chrome DevTools Protocol und hardwarebeschleunigtes NVIDIA NVENC Encoding.
- **Post-Commit-Hook & Gitignore** (`scripts/git-hooks/post-commit`, `.gitignore`): Post-Commit-Hook aktualisiert, um das `-dev`-Suffix und sekundengenaue Zeitstempel im Dev-Changelog zu sichern; Gitignore um Marketing-Build-Artefakte und Render-Ausgaben erweitert.
- **DOM-Verschachtelungs-Korrektur** (`AppearancePage.tsx`): Verschachteltes `<p>` innerhalb des Beschreibungs-`<p>` durch `<span>` ersetzt, um Browser-Warnungen zu beheben.

## v2026.10.11 - 2026-10-01 01:49

Android-App (Kopplung per QR-Code, Bild oder Code), schnellere Stumm-Anzeige des Systems, Gehäuse ohne Schrauben und mit Metall zwischen den Tasten, wählbare Zustandsdarstellung (Vollfläche / nur Symbol) mit je Design geprüftem Kontrast, weicher Farbverlauf an den Auslastungsringen, graue Tasten ohne Verbindung zur Streaming-Software.

- **Android-App** (`android/`, Kotlin-WebView-Hülle, minSdk 26): `MainActivity` + gebündelte Startseite `assets/connect/index.html` mit drei Kopplungswegen - Kamera (`GmsBarcodeScanning`, keine eigene Kamera-Berechtigung), QR-Code aus einem Bild (`BarcodeScanning` auf `InputImage`, Auswahl per `PickVisualMedia`) und Adresse + Code eintippen. Liest die vorhandene Kopplungs-URL (`/pair?code=`), merkt die Basisadresse, lädt die Server-Oberfläche im Vollbild mit aktivem Bildschirm, Zurück-Menü zum Neu-Koppeln, Verbindungsfehler mit konkretem Grund und "Erneut versuchen". Die JS-Brücke `CueKitApp` wirkt nur auf der gebündelten Seite. Klartext-HTTP im WLAN erlaubt (`network_security_config.xml`). Name/Version aus `branding.json`/`version.txt` in Gradle, Logo aus `branding/` kopiert. Build in Docker: `scripts/android-build.ps1` + `scripts/android-build-container.sh` (SDK im Volume), `scripts/android-icons.ps1`; `.gitignore` und `.gitattributes` (`*.sh` als LF) erweitert.
- **Geräte-Seite**: Koppeln ist jetzt die erste Karte ("Neues Gerät koppeln" mit "QR-Code anzeigen") statt eines leicht zu übersehenden Knopfes in der Kopfzeile; das Kopplungsfenster nennt die App, zeigt Adresse + Code zum Eintippen und verweist auf Einstellungen > Netzwerk, falls das Handy nicht verbindet.
- **Schnellere System-Stumm/Lautstärke**: `SystemMonitorBroadcaster.WatchVolumeAsync` prüft die Windows-Lautstärke alle 150 ms (nur solange jemand zuschaut) und sendet bei Änderung sofort `systemState`; neu `ISystemMonitor.RefreshVolume()` aktualisiert nur die Lautstärke-Felder (vorher nur im 2-Sekunden-Takt der Sensoren).
- **Gehäuse**: Schrauben entfernt (`HousePlate.tsx`, `screwTone` aus `lib/housePlates.ts` entfernt, CSS gelöscht); das gebürstete Metall läuft unter und zwischen den Tasten durch, jede Taste sitzt in einer Aussparung (`.house-plate-slot`, `DeckGrid` nutzt mit Gehäuse einen größeren Abstand).
- **Zustandsdarstellung** (Aussehen > "Zustandsdarstellung", Einstellung `appearance.stateStyle` = `fill`|`icon`, `AppearanceController`/`SettingsService`, im Input optional für ältere Clients): *Vollfläche* = an grün, aus rot, weißes Symbol/Text; *Nur Symbol* = neutraler Tastenkörper, Symbol/Text/Kante in Zustandsfarbe (Tokens `--c-state-on-text`/`--c-state-off-text`, je Design geprüft: hell >= 5,5:1, dunkel >= 6:1). `buttonStateKind()` trennt An/Aus-Tasten (aus = rot) von Auswahlen wie Szenen (nie rot). `DeckKey` bekommt `stateStyle`, LED/Statusstrich folgen `data-led`. Helles Design: Vollflächen-Töne kräftiger (4 % Weiß statt 28 %: weiße Schrift >= 4,5:1); der rote Zustand nutzt reines Weiß für Text/Symbol (kein Rosa-Stich) mit dezentem Schatten.
- **Auslastungsringe** (`RingGauge.tsx`): weicher Verlauf grün -> orange -> rot entlang des Rings (60 Scheiben, per `color-mix` in oklab eingefärbt) statt dreier harter Zonen.
- **Tasten ohne Streaming-Software**: `isButtonUnavailable` (jetzt über `STREAMING_SOFTWARE_PREFIXES`, vorbereitet für Streamlabs/XSplit) - solche Tasten sind vollständig grau (`grayscale(1)`), ein Druck in `DeckPage.press` zeigt nur einen Hinweis - kein Serveraufruf, kein Wackeln. Tasten mit anderen Schritten (Browser öffnen usw.) funktionieren weiter.
- Doku: `CLAUDE.md` (Android, Plattform-/Stack-Entscheidung), `VERSIONS.md` (Android-Zeilen, "Latest" noch nicht geprüft), `QUELLEN.md` (Android-Abschnitt). Noch offen: Drittanbieter-Lizenzen für die APK, Android-Release-Signatur, Test von Kamera-/Bild-Kopplung auf einem echten Gerät.

## v2026.10.10 - 2026-10-01 00:30

Microsoft-Store-Paket (MSIX) und der Changelog für Release-Kandidaten.

- `scripts/desktop-msix.ps1`: baut aus `artifactsdesktop` plus erzeugter `AppxManifest.xml` (Identität/Herausgeber als Parameter aus dem Partner Center, `runFullTrust`, `internetClient`, `privateNetworkClientServer`), Logos aus `branding/icon.ico`, Packen mit `makeappx`; `-TestSign` erzeugt ein selbst signiertes Zertifikat für lokales Sideload. Die Ausgabe bleibt für den Store-Upload unsigniert.
- `Native.IsPackaged` (`GetCurrentPackageFullName`): im Paket blendet das Tray-Menü „Mit Windows starten“ (HKCU-Run funktioniert dort nicht) und die Velopack-Update-Einträge aus (der Store aktualisiert). Autostart über einen `StartupTask` im Manifest ist noch offen.
- `CHANGELOG.rc.md` (neu): kundenverständlicher Changelog für Release-Kandidaten, erster Abschnitt `v2026.9.9-rc1` mit allem seit Projektstart; derselbe Text ist die Release-Notiz des Entwurfs.
- Doku: `CLAUDE.md` (MSIX-Befehl, Verhalten im Paket), `QUELLEN.md` (Zeile Partner Center/MSIX). Das öffentliche Repo `cuekit-releases` (README, Datenschutzerklärung über GitHub Pages) wurde separat für den Store-Eintrag und spätere Updates angelegt.

## v2026.9.9 - 2026-09-30 17:48

Erster Windows-Release-Kandidat (Tag `-rc1`); Ziel-Runtime an Velopack uebergeben.

- `scripts/desktop-pack.ps1`: `vpk pack --runtime win-x64`, damit der Installer nicht auf die x86-Voreinstellung zurueckfaellt.
- Vom Hook geschriebene Versionsdateien (`version.txt`, `backend/version.txt`) fuer v2026.9.8 und die Uhrzeit der Changelog-Ueberschrift.

## v2026.9.8 - 2026-09-30 17:46

Windows-Desktop-Hülle mit Velopack-Installer und Release-Workflow, Live-Pegelanzeige, Gehäuse-Plates statt Deck-Hintergrund, neue System-Aktionen und OBS-offline-Verhalten.

- **Desktop-Hülle** (`desktop/Deck.Desktop`, WinForms + WebView2): hostet den Dienst im selben Prozess, Tray-Symbol, Einzelinstanz, Schließen schickt ins Tray, Autostart (`--tray`), Fensterposition gemerkt, dunkle Titelleiste. Exe-Name/Firma/Version nur aus `branding.json`/`version.txt`. `EulaGate` (Lizenz beim ersten Start), `UpdateService` (Velopack, `Deck:UpdateFeedUrl`, `--auto-update`, Neustart behält die Startargumente), `AppLog`. Backend: `ServerHost.ResolveDataDir`, `AddApplicationPart`.
- **Installer/CI**: `scripts/desktop-build.ps1`, `scripts/desktop-pack.ps1` (Velopack), Icon und Splash unter `branding/`, `.github/workflows/release.yml` (Tag `v*-rcN` = privater Entwurf, `v*` = Release, optionale Spiegelung ins öffentliche Release-Repo), `docs/DISTRIBUTION.md`, `.gitignore` (Artefakte, Signier-Schlüssel). Lokal geprüft: Installation und Deinstallation; Update-Ablauf und der Pack-Schritt sind in dieser Umgebung nicht bestätigt (vpk: „Zugriff verweigert“ beim Nachbearbeiten).
- **Live-Pegel**: OBS `InputVolumeMeters` (per Reidentify zuschaltbar), Windows-Pegel über `IAudioMeterInformation`, `MeterBroadcaster`, Frontend `KeyMeter` (grün/orange/rot, bei Stumm grau mit Eingangspegel). Lautstärke-Balken und Pegel nur an Quellen-Tasten (Stumm), nicht an Lauter/Leiser.
- **Gehäuse-Plates** ersetzen den Deck-Hintergrund; Foto-/Muster-Hintergründe und Bild-Upload entfernt. Gesammeltes Speichern (`SetManyAsync`) + SQLite-WAL beheben das minutenlange Speichern.
- **System-Aktionen**: Programm öffnen, Datei/Ordner öffnen, Herunterfahren (normal/erzwungen); Palette: OBS, System, Plugins, Deck; Tastenbeschriftung wird kleiner statt mitten im Wort umzubrechen.
- **OBS offline**: OBS-Schritte werden übersprungen, übrige laufen weiter (Hinweis an die Oberfläche); reine OBS-Tasten werden abgeblendet.
- Außerdem: stärkeres Tasten-Eindrück-Feedback, Kantenfarben je Theme, Live-Vorschau und Browser-Tastenkürzel entfernt (systemweite Kürzel bleiben), Sidebar-Infoblock ohne Box.

## v2026.9.7 - 2026-09-29 19:11

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
- **Neugestaltung der Toggle-Zustandsanzeige** (`index.css`, `DeckKey.tsx`): Normale Deck-Tasten
  zeigen bei einem echten An/Aus-Zustand (`buttonHasToggleState`) jetzt immer eine physisch
  eingelassene LED, die rot oder grün leuchtet statt nur leuchtend oder unsichtbar zu sein.
  Getrennte Fassungs-, Linsen-, Glanzpunkt- und Glow-Ebenen halten die Anzeige auf jeder Tastenfarbe
  und in jedem Theme gut erkennbar. Das Tastendruckverhalten bleibt global zwischen „Federt zurück“
  und „Bleibt gedrückt“ für zustandsbehaftete Tasten wählbar.
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
