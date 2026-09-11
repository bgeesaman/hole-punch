import RAPIER from '@dimforge/rapier3d-compat';
import { HOLE, SURFACE, PHYSICS } from '../config.js';

// Physics world with a hole in the ground.
//
// Ground is a hybrid:
//  - A static plane covers the whole table. A contact filter hook drops plane contacts for any
//    body whose center is inside the hole radius (so it can fall) or outside the table (so it
//    rolls off the open edge). Bodies far from the hole rest on this plane and sleep.
//  - A kinematic annulus (trimesh ring from r to r + RIM_WIDTH) follows the hole. It gives the
//    rim real geometry, so objects overhanging the edge tip and roll in. Only bodies near the
//    hole touch it, so the moving kinematic body does not keep the whole table awake.
//
//  - A kinematic cylinder shell (the pit wall) spans the whole shaft and moves with a real
//    velocity, so partly-fallen and falling objects are shoved along when the hole moves.
//
// Swallow: a body whose center drops below -0.5 * its radius inside the table bounds is swallowed
// (scored). It switches to a collision group that hits only the shaft wall and other falling
// objects, and is removed once below the pit floor and out of sight.
// Lost: a body below LOST_Y anywhere else (fell off the table edge).

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 4;
const RIM_WIDTH = 2.5;     // annulus width beyond the hole radius; > largest object diameter
const RIM_SEGMENTS = 64;
const WALL_DEPTH = HOLE.pitDepth; // pit side-wall collider spans the whole shaft
const WALL_RISE = 2;       // the wall also rises above the surface (only dropped objects feel it)
                           // so its overlap with a straddling object is tallest along Y, and the
                           // solver pushes sideways instead of lifting
const LOST_Y = -20;
const PIT_DEPTH = HOLE.pitDepth;
const WALL_FRICTION = 0;   // a pushing wall must not pin objects up by friction (Min rule below)

// Collision groups (Rapier: membership << 16 | filter).
const G_TABLE = 0x0001, G_WALL = 0x0002, G_OBJ = 0x0004, G_FALL = 0x0008;
const groups = (member, filter) => (member << 16) | filter;
const GROUPS_TABLE = groups(G_TABLE, G_OBJ);
const GROUPS_WALL = groups(G_WALL, G_OBJ | G_FALL);
const GROUPS_OBJ = groups(G_OBJ, G_TABLE | G_WALL | G_OBJ);
const GROUPS_FALL = groups(G_FALL, G_WALL | G_FALL); // swallowed: shaft wall and each other only

let rapierReady = null;
export function initRapier() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export async function createPhysics() {
  await initRapier();
  const world = new RAPIER.World({ x: 0, y: -PHYSICS.gravity, z: 0 });
  world.timestep = FIXED_DT;

  const records = new Map(); // id -> record { id, body, collider, shape, size, radius, tier, points, kind, px, py, pz }
  const byBody = new Map();  // body handle -> record. The hook cannot touch the world mid-step,
                             // so it reads cached positions (px, py, pz) from the last step.
  let nextId = 1;
  let accumulator = 0;
  // Rapier only invokes physics hooks on the step variant that takes an event queue.
  const eventQueue = new RAPIER.EventQueue(false);

  const state = {
    half: SURFACE.defaultSide / 2,
    holeX: 0,
    holeZ: 0,
    holeRadius: HOLE.startRadius,
  };

  // --- Static plane -------------------------------------------------------
  const planeBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  let planeCollider = null;
  function buildPlane() {
    if (planeCollider) world.removeCollider(planeCollider, false);
    // Thick box whose top face is y = 0. Thickness stops tunnelling from above.
    const t = 2;
    planeCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(state.half + 1, t / 2, state.half + 1)
        .setTranslation(0, -t / 2, 0)
        .setFriction(PHYSICS.tableFriction)
        .setCollisionGroups(GROUPS_TABLE)
        .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
      planeBody,
    );
  }

  // --- Kinematic rim ------------------------------------------------------
  const rimBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0),
  );
  // The wall gets its own kinematic body, moved with setNextKinematicTranslation so it has a
  // real velocity: the solver then enforces zero approach speed and shoves objects along at
  // the hole's speed. A teleported (zero-velocity) body only nudges them out via the soft
  // penetration term, far too slowly to keep up. The rim band stays teleported on purpose:
  // with a velocity its friction drags everything resting on it like a conveyor belt.
  const wallBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0),
  );
  let rimCollider = null;
  let wallCollider = null;
  const rimCache = new Map(); // radius -> { vertices, indices }
  const wallCache = new Map();

  // Open cylinder shell from y = WALL_RISE down to -WALL_DEPTH. Objects partly in the hole are pushed
  // sideways by it when the hole moves, instead of being left inside the table box and
  // popped back out on top.
  function shellMesh(r) {
    const n = RIM_SEGMENTS;
    const verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      verts.push(Math.cos(a) * r, WALL_RISE, Math.sin(a) * r, Math.cos(a) * r, -WALL_DEPTH, Math.sin(a) * r);
    }
    const idx = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const t0 = i * 2, b0 = i * 2 + 1, t1 = j * 2, b1 = j * 2 + 1;
      idx.push(t0, b0, t1, t1, b0, b1);
    }
    return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
  }

  function annulusMesh(r0, r1) {
    // Two rings of quads: a fine inner band for rim contact and a coarse outer band.
    const radii = [r0, r0 + 0.5, r1];
    const n = RIM_SEGMENTS;
    const verts = [];
    for (const r of radii) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        verts.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    }
    const idx = [];
    for (let ring = 0; ring < radii.length - 1; ring++) {
      const base0 = ring * n;
      const base1 = (ring + 1) * n;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = base0 + i, b = base1 + i, c = base1 + j, d = base0 + j;
        // Wind so the normal points +y (checked below).
        idx.push(a, c, b, a, d, c);
      }
    }
    // Sanity: normal of first triangle must point up.
    const [a, b, c] = [idx[0], idx[1], idx[2]];
    const ax = verts[a * 3], az = verts[a * 3 + 2];
    const bx = verts[b * 3], bz = verts[b * 3 + 2];
    const cx = verts[c * 3], cz = verts[c * 3 + 2];
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az); // y component of (b-a)x(c-a)
    if (ny < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
    return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
  }

  function buildRim(radius) {
    const key = radius.toFixed(3);
    let mesh = rimCache.get(key);
    if (!mesh) {
      mesh = annulusMesh(radius, radius + RIM_WIDTH);
      rimCache.set(key, mesh);
    }
    let shell = wallCache.get(key);
    if (!shell) {
      shell = shellMesh(radius);
      wallCache.set(key, shell);
    }
    if (wallCollider) world.removeCollider(wallCollider, false);
    wallCollider = world.createCollider(
      RAPIER.ColliderDesc.trimesh(shell.vertices, shell.indices)
        .setFriction(WALL_FRICTION)
        // Rapier averages friction by default, so 0.7 objects would still get 0.35 against
        // the wall. That is enough for a fast wall to hold a crate up in the air.
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setCollisionGroups(GROUPS_WALL)
        .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
      wallBody,
    );
    if (rimCollider) world.removeCollider(rimCollider, false);
    rimCollider = world.createCollider(
      // No TriMeshFlags: FIX_INTERNAL_EDGES discards the boundary-edge contacts that form the rim.
      RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices)
        .setFriction(PHYSICS.tableFriction)
        .setCollisionGroups(GROUPS_TABLE)
        .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
      rimBody,
    );
    // Wake anything near the rim so it reacts to the new gap.
    for (const rec of records.values()) {
      const dx = rec.px - state.holeX, dz = rec.pz - state.holeZ;
      if (dx * dx + dz * dz < (radius + RIM_WIDTH + rec.radius) ** 2) rec.body.wakeUp();
    }
  }

  // --- Contact filter -----------------------------------------------------
  // Runs inside world.step(); the world is borrowed by Rust, so only handles and JS caches
  // may be used here.
  const SOLVE = RAPIER.SolverFlags.COMPUTE_IMPULSE;
  const hooks = {
    filterContactPair(c1, c2, b1, b2) {
      const g1 = b1 === planeBody.handle || b1 === rimBody.handle || b1 === wallBody.handle;
      const g2 = b2 === planeBody.handle || b2 === rimBody.handle || b2 === wallBody.handle;
      if (!(g1 || g2)) return SOLVE;
      const rec = byBody.get(g1 ? b2 : b1);
      if (!rec) return SOLVE;
      // Off the table edge: nothing holds it up.
      if (Math.abs(rec.px) > state.half || Math.abs(rec.pz) > state.half) return null;
      const dx = rec.px - state.holeX, dz = rec.pz - state.holeZ;
      const inHole = dx * dx + dz * dz < state.holeRadius * state.holeRadius;
      // Dropped into the hole: the center is well below where it would rest on the table.
      // Such an object is owned by the pit side wall. The flat table and rim must not touch
      // it, or they lift it back out when the hole moves on (its volume straddles y = 0).
      const dropped = rec.py < rec.restY * 0.6;
      const other = g1 ? c1 : c2;
      if (other === planeCollider.handle) return inHole || dropped ? null : SOLVE;
      if (other === rimCollider.handle) return dropped ? null : SOLVE;
      // Pit side wall: only dropped objects feel it, so it can rise above the surface without
      // fencing the hole off from objects on the table.
      return dropped ? SOLVE : null;
    },
    filterIntersectionPair() { return true; },
  };

  // --- Public API ---------------------------------------------------------
  function setSurface(side) {
    state.half = side / 2;
    buildPlane();
  }

  function setHoleRadius(r) {
    if (Math.abs(r - state.holeRadius) < 1e-6 && rimCollider) return;
    state.holeRadius = r;
    buildRim(r);
  }

  function setHolePosition(x, z) {
    state.holeX = x;
    state.holeZ = z;
  }

  // shape: 'ball' | 'cuboid' | 'cylinder' | 'capsule'
  // size: ball {r}; cuboid {hx,hy,hz}; cylinder {hh,r}; capsule {hh,r}
  // sleeping: level layouts are placed at rest, so bodies start asleep and wake on contact
  // or when the hole comes near. This avoids a 1000-body settle spike at level load.
  function spawn({ shape, size, position, rotation, tier = 'S', points = 1, kind = 'fruit', friction = 0.5, restitution = 0.2, density = 1, sleeping = true, linearDamping, angularDamping, clearance = 0, type = null, penalty = null }) {
    const damp = shape === 'ball' ? PHYSICS.ball : shape === 'capsule' || shape === 'cylinder' ? PHYSICS.roller : PHYSICS.crate;
    linearDamping ??= damp.linearDamping;
    angularDamping ??= damp.angularDamping;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      // No CCD: against the fast kinematic wall it clamps a body's motion every step, so a
      // pushed object hangs in the air. Speeds here are far below tunnelling range.
      .setCcdEnabled(false)
      .setSleeping(sleeping)
      .setLinearDamping(linearDamping)
      .setAngularDamping(angularDamping);
    if (rotation) desc.setRotation(rotation);
    const body = world.createRigidBody(desc);
    let cd;
    let radius;
    switch (shape) {
      case 'ball': cd = RAPIER.ColliderDesc.ball(size.r); radius = size.r; break;
      case 'cuboid': cd = RAPIER.ColliderDesc.cuboid(size.hx, size.hy, size.hz); radius = Math.hypot(size.hx, size.hy, size.hz); break;
      case 'cylinder': cd = RAPIER.ColliderDesc.cylinder(size.hh, size.r); radius = Math.hypot(size.hh, size.r); break;
      case 'capsule': cd = RAPIER.ColliderDesc.capsule(size.hh, size.r); radius = size.hh + size.r; break;
      default: throw new Error(`unknown shape ${shape}`);
    }
    cd.setFriction(friction).setRestitution(restitution).setDensity(density).setCollisionGroups(GROUPS_OBJ);
    const collider = world.createCollider(cd, body);
    // Height of the center when resting flat on the table. Used to tell "sitting on the rim"
    // from "dropped into the hole".
    const restY = shape === 'ball' ? size.r
      : shape === 'cuboid' ? Math.min(size.hx, size.hy, size.hz)
      : shape === 'cylinder' ? Math.min(size.hh, size.r)
      : size.r;
    const id = nextId++;
    const rec = { id, body, collider, shape, size, radius, tier, points, kind, clearance, type, penalty,
      px: position.x, py: position.y, pz: position.z, swallowed: false, restY, synced: false };
    body.userData = rec;
    records.set(id, rec);
    byBody.set(body.handle, rec);
    return rec;
  }

  function remove(rec) {
    if (!records.has(rec.id)) return;
    byBody.delete(rec.body.handle);
    world.removeRigidBody(rec.body); // removes attached colliders too
    records.delete(rec.id);
  }

  function readback() {
    for (const rec of records.values()) {
      const p = rec.body.translation();
      rec.px = p.x; rec.py = p.y; rec.pz = p.z;
    }
  }

  // Sleeping bodies do not notice the plane letting go beneath them, so wake anything the
  // hole (plus rim) could be touching whenever the hole has moved.
  let lastWakeX = NaN, lastWakeZ = NaN;
  function wakeNearHole() {
    if (state.holeX === lastWakeX && state.holeZ === lastWakeZ) return;
    lastWakeX = state.holeX; lastWakeZ = state.holeZ;
    for (const rec of records.values()) {
      if (rec.swallowed || !rec.body.isSleeping()) continue;
      const dx = rec.px - state.holeX, dz = rec.pz - state.holeZ;
      const reach = state.holeRadius + rec.radius + 0.1;
      if (dx * dx + dz * dz < reach * reach) rec.body.wakeUp();
    }
  }

  // Blast: fling everything within radius of (x, z) outward and a little up, strongest at the
  // centre. Strength is an impulse per unit mass, so big and small objects fly alike.
  function blast(x, z, radius, strength) {
    for (const rec of records.values()) {
      if (rec.swallowed) continue;
      const dx = rec.px - x, dz = rec.pz - z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const falloff = 1 - (d / radius) * 0.7;
      const nx = d > 1e-3 ? dx / d : Math.cos(rec.id), nz = d > 1e-3 ? dz / d : Math.sin(rec.id);
      const m = rec.body.mass() * strength * falloff;
      rec.body.applyImpulse({ x: nx * m, y: 0.45 * m, z: nz * m }, true);
    }
  }

  // Rolling brake. Rapier drives a capsule or cylinder lying on its side into a slow, steady
  // roll on a flat surface (about 0.2 units/s at this gravity; a raw world with one box and
  // one capsule shows it, and damping cannot stop it). So a roller resting flat on the table
  // is braked hard while slow and put to sleep once it has stopped. A real knock stays fast
  // enough to roll as usual.
  const BRAKE_V = 0.35, BRAKE_W = 1.8, BRAKE = 0.75, STOP_V = 0.01;
  function brakeRollers() {
    for (const rec of records.values()) {
      if (rec.swallowed || (rec.shape !== 'capsule' && rec.shape !== 'cylinder')) continue;
      const body = rec.body;
      if (body.isSleeping()) continue;
      const t = body.translation();
      if (t.y < rec.restY * 0.95 || t.y > rec.restY * 1.05) continue; // not lying flat on the table
      const v = body.linvel(), w = body.angvel();
      const sv = Math.hypot(v.x, v.y, v.z), sw = Math.hypot(w.x, w.y, w.z);
      if (sv > BRAKE_V || sw > BRAKE_W) continue;
      if (sv < STOP_V && sw < STOP_V / rec.size.r) {
        // Zero it and let Rapier's own sleep timer take it. Do not call sleep() here: a body
        // put to sleep mid-simulation loses its contacts for a step, dips into the table, and
        // the contact filter then treats it as dropped into the hole.
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        continue;
      }
      body.setLinvel({ x: v.x * BRAKE, y: v.y, z: v.z * BRAKE }, true);
      body.setAngvel({ x: w.x * BRAKE, y: w.y * BRAKE, z: w.z * BRAKE }, true);
    }
  }

  function step(dt) {
    accumulator = Math.min(accumulator + dt, FIXED_DT * MAX_SUBSTEPS);
    let steps = 0;
    wakeNearHole();
    while (accumulator >= FIXED_DT) {
      // Teleport, do not integrate: setNextKinematicTranslation gives the rim a velocity, and
      // friction then drags everything resting on the band like a conveyor belt.
      rimBody.setTranslation({ x: state.holeX, y: 0, z: state.holeZ }, false);
      wallBody.setNextKinematicTranslation({ x: state.holeX, y: 0, z: state.holeZ });
      world.step(eventQueue, hooks);
      accumulator -= FIXED_DT;
      steps++;
      readback();
      brakeRollers();
    }
    if (steps === 0) return { swallowed: [], removed: [], lost: [] };

    const swallowed = []; // scored this step, still falling
    const removed = [];   // swallowed earlier, now below the pit floor
    const lost = [];      // fell off the table edge
    for (const rec of records.values()) {
      if (rec.swallowed) {
        // Gone once below the pit floor, or at once if it is inside the solid table away from
        // the pit (invisible there, and it would emerge under the table).
        const dx = rec.px - state.holeX, dz = rec.pz - state.holeZ;
        const inPit = dx * dx + dz * dz < (state.holeRadius + rec.radius) ** 2;
        if (rec.py < -(PIT_DEPTH + rec.radius + 0.1) || !inPit) removed.push(rec);
        continue;
      }
      // Below the surface inside the table bounds: the only way there is through the hole.
      if (rec.py < -rec.radius * 0.5) {
        if (Math.abs(rec.px) <= state.half && Math.abs(rec.pz) <= state.half) {
          rec.swallowed = true;
          // Falls through the shaft, colliding with the wall and other falling objects only.
          // (Changing groups keeps the collider's mass; disabling the collider would zero it
          // and gravity would stop.)
          rec.collider.setCollisionGroups(GROUPS_FALL);
          swallowed.push(rec);
          continue;
        }
      }
      if (rec.py < LOST_Y) lost.push(rec);
    }
    for (const rec of removed) remove(rec);
    for (const rec of lost) remove(rec);
    return { swallowed, removed, lost };
  }

  function forEach(cb) {
    for (const rec of records.values()) cb(rec, rec.body.translation(), rec.body.rotation());
  }

  // Like forEach, but skips bodies that are asleep and were already synced while asleep.
  // With 1000 objects at rest this cuts the per-frame transform work to the moving few.
  function forEachMoving(cb) {
    for (const rec of records.values()) {
      const asleep = rec.body.isSleeping();
      if (asleep && rec.synced) continue;
      cb(rec, rec.body.translation(), rec.body.rotation());
      rec.synced = asleep;
    }
  }

  function stats() {
    let awake = 0, remaining = 0;
    for (const rec of records.values()) {
      if (!rec.body.isSleeping()) awake++;
      if (!rec.swallowed) remaining++;
    }
    return { bodies: records.size, awake, remaining };
  }

  function clear() {
    for (const rec of [...records.values()]) remove(rec);
    accumulator = 0;
  }

  setSurface(SURFACE.defaultSide);
  buildRim(state.holeRadius);

  return { world, state, records, setSurface, setHoleRadius, setHolePosition, spawn, remove, step, blast, forEach, forEachMoving, stats, clear };
}
