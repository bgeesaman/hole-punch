import { describe, it, expect } from 'vitest';
import { milestonesReached, milestoneProgress, holeStep, holeRadius, timeBonus, stars, targetFor, defaultThresholds, reachableThresholds, stepToFit } from '../src/game/scoring.js';
import { createSession } from '../src/game/session.js';

describe('scoring rules', () => {
  const T = defaultThresholds(100);
  it('default milestones at 20/40/60/80/100% of target', () => {
    expect(T).toEqual([20, 40, 60, 80, 100]);
    expect(milestonesReached(0, T)).toBe(0);
    expect(milestonesReached(19, T)).toBe(0);
    expect(milestonesReached(20, T)).toBe(1);
    expect(milestonesReached(59, T)).toBe(2);
    expect(milestonesReached(60, T)).toBe(3);
    expect(milestonesReached(150, T)).toBe(5);
  });
  it('milestone progress runs 0..1 between thresholds and is full at the end', () => {
    expect(milestoneProgress(0, T)).toBe(0);
    expect(milestoneProgress(10, T)).toBeCloseTo(0.5);
    expect(milestoneProgress(20, T)).toBe(0);
    expect(milestoneProgress(25, T)).toBeCloseTo(0.25);
    expect(milestoneProgress(100, T)).toBe(1);
    expect(milestoneProgress(500, T)).toBe(1);
  });
  it('step to fit: balls need a hole wider than their radius, crates their face diagonal', () => {
    expect(stepToFit(0.25)).toBe(0);   // S ball
    expect(stepToFit(0.5)).toBe(0);    // M ball
    expect(stepToFit(1.0)).toBe(1);    // L ball: 1.05
    expect(stepToFit(0.707)).toBe(1);  // M crate
    expect(stepToFit(1.414 * 1.25)).toBe(4); // L crate with margin: 2.1
    expect(stepToFit(0.707 * 1.25)).toBe(1); // M crate with margin: 1.05
    expect(stepToFit(1.3)).toBe(2);          // pumpkin
    expect(stepToFit(1.3 * 1.414 * 1.25)).toBe(5); // X crate needs the sixth size: 2.45
    expect(holeRadius(5)).toBeCloseTo(2.45);
  });
  it('reachable thresholds cap each milestone at 70% of points collectable at that size', () => {
    // 10 small (1 pt) and 14 L crates (20 pts): target 60% of 290 = 174.
    const objs = [...Array(10).fill({ points: 1, clearance: 0.25 }), ...Array(14).fill({ points: 20, clearance: 1.77 })];
    const t = reachableThresholds(174, objs);
    // Steps 0..3 only reach the 10 small points -> 7 each; step 4 fits the crates.
    expect(t).toEqual([7, 7, 7, 7, 174]);
    // A level with nothing fitting at the start grows immediately.
    expect(reachableThresholds(100, [{ points: 20, clearance: 1.77 }])[0]).toBe(0);
    // A level of small fruit keeps the default fractions.
    expect(reachableThresholds(100, Array(200).fill({ points: 1, clearance: 0.25 }))).toEqual([20, 40, 60, 80, 100]);
  });
  it('hole step never drops below start and never exceeds the top step', () => {
    expect(holeStep(0, 3)).toBe(0);
    expect(holeStep(2, 1)).toBe(1);
    expect(holeStep(9, 0)).toBe(5);
    expect(holeRadius(0)).toBeCloseTo(0.7);
    expect(holeRadius(4)).toBeCloseTo(2.1);
  });
  it('time bonus only when cleared', () => {
    expect(timeBonus(12.3, true)).toBe(123);
    expect(timeBonus(12.3, false)).toBe(0);
  });
  it('stars', () => {
    expect(stars({ total: 50, target: 60, cleared: false, secondsLeft: 0, seconds: 60 })).toBe(0);
    expect(stars({ total: 60, target: 60, cleared: false, secondsLeft: 0, seconds: 60 })).toBe(1);
    expect(stars({ total: 60, target: 60, cleared: true, secondsLeft: 10, seconds: 60 })).toBe(2);
    expect(stars({ total: 60, target: 60, cleared: true, secondsLeft: 15, seconds: 60 })).toBe(3);
    expect(stars({ total: 60, target: 60, cleared: true, secondsLeft: 15, seconds: 60, bombs: 1 })).toBe(2);
  });
  it('target from available points ignores bombs', () => {
    const objs = [{ points: 1 }, { points: 5 }, { points: 20, kind: 'bomb' }, { points: 20 }];
    expect(targetFor(objs, 0.6)).toBe(16);
  });
});

describe('session', () => {
  const fruit = (points) => ({ kind: 'fruit', points, tier: 'M' });
  const bomb = () => ({ kind: 'bomb', points: 0 });

  it('scores, grows the hole, shrinks on bombs, clears the board with bonus', () => {
    const sess = createSession({ target: 20, seconds: 30, fruitCount: 4 });
    sess.swallow(fruit(5));
    expect(sess.holeStep).toBe(1); // 25%
    sess.swallow(bomb());
    expect(sess.holeStep).toBe(0);
    sess.swallow(fruit(5));
    expect(sess.holeStep).toBe(1); // 50% reached, minus one active bomb penalty
    sess.tick(10);                 // the penalty expires after 8 s and the hole regrows
    expect(sess.holeStep).toBe(2);
    expect(sess.consume().some((e) => e.type === 'regrow')).toBe(true);
    sess.swallow(fruit(5));
    sess.lose(fruit(5)); // rolled off the edge: no points, still counts toward the clear
    const s = sess.state;
    expect(s.ended).toBe(true);
    expect(s.reason).toBe('cleared');
    expect(s.score).toBe(15);
    expect(s.bonus).toBe(200);
    expect(s.perfect).toBe(false); // one fruit was lost
    expect(s.total).toBe(215);
    expect(s.won).toBe(true);
    expect(s.stars).toBe(2); // cleared with time to spare, but a bomb was eaten
  });

  it('a clear after swallowing a bomb is not perfect', () => {
    const sess = createSession({ target: 20, seconds: 30, fruitCount: 2 });
    sess.swallow(bomb());
    sess.swallow(fruit(20));
    sess.swallow(fruit(20));
    expect(sess.state.cleared).toBe(true);
    expect(sess.state.perfect).toBe(false);
    expect(sess.state.perfectBonus).toBe(0);
    expect(sess.state.stars).toBe(2); // plenty of time left, but a bomb caps it
  });

  it('a clear with nothing lost is perfect and pays a bonus', () => {
    const sess = createSession({ target: 20, seconds: 30, fruitCount: 2 });
    sess.swallow(fruit(20));
    sess.tick(10);
    sess.swallow(fruit(20));
    const s = sess.state;
    expect(s.perfect).toBe(true);
    expect(s.perfectBonus).toBe(10); // 25% of 40
    expect(s.total).toBe(40 + 200 + 10);
  });

  it('losing fruit off the edge lowers thresholds so growth stays reachable', () => {
    // 10 small points accessible at every step; thresholds capped at 7.
    const accessible = [10, 10, 10, 10, 10, 10];
    const sess = createSession({ target: 100, seconds: 30, fruitCount: 10, thresholds: [7, 7, 7, 7, 7], accessible });
    sess.swallow({ kind: 'fruit', points: 5, tier: 'M' });
    expect(sess.holeStep).toBe(0);
    // 4 points roll off: only 6 remain collectable, so the cap drops to floor(6 * 0.7) = 4 <= 5.
    sess.lose({ kind: 'fruit', points: 4, clearance: 0.25 });
    expect(sess.state.thresholds).toEqual([4, 4, 4, 4, 4]);
    expect(sess.holeStep).toBe(5);
  });

  it('a bomb after the last milestone shrinks the hole only temporarily', () => {
    const sess = createSession({ target: 10, seconds: 60, fruitCount: 5, thresholds: [0, 0, 0, 0, 0] });
    expect(sess.holeStep).toBe(5);
    sess.swallow(bomb());
    sess.swallow(bomb());
    expect(sess.holeStep).toBe(3);
    sess.tick(8.5);
    expect(sess.holeStep).toBe(5);
  });

  it('TNT costs two steps for ten seconds and carries a blast; a mini costs one for five', () => {
    const sess = createSession({ target: 10, seconds: 60, fruitCount: 5, thresholds: [0, 0, 0, 0, 0] });
    sess.swallow({ kind: 'bomb', points: 0, penalty: { steps: 2, seconds: 10, blast: { radius: 4.5, strength: 9 } } });
    expect(sess.holeStep).toBe(3);
    const ev = sess.consume().find((e) => e.type === 'bomb');
    expect(ev.steps).toBe(2);
    expect(ev.blast.radius).toBe(4.5);
    sess.swallow({ kind: 'bomb', points: 0, penalty: { steps: 1, seconds: 5 } });
    expect(sess.holeStep).toBe(2);
    expect(sess.bombRemaining()).toBeCloseTo(1);
    sess.tick(5.5);
    expect(sess.holeStep).toBe(3);   // the mini expired, the TNT has not
    sess.tick(5);
    expect(sess.holeStep).toBe(5);
  });

  it('time up ends the level with no bonus', () => {
    const sess = createSession({ target: 10, seconds: 5, fruitCount: 3 });
    sess.swallow(fruit(5));
    sess.tick(6);
    const s = sess.state;
    expect(s.ended).toBe(true);
    expect(s.reason).toBe('timeup');
    expect(s.bonus).toBe(0);
    expect(s.won).toBe(false);
    expect(s.stars).toBe(0);
    // Nothing counts after the end.
    sess.swallow(fruit(5));
    expect(s.score).toBe(5);
  });

  it('emits events once', () => {
    const sess = createSession({ target: 10, seconds: 5, fruitCount: 3 });
    sess.swallow(fruit(5));
    const e = sess.consume();
    expect(e.map((x) => x.type)).toEqual(['swallow', 'milestone', 'milestone']);
    expect(sess.consume()).toEqual([]);
  });
});
