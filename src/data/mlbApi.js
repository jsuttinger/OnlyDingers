/**
 * Low-level client for the free, public MLB Stats API (statsapi.mlb.com).
 * No API key required. This module knows nothing about home runs or UI —
 * it just fetches and caches JSON. Domain logic lives in homeRuns.js.
 */

const BASE_URL = 'https://statsapi.mlb.com/api';

export class MlbApiError extends Error {
  constructor(message, { status = null, cause } = {}) {
    super(message);
    this.name = 'MlbApiError';
    this.status = status;
    if (cause) this.cause = cause;
  }
}

/**
 * In-memory response cache, keyed by request URL. Lives only for the
 * current session (page load) — no persistence, no TTL. Concurrent calls
 * for the same URL share a single in-flight request instead of firing
 * duplicate fetches.
 */
const cache = new Map();

async function fetchJson(url, { signal, forceRefresh = false } = {}) {
  if (!forceRefresh && cache.has(url)) {
    return cache.get(url);
  }

  const request = (async () => {
    let response;
    try {
      response = await fetch(url, { signal });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new MlbApiError('Network error reaching the MLB Stats API.', { cause: error });
    }

    if (!response.ok) {
      throw new MlbApiError(`MLB Stats API request failed (${response.status})`, {
        status: response.status,
      });
    }

    try {
      return await response.json();
    } catch (error) {
      throw new MlbApiError('Received an unreadable response from the MLB Stats API.', {
        cause: error,
      });
    }
  })();

  cache.set(url, request);
  // Don't leave a rejected promise cached — let the next call retry.
  request.catch(() => cache.delete(url));

  return request;
}

function buildUrl(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Fetch the schedule for a single date, or a date range (startDate/endDate).
 * Returns the raw MLB Stats API payload: { dates: [{ date, games: [...] }] }
 */
export async function fetchSchedule({ date, startDate, endDate, sportId = 1, signal } = {}) {
  const url = buildUrl('/v1/schedule', {
    sportId,
    date,
    startDate,
    endDate,
    hydrate: 'team,linescore',
  });
  return fetchJson(url, { signal });
}

/**
 * Fetch the full live game feed (boxscore + play-by-play) for a game.
 * `forceRefresh` bypasses the cache read (but still re-caches the result) —
 * useful when polling a game that's still in progress.
 */
export async function fetchGameFeed(gamePk, { signal, forceRefresh = false } = {}) {
  if (!gamePk) throw new MlbApiError('fetchGameFeed requires a gamePk.');
  const url = buildUrl(`/v1.1/game/${gamePk}/feed/live`);
  return fetchJson(url, { signal, forceRefresh });
}

/**
 * Fetch a game's editorial/media content — this is where video highlights
 * live. A highlight item's `guid` matches a play's `playId`, which is how
 * we find the clip for a specific home run.
 */
export async function fetchGameContent(gamePk, { signal, forceRefresh = false } = {}) {
  if (!gamePk) throw new MlbApiError('fetchGameContent requires a gamePk.');
  const url = buildUrl(`/v1/game/${gamePk}/content`);
  return fetchJson(url, { signal, forceRefresh });
}

/**
 * Fetch the official season leaderboard for a stat category. Used for the
 * "Season" leaders window — pulling this from MLB's own leaders endpoint
 * instead of aggregating hundreds of individual game feeds client-side.
 */
export async function fetchStatsLeaders({
  leaderCategories = 'homeRuns',
  statGroup = 'hitting',
  season,
  limit = 10,
  sportId = 1,
  signal,
  forceRefresh = false,
} = {}) {
  const url = buildUrl('/v1/stats/leaders', { leaderCategories, statGroup, season, limit, sportId });
  return fetchJson(url, { signal, forceRefresh });
}

/**
 * Fetch a player's game-by-game hitting log for a season — one entry per
 * game actually played (off days simply have no entry, doubleheaders have
 * two same-date entries), which is exactly what's needed to compute a
 * "consecutive games with a HR" streak without being thrown off by
 * calendar gaps.
 */
export async function fetchPlayerGameLog(personId, { season, signal, forceRefresh = false } = {}) {
  if (!personId) throw new MlbApiError('fetchPlayerGameLog requires a personId.');
  const url = buildUrl(`/v1/people/${personId}/stats`, { stats: 'gameLog', group: 'hitting', season });
  return fetchJson(url, { signal, forceRefresh });
}

/** Clears the in-memory cache, or just entries whose URL starts with `urlPrefix`. */
export function clearCache(urlPrefix) {
  if (!urlPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(urlPrefix)) cache.delete(key);
  }
}
