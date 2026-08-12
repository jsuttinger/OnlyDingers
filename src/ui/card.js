import { formatDistance, formatExitVelocity, formatInning, formatRelativeTime, escapeHtml } from './format.js';

/**
 * Renders one home run as a card. Deliberately layered, not a stat dump:
 *   1. Player name (primary) + team (secondary, top-right)
 *   2. Game context — opponent, inning, when (muted, one line)
 *   3. Distance/exit velo, only when we have them
 * Tapping/pressing Enter expands the play description (feed.js wires this).
 */
export function renderHomeRunCard(hr) {
  const teamLabel = hr.team?.abbreviation ?? hr.team?.name ?? '';
  const opponentLabel = hr.opponent?.abbreviation ?? hr.opponent?.name ?? '';
  const inningLabel = formatInning(hr.inning, hr.halfInning);
  const timeLabel = formatRelativeTime(hr.timestamp);
  const metaLine = [opponentLabel ? `vs ${opponentLabel}` : null, inningLabel, timeLabel]
    .filter(Boolean)
    .join(' · ');

  const stats = [formatDistance(hr.distanceFeet), formatExitVelocity(hr.exitVelocityMph)].filter(Boolean);
  const isMultiHrGame = (hr.gameHrTotal ?? 0) > 1;

  return `
    <li class="card" data-hr-id="${escapeHtml(hr.id)}" tabindex="0" role="button" aria-expanded="false">
      <div class="card__top">
        <span class="card__player">${escapeHtml(hr.batter?.name ?? 'Unknown batter')}</span>
        ${teamLabel ? `<span class="card__team">${escapeHtml(teamLabel)}</span>` : ''}
      </div>
      ${metaLine ? `<p class="card__meta">${escapeHtml(metaLine)}</p>` : ''}
      ${isMultiHrGame ? `<span class="card__badge">HR #${hr.gameHrNumber} of ${hr.gameHrTotal} that game</span>` : ''}
      ${stats.length ? `<p class="card__stats">${escapeHtml(stats.join(' · '))}</p>` : ''}
      ${hr.description ? `<p class="card__description">${escapeHtml(hr.description)}</p>` : ''}
    </li>
  `;
}
