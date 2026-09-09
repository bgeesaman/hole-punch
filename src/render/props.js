import * as THREE from 'three';
import { SURFACE } from '../config.js';
import { mulberry32 } from '../game/generator.js';

// Desk dressing around the board: glue, scissors, craft knives, a pencil, paper scraps. All
// procedural, flat-shaded, at desk scale (a fruit is a few centimetres of paper; the board is
// about 80 cm). Placement is relative to the board edge and reseeded per level.
const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
// Low metalness: with no environment map a metallic surface renders nearly black.
const metal = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2, flatShading: true });

function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Flat things are built in the XY plane (length along +Y, thickness along +Z) and laid down.
function layFlat(group, lift = 0) {
  group.rotation.x = -Math.PI / 2;
  group.position.y = lift;
  return group;
}

function glueBottle() {
  const g = new THREE.Group();
  const white = flat(0xf4f2ea);
  const orange = flat(0xe8862b);
  g.add(mesh(new THREE.CylinderGeometry(0.75, 0.8, 2.6, 12), white, [0, 1.3, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.82, 0.82, 1.2, 12, 1, true, 0.3, Math.PI * 1.7), orange, [0, 1.25, 0])); // label
  g.add(mesh(new THREE.CylinderGeometry(0.35, 0.75, 0.5, 12), white, [0, 2.85, 0]));
  g.add(mesh(new THREE.ConeGeometry(0.34, 1.0, 10), orange, [0, 3.6, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 6), orange, [0, 4.2, 0]));
  return g;
}

function bladeShape(w, len, tip = 0.15) {
  const s = new THREE.Shape();
  s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w * 0.35, len - tip); s.lineTo(0, len); s.lineTo(-w * 0.35, len - tip);
  s.closePath();
  return s;
}
const extrude = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });

function scissors() {
  const g = new THREE.Group();
  const steel = metal(0xd2d6da);
  const grip = flat(0xd64545);
  const open = 0.2; // half the opening angle
  // Each half is one rigid piece: blade above the pivot, shank and bow below it. Rotating the
  // half about the pivot opens the blades one way and the bows the other, as real scissors do.
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.add(mesh(extrude(bladeShape(0.24, 4.4), 0.07), steel, [side * 0.04, 0.1, 0]));
    half.add(mesh(new THREE.BoxGeometry(0.22, 1.2, 0.08), steel, [side * 0.14, -0.55, 0.035], [0, 0, side * 0.2]));
    const bow = mesh(new THREE.TorusGeometry(0.42, 0.13, 8, 18), grip, [side * 0.5, -1.8, 0.035]);
    bow.scale.set(1, 1.5, 1);
    bow.rotation.z = side * 0.3;
    half.add(bow);
    half.rotation.z = side * open;
    half.position.z = side > 0 ? 0.08 : 0;
    g.add(half);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.24, 8), metal(0x9a9fa4), [0, 0, 0.08], [Math.PI / 2, 0, 0]));
  return layFlat(g, 0.02);
}

function craftKnife() {
  const g = new THREE.Group();
  const alu = metal(0xb8bcc0);
  // Built along +Y, then laid flat: the handle's radius lifts it off the mat.
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.4, 10), alu, [0, -0.2, 0.22]));
  g.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.1, 10), flat(0x3a3a3a), [0, 0.3, 0.22]));
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.25, 0.6, 10), alu, [0, 1.8, 0.22]));
  g.add(mesh(extrude(bladeShape(0.13, 1.35, 0.9), 0.03), metal(0xdde2e6), [0, 2.0, 0.21]));
  return layFlat(g, 0);
}

function pencil() {
  const g = new THREE.Group();
  const lift = 0.2;
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 4.4, 6), flat(0xf2c230), [0, 0, lift]));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.2, 0.6, 6), flat(0xe8d2ac), [0, 2.5, lift]));
  g.add(mesh(new THREE.CylinderGeometry(0.0, 0.05, 0.2, 6), flat(0x333333), [0, 2.9, lift]));
  g.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.35, 8), metal(0xc0c4c8), [0, -2.35, lift]));
  g.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.3, 8), flat(0xe89aa8), [0, -2.65, lift]));
  return layFlat(g, 0);
}

// A paper scrap, optionally with a round hole where a fruit was cut out.
function scrap(w, h, color, holeR = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
  if (holeR > 0) {
    const hole = new THREE.Path();
    hole.absarc(w * 0.1, h * 0.05, holeR, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  const g = new THREE.Group();
  g.add(mesh(extrude(s, 0.04), flat(color)));
  return layFlat(g, 0);
}

// Paper scrap colors: pastel stock plus the fruit sheets.
const SCRAP_COLORS = [0xf4a7b9, 0xa8e0c8, 0x9fc9f0, 0xc9b5f0, 0xffc48a, 0xfff29a, 0xfdfbf5,
  0xd8322a, 0x3b4fd8, 0x4caf50, 0xf5d33a, 0xff8c1a, 0x7d3fb0];

export function createProps(scene, { withCutout = (m) => m } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  // Scraps lying on the board itself. They are cut out by the hole like the board is.
  const boardScraps = new THREE.Group();
  scene.add(boardScraps);
  const scrapMats = SCRAP_COLORS.map((c) => withCutout(flat(c)));

  // Each prop: a builder and a slot around the board. Slots are in board-relative units:
  // sx/sz in [-1, 1] pick the side, `out` is the gap beyond the edge, `along` the position
  // along that edge as a share of the half side.
  const items = [
    { build: glueBottle, edge: 'far',   along: -0.55, out: 3.2 },
    { build: scissors,   edge: 'right', along: -0.25, out: 4.0, rot: -1.1 },
    { build: craftKnife, edge: 'near',  along: 0.25,  out: 2.4, rot: 1.4 },
    { build: craftKnife, edge: 'left',  along: 0.45,  out: 3.0, rot: 0.2 },
    { build: pencil,     edge: 'far',   along: 0.5,   out: 2.6, rot: 1.45 },
    { build: () => scrap(3.2, 2.2, 0xd8322a, 0.6), edge: 'left',  along: -0.2, out: 3.6, rot: 0.4 },
    { build: () => scrap(2.6, 2.0, 0x3b4fd8, 0.35), edge: 'right', along: 0.6,  out: 3.2, rot: -0.3 },
    { build: () => scrap(3.0, 1.6, 0xf5d33a),      edge: 'near',  along: -0.35, out: 3.4, rot: 0.9 },
    { build: () => scrap(2.4, 2.4, 0x4caf50, 0.8), edge: 'right', along: -0.75, out: 4.8, rot: 0.1 },
    { build: () => scrap(2.8, 1.8, 0xffc48a),      edge: 'far',   along: 0.05,  out: 4.6, rot: -0.7 },
    { build: () => scrap(2.2, 2.6, 0xc9b5f0, 0.5), edge: 'near',  along: 0.7,   out: 4.2, rot: 0.3 },
  ];
  // Each prop sits in a pivot group: the prop itself may be laid flat (an X rotation), and the
  // pivot spins it around Y, which one Euler could not do in that order.
  const built = items.map((it) => {
    const obj = new THREE.Group();
    obj.add(it.build());
    group.add(obj);
    return { ...it, obj };
  });

  // Edge frame: position and facing for a slot on each edge.
  const EDGES = {
    far:   (h, along, out) => ({ x: along * h, z: -h - out, face: 0 }),
    near:  (h, along, out) => ({ x: along * h, z: h + out, face: Math.PI }),
    left:  (h, along, out) => ({ x: -h - out, z: along * h, face: Math.PI / 2 }),
    right: (h, along, out) => ({ x: h + out, z: along * h, face: -Math.PI / 2 }),
  };

  function place(side, seed = 1) {
    const rnd = mulberry32(seed * 131 + 7);
    const h = side / 2;
    // Rotate the whole layout by quarter turns per level so the same props land on
    // different edges, and jitter each prop a little.
    const turn = Math.floor(rnd() * 4) * (Math.PI / 2);
    group.rotation.y = turn;
    group.position.y = -SURFACE.thickness - SURFACE.deskDrop;
    for (const it of built) {
      const e = EDGES[it.edge](h, it.along + (rnd() - 0.5) * 0.2, it.out + (rnd() - 0.5) * 0.8);
      it.obj.position.x = e.x;
      it.obj.position.z = e.z;
      it.obj.rotation.y = e.face + (it.rot ?? 0) + (rnd() - 0.5) * 0.5;
    }
    placeBoardScraps(h, rnd);
  }

  function placeBoardScraps(h, rnd) {
    for (const c of boardScraps.children) c.traverse((o) => o.geometry?.dispose());
    boardScraps.clear();
    const count = 4 + Math.floor(h / 3);
    const margin = 2;
    const placed = []; // { x, z, r } circles, so scraps never overlap and never z-fight
    for (let i = 0; i < count; i++) {
      const w = 1.2 + rnd() * 2.4, d = 1.0 + rnd() * 1.6;
      const r = Math.hypot(w, d) / 2;
      let x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 20 && !ok; tries++) {
        x = (rnd() * 2 - 1) * (h - margin);
        z = (rnd() * 2 - 1) * (h - margin);
        ok = placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r);
      }
      if (!ok) continue;
      placed.push({ x, z, r });
      const holeR = rnd() < 0.3 ? Math.min(w, d) * (0.2 + rnd() * 0.15) : 0;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -d / 2); shape.lineTo(w / 2, -d / 2); shape.lineTo(w / 2, d / 2); shape.lineTo(-w / 2, d / 2); shape.closePath();
      if (holeR > 0) {
        const hole = new THREE.Path();
        hole.absarc((rnd() - 0.5) * w * 0.3, (rnd() - 0.5) * d * 0.3, holeR, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
      const m = mesh(extrude(shape, 0.025), scrapMats[Math.floor(rnd() * scrapMats.length)]);
      m.castShadow = false;
      // Each scrap sits a hair higher than the last: a fixed stacking order even if they touch.
      const flatG = layFlat(new THREE.Group().add(m), 0.006 + i * 0.0015);
      const pivot = new THREE.Group().add(flatG);
      pivot.position.set(x, 0, z);
      pivot.rotation.y = rnd() * Math.PI * 2;
      boardScraps.add(pivot);
    }
  }

  return { group, place };
}
