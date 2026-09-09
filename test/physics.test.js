import { describe, it, expect, beforeEach } from 'vitest';
import { createPhysics } from '../src/physics/world.js';

const DT = 1 / 60;
function run(p, seconds) {
  let events = { swallowed: [], removed: [], lost: [] };
  for (let i = 0; i < seconds * 60; i++) {
    const e = p.step(DT);
    events.swallowed.push(...e.swallowed);
    events.removed.push(...e.removed);
    events.lost.push(...e.lost);
  }
  return events;
}
// Tests spawn awake and slightly above the table so gravity is exercised. Level layouts spawn
// asleep at exact rest (the default).
const ball = (r, x, z, y = r + 0.05) => ({ shape: 'ball', size: { r }, position: { x, y, z }, sleeping: false });

describe('physics ground and hole', () => {
  let p;
  beforeEach(async () => {
    p = await createPhysics();
    p.setSurface(20);
    p.setHolePosition(0, 0);
    p.setHoleRadius(0.7);
  });

  it('a ball on the table rests and sleeps', () => {
    const rec = p.spawn(ball(0.25, 5, 5));
    const e = run(p, 3);
    expect(e.swallowed).toHaveLength(0);
    expect(e.lost).toHaveLength(0);
    expect(rec.body.translation().y).toBeCloseTo(0.25, 1);
    expect(rec.body.isSleeping()).toBe(true);
  });

  it('a body spawned asleep at rest stays asleep until the hole arrives, then falls', () => {
    const rec = p.spawn({ shape: 'ball', size: { r: 0.25 }, position: { x: 4, y: 0.25, z: 0 } });
    run(p, 1);
    expect(rec.body.isSleeping()).toBe(true);
    p.setHolePosition(4, 0);
    const e = run(p, 2);
    expect(e.swallowed).toHaveLength(1);
  });

  it('a small ball centered over the hole is swallowed', () => {
    p.spawn(ball(0.25, 0, 0));
    const e = run(p, 3);
    expect(e.swallowed).toHaveLength(1);
    expect(e.removed).toHaveLength(1);
    expect(p.records.size).toBe(0);
  });

  it('a large ball over a small hole rests on the rim', () => {
    const rec = p.spawn(ball(1.0, 0, 0));
    const e = run(p, 3);
    expect(e.swallowed).toHaveLength(0);
    expect(rec.body.translation().y).toBeGreaterThan(0.5);
  });

  it('a large ball falls once the hole grows past it', () => {
    p.spawn(ball(1.0, 0, 0));
    run(p, 2);
    p.setHoleRadius(1.4);
    const e = run(p, 3);
    expect(e.swallowed).toHaveLength(1);
  });

  const crate = (h, x, z, y = h + 0.05) => ({ shape: 'cuboid', size: { hx: h, hy: h, hz: h }, position: { x, y, z }, friction: 0.7, sleeping: false });

  it('a crate with its center over the gap tips in off the rim', () => {
    // A 1.0 crate cannot pass a 0.7 hole (corners at 0.707 sit on the rim). Use 1.05.
    // Box spans x 0.1..1.1. Plane lets go; the rim holds only the far strip whose hull
    // starts at x ~0.92, so the center of mass at 0.6 is unsupported and it tips in.
    p.setHoleRadius(1.05);
    p.spawn(crate(0.5, 0.6, 0));
    const e = run(p, 4);
    expect(e.swallowed).toHaveLength(1);
  });

  it('a crate with its center on the ground stays even if it overhangs', () => {
    p.setHoleRadius(1.05);
    const rec = p.spawn(crate(0.5, 1.25, 0));
    const e = run(p, 3);
    expect(e.swallowed).toHaveLength(0);
    expect(rec.body.translation().y).toBeGreaterThan(0.4);
  });

  it('a ball resting mostly on the ground next to the hole stays', () => {
    const rec = p.spawn(ball(0.25, 1.1, 0));
    const e = run(p, 3);
    expect(e.swallowed).toHaveLength(0);
    expect(rec.body.translation().y).toBeGreaterThan(0.2);
  });

  it('a ball moved under by the hole is swallowed', () => {
    p.spawn(ball(0.25, 4, 0));
    run(p, 1);
    // Sweep the hole across the ball at 4 units/s.
    let swallowed = 0;
    for (let i = 0; i < 60; i++) {
      p.setHolePosition(2 + (i / 60) * 4, 0);
      swallowed += p.step(DT).swallowed.length;
    }
    swallowed += run(p, 2).swallowed.length;
    expect(swallowed).toBe(1);
  });

  it('the moving rim does not drag resting objects (no conveyor effect)', () => {
    const b = p.spawn(ball(0.25, 3, 0));
    const c = p.spawn(crate(0.5, 0, 3));
    run(p, 1);
    // Slide the hole so its 2.5-wide rim band passes under both objects without the hole itself.
    for (let i = 0; i < 120; i++) { p.setHolePosition(0.8 * (i / 120), 0.8 * (i / 120)); p.step(DT); }
    expect(Math.abs(b.body.translation().x - 3)).toBeLessThan(0.05);
    expect(Math.abs(c.body.translation().z - 3)).toBeLessThan(0.05);
  });

  it('a crate partly in the hole is pushed along by the pit wall when the hole leaves', () => {
    p.setHoleRadius(1.05);
    const c = p.spawn(crate(0.5, 4, 0, 0.5));
    run(p, 1);
    p.setHolePosition(4, 0);
    // Let it start dropping, then yank the hole away at 12 units/s.
    let steps = 0;
    while (c.body.translation().y > 0.3 && steps++ < 120) p.step(DT);
    expect(c.body.translation().y).toBeLessThanOrEqual(0.3);
    let maxY = -Infinity, swallowed = 0;
    for (let i = 1; i <= 90; i++) {
      p.setHolePosition(4 - (12 * i) / 60, 0);
      swallowed += p.step(DT).swallowed.length;
      if (!c.swallowed) maxY = Math.max(maxY, c.body.translation().y);
    }
    swallowed += run(p, 2).swallowed.length;
    // It must not pop back out on top of the table, and it ends up in the hole.
    expect(maxY).toBeLessThan(0.45);
    expect(swallowed).toBe(1);
  });

  it('a swallowed ball falling in the shaft is carried along by the moving wall', () => {
    p.setHoleRadius(1.05);
    const b = p.spawn(ball(0.5, 4, 0));
    run(p, 1);
    p.setHolePosition(4, 0);
    let steps = 0;
    while (!b.swallowed && steps++ < 120) p.step(DT);
    expect(b.swallowed).toBe(true);
    for (let i = 1; i <= 60; i++) {
      p.setHolePosition(4 - (10 * i) / 60, 0);
      const e = p.step(DT);
      if (e.removed.includes(b)) break;
      const t = b.body.translation();
      expect(Math.hypot(t.x - p.state.holeX, t.z - p.state.holeZ)).toBeLessThan(1.05 + 0.5 + 0.3);
    }
  });

  it('a ball pushed past the table edge is lost', () => {
    const rec = p.spawn(ball(0.25, 9.9, 0));
    rec.body.setLinvel({ x: 3, y: 0, z: 0 }, true);
    const e = run(p, 3);
    expect(e.lost).toHaveLength(1);
    expect(e.swallowed).toHaveLength(0);
  });

  it('a crate stack stands until the hole is under it', () => {
    const recs = [0.5, 1.5, 2.5].map((y) => p.spawn(crate(0.5, 5, 5, y + 0.02)));
    run(p, 3);
    expect(recs[2].body.translation().y).toBeGreaterThan(2.3);
    p.setHoleRadius(1.4);
    p.setHolePosition(5, 5);
    const e = run(p, 4);
    expect(e.swallowed.length).toBe(3);
  });

  it('1000 balls settle and sleep with the hole moving', () => {
    const n = 32;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i * n + j >= 1000) break;
      p.spawn(ball(0.25, -9 + i * 0.58, -9 + j * 0.58));
    }
    run(p, 3);
    // Move the hole through empty space in a corner far from most balls.
    for (let i = 0; i < 120; i++) { p.setHolePosition(9 - i * 0.01, 9); p.step(DT); }
    const s = p.stats();
    expect(s.bodies).toBeGreaterThan(900);
    expect(s.awake).toBeLessThan(150);
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) { p.setHolePosition(8 - i * 0.05, 8); p.step(DT); }
    const ms = (performance.now() - t0) / 60;
    expect(ms).toBeLessThan(8);
  });
});

describe('rolling brake for capsules and cylinders', () => {
  const ON_SIDE = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
  const banana = (x, z, opts = {}) => ({ shape: 'capsule', size: { hh: 0.45, r: 0.2 }, position: { x, y: 0.2, z }, rotation: ON_SIDE, friction: 0.7, sleeping: false, ...opts });

  it('a nudged banana stops and sleeps instead of rolling away for good', async () => {
    const p = await createPhysics();
    p.setSurface(20); p.setHoleRadius(0.7); p.setHolePosition(8, 8);
    const rec = p.spawn(banana(0, 0));
    run(p, 0.5);
    rec.body.setLinvel({ x: 0, y: 0, z: 0.02 }, true);
    run(p, 3);
    const v = rec.body.linvel();
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(0.005);
    expect(rec.body.isSleeping()).toBe(true);
    expect(Math.abs(rec.body.translation().z)).toBeLessThan(0.2);
  });

  it('a banana knocked hard still rolls a real distance', async () => {
    const p = await createPhysics();
    p.setSurface(20); p.setHoleRadius(0.7); p.setHolePosition(8, 8);
    const rec = p.spawn(banana(0, 0));
    run(p, 0.5);
    rec.body.setLinvel({ x: 0, y: 0, z: 2.5 }, true);
    run(p, 4);
    expect(rec.body.translation().z).toBeGreaterThan(1);
    expect(rec.body.isSleeping()).toBe(true);
  });
});

describe('rolling brake does not disturb support', () => {
  it('bananas far from a roaming hole never fall through the table', async () => {
    const p = await createPhysics();
    p.setSurface(20); p.setHoleRadius(0.7); p.setHolePosition(0, 0);
    const ON_SIDE = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    const recs = [];
    for (let i = 0; i < 5; i++) recs.push(p.spawn({ shape: 'capsule', size: { hh: 0.45, r: 0.2 }, position: { x: 4 + i * 1.3, y: 0.2, z: 5 }, rotation: ON_SIDE, friction: 0.7 }));
    let events = 0;
    for (let i = 0; i < 600; i++) {
      p.setHolePosition(Math.sin(i / 60) * 3, Math.cos(i / 40) * 3);
      const e = p.step(DT);
      events += e.swallowed.length + e.lost.length;
    }
    expect(events).toBe(0);
    for (const r of recs) expect(r.body.translation().y).toBeCloseTo(0.2, 2);
  });
});
