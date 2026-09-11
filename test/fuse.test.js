import { describe, it, expect } from 'vitest';
import { createFuses } from '../src/game/fuse.js';

describe('creeper fuses', () => {
  const step = (f, seconds, near, id = 1) => {
    const out = [];
    for (let i = 0; i < Math.round(seconds * 60); i++) out.push(...f.update(1 / 60, [{ id, near }]));
    return out;
  };

  it('arms after a second near the hole, then burns seven seconds wherever the hole goes', () => {
    const f = createFuses({ armSeconds: 1, fuseSeconds: 7 });
    expect(step(f, 0.9, true)).toEqual([]);
    expect(f.isLit(1)).toBe(false);
    expect(step(f, 0.2, true).map((e) => e.type)).toEqual(['lit']);
    expect(f.isLit(1)).toBe(true);
    expect(step(f, 6.9, false)).toEqual([]);   // far away, still burning
    expect(f.fuseLeft(1)).toBeGreaterThan(0);
    expect(step(f, 0.2, false).map((e) => e.type)).toEqual(['detonate']);
    expect(f.isLit(1)).toBe(false);
  });

  it('backing off before it arms resets the timer', () => {
    const f = createFuses({ armSeconds: 1, fuseSeconds: 7 });
    step(f, 0.8, true);
    step(f, 0.1, false);
    expect(step(f, 0.8, true)).toEqual([]);
    expect(step(f, 0.3, true).map((e) => e.type)).toEqual(['lit']);
  });

  it('a stick that leaves the board is forgotten', () => {
    const f = createFuses({ armSeconds: 1, fuseSeconds: 7 });
    step(f, 1.1, true);
    expect(f.isLit(1)).toBe(true);
    f.update(1 / 60, []);
    expect(f.isLit(1)).toBe(false);
  });
});
