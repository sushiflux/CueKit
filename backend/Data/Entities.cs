namespace Deck.Server.Data;

/// <summary>
/// Ein Deck = ein komplettes Tastenlayout mit festem Raster (z.B. 3x5 wie ein Stream Deck MK.2).
/// Mehrere Decks erlauben unterschiedliche Layouts pro Geraet (Handy hochkant vs. Tablet quer).
/// </summary>
public class DeckEntity
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Rows { get; set; } = 3;
    public int Columns { get; set; } = 5;
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<PageEntity> Pages { get; set; } = [];
}

/// <summary>
/// Eine Seite eines Decks. ParentPageId == null ist die Startseite; alles andere ist ein Ordner,
/// der ueber einen Button mit der Aktion "deck.openPage" geoeffnet wird.
/// </summary>
public class PageEntity
{
    public int Id { get; set; }
    public int DeckId { get; set; }
    public DeckEntity? Deck { get; set; }
    public int? ParentPageId { get; set; }
    public string Name { get; set; } = "";
    public List<ButtonEntity> Buttons { get; set; } = [];
}

public class ButtonEntity
{
    public int Id { get; set; }
    public int PageId { get; set; }
    public PageEntity? Page { get; set; }

    /// <summary>0-basierte Rasterposition.</summary>
    public int Row { get; set; }
    public int Column { get; set; }

    public string Label { get; set; } = "";

    /// <summary>Iconify-Name, z.B. "tabler:video" (offline gebuendelte Sammlungen).</summary>
    public string? Icon { get; set; }

    /// <summary>Farbschluessel aus der kuratierten Palette (z.B. "violet") - kein freier Hexwert,
    /// damit Kontrast/Themes zentral im Frontend kontrollierbar bleiben.</summary>
    public string Color { get; set; } = "slate";

    /// <summary>JSON-Liste von <see cref="Actions.ActionStep"/> (Multi-Action).</summary>
    public string ActionsJson { get; set; } = "[]";

    /// <summary>
    /// Tastenkuerzel, z.B. "Ctrl+Shift+KeyF" (KeyboardEvent.code, tastaturlayout-unabhaengig).
    /// Im Browser aktiv, solange das Deck im Browser im Vordergrund ist; die Desktop-App registriert es systemweit.
    /// </summary>
    public string? Hotkey { get; set; }
}

/// <summary>"Wenn X passiert (Trigger), und Y gilt (Bedingungen), dann tue Z (Aktionen)."</summary>
public class AutomationEntity
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public string TriggerJson { get; set; } = "{}";
    public string ConditionsJson { get; set; } = "[]";
    public string ActionsJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum DeviceRole
{
    /// <summary>Darf Buttons druecken und die Vorschau sehen.</summary>
    Controller = 0,
    /// <summary>Darf zusaetzlich Decks/Automationen/Einstellungen bearbeiten und Geraete koppeln.</summary>
    Owner = 1,
}

/// <summary>Ein gekoppeltes Geraet (Handy, Tablet, Browser, die Desktop-App selbst).</summary>
public class DeviceEntity
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public DeviceRole Role { get; set; }

    /// <summary>SHA-256 des Geraete-Tokens - das Token selbst wird nie gespeichert.</summary>
    public string TokenHash { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastSeenAt { get; set; }
}

/// <summary>Ein installiertes Plugin-Paket (ZIP aus Datei oder Katalog), entpackt unter {DataDir}/plugins/{Id}.</summary>
public class InstalledPluginEntity
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string? Author { get; set; }
    public string? Description { get; set; }
    public string Icon { get; set; } = "tabler:puzzle";
    /// <summary>Startdatei relativ zum Plugin-Ordner, z.B. "index.js" oder "plugin.ts".</summary>
    public string Entry { get; set; } = "";
    public bool Enabled { get; set; } = true;
    /// <summary>"file" (ZIP hochgeladen) oder "catalog" (aus dem offiziellen Katalog).</summary>
    public string Source { get; set; } = "file";
    public DateTimeOffset InstalledAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Datenbank-gestuetzte Einstellungen (siehe CLAUDE.md "Admin settings: database-backed").</summary>
public class SettingEntity
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}
