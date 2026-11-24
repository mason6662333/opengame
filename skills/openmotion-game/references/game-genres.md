> Written for OpenMotion; see [source and execution notes](../PROVENANCE.md).

# Core Loop Engines, Genre Modifiers, and Quality Floor

Read alongside [3C contracts](game-3c-modules.md) during planning. Pick **one primary Core Loop Engine** (plus at most one complementary secondary engine) and instantiate its Target Bar and Hard Fails in `design/plan.md`.

## 1. Universal Quality Floor (Every Game)

- **Context-appropriate entry & viewport:** Full-viewport playfield (`100dvh`), never a boxed widget beside a landing page.
  - *Lightweight 2D / arcade / playable ads*: render the live scene immediately and accept the first input within 1 s.
  - *Heavy-asset or atmospheric builds (multi-MB 3D GLBs, rich texture/audio packs, or pointer/audio-gesture-gated worlds)*: use a crisp, high-fidelity loading cover with real asset progress, prioritized cover preloading, locked in-game inputs while loading, an explicit `#start` entry CTA once ready, and complete overlay cleanup on entry (set `phase: 'loading' → 'ready' → 'playing'` so `playtest` and `capture_cover` wait cleanly).
- **3-second clarity:** Goal and core controls readable immediately without tutorial paragraphs.
- **Multi-channel feel:** Primary verbs trigger ≥ 3 proportional feedback channels (motion/hit-stop/shake/particles/flash/WebAudio).
- **Art & asset authenticity:** Distinct figure-ground contrast (ground < obstacles < hero & focal signals). Prioritize real generated/imported assets for visual anchors (human/anime characters, portraits, key art, 3D hero/vehicles, music, voice) when models or local assets are available; keep procedural fallbacks crisp when unavailable or declined.
- **Single tuning block & responsive controls:** Keep gameplay/feel tunables in one top-level `config` block. Support keyboard/mouse and touch (`≥ 48–56 px` targets, clean `390×844` layout).
- **Verification hook contract:** Expose `window.__omGame = { getState, getStats, sendAction, runSelfTests }`. `getState()` returns `{ selfId, players: { [selfId]: { connected: true, x, z } }, phase, result }` with top-level `phase` in `'loading' | 'ready' | 'playing' | 'explore' | 'sandbox' | 'win' | 'loss'`. Use `runSelfTests()` to expose deterministic project-specific invariant checks.

## 2. Starter Chassis & Runtime Freedom

- **`arcade-2d`:** Default solo chassis (`index.html`, `logic.js`, `client.js`, `style.css`). Passing `style: "3d"` also copies vendored Three.js into `vendor/`.
- **`coop-3d`:** Existing multiplayer shooter/3D kit (`vendor/`, `characters/`, rooms).
- **Choose the runtime that fits the game:** Keep deterministic `logic.js` + `openmotion_game_simulate` for rule/score/puzzle/card/turn-based and light arcade games. For high-entity-density 3D worlds, vehicle physics, voxel sandboxes or narrative experiences where single-file VM JSON serialization would distort the architecture, write clean modular local ESM (`src/*.js`) and verify via `validate` (ESM import graph) + `openmotion_game_playtest` (`runSelfTests()` + multi-point screenshots) — never bolt on a fake `logic.js` stub.

## 3. Core Loop Engines (Pick 1 Primary)

### Puzzle & Space Pressure (`puzzle-pressure`)
*Examples: tile-stack match, unscrewing, parking-jam, tight-grid match.*
- **Driver:** Finite buffer/space tension + partial occlusion + "one move short" compulsion.
- **Target bar:** Fast confident Level-1 win (10–20 s); Level 2+ creates genuine buffer pressure; boards guaranteed solvable by construction (reverse-dealing or invariant solver); 2–3 bounded recovery lifelines.
- **Hard fail:** Unsolvable random deals; unreadable blacked-out partially covered tiles (keep exposed under-tiles visibly dimmed in `viewFor` while hiding only truly buried blind stacks); zero low-slot warning; cheating `pilot`.
- **Verify:** 3-tier `openmotion_game_simulate` (`reference` wins, degraded struggles on L2, `idle` loses via silent `config.idleLossTicks`) + optional multi-seed local Node sweep + `playtest` max-density `390×844` check.

### Strategy & Build Synergy (`strategy-combo`)
*Examples: deckbuilders, tactical cards, survivor/roguelike builds, tower defense, auto-battlers.*
- **Driver:** Meaningful resource trade-offs + multiplicative synergy + randomness **before** player decisions.
- **Target bar:** ≥ 2 viable choices per decision; synergistic builds clearly outperform naive additive picks (`≥ 1.5×`); ≥ 2 winning archetypes against escalating peaks/bosses.
- **Hard fail:** Repeated unplayable dead hands; one dominant option clearing > 80% regardless of synergy; flat invisible upgrades.
- **Verify:** 3-tier `openmotion_game_simulate` (synergy `reference` vs naive weak vs `idle` via `config.idleAutoPassTicks`) + `playtest` visual/HUD density check.

### Skill, Flow & Dynamic Tension (`skill-flow`)
*Examples: racing, 2D/3D shooters, physics merge, platformers, rhythm, action arenas, runners.*
- **Driver:** Risk-reward execution at control's edge + escalating tempo + clutch near-miss recovery.
- **Target bar:** Smooth tempo ramp; high-skill moves (drift boost, parry, headshot, chain merge, graze) pay off visibly; fair AI/rivals; brief post-hit cushion (`i-frames ≥ 0.4 s`) in survival action.
- **Hard fail:** Instant unavoidable deaths < 10 s or forever-flat difficulty; frozen/teleporting AI; skill fails to separate outcomes.
- **Verify:** `openmotion_game_simulate` (when using `logic.js`, with a real `config` milestone for endless modes) + `openmotion_game_playtest` exercising core movement/collision/combat and `runSelfTests()`.

### Progression & Variable Rewards (`progression-rng`)
*Examples: chest/loot RPGs, incremental clickers, collection builders, idle/tycoon loops.*
- **Driver:** Rapid anticipation cadence + milestone power jumps + qualitative rule unlocks.
- **Target bar:** Noticeable early progression every ≤ 20–30 s; pity protection softens dry streaks; balanced sources and sinks; qualitative unlocks alongside numeric growth.
- **Hard fail:** Repetitive tapping wall with zero feedback; `NaN`/`Infinity` overflow; trivial instant max-out.
- **Verify:** `openmotion_game_simulate` or `runSelfTests()` checking milestone unlocks, finite numbers, pity bounds, and terminal/session goals.

### Sandbox, Exploration & Interactive Worlds (`sandbox-explore`)
*Examples: open-world 3D islands/cities, free driving/flight, voxel building/destruction, narrative adventure / visual novel, cozy simulation.*
- **Driver:** Curiosity, spatial agency, tactile world response, discovery landmarks, and player-directed goals (or branching story choices) — **never force a fake countdown loss timer onto an open exploration or cozy world**.
- **Target bar:** Immediate visual landmarks drawing the eye; responsive traversal/interaction physics (walk, fly, drive, enter spaces, manipulate objects) that behave consistently with player intuition; meaningful world reaction or discovery/mission hooks; clear mode/control indicator.
- **Hard fail:** Unplayable physical breaks (falling through terrain, walking/flying through solid walls/actors, `NaN` entity disappearance, trapped camera inside interiors/vehicles); dead non-interactive scenery masquerading as interactive space; stuck loading overlay or leaked inputs before entry.
- **Verify:** `openmotion_game_validate` (ESM graph + CSP) + `openmotion_game_playtest` running **`window.__omGame.runSelfTests()`** (verifying 3–5 world invariants: collision/physics, space/camera traversal, finite entity state, key interaction/reset, loading-to-play lifecycle) + multi-point `{ type: "screenshot", label }` inspection across entry, exploration, and key interactions.

## 4. Compact Genre Modifiers (Apply Only When Relevant)

- **Platformer:** Coyote time (~0.1 s), jump buffer (~0.1 s), variable jump height, lead camera, checkpoint + exit; pixel art uses `image-rendering: pixelated`.
- **One-button / hypercasual:** Single bound verb (tap/click/Space/Enter), unmistakable timing cue vs hazard, tightening window, instant restart ≤ 2 s.
- **Racing:** Clear track landmarks, competitive AI lines, live rank/lap readout, enter/hold/release drift recovery.
- **Horror / escape:** Chained spatial clues, readable light/dark contrast, telegraphed threat cues, touch-reachable interactions.
- **Story / visual novel:** Consistent character/scene illustration, tap-to-complete / tap-to-advance dialogue box, ≥ 3 stateful choices, ≥ 2 endings, backlog, readable `390×844` layout.
- **Co-op survival (existing multiplayer):** Distinct enemy roles, Boss telegraph, ally revive ring, `?room=` auto-join verified via `playtest`.
- **Playable Ad:** Follows [game-playable-ad.md](game-playable-ad.md) overrides.
