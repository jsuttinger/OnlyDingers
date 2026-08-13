/**
 * Home run leaderboard logic. Two data sources, chosen per time window:
 *  - Today / 7 Days / 15 Days: aggregated client-side from HR events we
 *    already fetch (getRecentHomeRuns) — no new endpoint needed.
 *  - Season: MLB's own /v1/stats/leaders endpoint. Aggregating a full
 *    season from individual game feeds would mean fetching essentially
 *    every game played (hundreds of heavy requests) just to count home
 *    runs — the official leaders endpoint gives the same answer in one
 *    lightweight call.
 * Streaks are computed the same way regardless of source: per-player game
 * logs, since only those show real participation (a missing entry means a
 * day off, not a broken streak — see getPlayerStreak).
 */
import { getRecentHomeRuns, filterHomeRunsByRange } from './homeRuns.js';
import { fetchStatsLeaders, fetchPlayerGameLog } from './mlbApi.js';
import { getTeamAbbreviation } from './teamAbbreviations.js';

export const LEADER_WINDOWS = ['today', '7days', '15days', 'season'];

function currentSeason() {
  return new Date().getFullYear();
}

/** Competition ranking (ties share a rank: 1, 1, 3 — not 1, 2, 3), then trims to `limit`. */
function rankEntries(entries, limit) {
  const sorted = [...entries].sort((a, b) => b.hrCount - a.hrCount);
  let rank = 0;
  let lastCount = null;
  const ranked = sorted.map((entry, index) => {
    if (entry.hrCount !== lastCount) {
      rank = index + 1;
      lastCount = entry.hrCount;
    }
    return { ...entry, rank };
  });
  return ranked.slice(0, limit);
}

/** Aggregates already-fetched HR events into per-batter leader rows, keeping each batter's most recent HR (for "tap to view"). */
function aggregateHomeRunLeaders(homeRuns, { limit = 10 } = {}) {
  const byBatter = new Map();

  for (const hr of homeRuns) {
    if (!hr.batter?.id) continue;
    const entry = byBatter.get(hr.batter.id) ?? {
      batter: hr.batter,
      team: hr.team,
      hrCount: 0,
      latestHomeRun: null,
    };
    entry.hrCount += 1;
    if (!entry.latestHomeRun || new Date(hr.timestamp) > new Date(entry.latestHomeRun.timestamp)) {
      entry.latestHomeRun = hr;
      entry.team = hr.team; // stays in sync with whichever team they most recently played for
    }
    byBatter.set(hr.batter.id, entry);
  }

  return rankEntries([...byBatter.values()], limit);
}

function normalizeSeasonLeader(raw) {
  return {
    rank: raw.rank ?? null,
    batter: raw.person ? { id: raw.person.id, name: raw.person.fullName } : null,
    team: raw.team ? { id: raw.team.id, name: raw.team.name, abbreviation: getTeamAbbreviation(raw.team.id, raw.team.name) } : null,
    hrCount: Number(raw.value) || 0,
    // No individual play data from this endpoint — App.js falls back to
    // searching whatever HR events are already loaded elsewhere.
    latestHomeRun: null,
  };
}

/**
 * How many of a player's most recent consecutive *games played* had at
 * least one home run. Built from their game log rather than calendar
 * dates: the log only has an entry for games they actually appeared in
 * (a day off or a doubleheader's second game are just absent/adjacent
 * entries, not gaps to reason about), so walking backward from the most
 * recent entry and stopping at the first zero-HR game is exactly a
 * "consecutive games" streak, unaffected by off days or doubleheaders.
 */
export async function getPlayerStreak(personId, { season = currentSeason(), signal } = {}) {
  if (!personId) return 0;
  let data;
  try {
    data = await fetchPlayerGameLog(personId, { season, signal });
  } catch {
    return 0;
  }

  const splits = data?.stats?.[0]?.splits ?? [];
  let streak = 0;
  for (let i = splits.length - 1; i >= 0; i--) {
    if ((splits[i]?.stat?.homeRuns ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

/** Attaches `streakGames` to each leader row, in parallel. Bounded by the (already-small) leader list, not the whole league. */
async function attachStreaks(leaders, { season, signal } = {}) {
  const streaks = await Promise.all(
    leaders.map((leader) => getPlayerStreak(leader.batter?.id, { season, signal }))
  );
  return leaders.map((leader, index) => ({ ...leader, streakGames: streaks[index] }));
}

const WINDOW_TO_DAYS_BACK = { today: 1, '7days': 7, '15days': 15 };

/**
 * Get the HR leaderboard for a time window ('today' | '7days' | '15days' | 'season').
 * Rows are ranked, deduped by player, and annotated with their current
 * hitting streak.
 */
export async function getHomeRunLeaders({ window, limit = 10, season = currentSeason(), signal } = {}) {
  let leaders;

  if (window === 'season') {
    const data = await fetchStatsLeaders({ season, limit, signal });
    const raw = data?.leagueLeaders?.[0]?.leaders ?? [];
    leaders = raw.map(normalizeSeasonLeader).slice(0, limit);
  } else {
    const daysBack = WINDOW_TO_DAYS_BACK[window] ?? WINDOW_TO_DAYS_BACK.today;
    const homeRuns = await getRecentHomeRuns({ daysBack, signal });
    const scoped = filterHomeRunsByRange(homeRuns, window === 'today' ? 'today' : 'week');
    leaders = aggregateHomeRunLeaders(scoped, { limit });
  }

  return attachStreaks(leaders, { season, signal });
}
