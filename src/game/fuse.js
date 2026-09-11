// Creeper-style fuses. While the hole is near a stick its charge builds; at armSeconds the
// stick lights, burns fuseSeconds regardless of where the hole goes, and detonates. Leaving
// the zone before it lights lets the charge cool back to zero over coolSeconds. Pure: the
// caller says which sticks are near each tick.
export function createFuses({ armSeconds, fuseSeconds, coolSeconds = 2 }) {
  const charge = new Map(); // id -> seconds of lingering, cooling when away
  const lit = new Map();    // id -> seconds of fuse left

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
      let t = charge.get(c.id) || 0;
      if (c.near) {
        t += dt;
        if (t >= armSeconds) {
          charge.delete(c.id);
          lit.set(c.id, fuseSeconds);
          events.push({ type: 'lit', id: c.id });
          continue;
        }
      } else {
        t -= dt * (armSeconds / coolSeconds);
        if (t <= 0) { charge.delete(c.id); continue; }
      }
      charge.set(c.id, t);
    }
    for (const id of [...charge.keys()]) if (!seen.has(id)) charge.delete(id);
    for (const id of [...lit.keys()]) if (!seen.has(id)) lit.delete(id);
    return events;
  }

  // Light outright (a nearby detonation), with an optional fuse length (bombs pop after a
  // short delay). Already-lit ids keep their fuse.
  function light(id, seconds = fuseSeconds) {
    if (lit.has(id)) return false;
    charge.delete(id);
    lit.set(id, seconds);
    return true;
  }
  function forget(id) { charge.delete(id); lit.delete(id); }
  function clear() { charge.clear(); lit.clear(); }

  return {
    update, light, forget, clear,
    isLit: (id) => lit.has(id),
    fuseLeft: (id) => lit.get(id) ?? 0,
    charge: (id) => (charge.get(id) ?? 0) / armSeconds, // 0..1 while in or cooling from the zone
    get litIds() { return [...lit.keys()]; },
    get chargingIds() { return [...charge.keys()]; },
  };
}
