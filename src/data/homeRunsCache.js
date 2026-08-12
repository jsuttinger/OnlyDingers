/**
 * Persists the last successfully-fetched home run feed to localStorage, so
 * the app has something to show if it's opened with no signal. Separate
 * from mlbApi.js's in-memory response cache (which doesn't survive a
 * reload) and from the service worker's HTTP cache (which caches individual
 * API responses, not "the feed as the user last saw it").
 */
const STORAGE_KEY = 'only-dingers:home-runs-cache:v1';

export function saveHomeRunsToCache(homeRuns) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ homeRuns, fetchedAt: new Date().toISOString() }));
  } catch (error) {
    // Storage can be full, disabled (private browsing), or unavailable — the
    // app should keep working without offline fallback, not crash.
    console.warn('[cache] failed to persist home runs', error);
  }
}

/** Returns { homeRuns, fetchedAt } from the last successful fetch, or null if there isn't one. */
export function loadHomeRunsFromCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.homeRuns) || !parsed?.fetchedAt) return null;
    return parsed;
  } catch (error) {
    console.warn('[cache] failed to read persisted home runs', error);
    return null;
  }
}
