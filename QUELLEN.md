# Quellen

Wo Informationen für dieses Projekt nachgeschlagen wurden.

## OBS

| Quelle | Wo | Wofür |
|---|---|---|
| obs-websocket Protokoll v5 | https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md | Opcodes (Hello/Identify/Request/Event), Auth (SHA-256 aus Passwort+Salt, dann +Challenge), EventSubscription-Bits, alle Request-/Event-Namen in `backend/Obs/` und `backend/Actions/ActionExecutor.cs` |
| obs-websocket `InputVolumeMeters` + Reidentify (Op 3) | https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md (Abschnitt „InputVolumeMeters“, EventSubscription `InputVolumeMeters = 1 << 16`) | Live-Pegel: hochfrequentes Event (~50/s) mit `inputLevelsMul` je Kanal `[Magnitude, Peak, Eingangs-Peak]` (lineare Multiplikatoren); Abo zur Laufzeit per Op 3 zu-/abschalten – `backend/Obs/ObsService.cs` (`HandleMeters`), `ObsWebSocketClient.ReidentifyAsync` |
| OBS WebSocket-Einstellungen | OBS → Werkzeuge → WebSocket-Server-Einstellungen | Standardport 4455, Passwort, Close-Code 4009 bei falschem Passwort |

| obs-websocket-Konfigurationsdatei | `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json` (Linux: `~/.config/obs-studio/…`, macOS: `~/Library/Application Support/obs-studio/…`) | Felder `server_enabled`, `server_port`, `auth_required`, `server_password` – Grundlage der automatischen Einrichtung in `backend/Obs/ObsDiscovery.cs` |

## Windows / Plattform

| Quelle | Wo | Wofür |
|---|---|---|
| RegisterHotKey (Win32) | https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-registerhotkey | Systemweite Tastenkürzel wie OBS, `MOD_NOREPEAT`, WM_HOTKEY auf dem registrierenden Thread – `backend/Hotkeys/GlobalHotkeyService.cs` |
| IAudioMeterInformation | https://learn.microsoft.com/windows/win32/api/endpointvolume/nn-endpointvolume-iaudiometerinformation | Spitzenpegel (`GetPeakValue`, 0..1 linear) des Standard-Ausgabegeräts für die Live-Pegelanzeige – `backend/Hardware/SystemVolumeService.cs` (`ReadPeakDb`) |
| shutdown.exe (`/s /f /t`) | https://learn.microsoft.com/windows-server/administration/windows-commands/shutdown | `/f` ist bei `/t` > 0 automatisch impliziert – deshalb „normal“ = `/s /t 0`, „erzwingen“ = `/s /f /t 0` (`system.shutdown` in `backend/Actions/ActionExecutor.cs`) |
| WebView2 (CoreWebView2, WinForms-Steuerelement) | https://learn.microsoft.com/microsoft-edge/webview2/ | Fenster der Desktop-Hülle: Einstellungen (Kontextmenü/DevTools aus), `NewWindowRequested`/`NavigationStarting` (externe Links im Browser), `ContainsFullScreenElementChanged` – `desktop/Deck.Desktop/MainForm.cs` |
| WebView2 Remote-Debugging (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`) | https://learn.microsoft.com/microsoft-edge/webview2/how-to/debug-devtools | Nur für Tests: `--remote-debugging-port` erlaubt, den echten Fensterinhalt per DevTools-Protokoll abzugreifen |
| DwmSetWindowAttribute (`DWMWA_USE_IMMERSIVE_DARK_MODE` = 20) | https://learn.microsoft.com/windows/win32/api/dwmapi/nf-dwmapi-dwmsetwindowattribute | Dunkle Titelleiste des Programmfensters |
| Velopack (Installer, Auto-Update, `vpk pack`) | https://docs.velopack.io | Installer/Updates der Desktop-App: `scripts/desktop-pack.ps1`, `VelopackApp` + `UpdateManager` in `desktop/Deck.Desktop`. Beobachtet (v1.2.161): `Setup.exe -- <Argumente>` stürzt intern ab (Parser-Panic) – Setup deshalb ohne Startargumente aufrufen; `--silent` startet die App nicht; `vpk pack` verweigert dieselbe Version im selben Ausgabeordner |
| Microsoft Partner Center / MSIX | https://partner.microsoft.com/dashboard , https://learn.microsoft.com/windows/msix/package/manual-packaging-root | Store-Einreichung (Produktidentität, `runFullTrust`-Begründung in den Zertifizierungshinweisen, Sichtbarkeit „nur direkter Link“), manuelles Packen mit `makeappx` – `scripts/desktop-msix.ps1` |
| Autostart über den Run-Schlüssel | https://learn.microsoft.com/windows/win32/setupapi/run-and-runonce-registry-keys | „Mit Windows starten“ (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, Start mit `--tray`) |
| ASP.NET Core Application Parts | https://learn.microsoft.com/aspnet/core/mvc/advanced/app-parts | Controller werden nur in der Start-Assembly gefunden – beim Einbetten in die Hülle braucht `AddApplicationPart` (`ServerHost.Build`) |
| NETSDK1150 / NETSDK1152 | https://learn.microsoft.com/dotnet/core/tools/sdk-errors/netsdk1150 | Self-contained Hülle referenziert framework-abhängigen Dienst (`ValidateExecutableReferencesMatchSelfContained`); doppelte `version.txt` beim Publish |
| MapVirtualKeyEx | https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-mapvirtualkeyexa | Scancode → Virtual-Key je Tastaturlayout (QWERTZ-sicher) |
| Job Objects / JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | https://learn.microsoft.com/windows/win32/procthread/job-objects | Plugin-Prozesse enden mit dem Dienst – `backend/Plugins/ChildProcessJob.cs` |
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
