import {
  createAsyncResource,
  getRecentHomeRunsResilient,
  filterHomeRunsByRange,
  filterHomeRunsByTeam,
  getTeamsInHomeRuns,
} from './data/index.js';
import { createFeed } from './ui/feed.js';
import { createFilters } from './ui/filters.js';
import { createDetailModal } from './ui/detail.js';

// Fetched once; Today/This Week/By Team are all filtered client-side from
// this same "this week" superset, so switching filters never refetches.
const BASE_DAYS_BACK = 7;

// While a game in the current data is Live, poll for new home runs at this
// interval. Nothing polls when everything's Final/Preview — no point.
const LIVE_POLL_INTERVAL_MS = 60_000;

/**
 * Root "component". Wires the data layer (src/data/) to the feed/filter/
 * detail UI (src/ui/) — this file is the only place that knows about both.
 */
export function createApp(root) {
  root.innerHTML = `
    <div class="app">
      <header class="app__header">
        <div class="app__heading">
          <span class="app__badge">⚾️</span>
          <div>
            <h1 class="app__title">Only Dingers</h1>
            <p class="app__subtitle">MLB home runs, right on your home screen.</p>
          </div>
        </div>
        <button class="refresh-btn" id="refresh-btn" type="button" aria-label="Refresh home runs">
          <span class="refresh-btn__icon" aria-hidden="true">↻</span>
        </button>
      </header>
      <div id="filters-root"></div>
      <section class="feed" id="feed" aria-live="polite"></section>
      <div id="detail-root"></div>
    </div>
  `;

  const filtersRoot = root.querySelector('#filters-root');
  const feedRoot = root.querySelector('#feed');
  const detailRoot = root.querySelector('#detail-root');
  const refreshBtn = root.querySelector('#refresh-btn');

  const resource = createAsyncResource(getRecentHomeRunsResilient);
  const detail = createDetailModal(detailRoot);
  const feed = createFeed(feedRoot, { onRefresh: () => refresh(), onSelect: (hr) => detail.open(hr) });
  const filters = createFilters(filtersRoot, { onChange: renderFeed });

  let pollTimer = null;

  resource.subscribe((state) => {
    if (state.status === 'success') {
      filters.setTeams(getTeamsInHomeRuns(state.data.homeRuns));
      schedulePoll(state.data.hasLiveGames);
    }
    renderFeed();
  });

  refresh();
  refreshBtn.addEventListener('click', () => refresh());

  /** `silent` skips the button-spin feedback — used for the background live-game poll. */
  function refresh({ silent = false } = {}) {
    if (!silent) refreshBtn.classList.add('is-spinning');
    // The subscriber above already reacts to success/error; swallow the
    // rejection here so it doesn't also surface as an unhandled rejection.
    resource
      .load({ daysBack: BASE_DAYS_BACK })
      .catch(() => {})
      .finally(() => {
        if (!silent) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 400);
      });
  }

  /** Re-arms (or cancels) the live-game poll based on the most recent fetch. */
  function schedulePoll(hasLiveGames) {
    clearTimeout(pollTimer);
    pollTimer = null;
    if (!hasLiveGames) return;

    pollTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') {
        refresh({ silent: true });
      } else {
        // Backgrounded — skip this fetch, just check again next interval.
        // (Coming back to the tab doesn't need its own listener this way.)
        schedulePoll(true);
      }
    }, LIVE_POLL_INTERVAL_MS);
  }

  function renderFeed() {
    const resourceState = resource.getState();
    if (resourceState.status !== 'success') {
      feed.render(resourceState);
      return;
    }

    const { homeRuns: allHomeRuns, isStale, fetchedAt } = resourceState.data;
    const filterState = filters.getState();
    let homeRuns = filterHomeRunsByRange(allHomeRuns, filterState.range === 'team' ? 'week' : filterState.range);
    if (filterState.range === 'team') {
      homeRuns = filterHomeRunsByTeam(homeRuns, filterState.teamId);
    }

    feed.render({
      ...resourceState,
      data: homeRuns,
      emptyMessage: emptyMessageFor(filterState),
      isStale,
      fetchedAt,
    });
  }

  function emptyMessageFor(filterState) {
    if (filterState.range === 'today') return 'No home runs yet today. Check back soon.';
    if (filterState.range === 'team') return 'No home runs from this team in the last week.';
    return 'No home runs in the last week. Check back soon.';
  }
}
