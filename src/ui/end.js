import { SCORING } from '../config.js';
// End-of-level overlay. Shows the breakdown and offers retry, and next after a win.
export function createEndScreen({ onRetry, onNext, onMenu }) {
  const el = document.createElement('div');
  el.id = 'end';
  el.className = 'overlay panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="card">
      <h1 id="end-title"></h1>
      <p id="end-note" class="subtitle"></p>
      <div id="end-stars" class="stars"></div>
      <table class="breakdown">
        <tr><td>Fruit</td><td id="end-points"></td></tr>
        <tr><td>Time bonus</td><td id="end-bonus"></td></tr>
        <tr id="end-perfect-row"><td>Perfect bonus</td><td id="end-perfect"></td></tr>
        <tr class="total"><td>Total</td><td id="end-total"></td></tr>
        <tr><td>Target</td><td id="end-target"></td></tr>
      </table>
      <div class="buttons">
        <button id="end-menu" class="secondary">Levels</button>
        <button id="end-retry" class="secondary">Retry</button>
        <button id="end-next">Next level</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#end-retry').addEventListener('click', () => onRetry());
  el.querySelector('#end-next').addEventListener('click', () => onNext());
  el.querySelector('#end-menu').addEventListener('click', () => onMenu());

  function show(s, hasNext, note = '') {
    el.querySelector('#end-note').textContent = note;
    el.querySelector('#end-title').textContent = s.won ? (s.perfect ? 'Perfect!' : s.cleared ? 'Cleared!' : 'Level complete') : 'Time up';
    el.querySelector('#end-stars').textContent = '★'.repeat(s.stars) + '☆'.repeat(3 - s.stars);
    el.querySelector('#end-points').textContent = s.score;
    el.querySelector('#end-bonus').textContent = s.cleared ? `+${s.bonus}  (${s.timeLeft.toFixed(1)}s × 10)` : '0';
    el.querySelector('#end-perfect-row').hidden = !s.perfect;
    el.querySelector('#end-perfect').textContent = `+${s.perfectBonus}  (nothing lost, no bombs, +${Math.round(SCORING.perfectBonus * 100)}%)`;
    el.querySelector('#end-total').textContent = s.total;
    el.querySelector('#end-target').textContent = s.target;
    el.classList.toggle('won', s.won);
    el.querySelector('#end-next').hidden = !(s.won && hasNext);
    el.hidden = false;
  }
  function hide() { el.hidden = true; }
  return { show, hide, el };
}
