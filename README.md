# Hole Punch

A browser game built with three.js and Rapier. You steer a hole across a paper craft board and
eat fruit, crates, and bombs that fall in with real physics. 100 levels, each with a countdown,
a target score, and a hole that grows as you hit score milestones.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the build
npm test           # vitest: game logic and headless physics
```

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

- Rapier's WASM is inlined through `@dimforge/rapier3d-compat`, so the build is a single static
  bundle with no special hosting needs.
- The physics ground is a static box plus a kinematic annulus and pit wall that follow the hole.
  A contact filter drops table support for anything centred inside the hole.
- Instanced pools are drawn with frustum culling off: three.js never refreshes an
  InstancedMesh bounding sphere, and a stale one blanks the whole pool under the follow camera.
