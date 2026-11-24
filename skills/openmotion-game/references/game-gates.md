> Written for OpenMotion; see [source and execution notes](../PROVENANCE.md).

# Adaptive Pipeline, Gates, and Stop-Loss

Quality comes from a tight loop: explicit genre & invariant contract → parallel asset + chassis build → honest single-pass verification → disciplined stop-loss. Gates block on broken rules, Hard Fail violations, or off-brief drift — never on minor polish.

## Track Selection

| Track | When to Use | Workflow |
|---|---|---|
| **Full Track** | `realtime-3d`, `puzzle-pressure`, `strategy-combo`, `sandbox-explore`, multi-level / playable ads, or generated multimodal assets | Plan & concurrent asset launch → build chassis + integrate real assets in one pass → consolidated verification & fresh-eyes visual review → deliver |
| **Fast Track** | Solo single-screen 2D `skill-flow` or simple `progression-rng` with zero generated assets | Compact brief + 3–5 Hard Fails → build core + `config` + feel → single combined verification (`validate`, `simulate`, `playtest` + screenshot review) → cover & deliver |

## Full Track — Elastic Parallel Pipeline

Avoid writing the entire presentation layer twice (graybox then full rewrite) unless the core mechanic itself is highly experimental:

1. **Plan & Launch Assets Concurrently.** Write `design/plan.md`, `design/style.md`, and `design/assets.csv` (run [game-lookup.md](game-lookup.md) when triggered). If generating paid media, obtain one upfront spend confirmation and **submit the independent asset batch concurrently** right away.
2. **Build Core & Integrate Once.** While cloud media jobs run, author the core rules/physics, input layer, `window.__omGame` (`getState`, `getStats`, `sendAction`, `runSelfTests`), and `config` block. Once jobs finish, inspect via batch contact-sheet `read` (and `scripts/game-glb-inspect.mjs` for 3D GLBs) and wire completed assets directly into the live scene in one clean integration pass.
   - *Optional micro-prototype*: Only pause for a stripped-down graybox check first when the core mechanic or level generator is genuinely uncertain and needs early rule proof before investing in presentation.
3. **Consolidated Verification & Independent Visual Review.** Run the verification stack matched to your architecture (below), capture multi-point gameplay screenshots (`{ type: "screenshot", label }`), and perform a fresh-eyes review against `design/plan.md` and `design/style.md` (if sub-agents are unavailable, re-read only plan/style/screenshots — never grade from memory).
4. **Deliver.** Finish `capture_cover` → `design/verification.md` → `validate` → `update_meta` → `set_status("ready")` → authorized `publish` cleanly inside the turn.

## Verification Boundaries (Match Harness to Architecture)

Keep authoritative state honest — **never build a fake parallel `logic.js` stub just to satisfy `simulate`**.

- **Deterministic logic simulation (`openmotion_game_simulate`) — for games with `logic.js`:** Primary balance/solvability harness for `puzzle-pressure`, `strategy-combo`, `progression-rng`, and rule-driven `skill-flow`. Runs on one fixed seed (`'game-simulation'`), max 100,000 scripted inputs, 32 KiB summary:
  1. **Skilled (`scripts: "reference"`):** Reaches terminal win (`{ over: true, winners: [...] }`). On endless score-chasers with `logic.js`, define a real player-facing win milestone in `config` (with optional post-win endless continue).
  2. **Weak (explicit degraded `GameSimulationStep[]` array):** Progresses partway and struggles or loses (never pass `"degraded"` as a string).
  3. **Idle (`scripts: "idle"`):** Reaches terminal loss (`over: true, winners: []`) within `< 2500` ticks (for untimed turn/puzzle games, use silent `config.idleLossTicks` / `config.idleAutoPassTicks` in `1200–2200` ticks).
  - Run fast 20–50 seed Node sweeps locally when shell access exists instead of looping dozens of MCP `simulate` calls.
- **Browser playtest + Self-Tests (`openmotion_game_playtest`) — for ALL games, primary for `realtime-3d` & `sandbox-explore`:**
  - Put your 3–5 highest-risk project invariants (collision self-consistency, finite coordinates/velocities, space/camera clearances, progression/state transitions, loading-overlay unmount & input handoff) into **`window.__omGame.runSelfTests()`** returning `{ [checkName]: { pass: boolean, detail?: string } }`. `openmotion_game_playtest` automatically runs it and reports each check as an assertion.
  - Consolidate checks into **1–2 focused playtest runs** using explicit per-client `scripts`, `waitForReadyMs` when loading async media/GLBs, and `{ type: "screenshot", label }` to inspect loading/ready state, active mid-game/Level-2 pressure, boundary/negative paths, and `390×844` layout without wasting extra browser launches.
- **Anti-reward-hacking:** Never weaken thresholds to force a green run or let `pilot`/`referenceRoute` cheat hidden state. If headless Chrome/loopback is unavailable, run `validate` (and `simulate` if applicable) and report skipped browser checks honestly.

## Stop-Loss Rules

- **Severity tiers:** **P0 blocking** (errors, freezes, Hard Fail violation, broken self-tests, collapsed FPS); **P1 experience** (core feel/difficulty/readability/HUD clipping); **P2 polish** (minor details and rare edge cases). Fix P0 and in-scope P1; log P2 under `## Known gaps (P2)` in `design/verification.md`.
- **Round cap:** At most 3 P1 fix rounds, then hand remaining P1/P2 to the user. If a core loop P0 recurs across 2 rounds, pivot the mechanic instead of endlessly tweaking numbers.

## Reporting P2 to the User

Automated checks raise the floor; final feel belongs to human hands:
- Surface 3–5 highest-leverage `config` parameters in plain language for fast follow-up tuning.
- List at most **five numbered P2 items** (highest impact first, one sentence each; if more exist, note `"N more details are recorded."`) and close with one question asking which to fix or leave.
