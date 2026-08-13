import { escapeHtml } from './format.js';

const LEADER_WINDOW_LABELS = {
  today: 'Today',
  '7days': '7 Days',
  '15days': '15 Days',
  season: 'Season',
};

/**
 * Segmented Today / This Week / By Team / Leaders control. Filtering itself
 * is pure data-layer logic (filterHomeRunsByRange/Team, getHomeRunLeaders)
 * — this module only owns the UI state and tells the caller when it
 * changes. Selecting "By Team" reveals a team dropdown; selecting
 * "Leaders" reveals its own secondary time-window pill row, styled the
 * same way as the primary tabs.
 */
export function createFilters(root, { onChange } = {}) {
  root.innerHTML = `
    <div class="filters">
      <div class="filters__tabs" role="tablist">
        <button class="filters__tab is-active" data-range="today" type="button" role="tab" aria-selected="true">Today</button>
        <button class="filters__tab" data-range="week" type="button" role="tab" aria-selected="false">This Week</button>
        <button class="filters__tab" data-range="team" type="button" role="tab" aria-selected="false">By Team</button>
        <button class="filters__tab" data-range="leaders" type="button" role="tab" aria-selected="false">Leaders</button>
      </div>
      <select class="filters__team" id="filters-team" aria-label="Team" hidden></select>
      <div class="filters__tabs filters__tabs--sub" id="filters-leader-window" role="tablist" hidden>
        ${Object.entries(LEADER_WINDOW_LABELS)
          .map(
            ([key, label], i) => `
            <button class="filters__tab" data-leader-window="${key}" type="button" role="tab" aria-selected="${i === 0}">${label}</button>`
          )
          .join('')}
      </div>
    </div>
  `;

  const tabs = [...root.querySelectorAll('.filters__tab[data-range]')];
  const teamSelect = root.querySelector('#filters-team');
  const leaderWindowRoot = root.querySelector('#filters-leader-window');
  const leaderWindowTabs = [...leaderWindowRoot.querySelectorAll('.filters__tab[data-leader-window]')];

  let state = { range: 'today', teamId: null, leaderWindow: 'today' };
  let availableTeams = [];

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const range = tab.dataset.range;
      if (range === state.range) return;

      tabs.forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      teamSelect.hidden = range !== 'team';
      leaderWindowRoot.hidden = range !== 'leaders';

      state = {
        ...state,
        range,
        teamId: range === 'team' ? (state.teamId ?? firstTeamId()) : null,
      };
      onChange?.(state);
    });
  });

  leaderWindowTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const leaderWindow = tab.dataset.leaderWindow;
      if (leaderWindow === state.leaderWindow) return;

      leaderWindowTabs.forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });

      state = { ...state, leaderWindow };
      onChange?.(state);
    });
  });

  teamSelect.addEventListener('change', () => {
    state = { ...state, teamId: teamSelect.value ? Number(teamSelect.value) : null };
    onChange?.(state);
  });

  function firstTeamId() {
    return availableTeams[0]?.id ?? null;
  }

  /** Repopulates the team dropdown (call whenever fresh data loads). Preserves the current selection if still valid. */
  function setTeams(teams) {
    availableTeams = teams;
    const previous = teamSelect.value;

    teamSelect.innerHTML = teams
      .map((team) => `<option value="${team.id}">${escapeHtml(team.name ?? team.abbreviation ?? '')}</option>`)
      .join('');

    const stillValid = teams.some((team) => String(team.id) === previous);
    teamSelect.value = stillValid ? previous : String(firstTeamId() ?? '');

    if (state.range === 'team') {
      const teamId = teamSelect.value ? Number(teamSelect.value) : null;
      if (teamId !== state.teamId) {
        state = { ...state, teamId };
        onChange?.(state);
      }
    }
  }

  function getState() {
    return state;
  }

  return { setTeams, getState };
}
