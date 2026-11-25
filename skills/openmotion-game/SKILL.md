---
name: openmotion-game
description: Build, remix, validate and locally publish playable single-player browser games through the OpenMotion game tools, including a consistent art direction and real generated image, music and voice assets when media models are available.
---

# OpenMotion Game Studio

Turn a one-line brief into a verified local single-player browser game. Resume an explicitly supplied game id, or call `openmotion_game_create` (**pass `style: "3d"` on any 3D brief** so vendored Three.js is scaffolded) and read `openmotion_game_get` before editing. Use Remix on a read-only template to create an owned draft. If the user asks for multiplayer, explain that authoring is single-player and ask before adapting (existing multiplayer games remain playable/inspectable). Starter drafts (`plan.md`/`verification.md`) are inputs to revise, never evidence.

## 1. Route First — Read Only What Applies

Ask **at most two short questions** only when missing: local-market publication consent and (when paid multimodal assets are planned) one batched asset/spend confirmation. Choose your route before writing code, and **load only the matching references** (never pull 3D docs into 2D runs, multiplayer room docs into solo runs, or `game-playable-ad.md` into normal games):

| Decision | Options & Rule | Read Only When Matched |
|---|---|---|
| **3C & Space** | Pick 1: `discrete-ui` / `realtime-2d` / `realtime-3d` | [game-3c-modules.md](references/game-3c-modules.md) + [game-feel-craft.md](references/game-feel-craft.md) |
| **Core Loop** | Pick 1 primary (+ ≤ 1 secondary): `puzzle-pressure` / `strategy-combo` / `skill-flow` / `progression-rng` / `sandbox-explore` | [game-genres.md](references/game-genres.md) |
| **Runtime Architecture** | **Rule/score/turn-heavy or balance-sensitive** → keep deterministic `logic.js` + `openmotion_game_simulate`. **High-density realtime 3D / sandbox / free exploration** → modular local ESM (`src/*.js`) verified via `window.__omGame.runSelfTests()` + multi-shot `openmotion_game_playtest`. Hybrid (macro rules in `logic.js`, physics in client) is also valid. | [game-flow.md](references/game-flow.md) |
| **Track** | **`Full Track`** for `realtime-3d`, `puzzle-pressure`, `strategy-combo`, multi-level/playable-ad, or generated multimodal assets; **`Fast Track`** otherwise | [game-gates.md](references/game-gates.md) |
| **Specialty Assets** | Load strictly on demand: 2D sprites / PBR textures / 3D models / procedural rigs / audio | [sprites](references/game-2d-animation.md), [textures](references/game-textures.md), [3D](references/game-3d-animation.md), [procedural](references/game-procedural-animation.md), [audio](references/game-audio.md) |
| **Playable Ad** | Only when brief says **Format: playable ad** (overrides entry, storage, single-file inline HTML, QA) | [game-playable-ad.md](references/game-playable-ad.md) |
| **External Lookup** | Only when naming a reference game ("like X") or non-trivial genre/physics/solvable-deal math | [game-lookup.md](references/game-lookup.md) |

**Priority order:** `1. Safety / IP / runtime / spend boundaries` > `2. Explicit user intent ([locked] reference game, style, layout, rules)` > `3. Genre authenticity, 3C readability & invariants` > `4. Open creative exploration` (when style is unlocked, reject the genre's first cliché and starter-kit graybox shell).

## 2. Core Workflow (Concurrent Overlap → Single Integration)

1. **Plan & Genre Authenticity Anchor** ([brief standard](references/game-brief.md), [style](references/game-stylization.md)). Before coding, answer three questions in `design/plan.md`:
   - *First-glance identity*: What camera, spatial layout and UI language make the player recognize this exact genre within 2 seconds?
   - *Native fun engine*: What core verb/interplay delivers this genre's authentic feeling (never collapsing into a generic dodge-or-collect starter reskin)?
   - *Native progression/outcome*: Does this game belong to win/loss, score-chaser, branching narrative, or open sandbox exploration?
   Record **1 Signature Twist + 1 Peak Moment**, 3–5 concrete game-specific invariants (Hard Fails), top `config` tuning levers, `design/style.md` (concise cohesive English style direction), and `design/assets.csv`.
2. **Multimodal-First Asset Routing (Single Source of Truth).** Do not default to primitive code-drawn people, illustrations, or silent scenes when fitting models are connected:
   - **Discover live capabilities**: call `openmotion_capability_discover` (`list`/`providers`/`models`) when exposed, otherwise `openmotion_media_use` (`inspect`, `models` with `refresh:true`, `reference`). Prefer signed-in OpenDesign (`account` → `opendesign`), then other configured providers. Use only live-returned capability/model IDs.
   - **Route by visual dominance**: prioritize highest-fidelity generation on focal anchors (key art/cover, characters, cards/tiles, seamless 3D textures, BGM, voice; synthesize short SFX in Web Audio). For 3D assets, check live 3D capability first; local/supplied `.glb` models can be imported via `openmotion_asset_manage` / `openmotion_assets_use` (`action:"import"`, `modality:"3d"`) and inspected with `node scripts/game-glb-inspect.mjs`.
   - **One consent → launch concurrently → inspect once**: ask spend consent once for the whole planned batch (stop after planning if waiting for consent). Once approved, submit independent assets concurrently with unique `requestId`s via `openmotion_capability_run` (prefer live atomic capabilities like `remove-background`, `relight`, `image-blend`, `music`, `speech`) or `openmotion_assets_use action:"generate"`. **Build the core logic and 3C chassis while jobs run**, poll `openmotion_job_manage` / `action:"status"`, inspect images together via batch contact-sheet `read` (`items:[{assetId,versionId},...]`), and embed each completed asset by its literal `/motion-api/assets/<assetId>/versions/<versionId>/media` URL (never base64 or dynamic URL concatenation). Fall back to procedural/CC0 art only when unavailable or declined, and record why in `design/assets.csv`.
3. **Build (`set_status("building")`, `write_files`)** ([game-gates.md](references/game-gates.md), [game-flow.md](references/game-flow.md)). Batch cohesive multi-file edits into single `openmotion_game_write_files` calls. Wire completed generated media directly into active gameplay/character scenes (not title-only) with graceful loading/fallback states. Expose `window.__omGame = { getState, getStats, sendAction, runSelfTests }` so the harness can read state and run project-specific invariant checks.
4. **Verify (Match the Harness to the Game).**
   - Run `openmotion_game_validate` (validates `logic.js` VM when used, or local ESM import graph + CSP/hosts for modular solo games).
   - For win/loss, puzzle, strategy or progression games using `logic.js`, run 3-tier `openmotion_game_simulate` (`reference` win, explicit weak route struggling/losing, `idle` loss `< 2500` ticks; use fast local Node sweeps when tuning math).
   - For all games — and as primary verification for `realtime-3d` / `sandbox-explore` — run consolidated `openmotion_game_playtest` with explicit per-client `scripts` including `{ type: "action", action }` (calling `window.__omGame.sendAction` to jump to key states) and `{ type: "screenshot", label }` (automatically tiled into `contactSheetPath` when ≥2 captures exist), `waitForReadyMs` for async-loading builds, and `window.__omGame.runSelfTests()` checking your 3–5 core physical/spatial/lifecycle invariants. Inspect screenshots/contact sheet against [review-rubric.md](references/review-rubric.md) and log real measurements + `Known gaps (P2)` in `design/verification.md`.
5. **Deliver (`capture_cover` → `verification.md` → `validate` → `update_meta` → `ready` → authorized `publish`).** Always use `openmotion_game_capture_cover` (never the user's visible browser or desktop), inspect diagnostics and cover image, then set concise title, description, controls and `zh-CN` metadata via `openmotion_game_update_meta`. Remember `write_files` demotes `ready` to `building`.
6. **Sharing & Offline Export.** `openmotion_game_publish` is workspace-local only. For a public link (when explicitly requested and signed in), run `openmotion_assets_use` (`action:"web_publish"`, `targetKind:"game"`, `command:"publish"|"status"|"unpublish"|"list"`). Both `web_publish` and `exportZip` exclude `design/`, `trailer/`, `assets/playtests/`, `assets-raw/`, rewrite literal `/motion-api/assets/...` URLs, and auto-transcode large PNG/JPEG and embedded GLB textures to WebP while preserving geometry.
7. **Final message** (plain language, user's language, no tool names/ids/JSON): bold playable summary; play link (and public link if requested); controls + 3–5 `config` tuning levers verified against final code; verified vs unverified (human fun, real GPU/touch, audio); spend note and cover path; up to 5 numbered P2 items per [game-gates.md](references/game-gates.md#reporting-p2-to-the-user).

## MCP Resources & Optional Post-Publish Trailer

MCP-only hosts read `openmotion://workflow/game/<section>` (`start`, `brief`, `gates`, `controls`, `craft`, `lookup`, `design`, `style`, `genres`, `playable`, `flow`, `sprites`, `animation`, `procedural`, `textures`, `audio`, `review`, `provenance`) and `openmotion://workflow/media/*`.

After publishing, optionally offer `openmotion_game_trailer` (`{ id, action: "start" | "status" }`). Wait for `status: "ready"`, inspect the silent 1280×720 MP4/clips, and report `projectId` and `videoUrl` honestly.

## Mandatory Multiplayer Entry Acceptance

For diagnosing or verifying existing multiplayer projects only: clients must auto-join from `?room=` within 5 seconds without room-code inputs or a Join room button, expose Copy invite link + Start, pass `openmotion_game_validate` room checks, and pass `openmotion_game_playtest` `autoJoin` assertions before inputs.

See [PROVENANCE.md](PROVENANCE.md) and [LICENSE-HIGGSFIELD](LICENSE-HIGGSFIELD).
