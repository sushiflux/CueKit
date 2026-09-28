import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Backend-Ziel fuer den Dev-Proxy: im Docker-Stack der Compose-Service "backend", lokal localhost.
const backend = process.env.DECK_BACKEND_URL ?? 'http://localhost:5201'

const brandingPath = fileURLToPath(new URL('../branding.json', import.meta.url))

/** Setzt den Produktnamen aus branding.json in index.html ein (%PRODUCT_NAME%). */
function brandingHtml(): Plugin {
  return {
    name: 'deck-branding-html',
    transformIndexHtml: (html) => {
      const { productName } = JSON.parse(readFileSync(brandingPath, 'utf8')) as { productName: string }
      return html.replaceAll('%PRODUCT_NAME%', productName)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), brandingHtml()],
  resolve: {
    alias: {
      // Produktname & Co. stehen ausschliesslich in /branding.json (Repo-Wurzel) - im Container
      // wird die Datei nach /branding.json gemountet, also ebenfalls "eine Ebene ueber /app".
      '@branding': brandingPath,
    },
  },
  server: {
    host: true,
    port: 5200,
    strictPort: true,
    fs: { allow: ['..'] },
    // Handys/Tablets greifen im Dev-Betrieb ueber die LAN-IP des PCs zu - deshalb keine
    // Host-Beschraenkung (Vites DNS-Rebinding-Schutz wuerde IP-fremde Namen sonst mit 403 blocken).
    allowedHosts: true,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      '/hub': { target: backend, ws: true, changeOrigin: false },
      '/ws': { target: backend, ws: true, changeOrigin: false },
      '/manifest.webmanifest': { target: backend, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 6000, // Icon-Sammlungen werden bewusst als eigene, lazy geladene Chunks gebuendelt (offline!)
  },
})
