import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves this repo from https://<user>.github.io/OnlyDingers/,
// so production assets need that subpath as their base. Local dev stays at
// "/" so the existing `npm run dev` + LAN/iPhone workflow is unaffected.
// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/OnlyDingers/' : '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Only Dingers',
        short_name: 'Dingers',
        description: 'Live MLB home runs, right on your home screen.',
        // Left unset on purpose — vite-plugin-pwa derives start_url/scope
        // from `base` above, so this stays correct on GitHub Pages too.
        display: 'standalone',
        background_color: '#0b0f19',
        theme_color: '#0b0f19',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // Handy while iterating locally: `npm run dev` still serves the SW.
      devOptions: {
        enabled: true,
      },
      workbox: {
        runtimeCaching: [
          {
            // The MLB Stats API itself (schedule, game feeds, content/video
            // lookups) — separate from the precached app shell above.
            // NetworkFirst: always prefer a live response, but fall back to
            // the last cached one (per URL) if the network fails or is too
            // slow, so a flaky connection degrades gracefully.
            urlPattern: ({ url }) => url.origin === 'https://statsapi.mlb.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mlb-api',
              networkTimeoutSeconds: 6,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 12, // 12 hours
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Allows `vite --host` to be reached from other devices on the LAN (e.g. an iPhone).
    host: true,
    port: 5173,
  },
}));
