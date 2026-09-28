# Compliance-Checkliste (Lizenz, CRA, Datenschutz)

Arbeitsliste für SushiFlux Develop. **Keine Rechtsberatung** – die mit ⚖️ markierten Punkte vor
dem ersten öffentlichen Release von einer Anwältin/einem Anwalt prüfen lassen.

## 1. Lizenzmodell

| Teil | Lizenz | Datei |
|---|---|---|
| Baton (Dienst, Oberfläche, Installer) | Proprietär, kostenlos (Freeware-EULA) | `LICENSE` |
| Plugin-SDK, Beispiele, Plugin-Protokoll | MIT | `plugins/LICENSE` |
| Drittanbieter-Komponenten | jeweils eigene (MIT, Apache-2.0, ISC, BSD, OFL-1.1, CC0, 0BSD, Unlicense) | `THIRD-PARTY-NOTICES.md` |

- [x] EULA (DE/EN) mit Verbot von Veränderung, Weiterverkauf und Rückentwicklung – `LICENSE`
- [x] Drittanbieter-Hinweise automatisch aus den ausgelieferten Paketen –
      `node scripts/generate-third-party-notices.ts`, in der App unter Einstellungen › Über
- [x] Keine Copyleft-Abhängigkeit (GPL/AGPL) im Produkt – das Skript warnt, falls sich das ändert
- [ ] ⚖️ EULA prüfen lassen (insb. Haftungsklausel, Wirksamkeit gegenüber Verbrauchern)
- [ ] EULA im Installer anzeigen und bestätigen lassen (WiX-Lizenzdialog)
- [ ] ⚖️ Marke „Baton“ + Logo recherchieren und anmelden (DPMA/EUIPO) – bester Schutz gegen Nachahmer
- [ ] Release-Build: .NET-Code verschleiern (Obfuscation) und signieren (Code-Signing-Zertifikat,
      vermeidet zugleich SmartScreen-Warnungen)

**Hinweis Markenlogos:** Die Icon-Sammlung „Simple Icons“ enthält Logos fremder Marken (Twitch,
YouTube, Adobe …). Die Sammlung selbst ist CC0, die Logos bleiben aber Marken ihrer Inhaber –
nutzbar, um auf eine Integration hinzuweisen, nicht für eigenes Marketing/Branding.

## 2. EU Cyber Resilience Act (Verordnung (EU) 2024/2847)

Gilt für „Produkte mit digitalen Elementen“, die im Rahmen einer **Geschäftstätigkeit** auf dem
EU-Markt bereitgestellt werden – **auch kostenlos**. Die Ausnahme für freie Open-Source-Software
greift für Baton als Closed Source **nicht**. ⚖️ Klären, ob die Bereitstellung durch
SushiFlux Develop als Geschäftstätigkeit gilt (sehr wahrscheinlich ja, sobald ein Unternehmen
dahintersteht).

Zeitplan:
- seit **11.09.2026**: Meldepflichten (Art. 14) für aktiv ausgenutzte Schwachstellen und
  schwere Sicherheitsvorfälle – Frühwarnung binnen 24 h, Meldung binnen 72 h über die
  ENISA-Meldeplattform. Betrifft Produkte, die bereits auf dem Markt sind.
- ab **11.12.2027**: alle Hersteller-Pflichten (Konformitätsbewertung, CE-Kennzeichnung,
  technische Dokumentation, Sicherheitsupdates im Unterstützungszeitraum).

Baton ist nach aktuellem Stand ein Produkt der „Standardkategorie“ (nicht in Anhang III/IV) →
Konformitätsbewertung per interner Kontrolle (Selbsterklärung) voraussichtlich ausreichend. ⚖️

Bereits erledigt bzw. angelegt:
- [x] Security by Design: Gerätekopplung mit Einmalcodes, gehashte Tokens, Rollen, Rate-Limiting,
      CSP/Security-Header, verschlüsselte Geheimnisse, keine Standardpasswörter, nur lokale Daten
- [x] Schwachstellen-Meldeweg – `SECURITY.md`
- [x] Abhängigkeits-Scan auf bekannte Schwachstellen (`npm audit`,
      `dotnet list package --vulnerable --include-transitive`) – vor jedem Release
- [ ] Echte Security-Kontaktadresse in `SECURITY.md` und in der App eintragen
- [ ] SBOM (Software-Stückliste) pro Release erzeugen, z.B. CycloneDX
      (`npx @cyclonedx/cyclonedx-npm`, `dotnet CycloneDX`) und archivieren
- [ ] Unterstützungszeitraum festlegen und veröffentlichen (CRA: grundsätzlich ≥ 5 Jahre bzw.
      erwartete Nutzungsdauer)
- [ ] Update-Mechanismus mit signierten Updates (Desktop-App)
- [ ] ENISA-Meldeprozess intern festlegen (wer meldet, binnen 24 h)
- [ ] Bis 12/2027: technische Dokumentation, EU-Konformitätserklärung, CE-Kennzeichnung

## 3. Datenschutz (DSGVO)

- [x] Baton verarbeitet alle Daten lokal im eigenen Netz, sendet nichts ins Internet, keine
      Telemetrie, keine Konten – Hinweis in der App unter Einstellungen › Über
- [ ] Sobald die App etwas nach außen sendet (Update-Prüfung, Absturzberichte, Plugin-Katalog):
      Datenschutzerklärung erstellen und ggf. Einwilligung einholen
- [ ] Datenschutzerklärung für die Download-Website

## 4. Website / Vertrieb

- [ ] Impressum auf der Website (§ 5 DDG)
- [ ] Datenschutzerklärung der Website
- [ ] EULA vor dem Download bzw. im Installer
- [ ] Lizenzbedingungen für den Plugin-Katalog (falls Community-Plugins zentral angeboten werden)
