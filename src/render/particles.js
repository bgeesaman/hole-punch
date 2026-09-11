import * as THREE from 'three';

// Small CPU particle pool: paper scraps that tumble as they fly, plus grey smoke puffs that
// drift up and swell. One InstancedMesh of quads; per-particle gravity and growth.
const MAX = 700;

export function createParticles(scene) {
  const geo = new THREE.PlaneGeometry(0.17, 0.11);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);

  const pos = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const rot = new Float32Array(MAX * 3);   // euler angles
  const spin = new Float32Array(MAX * 3);  // angular rates
  const life = new Float32Array(MAX);      // remaining seconds
  const ttl = new Float32Array(MAX);       // total
  const size = new Float32Array(MAX);
  const grav = new Float32Array(MAX);      // downward acceleration
  const grow = new Float32Array(MAX);      // 0: shrink out over the last half; 1: swell then shrink
  let alive = 0;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const e = new THREE.Euler();
  const c = new THREE.Color();

  function emit(x, y, z, vx, vy, vz, color, t, sz, g = 10, gr = 0) {
    if (alive >= MAX) return;
    const i = alive++;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    for (let d = 0; d < 3; d++) {
      rot[i * 3 + d] = Math.random() * Math.PI * 2;
      spin[i * 3 + d] = (Math.random() * 2 - 1) * 18;
    }
    ttl[i] = life[i] = t;
    size[i] = sz;
    grav[i] = g;
    grow[i] = gr;
    c.set(color);
    mesh.setColorAt(i, c);
    mesh.instanceColor.needsUpdate = true;
  }

  // Ring of scraps around the hole lip, flung up and outward.
  function burst(x, z, radius, color, count = 14, strength = 1) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.7 + Math.random() * 0.4);
      const out = (1.5 + Math.random() * 2) * strength;
      emit(x + Math.cos(a) * r, 0.05, z + Math.sin(a) * r,
        Math.cos(a) * out, (3 + Math.random() * 4) * strength, Math.sin(a) * out,
        color, 0.22 + Math.random() * 0.18, 0.7 + Math.random() * 0.9);
    }
  }

  // Sparks from a point (a burning fuse): tiny, quick, bright.
  function spray(x, y, z, color = 0xffd36a, count = 2, speed = 2) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, up = 0.3 + Math.random() * 0.7;
      emit(x, y, z, Math.cos(a) * speed * (0.3 + Math.random()), speed * up * 1.5, Math.sin(a) * speed * (0.3 + Math.random()),
        color, 0.18 + Math.random() * 0.2, 0.25 + Math.random() * 0.3, 12);
    }
  }

  // Explosion: a wide burst of scraps in fire colours, then a smoke cloud that rises and
  // swells and hangs around for a couple of seconds.
  const FIRE = [0xff4a2a, 0xff8a2a, 0xffc23a, 0xfff0a0, 0xc83a2e];
  const SMOKE = [0x5a5652, 0x6f6a65, 0x87827c, 0x9d9791];
  function explode(x, z, radius) {
    for (let k = 0; k < 46; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * 0.25 * Math.random();
      const out = 4 + Math.random() * 7;
      emit(x + Math.cos(a) * r, 0.2 + Math.random() * 0.6, z + Math.sin(a) * r,
        Math.cos(a) * out, 4 + Math.random() * 8, Math.sin(a) * out,
        FIRE[Math.floor(Math.random() * FIRE.length)], 0.5 + Math.random() * 0.6, 1.2 + Math.random() * 1.6, 12);
    }
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * 0.35 * Math.random();
      const out = 0.6 + Math.random() * 1.6;
      emit(x + Math.cos(a) * r, 0.3 + Math.random() * 1.2, z + Math.sin(a) * r,
        Math.cos(a) * out, 1.2 + Math.random() * 2.2, Math.sin(a) * out,
        SMOKE[Math.floor(Math.random() * SMOKE.length)], 1.3 + Math.random() * 1.2, 5 + Math.random() * 7, -0.6, 1);
    }
  }

  function swap3(arr, i, j) {
    for (let k = 0; k < 3; k++) arr[i * 3 + k] = arr[j * 3 + k];
  }

  function update(dt) {
    for (let i = 0; i < alive; i++) {
      life[i] -= dt;
      if (life[i] <= 0) {
        // swap-remove
        const j = --alive;
        if (i !== j) {
          swap3(pos, i, j); swap3(vel, i, j); swap3(rot, i, j); swap3(spin, i, j);
          life[i] = life[j]; ttl[i] = ttl[j]; size[i] = size[j]; grav[i] = grav[j]; grow[i] = grow[j];
          mesh.getColorAt(j, c); mesh.setColorAt(i, c);
        }
        i--;
        continue;
      }
      vel[i * 3 + 1] -= grav[i] * dt;
      // Smoke slows as it rises.
      if (grow[i] > 0) { vel[i * 3] *= 1 - 1.5 * dt; vel[i * 3 + 2] *= 1 - 1.5 * dt; }
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const spinScale = grow[i] > 0 ? 0.15 : 1;
      for (let d = 0; d < 3; d++) rot[i * 3 + d] += spin[i * 3 + d] * dt * spinScale;
      const t = life[i] / ttl[i]; // 1 -> 0
      let k;
      if (grow[i] > 0) k = Math.sin(Math.PI * Math.min(1, (1 - t) * 1.15)) * (0.6 + 0.4 * (1 - t)); // swell, then shrink away
      else k = Math.min(1, t * 2); // hold size, shrink out over the last half
      p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      e.set(rot[i * 3], rot[i * 3 + 1], rot[i * 3 + 2]);
      q.setFromEuler(e);
      s.setScalar(Math.max(0.001, size[i] * k));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.count = alive;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function clear() { alive = 0; mesh.count = 0; }

  return { burst, spray, explode, update, clear };
}
