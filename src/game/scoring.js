import { HOLE } from '../config.js';

// Pure scoring rules. No DOM, no physics.

// Fractions of the target score at which the hole grows one step. The first five take the
// hole to its sixth size by 95% of the target; the last two are bonus sizes for scoring past
// the target and are never lowered by the reachability cap.
export const MILESTONES = [0.15, 0.35, 0.55, 0.75, 0.95, 1.2, 1.45];
export const BONUS_FROM = 5; // index of the first bonus milestone

// ceil after shaving float noise: 100 * 0.55 is 55.000000000000007, which must stay 55.
const ceilShare = (target, f) => Math.ceil(target * f - 1e-9);

export function defaultThresholds(target) {
  return MILESTONES.map((f) => ceilShare(target, f));
}

// Smallest hole step whose radius passes an object with the given clearance radius.
export function stepToFit(clearance) {
  for (let k = 0; k < HOLE.steps; k++) if (holeRadius(k) > clearance * 1.02) return k;
  return HOLE.steps - 1;
}

export const THRESHOLD_SHARE = 0.7;

// Cumulative points collectable with the hole at each step. objects: [{ points, clearance }].
export function accessiblePoints(objects) {
  const acc = new Array(HOLE.steps).fill(0);
  for (const o of objects) {
    const k = stepToFit(o.clearance);
    for (let s = k; s < HOLE.steps; s++) acc[s] += o.points;
  }
  return acc;
}

// Growth thresholds capped at a share of the points collectable at the current hole size.
// Non-decreasing; equal thresholds mean an instant double step, 0 means grow at start.
export function thresholdsFrom(target, accessible, share = THRESHOLD_SHARE) {
  const out = [];
  let prev = 0;
  for (let m = 0; m < MILESTONES.length; m++) {
    const base = ceilShare(target, MILESTONES[m]);
    const cap = m >= BONUS_FROM ? Infinity : Math.floor(accessible[m] * share); // reachable at step m, before growing
    let t = Math.min(base, cap);
    if (t < prev) t = prev;
    out.push(Math.max(0, t));
    prev = out[m];
  }
  return out;
}

// Growth thresholds that a level can actually reach, so a level whose points sit in large
// objects still grows the hole before the player runs out of small ones.
export function reachableThresholds(target, objects, share = THRESHOLD_SHARE) {
  return thresholdsFrom(target, accessiblePoints(objects), share);
}

// Number of growth milestones reached for a score.
export function milestonesReached(score, thresholds) {
  let n = 0;
  while (n < thresholds.length && score >= thresholds[n]) n++;
  return n;
}

// Progress (0..1) from the last reached milestone toward the next one. 1 when all are reached.
export function milestoneProgress(score, thresholds) {
  const n = milestonesReached(score, thresholds);
  if (n >= thresholds.length) return 1;
  const prev = n === 0 ? 0 : thresholds[n - 1];
  const next = thresholds[n];
  if (next <= prev) return 1;
  return Math.max(0, Math.min(1, (score - prev) / (next - prev)));
}

// Hole step after growth milestones and bombs eaten. Never below the start size.
export function holeStep(milestones, bombs) {
  return Math.max(0, Math.min(HOLE.steps - 1, milestones - bombs));
}

export function holeRadius(step) {
  return HOLE.radii[Math.max(0, Math.min(HOLE.radii.length - 1, step))];
}

export function holeSpeed(milestones) {
  return HOLE.baseSpeed + milestones * HOLE.speedPerMilestone;
}

// Time bonus is paid only when the board was cleared: 10 points per second remaining.
export function timeBonus(secondsLeft, cleared) {
  return cleared ? Math.round(Math.max(0, secondsLeft) * 10) : 0;
}

// 0 = loss, 1 = win, 2 = win with the board cleared, 3 = cleared with >= 25% time left and no
// bomb swallowed. Eating a bomb caps a run at two stars.
export function stars({ total, target, cleared, secondsLeft, seconds, bombs = 0 }) {
  if (total < target) return 0;
  if (!cleared) return 1;
  return bombs === 0 && secondsLeft >= seconds * 0.25 ? 3 : 2;
}

// Available points and the derived target for a list of spawn descriptors.
export function availablePoints(objects) {
  return objects.reduce((sum, o) => sum + (o.kind === 'bomb' ? 0 : o.points || 0), 0);
}
export function targetFor(objects, fraction) {
  return Math.max(1, Math.round(availablePoints(objects) * fraction));
}
