// Creeper-style fuses. A stick arms after the hole has stayed near it for armSeconds, then
// burns for fuseSeconds regardless of where the hole goes, and detonates. Backing off before
// it arms resets the arming timer. Pure: the caller says which sticks are near each tick.
export function createFuses({ armSeconds, fuseSeconds }) {
  const near = new Map(); // id -> seconds the hole has been near
  const lit = new Map();  // id -> seconds of fuse left

  // candidates: [{ id, near: boolean }] for every stick still on the board.
  function update(dt, candidates) {
    const events = [];
    const seen = new Set();
    for (const c of candidates) {
      seen.add(c.id);
      if (lit.has(c.id)) {
        const t = lit.get(c.id) - dt;
        if (t <= 0) { lit.delete(c.id); events.push({ type: 'detonate', id: c.id }); }
        else lit.set(c.id, t);
        continue;
      }
      if (!c.near) { near.delete(c.id); continue; }
      const t = (near.get(c.id) || 0) + dt;
      if (t >= armSeconds) {
        near.delete(c.id);
        lit.set(c.id, fuseSeconds);
        events.push({ type: 'lit', id: c.id });
      } else near.set(c.id, t);
    }
    for (const id of [...near.keys()]) if (!seen.has(id)) near.delete(id);
    for (const id of [...lit.keys()]) if (!seen.has(id)) lit.delete(id);
    return events;
  }

  function forget(id) { near.delete(id); lit.delete(id); }
  function clear() { near.clear(); lit.clear(); }

  return {
    update, forget, clear,
    isLit: (id) => lit.has(id),
    fuseLeft: (id) => lit.get(id) ?? 0,
    get litIds() { return [...lit.keys()]; },
  };
}
