import { escapeHtml } from './format.js';

/**
 * Compact ranked HR leaderboard. Mounts into `root`; `render(state)` takes
 * the same {status, data, error, emptyMessage} shape the feed uses. Rows
 * are intentionally much shorter than feed cards — rank, name, team, count,
 * optional streak — so more players fit on screen at once.
 */
export function createLeaderboard(root, { onSelectPlayer, onRetry } = {}) {
  root.innerHTML = `
    <div class="feed__scroll">
      <div id="leaders-body"></div>
    </div>
  `;
  const bodyEl = root.querySelector('#leaders-body');

  // Tracks whatever was last rendered so a row tap can look up its full record.
  let currentLeaders = [];

  bodyEl.addEventListener('click', (event) => {
    const retryBtn = event.target.closest('.leaders-retry');
    if (retryBtn) {
      onRetry?.();
      return;
    }
    const row = event.target.closest('.leader-row');
    if (row) selectRow(row);
  });

  bodyEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('.leader-row');
    if (!row) return;
    event.preventDefault();
    selectRow(row);
  });

  function selectRow(row) {
    const id = Number(row.dataset.playerId);
    const entry = currentLeaders.find((leader) => leader.batter?.id === id);
    if (entry) onSelectPlayer?.(entry);
  }

  function render(state) {
    if (state.status === 'idle' || state.status === 'loading') {
      bodyEl.innerHTML = `<p class="feed__status">Loading leaders…</p>`;
      return;
    }

    if (state.status === 'error') {
      const message = state.error?.message ?? 'Something went wrong loading the leaderboard.';
      bodyEl.innerHTML = `
        <div class="feed__status feed__status--error">
          <p>⚠️ ${escapeHtml(message)}</p>
          <button class="feed__retry leaders-retry" type="button">Try again</button>
        </div>
      `;
      return;
    }

    const leaders = state.data ?? [];
    currentLeaders = leaders;

    if (leaders.length === 0) {
      const message = state.emptyMessage ?? 'No home runs in this window yet.';
      bodyEl.innerHTML = `<p class="feed__status">${escapeHtml(message)}</p>`;
      return;
    }

    bodyEl.innerHTML = `<ol class="leaders__list">${leaders.map(renderLeaderRow).join('')}</ol>`;
  }

  return { render };
}

function renderLeaderRow(leader) {
  const teamLabel = leader.team?.abbreviation ?? leader.team?.name ?? '';
  const hasStreak = (leader.streakGames ?? 0) >= 2;

  return `
    <li
      class="leader-row"
      data-player-id="${escapeHtml(leader.batter?.id ?? '')}"
      tabindex="0"
      role="button"
      aria-label="${escapeHtml(leader.batter?.name ?? 'Unknown player')}, ${leader.hrCount} home runs"
    >
      <span class="leader-row__rank">${escapeHtml(leader.rank ?? '')}</span>
      <span class="leader-row__name">${escapeHtml(leader.batter?.name ?? 'Unknown player')}</span>
      ${teamLabel ? `<span class="leader-row__team">${escapeHtml(teamLabel)}</span>` : ''}
      <span class="leader-row__hr">${escapeHtml(leader.hrCount)} HR</span>
      ${hasStreak ? `<span class="leader-row__streak">🔥 ${escapeHtml(leader.streakGames)} games</span>` : ''}
    </li>
  `;
}
