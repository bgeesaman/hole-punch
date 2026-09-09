import { LEVELS } from '../game/level-curve.js';

// Menu: title, 10x10 level grid, reset progress. Locked levels are disabled; completed levels
// show stars and best score.
export function createMenu({ save, onSelect }) {
  const el = document.createElement('div');
  el.id = 'menu';
  el.className = 'overlay panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="card menu-card">
      <h1 class="title">Hole Punch</h1>
      <p class="subtitle">Move the hole. Eat the fruit. Beat the clock.</p>
      <div id="menu-grid" class="level-grid"></div>
      <div class="menu-footer">
        <span id="menu-progress"></span>
        <span class="reset-wrap"><span id="menu-reset-label" class="reset-label" hidden>Reset all progress?</span>
        <button id="menu-reset" class="icon-btn trash" title="Reset progress" aria-label="Reset progress">🗑</button></span>
      </div>
    </div>`;
  document.body.appendChild(el);
  const grid = el.querySelector('#menu-grid');
  const resetBtn = el.querySelector('#menu-reset');
  const resetLabel = el.querySelector('#menu-reset-label');

  // Two-click confirm, no browser dialog: first click arms the icon for 3 s.
  let confirming = false, timer = null;
  function disarm() { confirming = false; resetLabel.hidden = true; resetBtn.classList.remove('danger'); }
  resetBtn.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      resetLabel.hidden = false;
      resetBtn.classList.add('danger');
      clearTimeout(timer);
      timer = setTimeout(disarm, 3000);
      return;
    }
    clearTimeout(timer);
    save.reset();
    disarm();
    render();
  });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-level]');
    if (!btn || btn.disabled) return;
    onSelect(Number(btn.dataset.level));
  });

  function render() {
    const frag = document.createDocumentFragment();
    let done = 0;
    for (let n = 1; n <= LEVELS; n++) {
      const b = document.createElement('button');
      b.dataset.level = n;
      const r = save.result(n);
      const unlocked = save.isUnlocked(n);
      b.disabled = !unlocked;
      b.className = 'level' + (r && r.stars > 0 ? ' done' : '') + (unlocked && !r ? ' fresh' : '');
      if (r && r.stars > 0) done++;
      b.innerHTML = `<span class="n">${n}</span>` +
        (r ? `<span class="s">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</span><span class="b">${r.best}</span>` : '<span class="s"></span><span class="b"></span>');
      b.title = unlocked ? (r ? `Best ${r.best}` : 'Play') : 'Locked';
      frag.appendChild(b);
    }
    grid.replaceChildren(frag);
    el.querySelector('#menu-progress').textContent = `${done} / ${LEVELS} levels cleared`;
  }

  function show() { render(); el.hidden = false; }
  function hide() { el.hidden = true; }
  return { show, hide, el };
}
