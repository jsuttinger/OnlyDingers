/**
 * Placeholder root component.
 *
 * This is intentionally minimal for now — just enough to confirm the dev
 * server, PWA manifest, and iPhone home screen install all work end to end.
 * Swap this out for the real home run feed once that's wired up.
 */
export function createApp(root) {
  root.innerHTML = `
    <main class="app">
      <span class="app__badge">⚾️</span>
      <h1 class="app__title">Only Dingers</h1>
      <p class="app__subtitle">MLB home runs, right on your home screen.</p>
    </main>
  `;
}
