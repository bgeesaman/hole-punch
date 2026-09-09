# Vendored browser dependencies

Copied verbatim from npm so the game runs from a static file server with no build step and no
CDN. Versions match `package.json`; when bumping one, bump the other and re-copy.

| Path | Package | Version | Source file |
|---|---|---|---|
| `three/three.module.js`, `three/three.core.js` | three | 0.186.0 | `build/` |
| `three/addons/utils/BufferGeometryUtils.js` | three | 0.186.0 | `examples/jsm/utils/` |
| `rapier/rapier.mjs` | @dimforge/rapier3d-compat | 0.20.0 | `dist/` (WASM inlined) |

Licenses: three is MIT (`three/LICENSE`), Rapier is Apache-2.0 (`rapier/LICENSE`).
