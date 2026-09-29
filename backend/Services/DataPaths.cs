namespace Deck.Server.Services;

/// <summary>Wurzel fuer alle Laufzeitdaten (Datenbank, Schluessel, installierte Plugins).</summary>
public record DataPaths(string DataDir)
{
    public string PluginsDir => Path.Combine(DataDir, "plugins");

    /// <summary>Hochgeladenes Deck-Hintergrundbild (Aussehen-Einstellungen) - siehe AppearanceController.</summary>
    public string AppearanceDir => Path.Combine(DataDir, "appearance");
}
