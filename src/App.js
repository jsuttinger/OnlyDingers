import {
  createAsyncResource,
  getRecentHomeRunsResilient,
  getHomeRunLeaders,
  filterHomeRunsByRange,
  filterHomeRunsByTeam,
  getMostRecentHomeRunByPlayer,
  getTeamsInHomeRuns,
} from './data/index.js';
import { createFeed } from './ui/feed.js';
import { createFilters } from './ui/filters.js';
import { createDetailModal } from './ui/detail.js';
import { createLeaderboard } from './ui/leaders.js';

// Fetched once; Today/This Week/By Team are all filtered client-side from
// this same "this week" superset, so switching filters never refetches.
const BASE_DAYS_BACK = 7;

// While a game in the current data is Live, poll for new home runs at this
// interval. Nothing polls when everything's Final/Preview — no point.
const LIVE_POLL_INTERVAL_MS = 60_000;

const LEADER_ROW_LIMIT = 10;

/**
 * Root "component". Wires the data layer (src/data/) to the feed/filter/
 * detail/leaders UI (src/ui/) — this file is the only place that knows
 * about both.
 */
export function createApp(root) {
  root.innerHTML = `
    <div class="app">
      <header class="app__header">
        <div class="app__heading">
          <svg class="app__badge" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <path d="M58,54 L74,66 L92,84" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" />
            <ellipse cx="95" cy="87" rx="7" ry="4" transform="rotate(28 95 87)" fill="currentColor" />
            <path d="M46,55 L37,70 L33,88" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" />
            <ellipse cx="28" cy="90" rx="7" ry="4" transform="rotate(-18 28 90)" fill="currentColor" />
            <path d="M60,52 L91,89" fill="none" stroke="var(--accent)" stroke-width="3.4" stroke-linecap="round" />
            <circle cx="60" cy="52" r="3" fill="var(--accent)" />
            <path d="M59,26 L63,40 L60,52" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M44,21 L60,23 L59,54 L46,55 Z" fill="currentColor" />
            <path d="M45,24 L29,32 L17,39" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="53" cy="18" r="8" fill="currentColor" />
            <path d="M45.5,17 A8,8 0 0 1 53,10 L53,15 C50,15 47.5,15.8 45.5,17 Z" fill="currentColor" />
          </svg>
          <div>
            <h1 class="app__title">Only Dingers</h1>
            <p class="app__subtitle">MLB home runs, right on your home screen.</p>
          </div>
        </div>
        <button class="refresh-btn" id="refresh-btn" type="button" aria-label="Refresh">
          <span class="refresh-btn__icon" aria-hidden="true">↻</span>
        </button>
      </header>
      <div id="filters-root"></div>
      <section class="feed" id="feed" aria-live="polite"></section>
      <section class="feed" id="leaders" aria-live="polite" hidden></section>
      <div id="detail-root"></div>
    </div>
  `;

  const filtersRoot = root.querySelector('#filters-root');
  const feedRoot = root.querySelector('#feed');
  const leadersRoot = root.querySelector('#leaders');
  const detailRoot = root.querySelector('#detail-root');
  const refreshBtn = root.querySelector('#refresh-btn');

  const resource = createAsyncResource(getRecentHomeRunsResilient);
  const leadersResource = createAsyncResource(getHomeRunLeaders);
  const detail = createDetailModal(detailRoot);
  const feed = createFeed(feedRoot, { onRefresh: () => refresh(), onSelect: (hr) => detail.open(hr) });
  const leaderboard = createLeaderboard(leadersRoot, {
    onSelectPlayer: (leader) => openLeaderDetail(leader),
    onRetry: () => refreshLeaders(),
  });
  const filters = createFilters(filtersRoot, { onChange: renderView });

  let pollTimer = null;
  let lastLoadedLeaderWindow = null;

  resource.subscribe((state) => {
    if (state.status === 'success') {
      filters.setTeams(getTeamsInHomeRuns(state.data.homeRuns));
      schedulePoll(state.data.hasLiveGames);
    }
    renderView();
  });
  leadersResource.subscribe(renderView);

  refresh();
  refreshBtn.addEventListener('click', () => refresh());

  /** `silent` skips the button-spin feedback — used for the background live-game poll. Refreshes whichever view is currently active. */
  function refresh({ silent = false } = {}) {
    if (!silent) refreshBtn.classList.add('is-spinning');
    const task = filters.getState().range === 'leaders' ? loadLeaders() : resource.load({ daysBack: BASE_DAYS_BACK });
    task.catch(() => {}).finally(() => {
      if (!silent) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 400);
    });
  }

  function refreshLeaders() {
    refreshBtn.classList.add('is-spinning');
    loadLeaders()
      .catch(() => {})
      .finally(() => setTimeout(() => refreshBtn.classList.remove('is-spinning'), 400));
  }

  function loadLeaders() {
    const window = filters.getState().leaderWindow;
    lastLoadedLeaderWindow = window;
    return leadersResource.load({ window, limit: LEADER_ROW_LIMIT });
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

  /** Finds the HR to show for a tapped leaderboard row, reusing the existing detail view — no separate player screen. */
  function openLeaderDetail(leader) {
    if (leader.latestHomeRun) {
      detail.open(leader.latestHomeRun);
      return;
    }
    // Season leaders don't carry individual play data (see leaders.js) —
    // fall back to whatever's in the already-loaded feed window.
    const resourceState = resource.getState();
    const fallback =
      resourceState.status === 'success'
        ? getMostRecentHomeRunByPlayer(resourceState.data.homeRuns, leader.batter?.id)
        : null;
    if (fallback) detail.open(fallback);
  }

  function renderView() {
    const filterState = filters.getState();
    const showLeaders = filterState.range === 'leaders';
    feedRoot.hidden = showLeaders;
    leadersRoot.hidden = !showLeaders;

    if (showLeaders) {
      if (filterState.leaderWindow !== lastLoadedLeaderWindow) loadLeaders().catch(() => {});
      leaderboard.render({ ...leadersResource.getState(), emptyMessage: emptyLeadersMessageFor(filterState.leaderWindow) });
    } else {
      renderFeed(filterState);
    }
  }

  function renderFeed(filterState) {
    const resourceState = resource.getState();
    if (resourceState.status !== 'success') {
      feed.render(resourceState);
      return;
    }

    const { homeRuns: allHomeRuns, isStale, fetchedAt } = resourceState.data;
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

  function emptyLeadersMessageFor(window) {
    if (window === 'today') return 'No home runs yet today. Check back soon.';
    if (window === 'season') return 'No leaderboard data available right now.';
    return 'No home runs in this window yet.';
  }
}
