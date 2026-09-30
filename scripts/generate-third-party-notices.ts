/**
 * Erzeugt die Drittanbieter-Lizenzhinweise aus den TATSAECHLICH ausgelieferten Abhaengigkeiten:
 *   - THIRD-PARTY-NOTICES.md                     (Repo-Wurzel, inkl. Lizenztexte)
 *   - frontend/public/third-party-licenses.json  (fuer Einstellungen > Ueber in der App)
 *
 * Frontend: alle Nicht-Dev-Pakete aus package-lock.json (Build-Werkzeuge wie Vite/TypeScript
 * landen nicht im Produkt). Backend: alle NuGet-Pakete inkl. transitiver, Lizenz aus der .nuspec.
 * Vor jedem Release ausfuehren (siehe docs/COMPLIANCE.md):  node scripts/generate-third-party-notices.ts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

interface Entry {
  name: string
  version: string
  license: string
  url: string | null
  component: 'Oberfläche' | 'Dienst'
  text: string | null
}

const root = resolve(import.meta.dirname, '..')
const product = (JSON.parse(readFileSync(join(root, 'branding.json'), 'utf8')) as { productName: string }).productName
const entries: Entry[] = []

function licenseText(dir: string): string | null {
  if (!existsSync(dir)) return null
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(f))
  return file ? readFileSync(join(dir, file), 'utf8').trim() : null
}

// ---------- Frontend (npm) ----------
const lock = JSON.parse(readFileSync(join(root, 'frontend', 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string; license?: string; dev?: boolean; devOptional?: boolean }>
}
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || info.dev || info.devOptional) continue
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
  const dir = join(root, 'frontend', path)
  let license = info.license ?? null
  let url: string | null = null
  const pkgPath = join(dir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    license ??= typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? null)
    url = pkg.homepage ?? (typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? null))
  }
  entries.push({ name, version: info.version ?? '?', license: license ?? 'UNKNOWN', url, component: 'Oberfläche', text: licenseText(dir) })
}

// ---------- Backend (NuGet) ----------
// Nur-Build-Pakete (EF-Design-Werkzeuge, Roslyn) werden nicht ausgeliefert.
const buildOnly = /^(Microsoft\.EntityFrameworkCore\.Design|Microsoft\.CodeAnalysis.*|Humanizer.*|Microsoft\.Build.*|Mono\.TextTemplating|System\.CodeDom|System\.Composition.*|Microsoft\.VisualStudio\.SolutionPersistence)$/
type NugetListing = { projects: { frameworks?: { topLevelPackages?: { id: string; resolvedVersion: string }[]; transitivePackages?: { id: string; resolvedVersion: string }[] }[] }[] }
const nugetRoot = join(homedir(), '.nuget', 'packages')
const seen = new Set<string>()
// Der Dienst zuerst: Pakete, die beide Projekte nutzen, zaehlen als "Dienst"; nur Huellen-eigene (z.B. WebView2) als "Desktop-App".
const nugetProjects = [
  { dir: 'backend', component: 'Dienst' },
  { dir: join('desktop', 'Deck.Desktop'), component: 'Desktop-App' },
]
for (const project of nugetProjects) {
  const listing = JSON.parse(
    execFileSync('dotnet', ['list', 'package', '--include-transitive', '--format', 'json'], { cwd: join(root, project.dir), encoding: 'utf8' }),
  ) as NugetListing
  for (const fw of listing.projects[0]?.frameworks ?? []) {
  for (const p of [...(fw.topLevelPackages ?? []), ...(fw.transitivePackages ?? [])]) {
    if (seen.has(p.id) || buildOnly.test(p.id)) continue
    seen.add(p.id)
    const dir = join(nugetRoot, p.id.toLowerCase(), p.resolvedVersion)
    let license = 'UNKNOWN'
    let url = `https://www.nuget.org/packages/${p.id}/${p.resolvedVersion}`
    const nuspec = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith('.nuspec')) : undefined
    if (nuspec) {
      const xml = readFileSync(join(dir, nuspec), 'utf8')
      const expr = /<license\s+type="expression"\s*>([^<]+)<\/license>/i.exec(xml)
      const file = /<license\s+type="file"\s*>([^<]+)<\/license>/i.exec(xml)
      const legacy = /<licenseUrl>([^<]+)<\/licenseUrl>/i.exec(xml)
      license = expr ? expr[1] : file ? `Siehe Lizenzdatei (${file[1]})` : legacy ? `Siehe ${legacy[1]}` : license
      url = /<projectUrl>([^<]+)<\/projectUrl>/i.exec(xml)?.[1] ?? url
    }
    entries.push({ name: p.id, version: p.resolvedVersion, license, url, component: project.component, text: licenseText(dir) })
  }
  }
}

// ---------- Mitgelieferte Laufzeit fuer Plugins ----------
// Node.js steckt im Produkt (Docker-Image bzw. spaeter im Installer), ist aber kein npm-Paket.
const nodeLicense = [join(process.execPath, '..', 'LICENSE'), '/usr/local/include/node/LICENSE'].find((p) => existsSync(p))
entries.push({
  name: 'Node.js',
  version: process.versions.node,
  license: 'MIT',
  url: 'https://nodejs.org',
  component: 'Dienst',
  text: nodeLicense ? readFileSync(nodeLicense, 'utf8').trim() : null,
})

entries.sort((a, b) => a.component.localeCompare(b.component) || a.name.localeCompare(b.name))

// Copyleft-Lizenzen koennten eine Offenlegung des eigenen Codes erzwingen -> laut melden.
const copyleft = entries.filter((e) => /\b(A?GPL|SSPL|EUPL)\b/i.test(e.license) && !/LGPL/i.test(e.license))
if (copyleft.length) console.warn(`WARNUNG – Copyleft-Lizenz, vor dem Release prüfen: ${copyleft.map((e) => `${e.name} (${e.license})`).join(', ')}`)
const unknown = entries.filter((e) => e.license === 'UNKNOWN')
if (unknown.length) console.warn(`WARNUNG – Lizenz unbekannt: ${unknown.map((e) => e.name).join(', ')}`)

// ---------- Ausgabe ----------
const md = [
  '# Third-Party Notices / Drittanbieter-Lizenzen',
  '',
  `${product} enthält die folgenden Open-Source-Komponenten. Für sie gelten ausschließlich ihre eigenen Lizenzen.`,
  `${product} includes the following open-source components, each governed solely by its own license.`,
  '',
  '_Automatisch erzeugt von `scripts/generate-third-party-notices.ts` – nicht von Hand bearbeiten._',
  '',
  '| Komponente | Paket | Version | Lizenz |',
  '|---|---|---|---|',
  ...entries.map((e) => `| ${e.component} | ${e.name} | ${e.version} | ${e.license} |`),
  '',
  '## Lizenztexte / License texts',
  ...entries.filter((e) => e.text).flatMap((e) => ['', `### ${e.name} ${e.version}`, '', '```', e.text!, '```']),
  '',
].join('\n')

writeFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), md)
writeFileSync(join(root, 'frontend', 'public', 'third-party-licenses.json'), JSON.stringify(entries))
console.log(`${entries.length} Komponenten erfasst -> THIRD-PARTY-NOTICES.md, frontend/public/third-party-licenses.json`)
