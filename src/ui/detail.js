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

    lastFocused = document.activeElement;
    bodyEl.innerHTML = renderDetail(hr);
    modalEl.hidden = false;
    document.body.classList.add('modal-open');
    closeBtn.focus();

    loadVideo(hr, token);
  }

  function close() {
    modalEl.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  async function loadVideo(hr, token) {
    const slot = bodyEl.querySelector('.detail__video');
    if (!slot) return;
    try {
      const video = await getHomeRunVideo(hr);
      if (token !== requestToken) return; // a newer card was opened meanwhile
      slot.innerHTML = video
        ? renderVideo(video)
        : `<p class="detail__video-empty">No highlight video found for this play yet.</p>`;
    } catch {
      if (token !== requestToken) return;
      slot.innerHTML = `<p class="detail__video-empty">Couldn't load video.</p>`;
    }
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

function renderVideo(video) {
  const caption = [video.title, video.duration].filter(Boolean).join(' · ') || 'Watch highlight';
  return `
    <a class="detail__video-link" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">
      ${
        video.thumbnail
          ? `<img class="detail__video-thumb" src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy" />`
          : '<div class="detail__video-thumb detail__video-thumb--placeholder"></div>'
      }
      <span class="detail__video-play" aria-hidden="true">▶</span>
      <span class="detail__video-caption">${escapeHtml(caption)}</span>
    </a>
  `;
}
