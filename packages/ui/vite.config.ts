import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Fonts and the ICC profile are fetched at PDF-export time (see
      // src/pdf/exportPdf.ts); without precaching them explicitly, the very
      // first export while offline would fail on a cache miss.
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg}',
          'assets/fonts/*.ttf',
          'assets/*.icc',
          'validator/*.{json,js}',
        ],
        // The SEF artefacts are raw (uncompressed) JSON on disk — ~9.1 MB and
        // ~2.7 MB, gzipping to the 191 KB / 76 KB actually sent over the wire
        // (see the project's own tracker) — and the SaxonJS runtime. Real, needed weight
        // for offline live-validation to work at all: raise Workbox's default
        // 2 MB per-file cap rather than silently excluding them from the
        // precache, which would make the very first offline validation fail.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      },
      manifest: {
        name: 'invoice-engine',
        short_name: 'Invoices',
        description: 'Free, client-side legally valid e-invoices. No account, no server.',
        theme_color: '#1554d9',
        background_color: '#fafafb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
