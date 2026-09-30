# Vertrieb der Desktop-App

Stand: 2026-09-30. Hier steht, wie die installierte Windows-App verteilt werden kann, wie es mit der
Windows-Warnung („SmartScreen“) aussieht und was das kostet. **Preise und Voraussetzungen ändern
sich – vor jeder Entscheidung beim Anbieter nachsehen.** Die Zahlen unten sind Größenordnungen aus
dem Kopf, keine geprüften Angebote.

## Ausgangslage

- Kein Geld für ein Code-Signing-Zertifikat (Stand jetzt).
- CueKit ist Closed Source. Damit scheiden kostenlose Signierprogramme für Open-Source-Projekte
  (z.B. SignPath Foundation) aus.
- Ziel: Nutzer sollen ohne eine „Der Computer wurde durch Windows geschützt“-Sperre installieren
  können – oder wenigstens genau erklärt bekommen, wie es geht.

## Woher die Warnung kommt

Sie hat **nichts mit dem Installer-Typ** (EXE, MSI, WiX) zu tun. Zwei Mechanismen greifen:

1. **Herkunftsmarkierung (Mark of the Web):** Jede aus dem Internet heruntergeladene Datei bekommt sie.
2. **SmartScreen-Reputation:** Windows bewertet Datei und Herausgeber. Ein unsignierter Installer
   eines unbekannten Herausgebers wird praktisch immer gewarnt. Auch mit Signatur startet ein neuer
   Herausgeber ohne Ruf; der baut sich über Downloads über die Zeit auf.

Kleine Programme ohne Warnung sind entweder signiert, schon lange und oft heruntergeladen, oder
kommen über einen Store bzw. Paketmanager.

## Optionen

| Weg | Warnung weg? | Kosten (ca., prüfen!) | Aufwand | Anmerkung |
|---|---|---|---|---|
| **EXE-Download (GitHub Release) mit Anleitung** | Nein, wird erklärt | 0 € | gering | Anleitung „Weitere Informationen → Trotzdem ausführen“, SHA-256-Prüfsumme angeben |
| **winget** (Windows-Paketmanager) | In der Praxis meist ja | 0 € | gering | Manifest im öffentlichen `winget-pkgs`-Repo; braucht öffentlich erreichbare Installer-URL (z.B. GitHub Release) |
| **Microsoft Store (MSIX)** | Ja, Microsoft signiert | einmalige Entwickler-Registrierung, klein (privat günstiger als Firma) | mittel | MSIX-Paket, Store-Prüfung; Vollvertrauens-App nötig (Programme starten, Herunterfahren, LAN-Server) – Begründung nötig, **vorher mit Testpaket klären** |
| **Azure „Trusted Signing“** | Ja, aber Ruf baut sich auf | wenige Euro/Monat | mittel | Ob SushiFlux Develop die Voraussetzungen erfüllt, ist offen |
| **Klassisches Code-Signing-Zertifikat** | Signatur ja, Ruf erst mit der Zeit | ca. 100–300 €/Jahr | mittel | Signiert werden müssen Installer **und** enthaltene EXE |
| **Selbst signiert** | Nein | 0 € | – | Hilft nicht, Windows vertraut dem Zertifikat nicht |
| **Datei bei Microsoft einreichen** | Nur Fehlalarme | 0 € | gering | https://www.microsoft.com/wdsi/filesubmission – ersetzt keine Signatur |

## Empfehlung (Reihenfolge)

1. **GitHub Release mit EXE + Anleitung** – Start ohne Kosten.
2. **winget-Eintrag** – kostenlos, sobald die EXE öffentlich auf GitHub liegt.
3. **Microsoft Store** – nachziehen, wenn die App stabil läuft; vorher Testpaket bauen, um die
   Vollvertrauens-Frage (Programme starten, Herunterfahren, LAN-Server) zu klären.
4. Wird Geld verfügbar: Signatur (Trusted Signing oder Zertifikat) für den EXE-Weg.

## Anleitung für die Webseite (Entwurf)

Wenn Windows „Der Computer wurde durch Windows geschützt“ zeigt: **Weitere Informationen** klicken,
dann **Trotzdem ausführen**. Die SHA-256-Prüfsumme des Installers steht auf der Download-Seite und
kann mit `Get-FileHash <Datei>` in PowerShell verglichen werden.

## Installer-Entscheidung: Velopack (2026-09-30)

Verglichen wurden Velopack, Inno Setup, NSIS, WiX (mit eigener WPF-Oberfläche), MSIX und ZIP – alle
kostenlos. Die globale Entscheidungshilfe steht in `~/.claude/CLAUDE.md` („Windows installer“). Für CueKit
fiel die Wahl auf **Velopack**:

- Installation **pro Benutzer** unter `%LOCALAPPDATA%\<Produktname>`: keine Adminrechte, keine UAC-Abfrage.
- **Auto-Update** eingebaut (Delta-Updates, Update-Feed = einfache Dateien auf einem Webserver bzw. GitHub Releases).
- Ein Schritt zum Bauen (`vpk pack`), gut in GitHub Actions einbaubar.
- Nachteile: nur ein Splash statt eines Assistenten – die **Lizenzvereinbarung (EULA)** wird deshalb beim ersten
  Start in der App bestätigt. Und: ein unsignierter Installer löst weiterhin die SmartScreen-Warnung aus (siehe oben).
- Die Benutzerdaten (`%LOCALAPPDATA%\SushiFluxDevelop\Deck`) liegen außerhalb des Installationsordners und bleiben
  bei Updates und beim Deinstallieren erhalten.
- Ersetzt die frühere Vorgabe „WiX + WPF-Oberfläche“ für dieses Projekt (WiX bleibt für Server-/IIS-Projekte richtig).

### Update-Feed und privates Repository

Das GitHub-Repository `SushiFlux-Develop/cuekit` ist **privat** (Closed Source). Ein privates Repo kann seine
Releases **nicht anonym** ausliefern – weder an die Auto-Update-Funktion der App noch an Download-Seite oder winget.
Optionen:

1. **Separates öffentliches Repo nur für Releases** (z.B. `cuekit-releases`, ohne Quellcode): der CI-Workflow im
   privaten Repo veröffentlicht die fertigen Installer dorthin. Kostenlos, passt zu Auto-Update *und* winget. (Empfohlen)
2. Eigene Webseite/Speicher als Update-Feed (statische Dateien).
3. Repo öffentlich machen – widerspricht Closed Source.

Die App liest die Feed-Adresse aus `Deck:UpdateFeedUrl` (Standard: `https://github.com/SushiFlux-Develop/cuekit-releases`,
ein Platzhalter, solange das Repo nicht existiert – ohne erreichbaren Feed passiert schlicht nichts).

## Fahrplan Desktop-App

1. **Hülle** (Tray + WebView2, hostet den Dienst im selben Prozess) – siehe `desktop/`.
2. **Installer** mit Velopack (`scripts/desktop-pack.ps1`), EULA-Bestätigung beim ersten Start, Auto-Update.
3. **CI-Workflow** (GitHub Actions auf Tags: `v*-rcN` → Entwurfs-Release, `v*` → öffentliches Release).
4. Erst dann lohnt sich der **RC-Commit** (Tag `v<Version>-rcN`), weil er den echten Installer baut.

## Sicherheit beim Signieren

Private Schlüssel (`*.pfx`, `*.p12`, …) gehören **nie** ins Repository – die `.gitignore` schließt sie
aus. Für CI später als GitHub-Secret ablegen, nicht als Datei.
