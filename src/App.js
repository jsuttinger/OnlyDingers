import { createAsyncResource, getRecentHomeRuns } from './data/index.js';
import { createFeed } from './ui/feed.js';

/**
 * Root "component". Wires the data layer (src/data/) to the feed UI
 * (src/ui/) — this file is the only place that knows about both.
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
      <section class="feed" id="feed" aria-live="polite"></section>
    </div>
  `;

  const feedRoot = root.querySelector('#feed');
  const refreshBtn = root.querySelector('#refresh-btn');

  const resource = createAsyncResource(getRecentHomeRuns);
  const feed = createFeed(feedRoot, { onRefresh: refresh });

  resource.subscribe((state) => feed.render(state));
  refresh();

  refreshBtn.addEventListener('click', refresh);

  function refresh() {
    refreshBtn.classList.add('is-spinning');
    // The subscriber above already reacts to success/error; swallow the
    // rejection here so it doesn't also surface as an unhandled rejection.
    resource
      .load({ daysBack: 2 })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => refreshBtn.classList.remove('is-spinning'), 400);
      });
  }
}
