import { escapeHtml } from './format.js';

/**
 * Segmented Today / This Week / By Team control. Filtering itself is pure
 * data-layer logic (filterHomeRunsByRange/Team in src/data/homeRuns.js) —
 * this module only owns the UI state and tells the caller when it changes.
 */
export function createFilters(root, { onChange } = {}) {
  root.innerHTML = `
    <div class="filters">
      <div class="filters__tabs" role="tablist">
        <button class="filters__tab is-active" data-range="today" type="button" role="tab" aria-selected="true">Today</button>
        <button class="filters__tab" data-range="week" type="button" role="tab" aria-selected="false">This Week</button>
        <button class="filters__tab" data-range="team" type="button" role="tab" aria-selected="false">By Team</button>
      </div>
      <select class="filters__team" id="filters-team" aria-label="Team" hidden></select>
    </div>
  `;

  const tabs = [...root.querySelectorAll('.filters__tab')];
  const teamSelect = root.querySelector('#filters-team');

  let state = { range: 'today', teamId: null };
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

      state = {
        range,
        teamId: range === 'team' ? (state.teamId ?? firstTeamId()) : null,
      };
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
