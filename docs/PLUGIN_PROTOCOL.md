# Plugin-Protokoll (v1)

> Dieses Dokument und das Plugin-SDK unter `plugins/` stehen unter der [MIT-Lizenz](../plugins/LICENSE).
> Eigene Plugins dürfen unter beliebiger Lizenz veröffentlicht werden.

Plugins sind **eigenständige Programme** in beliebiger Sprache (TypeScript/Node, Python, C#, Go …),
die sich per WebSocket beim Dienst anmelden – nach dem Vorbild des Stream-Deck-SDK. Stürzt ein
Plugin ab, läuft der Dienst unbeeinträchtigt weiter.

## Verbindung

```
ws://<pc>:<port>/ws/plugins?key=<plugin-schlüssel>
```

Adresse und Schlüssel stehen in der App unter **Plugins → Plugin-Verbindung**. Der Schlüssel kann
dort jederzeit erneuert werden (laufende Plugins müssen dann neu verbinden).

Alle Nachrichten sind UTF-8-JSON-Textframes, max. 1 MB.

## 1. Anmelden (Plugin → Dienst)

Die **erste** Nachricht muss `register` sein:

```json
{
  "type": "register",
  "plugin": {
    "id": "com.example.photoshop",
    "name": "Photoshop",
    "version": "1.0.0",
    "author": "Jane Doe",
    "icon": "simple-icons:adobephotoshop",
    "actions": [
      {
        "id": "runAction",
        "name": "Aktion ausführen",
        "description": "Startet eine Photoshop-Aktion aus einem Aktionsset.",
        "icon": "tabler:wand",
        "color": "sky",
        "fields": [
          { "key": "set", "label": "Aktionsset", "kind": "text", "required": true },
          { "key": "action", "label": "Aktion", "kind": "text", "required": true }
        ]
      }
    ]
  }
}
```

- `id`: `a-z 0-9 . -`, 3–64 Zeichen, z.B. umgekehrte Domain. Meldet sich eine zweite Instanz mit
  derselben ID an, wird die alte Verbindung geschlossen.
- `icon`: Iconify-Name aus den gebündelten Sammlungen `tabler:*`, `mdi:*`, `simple-icons:*`.
- `color`: eine der Tastenfarben `slate violet indigo sky teal emerald amber orange red rose pink`.
- `fields[].kind`: `text`, `number`, `select` (mit `options: [{ "value", "label" }]`), sowie die
  OBS-gebundenen Arten `scene`, `sceneItem`, `audioInput`. `default` ist optional.

Antwort des Dienstes: `{ "type": "registered", "protocol": 1 }`.

Die Aktionen erscheinen sofort im Editor (Palette → *Plugins*) mit dem Typ
`plugin:<plugin-id>/<action-id>` und können auch in Automationen verwendet werden.

## 2. Ausführen (Dienst → Plugin)

```json
{ "type": "invoke", "invocationId": "8f0c…", "action": "runAction", "params": { "set": "Standard", "action": "Vignette" } }
```

Das Plugin **muss** innerhalb von 15 Sekunden antworten:

```json
{ "type": "result", "invocationId": "8f0c…", "ok": true }
{ "type": "result", "invocationId": "8f0c…", "ok": false, "error": "Photoshop ist nicht geöffnet." }
```

`error` wird dem Nutzer wörtlich angezeigt – bitte konkret formulieren.

## 3. Protokollieren (Plugin → Dienst, optional)

```json
{ "type": "log", "message": "Verbunden mit Photoshop 2026" }
```

## Paketformat (Installation)

Plugins werden als **ZIP-Datei** installiert – entweder in der App unter *Plugins › Aus Datei
installieren* oder automatisch aus dem offiziellen Katalog. Baton entpackt das Paket, startet es mit
der mitgelieferten Node.js-Laufzeit und übergibt die Verbindung per Umgebungsvariable. Plugins
laufen mit **JavaScript oder TypeScript** (Node.js ≥ 24 führt `.ts` direkt aus); andere Laufzeiten
oder `.exe`-Dateien werden nicht unterstützt.

```
mein-plugin.zip
├── manifest.json
├── index.ts          (Startdatei, siehe "entry")
└── …                 (weitere Dateien, z.B. node_modules/)
```

`manifest.json`:

```json
{
  "id": "com.example.photoshop",
  "name": "Photoshop",
  "version": "1.2.0",
  "author": "Jane Doe",
  "description": "Aktionen und Ebenen in Photoshop steuern.",
  "icon": "simple-icons:adobephotoshop",
  "entry": "index.ts",
  "runtime": "node",
  "homepage": "https://example.com"
}
```

Der Inhalt darf auch in genau einem Unterordner liegen (`mein-plugin/manifest.json`). Grenzen:
25 MB gepackt, 150 MB entpackt, 5 000 Dateien. Pfade außerhalb des Paketordners werden abgelehnt.

Umgebungsvariablen beim Start:

| Variable | Inhalt |
|---|---|
| `DECK_URL` | WebSocket-Adresse, z.B. `ws://127.0.0.1:5202/ws/plugins` |
| `DECK_KEY` | Plugin-Schlüssel |
| `DECK_PLUGIN_ID` | ID aus dem Manifest |
| `DECK_PLUGIN_DIR` | Installationsordner des Plugins |

Ausgaben auf stdout/stderr erscheinen in der App im Plugin-Protokoll. Beendet sich das Plugin,
startet Baton es neu (mit wachsender Pause); nach 5 Abstürzen innerhalb kurzer Zeit wird es angehalten.

## Katalog-Format (offizielle Website)

Die App liest den Katalog von der in `Deck:PluginCatalogUrl` konfigurierten Adresse:

```json
{
  "plugins": [
    {
      "id": "com.example.photoshop",
      "name": "Photoshop",
      "version": "1.2.0",
      "author": "Jane Doe",
      "description": "Aktionen und Ebenen in Photoshop steuern.",
      "icon": "simple-icons:adobephotoshop",
      "downloadUrl": "https://…/com.example.photoshop-1.2.0.zip",
      "sha256": "…64 Hex-Zeichen…",
      "homepage": "https://example.com"
    }
  ]
}
```

Jeder Download wird gegen `sha256` geprüft; die Plugin-ID im Paket muss zum Eintrag passen.

## Beispiel

Ein lauffähiges Minimal-Plugin in TypeScript (inkl. `manifest.json`) liegt unter
`plugins/example-hello/`. Zum Testen den Ordnerinhalt als ZIP packen und in der App installieren.
