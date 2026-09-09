import { CATALOG, FRUIT_BY_TIER, CRATE_BY_TIER, footprintFor, pointsFor, clearanceRadius } from './catalog.js';
import { accessiblePoints, thresholdsFrom } from './scoring.js';

// Seeded layout generator. params (from level-curve) -> placed objects.
// Output: { objects: [{ type, position: {x,y,z} }], side, seconds, target, counts }
// Deterministic for a given params.seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOLE_CLEARANCE = 3.0;  // keep the start position free
const EDGE_MARGIN = 1.5;      // arrangements stay this far from the edge
const GAP = 0.6;              // space between arrangements

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}
function pickTier(rng, mix) { return pickWeighted(rng, mix); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// --- Arrangement builders. Each returns { objects (local XZ around 0), halfW, halfD, count }.
function buildGrid(rng, tier, maxCount) {
  const type = pick(rng, FRUIT_BY_TIER[tier]);
  const r = footprintFor(type);
  const spacing = r * 2 * 1.18;
  const rows = randInt(rng, 2, 6);
  let cols = randInt(rng, 2, 8);
  while (rows * cols > maxCount && cols > 1) cols--;
  const n = Math.min(maxCount, rows * cols);
  const objects = [];
  const ox = ((cols - 1) * spacing) / 2, oz = ((rows - 1) * spacing) / 2;
  let k = 0;
  for (let i = 0; i < rows && k < n; i++) {
    for (let j = 0; j < cols && k < n; j++, k++) {
      objects.push({ type, position: { x: j * spacing - ox, y: CATALOG[type].restY, z: i * spacing - oz }, cell: true });
    }
  }
  return { objects, halfW: ox + r, halfD: oz + r, count: n };
}

function buildPyramid(rng, tier, maxCount) {
  const crate = CRATE_BY_TIER[tier];
  const s = CATALOG[crate].size.hx * 2;
  let base = randInt(rng, 2, 4);
  const crates = (b) => (b * (b + 1) * (2 * b + 1)) / 6; // sum of squares
  while (base > 1 && crates(base) + 1 > maxCount) base--;
  if (crates(base) + 1 > maxCount) return null;
  const objects = [];
  for (let layer = 0; layer < base; layer++) {
    const n = base - layer;
    const off = ((n - 1) * s) / 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      objects.push({ type: crate, position: { x: i * s - off, y: s / 2 + layer * s, z: j * s - off } });
    }
  }
  const topFruit = pick(rng, FRUIT_BY_TIER[tier].filter((t) => CATALOG[t].shape === 'ball'));
  objects.push({ type: topFruit, position: { x: 0, y: base * s + CATALOG[topFruit].restY, z: 0 }, top: true, support: crate });
  const half = (base * s) / 2;
  return { objects, halfW: half, halfD: half, count: objects.length };
}

function buildTower(rng, tier, maxCount) {
  const crate = CRATE_BY_TIER[tier];
  const s = CATALOG[crate].size.hx * 2;
  let h = randInt(rng, 3, 7);
  while (h > 1 && h + 1 > maxCount) h--;
  if (h + 1 > maxCount) return null;
  const objects = [];
  for (let k = 0; k < h; k++) objects.push({ type: crate, position: { x: 0, y: s / 2 + k * s, z: 0 } });
  const topFruit = pick(rng, FRUIT_BY_TIER[tier].filter((t) => CATALOG[t].shape === 'ball'));
  objects.push({ type: topFruit, position: { x: 0, y: h * s + CATALOG[topFruit].restY, z: 0 }, top: true, support: crate });
  return { objects, halfW: s / 2, halfD: s / 2, count: objects.length };
}

const BUILDERS = { grid: buildGrid, pyramid: buildPyramid, tower: buildTower };
const TIER_ORDER = ['S', 'M', 'L'];
function capTier(tier, max) {
  return TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(max) ? max : tier;
}

// --- Placement: rejection sampling of AABBs inside the table with margins.
function overlaps(a, b) {
  return Math.abs(a.x - b.x) < a.halfW + b.halfW + GAP && Math.abs(a.z - b.z) < a.halfD + b.halfD + GAP;
}
function place(rng, half, boxes, halfW, halfD) {
  const lim = half - EDGE_MARGIN;
  if (halfW > lim || halfD > lim) return null;
  for (let tries = 0; tries < 300; tries++) {
    const x = (rng() * 2 - 1) * (lim - halfW);
    const z = (rng() * 2 - 1) * (lim - halfD);
    const box = { x, z, halfW, halfD };
    // Keep the hole's start position clear.
    const cx = Math.max(0, Math.abs(x) - halfW), cz = Math.max(0, Math.abs(z) - halfD);
    if (Math.hypot(cx, cz) < HOLE_CLEARANCE) continue;
    if (boxes.some((b) => overlaps(box, b))) continue;
    return box;
  }
  return null;
}

export function generateLevel(params) {
  const rng = mulberry32(params.seed);
  const half = params.side / 2;
  const boxes = [];
  const objects = [];
  let remaining = params.count;
  let placedArrangements = 0;
  let failures = 0;

  while (remaining > 0 && failures < 60) {
    const perArrangement = Math.max(4, Math.round(remaining / Math.max(1, params.arrangements - placedArrangements)));
    const kind = pickWeighted(rng, params.weights);
    let tier = pickTier(rng, params.tierMix);
    if (kind !== 'grid') tier = capTier(tier, params.maxStackTier || 'L');
    const built = BUILDERS[kind](rng, tier, Math.min(remaining, perArrangement * 2));
    if (!built) { failures++; continue; }
    const box = place(rng, half, boxes, built.halfW, built.halfD);
    if (!box) { failures++; continue; }
    boxes.push(box);
    for (const o of built.objects) {
      objects.push({ type: o.type, position: { x: o.position.x + box.x, y: o.position.y, z: o.position.z + box.z }, cell: o.cell, top: o.top, support: o.support });
    }
    remaining -= built.count;
    placedArrangements++;
  }

  // Bombs replace grid cells of M or L tier (an S grid is too tight for a 0.5 bomb).
  const bombCount = Math.round(params.bombShare * objects.length);
  if (bombCount > 0) {
    const candidates = objects.filter((o) => o.cell && CATALOG[o.type].tier !== 'S');
    for (let i = 0; i < bombCount && candidates.length > 0; i++) {
      const idx = Math.floor(rng() * candidates.length);
      const o = candidates.splice(idx, 1)[0];
      o.type = 'bomb';
      o.position.y = CATALOG.bomb.restY;
    }
  }
  const fruit = objects.filter((o) => CATALOG[o.type].kind !== 'bomb');
  const available = fruit.reduce((s, o) => s + pointsFor(o.type), 0);
  const target = Math.max(1, Math.round(available * params.targetFraction));
  // Fruit on top of a stack is only reachable once the crates under it can go in, so it
  // inherits the crate's clearance for the reachability math.
  const accessible = accessiblePoints(fruit.map((o) => ({
    points: pointsFor(o.type),
    clearance: Math.max(clearanceRadius(o.type), o.support ? clearanceRadius(o.support) : 0),
  })));
  for (const o of objects) { delete o.cell; delete o.top; delete o.support; }
  const thresholds = thresholdsFrom(target, accessible);
  return {
    level: params.level,
    side: params.side,
    objects,
    seconds: Math.round(objects.length * params.secondsPerObject),
    target,
    thresholds,
    accessible,
    counts: { total: objects.length, fruit: fruit.length, bombs: objects.length - fruit.length, available, arrangements: placedArrangements },
  };
}
