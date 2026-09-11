import * as THREE from 'three';
import { createScene } from './render/scene.js';
import { createHole, RIM_SCALE } from './render/hole.js';
import { createObjects } from './render/objects.js';
import { createInput } from './input.js';
import { createHud } from './ui/hud.js';
import { createEndScreen } from './ui/end.js';
import { createMenu } from './ui/menu.js';
import { createPause } from './ui/pause.js';
import { createHowto } from './ui/howto.js';
import { createFuses } from './game/fuse.js';
import { createSave } from './game/save.js';
import { createAudio } from './audio.js';
import { createParticles } from './render/particles.js';
import { createProps } from './render/props.js';
import { createPhysics } from './physics/world.js';
import { createSession } from './game/session.js';
import { holeRadius, holeSpeed, milestoneProgress } from './game/scoring.js';
import { levelParams, LEVELS } from './game/level-curve.js';
import { generateLevel } from './game/generator.js';
import { spawnDescriptor } from './game/catalog.js';
import { visualFor, colorFor } from './render/fruit.js';
import { HOLE, SURFACE, CAMERA, TNT } from './config.js';

const canvas = document.getElementById('game');
const view = createScene(canvas);
const hole = createHole(view.scene);
const objects = createObjects(view.scene);
const params = new URLSearchParams(location.search);
// ?nolock: automation/testing mode. The hole follows the unlocked cursor and the game runs
// without pointer capture.
const nolock = params.has('nolock');
const input = createInput(canvas, view.camera, { requireLock: !nolock });
const hud = createHud();
const save = createSave();
const audio = createAudio(save.data.audio);
const particles = createParticles(view.scene);
const props = createProps(view.scene, { withCutout: view.withCutout });
const endScreen = createEndScreen({
  onRetry: () => startLevel(level),
  onNext: () => startLevel(Math.min(LEVELS, level + 1)),
  onMenu: () => showMenu(),
});
const menu = createMenu({ save, onSelect: (n) => startLevel(n) });
const pause = createPause({
  onAudio: (channel, level) => {
    save.setAudio(channel, level);
    if (channel === 'music') audio.setMusicLevel(level); else audio.setSfxLevel(level);
    pause.setAudio(save.data.audio);
  },
  onResume: () => input.capture(),
  onRestart: () => startLevel(level),
  onMenu: () => showMenu({ fromPause: true }),
});
const howto = createHowto({ onPlay: () => input.capture() });
const hudEl = document.getElementById('hud');

// Sound settings live in the pause menu, persisted per channel. M toggles a master mute on top.
pause.setAudio(save.data.audio);
const mutedEl = document.getElementById('hud-muted');
function setMuted(m) {
  save.setAudio('muted', m);
  audio.setMuted(m);
  mutedEl.hidden = !m;
}
mutedEl.hidden = !save.data.audio.muted;
mutedEl.addEventListener('click', (e) => { e.stopPropagation(); setMuted(false); });

const debugEl = document.getElementById('debug');
const debug = params.has('debug');
debugEl.hidden = !debug;

const physics = await createPhysics();
let side = SURFACE.defaultSide;

// The game only runs while the mouse is captured. Releasing it pauses the hole, physics,
// and the timer.
const hintEl = document.getElementById('hint');
function setPaused(paused) {
  hintEl.textContent = paused ? 'paused  ·  click to capture mouse and play' : 'click or esc to release mouse';
  hintEl.classList.toggle('locked', !paused);
}
// Client pixel coordinates of a world point on the table (y = 0).
const projected = new THREE.Vector3();
function worldToClient(x, z) {
  projected.set(x, 0, z).project(view.camera);
  const r = canvas.getBoundingClientRect();
  return { x: r.left + ((projected.x + 1) / 2) * r.width, y: r.top + ((1 - projected.y) / 2) * r.height };
}
// Screens: 'menu' | 'playing' | 'end'. While playing, a released mouse is a pause.
let screen = 'menu';
function seedCursorAtHole() {
  const { x, z } = hole.state.position;
  if (input.state.relative) input.setTarget(x, z);
  else { const c = worldToClient(x, z); input.setCursor(c.x, c.y); }
}
input.onLockChange((locked) => {
  setPaused(!locked);
  if (screen === 'playing') audio.duck(!locked);
  if (screen === 'playing' && !nolock) { if (locked) pause.hide(); else pause.show(); }
  // On capture, zero the virtual cursor at the hole so it does not lurch toward the click point.
  if (locked) seedCursorAtHole();
});
setPaused(!nolock);
if (nolock) hintEl.textContent = 'nolock mode';

// --- Level lifecycle -------------------------------------------------------
let level = Math.min(LEVELS, Math.max(1, Number(params.get('level')) || 1));
let session = null;
let current = null; // generated level
let lastTick = -1;  // last whole second that ticked

// Level intro: "Ready?" then "Go!" over 1.5 s. Runs only while the mouse is captured, blocks
// movement and the clock, then the level starts.
const INTRO_TIME = 1.5;
let intro = 0;
let introPhase = null;
const introEl = document.getElementById('intro');
function setIntro(phase) {
  introPhase = phase;
  if (!phase) { introEl.hidden = true; return; }
  introEl.hidden = false;
  // Restart the CSS animation by replacing the span.
  const old = document.getElementById('intro-text');
  const span = document.createElement('span');
  span.id = 'intro-text';
  span.textContent = phase === 'ready' ? 'Ready?' : 'Go!';
  span.className = phase;
  old.replaceWith(span);
  if (phase === 'ready') audio.ready(); else audio.go();
}
const visuals = new Map(); // record id -> instanced visual handle
const fuses = createFuses(TNT);
const tntCandidates = [];
const sparkLocal = new THREE.Matrix4();
const sparkPos = new THREE.Vector3(), sparkPos2 = new THREE.Vector3(), sparkQuat = new THREE.Quaternion();
const tintColor = new THREE.Color();
// Charging tint: white at no charge toward amber at full.
function tintFor(charge) { return tintColor.set(0xffffff).lerp(new THREE.Color(0xffb040), 0.35 + 0.65 * charge).getHex(); }

function spawnAll(list) {
  for (const o of list) {
    const rec = physics.spawn(o);
    visuals.set(rec.id, objects.add(rec.id, o.visual));
  }
}
function despawn(rec) {
  const h = visuals.get(rec.id);
  if (h) objects.remove(rec.id, h);
  visuals.delete(rec.id);
}

// A menu opened from the pause screen keeps the level behind it; Escape goes back to it.
let menuFromPause = false;

function showMenu({ fromPause = false } = {}) {
  screen = 'menu';
  menuFromPause = fromPause;
  howto.hide();
  audio.duck(true);
  setIntro(null);
  input.release();
  pause.hide();
  endScreen.hide();
  hudEl.hidden = true;
  hintEl.hidden = true;
  menu.show();
}

// Back from the menu to the paused level it was opened over.
function backToPause() {
  screen = 'playing';
  menuFromPause = false;
  menu.hide();
  hudEl.hidden = false;
  hintEl.hidden = false;
  pause.show();
}

function startLevel(n = level) {
  level = n;
  screen = 'playing';
  menuFromPause = false;
  audio.setLevel(level);
  audio.duck(false);
  menu.hide();
  pause.hide();
  endScreen.hide();
  hudEl.hidden = false;
  hintEl.hidden = false;
  physics.clear();
  fuses.clear();
  objects.clear();
  particles.clear();
  visuals.clear();
  lastTick = -1;
  current = generateLevel(levelParams(level));
  side = current.side;
  view.fitSurface(side, { forceFollow: level >= CAMERA.followFromLevel });
  props.place(side, level);
  physics.setSurface(side);
  input.setMode({ relative: view.state.follow, unitsPerPixel: view.unitsPerPixel() });
  spawnAll(current.objects.map((o) => ({ ...spawnDescriptor(o), visual: visualFor(o.type) })));
  session = createSession({
    target: current.target,
    seconds: current.seconds,
    fruitCount: current.counts.fruit,
    thresholds: current.thresholds,
    accessible: current.accessible,
  });
  hole.state.position.set(0, 0, 0);
  if (input.state.locked || nolock) seedCursorAtHole();
  hole.state.radius = HOLE.startRadius;
  hole.setRadius(HOLE.startRadius);
  intro = INTRO_TIME;
  setIntro(null);
  refreshHud();
  // First level with no progress: explain the game before Ready / Go.
  if (level === 1 && !save.result(1)) howto.show(); else howto.hide();
}

function refreshHud() {
  const s = session.state;
  hud.set({ level, time: s.timeLeft, score: s.score, target: s.target, holeStep: session.holeStep, left: s.fruitLeft });
  hole.setProgress(milestoneProgress(s.score, s.thresholds));
  hole.setBomb(session.bombRemaining());
}

function endLevel() {
  screen = 'end';
  audio.duck(true);
  input.release();
  const st = session.state;
  const r = save.recordResult(level, { total: st.total, stars: st.stars, won: st.won, perfect: st.perfect });
  const note = st.won ? (r.newBest ? 'New best!' : '') : 'Reach the target to unlock the next level.';
  endScreen.show(st, st.won && level < LEVELS, note);
}

// ?level=N jumps straight in (testing); otherwise start at the menu.
if (params.has('level')) startLevel(level); else { startLevel(level); showMenu(); }

// Escape on the level menu returns to the pause menu it came from. M toggles the master mute.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && screen === 'menu' && menuFromPause && session && !session.state.ended) backToPause();
  if (e.key === 'm' || e.key === 'M') setMuted(!audio.muted);
});

// Debug keys: [ and ] fake a milestone / bomb. R restarts the level.
window.addEventListener('keydown', (e) => {
  if (!debug || !session) return;
  if (e.key === ']') session.state.milestones++;
  else if (e.key === '[') session.state.bombs++;
  else if (e.key === 'r') startLevel(level);
  else if (e.key === 'n') startLevel(Math.min(LEVELS, level + 1));
  else if (e.key === 'p') startLevel(Math.max(1, level - 1));
  refreshHud();
});

// --- Frame -----------------------------------------------------------------
const tmp = new THREE.Vector3();
let last = performance.now();
let fpsAcc = 0, fpsN = 0, fps = 0, physMs = 0;

function update(dt) {
  const s = session.state;
  const captured = (input.state.locked || nolock) && !howto.open;
  if (input.state.relative !== view.state.follow) { input.setMode({ relative: view.state.follow }); seedCursorAtHole(); }
  input.setMode({ unitsPerPixel: view.unitsPerPixel() });
  if (intro > 0 && captured && !s.ended) {
    intro -= dt;
    const phase = intro > INTRO_TIME / 2 ? 'ready' : intro > 0 ? 'go' : null;
    if (phase !== introPhase) setIntro(phase);
  }
  const running = captured && !s.ended && intro <= 0;
  const pos = hole.state.position;

  if (running) {
    session.tick(dt);
    // Hole chases the cursor: exponential approach, capped by max speed.
    // Clamp so the whole pit, rim included, stays on the table at the current (largest) radius.
    const reach = Math.max(hole.state.radius, hole.state.targetRadius) * RIM_SCALE + SURFACE.edgeMargin;
    const target = input.update(side / 2 - reach);
    tmp.subVectors(target, pos);
    const dist = tmp.length();
    if (dist > 1e-4) {
      const smooth = dist * (1 - Math.exp(-HOLE.smoothing * dt));
      const step = Math.min(smooth, holeSpeed(s.milestones) * dt, dist);
      pos.addScaledVector(tmp.normalize(), step);
    }
  }
  hole.setRadius(holeRadius(session.holeStep));
  hole.update(dt);
  view.setHole(pos, hole.state.radius);
  view.setFocus(pos.x, pos.z);

  // Physics: the collider uses the logical (target) radius immediately.
  physics.setHolePosition(pos.x, pos.z);
  physics.setHoleRadius(hole.state.targetRadius);
  const t0 = performance.now();
  const events = running ? physics.step(dt) : { swallowed: [], removed: [], lost: [] };
  physMs = performance.now() - t0;
  for (const rec of events.swallowed) {
    session.swallow(rec, { defused: fuses.isLit(rec.id) });
    fuses.forget(rec.id);
    particles.burst(pos.x, pos.z, hole.state.radius, colorFor(rec.type), rec.kind === 'bomb' ? 6 : 3 + 1 * (rec.tier === 'L'), rec.kind === 'bomb' ? 1.6 : 1);
  }
  for (const rec of events.lost) { session.lose(rec); fuses.forget(rec.id); despawn(rec); }
  for (const rec of events.removed) despawn(rec);

  // TNT fuses: arm when the hole lingers within TNT.reach hole widths of a stick, burn, blow.
  if (running) {
    tntCandidates.length = 0;
    const reach = hole.state.radius * (1 + 2 * TNT.reach);
    for (const rec of physics.records.values()) {
      if (rec.swallowed || !rec.penalty?.blast) continue;
      const d = Math.hypot(rec.px - pos.x, rec.pz - pos.z) - rec.size.r;
      tntCandidates.push({ id: rec.id, near: d <= reach });
    }
    for (const ev of fuses.update(dt, tntCandidates)) {
      const rec = physics.records.get(ev.id);
      if (!rec) continue;
      if (ev.type === 'lit') audio.hiss();
      else if (ev.type === 'detonate') {
        const b = rec.penalty.blast;
        physics.blast(rec.px, rec.pz, b.radius, b.strength);
        particles.explode(rec.px, rec.pz, b.radius);
        audio.tnt();
        view.shakeCamera(2.6);
        despawn(rec);
        physics.remove(rec);
        // Chain: any other stick within TNT.chain zones of the blast lights up.
        let chained = false;
        for (const other of physics.records.values()) {
          if (other === rec || other.swallowed || !other.penalty?.blast) continue;
          const d = Math.hypot(other.px - rec.px, other.pz - rec.pz) - other.size.r;
          if (d <= reach * TNT.chain && fuses.light(other.id)) chained = true;
        }
        if (chained) audio.hiss();
      }
    }
  }
  // In the zone: the stick flashes, harder as the charge builds, and fades as it cools.
  for (const id of fuses.chargingIds) {
    const h = visuals.get(id);
    if (!h) continue;
    const ch = fuses.charge(id);
    const on = (s.clock % 0.36) < 0.18;
    objects.setPartColor(h, 0, on ? 0xffffff : tintFor(ch));
  }
  // Lit: faster flashing, and the spark slides down the fuse throwing sparks.
  for (const id of fuses.litIds) {
    const rec = physics.records.get(id);
    const h = visuals.get(id);
    if (!h || !rec) continue;
    const left = fuses.fuseLeft(id);
    const k = left / TNT.fuseSeconds; // 1 -> 0
    const period = 0.1 + 0.4 * k;
    const on = ((TNT.fuseSeconds - left) % period) < period * 0.5;
    objects.setPartColor(h, 0, on ? 0xffffff : 0xffb040);
    // Fuse geometry: base on the stick top, tip 0.153 out and 0.281 up (see fuseGeo).
    const hh = rec.size.hh;
    sparkLocal.makeTranslation(0.153 * k, hh + 0.281 * k + 0.02, 0);
    objects.setPartLocal(h, 2, sparkLocal);
    if (running && Math.random() < 0.9) {
      const t = rec.body.translation(), q = rec.body.rotation();
      sparkPos.set(0.153 * k, hh + 0.281 * k + 0.05, 0).applyQuaternion(sparkQuat.set(q.x, q.y, q.z, q.w)).add(sparkPos2.set(t.x, t.y, t.z));
      particles.spray(sparkPos.x, sparkPos.y, sparkPos.z, Math.random() < 0.5 ? 0xffd36a : 0xff8a2a, 1, 1.6);
    }
  }
  // Countdown ticks under 10 s.
  if (running && s.timeLeft < 10) {
    const whole = Math.ceil(s.timeLeft);
    if (whole !== lastTick) { lastTick = whole; audio.tick(); }
  }

  physics.forEachMoving((rec, t, q) => objects.setTransform(rec.id, visuals.get(rec.id), t, q));
  objects.commit();
  particles.update(dt);
  view.update(dt);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  view.render();

  if (debug) {
    const pos = hole.state.position;
    const s = session.state;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    const st = physics.stats();
    debugEl.textContent =
      `fps ${fps}  phys ${physMs.toFixed(1)}ms\nbodies ${st.bodies} awake ${st.awake}\n` +
      `hole r=${hole.state.radius.toFixed(2)} target=${hole.state.targetRadius.toFixed(2)} step ${session.holeStep} (m${s.milestones} b${s.bombs})\n` +
      `pos ${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}\nspeed ${holeSpeed(s.milestones).toFixed(1)}\nside ${side}\n` +
      `level ${level}/${LEVELS}  objects ${current.counts.total} bombs ${current.counts.bombs}  grow at ${s.thresholds.join('/')}\n[ ] milestone/bomb   r restart   n/p next/prev   ?level=N`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for automation: drive the cursor and step time from the console.
if (debug) {
  window.holepunch = {
    get session() { return session; },
    hole, physics, objects, input, view, audio, particles, fuses,
    setCursor(clientX, clientY) { input.setCursor(clientX, clientY); },
    setHoleStep(n) { session.state.milestones = n; session.state.bombs = 0; refreshHud(); },
    worldToClient,
    // Aim the hole at a world point on the table.
    aim(x, z) { if (input.state.relative) input.setTarget(x, z); else { const c = worldToClient(x, z); input.setCursor(c.x, c.y); } },
    reload: () => startLevel(level),
    startLevel,
    get current() { return current; },
    // Run the game for N seconds in fixed steps, then render once. For throttled tabs.
    advance(seconds) { for (let i = 0; i < seconds * 60; i++) update(1 / 60); view.render(); },
  };
}
