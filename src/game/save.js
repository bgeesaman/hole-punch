// Progress persistence. localStorage JSON blob:
// { unlocked: n, levels: { [n]: { best, stars } }, audio: { music, sfx } } with levels 'off' | 'low' | 'normal'.
// Older saves carried `muted: bool`; it maps to both channels off.
// A storage object can be injected for tests.
export const SAVE_KEY = 'holepunch.save.v1';
const OLD_SAVE_KEY = 'fruitdrop.save.v1'; // the game's earlier name; read once and carried over

function defaultSave() {
  return { unlocked: 1, levels: {}, audio: { music: 'low', sfx: 'normal' } };
}

export function createSave(storage = globalThis.localStorage) {
  let data = defaultSave();

  function load() {
    try {
      const raw = storage && (storage.getItem(SAVE_KEY) || storage.getItem(OLD_SAVE_KEY));
      if (raw) {
        const parsed = JSON.parse(raw);
        data = { ...defaultSave(), ...parsed, levels: parsed.levels || {} };
        data.audio = { ...defaultSave().audio, ...(parsed.audio || {}) };
        if (parsed.muted && !parsed.audio) data.audio = { music: 'off', sfx: 'off' };
        delete data.muted;
      }
    } catch { data = defaultSave(); }
    return data;
  }

  function persist() {
    try { storage && storage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode etc. */ }
  }

  // Record a finished level. Unlocks the next one on a win. Returns { newBest, newStars }.
  function recordResult(level, { total, stars, won }) {
    const prev = data.levels[level] || { best: 0, stars: 0 };
    const entry = { best: Math.max(prev.best, total), stars: Math.max(prev.stars, stars) };
    data.levels[level] = entry;
    if (won) data.unlocked = Math.max(data.unlocked, level + 1);
    persist();
    return { newBest: total > prev.best, newStars: stars > prev.stars };
  }

  function isUnlocked(level) { return level <= data.unlocked; }
  function result(level) { return data.levels[level] || null; }
  function setAudio(channel, level) { data.audio = { ...data.audio, [channel]: level }; persist(); }
  function reset() { data = defaultSave(); persist(); }

  load();
  return { get data() { return data; }, load, recordResult, isUnlocked, result, setAudio, reset };
}
