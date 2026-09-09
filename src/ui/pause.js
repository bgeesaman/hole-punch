// Pause overlay, shown while a level is in progress and the mouse is not captured. Also holds
// the sound settings: music and effects, each off / low / normal.
const seg = (channel) => `<div class="seg" data-channel="${channel}">
  <button data-level="off">Off</button><button data-level="low">Low</button><button data-level="normal">Normal</button></div>`;

export function createPause({ onResume, onMenu, onRestart, onAudio }) {
  const el = document.createElement('div');
  el.id = 'pause';
  el.className = 'overlay panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="card">
      <h1>Paused</h1>
      <p class="subtitle">The clock stops while the mouse is free.</p>
      <div class="settings">
        <div class="audio-row"><span class="label">MUSIC</span>${seg('music')}</div>
        <div class="audio-row"><span class="label">SFX</span>${seg('sfx')}</div>
      </div>
      <div class="buttons">
        <button id="pause-resume">Resume</button>
        <button id="pause-restart" class="secondary">Restart</button>
        <button id="pause-menu" class="secondary">Levels</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#pause-resume').addEventListener('click', () => onResume());
  el.querySelector('#pause-restart').addEventListener('click', () => onRestart());
  el.querySelector('#pause-menu').addEventListener('click', () => onMenu());
  el.querySelector('.settings').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-level]');
    if (b) onAudio(b.closest('.seg').dataset.channel, b.dataset.level);
  });
  function setAudio(levels) {
    for (const s of el.querySelectorAll('.seg')) {
      for (const b of s.querySelectorAll('button')) b.classList.toggle('on', b.dataset.level === levels[s.dataset.channel]);
    }
  }
  return { show() { el.hidden = false; }, hide() { el.hidden = true; }, setAudio, el };
}
