import type { CSSProperties } from 'react'
import { withDeviceToken } from '../api/client'
import type { AppearanceBackground } from '../api/types'
import { PLATE_PRESETS } from './platePresets'
import { PHOTO_PRESETS } from './photoPresets'

/**
 * Loest die aktuelle Aussehen-Hintergrundwahl in fertige inline-Style-Werte auf - fuer den
 * Deck-Hintergrundcontainer (siehe pages/DeckPage.tsx). "preset" unterscheidet anhand des
 * Key-Praefixes zwischen einem handgefertigten CSS-Muster ("css:<key>", siehe platePresets.ts)
 * und einem Foto-Hintergrund ("photo:<dateiname>", siehe photoPresets.ts).
 */
export function resolveBackgroundStyle(bg: AppearanceBackground | undefined | null): CSSProperties {
  if (!bg) return {}
  switch (bg.kind) {
    case 'solid':
      return { background: bg.solid }
    case 'gradient':
      return { background: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom}, ${bg.gradientTo})` }
    case 'preset': {
      if (bg.preset.startsWith('css:')) {
        const preset = PLATE_PRESETS.find((p) => p.key === bg.preset)
        return preset ? { background: preset.css } : {}
      }
      if (bg.preset.startsWith('photo:')) {
        const photo = PHOTO_PRESETS.find((p) => p.key === bg.preset)
        return photo ? { backgroundImage: `url(${photo.url})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}
      }
      return {}
    }
    case 'image':
      return bg.imageUrl
        ? {
            // Wird vom Browser selbst geladen (kein fetch()/api()) - Token als Query-Param noetig,
            // da kein Authorization-Header gesetzt werden kann (siehe DeviceAuthHandler).
            backgroundImage: `url(${withDeviceToken(bg.imageUrl)})`,
            backgroundPosition: `${bg.imageX}% ${bg.imageY}%`,
            backgroundSize: `${bg.imageZoom}%`,
            backgroundRepeat: 'no-repeat',
          }
        : {}
    default:
      return {}
  }
}

/** Ob der aktuelle Hintergrund ein Foto/Muster mit direkt sichtbarem Text/Icons davor ist, das von
 * einem dezenten Verdunkelungs-Schleier profitieren wuerde (siehe DeckPage.tsx). Bei einer reinen
 * Volltonfarbe (die der Nutzer sich bewusst so gewaehlt hat) wird nicht ungefragt abgedunkelt. */
export function backgroundNeedsOverlay(bg: AppearanceBackground | undefined | null): boolean {
  return bg?.kind === 'preset' || bg?.kind === 'image'
}
