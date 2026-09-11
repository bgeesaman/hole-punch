// Object catalog: physics shape, size, tier, points. Pure data, no three.js, so the
// generator and its tests can use it. Visuals live in render/fruit.js keyed by the same names.
//
// Tier radii: S 0.25, M 0.5, L 1.0, X 1.3. Points: S 1, M 5, L 20, X 50. Crates are the
// stacking unit. X needs the sixth (last) hole size.
export const TIER = {
  S: { r: 0.25, points: 1 },
  M: { r: 0.5, points: 5 },
  L: { r: 1.0, points: 20 },
  X: { r: 1.3, points: 50 },
};
export const TIER_ORDER = ['S', 'M', 'L', 'X'];

// Hazards: what swallowing one costs. steps: hole sizes lost; seconds: for how long;
// blast: fruit within radius is flung outward with this impulse per unit mass.
const BOMB = { steps: 1, seconds: 8 };
const MINI = { steps: 1, seconds: 5 };
const TNT_M = { steps: 2, seconds: 10, blast: { radius: 4.5, strength: 9 } };
const TNT_L = { steps: 2, seconds: 10, blast: { radius: 6.5, strength: 12 } };

export const CATALOG = {
  blueberry:  { kind: 'fruit', tier: 'S', shape: 'ball', size: { r: 0.25 }, restY: 0.25 },
  grape:      { kind: 'fruit', tier: 'S', shape: 'ball', size: { r: 0.25 }, restY: 0.25 },
  kiwi:       { kind: 'fruit', tier: 'S', shape: 'ball', size: { r: 0.25 }, restY: 0.25 },
  strawberry: { kind: 'fruit', tier: 'S', shape: 'ball', size: { r: 0.25 }, restY: 0.25 },
  apple:      { kind: 'fruit', tier: 'M', shape: 'ball', size: { r: 0.5 }, restY: 0.5 },
  orange:     { kind: 'fruit', tier: 'M', shape: 'ball', size: { r: 0.5 }, restY: 0.5 },
  pear:       { kind: 'fruit', tier: 'M', shape: 'ball', size: { r: 0.5 }, restY: 0.5 },
  lemon:      { kind: 'fruit', tier: 'M', shape: 'ball', size: { r: 0.5 }, restY: 0.5 },
  // Banana: capsule lying on its side (axis along local Y, body rotated 90° about Z).
  banana:     { kind: 'fruit', tier: 'M', shape: 'capsule', size: { hh: 0.45, r: 0.2 }, restY: 0.2,
                rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, friction: 0.7 },
  watermelon: { kind: 'fruit', tier: 'L', shape: 'ball', size: { r: 1.0 }, restY: 1.0 },
  pineapple:  { kind: 'fruit', tier: 'L', shape: 'cylinder', size: { hh: 0.75, r: 0.6 }, restY: 0.75, friction: 0.7 },
  pumpkin:    { kind: 'fruit', tier: 'X', shape: 'ball', size: { r: 1.3 }, restY: 1.3 },
  crateS:     { kind: 'fruit', tier: 'S', shape: 'cuboid', size: { hx: 0.25, hy: 0.25, hz: 0.25 }, restY: 0.25, friction: 0.7, restitution: 0.05 },
  crateM:     { kind: 'fruit', tier: 'M', shape: 'cuboid', size: { hx: 0.5, hy: 0.5, hz: 0.5 }, restY: 0.5, friction: 0.7, restitution: 0.05 },
  crateL:     { kind: 'fruit', tier: 'L', shape: 'cuboid', size: { hx: 1.0, hy: 1.0, hz: 1.0 }, restY: 1.0, friction: 0.7, restitution: 0.05 },
  crateX:     { kind: 'fruit', tier: 'X', shape: 'cuboid', size: { hx: 1.3, hy: 1.3, hz: 1.3 }, restY: 1.3, friction: 0.7, restitution: 0.05 },
  bomb:       { kind: 'bomb', tier: 'M', shape: 'ball', size: { r: 0.5 }, restY: 0.5, penalty: BOMB },
  bombS:      { kind: 'bomb', tier: 'S', shape: 'ball', size: { r: 0.25 }, restY: 0.25, penalty: MINI },
  // TNT: upright cylinders (sticks), the size of the crate tier they stand in for.
  tntM:       { kind: 'bomb', tier: 'M', shape: 'cylinder', size: { hh: 0.5, r: 0.5 }, restY: 0.5, friction: 0.7, restitution: 0.05, penalty: TNT_M },
  tntL:       { kind: 'bomb', tier: 'L', shape: 'cylinder', size: { hh: 1.0, r: 1.0 }, restY: 1.0, friction: 0.7, restitution: 0.05, penalty: TNT_L },
};

// Which hazard can stand in for a grid cell of a given footprint: it must be no bigger.
export const HAZARD_FOR_CELL = {
  bombS: (fp) => fp >= 0.25 && fp < 0.5,
  bomb: (fp) => fp >= 0.5,
  tnt: (fp) => fp >= 0.5,
};
export function tntForCell(fp) { return fp >= 1.0 ? 'tntL' : 'tntM'; }

export const FRUIT_BY_TIER = {
  S: ['blueberry', 'grape', 'kiwi', 'strawberry'],
  M: ['apple', 'orange', 'banana', 'pear', 'lemon'],
  L: ['watermelon', 'pineapple'],
  X: ['pumpkin'],
};
export const CRATE_BY_TIER = { S: 'crateS', M: 'crateM', L: 'crateL', X: 'crateX' };

export function pointsFor(type) {
  const c = CATALOG[type];
  return c.kind === 'bomb' ? 0 : TIER[c.tier].points;
}

// Footprint half-extent in XZ when resting.
export function footprintFor(type) {
  const c = CATALOG[type];
  switch (c.shape) {
    case 'ball': return c.size.r;
    case 'cuboid': return Math.max(c.size.hx, c.size.hz);
    case 'cylinder': return c.size.r;
    case 'capsule': return c.size.hh + c.size.r; // lying down
    default: return 1;
  }
}

// Spawn descriptor for the physics world from a placed object.
export function spawnDescriptor(obj) {
  const c = CATALOG[obj.type];
  return {
    shape: c.shape,
    size: c.size,
    position: obj.position,
    rotation: obj.rotation || c.rotation,
    kind: c.kind,
    tier: c.tier,
    points: pointsFor(obj.type),
    type: obj.type,
    penalty: c.penalty,
    friction: c.friction,
    restitution: c.restitution,
    clearance: clearanceRadius(obj.type),
  };
}

// Radius of hole an object needs to pass through comfortably: balls and cylinders their
// radius (they self-centre by rolling), crates the half-diagonal of a face plus a margin (a
// crate must be centred within radius - half-diagonal or a corner catches the rim, and a
// tipped crate presents more than a face), bananas their width.
export function clearanceRadius(type) {
  const c = CATALOG[type];
  switch (c.shape) {
    case 'ball': return c.size.r;
    case 'cuboid': return Math.max(c.size.hx, c.size.hz) * Math.SQRT2 * 1.25;
    case 'cylinder': return c.size.r * 1.25; // tips over and wedges without margin
    case 'capsule': return c.size.r;
    default: return 1;
  }
}
