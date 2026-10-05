namespace Deck.Server.Obs;

/// <summary>
/// Umrechnung zwischen dB und der Reglerstellung (0-100 %) des OBS-Mixers. OBS zeichnet seinen Lautstaerke-Regler nicht linear in dB,
/// sondern auf einer logarithmischen Kurve (libobs obs-audio-controls.c, OBS_FADER_LOG: -96 dB = ganz unten, 0 dB = ganz oben);
/// "50 %" heisst also: der Regler steht in der Mitte - das entspricht etwa -18,7 dB.
/// </summary>
public static class ObsFader
{
    private const double LogOffsetDb = 6.0;
    private const double LogRangeDb = 96.0;
    private const double LogOffsetVal = -0.77815125038364363; // -log10(LogOffsetDb)
    private const double LogRangeVal = -2.00860017176191756;  // -log10(-LogRangeDb + LogOffsetDb)

    /// <summary>Reglerstellung 0..1 zu einem dB-Wert (0 = ganz unten: -100 dB, also hoerbar stumm).</summary>
    public static double ToDb(double position)
    {
        if (position >= 1) return 0;
        if (position <= 0) return -100;
        return -(LogRangeDb + LogOffsetDb) * Math.Pow((LogRangeDb + LogOffsetDb) / LogOffsetDb, -position) + LogOffsetDb;
    }

    /// <summary>dB-Wert zur Reglerstellung 0..1 (ueber 0 dB = 1).</summary>
    public static double ToPosition(double db)
    {
        if (!double.IsFinite(db) || db <= -LogRangeDb) return 0;
        if (db >= 0) return 1;
        return (-Math.Log10(-db + LogOffsetDb) - LogRangeVal) / (LogOffsetVal - LogRangeVal);
    }
}
