import { LEVELS } from '../game/level-curve.js';

// Menu: title, 10x10 level grid, reset progress. Locked levels are disabled; completed levels
// show stars and best score; a level ever cleared with nothing lost gets a gold border.
export function createMenu({ save, onSelect, onMode }) {
  const el = document.createElement('div');
  el.id = 'menu';
  el.className = 'overlay panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="card menu-card">
      <h1 class="title">Hole Punch</h1>
      <p class="subtitle">Move the hole. Eat the fruit. Beat the clock.</p>
      <div class="mode-row"><span class="label">MODE</span>
        <div class="seg" id="menu-mode"><button data-mode="normal">Normal</button><button data-mode="hard">Hard</button></div>
        <span id="menu-mode-hint" class="mode-hint"></span></div>
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

  const modeSeg = el.querySelector('#menu-mode');
  modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    onMode(b.dataset.mode);
    render();
  });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-level]');
    if (!btn || btn.disabled) return;
    onSelect(Number(btn.dataset.level));
  });

  function render() {
    const mode = save.data.mode || 'normal';
    for (const b of modeSeg.querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === mode);
    el.querySelector('#menu-mode-hint').textContent = mode === 'hard' ? 'TNT lights faster, more explosives' : '';
    const frag = document.createDocumentFragment();
    let done = 0, hardDone = 0;
    for (let n = 1; n <= LEVELS; n++) {
      const b = document.createElement('button');
      b.dataset.level = n;
      const r = save.result(n);
      const hard = r && r.hard;
      const unlocked = save.isUnlocked(n);
      const cleared = (r && r.stars > 0) || (hard && hard.stars > 0);
      const perfect = (r && r.perfect) || (hard && hard.perfect);
      b.disabled = !unlocked;
      b.className = 'level' + (cleared ? ' done' : '') + (unlocked && !r ? ' fresh' : '') + (perfect ? ' perfect' : '')
        + (hard && hard.stars > 0 ? ' hard' : '');
      if (cleared) done++;
      if (hard && hard.stars > 0) hardDone++;
      // A hard clear shows its stars in crimson; otherwise the normal stars.
      const shown = hard && hard.stars > 0 ? hard : r;
      b.innerHTML = `<span class="n">${n}</span>` +
        (shown ? `<span class="s">${'★'.repeat(shown.stars)}${'☆'.repeat(3 - shown.stars)}</span><span class="b">${shown.best}</span>` : '<span class="s"></span><span class="b"></span>');
      const parts = [];
      if (r && r.stars > 0) parts.push(`normal ${'★'.repeat(r.stars)} ${r.best}`);
      if (hard && hard.stars > 0) parts.push(`hard ${'★'.repeat(hard.stars)} ${hard.best}`);
      if (perfect) parts.push('perfect run');
      b.title = unlocked ? (parts.length ? parts.join(' · ') : 'Play') : 'Locked';
      frag.appendChild(b);
    }
    grid.replaceChildren(frag);
    el.querySelector('#menu-progress').textContent = `${done} / ${LEVELS} levels cleared` + (hardDone ? ` · ${hardDone} on hard` : '');
  }

  function show() { render(); el.hidden = false; }
  function hide() { el.hidden = true; }
  return { show, hide, el };
}
