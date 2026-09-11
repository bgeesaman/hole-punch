import { HOLE } from '../config.js';

// DOM HUD. Only rendering here; game state drives it via set().
export function createHud() {
  const el = {
    level: document.getElementById('hud-level'),
    time: document.getElementById('hud-time'),
    score: document.getElementById('hud-score'),
    target: document.getElementById('hud-target'),
    hole: document.getElementById('hud-hole'),
    left: document.getElementById('hud-left'),
  };

  const pips = [];
  for (let i = 0; i < HOLE.steps; i++) {
    // Bonus sizes (past the target) get a gold pip.
    const p = document.createElement('i');
    if (i >= HOLE.milestoneSteps) p.classList.add('bonus');
    el.hole.appendChild(p);
    pips.push(p);
  }

  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  function set({ level, time, score, target, holeStep, left }) {
    if (level !== undefined) el.level.textContent = level;
    if (time !== undefined) {
      el.time.textContent = fmtTime(time);
      el.time.classList.toggle('warn', time < 10);
    }
    if (score !== undefined) el.score.textContent = score;
    if (target !== undefined) el.target.textContent = target;
    if (left !== undefined) el.left.textContent = left;
    if (holeStep !== undefined) pips.forEach((p, i) => p.classList.toggle('on', i <= holeStep));
  }

  return { set };
}
