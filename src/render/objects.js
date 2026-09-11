import * as THREE from 'three';
import { HOLE } from '../config.js';

// Instanced rendering for physics objects. A visual is a list of parts; each part is drawn
// from one InstancedMesh pool keyed by geometry+material. Parts carry a local offset matrix
// relative to the body (stems, crowns, fuses). Instances are removed with swap-remove so the
// active range stays dense.
const CAPACITY = 1200;

export function createObjects(scene) {
  const pools = new Map(); // key -> { mesh, count, keys: [], index: Map(slotKey -> slot) }
  const tmpM = new THREE.Matrix4();
  const tmpBody = new THREE.Matrix4();
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const tmpC = new THREE.Color();

  function pool(part) {
    let p = pools.get(part.key);
    if (p) return p;
    const mesh = new THREE.InstancedMesh(part.geometry(), part.material, CAPACITY);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // three.js computes an InstancedMesh bounding sphere once, from the instances present at
    // the first render, and never refreshes it. With a zoomed follow camera a whole pool then
    // vanishes when that stale sphere leaves the frustum. Pools are always drawn instead.
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    p = { mesh, count: 0, keys: [], index: new Map() };
    pools.set(part.key, p);
    return p;
  }

  // visual: { parts: [{ key, geometry: () => BufferGeometry, material, local: Matrix4, color }] }
  function add(id, visual) {
    const parts = visual.parts.map((part, i) => {
      const p = pool(part);
      if (p.count >= CAPACITY) throw new Error(`pool ${part.key} full`);
      const slotKey = `${id}:${i}`;
      const slot = p.count++;
      p.keys[slot] = slotKey;
      p.index.set(slotKey, slot);
      p.mesh.count = p.count;
      tmpC.set(part.color ?? 0xffffff);
      p.mesh.setColorAt(slot, tmpC);
      p.mesh.instanceColor.needsUpdate = true;
      return { pool: p, slotKey, local: part.local };
    });
    return { parts };
  }

  function removeSlot(p, slotKey) {
    const slot = p.index.get(slotKey);
    if (slot === undefined) return;
    const last = p.count - 1;
    if (slot !== last) {
      const lastKey = p.keys[last];
      p.mesh.getMatrixAt(last, tmpM);
      p.mesh.setMatrixAt(slot, tmpM);
      p.mesh.getColorAt(last, tmpC);
      p.mesh.setColorAt(slot, tmpC);
      p.keys[slot] = lastKey;
      p.index.set(lastKey, slot);
    }
    p.keys.length = last;
    p.index.delete(slotKey);
    p.count = last;
    p.mesh.count = last;
    p.mesh.instanceMatrix.needsUpdate = true;
    p.mesh.instanceColor.needsUpdate = true;
  }

  function remove(id, handle) {
    for (const part of handle.parts) removeSlot(part.pool, part.slotKey);
  }

  // Replace one part's local matrix for this instance only (a spark sliding down a fuse).
  function setPartLocal(handle, index, matrix) {
    const part = handle.parts[index];
    if (part) part.local = matrix;
  }

  // Tint one part of an instance (used for the lit-TNT flash). Instance colors multiply the
  // material color, so tints can only darken or shift, never brighten past the base.
  function setPartColor(handle, index, color) {
    const part = handle.parts[index];
    if (!part) return;
    const slot = part.pool.index.get(part.slotKey);
    if (slot === undefined) return;
    tmpC.set(color);
    part.pool.mesh.setColorAt(slot, tmpC);
    part.pool.mesh.instanceColor.needsUpdate = true;
  }

  function setTransform(id, handle, t, q) {
    tmpP.set(t.x, t.y, t.z);
    tmpQ.set(q.x, q.y, q.z, q.w);
    tmpBody.compose(tmpP, tmpQ, unit);
    for (const part of handle.parts) {
      const slot = part.pool.index.get(part.slotKey);
      if (slot === undefined) continue;
      tmpM.multiplyMatrices(tmpBody, part.local);
      part.pool.mesh.setMatrixAt(slot, tmpM);
    }
  }

  function commit() {
    for (const p of pools.values()) p.mesh.instanceMatrix.needsUpdate = true;
  }

  function clear() {
    for (const p of pools.values()) {
      p.count = 0; p.mesh.count = 0; p.keys.length = 0; p.index.clear();
    }
  }

  return { add, remove, setTransform, setPartColor, setPartLocal, commit, clear };
}

// Shared "darken below the table" treatment for any object material.
export function withPitDarkening(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDarkDepth = { value: HOLE.darkDepth };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;\nuniform float uDarkDepth;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= clamp(1.0 + vWorldY / uDarkDepth, 0.0, 1.0);');
  };
  return mat;
}
