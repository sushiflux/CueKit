import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(__dirname, 'build')
await mkdir(buildDir, { recursive: true })

const FFMPEG = 'C:\\Program Files\\ShareX\\ffmpeg.exe'
const FPS = 60
const DURATION = 14.5
const TOTAL_FRAMES = Math.round(DURATION * FPS)
const AUDIO_FILE = path.join(buildDir, 'final_audio.wav')
const OUTPUT_FILE = path.join(__dirname, 'CueKit-Marketingvideo-4K.mp4')

console.log(`[Render Engine] Starte bildgenaues 4K UHD 60fps Rendering (${TOTAL_FRAMES} Frames, NVIDIA NVENC 80 Mbit/s)...`)

// Start FFmpeg process reading uncompressed image stream from stdin
const ffmpeg = spawn(
  FFMPEG,
  [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', String(FPS),
    '-i', '-',
    '-i', AUDIO_FILE,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'hevc_nvenc',
    '-preset', 'p7',
    '-tune', 'hq',
    '-b:v', '80M',
    '-maxrate', '100M',
    '-bufsize', '100M',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '320k',
    '-ar', '44100',
    '-movflags', '+faststart',
    '-t', String(DURATION),
    OUTPUT_FILE,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] }
)

const browser = await chromium.launch({
  headless: true,
  args: [
    '--window-size=3840,2160',
    '--force-device-scale-factor=1',
    '--high-dpi-support=1',
    '--enable-gpu',
    '--disable-gpu-vsync',
    '--hide-scrollbars',
  ],
})

const page = await browser.newPage({
  viewport: { width: 3840, height: 2160 },
  deviceScaleFactor: 1,
})

await page.goto('http://localhost:5200/showcase', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.videoReady === true, null, { timeout: 30_000 })

const client = await page.context().newCDPSession(page)

console.log(`[Render Engine] Rendere Frame für Frame (100% frei von Playwright-Bitrate-Limits)...`)
const startTime = Date.now()

for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
  const timeMs = (frame / FPS) * 1000
  await page.evaluate((t) => window.seekVideo(t), timeMs)

  const { data } = await client.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 98,
  })

  const buffer = Buffer.from(data, 'base64')
  const ok = ffmpeg.stdin.write(buffer)

  if (!ok) {
    await new Promise((resolve) => ffmpeg.stdin.once('drain', resolve))
  }

  if ((frame + 1) % 120 === 0 || frame === TOTAL_FRAMES - 1) {
    const elapsed = (Date.now() - startTime) / 1000
    const fps = (frame + 1) / elapsed
    const percent = Math.round(((frame + 1) / TOTAL_FRAMES) * 100)
    console.log(`[Render Engine] Fortschritt: ${frame + 1}/${TOTAL_FRAMES} (${percent}%) - ${fps.toFixed(1)} fps - ${elapsed.toFixed(1)}s`)
  }
}

ffmpeg.stdin.end()

await new Promise((resolve, reject) => {
  ffmpeg.on('close', (code) => {
    if (code === 0) resolve()
    else reject(new Error(`FFmpeg beendet mit Code ${code}`))
  })
})

await browser.close()
console.log(`[Render Engine] 4K UHD Master-Video erfolgreich erstellt: ${OUTPUT_FILE}`)
