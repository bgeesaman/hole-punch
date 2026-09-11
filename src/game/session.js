import { milestonesReached, holeStep, timeBonus, stars, defaultThresholds, thresholdsFrom, stepToFit } from './scoring.js';
import { HOLE, SCORING } from '../config.js';

// One level run. Tracks time, score, milestones, bomb penalties (timed shrinks), fruit remaining,
// and the end result.
// Drive it with tick(dt) and the physics events; read state for the HUD.
// accessible: cumulative points collectable per hole step (from the generator). When fruit is
// lost off the edge those points are gone, so the thresholds are lowered to stay reachable.
export function createSession({ target, seconds, fruitCount, thresholds, accessible }) {
  const acc = accessible ? [...accessible] : null;
  const s = {
    target,
    thresholds: thresholds || defaultThresholds(target),
    seconds,
    timeLeft: seconds,
    score: 0,
    milestones: 0,
    bombs: 0,          // bombs eaten (stats)
    shrinks: [],       // active bomb penalties: { until, steps, seconds } on the session clock
    clock: 0,
    fruitLeft: fruitCount,
    ended: false,
    reason: null,     // 'cleared' | 'timeup'
    cleared: false,
    bonus: 0,
    lost: 0,           // fruit lost off the edge
    perfect: false,    // cleared with nothing lost and no bomb swallowed
    perfectBonus: 0,
    total: 0,
    won: false,
    stars: 0,
    // Events for the caller to react to (sound, effects). Cleared by consume().
    events: [],
  };

  function end(reason) {
    if (s.ended) return;
    s.ended = true;
    s.reason = reason;
    s.cleared = reason === 'cleared';
    s.bonus = timeBonus(s.timeLeft, s.cleared);
    s.perfect = s.cleared && s.lost === 0 && s.bombs === 0;
    s.perfectBonus = s.perfect ? Math.round(s.score * SCORING.perfectBonus) : 0;
    s.total = s.score + s.bonus + s.perfectBonus;
    s.won = s.total >= s.target;
    s.stars = stars({ total: s.total, target: s.target, cleared: s.cleared, secondsLeft: s.timeLeft, seconds: s.seconds, bombs: s.bombs });
    s.events.push({ type: 'end', reason });
  }

  function checkMilestones() {
    const m = milestonesReached(s.score, s.thresholds);
    while (s.milestones < m) {
      s.milestones++;
      s.events.push({ type: 'milestone', milestones: s.milestones });
    }
  }

  function activeShrinks() {
    return s.shrinks.reduce((n, p) => n + (p.until > s.clock ? p.steps : 0), 0);
  }
  // Fraction (0..1) of the longest-running bomb penalty still to go; 0 when none is active.
  function bombRemaining() {
    let best = 0;
    for (const p of s.shrinks) best = Math.max(best, (p.until - s.clock) / p.seconds);
    return Math.min(1, best);
  }

  function tick(dt) {
    if (s.ended) return;
    const before = activeShrinks();
    s.clock += dt;
    s.timeLeft = Math.max(0, s.timeLeft - dt);
    // Expire bomb penalties; the hole regrows.
    s.shrinks = s.shrinks.filter((p) => p.until > s.clock);
    if (activeShrinks() < before) s.events.push({ type: 'regrow' });
    if (s.timeLeft === 0) end('timeup');
  }

  // A fruit or bomb went into the hole. A lit stick swallowed in time is defused: the shrink
  // still applies, the blast does not.
  function swallow(rec, { defused = false } = {}) {
    if (s.ended) return;
    if (rec.kind === 'bomb') {
      const penalty = rec.penalty || { steps: 1, seconds: HOLE.bombShrinkSeconds };
      s.bombs++;
      s.shrinks.push({ until: s.clock + penalty.seconds, steps: penalty.steps, seconds: penalty.seconds });
      s.events.push({ type: 'bomb', steps: penalty.steps, blast: defused ? null : penalty.blast || null, defused });
      return;
    }
    s.score += rec.points;
    s.fruitLeft--;
    s.events.push({ type: 'swallow', points: rec.points, tier: rec.tier });
    checkMilestones();
    if (s.fruitLeft <= 0) end('cleared');
  }

  // A fruit or bomb fell off the table. No points, but it no longer blocks a clear.
  function lose(rec) {
    if (s.ended || rec.kind === 'bomb') return;
    s.fruitLeft--;
    s.lost++;
    s.events.push({ type: 'lost' });
    if (acc && rec.points) {
      for (let k = stepToFit(rec.clearance || 0); k < HOLE.steps; k++) acc[k] -= rec.points;
      s.thresholds = thresholdsFrom(s.target, acc);
      checkMilestones();
    }
    if (s.fruitLeft <= 0) end('cleared');
  }

  function consume() {
    const e = s.events;
    s.events = [];
    return e;
  }

  // Thresholds of 0 mean the hole grows before anything is eaten (nothing fits at that size).
  checkMilestones();

  return {
    state: s,
    tick, swallow, lose, consume,
    get holeStep() { return holeStep(s.milestones, activeShrinks()); },
    bombRemaining,
  };
}
