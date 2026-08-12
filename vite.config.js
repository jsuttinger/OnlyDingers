import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Only Dingers',
        short_name: 'Dingers',
        description: 'Live MLB home runs, right on your home screen.',
        start_url: '/',
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
    }),
  ],
  server: {
    // Allows `vite --host` to be reached from other devices on the LAN (e.g. an iPhone).
    host: true,
    port: 5173,
  },
});
