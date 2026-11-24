> Written for OpenMotion; see [source and execution notes](../PROVENANCE.md).

# Game Brief Standard

`design/plan.md` (~1 page) is the single source of truth for the run, paired with `design/style.md` (visual direction) and `design/assets.csv` (asset manifest). Describe observable player experience, concrete thresholds, and hard invariants — not class names. Tag user-specified requirements `[locked]`, goals `[target]`, and defaults `[assumption]`.

## 1. Routing & Genre Authenticity Anchor (Top of `design/plan.md`)

Start every brief by locking routing and preventing generic starter-kit convergence:

- **Routing:** `Track` (`Fast` / `Full`) · `3C` (`discrete-ui` / `realtime-2d` / `realtime-3d`) · `Core Loop` (`puzzle-pressure` / `strategy-combo` / `skill-flow` / `progression-rng` / `sandbox-explore`) · `Runtime` (`logic.js + simulate` / `modular ESM + runSelfTests` / `hybrid`) · `Lookup Triggers`.
- **Genre Authenticity (3 lines — mandatory):**
  1. *First-glance identity*: What perspective, spatial structure, and UI language make a player recognize this exact genre within 2 seconds?
  2. *Native core fun*: What core verb/interplay gives this genre its real magic (not a reskinned generic dodge/collect loop)?
  3. *Native outcome model*: Does this genre naturally end in win/loss, score-chasing, narrative branches, or open sandbox exploration?
- **Creative Divergence & Hook:**
  - Respect `[locked]` user styles faithfully. When style is left open, name the genre's most predictable visual/title cliché and explicitly reject it, deriving a fresh physical medium, lighting mood, and palette from the core verb.
  - Every game needs **1 Signature Twist** (a clever rule or agency interplay beyond baseline expectations) and **1 Peak Moment** (an unmistakable audiovisual/gameplay climax).
- **Acceptance Contract (3–5 game-specific invariants / Hard Fails):** Concrete pass/fail checks mapped directly to `openmotion_game_simulate` (for rule-driven games) and/or `window.__omGame.runSelfTests()` + `openmotion_game_playtest` screenshots.
- **Top `config` Levers:** 4–6 highest-leverage feel/difficulty parameters placed in one top-level `config` block.

## 2. Concise Brief Sections

Fast Track may compress sections 4, 6, and 9 to 1–2 lines. Keep `## Difficulty plan`, `## Brief changes`, and `## Follow-up opportunities` (publication turns follow-up bullets into user `nextSteps` prompts).

| Section | Write | Check |
|---|---|---|
| **1. Pitch & Signature Twist** | Two-sentence pitch + Signature Twist, audience, platform, session rhythm | Twist is playable, not cosmetic |
| **2. Experience Target & Peak Moment** | `"The player feels ___ because the game constantly ___"` + concrete Peak Moment | Verified in active gameplay capture |
| **3. Core Loop** | 30-second verb → feedback → reward loop; first meaningful interaction arrives cleanly | Exercised in playtest / simulation |
| **4. Retention / Exploration Hooks** | 2–3 hooks fit to the loop (near-miss tension, combo synergy, discovery landmarks, progression jumps) | Observable in mid-game state |
| **5. Feel** | ≥ 3 proportional feedback channels on core verbs (motion/hit-stop/shake/particles/audio) | Logged in `design/verification.md` |
| **6. Share & Framing** | Striking active gameplay frame (for cover) + clean end/milestone card where applicable | Verified in cover & playtest shots |
| **7. Style** | Concise cohesive English style direction (`design/style.md`) + role contrast (ground vs hero vs signal) | Fresh-eyes screenshot review |
| **8. Scope & Budget** | Must have / not this time; planned multimodal assets; frame & payload budget (large open worlds start as one dense playable district/island) | `validate` + `?debug` + bundle `sizeBreakdown` |
| **9. Asset Manifest** | `design/assets.csv` (`asset,source,license,cost` + role/status); plan real multimodal art/audio/3D where fitting, list fallbacks cleanly | Zero 404s or broken fallbacks |

## 3. Keeping the Brief Honest

- **Wrong number** → tune `config`. **Means fails** → update `[target]`/`[assumption]` and log under `## Brief changes`. **`[locked]` goal impossible** → stop and offer the user two concrete alternatives with evidence.
- **Pivot over polish:** If the core loop fails twice, propose alternative core verbs rather than endlessly tweaking constants.
- `design/plan.md` is human/agent prose (never strict-parsed). Only `design/assets.csv` is tabular documentation; keep any runtime manifest outside `design/` so `web_publish` and `exportZip` include it.
