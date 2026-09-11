import * as THREE from 'three';
import { ART, HOLE, SURFACE } from '../config.js';

export const RIM_SCALE = 1.11; // rim ring outer radius as a multiple of the hole radius
export const PIT_DEPTH = HOLE.pitDepth;

// Visual pit: a rim ring at ground level, a deep inner cylinder wall that fades to black, and a
// black floor far below. The ground itself is cut out by a shader (see scene.js setHole).
//
// The pit extends well below the table slab. To keep it invisible from outside, a depth-only
// occluder skin (writes depth, not color) wraps the pit. Seen from the side, the skin is hit
// first and everything inside fails the depth test, leaving the background. Seen through the
// opening from above, the wall's inner face is nearer than the skin, so the pit shows.
export function createHole(scene) {
  const group = new THREE.Group();
  const SEG = 64;

  // The hole may sit almost flush against the board edge. The pit (wall, floor, occluder) is
  // clipped at the edge so it never pokes through the board's side face. The lip overlays are
  // not clipped: clipping a flat ring drew a dark crescent at the tangent, and a lip that
  // overhangs the edge by a few centimetres reads as a punched paper lip. Plane constants
  // follow the board size.
  const clip = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 10),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), 10),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 10),
  ];
  // A centimetre outside the hole's reach (SURFACE.edgeMargin), still inside the board edge:
  // the board cutout never reaches past the pit, and no hairline opens at the tangent.
  function setSurface(side) { for (const pl of clip) pl.constant = side / 2 - SURFACE.edgeMargin + 0.01; }

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(1, RIM_SCALE, SEG),
    new THREE.MeshBasicMaterial({ color: 0xcfc2a4, side: THREE.DoubleSide }), // cut card lip
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.06; // above any paper scrap lying on the board
  rim.renderOrder = 1;
  group.add(rim);

  // Lip arcs. The ring is built in its local XY plane and rotated flat, so local angle phi
  // maps to world: east = 0, north = pi/2, west = pi, south = 3pi/2.
  //  - South half, west -> south -> east: progress toward the next hole size (grey to green).
  //  - North half, west -> north -> east: bomb penalty countdown (red), draining as it expires.
  const ACCENT = new THREE.Color(0xffb347);
  const progressMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uFrom: { value: new THREE.Color(0xb8bec8) },  // light grey at the start of the arc
      uTo: { value: new THREE.Color(0x3dff6a) },    // bright green at the leading tip
      uBomb: { value: 0 },                          // remaining bomb penalty fraction
      uBombColor: { value: new THREE.Color(0xff3b3b) },
      uFlash: { value: 0 },
    },
    vertexShader: `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uProgress;
      uniform vec3 uFrom;
      uniform vec3 uTo;
      uniform float uBomb;
      uniform vec3 uBombColor;
      uniform float uFlash;
      varying vec2 vP;
      void main() {
        float phi = atan(vP.y, vP.x);
        if (phi < 0.0) phi += 6.28318530718;
        vec3 col;
        float lit;
        if (phi >= 3.14159265359) {
          // South half: progress. 0 at west, 1 at east via south.
          float t = (phi - 3.14159265359) / 3.14159265359;
          lit = (t <= uProgress) ? 1.0 : 0.0;
          lit *= smoothstep(0.0, 0.01, uProgress - t + 0.01);
          // Grey at the west end, greener along the arc; the tip shows the overall progress color.
          col = mix(uFrom, uTo, t);
        } else {
          // North half: bomb countdown. 0 at west, 1 at east via north. Drains from the east end.
          float t = (3.14159265359 - phi) / 3.14159265359;
          lit = (t <= uBomb) ? 1.0 : 0.0;
          lit *= smoothstep(0.0, 0.01, uBomb - t + 0.01);
          col = uBombColor * (0.85 + 0.3 * sin(uBomb * 40.0)); // slight pulse
        }
        float a = max(lit, uFlash);
        if (a < 0.01) discard;
        col = mix(col, uTo * 1.3, uFlash); // milestone: the whole lip goes bright green
        gl_FragColor = vec4(col, a);
      }`,
  });
  const progress = new THREE.Mesh(new THREE.RingGeometry(1.0, RIM_SCALE, SEG), progressMat);
  progress.rotation.x = -Math.PI / 2;
  progress.position.y = 0.062;
  progress.renderOrder = 2;
  group.add(progress);

  // Burst ring for the milestone flash: expands outward and fades.
  const burstMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false });
  const burst = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.18, SEG), burstMat);
  burst.rotation.x = -Math.PI / 2;
  burst.position.y = 0.064;
  burst.renderOrder = 3;
  burst.visible = false;
  group.add(burst);

  // Pit wall: a clean die-cut. The board thickness shows the stacked card sheets; below that
  // the cut runs through the mat and darkens over uFade units so the shaft reads as deep.
  const wallMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    clippingPlanes: clip,
    uniforms: {
      uDepth: { value: PIT_DEPTH },
      uFade: { value: HOLE.darkDepth },
      uBoard: { value: SURFACE.thickness },
      uSheet: { value: ART.sheet },
      uLightDir: { value: new THREE.Vector3(0.55, 0.7, 0.45).normalize() },
      uFlash: { value: 0 },
    },
    vertexShader: `
      #include <clipping_planes_pars_vertex>
      varying float vY;
      varying vec3 vNormalW;
      void main() {
        vY = position.y;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      #include <clipping_planes_pars_fragment>
      uniform float uDepth;
      uniform float uFade;
      uniform float uBoard;
      uniform float uSheet;
      uniform vec3 uLightDir;
      uniform float uFlash;
      varying float vY;
      varying vec3 vNormalW;
      void main() {
        #include <clipping_planes_fragment>
        // Geometry y runs +uDepth/2 (lip) to -uDepth/2 (floor). Depth below the lip:
        float depth = uDepth * 0.5 - vY;
        // Inward-facing normal: the cylinder normal points outward, we see the inside.
        vec3 n = -normalize(vNormalW);
        float diffuse = max(dot(n, uLightDir), 0.0);
        // Flat lighting: a strongly lit far wall reads as a dome, not a hole.
        float light = 0.7 + 0.3 * diffuse;
        // Occlusion: the cut darkens fast just below the lip, so it never outshines the top.
        float occ = 0.3 + 0.7 * exp(-depth * 1.1);
        // Card sheets: a line where each sheet meets the next.
        float layer = fract(depth / uSheet);
        float line = 1.0 - smoothstep(0.0, 0.12, layer);
        vec3 card = mix(vec3(0.80, 0.75, 0.62), vec3(0.58, 0.52, 0.40), line * 0.8);
        // Below the board: the mat, then nothing.
        float below = smoothstep(uBoard - 0.02, uBoard + 0.02, depth);
        vec3 base = mix(card, vec3(0.13, 0.24, 0.20), below);
        float sky = pow(clamp(1.0 - depth / uFade, 0.0, 1.0), 1.4);
        vec3 col = base * light * occ * sky;
        // Milestone flash: a warm glow near the top plus a pulse that travels down the shaft.
        if (uFlash > 0.0) {
          float travel = (1.0 - uFlash) * uDepth * 0.7;
          float d = (depth - travel) * 0.9;
          float wave = exp(-d * d); // not pow(): undefined for negative bases (NaN -> white)
          vec3 glow = vec3(1.0, 0.72, 0.32);
          col += glow * (uFlash * 0.22 * exp(-depth * 0.35) + wave * uFlash * 0.45);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, PIT_DEPTH, SEG, 1, true), wallMat);
  wall.position.y = -PIT_DEPTH / 2;
  group.add(wall);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1, SEG),
    new THREE.MeshBasicMaterial({ color: 0x000000, clippingPlanes: clip }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -PIT_DEPTH + 0.01;
  group.add(floor);

  // Depth-only occluder: slightly larger than the wall, open at the top, rendered first.
  // Built as an open cylinder plus a bottom disc. (Do not build it from a capped cylinder
  // and filter geometry groups: groups are ignored for single-material meshes.)
  const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.FrontSide, clippingPlanes: clip });
  const occSide = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, PIT_DEPTH, SEG, 1, true), occMat);
  occSide.position.y = -PIT_DEPTH / 2 - 0.02; // top edge just under the ground, so it never fights it at a grazing angle
  occSide.renderOrder = -10;
  group.add(occSide);
  const occBottom = new THREE.Mesh(new THREE.CircleGeometry(1.02, SEG), occMat);
  occBottom.rotation.x = Math.PI / 2; // faces down, so it is a front face from below
  occBottom.position.y = -PIT_DEPTH;
  occBottom.renderOrder = -10;
  group.add(occBottom);

  scene.add(group);

  const state = {
    radius: HOLE.startRadius,       // displayed radius
    targetRadius: HOLE.startRadius, // logical radius
    position: new THREE.Vector3(),
    flash: 0,                       // 1 right after a milestone, decays to 0
  };
  const FLASH_TIME = 0.8;
  const rimBase = rim.material.color.clone();

  function setProgress(p) {
    progressMat.uniforms.uProgress.value = Math.max(0, Math.min(1, p));
  }
  function setBomb(fraction) {
    progressMat.uniforms.uBomb.value = Math.max(0, Math.min(1, fraction));
  }

  function flash() {
    state.flash = 1;
    burst.visible = true;
  }

  function setRadius(r) {
    state.targetRadius = THREE.MathUtils.clamp(r, HOLE.minRadius, HOLE.maxRadius);
  }

  function update(dt) {
    const k = 1 - Math.exp(-dt / (HOLE.radiusLerpTime / 3));
    state.radius += (state.targetRadius - state.radius) * k;

    // Flash: glow, rim color, burst ring, and a slight pop of the whole pit.
    let pop = 1;
    if (state.flash > 0) {
      state.flash = Math.max(0, state.flash - dt / FLASH_TIME);
      const f = state.flash;
      const e = 1 - f; // elapsed fraction
      wallMat.uniforms.uFlash.value = f;
      progressMat.uniforms.uFlash.value = f * f;
      rim.material.color.copy(rimBase).lerp(ACCENT, f);
      const bs = 1 + e * 1.4;
      burst.scale.set(bs, bs, 1);
      burstMat.opacity = 0.9 * (1 - e) * (1 - e);
      pop = 1 + 0.07 * Math.sin(Math.PI * Math.min(1, e * 1.6));
      if (f === 0) { burst.visible = false; rim.material.color.copy(rimBase); }
    }
    group.scale.set(state.radius * pop, 1, state.radius * pop);
    group.position.copy(state.position);
  }

  return { group, state, setRadius, setProgress, setBomb, setSurface, flash, update };
}
