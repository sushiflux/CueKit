# Änderungen für den nächsten Commit (Übergabe an Claude)

**Datum:** 2026-10-05  
**Projekt:** CueKit  
**Autor:** SushiFlux `<github.sushiflux@ghostpass.de>`  

---

## 📋 Zusammenfassung aller Neuerungen & Fixes

### 1. Zwei separate Startskripte: `start.ps1` und `start-admin.ps1`
- **`start.ps1` (Standard / Ohne Administratorrechte):**
  - Startet Frontend (Vite) und Desktop-App direkt mit Standard-Nutzerrechten ohne UAC-Dialog oder Admin-Aufforderung.
- **`start-admin.ps1` (MIT Administratorrechten):**
  - Prüft vorab auf Administratorrechte (`WindowsPrincipal.IsInRole`). Fehlen diese, fordert es automatisch die Windows-UAC-Erhöhung an (`Start-Process powershell.exe -Verb RunAs`) und startet Frontend + Backend mit vollen Rechten für Kernel-Treiber (z. B. WinRing0 für Hardware-Monitoring).
- **`app.manifest`:**
  - Auf `level="asInvoker"` konfiguriert. So kann `start.ps1` ohne UAC-Meldung starten, während `start-admin.ps1` die Admin-Rechte sauber an den Prozess weitergibt.
- **Garantiertes sauberes Beenden (try/finally):**
  - Beide Skripte fangen das Beenden per Tastendruck oder Strg+C über einen `try/finally`-Block ab.
  - Beim Beenden werden gezielt alle Kindprozesse, die `CueKit.exe` sowie alle Hörer auf den Ports 5200 (Vite) und 5201 (Backend) beendet, sodass keine verwaisten Hintergrundprozesse oder blockierten DLLs zurückbleiben.

### 2. Subpixel-Matrix (Display-Mesh) & Icon-Schärfe
- **Problem:** Während bei der GPU-Temperatur alles gestochen scharf über dem Mesh lag, wirkten bei der CPU-Temperatur das Thermometer-Icon und der Strich `–` sowie der ungefüllte Hintergrundring der Auslastung so, als lägen sie UNTER dem Mesh.
- **Ursachen:**
  1. Bei nicht verfügbaren Monitorwerten (`monitor.unavailable`) waren bisher `opacity-40` auf dem Icon und `text-ink-faint` auf dem Wert aktiv. Durch diese Transparenz schienen die hellen Mesh-Punkte des Hintergrunds direkt durch das Thermometer-Icon und den Strich hindurch, sodass sie wie *unter* dem Gitter aussahen!
  2. Im Hintergrund-Kreis von `RingGauge.tsx` war `opacity={0.35}` gesetzt, wodurch auch der ungefüllte graue Ring transparent war und das Mesh hindurchschimmerte.
  3. `mix-blend-mode: overlay` in `index.css` hatte zuvor zu Farbüberlagerungen mit Nachbarelementen geführt.
- **Lösung:**
  - `mix-blend-mode: overlay` vollständig entfernt.
  - Das Mesh liegt als reines Hintergrundgitter strikt auf **Layer 1** (`z-index: 1`).
  - In `DeckKey.tsx` wurden `opacity-40` und `text-ink-faint` entfernt und durch voll deckende, solide Farben (`text-ink-muted opacity-100`) ersetzt.
  - In `RingGauge.tsx` wurde `opacity={0.35}` vom Hintergrundring entfernt – der Ringtrack ist nun zu 100% deckend.
  - Alle sichtbaren Tasten-Inhalte (`.key-icon`, `.key-label`, `.key-monitor-value`, `.key-ring`, etc.) liegen jetzt auf **`z-index: 10 !important`** und haben einen feinen Drop-Shadow erhalten.
  - Damit liegen nun ausnahmslos **alle** Icons, Zahlen, Ringe und Texte auf **allen** Tasten vollkommen deckend und gestochen scharf **über** dem Display-Mesh.

### 3. Tacho-Auslastungsring (`RingGauge.tsx`): Fließende Animation & korrekter Farbverlauf
- **Problem 1 (Animation / Abriss):** Beim Sinken der Auslastung war die Animation zweigeteilt: Das Ringende riss ab und ein isoliertes Stück wanderte ruckelnd zurück.
  - **Ursache:** Der Bogen war zuvor in 60 Segmente unterteilt, die bei sinkenden Werten sofort im DOM gelöscht wurden, während die runde Kappe zeitverzögert per CSS hinterherglitt.
  - **Lösung:** Bogen auf einen **einzelnen, echten SVG-Kreisbogen** umgestellt. Beide Enden besitzen nun native `strokeLinecap="round"`. Der Bogen zieht sich bei Lastwechseln absolut flüssig und ohne jeden Abriss zusammen oder dehnt sich aus.
- **Problem 2 (Farbrichtung):** Der Farbverlauf war fälschlicherweise invertiert (begann bei Rot).
  - **Lösung:** Gradient-Richtung korrigiert: Startet bei geringer Last (0%–30%) in sattem Grün (`#22c55e`), wandert über die Mitte (50%) in warmes Orange (`#f59e0b`) und erreicht bei Volllast (80%–100%) warnendes Rot (`#ef4444`).

### 4. Warndreieck & CueKit Premium-Infobox (Hover-Tooltip)
- **Problem 1 (Doppelter Tooltip):** Beim Überfahren erschien erst das CueKit-Infofeld und 1-2 Sekunden später zusätzlich der simple gelb-graue Standard-Browser-Tooltip (`title`).
  - **Lösung:** Das HTML-Attribut `title={hint}` wurde vollständig entfernt. Es erscheint nur noch das gestaltete CueKit-Infofeld.
- **Problem 2 (Button überdeckt):** Das Infofeld erschien zuvor direkt über dem auslösenden Button und verdeckte diesen.
  - **Lösung:** Die Positionierung orientiert sich nun am gesamten Button (`button.getBoundingClientRect()`) und platziert das Infofeld **vollständig außerhalb** der Taste – bevorzugt direkt unter der Taste (`top: bRect.bottom + 8`), oder bei Platzmangel am unteren Bildschirmrand direkt über der Taste (`top: bRect.top - 8`). Der Button mit seinen Werten, Schriften und Icons bleibt zu 100 % sichtbar.
- **Optik & Interaktion:**
  - In `index.css`: `.deck-key > .key-warn-badge, .deck-key .key-warn-badge { pointer-events: auto !important; }`.
  - Hitbox des Badges vergrößert (`min-w-[18px] min-h-[18px]`, `p-1`), damit der Mauszeiger das Dreieck sofort und zuverlässig trifft.
  - CueKit Dark Glassmorphism (`bg-surface-2/95 backdrop-blur-md border border-line-strong shadow-float rounded-ctl`) mit Icon und Erklärungstext.

### 5. CPU-Temperatur & Hardware-Monitoring (AMD Zen 5 / Ryzen 9000)
- **Problem & Ursache:** Auf AMD Ryzen 9000 Systemen (wie Ryzen 9 9950X3D, Zen 5 Granite Ridge) lieferte LibreHardwareMonitor `0` für `Core (Tctl/Tdie)`, da Zen 5 im SMU-Treiber noch keine hinterlegte PM-Tabelle hat. Bislang zeigte das UI fälschlicherweise `0°C` an.
- **Lösung:**
  - **`SystemMonitorService.cs`:**
    - Filtert physikalisch unmögliche Werte `≤ 0` heraus.
    - Aktiviert `IsMotherboardEnabled = true` und `IsControllerEnabled = true` und durchsucht rekursiv `SubHardware`, um Super I/O CPU-Temperatursensoren (z. B. ITE / Nuvoton) als Fallback zu nutzen.
  - **`buttonState.ts`:**
    - Zeigt bei fehlendem Temperaturwert sauber `–` anstelle von falschen Zahlen.
    - Gibt im Infobox-Tooltip eine kundenfreundliche Erklärung ohne Entwickler-Skriptnamen: *"CPU-Temperatur nicht verfügbar. Unter Windows sind für CPU-Sensoren in der Regel Administratorrechte erforderlich. Bei manchen Prozessorgenerationen (z.B. AMD Ryzen 9000 / Zen 5) wird die interne Sensortabelle derzeit noch nicht unterstützt."*

### 5. OBS-Palette: Aktionen auch ohne laufendes OBS ziehbar
- **Problem:** Bei offline/nicht verbundenem OBS waren die Sektionen *Szenen*, *Quellen*, *Audio*, *Medien* und *Profile* leer.
- **Lösung:** Alle OBS-Sektionen in `Palette.tsx` bieten nun dauerhaft vorkonfigurierte Standard-Aktionen (*„Szene wechseln“*, *„Quelle ein/aus“*, *„Browserquelle neu laden“*, *„Stumm / Ton an“*, *„Medien abspielen / Pause“*, Sammlungen, Profile, Übergänge) zum Vorbereiten von Decks an. Sobald OBS online geht, schalten sie auf die Live-Objekte um.

### 6. Inspektor: Klare Trennung von Einzeltaste & Multifunktion
- **Einzeltaste (Standard):** Fester Aktionstyp (kein Typ-Dropdown), kein Schritt-Hinzufügen/Löschen. Neuer Button im Header: **„In Multifunktion umwandeln“** (`tabler:stack-3`).
- **Multifunktionstaste:** Vollständiger Editor für Schritte, Typauswahl, Umsortieren und Löschen. Bei 1 Schritt kann die Taste mit **„Als Einzeltaste fixieren“** wieder gesperrt werden.

### 7. Tastendruckverhalten („Federt zurück“ vs. „Bleibt eingedrückt“)
- Monitor-Tasten (CPU, GPU, RAM) federn bei jedem Klick sofort physisch ein und springen zurück (bleiben nie dauerhaft gedrückt).
- Alle Tasten (auch offline/nicht verfügbar) federn beim Klick ein, sodass immer klares haptisches Feedback vorhanden ist.
- Dauerhaftes Eingedrückt-Bleiben (`pressBehavior === 'stay'`) greift nur noch bei echten Toggle-Aktionen mit aktivem Zustand.

### 8. Multi-Aktionsschalter (Multi-Action Switch / Toggle)
- **Problemstellung & Nutzerwunsch:**
  - Bislang gab es nur lineare Multifunktionen, die bei jedem Klick eine feste Kette von Aktionen nacheinander ausführen.
  - Der Nutzer wünschte eine zweite Option für Multi-Aktionen: den **Multi-Aktionsschalter**.
  - Ziel: Mit einer einzigen Taste zwei getrennte Zustände steuern – z. B. ein Mikrofon und eine Audioquelle gemeinsam mit einem Tastendruck einschalten (Zustand 1: Unmute für beide) und beim erneuten Drücken wieder gemeinsam ausschalten (Zustand 2: Mute für beide).
- **Backend-Architektur:**
  - **`SwitchStateService.cs` (Neu):**
    - Verwaltet die Zustände aller Multi-Aktionsschalter thread-sicher (`ConcurrentDictionary<int, bool>`).
    - Persistiert Zustände transparent in `switch-states.json` im Datenverzeichnis, sodass Schalterzustände Neustarts überstehen.
    - **Intelligente Live-OBS-Erkennung:** Wenn die Einschalt-Schritte live beobachtbare OBS-Ziele (z. B. `obs.audio.mute`, `obs.source.visibility`, `obs.stream`, `obs.record`) steuern, wertet der Dienst den aktuellen Zustand direkt aus dem Live-Zustand von OBS aus – so geraten Schalter niemals mit externen OBS-Änderungen aus dem Takt!
    - **Deterministische Umschaltung:** Beim Druck wird der Zielzustand ermittelt, die entsprechenden Unterschritte (`onSteps` bei Zustand 1 / An, `offSteps` bei Zustand 2 / Aus) via `ActionExecutor.ExecuteAsync` ausgeführt, der neue Zustand gespeichert und sofort per SignalR an alle verbundenen Geräte gebroadcastet.
  - **`ActionCatalog.cs`:**
    - Aktionstyp `"deck.multiSwitch"` unter der Kategorie *Deck* registriert.
    - Aus `IsClientSide` ausgenommen, damit die Aktionen serverseitig vollwertig ausgeführt werden.
  - **`HubNotifier.cs` & `DeckHub.cs`:**
    - SignalR-Event `switchStateChanged(buttonId, isOn)` an alle Clients bei Zustandswechsel.
    - Initialer Broadcast aller Schalterzustände `switchStates` bei Verbindungsaufbau (`OnConnectedAsync`).
    - `DeckHub.Press` delegiert Schalter-Buttons direkt an `SwitchStateService.ExecuteSwitchPressAsync`.
  - **`GlobalHotkeyService.cs`:**
    - Systemweite Windows-Tastenkürzel lösen für Multi-Aktionsschalter dieselbe State-Toggle-Logik aus.
  - **`DecksController.cs`:**
    - Validierung für `deck.multiSwitch` inklusive Prüfung aller Unterschritte in `onSteps` und `offSteps`.
    - Beim Löschen einer Taste wird der Schalterzustand in `SwitchStateService` sauber bereinigt.
    - Test-Endpoint (`/api/buttons/{id}/press`) unterstützt Schalter vollständig.
  - **`ServerHost.cs`:**
    - `SwitchStateService` als Singleton registriert.
- **Frontend-UI & -Interaktion:**
  - **Palette (`Palette.tsx`):**
    - Neuer Eintrag **„Multi-Aktionsschalter“** (`tabler:toggle-right`, Farbe Indigo) unter *Deck* -> *Tasten & Navigation*.
  - **Raster-Kontextmenü (`DeckEditor.tsx`):**
    - Leere Tasten bieten im Neuanlage-Menü jetzt direkt **„Multi-Aktionsschalter“** (*„Zwei Zustände mit eigenen Aktionen“*) an.
  - **Inspektor (`Inspector.tsx`):**
    - Eigener Multi-Aktionsschalter-Modus mit **Zustand 1 (An)** und **Zustand 2 (Aus)**.
    - **Live-Vorschau-Umschalter:** Unter der Tasten-Vorschau oben im Inspektor kann direkt per Klick zwischen Zustand 1 und Zustand 2 umgeschaltet werden, um das Erscheinungsbild beider Zustände live zu testen.
    - **Getrennte Schritt-Editoren:**
      - **Zustand 1 (Einschalten):** Voller `StepEditor` für die Einschalt-Sequenz mit Hilfekarte.
      - **Zustand 2 (Ausschalten):** Voller `StepEditor` für die Ausschalt-Sequenz mit Hilfekarte.
    - **Optionales Aussehen für Zustand 2:** Im Zustand 2 kann optional eine abweichende Beschriftung (`labelOff`) sowie ein abweichendes Icon (`iconOff` mit eigenem `IconPicker`) hinterlegt werden.
    - **Schnell-Konverter:** Bestehende Tasten können mit einem Klick auf **„In Multi-Schalter umwandeln“** konvertiert werden; Audio- und Mute-Aktionen werden dabei für Zustand 2 automatisch invertiert!
    - **Validierung:** Validiert Pflichtfelder beider Zustände getrennt vor dem Speichern.
  - **Tastendarstellung (`DeckKey.tsx` & `buttonState.ts`):**
    - `buttonHasToggleState` und `buttonStateKind` (`'onoff'`) unterstützen `deck.multiSwitch` vollumfänglich: Schalter erhalten die aktive LED-, Glow- oder Diffusor-Anzeige.
    - `activeLabel`: Schaltet dynamisch zwischen Standard-Beschriftung und `labelOff` um.
    - `activeIcon`: Schaltet dynamisch zwischen Standard-Icon und `iconOff` um.
    - `isMultiSwitchActive`: Prüft live die Zielzustände in OBS / Systemlautstärke oder greift auf `switchStates` zurück.

---

## 📁 Geänderte & neue Dateien

| Datei | Status | Änderung |
|---|---|---|
| `start.ps1` | Modifiziert | Dev-Startskript ohne Administratorrechte (Standard). |
| `start-admin.ps1` | **Neu** | Dev-Startskript mit automatischer UAC-Elevation für Hardware-Monitoring. |
| `desktop/Deck.Desktop/app.manifest` | **Neu** | Manifest mit `asInvoker` für flexible Rechtevererbung. |
| `desktop/Deck.Desktop/Deck.Desktop.csproj` | Modifiziert | `app.manifest` eingebunden. |
| `backend/Hardware/SystemMonitorService.cs` | Modifiziert | Temperaturwerte `≤ 0` ignorieren; Motherboard & SubHardware Super I/O Sensoren scannen; AMD-Sensoren priorisieren. |
| `backend/Services/SwitchStateService.cs` | **Neu** | Thread-sicherer Dienst für Schalterzustände, Persistenz, Live-OBS-Erkennung und Ausführung. |
| `backend/Actions/ActionCatalog.cs` | Modifiziert | `deck.multiSwitch` registriert und von `IsClientSide` ausgenommen. |
| `backend/Hubs/HubNotifier.cs` | Modifiziert | SignalR-Event `SwitchStateChanged` hinzugefügt. |
| `backend/Hubs/DeckHub.cs` | Modifiziert | `SwitchStateService` eingebunden, Schalterzustände bei Connect gebroadcastet, `Press` für Multi-Aktionsschalter umgesetzt. |
| `backend/Hotkeys/GlobalHotkeyService.cs` | Modifiziert | Schalterausführung über systemweite Tastenkürzel integriert. |
| `backend/Controllers/DecksController.cs` | Modifiziert | Validierung von `deck.multiSwitch` inkl. Unterschritte; Bereinigung beim Löschen; Press-Unterstützung. |
| `backend/ServerHost.cs` | Modifiziert | `SwitchStateService` in Dependency Injection registriert. |
| `frontend/src/api/types.ts` | Modifiziert | `MultiSwitchParams` Interface hinzugefügt; `Params` für geschachtelte Schritte geöffnet. |
| `frontend/src/state/store.ts` | Modifiziert | `switchStates: Record<number, boolean>` im globalen Zustand hinterlegt. |
| `frontend/src/state/realtime.ts` | Modifiziert | SignalR-Listener für `switchStates` und `switchStateChanged`. |
| `frontend/src/lib/buttonState.ts` | Modifiziert | `isMultiSwitchActive`, `buttonHasToggleState`, `buttonStateKind`, `activeIcon`, `activeLabel` für Schalter erweitert. |
| `frontend/src/components/DeckKey.tsx` | Modifiziert | `activeLabel` eingebunden; `DeckKey` rendert dynamische Labels je nach Schalterzustand. |
| `frontend/src/deck/tileOps.ts` | Modifiziert | `isMultiSwitch` Hilfsfunktion ergänzt; `isMulti` angepasst. |
| `frontend/src/deck/DeckEditor.tsx` | Modifiziert | `multi-switch` im Neuanlage-Menü; `switchStates` an `DeckKey` weitergeleitet; Drag/Drop-Handling. |
| `frontend/src/pages/DeckPage.tsx` | Modifiziert | `deck.multiSwitch` von Client-Navigation ausgenommen; `switchStates` an Tasten übergeben. |
| `frontend/src/editor/Palette.tsx` | Modifiziert | `deck:multi-switch` Kachel mit Icon `tabler:toggle-right` in Palette integriert. |
| `frontend/src/editor/Inspector.tsx` | Modifiziert | Voller Multi-Aktionsschalter-Editor mit Zustand 1 / 2 Tabs, Live-Vorschau, `IconPicker` für Aus-Zustand, Konverter. |
| `frontend/src/components/RingGauge.tsx` | Modifiziert | Sliced-Segmente durch einzelnen, kontinuierlichen SVG-Bogen ersetzt; Farbverlauf von Grün bis Rot korrigiert. |
| `frontend/src/index.css` | Modifiziert | `mix-blend-mode: overlay` entfernt; Mesh auf Layer 1; alle Tasteninhalte auf Layer 10; `pointer-events: auto` für `.key-warn-badge`. |
| `frontend/src/editor/StepEditor.tsx` | Modifiziert | Props `allowTypeChange`, `allowAdd`, `allowDelete`, `allowReorder`, `showStepNumbers` hinzugefügt. |

---

## 🔧 Validierung
- **Frontend Build:** `npm run build` in `frontend/` erfolgreich abgeschlossen (`tsc -b && vite build` ohne Fehler).
- **Backend Build:** `dotnet build backend/Deck.Server.csproj` erfolgreich abgeschlossen (0 Fehler, 0 Warnungen).
- **Desktop Build:** `dotnet build desktop/Deck.Desktop/Deck.Desktop.csproj` erfolgreich abgeschlossen (0 Fehler, 0 Warnungen).
- **Automatisierte API-Tests:** End-to-End-Test (`test_multi_switch.ps1`) erfolgreich ausgeführt (Auth Bootstrap, Erstellen eines Multi-Aktionsschalters, Umschalten auf Zustand 1 / An, Umschalten auf Zustand 2 / Aus, SignalR-Events, Bereinigung beim Löschen).

