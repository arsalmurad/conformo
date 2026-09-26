import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Defaults to root ("/"), unchanged for local dev, CI and the existing
// Docker image. Set VITE_BASE_PATH at build time to deploy under a subpath
// instead (e.g. `VITE_BASE_PATH=/conformo/ npm run build` for
// arsalmurad.com/conformo/) — Vite rewrites every asset reference it
// controls (index.html, JS/CSS imports), but the PWA manifest's icon paths
// and start_url below need it applied explicitly since they're plain
// strings, not something Vite parses as an asset reference. Application
// code reads the same value at runtime via `import.meta.env.BASE_URL` (see
// exportPdf.ts, browserValidator.ts, useComplianceCountries.ts) rather than
// hardcoding "/".
const rawBase = process.env.VITE_BASE_PATH || '/';
// Vite requires (and always normalizes its own `base` to) a trailing slash;
// the manifest icon paths below build on top of it with plain string
// concatenation, so a caller forgetting the trailing slash in
// VITE_BASE_PATH would otherwise silently produce "/conformoicon-192.png".
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

// https://vite.dev/config/
export default defineConfig({
  base,
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
        // ~2.7 MB, gzipping to the 191 KB / 76 KB actually sent over the
        // wire — and the SaxonJS runtime. Real, needed weight
        // for offline live-validation to work at all: raise Workbox's default
        // 2 MB per-file cap rather than silently excluding them from the
        // precache, which would make the very first offline validation fail.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      },
      manifest: {
        name: 'Conformo',
        short_name: 'Conformo',
        description: 'Free, client-side legally valid e-invoices. No account, no server.',
        theme_color: '#1554d9',
        background_color: '#fafafb',
        display: 'standalone',
        start_url: base,
        icons: [
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
