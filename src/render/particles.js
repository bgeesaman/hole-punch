import * as THREE from 'three';

// Small CPU particle pool for swallow bursts: confetti scraps that tumble as they fly.
const MAX = 300;

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
  let alive = 0;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const e = new THREE.Euler();
  const c = new THREE.Color();

  // Ring of scraps around the hole lip, flung up and outward.
  function burst(x, z, radius, color, count = 14, strength = 1) {
    for (let k = 0; k < count && alive < MAX; k++) {
      const i = alive++;
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.7 + Math.random() * 0.4);
      pos[i * 3] = x + Math.cos(a) * r;
      pos[i * 3 + 1] = 0.05;
      pos[i * 3 + 2] = z + Math.sin(a) * r;
      const out = (1.5 + Math.random() * 2) * strength;
      vel[i * 3] = Math.cos(a) * out;
      vel[i * 3 + 1] = (3 + Math.random() * 4) * strength;
      vel[i * 3 + 2] = Math.sin(a) * out;
      for (let d = 0; d < 3; d++) {
        rot[i * 3 + d] = Math.random() * Math.PI * 2;
        spin[i * 3 + d] = (Math.random() * 2 - 1) * 18;
      }
      ttl[i] = life[i] = 0.22 + Math.random() * 0.18;
      size[i] = 0.7 + Math.random() * 0.9;
      c.set(color);
      mesh.setColorAt(i, c);
    }
    mesh.instanceColor.needsUpdate = true;
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
          life[i] = life[j]; ttl[i] = ttl[j]; size[i] = size[j];
          mesh.getColorAt(j, c); mesh.setColorAt(i, c);
        }
        i--;
        continue;
      }
      vel[i * 3 + 1] -= 10 * dt; // paper: falls a little slower than the old specks
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      for (let d = 0; d < 3; d++) rot[i * 3 + d] += spin[i * 3 + d] * dt;
      const t = life[i] / ttl[i];
      p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      e.set(rot[i * 3], rot[i * 3 + 1], rot[i * 3 + 2]);
      q.setFromEuler(e);
      s.setScalar(size[i] * Math.min(1, t * 2)); // hold size, shrink out over the last half
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.count = alive;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function clear() { alive = 0; mesh.count = 0; }

  return { burst, update, clear };
}
