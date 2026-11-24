> See [source and execution notes](../PROVENANCE.md).

# Core Game Design Principles (Optional Deep Appendix)

Load on demand when designing non-trivial mechanics, progression economies, or diagnosing why a playable loop feels flat. Execution routing, pipeline cadence, and verification contracts live in `SKILL.md` and [game-gates.md](game-gates.md) — never add extra blocking phases from this appendix.

## 1. Fundamental Laws

- **Experience first:** Design around the target emotion (*"The player feels ___ because the game constantly ___"*), not feature checklists.
- **Meaningful interaction:** Every player verb needs an immediate perceptible response and a downstream consequence; dead buttons or cosmetic choices dilute agency.
- **Pattern mastery:** Introduce mechanics in safety → test at mild cost → combine with known rules → climax exam. Teach through legible situations before text.
- **Undecided tension:** Keep outcomes live via skill execution, input randomness **before** decisions (never arbitrary punishment after), hidden trails that can be deduced, or escalating tempo.

## 2. Systems, Economy & Balance

- **Few strong verbs > many weak ones:** A great verb interacts meaningfully with multiple world objects.
- **Signed feedback loops:** Guard against runaway snowballs (positive loops ending suspense too early) and skill-flattening rubber-banding (negative loops erasing mastery). Always leave room for a clutch comeback.
- **Sources & sinks:** Every currency/resource needs meaningful sinks; control variance with pity/deck protection rather than raw streaks.
- **Parameter consistency:** Cross-check content demands against player metrics (jump reach vs gap width, vehicle/door clearances vs actor + camera bounds, win thresholds vs reachable totals). One mismatched constant silently breaks playability.
- **Single data block:** Keep tunables in one `config` object and change one lever at a time when diagnosing balance.

## 3. Player Perception & Accessibility

- **Multi-channel critical cues:** Never rely on color alone; pair shape, motion, silhouette, and audio ducking so key telegraphs cut through visual clutter.
- **Hostile-input resilience:** Handle simultaneous opposing keys, rapid spam, mid-action cancels, window blur, and switching between keyboard/mouse and touch gracefully.
- **Honest delivery limits:** Automated simulation and headless playtests eliminate hard defects; real human fun, tactile device feel, and audible polish still require human play.
