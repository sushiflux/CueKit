# CueKit – Versionsübersicht

Schneller Überblick, was aktuell tatsächlich im Einsatz ist. Keine Historie (dafür sind die
Changelogs da). „Latest available“ wird zu Sessionbeginn live neu geprüft.

| Component | Current version | Latest available | Check for updates |
|---|---|---|---|
| .NET | 10.0.401 SDK | 10.0.401 SDK | https://dotnet.microsoft.com/download/dotnet |
| Node.js | 24 (Build + Plugin-Laufzeit im Backend-Image) | 24 LTS | https://nodejs.org/en/download |
| React | 19.3.0 | 19.3.0 | https://github.com/facebook/react/releases |
| React Router | 8.4.0 | 8.4.0 | https://github.com/remix-run/react-router/releases |
| Vite | 8.3.1 | 8.3.1 | https://github.com/vitejs/vite/releases |
| TypeScript | 6.0.2 | 7.0.2 | https://github.com/microsoft/TypeScript/releases |
| Tailwind CSS | 4.3.3 | 4.3.3 | https://github.com/tailwindlabs/tailwindcss/releases |
| motion | 13.4.4 | 13.4.4 | https://github.com/motiondivision/motion/releases |
| @microsoft/signalr | 10.0.11 | 10.0.11 | https://www.npmjs.com/package/@microsoft/signalr |
| @dnd-kit/core | 6.3.1 | 6.3.1 | https://github.com/clauderic/dnd-kit/releases |
| Iconify (react / Sets) | 6.0.2 / tabler 1.2.40, mdi 1.2.3, simple-icons 1.2.97 | gleich | https://github.com/iconify/iconify |
| EF Core (SQLite) | 10.0.12 | 10.0.12 | https://github.com/dotnet/efcore/releases |
| SQLite | über Microsoft.Data.Sqlite | – | https://www.sqlite.org/changes.html |
| Microsoft.Web.WebView2 (SDK der Desktop-Hülle) | 1.0.4258.31 | 1.0.4258.31 | https://www.nuget.org/packages/Microsoft.Web.WebView2 |
| WebView2-Laufzeit (Evergreen, beim Nutzer) | 154.0.4258.37 (auf dieser Maschine) | Evergreen, wird von Windows aktualisiert | https://developer.microsoft.com/microsoft-edge/webview2/ |
| Velopack (Installer + Auto-Update; NuGet `Velopack` und Werkzeug `vpk`) | 1.2.161 | 1.2.161 | https://github.com/velopack/velopack/releases |
| Windows Forms (Desktop-Hülle) | über .NET 10 | – | https://dotnet.microsoft.com/download/dotnet |
| obs-websocket | Protokoll v5 (in OBS ≥ 28) | v5 | https://github.com/obsproject/obs-websocket/releases |

**TypeScript 7** (nativer Compiler-Rewrite) bewusst noch nicht übernommen: Vite 8 /
`@vitejs/plugin-react` sind gegen TS 6.x getestet – gleiche Entscheidung wie in Betquat.
