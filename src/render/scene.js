import * as THREE from 'three';
import { ART, CAMERA, SURFACE } from '../config.js';

// Builds the renderer, scene, camera, lights, and ground. fitSurface() sizes the ground
// and repositions the camera so the whole surface is visible.
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true; // the hole's lip overlays are clipped at the board edge
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ART.haze);
  scene.fog = new THREE.Fog(ART.haze, 60, 160);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 1, 500); // near 1: depth precision on big tables

  // Paper craft lighting: soft, warm, low contrast. A strong fill keeps shadows light.
  const hemi = new THREE.HemisphereLight(0xfff7ea, 0x9aa89c, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3e0, 1.25);
  sun.position.set(20, 40, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  scene.add(sun.target);

  // Ground and slab share a cutout: fragments inside the hole radius (world XZ) are discarded,
  // so the pit wall and falling fruit are visible through the opening.
  const holeUniforms = {
    uHoleCenter: { value: new THREE.Vector2(0, 0) },
    uHoleRadius: { value: 0 },
  };
  // Shader add-ons compose through onBeforeCompile; each wraps whatever came before. three.js
  // caches programs by the source text of onBeforeCompile, which is the same wrapper for every
  // material here, so each material also gets its own cache key from the add-on names.
  function chain(mat, name, fn) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => { if (prev) prev(shader); fn(shader); };
    mat.userData.addons = (mat.userData.addons ?? '') + name + ';';
    mat.customProgramCacheKey = () => mat.userData.addons;
    return mat;
  }
  function withWorldPos(mat) {
    if (mat.userData.worldPos) return mat;
    mat.userData.worldPos = true;
    return chain(mat, 'worldPos', (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
        .replace('#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;');
    });
  }
  function withCutout(mat) {
    withWorldPos(mat);
    return chain(mat, 'cutout', (shader) => {
      shader.uniforms.uHoleCenter = holeUniforms.uHoleCenter;
      shader.uniforms.uHoleRadius = holeUniforms.uHoleRadius;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec2 uHoleCenter;\nuniform float uHoleRadius;')
        .replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif (distance(vWorldPos.xz, uHoleCenter) < uHoleRadius) discard;');
    });
  }
  // Paper grain: a faint cell noise on the surface color.
  function withGrain(mat, amount = 0.035) {
    withWorldPos(mat);
    return chain(mat, 'grain', (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 g = floor(vWorldPos.xz * 24.0);
          float n = fract(sin(dot(g, vec2(127.1, 311.7))) * 43758.5453);
          diffuseColor.rgb *= ${(1 - amount).toFixed(3)} + ${(2 * amount).toFixed(3)} * n;
        }`);
    });
  }
  // Stacked card: a thin darker line every ART.sheet units of height on the cut faces.
  function withSheets(mat) {
    withWorldPos(mat);
    return chain(mat, 'sheets', (shader) => {
      shader.uniforms.uSheet = { value: ART.sheet };
      shader.uniforms.uSheetLine = { value: new THREE.Color(ART.boardLine) };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSheet;\nuniform vec3 uSheetLine;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float layer = fract(-vWorldPos.y / uSheet);
          float line = 1.0 - smoothstep(0.0, 0.12, layer);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSheetLine, line * 0.8);
        }`);
    });
  }
  // Cutting mat: a grid every unit, heavier every five. Lines widen to a pixel and then fade
  // with distance so the far mat does not shimmer.
  function withMatGrid(mat) {
    withWorldPos(mat);
    return chain(mat, 'matGrid', (shader) => {
      shader.uniforms.uMatLine = { value: new THREE.Color(ART.matLine) };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uMatLine;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 fw = fwidth(vWorldPos.xz);
          float px = max(fw.x, fw.y);
          vec2 f = abs(fract(vWorldPos.xz + 0.5) - 0.5);
          float fine = 1.0 - smoothstep(0.0, max(0.03, px * 1.5), min(f.x, f.y));
          fine *= clamp(1.0 - px * 4.0, 0.0, 1.0);
          vec2 c = abs(fract(vWorldPos.xz / 5.0 + 0.5) - 0.5) * 5.0;
          float coarse = 1.0 - smoothstep(0.0, max(0.05, px * 1.5), min(c.x, c.y));
          coarse *= clamp(1.0 - px * 1.5, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uMatLine, max(fine * 0.55, coarse * 0.85));
        }`);
    });
  }

  // Board top: cream card with grain.
  const groundMat = withGrain(withCutout(new THREE.MeshStandardMaterial({ color: ART.board, roughness: 1 })));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Board edge: the slab under the top shows the stacked sheets on its cut sides.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    withSheets(withCutout(new THREE.MeshStandardMaterial({ color: ART.boardEdge, roughness: 1 }))),
  );
  slab.receiveShadow = true;
  scene.add(slab);

  // Cutting mat under the board. Drawn before the pit's depth-only occluder so the occluder
  // skin (which reaches far below the mat) cannot punch a hole in it. The mat is cut out
  // under the hole; the pit wall covers the rest, since it is nearer than the mat.
  const desk = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    withMatGrid(withCutout(new THREE.MeshStandardMaterial({ color: ART.mat, roughness: 1 }))),
  );
  desk.rotation.x = -Math.PI / 2;
  desk.receiveShadow = true;
  desk.renderOrder = -20;
  scene.add(desk);

  const state = { side: 1 };
  const basePos = new THREE.Vector3(); // camera rest position; shake offsets from it

  function fitSurface(side, { forceFollow = false } = {}) {
    state.side = side;
    state.forceFollow = forceFollow;
    ground.scale.set(side, side, 1);
    slab.scale.set(side, SURFACE.thickness, side);
    // The slab top must sit clearly below the ground plane. 5 mm z-fights in bands at 100+
    // units from the camera; 5 cm plus a camera near plane of 1 is safe on big tables.
    slab.position.y = -SURFACE.thickness / 2 - 0.05;
    desk.position.y = -SURFACE.thickness - SURFACE.deskDrop; // flush under the slab: no sliver for the occluder to show through

    // Shadow frustum covers the whole surface.
    const s = side * 0.75;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.position.set(side * 0.6, side * 1.4, side * 0.4);
    // Keep the depth range tight around the table: precision across a big table is what
    // stops the flat ground from self-shadowing in bands (acne).
    const d = sun.position.length();
    sun.shadow.camera.near = Math.max(1, d - side);
    sun.shadow.camera.far = d + side;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = 0.02 + side * 0.0006;

    placeCamera();
  }

  // Camera placement. Fit distance: bisection so all four table corners project inside the
  // viewport with a margin. Floor distance: the smallest fruit must stay legible. The camera
  // sits at min(fit, floor); when the floor wins, it follows the hole (focus) across the table.
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const proj = new THREE.Vector3();
  const focus = new THREE.Vector3();       // current look-at point
  const focusGoal = new THREE.Vector3();   // where the hole is
  const viewDir = new THREE.Vector3();     // from focus toward the camera
  state.follow = false;
  state.dist = 1;

  function fitDistance() {
    const half = state.side / 2;
    corners[0].set(-half, 0, -half);
    corners[1].set(half, 0, -half);
    corners[2].set(-half, 0, half);
    corners[3].set(half, 0, half);
    const pitch = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
    const limit = 1 / CAMERA.margin;
    const fits = (dist) => {
      camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (const c of corners) {
        proj.copy(c).project(camera);
        if (Math.abs(proj.x) > limit || Math.abs(proj.y) > limit) return false;
      }
      return true;
    };
    let lo = 1, hi = state.side * 4;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }

  function floorDistance() {
    const h = canvas.clientHeight || 1080;
    const minPx = CAMERA.minSmallFruitPx * (h / 1080);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return (CAMERA.smallFruitSize * h) / (2 * minPx * tanHalf);
  }

  function placeCamera() {
    const fit = fitDistance();
    const floor = floorDistance();
    // Forced follow zooms in to a share of the fit distance so part of the table is always off
    // screen. Then a global zoom pulls every level closer. Follow whenever the table no longer
    // fits at the chosen distance.
    const base = fit > floor ? floor : state.forceFollow ? Math.min(floor, fit * CAMERA.followZoom) : fit;
    state.dist = base * CAMERA.zoom;
    state.follow = state.dist < fit || state.forceFollow;
    const pitch = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
    viewDir.set(0, Math.sin(pitch), Math.cos(pitch));
    if (!state.follow) { focus.set(0, 0, 0); focusGoal.set(0, 0, 0); }
    applyCamera();
    scene.fog.near = state.dist * 2;
    scene.fog.far = state.dist * 4;
  }

  function applyCamera() {
    camera.position.copy(focus).addScaledVector(viewDir, state.dist);
    camera.lookAt(focus);
    camera.updateMatrixWorld();
    basePos.copy(camera.position);
  }

  // Keep the view on the table. Sideways: the table's side edges may reach the viewport edges.
  // Toward the camera (+z): the near table edge may reach the bottom of the viewport; the
  // pitched view sees less ground below the focus than above it, so this is asymmetric.
  // Away (-z): the horizon above the far edge is fine to show, so only the focus itself is kept
  // on the table.
  function clampFocus(v) {
    const half = state.side / 2;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const pitch = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
    const d = state.dist;
    const visHalfW = d * Math.tan(hFov / 2);
    // Ground distance from the focus to where the bottom edge of the view meets the ground.
    const nearExtent = d * (Math.cos(pitch) - Math.sin(pitch) / Math.tan(pitch + vFov / 2));
    const cx = Math.max(0, half - visHalfW * 0.9);
    const zMax = Math.max(0, half - nearExtent * 0.85); // a little room under the hole at the near edge
    const zMin = -half * 0.9;
    v.x = THREE.MathUtils.clamp(v.x, -cx, cx);
    v.z = THREE.MathUtils.clamp(v.z, zMin, zMax);
  }

  function setFocus(x, z) {
    if (!state.follow) return;
    focusGoal.set(x, 0, z);
    clampFocus(focusGoal);
  }

  // World units per screen pixel on the table under the focus point (for relative control).
  function unitsPerPixel() {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    return (2 * state.dist * Math.tan(hFov / 2)) / (canvas.clientWidth || 1);
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    placeCamera();
  }
  window.addEventListener('resize', resize);
  resize();

  // Camera shake: a decaying random jitter in the camera's screen plane. Amplitude scales
  // with the table so it reads the same at any zoom.
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  const shake = { amp: 0, time: 0, duration: 0.35 };
  function shakeCamera(strength = 1) {
    shake.amp = Math.max(shake.amp, strength);
    shake.time = 0;
  }
  function update(dt) {
    if (state.follow) {
      const k = 1 - Math.exp(-CAMERA.followSmoothing * dt);
      focus.lerp(focusGoal, k);
      applyCamera();
    }
    if (shake.amp <= 0) return;
    shake.time += dt;
    const k = Math.max(0, 1 - shake.time / shake.duration);
    if (k === 0) { shake.amp = 0; camera.position.copy(basePos); camera.lookAt(focus); return; }
    const a = shake.amp * k * k * state.side * 0.012;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    camera.position.copy(basePos)
      .addScaledVector(right, (Math.random() * 2 - 1) * a)
      .addScaledVector(up, (Math.random() * 2 - 1) * a);
    camera.lookAt(focus);
  }

  function setHole(position, radius) {
    holeUniforms.uHoleCenter.value.set(position.x, position.z);
    holeUniforms.uHoleRadius.value = radius;
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, ground, fitSurface, setHole, setFocus, unitsPerPixel, shakeCamera, update, resize, render, state, withCutout };
}
