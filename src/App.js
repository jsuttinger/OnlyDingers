import { createAsyncResource, getRecentHomeRuns, MlbApiError } from './data/index.js';

/**
 * Root "component". This is a thin demo of the data layer (src/data/) —
 * it renders loading/error/success states off an async resource. Replace
 * the rendering here as the real UI takes shape; the data layer underneath
 * doesn't need to change.
 */
export function createApp(root) {
  root.innerHTML = `
    <main class="app">
      <header class="app__header">
        <span class="app__badge">⚾️</span>
        <h1 class="app__title">Only Dingers</h1>
        <p class="app__subtitle">MLB home runs, right on your home screen.</p>
      </header>
      <section class="feed" id="feed" aria-live="polite"></section>
    </main>
  `;

  const feedEl = root.querySelector('#feed');
  const resource = createAsyncResource(getRecentHomeRuns);

  resource.subscribe((state) => renderFeed(feedEl, state));
  // The subscriber above already reacts to the error state; swallow the
  // rejection here so it doesn't also surface as an unhandled promise
  // rejection (load() re-throws so callers awaiting it directly still can).
  resource.load({ daysBack: 2 }).catch(() => {});
}

function renderFeed(feedEl, state) {
  if (state.status === 'loading' || state.status === 'idle') {
    feedEl.innerHTML = `<p class="feed__status">Loading recent home runs…</p>`;
    return;
  }

  if (state.status === 'error') {
    const message =
      state.error instanceof MlbApiError
        ? state.error.message
        : 'Something went wrong loading home runs.';
    feedEl.innerHTML = `<p class="feed__status feed__status--error">⚠️ ${escapeHtml(message)}</p>`;
    return;
  }

  const homeRuns = state.data ?? [];
  if (homeRuns.length === 0) {
    feedEl.innerHTML = `<p class="feed__status">No home runs in the last couple of days.</p>`;
    return;
  }

  feedEl.innerHTML = `
    <ul class="feed__list">
      ${homeRuns.map(renderHomeRun).join('')}
    </ul>
  `;
}

function renderHomeRun(hr) {
  const stats = [
    hr.distanceFeet != null ? `${hr.distanceFeet} ft` : null,
    hr.exitVelocityMph != null ? `${hr.exitVelocityMph} mph` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <li class="feed__item">
      <div class="feed__item-main">
        <span class="feed__player">${escapeHtml(hr.batter?.name ?? 'Unknown batter')}</span>
        <span class="feed__team">${escapeHtml(hr.team?.name ?? '')}</span>
      </div>
      <div class="feed__item-meta">
        <span>Inning ${escapeHtml(String(hr.inning ?? '?'))} (${escapeHtml(hr.halfInning ?? '')})</span>
        ${stats ? `<span>${escapeHtml(stats)}</span>` : ''}
      </div>
    </li>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
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
