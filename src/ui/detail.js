import { getHomeRunVideo } from '../data/index.js';
import {
  formatDistance,
  formatExitVelocity,
  formatInning,
  formatRelativeTime,
  formatScoreLine,
  escapeHtml,
} from './format.js';

/**
 * A bottom-sheet detail view for one home run: video highlight (if the
 * Stats API has one), full play description, and game context. Mounts once
 * into `root`; `open(hr)` swaps its content and shows it.
 */
export function createDetailModal(root) {
  root.innerHTML = `
    <div class="modal" id="modal" hidden>
      <button class="modal__backdrop" type="button" data-close aria-label="Close"></button>
      <div class="modal__sheet" role="dialog" aria-modal="true" aria-labelledby="modal-player">
        <button class="modal__close" type="button" data-close aria-label="Close">✕</button>
        <div class="modal__body" id="modal-body"></div>
      </div>
    </div>
  `;

  const modalEl = root.querySelector('#modal');
  const bodyEl = root.querySelector('#modal-body');
  const closeBtn = root.querySelector('.modal__close');

  // Guards against a slow video lookup from a previous HR clobbering the
  // currently-open one, if the user taps through cards quickly.
  let requestToken = 0;
  let lastFocused = null;

  modalEl.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modalEl.hidden) close();
  });

  function open(hr) {
    requestToken += 1;
    const token = requestToken;

    pauseActiveVideo(); // in case a previous HR's video was still playing
    lastFocused = document.activeElement;
    bodyEl.innerHTML = renderDetail(hr);
    modalEl.hidden = false;
    document.body.classList.add('modal-open');
    closeBtn.focus();

    loadVideo(hr, token);
  }

  function close() {
    pauseActiveVideo();
    modalEl.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  function pauseActiveVideo() {
    bodyEl.querySelector('.detail__video-player')?.pause();
  }

  async function loadVideo(hr, token, { forceRefresh = false } = {}) {
    const slot = bodyEl.querySelector('.detail__video');
    const captionEl = bodyEl.querySelector('.detail__video-caption');
    if (!slot) return;

    if (forceRefresh) slot.innerHTML = `<p class="detail__video-loading">Checking for video…</p>`;

    try {
      const video = await getHomeRunVideo(hr, { forceRefresh });
      if (token !== requestToken) return; // a newer card was opened meanwhile
      if (video) {
        slot.innerHTML = renderVideoPlayer(video);
        const caption = [video.title, video.duration].filter(Boolean).join(' · ');
        if (captionEl) captionEl.textContent = caption;
      } else {
        renderNoVideo(slot, hr, token);
      }
    } catch {
      if (token !== requestToken) return;
      slot.innerHTML = `<p class="detail__video-empty">Couldn't load video.</p>`;
    }
  }

  /** "Not found" isn't necessarily permanent — MLB may publish the clip later. Let the user recheck. */
  function renderNoVideo(slot, hr, token) {
    slot.innerHTML = `
      <div class="detail__video-empty">
        <p>No highlight video found for this play yet.</p>
        <button class="detail__video-retry" type="button">Check again</button>
      </div>
    `;
    slot
      .querySelector('.detail__video-retry')
      ?.addEventListener('click', () => loadVideo(hr, token, { forceRefresh: true }));
  }

  return { open, close };
}

function renderDetail(hr) {
  const teamLabel = hr.team?.name ?? hr.team?.abbreviation ?? '';
  const opponentLabel = hr.opponent?.name ?? hr.opponent?.abbreviation ?? '';
  const inningLabel = formatInning(hr.inning, hr.halfInning);
  const timeLabel = formatRelativeTime(hr.timestamp);
  const scoreLine = formatScoreLine(hr);
  const isMultiHrGame = (hr.gameHrTotal ?? 0) > 1;

  const stats = [
    ['Distance', formatDistance(hr.distanceFeet)],
    ['Exit velo', formatExitVelocity(hr.exitVelocityMph)],
    ['Launch angle', hr.launchAngleDegrees != null ? `${Math.round(hr.launchAngleDegrees)}°` : null],
  ].filter(([, value]) => value);

  const contextLine = [inningLabel, timeLabel, hr.venue].filter(Boolean).join(' · ');

  return `
    <div class="detail__video"><p class="detail__video-loading">Loading video…</p></div>
    <p class="detail__video-caption"></p>
    <h2 class="detail__player" id="modal-player">${escapeHtml(hr.batter?.name ?? 'Unknown batter')}</h2>
    <p class="detail__subline">${escapeHtml(teamLabel)}${opponentLabel ? ` vs ${escapeHtml(opponentLabel)}` : ''}</p>
    ${contextLine ? `<p class="detail__context">${escapeHtml(contextLine)}</p>` : ''}
    ${
      scoreLine
        ? `<p class="detail__score">${escapeHtml(scoreLine)}${hr.gameStatus ? ` <span class="detail__game-status">${escapeHtml(hr.gameStatus)}</span>` : ''}</p>`
        : ''
    }
    ${isMultiHrGame ? `<p class="detail__badge">HR #${hr.gameHrNumber} of ${hr.gameHrTotal} that game</p>` : ''}
    ${
      stats.length
        ? `<div class="detail__stats">${stats
            .map(
              ([label, value]) => `
              <div class="detail__stat">
                <span class="detail__stat-value">${escapeHtml(value)}</span>
                <span class="detail__stat-label">${escapeHtml(label)}</span>
              </div>`
            )
            .join('')}</div>`
        : ''
    }
    ${hr.description ? `<p class="detail__description">${escapeHtml(hr.description)}</p>` : ''}
  `;
}

function renderVideoPlayer(video) {
  // `playsinline` is what keeps iOS Safari from taking the video fullscreen
  // on play — that's the whole point here. preload="metadata" shows the
  // poster/duration without downloading the clip until the user hits play.
  return `
    <video
      class="detail__video-player"
      controls
      playsinline
      preload="metadata"
      ${video.thumbnail ? `poster="${escapeHtml(video.thumbnail)}"` : ''}
      src="${escapeHtml(video.url)}"
    >
      <a href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">Watch highlight</a>
    </video>
  `;
}
