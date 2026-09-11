// Level number (1..100) -> generation parameters. Pure.
export const LEVELS = 100;

const lerp = (a, b, t) => a + (b - a) * t;

// The timer is a constant 1 s per object, so difficulty comes from: how much of the board must
// be eaten (target fraction), how much of it sits in large objects (which need hole growth
// first) and in stacks (slower to harvest), how many objects there are, and how far apart
// they are (table size). Early levels ramp these quickly so 10 -> 25 is a visible step.
export function levelParams(n) {
  const t = Math.min(1, Math.max(0, (n - 1) / (LEVELS - 1)));
  const count = Math.round(lerp(30, 1000, Math.pow(t, 1.5)));
  const sL = n < 4 ? 0 : 0.32 * Math.sqrt(t);           // large fruit from level 4, rising fast
  const sX = n < 40 ? 0 : 0.12 * Math.sqrt((n - 40) / 60); // XL from level 40: needs the last hole size
  const sM = lerp(0.2, 0.4, Math.sqrt(t));
  const sS = Math.max(0.1, 1 - sL - sM - sX);
  const norm = sS + sM + sL + sX;
  return {
    level: n,
    seed: n * 7919 + 17,
    count,                                   // scoreable objects (fruit + crates)
    tierMix: { S: sS / norm, M: sM / norm, L: sL / norm, X: sX / norm },
    bombShare: n >= 10 ? lerp(0.02, 0.07, t) : 0,
    // Which hazards stand in for grid cells, by weight. Minis hide in small-fruit grids from
    // level 15; TNT crates arrive at 25 and grow common.
    hazardMix: { bomb: 1, bombS: n >= 15 ? 1 : 0, tnt: n >= 25 ? lerp(0.4, 1.2, t) : 0 },
    targetFraction: lerp(0.55, 0.9, Math.sqrt(t)),
    secondsPerObject: 1.0,
    side: Math.round(lerp(20, 64, t)),   // capped at 64: beyond that small fruit are a few pixels
    arrangements: Math.round(lerp(2, 20, t)),
    // Stacks use crates up to this tier. Large crates need the full-size hole and dominate the
    // points, which made early levels unwinnable.
    maxStackTier: n < 6 ? 'S' : n < 15 ? 'M' : n < 60 ? 'L' : 'X',
    // Arrangement type weights; stacks arrive after the first few levels and grow common.
    weights: {
      grid: 1,
      pyramid: n >= 3 ? lerp(0.3, 0.9, t) : 0,
      tower: n >= 5 ? lerp(0.2, 0.6, t) : 0,
    },
  };
}
