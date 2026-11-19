'use strict';
// Tallow Point — menu logic (R4-2, fresh from the R4 spec).
// START A LIFE continues a save when one exists, NEW LIFE wipes it.
// The mission list shows the five story jobs by name for now; R4-3 fills
// it in with the real missions through setMissions().

// The real mission names live in story.js and arrive through
// setMissions() once the story module is created at boot. Until then the
// list shows one line so the menu never renders empty.
const MISSION_NAMES = [
  'Jobs open once the story begins…',
];

function createMenu(state, hooks) {
  const menu = document.getElementById('menu');
  const btnStart = document.getElementById('btn-start');
  const btnNew = document.getElementById('btn-new');
  let listEl = document.getElementById('menu-missions');
  if (!listEl) {
    listEl = document.createElement('div');
    listEl.id = 'menu-missions';
    listEl.className = 'districts';
    menu.appendChild(listEl);
  }
  function renderMissions(names) {
    listEl.innerHTML = names.map((n) => '<div>' + n + '</div>').join('');
  }
  renderMissions(MISSION_NAMES);
  btnStart.addEventListener('click', () => hooks.onStart(false));
  btnNew.addEventListener('click', () => hooks.onStart(true));
  return {
    show() { menu.classList.remove('hidden'); },
    hide() { menu.classList.add('hidden'); },
    setMissions(names) { renderMissions(names); },
    isVisible() { return !menu.classList.contains('hidden'); },
  };
}
