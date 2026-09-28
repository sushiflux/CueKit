namespace Deck.Server.Services;

/// <summary>Wurzel fuer alle Laufzeitdaten (Datenbank, Schluessel, installierte Plugins).</summary>
public record DataPaths(string DataDir)
{
    public string PluginsDir => Path.Combine(DataDir, "plugins");
}
