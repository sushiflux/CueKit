# Plugin-Protokoll (v1)

> Dieses Dokument und das Plugin-SDK unter `plugins/` stehen unter der [MIT-Lizenz](../plugins/LICENSE).
> Eigene Plugins dürfen unter beliebiger Lizenz veröffentlicht werden.

Plugins sind **eigenständige Programme** in beliebiger Sprache (TypeScript/Node, Python, C#, Go …),
die sich per WebSocket beim Dienst anmelden – nach dem Vorbild des Stream-Deck-SDK. Stürzt ein
Plugin ab, läuft der Dienst unbeeinträchtigt weiter.

## Verbindung

```
ws://<pc>:<port>/plugins?key=<plugin-schlüssel>
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

## Beispiel

Ein lauffähiges Minimal-Plugin in TypeScript liegt unter `plugins/example-hello/`.
