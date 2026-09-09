# Hole Punch

**[Play it now](https://bgeesaman.github.io/hole-punch/)**

[![Level 30: the hole eating a grid of apples next to a bomb, with crate stacks and a watermelon behind](docs/screenshot.jpg)](https://bgeesaman.github.io/hole-punch/)

A browser game built with three.js and Rapier. You steer a hole across a paper craft board and
eat fruit, crates, and bombs that fall in with real physics. 100 levels, each with a countdown,
a target score, and a hole that grows as you hit score milestones.

## Run locally

```sh
npx serve .
```

Then open the URL it prints. ES modules do not load from `file://`, so it needs a server.

## Tests

```sh
npm install
npm test                    # vitest: scoring, generator, save, and headless Rapier physics
```

## URL parameters

| Parameter    | Effect                                                             |
|--------------|--------------------------------------------------------------------|
| `?level=N`   | Skip the menu and start level N                                    |
| `?debug`     | Debug overlay; keys `[` `]` fake a milestone / bomb, `r` restarts, `n` `p` next / previous level; `window.holepunch` exposes the session, physics, camera, and `aim(x, z)` / `advance(seconds)` for scripting |
| `?nolock`    | Run without pointer lock; the hole follows the free cursor and the game runs unpaused (for automation) |
