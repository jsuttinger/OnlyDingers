/**
 * Domain layer: turns raw MLB Stats API responses into the shapes the app
 * actually wants (games, home run events). This is the module the UI
 * should import from — swap mlbApi.js for a different data source later
 * and this file (and its exports) can stay the same.
 */
import { fetchSchedule, fetchGameFeed } from './mlbApi.js';

/** @typedef {'Preview'|'Live'|'Final'} GameStatus */

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeGame(raw) {
  return {
    gamePk: raw.gamePk,
    date: raw.gameDate,
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

/** Get all games scheduled for a given date (defaults to today, local time). */
export async function getGamesForDate(date = new Date(), { signal } = {}) {
  const iso = typeof date === 'string' ? date : toISODate(date);
  const data = await fetchSchedule({ date: iso, signal });
  const games = (data.dates ?? []).flatMap((d) => d.games ?? []);
  return games.map(normalizeGame);
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
  const games = (data.dates ?? []).flatMap((d) => d.games ?? []);
  return games.map(normalizeGame).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** Pull the Statcast hit data (distance/exit velo/launch angle) off a play, if present. */
function extractHitData(play) {
  const eventWithHit = play.playEvents?.find((event) => event.hitData);
  return eventWithHit?.hitData ?? null;
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
  const hitData = extractHitData(play);

  return {
    id: String(play.about?.atBatIndex ?? `${play.result?.description ?? 'hr'}-${play.about?.startTime ?? ''}`),
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
        return homeRuns.map((hr) => ({ ...hr, gamePk: game.gamePk, gameDate: game.date }));
      } catch (error) {
        console.warn(`[mlb] failed to load home runs for game ${game.gamePk}`, error);
        return [];
      }
    })
  );

  return perGame.flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}
