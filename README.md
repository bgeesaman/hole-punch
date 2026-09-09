# Hole Punch

A browser game built with three.js and Rapier. You steer a hole across a paper craft board and
eat fruit, crates, and bombs that fall in with real physics. 100 levels, each with a countdown,
a target score, and a hole that grows as you hit score milestones.

## Run

There is no build step. The page is plain ES modules; `three` and Rapier load from jsDelivr
through the import map in `index.html`. Any static file server works, since modules do not
load from `file://`:

```sh
npm run dev        # python3 -m http.server 5173, then open http://localhost:5173
```

Tests need Node and the dev dependencies:

```sh
npm install
npm test           # vitest: game logic and headless physics
```

## Hosting on GitHub Pages

Settings, Pages, source "Deploy from a branch", branch `main`, folder `/ (root)`. Every push
to `main` is live at `https://<user>.github.io/<repo>/`. Paths in `index.html` are relative,
so a project sub-path works without configuration.

Dependency versions are pinned twice: in `package.json` for the tests, and in the import map
for the browser. Bump both together.

## Play

- Click the board to capture the mouse. The hole follows it. Click again or press Escape to
  release the mouse, which pauses the level and opens the pause menu.
- Fruit and crates score points when they fall in. Bigger objects score more and need a bigger
  hole. Bombs shrink the hole for a few seconds.
- The hole grows at 25 / 50 / 75 / 100 percent of the target. The lip of the hole is the
  progress bar: the south half fills toward the next size, the north half counts down a bomb.
- Reach the target before the clock runs out to unlock the next level. Time left is a bonus,
  clearing everything with nothing lost off the edge is a bigger one. Three stars per level.
- Sound settings (music and effects, off / low / normal) live in the pause menu. Progress is
  saved in localStorage.

## URL parameters

| Parameter    | Effect                                                             |
|--------------|--------------------------------------------------------------------|
| `?level=N`   | Skip the menu and start level N                                    |
| `?debug`     | Debug overlay, keys `[` `]` (fake milestone / bomb), `r` restart, `n` `p` next / previous, and a `window.holepunch` handle for scripting |
| `?nolock`    | Run without pointer lock (for automation); the hole follows the free cursor |

## Layout

```
src/
  main.js            app state machine, level lifecycle, frame loop
  config.js          tuning knobs: hole, scoring, camera, surface, physics, art palette
  input.js           pointer lock, virtual cursor, relative mode for the follow camera
  audio.js           synthesized sound effects, channel levels
  music.js           generated lo-fi techno loop
  game/              pure logic: catalog, scoring, session, level curve, generator, save
  physics/world.js   Rapier world: table, kinematic rim and pit wall, contact filter, swallow
  render/            three.js scene, hole, instanced objects, fruit models, particles, props
  ui/                HUD, level menu, pause, end screen
test/                vitest suites (scoring, generator, save, physics)
```

## Notes

- Rapier's WASM is inlined in `@dimforge/rapier3d-compat`, so the browser loads it as one
  ordinary module with no WASM hosting concerns.
- The physics ground is a static box plus a kinematic annulus and pit wall that follow the hole.
  A contact filter drops table support for anything centred inside the hole.
- Instanced pools are drawn with frustum culling off: three.js never refreshes an
  InstancedMesh bounding sphere, and a stale one blanks the whole pool under the follow camera.
