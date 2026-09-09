import * as THREE from 'three';

// Tracks the pointer and projects it onto the Y=0 plane. Result is clamped to the surface.
// Click toggles pointer lock. While locked, a virtual cursor in client pixels is driven by
// movementX/Y and clamped to the canvas, so the real cursor can never reach a screen corner.
export function createInput(canvas, camera, { requireLock = true } = {}) {
  const px = { x: 0, y: 0 }; // virtual cursor, client pixels
  const ndc = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const state = { target: new THREE.Vector3(), active: false, locked: false, requireLock,
    // Relative mode (follow camera): mouse deltas move the world target directly, scaled by
    // unitsPerPixel, because a fixed screen point maps to a moving table point.
    relative: false, unitsPerPixel: 0.02 };
  const world = new THREE.Vector3(); // relative-mode target
  const listeners = new Set();

  function updateNdc() {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((px.x - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((px.y - rect.top) / rect.height) * 2 + 1;
  }

  canvas.addEventListener('pointermove', (e) => {
    if (state.relative) {
      world.x += e.movementX * state.unitsPerPixel;
      world.z += e.movementY * state.unitsPerPixel; // screen down = toward the camera (+z)
      state.active = true;
      return;
    }
    if (state.locked) {
      const rect = canvas.getBoundingClientRect();
      px.x = THREE.MathUtils.clamp(px.x + e.movementX, rect.left, rect.right);
      px.y = THREE.MathUtils.clamp(px.y + e.movementY, rect.top, rect.bottom);
    } else {
      px.x = e.clientX;
      px.y = e.clientY;
    }
    state.active = true;
    updateNdc();
  });
  canvas.addEventListener('pointerleave', () => { if (!state.locked) state.active = false; });
  // The virtual cursor is re-seeded by the game when the lock engages (see main.js), so the
  // hole stays put until the mouse actually moves.

  function capture() {
    if (!requireLock || state.locked) return;
    // unadjustedMovement skips OS acceleration where supported; ignored elsewhere.
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => canvas.requestPointerLock());
  }
  function release() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  canvas.addEventListener('click', () => {
    if (!requireLock) return;
    if (state.locked) release(); else capture();
  });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    listeners.forEach((fn) => fn(state.locked));
  });
  document.addEventListener('pointerlockerror', () => {
    state.locked = false;
    listeners.forEach((fn) => fn(false));
  });

  function update(halfExtent) {
    if (state.relative) {
      world.x = THREE.MathUtils.clamp(world.x, -halfExtent, halfExtent);
      world.z = THREE.MathUtils.clamp(world.z, -halfExtent, halfExtent);
      state.target.copy(world);
      return state.target;
    }
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) {
      hit.x = THREE.MathUtils.clamp(hit.x, -halfExtent, halfExtent);
      hit.z = THREE.MathUtils.clamp(hit.z, -halfExtent, halfExtent);
      hit.y = 0;
      state.target.copy(hit);
    }
    return state.target;
  }

  function onLockChange(fn) { listeners.add(fn); }

  // Programmatic cursor for automation (debug handle).
  function setCursor(clientX, clientY) {
    px.x = clientX; px.y = clientY; state.active = true; updateNdc();
  }
  // Seed the world target (relative mode) so the hole does not jump.
  function setTarget(x, z) { world.set(x, 0, z); state.target.copy(world); }
  function setMode({ relative, unitsPerPixel }) {
    if (relative !== undefined) state.relative = relative;
    if (unitsPerPixel !== undefined) state.unitsPerPixel = unitsPerPixel;
  }

  return { state, update, onLockChange, setCursor, setTarget, setMode, capture, release };
}
