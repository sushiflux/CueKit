# Changelog (Release-Kandidaten / Release candidates)

**[English](#english) · [Deutsch](#deutsch)**

# English

## v2026.9.9-rc1 (release candidate, not public)

The first installable version of CueKit – a free Stream Deck alternative for OBS. Phones, tablets and browsers become your button deck; the PC runs the service. For testing only.

### ✨ Everything that is in it

**Desktop app for Windows**
- Installer without admin rights; the app lives in the system tray, opens in its own window, can start with Windows and updates itself.
- Terms of use are confirmed on first start.

**OBS integration**
- Connects to OBS via obs-websocket. On first start the local OBS is found and set up automatically (port and password); OBS on other PCs in the network can be found by scanning.
- Clear error messages: missing or wrong password, OBS not reachable, invalid address.
- Scenes, sources, audio, media, transitions, profiles and scene collections are read live from OBS.
- Actions: switch scene, show/hide sources, mute, volume (up / down / exact dB), start/stop stream, recording, replay buffer, virtual camera, studio mode, media control, filters on/off, refresh source, set transition, switch scene collection or profile, recording chapter and split.
- Keys show their real state (active / muted / live / recording) and a physical toggle LED.
- **Live level meters** on source keys (green / orange / red like in OBS, gray when muted) and a volume bar.
- If OBS is not running, your keys stay visible: OBS-only keys are dimmed, multi-actions still run their other steps.

**Building your deck**
- One screen for using and editing: drag and drop keys, swap by dragging, right-click menus, several decks, pages and folders (folders get an automatic "Home" key), grid presets and "fill from OBS".
- **Multi-actions:** one key can run several steps in a row, including delays.
- Own colors, labels and icons per key; icon library works fully offline.
- **Deck frames ("plates"):** a realistic device frame around your keys – exchangeable in the appearance settings.
- Light and dark design with high contrast, physical-looking keys with a clear "pressed" effect; labels shrink to fit instead of breaking mid-word.
- Portrait and landscape on phones, focus/fullscreen mode, installable as an app on the home screen.

**System actions**
- Set and mute the PC volume, open a website, open a program, open a file or folder, shut down the PC (normal or forced).
- Live tiles for CPU, GPU and RAM load and temperature as ring gauges.

**Automations**
- Rules with triggers (OBS events, timers, key press), conditions and actions – attached directly to a key, or as their own switchable tile.

**Hotkeys**
- Assign a shortcut to any key; in the desktop app it works system-wide, even while OBS is in front. Conflicts with other programs are shown.

**Plugins**
- Extend CueKit with your own plugins (Node.js) – install from a ZIP file or a catalog with checksum verification, enable, restart, view the log. Plugins end together with the app.

**Devices and security**
- Pair phones and tablets with a QR code or one-time code; every device has its own access, with roles Owner and Controller; rename and remove devices.
- The first owner can only be set up on the PC itself. The OBS password is stored encrypted.

**Backup**
- Export and import decks (including their automations).

**Good to know**
- Everything works without internet. The interface is German. Unsigned installers trigger a Windows SmartScreen warning ("More info → Run anyway").

# Deutsch

## v2026.9.9-rc1 (Release-Kandidat, nicht öffentlich)

Die erste installierbare Version von CueKit – eine kostenlose Stream-Deck-Alternative für OBS. Handys, Tablets und Browser werden zu deinem Tastenfeld, der PC führt den Dienst aus. Nur zum Testen.

### ✨ Alles, was drin ist

**Desktop-App für Windows**
- Installer ohne Administratorrechte; die App läuft im Tray, öffnet sich in einem eigenen Fenster, startet auf Wunsch mit Windows und aktualisiert sich selbst.
- Die Nutzungsbedingungen werden beim ersten Start bestätigt.

**OBS-Anbindung**
- Verbindung zu OBS über obs-websocket. Beim ersten Start wird das lokale OBS automatisch gefunden und eingerichtet (Port und Passwort); OBS auf anderen PCs im Netzwerk lässt sich per Suche finden.
- Verständliche Fehlermeldungen: Passwort fehlt oder falsch, OBS nicht erreichbar, ungültige Adresse.
- Szenen, Quellen, Audio, Medien, Übergänge, Profile und Szenensammlungen werden live aus OBS gelesen.
- Aktionen: Szene wechseln, Quellen ein-/ausblenden, Stummschalten, Lautstärke (lauter / leiser / genauer dB-Wert), Stream starten/beenden, Aufnahme, Replay-Puffer, virtuelle Kamera, Studio-Modus, Mediensteuerung, Filter ein/aus, Quelle aktualisieren, Übergang setzen, Szenensammlung oder Profil wechseln, Aufnahme-Kapitel und -Teilung.
- Tasten zeigen den echten Zustand (aktiv / stumm / live / Aufnahme) und eine physische Schalt-LED.
- **Live-Pegelanzeige** an Quellen-Tasten (grün / orange / rot wie in OBS, grau bei Stumm) und ein Lautstärke-Balken.
- Ist OBS nicht gestartet, bleiben die Tasten sichtbar: reine OBS-Tasten sind abgeblendet, Multi-Aktionen führen ihre anderen Schritte weiter aus.

**Dein Deck bauen**
- Ein Bildschirm zum Benutzen und Bearbeiten: Tasten per Drag & Drop, Tauschen durch Ziehen, Rechtsklick-Menüs, mehrere Decks, Seiten und Ordner (Ordner bekommen automatisch eine „Startseite“-Taste), Raster-Vorlagen und „Aus OBS befüllen“.
- **Multi-Aktionen:** eine Taste führt mehrere Schritte nacheinander aus, auch mit Wartezeiten.
- Eigene Farben, Beschriftungen und Symbole je Taste; die Symbol-Bibliothek funktioniert komplett offline.
- **Gehäuse („Plates“):** ein realistischer Geräterahmen um deine Tasten – in den Aussehen-Einstellungen austauschbar.
- Helles und dunkles Design mit hohem Kontrast, physisch wirkende Tasten mit deutlichem „Gedrückt“-Effekt; Beschriftungen werden kleiner statt mitten im Wort umzubrechen.
- Hoch- und Querformat auf dem Handy, Fokus-/Vollbildmodus, als App auf dem Startbildschirm installierbar.

**System-Aktionen**
- PC-Lautstärke einstellen und stummschalten, Webseite öffnen, Programm öffnen, Datei oder Ordner öffnen, PC herunterfahren (normal oder erzwungen).
- Live-Kacheln für CPU-, GPU- und RAM-Auslastung und Temperatur als Ringanzeigen.

**Automationen**
- Regeln mit Auslösern (OBS-Ereignisse, Zeitgeber, Tastendruck), Bedingungen und Aktionen – direkt an einer Taste oder als eigene schaltbare Kachel.

**Tastenkürzel**
- Jeder Taste ein Kürzel zuweisen; in der Desktop-App funktioniert es systemweit, auch wenn OBS im Vordergrund ist. Konflikte mit anderen Programmen werden angezeigt.

**Plugins**
- CueKit mit eigenen Plugins (Node.js) erweitern – Installation per ZIP-Datei oder Katalog mit Prüfsummen-Kontrolle, aktivieren, neu starten, Protokoll ansehen. Plugins enden zusammen mit der App.

**Geräte und Sicherheit**
- Handys und Tablets per QR-Code oder Einmal-Code koppeln; jedes Gerät hat seinen eigenen Zugang, mit den Rollen Besitzer und Steuerung; Geräte umbenennen und entfernen.
- Der erste Besitzer lässt sich nur am PC selbst einrichten. Das OBS-Passwort wird verschlüsselt gespeichert.

**Sicherung**
- Decks (inklusive ihrer Automationen) exportieren und importieren.

**Gut zu wissen**
- Alles funktioniert ohne Internet. Die Oberfläche ist deutsch. Unsignierte Installer lösen eine Windows-SmartScreen-Warnung aus („Weitere Informationen → Trotzdem ausführen“).
