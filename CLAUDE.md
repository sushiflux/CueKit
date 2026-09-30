# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**CueKit** – a free (closed-source freeware) Stream Deck alternative for OBS: phones/tablets/browsers
become a button deck, the PC runs a service that talks to OBS via obs-websocket v5. The product name
lives **only** in `branding.json` (read by backend `AppInfo`, frontend `config/branding.ts`, the
`index.html` title plugin in `vite.config.ts`, `start.ps1`, the notices generator). Technical names
are deliberately neutral (`Deck.*` namespace, repo folder `Maestro`) – never hardcode the product name
in code or UI strings; use `branding.productName` / `AppInfo.Brand`. Former working title "Baton"
survives only in history and as the legacy backup format `baton-decks`. Brand *assets* (logo, etc.)
live in `branding/` at the repo root – `branding/logo.svg` is the canonical source; `frontend/public/logo.svg`
is a synced copy for Vite's static serving and must be updated together with it. `branding/icon.ico` (multi-size,
PNG-in-ICO) is generated from the logo and embedded by the desktop shell – regenerate it when the logo changes.

## Commands

Dev stack (Docker Desktop, Windows PowerShell 5.1 compatible):

```powershell
.\start.ps1                      # dev: backend (dotnet watch) :5201 + Vite :5200 (UI at http://localhost:5200)
.\start.ps1 -Env prod            # "live" profile: built image, UI+API on :5202, separate data volume
.\start.ps1 -Action stop|restart|status|logs [-Env prod] [-NoBuild]
```

Ports are fixed from `C:\Users\Flux\.claude\ports.json` (key `cuekit`); the script fails loudly on
conflicts instead of picking other ports.

Desktop app (Windows shell, see Architecture): 

```powershell
.\scripts\desktop-build.ps1 [-SkipFrontend]   # frontend build + self-contained publish -> artifacts\desktop\<ProductName>.exe
.\scripts\desktop-pack.ps1 [-SkipBuild] [-Version 2026.9.7-rc1]   # Velopack installer -> artifacts\installer (Setup.exe, update packages); -SignParams/-AzureSignFile once a certificate exists
.\scripts\desktop-msix.ps1 [-SkipBuild] -IdentityName <Partner Center> -Publisher "CN=<Partner Center>"   # unsigned MSIX for the Microsoft Store -> artifacts\msix (the Store signs it; -TestSign for local sideload)
dotnet run --project desktop\Deck.Desktop -- --Deck:Port=5215 --Deck:DataDir=<scratch dir>   # dev run of the shell (needs frontend\dist, else --dev-url=http://localhost:5200 with Vite)
```

The installed app's default port is 5202 (the same as the Docker "live" stack) – running both needs `--Deck:Port`.
A fresh data dir auto-adopts the local OBS connection (`ObsDiscovery`), so **never press OBS keys in tests** without
first pointing `PUT /api/settings/obs` at an unreachable port.

Checks (there is no unit-test suite yet):

```powershell
cd frontend; npx tsc -b; npx oxlint src; npm audit --omit=dev
cd backend;  dotnet build; dotnet list package --vulnerable --include-transitive
node scripts/generate-third-party-notices.ts   # regenerate THIRD-PARTY-NOTICES.md + in-app list (run before releases / after dependency changes)
```

EF Core migrations (local tool manifest in `backend/`): `cd backend; dotnet ef migrations add <Name> -o Data/Migrations`.
Migrations are applied at startup in `ServerHost.InitializeAsync` (not in `Build()`, so design-time
tooling never creates a real database).

Running the backend natively on Windows (needed to exercise system-wide hotkeys and Windows-only code):

```powershell
cd backend; $env:ASPNETCORE_ENVIRONMENT='Development'; $env:Deck__DataDir='<scratch dir>'; $env:Deck__Port='5211'; dotnet run --no-launch-profile
cd frontend; $env:DECK_BACKEND_URL='http://localhost:5211'; npx vite --port 5210 --strictPort
```

Browser verification uses the Playwright Docker image on demand (`mcr.microsoft.com/playwright:v1.63.0-noble`,
target `http://host.docker.internal:<port>`); a fresh data dir allows the first-run "Einrichten"
(bootstrap) flow. Never press live deck keys in automated tests against a real OBS.

## Architecture

**Backend** (`backend/`, ASP.NET Core 10, SQLite via EF Core, single process):

- `ServerHost.Build()` wires everything; `Program.cs` is only the headless entry point (Docker), and the
  Windows desktop shell hosts the same service in-process. Controllers are loaded via `AddApplicationPart`
  because the entry assembly is not `Deck.Server` when embedded.
  Data dir: `Deck:DataDir` or `%LOCALAPPDATA%\SushiFluxDevelop\Deck` (DB, DataProtection keys, plugins).
- **Desktop shell** (`desktop/Deck.Desktop`, WinForms + WebView2, `net10.0-windows`): tray icon, single instance
  (named mutex; a second launch just brings the window forward), window close hides to tray, "Mit Windows
  starten" (HKCU Run, `--tray`), window bounds persisted. The exe name/company/version come **only** from
  `branding.json`/`version.txt` (MSBuild property functions in the csproj). Startup args: `--tray`,
  `--dev-url=<url>`; everything else goes to the service (`--Deck:Port=`, `--Deck:DataDir=`). WebView2 runtime
  missing → the service still runs and the tray offers "Im Browser öffnen". Distribution options: `docs/DISTRIBUTION.md`.
  **Installer = Velopack** (per-user, no admin; no wizard, so the EULA in `LICENSE` is confirmed in-app by `EulaGate`
  before the service starts – `--accept-eula` skips it for unattended installs/tests; the uninstall hook removes the
  autostart entry). Auto-update via `UpdateService` (tray menu "Nach Updates suchen", background check every 6 h; only
  in an installed build), feed from `Deck:UpdateFeedUrl` – default is a placeholder public *releases* repo because
  the source repo is private (see `docs/DISTRIBUTION.md`). Unsigned builds trigger SmartScreen. In the Store (MSIX) build `Native.IsPackaged` hides autostart and self-update in the tray menu (the Store updates; HKCU Run does not work in a package).
- `Obs/ObsWebSocketClient` is a hand-written obs-websocket v5 client; `ObsService` keeps a reconnecting
  session and an immutable `ObsSnapshot` (scenes, items, audio incl. dB, media, transitions, profiles,
  outputs) updated from events. `ObsDiscovery` auto-configures from OBS's local `config.json`
  (port + password) on first run and can scan the LAN. Inside containers loopback is remapped to
  `host.docker.internal`.
- **Actions**: a button stores a JSON list of `ActionStep {type, params}` (multi-action). `ActionCatalog`
  defines built-in types (category strings like `OBS · Audio` drive UI grouping) with field
  descriptors (`FieldKind`) that the frontend renders generically. `ActionExecutor` runs steps
  server-side; `deck.*` steps (folders/back/home) are client-side only. Plugin actions are
  `plugin:<pluginId>/<actionId>`.
- `Automation/AutomationEngine` evaluates trigger/conditions/actions (OBS events + 1 s timer).
  Automations surface in the UI as tiles with action `automation.toggle`.
- **Plugins**: out-of-process Node.js programs connecting over WebSocket `/ws/plugins?key=` (`PluginHost`,
  protocol in `docs/PLUGIN_PROTOCOL.md`). `PluginManager` installs ZIP packages (`PluginPackage` validates
  manifest/zip-slip/size), launches them with `DECK_URL/DECK_KEY/...` env vars, restarts with backoff and
  assigns them to a Windows job object (`ChildProcessJob`) so they die with the service. `PluginCatalog`
  installs from `Deck:PluginCatalogUrl` with SHA-256 verification. Only Node (JS/TS) plugins – no `.exe`.
- **Hotkeys**: buttons have a unique `Hotkey` (`Ctrl+Alt+Shift+Meta+<KeyboardEvent.code>`). The browser
  handles them while the deck tab is focused; `Hotkeys/GlobalHotkeyService` (Windows only, native run)
  registers them system-wide via `RegisterHotKey` (scan-code → VK mapping for layout safety) and reports
  conflicts via `GET /api/hotkeys/status`.
- **Auth**: per-device bearer tokens (SHA-256 hashed in DB, cached in `DeviceTokenCache`), roles Owner /
  Controller, first owner only via loopback (`BootstrapPolicy`; dev stack allows its fixed Docker subnet
  via `Deck:BootstrapAllowedNetworks`), one-time pairing codes for other devices (QR), rate-limited.
  SignalR hub `/hub/deck` takes the token via `access_token` query.
- **Realtime**: `HubNotifier` broadcasts `obsState`, `preview`, `decksChanged`, `catalogChanged`,
  `automationsChanged`, `pluginsChanged`, `hotkeysChanged`, `keyTriggered`; controllers call
  `notifier.DecksChangedAsync()` after deck mutations (this also re-registers global hotkeys).
- Settings are DB-backed (`SettingsService`, OBS password encrypted with DataProtection).
  `BackupController` exports/imports decks (format `cuekit-decks` v1, always imports as new decks,
  remaps page/automation ids).

**Frontend** (`frontend/`, React 19 + Vite + TypeScript + Tailwind v4 + motion):

- One screen for live deck and editing: `pages/DeckPage.tsx` renders the live grid, and with `?edit=1`
  the `deck/DeckEditor.tsx` workspace (grouped `editor/Palette`, drag & drop via dnd-kit, `TileMenu`
  context menus, `Inspector` / `AutomationInspector`). Other pages (Plugins, Devices, Settings) use
  `components/AppShell` (sidebar); the deck uses it too except in fullscreen.
- Global state is a tiny `useSyncExternalStore` store (`state/store.ts`) fed by REST loaders and the
  SignalR connection in `state/realtime.ts`.
- `components/DeckKey.tsx` is the physical-looking key; `lib/buttonState.ts` derives "active"/level
  from the OBS snapshot. Icons are bundled offline per Iconify prefix (`lib/icons.ts`) – the app must work
  without internet and the CSP only allows `'self'`.
- Styling: design tokens as CSS variables in `index.css` (light/dark via `data-theme`), shared control
  classes (`.btn-create/-confirm/-danger/-ghost`, `.field`, `.chip-select`, `.switch`, `.deck-key`) in
  `@layer components` so Tailwind utilities can still override them. `.deck-key > *` has
  `pointer-events: none` on purpose (icon SVG re-renders otherwise swallow click/dblclick).
- The "made with" credit is `components/MadeWith.tsx` ("Mit ♥ gemacht" / "Made with ♥", green heart).

## Repo conventions

- Versioning is automatic: `scripts/git-hooks/post-commit` writes `version.txt` (+ `backend/version.txt`)
  as `vYYYY.M.<commits this year>` and stamps the newest `CHANGELOG.dev.md` heading; `start.ps1` sets
  `core.hooksPath`. The API reports `-dev` in the Development environment.
- Keep `CHANGELOG.dev.md` (bilingual EN/DE, one entry per commit, written from the real diff at commit
  time), `CHANGELOG.md` (releases only), `VERSIONS.md`, `QUELLEN.md` (sources consulted) and
  `THIRD-PARTY-NOTICES.md` current.
- Licensing: `LICENSE` is a proprietary EULA; `plugins/` and `docs/PLUGIN_PROTOCOL.md` are MIT.
  Compliance to-dos (CRA, GDPR, trademark) are tracked in `docs/COMPLIANCE.md`.
- `.gitignore` rules for runtime data are anchored at the repo root (`/data/`, `/keys/`) – Git on
  Windows is case-insensitive and a bare `data/` would ignore `backend/Data/` (entities + migrations).
- UI text and user-facing error messages are German and must name the concrete cause.
