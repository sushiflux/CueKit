/** Woher eine Audioquelle kommt - als kleines weisses Logo oben links an Tasten und OLED-Displays. Weitere Streaming-Programme
 * (Streamlabs, XSplit) hier ergaenzen, sobald sie angebunden sind. */
export type AudioOrigin = 'windows' | 'obs' | 'streamlabs' | 'xsplit'

export const ORIGIN_ICONS: Record<AudioOrigin, string> = {
  windows: 'tabler:brand-windows',
  obs: 'simple-icons:obsstudio',
  streamlabs: 'simple-icons:streamlabs',
  xsplit: 'simple-icons:xsplit',
}

export const ORIGIN_NAMES: Record<AudioOrigin, string> = {
  windows: 'Windows-Audio',
  obs: 'OBS-Audioquelle',
  streamlabs: 'Streamlabs-Audioquelle',
  xsplit: 'XSplit-Audioquelle',
}
