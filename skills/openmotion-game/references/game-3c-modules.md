> Written for OpenMotion; see [source and execution notes](../PROVENANCE.md).

# 3C Interaction and Functional-Visual Contracts

Apply **only the section** matching your game's control and camera profile. Translate its principles into 3–5 concrete project invariants in `design/plan.md` and `window.__omGame.runSelfTests()`.

| Profile | Section | Typical Games |
|---|---|---|
| Discrete click, tap, drag, or turn input | [`#discrete-ui`](#discrete-ui) | Tile/match puzzles, card/deckbuilders, board, narrative, idle |
| Continuous 2D movement, aim, or physics | [`#realtime-2d`](#realtime-2d) | Platformers, survivors/roguelikes, merge physics, `.io`, one-button |
| Continuous 3D movement, driving, exploration, or aim | [`#realtime-3d`](#realtime-3d) | 3D open worlds/sandboxes, shooters, racing, flight, 3D arenas |

---

## discrete-ui

- **Readability & occlusion clarity:** Interactive cards/tiles clearly pop above the table surface. Partially covered board tiles remain scannable (clear staggered peek + muted dimming rather than opaque black squares), while genuinely buried stacks stay hidden until revealed.
- **Focused gaze-zone readouts:** Anchor primary constraints (energy/cost, tray capacity, enemy intent with icon + bold value + timing) in one scannable slot that updates synchronously on input.
- **Responsive input & layout:** Touch targets ≥ 48–56 px with clean spacing; drag actions preview snap slots; zero double-submits or silent > 500 ms input locks; no clipped numbers or overflow at `390×844` under peak HUD density.
- **Verify:** Pass `movementThreshold: 0` in `openmotion_game_playtest`, capture active peak-density `390×844` screenshots, and run solvability/balance sweeps in `simulate` or local Node. Lookup trigger: constructive solvable puzzle dealing → [game-lookup.md](game-lookup.md).

---

## realtime-2d

- **Forgiving physics & fixed-step stability:** Player hurtbox slightly smaller than visual sprite; platformers include coyote time (~80–120 ms) and jump buffering (~100 ms); fixed-step simulation prevents framerate-dependent speed or wall tunneling; boundaries slide cleanly instead of snagging.
- **Visual separation & telegraphs:** Foreground actors separate unmistakably from muted backgrounds via silhouettes and role contrast; hazards telegraph before impact.
- **Input hygiene:** Clear opposing directional keys, reset held state on blur/visibility change (never dropping `Shift` dash modifiers), and avoid stuck states across keyboard/touch transitions.
- **Verify:** Exercise movement and hazard/boundary interactions in `openmotion_game_playtest` (`scriptedMovement` + `runSelfTests()`), and inspect desktop + `390×844` framing.

---

## realtime-3d

Design 3D controls, space, and visuals from **player intuition first** so every movement state, camera angle, and world object obeys one coherent physical reality:

- **Unified spatial & physical self-consistency:**
  - All traversal modes (walk, sprint, jump, flight, vehicles) respect solid world boundaries — never skip collision in flight or let actors pass cleanly through other actors, solid props (pillars, barriers, trees, bollards) or terrain.
  - Vertical transitions match intuition: avoid jarring unintentional auto-climbing over tall obstacles, and resolve wall/barrier contact with smooth tangential sliding rather than dead stops or trapped geometry.
  - Keep entity coordinates and velocities finite (`NaN`/`Infinity` guards on AI, physics and spawn defaults) and damp knocked/dynamic objects to rest.
- **Build spaces for both actor AND camera:**
  - Any enterable structure, doorway, bridge clearance, or vehicle interior must be sized from the player's collision volume plus third-person camera clearance (flush thresholds, unobstructed interiors/clearances).
  - Camera follow stays smoothly damped with a stable horizon; inside tight interiors or vehicles, clamp or pull the camera within local bounds so it never clips through walls/pillars or blocks the sightline.
  - Adapt portrait (`aspect < 1`) FOV/distance on startup and resize so the hero, focal objective, and surroundings remain framed without dead margins.
- **Combat, steering & visual readability:**
  - Aim/melee offers fair forgiveness (mild hitbox/reticle magnetism), immediate hit confirmation (< 50 ms flash + audio + reaction), and automatic recoil/drift recovery.
  - Establish clear luminance hierarchy (`ground < obstacles < heroes & focal signals`) with intentional tone mapping/exposure, readable silhouettes at camera distance, and high-contrast scrims behind transient center callouts.
  - **Same-frame visual consistency:** When upgrading a focal hero or hero vehicle to high fidelity, check neighboring primary-sightline assets (other vehicles, water craft, infrastructure, landmarks) so crude placeholder blocks do not break immersion right next to the hero.
- **Verify:**
  - Encode the game's 3–5 highest-risk 3D invariants (boundary/actor/prop collisions, finite entity states, space/camera clearances, core combat/interaction transitions, loading-overlay unmount) in **`window.__omGame.runSelfTests()`**.
  - Run consolidated `openmotion_game_playtest` scripts exercising real hazards (wall graze, aim/fire, vehicle/interior entry) with `{ type: "screenshot", label }` at key moments and inspect for camera clipping, floating geometry, texture stretching, and HUD clearance.
  - **Lookup trigger:** Non-trivial 3D capsule slide, arcade drift state machines, FPS recoil/aim math, or custom Three.js shaders → [game-lookup.md](game-lookup.md).
