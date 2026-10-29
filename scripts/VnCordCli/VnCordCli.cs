// VnCordCli.exe — GUI installer for VnCord, styled after the Vencord
// installer (dark Discord theme, radio install picker, rounded green /
// blue / red action buttons). Drives scripts/runInstaller.mjs via node.
//
// Compiled with the .NET Framework csc that ships with Windows:
//   csc /target:winexe /win32icon:icon.ico
//       /r:System.Windows.Forms.dll /r:System.Drawing.dll
//       /r:System.Web.Extensions.dll /out:VnCordCli.exe VnCordCli.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class VnCordCli
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallerForm());
    }
}

class RoundedPanel : FlowLayoutPanel
{
    public int Radius = 8;
    public Color BorderColor = Color.Transparent;
    public int BorderWidth = 0;

    public RoundedPanel()
    {
        DoubleBuffered = true;
        Resize += delegate { UpdateRegion(); };
    }

    static GraphicsPath RoundedRect(Rectangle r, int radius)
    {
        if (radius > r.Width / 2) radius = r.Width / 2;
        if (radius > r.Height / 2) radius = r.Height / 2;
        if (radius < 1) radius = 1;

        var path = new GraphicsPath();
        int d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    void UpdateRegion()
    {
        if (Width <= 0 || Height <= 0) return;
        using (var path = RoundedRect(new Rectangle(0, 0, Width, Height), Radius))
            Region = new Region(path);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (BorderWidth <= 0 || Width < 4 || Height < 4) return;
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (var path = RoundedRect(new Rectangle(0, 0, Width - 1, Height - 1), Radius))
        using (var pen = new Pen(BorderColor, BorderWidth))
            e.Graphics.DrawPath(pen, path);
    }
}

class InstallerForm : Form
{
    // Palette lifted from the Vencord installer (gui.go).
    static readonly Color BgDark = Color.FromArgb(49, 51, 56);        // #313338
    static readonly Color BgPanel = Color.FromArgb(43, 45, 49);       // #2B2D31
    static readonly Color TextMain = Color.White;
    static readonly Color TextDim = Color.FromArgb(150, 228, 228, 230);
    static readonly Color Green = Color.FromArgb(0, 133, 69);
    static readonly Color GreenHover = Color.FromArgb(0, 108, 55);
    static readonly Color Blue = Color.FromArgb(88, 101, 242);
    static readonly Color BlueHover = Color.FromArgb(68, 82, 187);
    static readonly Color Red = Color.FromArgb(210, 45, 57);
    static readonly Color RedHover = Color.FromArgb(169, 35, 46);
    static readonly Color Yellow = Color.FromArgb(254, 231, 92);
    readonly FlowLayoutPanel radioPanel;
    readonly Button installButton;
    readonly Button repairButton;
    readonly Button uninstallButton;
    readonly Button refreshButton;
    readonly TextBox log;
    readonly NotifyIcon toast;
    readonly string script;

    List<Dictionary<string, object>> installs = new List<Dictionary<string, object>>();
    int selected = -1;
    bool running;
    int lastExitCode;

    public InstallerForm()
    {
        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        // exe lives in scripts/VnCordCli/ (repo copy) or dist/Installer/
        // (build output); the repo root is two levels up either way.
        string repo = Path.GetFullPath(Path.Combine(exeDir, "..", ".."));
        script = Path.Combine(repo, "scripts", "runInstaller.mjs");
        if (File.Exists(Path.Combine(exeDir, "icon.ico")))
        {
            Icon = new Icon(Path.Combine(exeDir, "icon.ico"));
            toast = new NotifyIcon { Icon = Icon, Visible = true, Text = "VnCord Installer" };
        }

        Text = "VnCord Installer";
        Size = new Size(860, 640);
        MinimumSize = new Size(720, 540);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = BgDark;
        ForeColor = TextMain;
        Font = new Font("Segoe UI", 9.75F);

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, Padding = new Padding(28, 20, 28, 20), BackColor = BgDark };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));   // warning card
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));   // heading
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); // install list
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));   // buttons
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));   // log

        root.Controls.Add(MakeWarningCard(), 0, 0);
        root.Controls.Add(new Label
        {
            Text = "Please select an install to patch",
            AutoSize = true,
            Font = new Font("Segoe UI", 15F, FontStyle.Bold),
            ForeColor = TextMain,
            Margin = new Padding(0, 14, 0, 8)
        }, 0, 1);

        radioPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            BackColor = BgDark
        };
        root.Controls.Add(radioPanel, 0, 2);

        var buttonRow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, AutoSize = true, Margin = new Padding(0, 14, 0, 0) };
        foreach (var w in new[] { 33.3f, 33.3f, 33.4f })
            buttonRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, w));
        installButton = MakeButton("Install", Green, GreenHover);
        repairButton = MakeButton("Reinstall / Repair", Blue, BlueHover);
        uninstallButton = MakeButton("Uninstall", Red, RedHover);
        installButton.Click += delegate { RunAction("install"); };
        repairButton.Click += delegate { RunAction("repair"); };
        uninstallButton.Click += delegate { RunAction("uninstall"); };
        installButton.Dock = DockStyle.Fill;
        repairButton.Dock = DockStyle.Fill;
        uninstallButton.Dock = DockStyle.Fill;
        buttonRow.Controls.Add(installButton, 0, 0);
        buttonRow.Controls.Add(repairButton, 1, 0);
        buttonRow.Controls.Add(uninstallButton, 2, 0);
        foreach (Control c in buttonRow.Controls)
            c.Margin = new Padding(0, 0, 12, 0);
        root.Controls.Add(buttonRow, 0, 3);

        var logRow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, AutoSize = true, Margin = new Padding(0, 10, 0, 0) };
        logRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        logRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        log = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BackColor = BgPanel,
            ForeColor = TextDim,
            BorderStyle = BorderStyle.None,
            Font = new Font(FontFamily.GenericMonospace, 8.75F)
        };
        var logCard = new RoundedPanel
        {
            BackColor = BgPanel,
            Radius = 10,
            Padding = new Padding(10, 8, 10, 8),
            Dock = DockStyle.Fill,
            Height = 96
        };
        logCard.Controls.Add(log);
        refreshButton = MakeButton("Refresh", BgPanel, Color.FromArgb(58, 60, 65));
        refreshButton.Click += delegate { RefreshList(); };
        refreshButton.Dock = DockStyle.Fill;
        refreshButton.Margin = new Padding(12, 0, 0, 0);
        logRow.Controls.Add(logCard, 0, 0);
        logRow.Controls.Add(refreshButton, 1, 0);
        root.Controls.Add(logRow, 0, 4);

        Controls.Add(root);

        FormClosed += delegate
        {
            if (toast != null) toast.Visible = false;
        };

        Load += delegate { RefreshList(); };
    }

    Control MakeWarningCard()
    {
        var card = new Label
        {
            Text = "vncord.pages.dev and the VnCord GitHub repository are the only official places to get VnCord.\n" +
                   "Any other site claiming to be us is malicious.",
            Dock = DockStyle.Fill,
            BackColor = Yellow,
            ForeColor = Color.Black,
            Font = new Font("Segoe UI", 9.5F),
            Padding = new Padding(14, 10, 14, 10),
            AutoSize = true
        };
        card.Resize += delegate { RoundControl(card, 8); };
        return card;
    }

    Button MakeButton(string text, Color back, Color hover)
    {
        var b = new Button
        {
            Text = text,
            FlatStyle = FlatStyle.Flat,
            BackColor = back,
            ForeColor = TextMain,
            Font = new Font("Segoe UI", 11F, FontStyle.Bold),
            MinimumSize = new Size(0, 46),
            Margin = new Padding(0, 0, 12, 0),
            Cursor = Cursors.Hand
        };
        b.FlatAppearance.BorderSize = 0;
        b.FlatAppearance.MouseOverBackColor = hover;
        b.FlatAppearance.MouseDownBackColor = hover;
        b.Resize += delegate { RoundControl(b, 8); };
        return b;
    }

    static void RoundControl(Control c, int radius)
    {
        if (c.Width <= 0 || c.Height <= 0) return;
        using (var path = new GraphicsPath())
        {
            var r = new Rectangle(0, 0, c.Width, c.Height);
            path.AddArc(r.X, r.Y, 2 * radius, 2 * radius, 180, 90);
            path.AddArc(r.Right - 2 * radius, r.Y, 2 * radius, 2 * radius, 270, 90);
            path.AddArc(r.Right - 2 * radius, r.Bottom - 2 * radius, 2 * radius, 2 * radius, 0, 90);
            path.AddArc(r.X, r.Bottom - 2 * radius, 2 * radius, 2 * radius, 90, 90);
            path.CloseFigure();
            c.Region = new Region(path);
        }
    }

    void SetRunning(bool value)
    {
        running = value;
        installButton.Enabled = !value;
        repairButton.Enabled = !value;
        uninstallButton.Enabled = !value;
        refreshButton.Enabled = !value;
    }

    void AppendLog(string text)
    {
        if (log.InvokeRequired)
        {
            log.BeginInvoke((MethodInvoker)delegate { AppendLog(text); });
            return;
        }
        log.AppendText(text.EndsWith("\n") ? text : text + Environment.NewLine);
    }

    ProcessStartInfo NodeStartInfo(string args)
    {
        var psi = new ProcessStartInfo("node", "\"" + script + "\" -- " + args);
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = System.Text.Encoding.UTF8;
        psi.StandardErrorEncoding = System.Text.Encoding.UTF8;
        return psi;
    }

    System.Threading.Tasks.Task<string> RunNodeAsync(string args, bool quiet = false)
    {
        var tcs = new System.Threading.Tasks.TaskCompletionSource<string>();
        var output = new System.Text.StringBuilder();
        var p = new Process { StartInfo = NodeStartInfo(args), EnableRaisingEvents = true };
        p.OutputDataReceived += delegate(object s, DataReceivedEventArgs e)
        {
            if (e.Data == null) return;
            lock (output) output.AppendLine(e.Data);
            if (!quiet) AppendLog(e.Data);
        };
        p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e)
        {
            if (e.Data == null) return;
            lock (output) output.AppendLine("[!] " + e.Data);
            if (!quiet) AppendLog("[!] " + e.Data);
        };
        p.Exited += delegate
        {
            string text;
            try
            {
                p.WaitForExit();
                lock (output) text = output.ToString();
                lastExitCode = p.ExitCode;
                if (p.ExitCode != 0) AppendLog("(exit code " + p.ExitCode + ")");
            }
            catch
            {
                text = "";
            }
            tcs.SetResult(text);
            p.Dispose();
        };
        if (!quiet) AppendLog("> node scripts/runInstaller.mjs -- " + args);
        p.Start();
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return tcs.Task;
    }

    string StatusSuffix(string status)
    {
        switch (status)
        {
            case "VnCord": return "  (VnCord Installed)";
            case "other mod": return "  (Another mod installed)";
            case "broken patch": return "  (Broken patch)";
            default: return "";
        }
    }

    Color StatusColor(string status)
    {
        switch (status)
        {
            case "VnCord": return Color.FromArgb(0, 176, 90);
            case "other mod": return Color.FromArgb(254, 231, 92);
            case "broken patch": return Color.Red;
            default: return TextMain;
        }
    }

    void RenderRadioList()
    {
        radioPanel.SuspendLayout();
        radioPanel.Controls.Clear();

        if (installs.Count == 0)
        {
            radioPanel.Controls.Add(new Label
            {
                Text = "No Discord installs found. You first need to install Discord.",
                AutoSize = true,
                ForeColor = TextDim
            });
            radioPanel.ResumeLayout();
            return;
        }

        var picks = new RadioButton[installs.Count];
        var cards = new RoundedPanel[installs.Count];

        Action updateHighlights = delegate
        {
            for (int k = 0; k < cards.Length; k++)
            {
                bool sel = k == selected;
                cards[k].BorderColor = sel ? Green : Color.Transparent;
                cards[k].BorderWidth = sel ? 2 : 0;
                cards[k].Invalidate();
            }
        };

        for (int i = 0; i < installs.Count; i++)
        {
            var row = installs[i];
            var name = (row.ContainsKey("channel") ? row["channel"] as string : "") ?? "";
            var path = (row.ContainsKey("resources") ? row["resources"] as string : "") ?? "";
            var status = (row.ContainsKey("status") ? row["status"] as string : "") ?? "";
            var version = (row.ContainsKey("version") ? row["version"] as string : "") ?? "";
            if (version.StartsWith("app-")) version = version.Substring(4);

            var pick = new RadioButton
            {
                Text = name + (version.Length > 0 ? "  ·  v" + version : "") + StatusSuffix(status),
                AutoSize = true,
                ForeColor = StatusColor(status),
                Font = new Font("Segoe UI", 11.5F),
                Cursor = Cursors.Hand
            };

            var pathLabel = new Label
            {
                Text = path,
                AutoSize = true,
                ForeColor = TextDim,
                Font = new Font("Segoe UI", 8.75F),
                Margin = new Padding(24, 0, 0, 0)
            };

            var card = new RoundedPanel
            {
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                BackColor = BgPanel,
                Padding = new Padding(12, 10, 12, 10),
                Margin = new Padding(0, 0, 0, 8),
                Radius = 10,
                Cursor = Cursors.Hand
            };
            card.Controls.Add(pick);
            card.Controls.Add(pathLabel);

            var idx = i;
            pick.CheckedChanged += delegate
            {
                if (!pick.Checked) return;
                selected = idx;
                for (int k = 0; k < picks.Length; k++)
                    if (picks[k] != null && picks[k] != pick) picks[k].Checked = false;
                updateHighlights();
            };
            card.Click += delegate { pick.Checked = true; };
            pathLabel.Click += delegate { pick.Checked = true; };

            picks[i] = pick;
            cards[i] = card;
            radioPanel.Controls.Add(card);
        }

        if (selected < 0 || selected >= installs.Count) selected = 0;
        picks[selected].Checked = true;
        updateHighlights();

        radioPanel.ResumeLayout();
    }

    async void RefreshList()
    {
        if (running) return;
        SetRunning(true);
        try
        {
            var result = await RunNodeAsync("--status-json", quiet: true);
            ParseStatusIntoList(result ?? "");
        }
        catch (Exception ex)
        {
            AppendLog("[!] " + ex.Message);
        }
        SetRunning(false);
    }

    void ParseStatusIntoList(string json)
    {
        int start = json.IndexOf('[');
        if (start == -1)
        {
            installs = new List<Dictionary<string, object>>();
            RenderRadioList();
            AppendLog("[!] No install list received.");
            return;
        }
        try
        {
            var serializer = new JavaScriptSerializer { MaxJsonLength = 1 << 24 };
            installs = serializer.Deserialize<List<Dictionary<string, object>>>(json.Substring(start));
        }
        catch (Exception ex)
        {
            AppendLog("[!] Failed to read install list: " + ex.Message);
        }
        if (selected >= installs.Count) selected = installs.Count - 1;
        RenderRadioList();
        AppendLog("Found " + installs.Count + " installation(s).");
    }

    async void RunAction(string action)
    {
        if (running || selected < 0 || selected >= installs.Count) return;
        var resources = installs[selected].ContainsKey("resources") ? installs[selected]["resources"] as string : null;
        if (string.IsNullOrEmpty(resources)) return;

        SetRunning(true);
        try
        {
            await RunNodeAsync("--" + action + " --target \"" + resources + "\"");
            AppendLog("");
            if (lastExitCode == 0) ShowSuccessToast(action);
        }
        catch (Exception ex)
        {
            AppendLog("[!] " + ex.Message);
        }
        await RefreshCore();
    }

    void ShowSuccessToast(string action)
    {
        if (toast == null) return;
        string title;
        string text;
        if (action == "uninstall")
        {
            title = "Uninstalled";
            text = "VnCord has been removed. Discord is back to vanilla — start it whenever you like.";
        }
        else
        {
            title = action == "repair" ? "Repaired" : "Installed";
            text = "VnCord was successfully " + title.ToLower() + "! Start Discord to apply.";
        }
        toast.ShowBalloonTip(4000, title, text, ToolTipIcon.Info);
    }

    async System.Threading.Tasks.Task RefreshCore()
    {
        try
        {
            var result = await RunNodeAsync("--status-json");
            ParseStatusIntoList(result ?? "");
        }
        catch (Exception ex)
        {
            AppendLog("[!] " + ex.Message);
        }
        SetRunning(false);
    }
}
