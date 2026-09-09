import { describe, it, expect } from 'vitest';
import { createSave, SAVE_KEY } from '../src/game/save.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

describe('save', () => {
  it('starts with level 1 unlocked and nothing recorded', () => {
    const s = createSave(memStorage());
    expect(s.isUnlocked(1)).toBe(true);
    expect(s.isUnlocked(2)).toBe(false);
    expect(s.result(1)).toBeNull();
  });

  it('records best score and stars, unlocks the next level on a win, and persists', () => {
    const st = memStorage();
    const s = createSave(st);
    expect(s.recordResult(1, { total: 50, stars: 1, won: true })).toEqual({ newBest: true, newStars: true });
    expect(s.isUnlocked(2)).toBe(true);
    expect(s.recordResult(1, { total: 30, stars: 3, won: true })).toEqual({ newBest: false, newStars: true });
    expect(s.result(1)).toEqual({ best: 50, stars: 3 });
    // A loss records the score but does not unlock.
    s.recordResult(2, { total: 10, stars: 0, won: false });
    expect(s.isUnlocked(3)).toBe(false);
    // Reload from storage.
    const again = createSave(st);
    expect(again.data.unlocked).toBe(2);
    expect(again.result(1)).toEqual({ best: 50, stars: 3 });
    expect(JSON.parse(st.map.get(SAVE_KEY)).levels['2'].best).toBe(10);
  });

  it('reset clears everything and survives corrupt storage', () => {
    const st = memStorage();
    st.setItem(SAVE_KEY, '{not json');
    const s = createSave(st);
    expect(s.data.unlocked).toBe(1);
    s.recordResult(1, { total: 5, stars: 1, won: true });
    s.reset();
    expect(s.isUnlocked(2)).toBe(false);
    expect(createSave(st).data.unlocked).toBe(1);
  });
});

it('keeps per-channel audio levels and migrates the old muted flag', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  storage.setItem(SAVE_KEY, JSON.stringify({ unlocked: 3, levels: {}, muted: true }));
  const s1 = createSave(storage);
  expect(s1.data.audio).toEqual({ music: 'off', sfx: 'off', muted: false });
  expect(s1.data.muted).toBeUndefined();
  s1.setAudio('music', 'low');
  const s2 = createSave(storage);
  expect(s2.data.audio).toEqual({ music: 'low', sfx: 'off', muted: false });
});

it('reads a save written under the old game name', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  storage.setItem('fruitdrop.save.v1', JSON.stringify({ unlocked: 7, levels: { 3: { best: 10, stars: 2 } } }));
  const s = createSave(storage);
  expect(s.data.unlocked).toBe(7);
  expect(s.result(3)).toEqual({ best: 10, stars: 2 });
  s.setAudio('sfx', 'low');
  expect(store.has(SAVE_KEY)).toBe(true);
});

it('remembers a perfect run for a level even after a worse replay', () => {
  const s = createSave(memStorage());
  s.recordResult(2, { total: 50, stars: 3, won: true, perfect: true });
  expect(s.result(2).perfect).toBe(true);
  s.recordResult(2, { total: 20, stars: 1, won: true, perfect: false });
  expect(s.result(2)).toEqual({ best: 50, stars: 3, perfect: true });
  s.recordResult(3, { total: 20, stars: 2, won: true });
  expect(s.result(3).perfect).toBeUndefined();
});
