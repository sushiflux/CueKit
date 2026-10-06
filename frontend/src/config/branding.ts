import raw from '@branding'

/** Einzige Quelle fuer Produktname & Co. ist /branding.json in der Repo-Wurzel. */
export const branding = raw as { productName: string; tagline: string; company: string; releaseStage?: string }

const STAGE_LABELS: Record<string, string> = { alpha: 'Alpha', beta: 'Beta' }

/**
 * Version samt Reifegrad fuer die Anzeige ("v2026.10.18 · Alpha"). Der Reifegrad ("releaseStage" in branding.json: alpha | beta | leer)
 * gehoert NICHT in die Versionsnummer selbst (Installer/Store brauchen reine Zahlen) und aendert sich nur, wenn der Besitzer ihn bewusst
 * umstellt - nicht mit Commit-, RC- oder Release-Woertern.
 */
export function versionWithStage(version: string | null): string | null {
  const stage = STAGE_LABELS[(branding.releaseStage ?? '').toLowerCase()]
  return stage && version ? `${version} · ${stage}` : version
}
