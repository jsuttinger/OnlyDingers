/** Small presentation helpers shared by the feed/card renderers. Pure functions, no DOM. */

export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const isThisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: isThisYear ? undefined : 'numeric',
  });
}

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd'];

function ordinal(n) {
  const v = n % 100;
  return `${n}${ORDINAL_SUFFIXES[(v - 20) % 10] ?? ORDINAL_SUFFIXES[v] ?? ORDINAL_SUFFIXES[0]}`;
}

export function formatInning(inning, halfInning) {
  if (!inning) return '';
  const half = halfInning === 'top' ? 'Top' : halfInning === 'bottom' ? 'Bot' : '';
  return `${half} ${ordinal(inning)}`.trim();
}

export function formatDistance(feet) {
  return feet != null ? `${Math.round(feet)} ft` : null;
}

export function formatExitVelocity(mph) {
  return mph != null ? `${Math.round(mph * 10) / 10} mph` : null;
}

/** Clock-time label for "showing cached data from [time]" — same-day shows just the time, older shows date + time. */
export function formatCacheTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "BOS 3 – NYY 5" style line, from an HR's finalScore + which side was home/away. */
export function formatScoreLine(hr) {
  if (hr.finalScore?.home == null || hr.finalScore?.away == null) return null;
  const isTop = hr.halfInning === 'top'; // visiting team bats in the top half
  const homeTeam = isTop ? hr.opponent : hr.team;
  const awayTeam = isTop ? hr.team : hr.opponent;
  const homeLabel = homeTeam?.abbreviation ?? homeTeam?.name ?? 'Home';
  const awayLabel = awayTeam?.abbreviation ?? awayTeam?.name ?? 'Away';
  return `${awayLabel} ${hr.finalScore.away} – ${homeLabel} ${hr.finalScore.home}`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
