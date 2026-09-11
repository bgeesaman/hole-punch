import { describe, it, expect } from 'vitest';
import { levelParams, LEVELS } from '../src/game/level-curve.js';
import { generateLevel } from '../src/game/generator.js';
import { CATALOG, footprintFor } from '../src/game/catalog.js';

describe('level curve', () => {
  it('ramps count, tiers, target, and side monotonically', () => {
    let prev = levelParams(1);
    expect(prev.count).toBe(30);
    expect(prev.tierMix.L).toBe(0);
    expect(prev.bombShare).toBe(0);
    for (let n = 2; n <= LEVELS; n++) {
      const p = levelParams(n);
      expect(p.count).toBeGreaterThanOrEqual(prev.count);
      expect(p.targetFraction).toBeGreaterThanOrEqual(prev.targetFraction);
      expect(p.side).toBeGreaterThanOrEqual(prev.side);
      expect(p.tierMix.S + p.tierMix.M + p.tierMix.L + p.tierMix.X).toBeCloseTo(1);
      prev = p;
    }
    expect(prev.count).toBe(1000);
    expect(prev.side).toBe(64);
    expect(levelParams(10).bombShare).toBeGreaterThan(0);
    expect(levelParams(39).tierMix.X).toBe(0);
    expect(levelParams(60).tierMix.X).toBeGreaterThan(0);
  });

  it('hard mode has 25% more explosives than the curve, normal 10% fewer, same layout seed', () => {
    const n = levelParams(50), h = levelParams(50, 'hard');
    expect(h.bombShare).toBeCloseTo(n.bombShare * (1.25 / 0.9));
    expect(h.seed).toBe(n.seed);
    expect(h.mode).toBe('hard');
  });

  it('hazards arrive by level: bombs at 10, minis at 15, TNT at 25, all sized to their cell', () => {
    const types = (n) => new Set(generateLevel(levelParams(n)).objects.map((o) => o.type));
    expect([...types(10)].filter((t) => CATALOG[t].kind === 'bomb')).toEqual(['bomb']);
    for (const n of [20, 40, 70, 100]) {
      const lvl = generateLevel(levelParams(n));
      const hazards = lvl.objects.filter((o) => CATALOG[o.type].kind === 'bomb');
      expect(hazards.length).toBeGreaterThan(0);
      for (const h of hazards) expect(h.position.y).toBeCloseTo(CATALOG[h.type].restY);
    }
    const late = [40, 55, 70, 85, 100].flatMap((n) => generateLevel(levelParams(n)).objects.map((o) => o.type));
    expect(late).toContain('bombS');
    expect(late.some((t) => t === 'tntM' || t === 'tntL')).toBe(true);
    expect(late).toContain('pumpkin');
  });
});

describe('generator', () => {
  it('is deterministic per level', () => {
    const a = generateLevel(levelParams(7));
    const b = generateLevel(levelParams(7));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generateLevel(levelParams(8));
    expect(JSON.stringify(a.objects)).not.toBe(JSON.stringify(c.objects));
  });

  it('places roughly the requested count inside the table, clear of the hole start, without overlaps', () => {
    for (const n of [1, 5, 10, 25, 50, 75, 100]) {
      const p = levelParams(n);
      const lvl = generateLevel(p);
      expect(lvl.counts.total).toBeGreaterThanOrEqual(p.count * 0.9);
      expect(lvl.counts.total).toBeLessThanOrEqual(p.count * 1.15);
      const half = lvl.side / 2;
      for (const o of lvl.objects) {
        const r = footprintFor(o.type);
        expect(Math.abs(o.position.x) + r).toBeLessThanOrEqual(half);
        expect(Math.abs(o.position.z) + r).toBeLessThanOrEqual(half);
        expect(Math.hypot(o.position.x, o.position.z)).toBeGreaterThan(2.5);
      }
      // Ground-level objects must not overlap in XZ (stacks share XZ on purpose, so skip y > rest).
      const ground = lvl.objects.filter((o) => Math.abs(o.position.y - CATALOG[o.type].restY) < 1e-6);
      for (let i = 0; i < ground.length; i++) {
        for (let j = i + 1; j < ground.length; j++) {
          const a = ground[i], b = ground[j];
          const d = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
          expect(d).toBeGreaterThan((footprintFor(a.type) + footprintFor(b.type)) * 0.95);
        }
      }
    }
  });

  it('adds bombs from level 10 and computes target from fruit only', () => {
    expect(generateLevel(levelParams(9)).counts.bombs).toBe(0);
    const lvl = generateLevel(levelParams(40));
    expect(lvl.counts.bombs).toBeGreaterThan(0);
    expect(lvl.target).toBeLessThan(lvl.counts.available);
    expect(lvl.seconds).toBe(lvl.counts.total);
  });

  it('level 1 is small, small-tier only, grids only', () => {
    const lvl = generateLevel(levelParams(1));
    expect(lvl.counts.total).toBeLessThanOrEqual(34);
    for (const o of lvl.objects) expect(CATALOG[o.type].tier).not.toBe('L');
    expect(lvl.objects.every((o) => !o.type.startsWith('crate'))).toBe(true);
  });
});
