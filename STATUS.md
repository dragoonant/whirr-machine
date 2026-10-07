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
- Tests: 619 unit tests in 61 files (M9 adds fury engine, faction data, AI fury, fury UI, picker and figure tests); M8 count 285 in 39; earlier count: 234 unit tests in 33 files (engine, data, AI, client store/board/HUD/start/prompts/figures/audio/M7 UI), including
  `tests/engine/golden.test.ts` (GOLD-001: the QS worked turns replayed through `step` with forced dice, 18 steps, all passing) and `tests/engine/index.test.ts` (API, invariants, a short sim).
- Starter data in `src/data/`; `npm run validate:data` checks the code-hook registry directly.

## Factions (M9)
- **Army picker** (start screen "Your side"): six factions, each with one starter list at recon level; the card lists
  the leader (Warcaster or Warlock), warjacks or warbeasts, solos and units. "Opponent army" picks any of the six (or
  Random, mirrors allowed). `?lists=trl,cry&control=bot,bot` also takes faction ids. Screenshot `e2e-out/m9-picker.png`.
- **Faction colours:** rings, zones, procedural figures and objective control take each faction's palette
  (`presentation/labels.ts` `sideColoursFor`); a mirror match gives side B a contrasting palette.

| Faction | Starter list (pts) | Leader | Rest |
|---|---|---|---|
| Cygnar | Quick Start Cygnar (30) | Captain Caine (warcaster) | Deuce, Falk, Black 13th x3 |
| Khador | Quick Start Khador (30) | Vilkul (warcaster) | Razor, Lazarenko, Hounds x3 |
| Trollbloods | Trollbloods Starter (28) | Captain Gunnbjorn (**warlock**) | Dire Troll Bomber, Braylen, Highwaymen x3 |
| Circle Orboros | Circle Orboros Starter (29) | Tanith (**warlock**) | Pureblood Warpwolf, Lord of the Feast, Tharn Ravagers x3 |
| Cryx | Necrofactorium Command (30) | Nekane (warcaster) | Hades, Chatterbane, The Furies x3 |
| Protectorate of Menoth | Defenders of the Flame Starter (30) | Feora (warcaster) | Crusader, Valeria, Pyrrhus, Defenders x5 |

- **Fury (engine, spec `docs/spec/81-warlocks-fury.md`):** warlocks hold fury (start at ARC), leech in Control, spend
  it on boosts, spells, upkeep and extra attacks; warbeasts are forced (run, charge, boost, power attacks, animus) and
  gain fury, threshold checks and frenzy, damage transfer, rile and shed, life spirals with crippled aspects, soul and
  corpse tokens (Cryx, Circle).
- **Warlock UI** (`src/client/ui/fury/`): flame pips on cards and over figures, battlegroup strip with frenzy odds,
  life-spiral card with aspects, leech form (per-beast steppers, frenzy odds after the leech, take-from-self warning),
  transfer and shed forms, forced costs shown as fury on the beast, frenzy flash, fury feed lines, a How to Play tab
  "Warlocks and fury". Screenshot `e2e-out/m9-fury.png` (leech form, round 2).
- **AI fury** (`src/ai/fury.ts`): leech plan by frenzy risk and reserve, forcing priced by frenzy cost, transfers,
  shed/rile wrap-up; easy keeps a point of room on each beast. `npm run bench:ai -- --xlist <list> --ylist <list>`
  tallies fury events per side.
- **Figures:** the 21 new models are now Hunyuan GLBs in `public/assets/models/` (`wm-<slug>.glb`, listed in `manifest.json`;
  slug to model map in `m9-slugs.json`; contact sheets `art/figure-sheets/m9-*.png`). Highwaymen and Defenders share one sculpt
  each; Ravagers and Furies have three sculpts, one per trooper. The procedural archetypes remain as the fallback. Every M9
  stat stays "U-cd" (unverified; M10 researches them on the web; see the M9 RULINGs in `docs/needs-rules-check.md`). Weakest figures:
  hades, nekane, valeria, pureblood; Tanith is being redone from the real sculpt (M10).
- `tests/e2e/factions.spec.ts`: the picker shot; the M9 gallery (`e2e-out/m9-gallery*.png`); each new faction bot vs bot (Normal) against a random other faction
  to round 2 with no page errors (`e2e-out/m9-<trl|cir|cry|men>.png`); a human Trollbloods game to the leech form.

## Figures and VFX (M5)
- 33 Hunyuan MGSD figure GLBs in `public/assets/models/`, one per model and per trooper (the M5 eight plus the M9 set). `figures/glbModels.ts` maps
  profile ids to slugs; `glbLoader.ts` loads each once (shared geometry and materials). The procedural figure stands
  in while a GLB loads or if it fails.
- Army painter (`glbPaint.ts`, `paintStore.ts`): a hue-band shader remaps each faction's two main hues; stock colours
  by default. Presets and colour pickers are on the gallery page only for now.
- Status visuals: knocked down tips over, stationary ice shell, crippled-system sparks and smoke, focus orbs, selection
  ring, destroyed fade. VFX (`src/client/vfx/`): muzzle flash and tracer, melee sparks, spell glow, blast ring, driven
  by presentation beats. Low graphics drops particles and shadows.
- `?gallery`: every figure GLB on a turntable with names, paint pickers and status toggles (procedural twin off by
  default).
- Frame time (headless Chromium, software WebGL, 1280x760, the first 8 GLBs on the table, camera panning): 18.5 ms mean,
  33 ms p95. A real GPU will be faster.

## Battlefields (M8)
- Five themed boards (`docs/spec/70-terrain-boards.md`): Hollowmere Bog, Veilstone Ruins, Ironpine Hamlet, Cinder Blight,
  Frostline Outpost. Each has its own ground mat (`public/assets/terrain/boards/<board>/`, made by
  `art/board-textures/gen.py` from CC0 Poly Haven bases), light and fog tint, and 7-8 pieces; 15 layouts. A game picks
  the board and layout from its seed unless the start screen (Battlefield select) or `?board=` names one; `?layout=`
  forces an eligible layout (tests). The Quick Start demo keeps its own terrain, reskinned by the board.
- 35 Hunyuan terrain GLBs in `public/assets/terrain/` (about 6k triangles each after the decimation in 8ee9ef5, which also redid the dais, bone spikes and grove) (contact sheets in `art/terrain-sheets/`), fitted to the rules
  footprints by `board/terrainFit.ts` and instanced per slug; the procedural stand-in draws while loading or on failure.
  The trench and the ash flats are procedural (`board/proceduralPieces.tsx`): a stencil-cut zig-zag trench with plank
  revetments, duckboards and berms that blend into the mat, and an ash decal with ember cracks and charred stumps.
- `tests/e2e/boards.spec.ts`: Khador vs the Normal bot on each board, deploy plus one round through UI clicks, no page
  errors, every terrain GLB 200, screenshots `e2e-out/board-<id>.png` (and `-close.png` for outpost and wasteland).
- Frame time (headless Chromium, software WebGL, 1280x760, High): the art spec (M5 method, close camera) 23.4 ms mean
  on Cinder Blight; the overview camera panning over the whole table with the HUD up 76-86 ms per board (Low
  graphics about 20 ms). Main costs there: MSAA, the terrain GLBs (12k triangles each when measured; decimated to about 6k in 8ee9ef5), the mat maps. A real GPU is far faster.

## Polish (M7)
- Event feed with attack breakdowns (dice, boosts, target number, expected vs actual damage) and per-turn damage
  totals. End screen with the cause, VP per round, damage per side, Play again and Menu.
- Settings popover (gear in the top bar): speed, graphics Low/High, narration pauses, tips. Phase and turn banners
  pause the narration (scaled by speed; a click skips). Title art (gold gears and steam). The start screen keeps Start
  above the fold at 1280x760 (one-row sound controls).
- `tests/e2e/art.spec.ts`: Khador vs the Normal bot for two rounds through UI clicks (the warcaster hangs back; Razor
  is activated by clicking its figure for the close-up). It checks that all GLBs load with no page errors, measures
  ms/frame, fast-forwards to the end screen, and writes `e2e-out/art-*.png` and `gallery.png`.
  `PW_PORT=4183 npx playwright test` runs the suite on another port when 4173 is taken.

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
| `81-warlocks-fury`, `factions/{trollbloods,circle,cryx,menoth}.md` | done (M9); every card value unverified, RULINGs in `docs/needs-rules-check.md` |

## Known gaps (engine)
- (M4 closed: slam and trample are Normal Movement options per R7.12/R7.14; `query.attackPreview` takes `attackType`
  and infers `chargeAttack`; see §14. `npm run sim -- --games 30 --seed 4`: 30/30 end, 0 violations.)
- `reroll`, `rollAnyway`, `chooseGrid`, `combinedAttack`, `channel` decisions are not raised by the starter content.
- Out-of-activation attacks other than Avenging Force (Reciprocate etc.) are not needed by the starter lists.
- Additional attacks while initial attacks remain are accepted but not listed as options.

## Known gaps (client)
- Movement is click-to-place (single waypoint); multi-waypoint paths need Shift-click. No drag yet.
- Left activation panel repeats some card stats.
- Game chunks total ~1.1 MB (three.js, board, figures); the start chunk is ~0.55 MB. At 1280 wide the side panels
  cover much of the board.
- The army painter has no in-game control yet (gallery only).

Next: M10 in progress overnight (web-sourced M9 faction stats, Tanith redo). Then M11 to M13; see PLAN.md and HANDOFF.md.
