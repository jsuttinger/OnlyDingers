/**
 * Domain layer: turns raw MLB Stats API responses into the shapes the app
 * actually wants (games, home run events). This is the module the UI
 * should import from — swap mlbApi.js for a different data source later
 * and this file (and its exports) can stay the same.
 */
import { fetchSchedule, fetchGameFeed, fetchGameContent } from './mlbApi.js';
import { saveHomeRunsToCache, loadHomeRunsFromCache } from './homeRunsCache.js';

/** @typedef {'Preview'|'Live'|'Final'} GameStatus */

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeGame(raw, scheduleDate) {
  return {
    gamePk: raw.gamePk,
    date: raw.gameDate,
    // The MLB schedule day this game belongs to (YYYY-MM-DD) — not always
    // the same calendar date as `date` once you account for time zones
    // (e.g. a 10pm ET start is already "tomorrow" in UTC).
    scheduleDate,
    /** @type {GameStatus} */
    status: raw.status?.abstractGameState ?? 'Unknown',
    detailedStatus: raw.status?.detailedState ?? '',
    venue: raw.venue?.name ?? null,
    home: {
      id: raw.teams?.home?.team?.id ?? null,
      name: raw.teams?.home?.team?.name ?? null,
      score: raw.teams?.home?.score ?? null,
    },
    away: {
      id: raw.teams?.away?.team?.id ?? null,
      name: raw.teams?.away?.team?.name ?? null,
      score: raw.teams?.away?.score ?? null,
    },
  };
}

function normalizeScheduleResponse(data) {
  return (data.dates ?? []).flatMap((day) => (day.games ?? []).map((game) => normalizeGame(game, day.date)));
}

/** Get all games scheduled for a given date (defaults to today, local time). */
export async function getGamesForDate(date = new Date(), { signal } = {}) {
  const iso = typeof date === 'string' ? date : toISODate(date);
  const data = await fetchSchedule({ date: iso, signal });
  return normalizeScheduleResponse(data);
}

/**
 * Get games from the last `daysBack` days through `endDate` (default: today),
 * newest first. Useful since "today" may have no games yet (early morning)
 * or none at all (off-day/off-season).
 */
export async function getRecentGames({ daysBack = 3, endDate = new Date(), signal } = {}) {
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);

  const data = await fetchSchedule({
    startDate: toISODate(start),
    endDate: toISODate(end),
    signal,
  });
  return normalizeScheduleResponse(data).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** Find the specific playEvent that recorded the ball in play (has hitData + a playId). */
function findHitEvent(play) {
  return play.playEvents?.find((event) => event.hitData) ?? null;
}

function normalizeTeam(team) {
  if (!team) return null;
  return {
    id: team.id ?? null,
    name: team.name ?? null,
    abbreviation: team.abbreviation ?? null,
  };
}

function normalizeHomeRun(play, { home, away }) {
  // Visiting team bats in the top half of the inning, home team in the bottom.
  const isTop = play.about?.halfInning === 'top';
  const battingTeam = isTop ? away : home;
  const opponentTeam = isTop ? home : away;
  const hitEvent = findHitEvent(play);
  const hitData = hitEvent?.hitData ?? null;

  return {
    id: String(play.about?.atBatIndex ?? `${play.result?.description ?? 'hr'}-${play.about?.startTime ?? ''}`),
    // Matches a video highlight's `guid` in the game's content feed (see getHomeRunVideo).
    playId: hitEvent?.playId ?? null,
    inning: play.about?.inning ?? null,
    halfInning: play.about?.halfInning ?? null,
    team: normalizeTeam(battingTeam),
    opponent: normalizeTeam(opponentTeam),
    batter: play.matchup?.batter
      ? { id: play.matchup.batter.id ?? null, name: play.matchup.batter.fullName ?? null }
      : null,
    pitcher: play.matchup?.pitcher
      ? { id: play.matchup.pitcher.id ?? null, name: play.matchup.pitcher.fullName ?? null }
      : null,
    description: play.result?.description ?? '',
    rbi: play.result?.rbi ?? null,
    awayScore: play.result?.awayScore ?? null,
    homeScore: play.result?.homeScore ?? null,
    // Statcast data isn't always present (older parks, data outages) — null when missing.
    distanceFeet: hitData?.totalDistance ?? null,
    exitVelocityMph: hitData?.launchSpeed ?? null,
    launchAngleDegrees: hitData?.launchAngle ?? null,
    trajectory: hitData?.trajectory ?? null,
    timestamp: play.about?.endTime ?? play.about?.startTime ?? null,
    // Filled in below: how many HRs this batter has hit in this game.
    gameHrNumber: null,
    gameHrTotal: null,
  };
}

/** Tags each HR with its place among that same batter's HRs in this game (e.g. 2nd of 2). */
function tagMultiHomerGames(homeRuns) {
  const totalByBatter = new Map();
  for (const hr of homeRuns) {
    const key = hr.batter?.id ?? hr.batter?.name;
    totalByBatter.set(key, (totalByBatter.get(key) ?? 0) + 1);
  }

  const runningByBatter = new Map();
  for (const hr of homeRuns) {
    const key = hr.batter?.id ?? hr.batter?.name;
    const running = (runningByBatter.get(key) ?? 0) + 1;
    runningByBatter.set(key, running);
    hr.gameHrNumber = running;
    hr.gameHrTotal = totalByBatter.get(key);
  }

  return homeRuns;
}

/**
 * Get all home run events for a single game, in play order. Each HR is
 * tagged with gameHrNumber/gameHrTotal (e.g. a player's 2nd of 2 that game).
 * `forceRefresh` bypasses the cache — pass it when polling a live game.
 */
export async function getHomeRuns(gamePk, { signal, forceRefresh = false } = {}) {
  const feed = await fetchGameFeed(gamePk, { signal, forceRefresh });
  const home = feed.gameData?.teams?.home;
  const away = feed.gameData?.teams?.away;
  const plays = feed.liveData?.plays?.allPlays ?? [];

  const homeRuns = plays
    .filter((play) => play.result?.event === 'Home Run')
    .map((play) => normalizeHomeRun(play, { home, away }));

  for (const hr of homeRuns) {
    hr.gamePk = gamePk;
    // hr.id (built from atBatIndex) is only unique within one game — prefix
    // with gamePk so it's safe to use as a key once games get aggregated.
    hr.id = `${gamePk}-${hr.id}`;
  }

  return tagMultiHomerGames(homeRuns);
}

/**
 * Convenience aggregate: home runs across all recently-started games
 * (Live or Final), newest first. One failed game feed doesn't take down
 * the rest of the list.
 */
export async function getRecentHomeRuns({ daysBack = 2, endDate, signal } = {}) {
  const games = await getRecentGames({ daysBack, endDate, signal });
  const startedGames = games.filter((g) => g.status === 'Live' || g.status === 'Final');

  const perGame = await Promise.all(
    startedGames.map(async (game) => {
      try {
        const homeRuns = await getHomeRuns(game.gamePk, { signal });
        return homeRuns.map((hr) => ({
          ...hr,
          gameDate: game.date,
          gameScheduleDate: game.scheduleDate,
          venue: game.venue,
          gameStatus: game.status,
          finalScore: { home: game.home.score, away: game.away.score },
        }));
      } catch (error) {
        console.warn(`[mlb] failed to load home runs for game ${game.gamePk}`, error);
        return [];
      }
    })
  );

  return perGame.flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Same as getRecentHomeRuns, but resilient to a failed fetch (offline, MLB
 * API down): persists every successful result to localStorage, and falls
 * back to the last persisted result — marked `isStale` — if the live fetch
 * fails and there's nothing cached from before. `hasLiveGames` reflects the
 * live fetch specifically (there's no way to know if a game is still live
 * from stale data), so callers can use it to decide whether to keep polling.
 *
 * Calls getRecentGames with the same params as the internal call inside
 * getRecentHomeRuns — those share mlbApi's request cache, so this doesn't
 * cost an extra network round trip.
 */
export async function getRecentHomeRunsResilient({ daysBack = 2, endDate, signal } = {}) {
  try {
    const [homeRuns, games] = await Promise.all([
      getRecentHomeRuns({ daysBack, endDate, signal }),
      getRecentGames({ daysBack, endDate, signal }),
    ]);
    saveHomeRunsToCache(homeRuns);
    return {
      homeRuns,
      isStale: false,
      fetchedAt: new Date().toISOString(),
      hasLiveGames: games.some((game) => game.status === 'Live'),
    };
  } catch (error) {
    const cached = loadHomeRunsFromCache();
    if (!cached) throw error;
    return { homeRuns: cached.homeRuns, isStale: true, fetchedAt: cached.fetchedAt, hasLiveGames: false };
  }
}

// MLB often publishes a play's highlight clip some time after it happens —
// this is how long after the play we keep treating "not found" as possibly
// just "not published yet" rather than a settled answer.
const VIDEO_RECHECK_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Best-effort lookup of a video highlight for a specific home run. Not every
 * HR has one yet (data lag, blackouts) — resolves to null rather than
 * throwing when nothing matches, so callers can render a graceful fallback.
 * Matches by the play's unique `playId` against the game content feed's
 * highlight `guid`, which is the same play-level identifier.
 *
 * The underlying content fetch is otherwise cached indefinitely for the
 * session (see mlbApi.js), which would silently freeze a "not found yet"
 * answer forever. To avoid that: recent/still-Live plays always bypass the
 * cache (the clip may land any minute), and callers can force a bypass for
 * anything else via `forceRefresh` (e.g. a "check again" retry).
 */
export async function getHomeRunVideo(hr, { signal, forceRefresh } = {}) {
  if (!hr?.gamePk || !hr?.playId) return null;

  const isRecentOrLive =
    hr.gameStatus === 'Live' ||
    (hr.timestamp && Date.now() - new Date(hr.timestamp).getTime() < VIDEO_RECHECK_WINDOW_MS);

  let content;
  try {
    content = await fetchGameContent(hr.gamePk, { signal, forceRefresh: forceRefresh ?? isRecentOrLive });
  } catch (error) {
    console.warn(`[mlb] failed to load content for game ${hr.gamePk}`, error);
    return null;
  }

  const items = content?.highlights?.highlights?.items ?? [];
  const match = items.find((item) => item.guid === hr.playId);
  if (!match) return null;

  const playbacks = match.playbacks ?? [];
  const playback =
    playbacks.find((p) => p.name === 'mp4Avc') ??
    playbacks.find((p) => p.name === 'hlsCloud') ??
    playbacks[0] ??
    null;
  if (!playback?.url) return null;

  return {
    title: match.title ?? match.headline ?? null,
    description: match.description ?? match.blurb ?? null,
    duration: match.duration ?? null,
    url: playback.url,
    thumbnail: match.image?.cuts?.[0]?.src ?? null,
  };
}

/** 'today' keeps only HRs from games on today's MLB schedule day; 'week' (or anything else) is a no-op. */
export function filterHomeRunsByRange(homeRuns, range) {
  if (range !== 'today') return homeRuns;
  const todayIso = toISODate(new Date());
  return homeRuns.filter((hr) => hr.gameScheduleDate === todayIso);
}

/** Keeps only HRs from the given team id. A falsy teamId is a no-op (shows everything). */
export function filterHomeRunsByTeam(homeRuns, teamId) {
  if (teamId == null) return homeRuns;
  return homeRuns.filter((hr) => hr.team?.id === teamId);
}

/** Distinct teams present in a list of HRs, alphabetical — for populating a team filter. */
export function getTeamsInHomeRuns(homeRuns) {
  const byId = new Map();
  for (const hr of homeRuns) {
    if (hr.team?.id != null && !byId.has(hr.team.id)) {
      byId.set(hr.team.id, hr.team);
    }
  }
  return [...byId.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}
