# Only Dingers ⚾️

A lightweight PWA that shows MLB home runs, built to run fast and feel native
when pinned to an iPhone home screen. Vanilla JS + [Vite](https://vitejs.dev/)
— no framework. Data comes from the free, public
[MLB Stats API](https://statsapi.mlb.com) (no key required).

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
    ├── App.js            # Wires the data layer to the feed UI
    ├── data/             # MLB Stats API client + domain layer (decoupled from UI)
    │   ├── mlbApi.js      # low-level fetch + in-memory cache
    │   ├── homeRuns.js    # games/home-run parsing, the module the UI imports
    │   ├── asyncState.js  # tiny loading/error/data container
    │   ├── mockHomeRuns.js  # static fixture for fast UI iteration
    │   └── index.js       # public entry point for the data layer
    ├── ui/               # feed rendering (no data-fetching in here)
    │   ├── feed.js        # loading/error/empty/list states, pull-to-refresh
    │   ├── card.js         # one home run's card markup
    │   └── format.js       # date/stat formatting helpers
    └── styles/
        └── main.css       # light/dark theme via prefers-color-scheme
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

1. Open the site in Safari on your iPhone (per above, or the GitHub Pages URL
   below).
2. Tap the **Share** icon → **Add to Home Screen**.
3. It'll launch full-screen, without Safari's UI, like a native app.

> Note: the service worker (offline support / installability) is powered by
> `vite-plugin-pwa` and is also enabled in dev mode (`devOptions.enabled` in
> `vite.config.js`), so you can test the install flow without doing a
> production build. Run `npm run build && npm run preview` to test the real
> production build.

## Deploying to GitHub Pages

Pushing to `main` auto-deploys via `.github/workflows/deploy.yml`. One-time
setup:

1. In the repo on GitHub: **Settings → Pages → Source** → select
   **GitHub Actions**.
2. Push to `main` (or run the workflow manually from the **Actions** tab).
3. The site publishes to `https://<your-username>.github.io/OnlyDingers/`.

GitHub Pages serves project sites from that `/OnlyDingers/` subpath, so
`vite.config.js` sets `base: '/OnlyDingers/'` for production builds only —
`npm run dev` still runs at `/` locally, unaffected. If you ever rename the
repo, update `base` in `vite.config.js` to match.

To build the exact same output locally:

```bash
npm run build
npm run preview
```

## Status

The main screen is a scrollable feed of home run cards (player, team, HR
count for that game, distance/exit velo when available), pulling live from
the MLB Stats API, with pull-to-refresh and a manual refresh button.
