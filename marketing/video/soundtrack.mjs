import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FFMPEG = 'C:\\Program Files\\ShareX\\ffmpeg.exe'

// Duration for Section 1: 14.5 seconds
const DURATION = Number(process.env.VIDEO_DURATION ?? 14.5)
const INPUT_AUDIO = path.join(__dirname, 'soundtrack.mp3')
const OUTPUT_AUDIO = path.join(__dirname, 'build', 'final_audio.wav')

console.log(`[Soundtrack] Erstelle echten Instrumental-Soundtrack (${DURATION}s, reale Instrumente: Drums, Bass, Horns, Guitar)...`)

const fadeOutStart = Math.max(0, DURATION - 1.2)
const filter = `afade=t=in:ss=0:d=0.2,afade=t=out:st=${fadeOutStart}:d=1.2,volume=1.05`

try {
  execSync(`"${FFMPEG}" -y -i "${INPUT_AUDIO}" -t ${DURATION} -af "${filter}" -c:a pcm_s16le -ar 44100 "${OUTPUT_AUDIO}"`, {
    stdio: 'inherit'
  })
  console.log('[Soundtrack] final_audio.wav erfolgreich erstellt!')
} catch (e) {
  console.error('[Soundtrack] Fehler bei der Audioerstellung:', e)
  process.exit(1)
}
