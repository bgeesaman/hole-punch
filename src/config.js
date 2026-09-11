// Shared constants. Keep tuning knobs here so milestones can adjust without hunting.
export const HOLE = {
  startRadius: 0.7,
  stepRadius: 0.35,
  minRadius: 0.7,
  maxRadius: 2.45,
  steps: 6,          // number of pips in the HUD; five growth milestones
  baseSpeed: 9,      // units per second at level start
  speedPerMilestone: 1.35, // added to max speed at each growth milestone
  smoothing: 12,     // exponential approach rate (higher = snappier)
  radiusLerpTime: 0.3,
  bombShrinkSeconds: 8, // a bomb shrinks the hole one step for this long, then it regrows
  pitDepth: 14,      // visual pit depth; objects are removed below this
  darkDepth: 10,     // objects and walls fade to black over this many units below the table
};

// Difficulty modes. TNT fuse timings are per mode: a stick arms after the hole lingers within
// `reach` hole widths of its edge for `armSeconds`, cools over `coolSeconds` if the hole leaves
// early, burns `fuseSeconds` once lit, and a detonation lights other sticks within `chain`
// zones. Swallowing a lit stick defuses it: shrink, no blast. Hard also adds more explosives
// and blasts at full strength; normal blasts at three quarters.
export const DIFFICULTY = {
  normal: {
    hazardMul: 0.9, blastMul: 0.75, minHazards: 0,
    tnt: { armSeconds: 2, coolSeconds: 1.5, fuseSeconds: 8, reach: 1, chain: 1 },
  },
  hard: {
    hazardMul: 1.25, blastMul: 1, minHazards: 1, // every hard level has a bomb
    tnt: { armSeconds: 1.5, coolSeconds: 2, fuseSeconds: 5, reach: 1.2, chain: 1.5 },
  },
};

export const SCORING = {
  perfectBonus: 0.25, // clearing the board with nothing lost off the edge adds this share of fruit points
};

export const CAMERA = {
  fov: 45,
  pitchDeg: 50,      // angle below horizontal
  margin: 1.08,      // extra fit so edges are not flush with the viewport
  // Zoom floor: the smallest fruit (0.5 units across) never renders under this many pixels at a
  // 1080-tall viewport (scaled with viewport height). When the whole table cannot fit at that
  // zoom, the camera follows the hole instead.
  minSmallFruitPx: 12,
  smallFruitSize: 0.5,
  followSmoothing: 4, // camera focus approach rate (per second)
  followFromLevel: 10, // from this level the camera always follows, even if the table would fit
  followZoom: 0.72,    // forced-follow distance as a share of the whole-table fit distance
  zoom: 0.6,           // global: every camera distance is scaled by this (closer to the hole)
};

export const SURFACE = {
  defaultSide: 20,
  thickness: 1.5,    // table slab thickness; the pit visual is exactly this deep
  edgeMargin: 0.03,  // the hole's edge stops here, where the pit and lip overlays are clipped (hole.js)
  deskDrop: 0.07,    // the cutting mat sits this far under the slab bottom
};

export const PHYSICS = {
  // Objects are 0.25 to 1 unit. At 9.81 a half-unit drop takes a third of a second and reads
  // as a delay before falling. Boosted gravity makes tipping and falling feel immediate.
  gravity: 22,
  tableFriction: 0.8,   // felt: pushes grip, sliding crates stop short
  // Rapier has no rolling resistance. Damping stands in for it: a 0.5 ball at 5 units/s rolls
  // about 5.5 units before stopping with 0.7/0.7. Zero would roll off the table like marble.
  ball: { linearDamping: 0.7, angularDamping: 0.7 },
  crate: { linearDamping: 0.2, angularDamping: 0.3 },
  // Capsules and cylinders on their side (banana, tipped pineapple): a paper banana does not
  // roll far. See the rolling brake in physics/world.js for why damping alone is not enough.
  roller: { linearDamping: 1.2, angularDamping: 1.2 },
};

// Art: paper craft. A cream card board on a cutting mat; the hole is a clean die-cut showing
// the stacked sheets. Fruit are faceted paper, crates are cardboard.
export const ART = {
  board: 0xf3ecdc,      // board top
  boardEdge: 0xe6dcc3,  // cut card edges (slab sides, pit lip)
  boardLine: 0xc4b596,  // line where one sheet meets the next
  mat: 0x2f5b4c,        // cutting mat under the board
  matLine: 0x477a66,    // mat grid lines
  haze: 0x5f7d6f,       // fog and background beyond the mat
  sheet: 0.15,          // sheet thickness: one edge line every this many units
};
