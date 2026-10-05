# Status

## What exists
- Scaffold: Vite 8, TS 7, React 19, R3F and drei, zustand, Vitest, Playwright, Pages deploy workflow.
- **M3 playable client** (`src/client/`, live on Pages): start screen (side, scenario, animation speed, Continue,
  How to Play with 9 tabs), then a lazy-loaded `GameScreen` (R3F battlefield + HUD). One zustand GameRunner
  (`store/gameStore.ts`) is the only caller of `engine.step`; the bot (`bot/botDriver.ts`) answers through it when the
  presentation is idle, with a 5 s watchdog. Every number shown comes from `query.*`, `pending` or events.
  - Prompt dock for every decision kind: board decisions (deploy, advance deploy, trooper placement, moves) say what
    to click and offer the engine's auto-place / charge-straight-in / suggested spots / stay put, plus Confirm and Reset.
  - Activation panel (movement, combat, attacks with hit %, spells, feat), grid card, event feed, dice log and tray,
    focus allocation steppers, upkeep and shake forms, game-over screen, first-time coach tips, Menu and ? buttons.
  - Camera starts behind the human's own zone; ruler (M), LOS view (L), threat rings (T), camera presets (V).
  - Autosave each turn in `localStorage` (Continue saved game on the start screen); `?seed=` makes a game repeatable.
- Engine contracts, FROZEN (additive only, logged in `docs/spec/00-architecture.md` §14):

| File | Holds | State |
|---|---|---|
| `src/engine/types.ts` | GameState, ModelState, DamageState, EffectInstance, AttackContext, ActivationContext, PendingDecision, WindowId, RejectionCode, StepResult, SaveFile, Cloud | types |
| `src/engine/actions.ts` | `Action` union (34 types) | types |
| `src/engine/events.ts` | `GameEvent` union (54 types) | types |
| `src/engine/hooks.ts` | hook points, data descriptor types, code-hook registry types | types + stubs |
| `src/engine/rng.ts` | sfc32 + cyrb128, `roll(state, spec)`, `deriveSeed` | implemented |
| `src/engine/decider.ts` | `Decider`, random and replay deciders | implemented |
| `src/engine/index.ts` | `createGame step legalActions validate replay save load view registerBundle query.* describe.*` | **implemented (M2)** |

- Rules modules (M1+M2): `geometry los measure terrain dice attack damage` (M1); `setup turnflow pending focus effects scenario
  movement power-attacks spells code-hooks factions/{cygnar,khador} phases/{maintenance,control,activation,avenging}` (M2).
  Whole games run: setup, roll-off, deployment, Prey, Maintenance (incl. Avenging Force), Control, activations with unit
  placement, charges, attacks, spells, feats, scoring, assassination, round limit and tiebreaks.
- `legalActions` returns only answers that pass full validation, and is never empty for an open decision.
- `query.*`: distance, LOS verdict with cover/concealment/stealth flags, attack preview (hit target, dice, pHit/boosted,
  crit, ARM, expected damage, pKill), threat ranges, scenario control, stat trace, move check, power-attack POW.
- `src/ai/random.ts`: `createSensibleRandomDecider(seed)` / `pickSensible`: random over legal actions, weighted toward
  charging, attacking and moving toward enemies/objectives (leaders hang back). Seeded by (seed, decision id).
- **M4 AI** (`src/ai/`): utility decider with easy and normal tiers (`tiers.ts`, 40-ai §8; the Opponent select defaults
  to Normal): scored moves with threat and cover lookahead, scenario roles, Leader safety, focus knapsack, assassination
  lines, run in a worker (`worker.ts`). `npm run bench:ai -- --games 20 --seed 1`: normal beats random 20/20 and easy
  16/20, 4.6 ms/decision mean, 0 rejected, 0 stalls, 0 fallbacks.
- `tools/sim.ts` (`npm run sim -- --games N --seed S [--scenario id] [--json]`): bot vs bot on the starter lists; checks
  60 §2 invariants after every step, a 5000-decision cap, a 200-decision stall detector, save/load mid-game and replay
  determinism. `npm run sim -- --games 50 --seed 1`: 50/50 games end, 0 violations, mean 4.4 rounds.
- E2E (`npm run e2e`, vite preview at /whirr-machine/): `tests/e2e/play.spec.ts` plays Cygnar vs the bot through UI
  clicks to round 3 (How to Play tabs checked, screenshots in `e2e-out/`), and Khador on the Quick Start demo for a round
  with attacks made by clicking the enemy. Shared click policy in `tests/e2e/policy.ts`.
- Tests: 171 unit tests in 21 files (engine, data, client store/board/HUD/start/prompts), including
  `tests/engine/golden.test.ts` (GOLD-001: the QS worked turns replayed through `step` with forced dice, 18 steps, all passing) and `tests/engine/index.test.ts` (API, invariants, a short sim).
- Starter data in `src/data/`; `npm run validate:data` checks the code-hook registry directly.

## Audio (M6)
- 59 SFX and narrator clips in `public/audio/`, 10 music tracks in `public/audio/music/` (title, two battle loops,
  victory and defeat stingers; two candidates each), all made with ElevenLabs from `tools/audio-manifest.json`
  (credits in `public/audio/CREDITS.md`). Audition page: `/whirr-machine/sounds.html`.
- Tools: `tools/gen-audio.ts` (idempotent, credit ceiling, `--kind=music` opt-in), `measure-audio.ts` (RMS, crest),
  `compose-audio.ts` (layer clips from `tools/audio-src/`). Per-asset trims in `src/client/audio/trims.ts`.
- Client (`src/client/audio/`): Web Audio manager unlocked on the first click; master/effects/narrator/music volumes and
  mute on the start screen (persisted); music bus -14 dB and ducked under narrator lines; 2 s crossfades; title theme
  on the start screen, battle loops alternating in game, stingers at game over. `eventSounds.ts` maps engine events to
  sounds: moves (war-engine step or troop march), shots by `src/client/weaponFlavour.ts`, melee, power attacks,
  spells, dice, focus, boost, hits, misses, crippled systems, deaths, clouds and conditions, perspective-aware narrator.
- Hook: `presentation/director.ts` calls `playBeatAudio` once per beat. `?test=1` exposes `window.__audio.stats`.
- Tests: `tests/client/audio.test.ts` (mapping), `tests/e2e/audio.spec.ts` (every audition file exists; a game
  decodes 57 clips and plays moves, shots, dice, focus, narrator, title and battle music, no console errors).
- ElevenLabs account at about 23.1k of the 35.4k overnight ceiling (music cost about 12.5 credits per second).

## Spec status

| Spec | State |
|---|---|
| `00-architecture` | done; §14 logs `registerBundle` and the M2 flow additions |
| `10-rules-core`, `11-scenarios`, `12-rules-test-checklist` | done; open points in `docs/needs-rules-check.md` |
| `20-data-schema` + `schemas/` | done |
| `30-figures`, `40-ai`, `50-client`, `60-testing` | done |
| `13-golden-first-turn` | done; GOLD-001 passes with 3 recorded deviations (R8.6 one upkeep per model, Take Down, see RULINGs) |
| `factions/cygnar.md`, `factions/khador.md` | QS-2025 values marked; open: app version, spell stats, trooper box counts |

## Known gaps (engine)
- (M4 closed: slam and trample are Normal Movement options per R7.12/R7.14; `query.attackPreview` takes `attackType`
  and infers `chargeAttack`; see §14. `npm run sim -- --games 30 --seed 4`: 30/30 end, 0 violations.)
- `reroll`, `rollAnyway`, `chooseGrid`, `combinedAttack`, `channel` decisions are not raised by the starter content.
- Out-of-activation attacks other than Avenging Force (Reciprocate etc.) are not needed by the starter lists.
- Additional attacks while initial attacks remain are accepted but not listed as options.

## Known gaps (client)
- Attack previews for weapons with shot modes (e.g. a blast shot) show the standard shot's odds:
  `query.attackPreview` has no attackType option (engine change needed). Charge-attack previews do not pass
  `chargeAttack` (the client cannot tell a charge attack apart; the engine could infer it).
- Movement is click-to-place (single waypoint); multi-waypoint paths need Shift-click. No drag yet.
- Side colours are fixed by seat (A blue, B orange), not by faction. Left activation panel repeats some card stats.
- Game chunk is ~1.05 MB (three.js + board); the start chunk is ~0.47 MB.

Next: owner playtest feedback on the Pages build, then M4 AI (see HANDOFF.md).
