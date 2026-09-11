import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { withPitDarkening } from './objects.js';

// Procedural low-poly fruit, crates, and the bomb. Each visual is a list of instanced parts
// with a local matrix relative to the physics body. Geometry factories are cached per part
// key by the object renderer, so they run once.

// Paper: matte, flat-shaded so the low-poly facets read as folds.
const plain = withPitDarkening(new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }));
const matte = withPitDarkening(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }));
const shiny = withPitDarkening(new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }));

// Watermelon stripes: dark/light green bands around the local Y axis.
const melonMat = withPitDarkening(new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }));
const melonBase = melonMat.onBeforeCompile;
melonMat.onBeforeCompile = (shader) => {
  melonBase(shader);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float ang = atan(vLocal.z, vLocal.x);
        float wob = sin(vLocal.y * 9.0) * 0.12;
        float band = step(0.5, fract((ang + wob) * 12.0 / 6.28318));
        diffuseColor.rgb = mix(vec3(0.12, 0.42, 0.16), vec3(0.45, 0.75, 0.30), band);
      }`);
};

// Cardboard for crates: tan board, a fold line, a strip of tape.
function cardboardTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a674';
  g.fillRect(0, 0, 128, 128);
  // Faint corrugation.
  g.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let y = 0; y < 128; y += 6) g.fillRect(0, y, 128, 2);
  // Flap fold across the middle and a border where the faces meet.
  g.strokeStyle = '#8f6f45';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  g.lineWidth = 5;
  g.strokeRect(2, 2, 124, 124);
  // Tape strip.
  g.fillStyle = 'rgba(236, 224, 196, 0.9)';
  g.fillRect(50, 0, 28, 128);
  g.strokeStyle = 'rgba(150, 125, 85, 0.5)';
  g.lineWidth = 1;
  g.strokeRect(50.5, 0, 27, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const woodMat = withPitDarkening(new THREE.MeshStandardMaterial({ roughness: 1, map: cardboardTexture() }));

const m4 = (pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );

const part = (key, geometry, material, color, local = m4()) => ({ key, geometry, material, color, local });

// Geometry factories.
const sphere = (r, w = 12, h = 8) => () => new THREE.SphereGeometry(r, w, h); // coarse: paper facets
const box = (s) => () => new THREE.BoxGeometry(s, s, s);

function stemGeo() { return new THREE.CylinderGeometry(0.03, 0.045, 0.28, 6); }
function leafGeo() {
  const g = new THREE.SphereGeometry(0.16, 8, 6);
  g.scale(1, 0.25, 0.55);
  return g;
}
// Banana: a torus arc whose chord runs along local Y (the capsule axis). The arc, its end
// points, and the stem all come from one parameterisation so the tips land on the ends.
const BANANA = (() => {
  const R = 0.75, arc = 1.5;
  // Chord from angle 0 to arc; rotate it onto +Y.
  const chordAngle = Math.atan2(Math.sin(arc), Math.cos(arc) - 1);
  const rot = Math.PI / 2 - chordAngle;
  const end = (a) => new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rot);
  const e0 = end(0), e1 = end(arc);
  const mid = e0.clone().add(e1).multiplyScalar(0.5);
  // The arc's bounding-box centre is what center() would remove; use the chord midpoint
  // instead so the tips and the body share one offset.
  return { R, arc, rot, e0: e0.sub(mid), e1: e1.sub(mid), mid };
})();
function bananaGeo() {
  const g = new THREE.TorusGeometry(BANANA.R, 0.2, 8, 14, BANANA.arc);
  g.rotateZ(BANANA.rot);
  g.translate(-BANANA.mid.x, -BANANA.mid.y, -BANANA.mid.z);
  return g;
}
function bananaTipsGeo() {
  const tip = (p, r) => { const s = new THREE.SphereGeometry(r, 7, 5); s.translate(p.x, p.y, p.z); return s; };
  // Stem: a short stub continuing the arc past one end.
  const dir = BANANA.e0.clone().sub(BANANA.e1).normalize();
  const stem = new THREE.CylinderGeometry(0.07, 0.1, 0.3, 6);
  stem.rotateZ(-Math.atan2(dir.x, dir.y));
  stem.translate(BANANA.e0.x + dir.x * 0.12, BANANA.e0.y + dir.y * 0.12, 0);
  return mergeGeometries([tip(BANANA.e0, 0.15), tip(BANANA.e1, 0.13), stem]);
}
function pineappleBodyGeo() {
  const g = new THREE.CylinderGeometry(0.5, 0.58, 1.4, 12, 1);
  return g;
}
function pineappleCrownGeo() {
  const leaves = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const leaf = new THREE.ConeGeometry(0.12, 0.7, 5);
    leaf.translate(0, 0.35, 0);
    const tilt = 0.35 + (i % 2) * 0.25;
    leaf.rotateX(tilt);
    leaf.rotateY((i / n) * Math.PI * 2);
    leaves.push(leaf);
  }
  return mergeGeometries(leaves);
}
// Pumpkin: a ring of tall lobes around a core, so the silhouette is ribbed from every side.
function pumpkinGeo() {
  const parts = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const lobe = new THREE.SphereGeometry(0.62, 10, 8);
    lobe.scale(1, 2.0, 1);
    const a = (i / n) * Math.PI * 2;
    lobe.translate(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
    parts.push(lobe);
  }
  const core = new THREE.SphereGeometry(1.1, 12, 9);
  core.scale(0.95, 1.1, 0.95);
  parts.push(core);
  return mergeGeometries(parts);
}
function pumpkinStemGeo() {
  const g = new THREE.CylinderGeometry(0.1, 0.16, 0.45, 6);
  g.translate(0, 0.2, 0);
  g.rotateZ(0.25);
  return g;
}
function pearGeo() {
  const base = new THREE.SphereGeometry(0.45, 12, 9);
  base.translate(0, -0.05, 0);
  const top = new THREE.SphereGeometry(0.3, 10, 8);
  top.translate(0, 0.28, 0);
  return mergeGeometries([base, top]);
}
function lemonGeo() {
  const g = new THREE.SphereGeometry(0.46, 12, 8);
  g.scale(1.2, 0.85, 0.85);
  const a = new THREE.SphereGeometry(0.1, 6, 5); a.translate(0.56, 0, 0);
  const b = new THREE.SphereGeometry(0.1, 6, 5); b.translate(-0.56, 0, 0);
  return mergeGeometries([g, a, b]);
}
function strawberryGeo() {
  const g = new THREE.SphereGeometry(0.25, 10, 8);
  g.scale(0.95, 1.15, 0.95);
  g.translate(0, -0.03, 0);
  return g;
}
function calyxGeo() {
  const leaves = [];
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.ConeGeometry(0.05, 0.18, 4);
    leaf.translate(0, 0.09, 0);
    leaf.rotateX(1.25);
    leaf.rotateY((i / 5) * Math.PI * 2);
    leaves.push(leaf);
  }
  return mergeGeometries(leaves);
}
function kiwiGeo() {
  const g = new THREE.SphereGeometry(0.25, 10, 7);
  g.scale(1.15, 0.9, 0.9);
  return g;
}

// TNT: a red paper stick with a label band wrapped around it. The texture wraps once around
// the cylinder, so the label reads on the side; the caps get plain red.
function tntTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c83a2e';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let y = 0; y < 128; y += 6) g.fillRect(0, y, 256, 2);
  g.fillStyle = '#7a1f17';
  g.fillRect(0, 0, 256, 6); g.fillRect(0, 122, 256, 6);
  g.fillStyle = '#f6efe0';
  g.fillRect(0, 44, 256, 40);
  g.fillStyle = '#2b2823';
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('TNT', 64, 65);
  g.fillText('TNT', 192, 65);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const tntMat = withPitDarkening(new THREE.MeshStandardMaterial({ roughness: 1, map: tntTexture() }));
const tntStick = (r, hh) => () => new THREE.CylinderGeometry(r, r, hh * 2, 14, 1);

function fuseGeo() {
  const g = new THREE.CylinderGeometry(0.03, 0.03, 0.32, 5);
  g.translate(0, 0.16, 0);
  g.rotateZ(-0.5);
  return g;
}

const VISUALS = {
  blueberry: () => ({ parts: [
    part('sphere25', sphere(0.25, 10, 7), shiny, 0x3b4fd8),
    part('berryCrown', () => { const g = new THREE.CylinderGeometry(0.07, 0.09, 0.05, 5); g.translate(0, 0.24, 0); return g; }, matte, 0x25306e),
  ] }),
  grape: () => ({ parts: [
    part('sphere25', sphere(0.25, 10, 7), shiny, 0x7d3fb0, m4([0, 0, 0], [0, 0, 0], [0.92, 1.0, 0.92])),
  ] }),
  apple: () => ({ parts: [
    part('sphere50', sphere(0.5), plain, 0xd8322a, m4([0, 0, 0], [0, 0, 0], [1, 0.94, 1])),
    part('stem', stemGeo, matte, 0x5a3a1e, m4([0, 0.55, 0])),
    part('leaf', leafGeo, plain, 0x4caf50, m4([0.14, 0.58, 0], [0, 0, -0.5])),
  ] }),
  orange: () => ({ parts: [
    part('sphere50', sphere(0.5), matte, 0xff8c1a),
    part('nub', () => new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6), matte, 0x3f7f2a, m4([0, 0.5, 0])),
  ] }),
  banana: () => ({ parts: [
    part('banana', bananaGeo, plain, 0xf5d33a),
    part('bananaTips', bananaTipsGeo, matte, 0x6b4a1a),
  ] }),
  watermelon: () => ({ parts: [
    part('melon', sphere(1.0, 16, 11), melonMat, 0xffffff, m4([0, 0, 0], [0, 0, 0], [1, 1, 1])),
  ] }),
  pineapple: () => ({ parts: [
    part('pineBody', pineappleBodyGeo, matte, 0xd9a23b, m4([0, -0.05, 0])),
    part('pineCrown', pineappleCrownGeo, plain, 0x3f8f3a, m4([0, 0.65, 0])),
  ] }),
  kiwi: () => ({ parts: [part('kiwi', kiwiGeo, matte, 0x8a6a3c)] }),
  strawberry: () => ({ parts: [
    part('strawberry', strawberryGeo, plain, 0xe23c4a),
    part('calyx', calyxGeo, plain, 0x3f8f3a, m4([0, 0.22, 0])),
  ] }),
  pear: () => ({ parts: [
    part('pear', pearGeo, plain, 0xb9c94a),
    part('stem', stemGeo, matte, 0x5a3a1e, m4([0, 0.62, 0])),
  ] }),
  lemon: () => ({ parts: [part('lemon', lemonGeo, plain, 0xf2e13a)] }),
  pumpkin: () => ({ parts: [
    part('pumpkin', pumpkinGeo, plain, 0xe8862b),
    part('pumpkinStem', pumpkinStemGeo, matte, 0x5f7a2e, m4([0, 1.2, 0])),
  ] }),
  crateS: () => ({ parts: [part('box50', box(0.5), woodMat, 0xffffff)] }),
  crateM: () => ({ parts: [part('box100', box(1.0), woodMat, 0xffffff)] }),
  crateL: () => ({ parts: [part('box200', box(2.0), woodMat, 0xffffff)] }),
  crateX: () => ({ parts: [part('box260', box(2.6), woodMat, 0xffffff)] }),
  bombS: () => ({ parts: [
    part('sphere25', sphere(0.25, 10, 7), matte, 0x1f1d1a),
    part('fuseS', () => { const g = new THREE.CylinderGeometry(0.02, 0.02, 0.18, 5); g.translate(0, 0.09, 0); g.rotateZ(-0.5); return g; }, matte, 0xd9c9a0, m4([0.05, 0.2, 0])),
    part('spark', sphere(0.07, 8, 6), plain, 0xffa33a, m4([0.14, 0.38, 0])),
  ] }),
  tntM: () => ({ parts: [
    part('tntStickM', tntStick(0.5, 0.5), tntMat, 0xffffff),
    part('fuse', fuseGeo, matte, 0xd9c9a0, m4([0.0, 0.5, 0])),
    part('spark', sphere(0.07, 8, 6), plain, 0xffa33a, m4([0.16, 0.8, 0])),
  ] }),
  tntL: () => ({ parts: [
    part('tntStickL', tntStick(1.0, 1.0), tntMat, 0xffffff),
    part('fuse', fuseGeo, matte, 0xd9c9a0, m4([0.0, 1.0, 0])),
    part('spark', sphere(0.07, 8, 6), plain, 0xffa33a, m4([0.16, 1.3, 0])),
  ] }),
  bomb: () => ({ parts: [
    part('sphere50', sphere(0.5), matte, 0x1f1d1a),
    part('fuse', fuseGeo, matte, 0xd9c9a0, m4([0.08, 0.42, 0])),
    part('spark', sphere(0.07, 8, 6), plain, 0xffa33a, m4([0.24, 0.72, 0])),
  ] }),
};

const cache = new Map();
export function visualFor(type) {
  let v = cache.get(type);
  if (!v) {
    v = VISUALS[type]();
    cache.set(type, v);
  }
  return v;
}

// Representative color per type, for particles.
const COLORS = {
  blueberry: 0x3b4fd8, grape: 0x7d3fb0, apple: 0xd8322a, orange: 0xff8c1a, banana: 0xf5d33a,
  watermelon: 0x4caf50, pineapple: 0xd9a23b, crateS: 0xc9a674, crateM: 0xc9a674, crateL: 0xc9a674,
  bomb: 0x444444,
};
export function colorFor(type) { return COLORS[type] ?? 0xffffff; }
