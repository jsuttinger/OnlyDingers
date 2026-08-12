# Only Dingers ⚾️

A lightweight PWA that shows MLB home runs, built to run fast and feel native
when pinned to an iPhone home screen. Vanilla JS + [Vite](https://vitejs.dev/)
— no framework.

## Project structure

```
OnlyDingers/
├── index.html          # HTML entry point, iOS home-screen meta tags
├── vite.config.js       # Vite + vite-plugin-pwa (manifest, service worker)
├── public/
│   ├── favicon.svg
│   └── icons/           # Generated PWA / apple-touch icons
└── src/
    ├── main.js          # Entry point, mounts the app + registers the SW
    ├── App.js            # Root "component" (placeholder for now)
    └── styles/
        └── main.css
```

## Run it locally

```bash
npm install
npm run dev
```

This starts the Vite dev server (with `--host`, so it's reachable on your
LAN) at `http://localhost:5173`.

## View it on your iPhone

1. Make sure your iPhone and your computer are on the **same Wi-Fi network**.
2. Find your computer's local IP address:
   - macOS: `ipconfig getifaddr en0` (or check System Settings → Wi-Fi →
     Details)
   - Windows: `ipconfig` and look for the "IPv4 Address" under your Wi-Fi
     adapter
   - Linux: `hostname -I` or `ip addr`
3. With `npm run dev` running, open Safari on your iPhone and go to:
   ```
   http://<your-computer's-ip>:5173
   ```
   e.g. `http://192.168.1.42:5173`
4. If it doesn't load, check that your computer's firewall allows incoming
   connections on port 5173, and that both devices are truly on the same
   network (not a "guest"/isolated Wi-Fi network, which blocks device-to-device
   traffic).

### Install it as a home screen app

1. Open the site in Safari on your iPhone (per above).
2. Tap the **Share** icon → **Add to Home Screen**.
3. It'll launch full-screen, without Safari's UI, like a native app.

> Note: the service worker (offline support / installability) is powered by
> `vite-plugin-pwa` and is also enabled in dev mode (`devOptions.enabled` in
> `vite.config.js`), so you can test the install flow without doing a
> production build. Run `npm run build && npm run preview` to test the real
> production build.

## Status

This is just the scaffold — `App.js` currently renders a placeholder
"Only Dingers" screen to confirm the dev server, PWA manifest, and iPhone
install flow all work end to end. The home run feed comes next.
