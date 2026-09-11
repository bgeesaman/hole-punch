import { describe, it, expect } from 'vitest';
import { createFuses } from '../src/game/fuse.js';

describe('creeper fuses', () => {
  const step = (f, seconds, near, id = 1) => {
    const out = [];
    for (let i = 0; i < Math.round(seconds * 60); i++) out.push(...f.update(1 / 60, [{ id, near }]));
    return out;
  };

  it('lights after a second in the zone, then burns seven seconds wherever the hole goes', () => {
    const f = createFuses({ armSeconds: 1, fuseSeconds: 7 });
    expect(step(f, 0.9, true)).toEqual([]);
    expect(f.isLit(1)).toBe(false);
    expect(f.charge(1)).toBeCloseTo(0.9);
    expect(step(f, 0.2, true).map((e) => e.type)).toEqual(['lit']);
    expect(f.isLit(1)).toBe(true);
    expect(step(f, 6.9, false)).toEqual([]);   // far away, still burning
    expect(f.fuseLeft(1)).toBeGreaterThan(0);
    expect(step(f, 0.2, false).map((e) => e.type)).toEqual(['detonate']);
    expect(f.isLit(1)).toBe(false);
  });

  it('leaving the zone before it lights cools the charge over two seconds', () => {
    const f = createFuses({ armSeconds: 1, fuseSeconds: 7, coolSeconds: 2 });
    step(f, 0.8, true);
    step(f, 1.0, false);
    expect(f.charge(1)).toBeCloseTo(0.3, 1);   // 0.8 minus half of a full cool
    expect(step(f, 0.6, true)).toEqual([]);     // back to 0.9, not yet
    expect(step(f, 0.2, true).map((e) => e.type)).toEqual(['lit']);
    const g = createFuses({ armSeconds: 1, fuseSeconds: 7, coolSeconds: 2 });
    step(g, 0.9, true);
    step(g, 2.0, false);
    expect(g.charge(1)).toBe(0);
    expect(g.chargingIds).toEqual([]);
  });

  it('a stick can be lit outright by a chain, without shortening one already burning', () => {
    const f = createFuses({ armSeconds: 2, fuseSeconds: 7 });
    expect(f.light(5)).toBe(true);
    expect(f.fuseLeft(5)).toBe(7);
    f.update(1, [{ id: 5, near: false }]);
    expect(f.light(5)).toBe(false);
    expect(f.fuseLeft(5)).toBe(6);
    // A bomb set off by a detonation pops after a short delay.
    expect(f.light(9, 0.2)).toBe(true);
    const out = [];
    for (let i = 0; i < 15; i++) out.push(...f.update(1 / 60, [{ id: 5, near: false }, { id: 9, near: false }]));
    expect(out.map((e) => e.id)).toEqual([9]);
  });

  it('a stick that leaves the board is forgotten', () => {
    const f = createFuses({ armSeconds: 1, fuseSeconds: 7 });
    step(f, 1.1, true);
    expect(f.isLit(1)).toBe(true);
    f.update(1 / 60, []);
    expect(f.isLit(1)).toBe(false);
  });
});
