import { renderHomeRunCard } from './card.js';
import { escapeHtml, formatCacheTimestamp } from './format.js';

const PULL_THRESHOLD = 70;

/**
 * Mounts the scrollable home run feed into `root`. Returns `{ render(state) }`
 * where `state` is whatever createAsyncResource() produces
 * ({status, data, error}), optionally with a custom `emptyMessage`, and
 * `isStale`/`fetchedAt` when showing a cached fallback (see homeRunsCache.js
 * and getRecentHomeRunsResilient). This module knows nothing about the data
 * layer beyond that shape.
 */
export function createFeed(root, { onRefresh, onSelect } = {}) {
  root.innerHTML = `
    <div class="feed__pull" id="feed-pull"></div>
    <div class="feed__scroll" id="feed-scroll">
      <div id="feed-body"></div>
    </div>
  `;

  const scrollEl = root.querySelector('#feed-scroll');
  const bodyEl = root.querySelector('#feed-body');
  const pullEl = root.querySelector('#feed-pull');

  // Tracks whatever was last rendered, so a card tap can look up its full
  // record (feed.js only ever holds rendered HTML, not the data objects).
  let currentHomeRuns = [];

  wirePullToRefresh({ scrollEl, pullEl, onRefresh });
  wireCardSelection(bodyEl, {
    onSelect: (id) => {
      const hr = currentHomeRuns.find((item) => item.id === id);
      if (hr) onSelect?.(hr);
    },
  });

  function render(state) {
    if (state.status === 'idle' || state.status === 'loading') {
      bodyEl.innerHTML = `<p class="feed__status">Loading recent home runs…</p>`;
      return;
    }

    if (state.status === 'error') {
      const message = state.error?.message ?? 'Something went wrong loading home runs.';
      bodyEl.innerHTML = `
        <div class="feed__status feed__status--error">
          <p>⚠️ ${escapeHtml(message)}</p>
          <button class="feed__retry" type="button">Try again</button>
        </div>
      `;
      bodyEl.querySelector('.feed__retry')?.addEventListener('click', () => onRefresh?.());
      return;
    }

    const homeRuns = state.data ?? [];
    currentHomeRuns = homeRuns;

    const staleBanner = renderStaleBanner(state);

    if (homeRuns.length === 0) {
      const message = state.emptyMessage ?? 'No home runs in the last couple of days. Check back soon.';
      bodyEl.innerHTML = `${staleBanner}<p class="feed__status">${escapeHtml(message)}</p>`;
      return;
    }

    bodyEl.innerHTML = `${staleBanner}<ul class="feed__list">${homeRuns.map(renderHomeRunCard).join('')}</ul>`;
  }

  return { render };
}

function renderStaleBanner(state) {
  if (!state.isStale) return '';
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const lead = isOffline ? "You're offline — showing" : 'Showing';
  const time = formatCacheTimestamp(state.fetchedAt);
  return `<p class="feed__stale">📡 ${escapeHtml(lead)} cached data${time ? ` from ${escapeHtml(time)}` : ''}.</p>`;
}

/** Tap or Enter/Space on a card opens its detail view. */
function wireCardSelection(bodyEl, { onSelect }) {
  bodyEl.addEventListener('click', (event) => {
    const card = event.target.closest('.card');
    if (card) onSelect(card.dataset.hrId);
  });

  bodyEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.card');
    if (!card) return;
    event.preventDefault();
    onSelect(card.dataset.hrId);
  });
}

/** Minimal touch-driven pull-to-refresh: drag down from the top of the list to refresh. */
function wirePullToRefresh({ scrollEl, pullEl, onRefresh }) {
  let startY = null;
  let offset = 0;

  function setOffset(px) {
    offset = px;
    pullEl.style.height = `${px}px`;
    pullEl.style.opacity = String(Math.min(px / PULL_THRESHOLD, 1));
    pullEl.textContent = offset > PULL_THRESHOLD ? 'Release to refresh ↑' : 'Pull to refresh ↓';
  }

  scrollEl.addEventListener(
    'touchstart',
    (event) => {
      startY = scrollEl.scrollTop <= 0 ? event.touches[0].clientY : null;
      if (startY != null) pullEl.classList.add('is-pulling');
    },
    { passive: true }
  );

  scrollEl.addEventListener(
    'touchmove',
    (event) => {
      if (startY == null) return;
      const delta = event.touches[0].clientY - startY;
      setOffset(delta > 0 ? Math.min(delta * 0.5, 110) : 0);
    },
    { passive: true }
  );

  scrollEl.addEventListener('touchend', () => {
    if (startY == null) return;
    const shouldRefresh = offset > PULL_THRESHOLD;
    pullEl.classList.remove('is-pulling');
    setOffset(0);
    startY = null;
    if (shouldRefresh) onRefresh?.();
  });
}
