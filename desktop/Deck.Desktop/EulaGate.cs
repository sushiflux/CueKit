using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Deck.Desktop;

/// <summary>
/// Endnutzer-Lizenzvertrag beim ersten Start: der Velopack-Installer hat keine Lizenzseite, deshalb wird der
/// Text (LICENSE neben der Exe) hier bestaetigt. Die Zustimmung wird mit einem Fingerabdruck des Textes im
/// Datenordner gemerkt - aendert sich der Vertrag, wird erneut gefragt.
/// </summary>
internal static class EulaGate
{
    private sealed record Acceptance(string Fingerprint, DateTimeOffset AcceptedAt);

    /// <summary>True, wenn der Vertrag bereits akzeptiert war oder jetzt akzeptiert wurde.</summary>
    public static bool EnsureAccepted(string dataDir, string product)
    {
        var licensePath = Path.Combine(AppContext.BaseDirectory, "LICENSE");
        // Im Build-/Entwicklungsordner liegt keine LICENSE - dort gibt es nichts zu bestaetigen.
        if (!File.Exists(licensePath)) return true;

        var text = File.ReadAllText(licensePath);
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)))[..16];
        var stored = Path.Combine(dataDir, "eula.json");
        try
        {
            if (File.Exists(stored) && JsonSerializer.Deserialize<Acceptance>(File.ReadAllText(stored))?.Fingerprint == fingerprint) return true;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            // Unlesbare Zustimmung: einfach erneut fragen.
        }

        using var dialog = new EulaForm(product, text);
        if (dialog.ShowDialog() != DialogResult.OK) return false;

        Directory.CreateDirectory(dataDir);
        File.WriteAllText(stored, JsonSerializer.Serialize(new Acceptance(fingerprint, DateTimeOffset.Now)));
        return true;
    }
}

/// <summary>Dunkles Dialogfenster mit dem Lizenztext und den Knoepfen "Ablehnen" / "Akzeptieren".</summary>
internal sealed class EulaForm : Form
{
    public EulaForm(string product, string licenseText)
    {
        var canvas = Color.FromArgb(11, 13, 18);
        var surface = Color.FromArgb(18, 21, 28);
        var ink = Color.FromArgb(238, 240, 246);
        // Schrift (in Punkt) waechst mit der Windows-Skalierung von selbst - Groessen in Pixeln rechnen wir mit.
        var dpi = DeviceDpi / 96f;
        int Px(int value) => (int)Math.Round(value * dpi);

        Text = $"{product} – Lizenzvereinbarung";
        Icon = AppIcon.Large();
        BackColor = canvas;
        ForeColor = ink;
        Font = new Font("Segoe UI", 10f);
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(Px(760), Px(600));
        MinimumSize = new Size(Px(560), Px(420));
        MaximizeBox = false;

        var heading = new Label
        {
            Text = "Bitte lies die Lizenzvereinbarung und bestätige sie, um fortzufahren.",
            Dock = DockStyle.Top,
            Height = Px(52),
            Padding = new Padding(Px(16), Px(16), Px(16), 0),
            ForeColor = ink,
        };

        var box = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Dock = DockStyle.Fill,
            BackColor = surface,
            ForeColor = ink,
            BorderStyle = BorderStyle.None,
            Font = new Font("Segoe UI", 9.5f),
            Text = licenseText.Replace("\r\n", "\n").Replace("\n", "\r\n"),
            TabStop = false,
        };
        box.HandleCreated += (_, _) =>
        {
            Native.UseDarkScrollbars(box.Handle);
            box.Select(0, 0);
        };
        var boxHost = new Panel { Dock = DockStyle.Fill, Padding = new Padding(Px(16), Px(4), Px(16), Px(8)), BackColor = canvas };
        boxHost.Controls.Add(box);

        static Size TextSize(Button b, int padding) => TextRenderer.MeasureText(b.Text, b.Font) + new Size(padding, 0);

        var accept = new Button
        {
            Text = "Akzeptieren und fortfahren",
            DialogResult = DialogResult.OK,
            Height = Px(38),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(91, 75, 245),
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 10f),
        };
        accept.Width = TextSize(accept, Px(44)).Width;
        accept.FlatAppearance.BorderSize = 0;
        var decline = new Button
        {
            Text = "Ablehnen",
            DialogResult = DialogResult.Cancel,
            Height = Px(38),
            FlatStyle = FlatStyle.Flat,
            BackColor = surface,
            ForeColor = ink,
        };
        decline.Width = TextSize(decline, Px(44)).Width;
        decline.FlatAppearance.BorderColor = Color.FromArgb(58, 65, 82);

        var footer = new Panel { Dock = DockStyle.Bottom, Height = Px(62), BackColor = canvas };
        footer.Controls.Add(accept);
        footer.Controls.Add(decline);
        footer.Layout += (_, _) =>
        {
            accept.Location = new Point(footer.ClientSize.Width - accept.Width - Px(16), Px(12));
            decline.Location = new Point(accept.Left - decline.Width - Px(10), Px(12));
        };

        Controls.Add(boxHost);
        Controls.Add(heading);
        Controls.Add(footer);
        AcceptButton = accept;
        CancelButton = decline;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Native.UseDarkTitleBar(Handle);
    }
}
