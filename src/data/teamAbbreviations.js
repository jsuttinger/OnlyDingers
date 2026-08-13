/**
 * Static MLB team id -> abbreviation map. Team ids are stable, well-known
 * values from the Stats API. Only needed as a fallback for endpoints that
 * don't include an abbreviation on their team object (e.g. /v1/stats/leaders)
 * — anywhere we already have a team from a game feed, it carries its own
 * abbreviation and this table isn't consulted.
 */
const TEAM_ABBREVIATIONS = {
  108: 'LAA',
  109: 'AZ',
  110: 'BAL',
  111: 'BOS',
  112: 'CHC',
  113: 'CIN',
  114: 'CLE',
  115: 'COL',
  116: 'DET',
  117: 'HOU',
  118: 'KC',
  119: 'LAD',
  120: 'WSH',
  121: 'NYM',
  133: 'ATH',
  134: 'PIT',
  135: 'SD',
  136: 'SEA',
  137: 'SF',
  138: 'STL',
  139: 'TB',
  140: 'TEX',
  141: 'TOR',
  142: 'MIN',
  143: 'PHI',
  144: 'ATL',
  145: 'CWS',
  146: 'MIA',
  147: 'NYY',
  158: 'MIL',
};

export function getTeamAbbreviation(teamId, fallbackName) {
  return TEAM_ABBREVIATIONS[teamId] ?? fallbackName ?? '';
}
