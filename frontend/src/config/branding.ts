import raw from '@branding'

/** Einzige Quelle fuer Produktname & Co. ist /branding.json in der Repo-Wurzel. */
export const branding = raw as { productName: string; tagline: string; company: string; madeIn: string }
