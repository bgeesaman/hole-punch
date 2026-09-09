# Hole Punch

**[Play it now](https://bgeesaman.github.io/hole-punch/)**

A browser game built with three.js and Rapier. You steer a hole across a paper craft board and
eat fruit, crates, and bombs that fall in with real physics. 100 levels, each with a countdown,
a target score, and a hole that grows as you hit score milestones.

## How it is built and hosted

Plain ES modules, no bundler, no build step, no CDN. `index.html` carries an import map that
resolves `three`, `three/addons/`, and `@dimforge/rapier3d-compat` to copies checked in under
`vendor/`. Rapier's WASM is inlined in its module, so nothing else needs serving.

GitHub Pages serves this repository straight from the `main` branch, root folder. Every push
to `main` is live at https://bgeesaman.github.io/hole-punch/ within about a minute. All paths
in `index.html` are relative, which is what makes the `/hole-punch/` sub-path work.

`package.json` lists `three` and Rapier as dependencies only so the tests can import them
under Node. The browser never touches `node_modules`. When bumping a version, update
`package.json`, run `npm install`, and re-copy the files listed in `vendor/README.md`.

## Run locally

ES modules do not load from `file://`, so serve the folder with any static file server. The
`dev` script uses Python's built-in server:

```sh
npm run dev                 # python3 -m http.server 5173
open http://localhost:5173
```

Any other static server works the same, for example `npx serve .`.

## Tests

```sh
npm install
npm test                    # vitest: scoring, generator, save, and headless Rapier physics
```

## Play

- Click the board to capture the mouse. The hole follows it. Click again or press Escape to
  release the mouse, which pauses the clock and opens the pause menu.
- The pause menu has Resume, Restart, Levels, and the sound settings (music and effects, each
  off / low / normal). Escape on the level grid returns to the paused level.
- Fruit and crates score points when they fall in: 1, 5, or 20 by size. Bigger objects need a
  bigger hole. Bombs shrink the hole one step for eight seconds.
- The hole grows at 25 / 50 / 75 / 100 percent of the target. The lip of the hole is the
  progress bar: the south half fills toward the next size, the north half counts down a bomb.
- A level ends when the board is empty or the clock runs out. Reaching the target either way
  unlocks the next level. Clearing the board adds 10 points per second left, and clearing it
  with nothing lost off the edge adds another 25 percent. Three stars per level, replayable
  for a better score.
- From level 10 the camera follows the hole, so part of the board is off screen.
- Progress and sound settings are saved in `localStorage`.

## URL parameters

| Parameter    | Effect                                                             |
|--------------|--------------------------------------------------------------------|
| `?level=N`   | Skip the menu and start level N                                    |
| `?debug`     | Debug overlay; keys `[` `]` fake a milestone / bomb, `r` restarts, `n` `p` next / previous level; `window.holepunch` exposes the session, physics, camera, and `aim(x, z)` / `advance(seconds)` for scripting |
| `?nolock`    | Run without pointer lock; the hole follows the free cursor and the game runs unpaused (for automation) |

## Layout

```
index.html           page, HUD markup, import map
src/
  main.js            app state machine, level lifecycle, frame loop, debug handle
  config.js          tuning knobs: hole, scoring, camera, surface, physics, art palette
  input.js           pointer lock, virtual cursor, relative mode for the follow camera
  audio.js           synthesized sound effects, per-channel levels
  music.js           generated lo-fi techno loop
  style.css          HUD, menus, and panels
  game/              pure logic: catalog, scoring, session, level curve, generator, save
  physics/world.js   Rapier world: table, kinematic rim and pit wall, contact filter, swallow
  render/            three.js scene, hole, instanced objects, fruit models, particles, props
  ui/                HUD, level menu, pause, end screen
test/                vitest suites
vendor/              three and Rapier modules used by the browser (see vendor/README.md)
```

## Implementation notes

- The physics ground is a static box plus a kinematic annulus and pit wall that follow the hole.
  A contact filter drops table support for anything centred inside the hole, so objects tip and
  fall in rather than being teleported.
- Rapier drives a capsule or cylinder lying on its side into a slow steady roll on a flat box.
  Bananas get extra damping and a low-speed brake in `physics/world.js`.
- Instanced pools are drawn with frustum culling off: three.js never refreshes an
  InstancedMesh bounding sphere, and a stale one blanks the whole pool under the follow camera.
