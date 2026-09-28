# Plugins entwickeln / Building plugins

CueKit ist kostenlos, der Kern ist jedoch **nicht quelloffen** (siehe [LICENSE](LICENSE)).
Offen ist alles, was du zum Erweitern brauchst: das **Plugin-Protokoll** und das **Plugin-SDK**.

## Lizenzen

| Teil | Lizenz |
|---|---|
| CueKit (Dienst, Oberfläche, Installer) | proprietär, kostenlos – [LICENSE](LICENSE) |
| `plugins/` (SDK, Beispiele) und [`docs/PLUGIN_PROTOCOL.md`](docs/PLUGIN_PROTOCOL.md) | [MIT](plugins/LICENSE) |

## Eigene Plugins

Plugins sind eigenständige Programme in beliebiger Sprache, die sich per WebSocket bei CueKit
anmelden – Details im [Plugin-Protokoll](docs/PLUGIN_PROTOCOL.md), Vorlage unter
`plugins/example-hello/`. Deine Plugins gehören dir: Du darfst sie unter jeder Lizenz
veröffentlichen, auch kostenpflichtig.

## Name und Logo

„CueKit“ und das CueKit-Logo sind Kennzeichen von SushiFlux Develop. Plugins dürfen angeben, dass
sie „für CueKit“ sind, aber nicht den Eindruck erwecken, ein offizielles Produkt zu sein.

## Sicherheitslücken

Bitte vertraulich melden – siehe [SECURITY.md](SECURITY.md).

---

© 2026 SushiFlux Develop
