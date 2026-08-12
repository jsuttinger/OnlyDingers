import {
  createAsyncResource,
  getRecentHomeRuns,
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

  const resource = createAsyncResource(getRecentHomeRuns);
  const detail = createDetailModal(detailRoot);
  const feed = createFeed(feedRoot, { onRefresh: refresh, onSelect: (hr) => detail.open(hr) });
  const filters = createFilters(filtersRoot, { onChange: renderFeed });

  resource.subscribe((state) => {
    if (state.status === 'success') filters.setTeams(getTeamsInHomeRuns(state.data));
    renderFeed();
  });

  refresh();
  refreshBtn.addEventListener('click', refresh);

  function refresh() {
    refreshBtn.classList.add('is-spinning');
    // The subscriber above already reacts to success/error; swallow the
    // rejection here so it doesn't also surface as an unhandled rejection.
    resource
      .load({ daysBack: BASE_DAYS_BACK })
      .catch(() => {})
      .finally(() => setTimeout(() => refreshBtn.classList.remove('is-spinning'), 400));
  }

  function renderFeed() {
    const resourceState = resource.getState();
    if (resourceState.status !== 'success') {
      feed.render(resourceState);
      return;
    }

    const filterState = filters.getState();
    let homeRuns = filterHomeRunsByRange(resourceState.data, filterState.range === 'team' ? 'week' : filterState.range);
    if (filterState.range === 'team') {
      homeRuns = filterHomeRunsByTeam(homeRuns, filterState.teamId);
    }

    feed.render({ ...resourceState, data: homeRuns, emptyMessage: emptyMessageFor(filterState) });
  }

  function emptyMessageFor(filterState) {
    if (filterState.range === 'today') return 'No home runs yet today. Check back soon.';
    if (filterState.range === 'team') return 'No home runs from this team in the last week.';
    return 'No home runs in the last week. Check back soon.';
  }
}
