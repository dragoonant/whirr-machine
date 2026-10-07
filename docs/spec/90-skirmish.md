# 90 Skirmish (50 points): game size, lists, new models, work packages

Plan for the second game size. Owner decision (2026-10-07): each of the six factions gets **one** 50-point list =
its current starter (`src/data/lists/*-recon.json`) plus the add-ons MK4 players actually field with that Leader.
Every source is listed with its URL in `90-skirmish-sources.md` (tags below such as `[LS-cai]` point there). All
prose is ours; names and numbers are the real ones (IP rule, Mallet posture). MK4 only: no facing, free strikes, STR
or templates; melee range 1" (2" reach); run = SPD + 5".

Tags: `RB p<n>` MK4 rulebook (abridged digital), `SR p<n>` Steamroller 2026 January pack, `TF p<n>` Steamroller 2026
*Tales from the Frontlines*, `QS p<n>` Quick Start Jul 2025, `91 <§>` the M13 spec `91-cards-steamroller-clock.md`
(written in parallel; it read the SR scenario maps), `LS` Longshanks list data, `WA` Warmachine Academy wiki,
`CD` community card data (isorna/wardice-warmachine-data, app dump 2026-07-10).

---

## A. Game-size rules and how they map onto our scenario system

### A.1 The rules (sourced)

| ID | Rule | Source |
|---|---|---|
| SK1 | Skirmish = **50 army points**. A list may be up to **4 under** (46 to 50), never over. The Leader is free | RB p118 |
| SK2 | The Leader's battlegroup must hold **≥1 non-lesser Cohort model** (warjack or warbeast, light or bigger). **No battle engines, colossals or gargantuans** | RB p118 (same as Recon) |
| SK3 | One Faction, one army, one Leader. Mercenaries only where the army lists them | RB p119 |
| SK4 | Characters (FA C): one of each named profile; FA caps every other entry; solos bought in groups count FA per group | RB p119–120 |
| SK5 | Customizable warjacks: cost = sum of the chosen hardpoints (head + arms + back/support) | RB p118 sample army; every LS list (e.g. Courser 1+2+3 = 6) |
| SK6 | Command cards: five per player at every level | RB p118 step 5, p121; 91 CC1. **Not in our engine yet** (M13) |
| SK7 | Table **48" × 48"** ("typically 4' × 4'"). SR terrain guide divides the table into four 24" quadrants | RB p116; SR p15 |
| SK8 | Deployment: generic default first player 7", second 10" (RB p117); **every SR 2026 map uses 6" / 11"** (91 SR2). Advance Deployment +3". Unit models within 3" of each other | RB p117; SR maps via 91 SR2 |
| SK9 | Turn order: roll-off winner picks first/second (Attacker/Defender); the second player picks the edge | RB p116 steps 06–07; SR p2 |
| SK10 | Scoring from the **second player's round-2 turn**, both players at the end of every turn; lead by 3 after the opponent's turn wins | SR p5–11; TF p8–13 |
| SK11 | Fixed game length: the game ends at the end of the second player's **7th** turn; then VP, then scenario presence | SR p5–11 |
| SK12 | **Kill Box**: from the first player's round-2 turn, a Leader ending its turn completely within 12" of its own edge gives the opponent 2 VP | SR p3; TF p4 (TF calls it optional for learners) |
| SK13 | Chess clock at 50 points: **30 minutes per player** | SR p14 |
| SK14 | Terrain: SR 10–14 pieces on 48", none within 3" of an edge, ≥4 LOS blockers, ≥1 hazard, obstructions ≥6" apart; TF recommends 10–12 for its 50-point scenarios | SR p15; TF p5 |
| SK15 | *Tales from the Frontlines* scenarios are "most balanced at 50pt games"; TF recommends **Execution Mode** at 50 points or less | TF p3–4 |
| SK16 | Organised-play rounds at 50 points use the normal SR scenarios (the clock table lists 50) | SR p14 |

Game-size table for the start screen (RB p118; clock SR p14):

| Level | Points | Table | Leader battlegroup | Banned | SR clock |
|---|---|---|---|---|---|
| Recon | 30 | 36" (QS p35) | ≥1 non-lesser Cohort | battle engines, colossals, gargantuans | 20 min |
| **Skirmish** | **50** | **48"** | ≥1 non-lesser Cohort | battle engines, colossals, gargantuans | 30 min |
| Pitched Battle | 75 | 48" | ≥1 non-lesser Cohort | — | 50 min |
| Grand Melee | 100 | 48" | ≥1 non-lesser Cohort | — | 60 min |

### A.2 Rulings for this game size

Copy these into `docs/needs-rules-check.md` (this agent does not own it):

- RULING: Skirmish table | 48" × 48" for every skirmish scenario | RB p116 "typically 4' × 4'", SR p15 quadrants of 24"
- RULING: Skirmish deployment depth | 6" first player, 11" second, +3" Advance Deployment | every SR 2026 map (91 SR2) and the QS use 6/11; RB p117's 7/10 is only the generic default
- RULING: Execution Mode at 50 points | not used; Skirmish plays Assassination | TF p4 only *recommends* Execution at ≤50 points, SR p4 plays Assassination, and the engine has no Vulnerable state. Execution Mode stays a later option
- RULING: command cards at Skirmish | none until M13 lands; then the M13 start-screen toggle applies to Skirmish as to Recon | RB p121 gives five at every level; the engine has no cards yet
- RULING: terrain count at 48" | the 4/3 scale-up of each 36" layout (7–8 pieces, 70 §D) stands in for SR's 10–14 | no 48" layouts are authored yet; gaps grow to ≥5.46"
- RULING: customizable warjacks in lists | each list's warjack is a **fixed-loadout profile** (one profile per build, like `men.crusader`), and the list entry has no `loadout` | the engine builds models from profiles only; `loadout` is in the list schema but nothing reads it
- RULING: command attachments | none in the skirmish lists (Hunting Dog, Ravager Chieftain, Stone Scribe Elder, Defender Standard Bearer are left out even where popular) | `buildArmy` never fills `UnitState.attachments`; attachments are a later engine feature
- RULING: lists under 50 | Khador 49 and Circle 47 stand | RB p118 allows up to 4 under; the next popular add-on would go over 50
- RULING: Gunnbjorn version | the Trollbloods list keeps **Captain Gunnbjorn** (United Kriels). Longshanks' 48 "Gunnbjorn" lists are **General Gunnbjorn** in Southern Kriels Kithguard, a different model and army | the starter is United Kriels; only its add-ons are taken from the 4 public Captain Gunnbjorn lists
- RULING: Dire Wolf head cost | use the Oct 2026 list cost (Accuracy 1 + Cannon 5 + Heavy Chain Gun 5 = 11) | CD and older LS lists price Shield Guard at 0, WA (2026-04-13) gives the chassis range 10–14; the chosen build avoids the disputed head
- RULING: Skirmish scenario before M13 | S3 (below) is point-symmetric with objectives only, so it needs no attacker-frame rotation, flags or caches | 91 B.5 lists those as missing engine features

### A.3 Scenario S3 for today's engine: **Copperline Crossing** (`scn-copperline-crossing`)

Our own scenario, built only from features the engine has (V1, V2.1, V2.2, V1.7). It is the default Skirmish
scenario now; when M13 ships the seven SR 2026 scenarios (91 B.4, `levels` include `skirmish`), they join the
Skirmish scenario list and S3 stays as the learner's choice. Layout idea: one 50 mm and one 40 mm objective on each
flank, staggered so each player has a 50 mm close to them on their left and a 40 mm close to them on their right
(point-symmetric about the origin). The 50 mm wants a Leader or Cohort model, the 40 mm a whole unit, so both army
halves have a job.

| Setting | Value |
|---|---|
| `levels` | `["skirmish"]` |
| `table` | `{w: 48, d: 48}` |
| `deployment` | `{first: 6, second: 11, advance: 3, unitSpread: 3}` (zones: first z ∈ [−24, −18], second z ∈ [13, 24]; Advance −15 / +10) |
| `rounds` | 7 |
| `scoring` | `{fromRound: 2, fromPlayer: 'second', winMargin: 3, winOnOpponentTurnOnly: true, leaderPresence: 10}` |
| `killBox` | `{fromRound: 2, fromPlayer: 'first', depth: 12, vp: 2}` |
| `terrainLayout` | `layout.village-2-48` (fallback only; a derived record, see A.4) |

Elements (centres, inches, origin = table centre, +z toward player B; V2 default `hold`/`contest` per kind):

| id | kind | pos (x, z) | VP |
|---|---|---|---|
| `el-50-w` | objective50 | (−10, −3) | 1 per scoring point while secured |
| `el-50-e` | objective50 | (10, 3) | 1 |
| `el-40-w` | objective40 | (−10, 3) | 1 |
| `el-40-e` | objective40 | (10, −3) | 1 |

Checked against all 15 scaled layouts (`<id>-48`, footprints from `src/data/terrain/pieces-*.json`): **no
footprint overlaps any objective base**, and the nearest impassable piece is 2.96" from a base edge (outpost-3
blockhouse). The first draft at (±12, ±3) clipped six flank forests and hills and sat 0.96" from the outpost-3
blockhouse, so it was moved in. Engine agent: keep this as a data test (TER-110 below) so a future layout cannot
break it.

Scenario `text` (ours, for the record): "Four objectives hold the river flanks. A big one needs a Leader, warjack or
warbeast nearby; a small one needs a Leader or a whole unit. Each one you hold scores a point at the end of every
turn from the second player's second turn. Lead by three after your opponent's turn, kill the enemy Leader, or have
more points after round seven."

### A.4 Engine, data and client changes (exact files)

No frozen contract changes (`types/actions/events/hooks/rng/decider/index.ts` untouched). `GameSetup.layout`
already carries the layout id (70 §E).

| # | Change | File(s) |
|---|---|---|
| E1 | **Point cap from the level**, not from the declared total: `cap = LEVEL_CAP[list.level]` (recon 30, skirmish 50, pitched 75, grandMelee 100), floor `cap − 4`; both lists must have the same level and the scenario's `levels` must include it, else `E_BAD_SETUP`. Today `cap = list.points ?? 30` | `src/engine/setup.ts` |
| E2 | **Derived 48" layouts in the bundle**: `loadBundle` adds a `<layout id>-48` record (70 §D `scaleLayout48`, moved to a pure helper so `src/data` does not import the engine) for every board layout, before `checkRefs`, so `buildTerrain` and `scenarioAnchorProblems` find them. Board records gain nothing (keep `layouts` 36") | `src/data/index.ts`, new `src/data/layout48.ts`; `src/data/battlefields.ts` re-exports `scaleLayout48` from it |
| E3 | **Eligible layouts by table size**: for a 48" scenario `eligibleLayouts` returns the board's layouts mapped to their `-48` ids (then the anchor filter); for 36" unchanged | `src/data/battlefields.ts` |
| E4 | S3 data and registration | new `src/data/scenarios/copperline-crossing.json`; `src/data/raw.ts` (one import line) |
| E5 | Validator: lists check level cap and floor (already), and **TER-110**: every element of every 48" scenario has ≥1" clearance from impassable footprints and no overlap with obstacles in every eligible layout | `tools/validate-data.ts` |
| E6 | Sim and bench take a game size: `--size skirmish` picks the `*-skirmish` lists and S3; `--lists` still overrides | `tools/sim.ts`, `tools/ai-bench.ts` |
| E7 | Spec | `docs/spec/11-scenarios.md` (S3 section), `docs/needs-rules-check.md` (A.2 RULINGs) |
| C1 | Start screen: **Game size** select (Recon 30 / Skirmish 50) above "Your side"; it filters "Your side" and "Opponent army" to lists of that level (`sideChoices(level)`) and Scenario to scenarios whose `levels` include it (`scenarioChoices(level)`); the choice is remembered in `wm.settings`; the side cards show the points total | `src/client/ui/start/{StartScreen.tsx,startOptions.ts,start.css}`, `src/client/store/settingsStore.ts` |
| C2 | URL `?size=recon|skirmish` (unknown → recon, one console warning); `?lists=` faction ids resolve to that size's list (`?lists=cyg,kha&size=skirmish` → `cyg.l.skirmish`, `kha.l.skirmish`) | `src/client/App.tsx`, `src/client/store/testHooks.ts` |
| C3 | 48" table on screen: camera presets, zone overlays, Kill Box line and the initial "behind my zone" camera read `state.scenario.table`, not 36; check the ruler/threat rings and the board surround at 48" | `src/client/board/{layout.ts, Board.tsx, camera*}` (whatever reads `DEFAULT_TABLE`) |
| C4 | Help: one line in How to Play on game sizes | `src/client/ui/help/helpContent.ts` |
| A1 | AI: see WP-AI (D) | `src/ai/*` |

Not needed: new event or action types, new decision kinds, new scenario element kinds.

---

## B. The six 50-point lists

Method: Longshanks (warmachine.longshanks.org) event history pages 1–24 (2026-05-06 to 2026-10-05, 576 events)
were scanned for players whose round results show one of our six Leaders, then every public list of those players
was read (598 player-events, 511 with public lists). Counts below are "lists containing the model" among the lists
led by that Leader (duplicates per player removed). Most are 100-point lists; the 50-point and 30-point lists found
are quoted in full in the sources file. Points are the LS list prices (app prices at the event date), cross-checked
with CD and WA. "Exists" = already in `src/data`.

### B.1 Cygnar — Major Allister Caine, Storm Legion → `cyg.l.skirmish` (50)

Evidence: 53 Caine lists (32 Storm Legion, 20 Gravediggers) `[LS-cyg]`. Most taken after the starter four: Tempest
Assailers 31, Storm Vanes 29, Eilish Garrity (merc) 26, Legionnaire Officer 25, Eiryss (merc) 22, Courser 17+
(builds: Shield Guard head 17, Heavy Stormthrower 14, Voltaic Punching Spike 11). The one 50-point Caine list
`[LS-35900]` adds Magnus and Invictus (mercenary super-heavy pair; not a starter add-on).

| Entry | Pts | Status | Why |
|---|---|---|---|
| Major Allister Caine | 0 | exists `cyg.caine` | starter Leader |
| Deuce | 17 | exists `cyg.deuce` | starter (37/53) |
| Captain Bastian Falk (Advance Deployment) | 4 | exists `cyg.falk` | starter (29/53) |
| The Black 13th ×3 (Advance Deployment) | 9 | exists `cyg.black13` | starter (51/53) |
| Tempest Assailers ×3 | 9 | **new** `cyg.tempest-assailers` | the most-taken add-on (31/53); a hard melee screen Caine's gun line lacks |
| Storm Vanes ×3 | 5 | **new** `cyg.storm-vanes` | 29/53; anti-shooting support for the Black 13th |
| Courser (Shield Guard / Heavy Stormthrower / Voltaic Punching Spike) | 6 | **new** `cyg.courser-sg` | the common 6-point build (WA calls it the standard package); a second focus target for Caine |
| **Total** | **50** | 3 new | |

### B.2 Khador — Kapitan Zahara Vilkul, Winter Korps → `kha.l.skirmish` (49)

Evidence: 44 Vilkul lists `[LS-kha]`; 5 of them are 50-point lists `[LS-38172, LS-34007, LS-34682, LS-34090 ×2]`,
and **all five add a second heavy** (Dire Wolf 3, Avalanche 2, Great Bear 1). Across all 44: Arkanists 33, Shock
Trooper Gunners 29, Winter Korps Officer 29, Battle Mechanik 29, Winter Korps Snipers 28 (+ Hunting Dog 28).

| Entry | Pts | Status | Why |
|---|---|---|---|
| Kapitan Zahara Vilkul | 0 | exists `kha.vilkul` | starter Leader |
| Razor | 17 | exists `kha.razor` | starter (25/44) |
| Sergeant Goran Lazarenko (AD) | 4 | exists `kha.lazarenko` | starter (18/44; in 4 of 5 skirmish lists) |
| The Hounds ×3 (AD) | 9 | exists `kha.hounds` | starter (42/44) |
| Dire Wolf (Accuracy / Cannon / Heavy Chain Gun) | 11 | **new** `kha.dire-wolf-gun` | second heavy, as every 50-point Vilkul list does; this build is the newest skirmish list's `[LS-38172]` and a gun jack suits Vilkul's ranged plan |
| Arkanists ×3 | 4 | **new** `kha.arkanists` | the most-taken support (33/44): spends power to feed the two warjacks |
| Winter Korps Snipers ×3 | 4 | **new** `kha.wk-snipers` | 28/44; a cheap unit that can secure 40 mm objectives |
| **Total** | **49** | 3 new | (Hunting Dog +1 would make 50; attachments are out, A.2) |

### B.3 Trollbloods — Captain Gunnbjorn, United Kriels → `trl.l.skirmish` (50)

Evidence: 4 public Captain Gunnbjorn United Kriels lists `[LS-trl]` (75–100 points): Krielstone Bearer & Stone
Scribes 4/4, Trollkin Runebearer 4/4, Dozer & Smigg 3/4, Trollkin Gunnery Sergeant 3/4, Troll Whelps 3/4,
Mountain King 2/4. Dozer & Smigg has a bond to Gunnbjorn on its card (CD `bondGunnbjorn`). The far more common
"Gunnbjorn" on Longshanks (48 lists) is General Gunnbjorn of the Kithguard army (RULING A.2).

| Entry | Pts | Status | Why |
|---|---|---|---|
| Captain Gunnbjorn | 0 | exists `trl.gunnbjorn` | starter Leader |
| Dire Troll Bomber | 17 | exists `trl.bomber` | starter (3/4) |
| Braylen Wanderheart (AD) | 4 | exists `trl.braylen` | starter |
| Trollkin Highwaymen ×3 (AD) | 7 | exists `trl.highwaymen` | starter |
| Dozer & Smigg | 14 | **new** `trl.dozer-smigg` | character heavy bonded to Gunnbjorn; a second gun beast for his ranged plan |
| Krielstone Bearer & Stone Scribes (Bearer + 3 Scribes, confirm size) | 5 | **new** `trl.krielstone` | 4/4; the army's defensive aura unit |
| Trollkin Runebearer | 3 | **new** `trl.runebearer` | 4/4; casts Gunnbjorn's spells from range (spell slave) |
| **Total** | **50** | 3 new | |

### B.4 Circle Orboros — Tanith the Feral Song, Devourer's Host → `cir.l.skirmish` (47)

Evidence: Tanith appeared 3 times on Longshanks in the scan window but **none of her lists is public**. The add-ons
therefore come from the 7 distinct public Devourer's Host lists of the same window `[LS-cir]` (Wurmwood, Kromac,
Iona, including one 50-point Kromac list `[LS-38172b]`): Gallows Grove 6/7, Tharn Wolf Riders 5/7, Tharn Ravager
Shaman 5/7, Tharn Wolf Rider Champion 5/7, Tharn Bloodtrackers 4/7, Warpwolf Stalker 4/7, Wild Argus 4/7 (in the
50-point list too). Gallows Grove (1 pt, a stationary grove solo: WA shows DEF 5) is left out until its rules are
checked; two of them would lift the list to 49 (owner question).

| Entry | Pts | Status | Why |
|---|---|---|---|
| Tanith the Feral Song | 0 | exists `cir.tanith` | starter Leader |
| Pureblood Warpwolf | 15 | exists `cir.pureblood` | starter |
| Lord of the Feast (AD) | 5 | exists `cir.lord-of-the-feast` | starter |
| Tharn Ravagers ×3 | 9 | exists `cir.ravagers` | starter (6/7 lists) |
| Tharn Wolf Riders ×3 | 8 | **new** `cir.wolf-riders` | the most-taken unit add-on (5/7); fast cavalry flankers |
| Tharn Ravager Shaman | 4 | **new** `cir.ravager-shaman` | 5/7; protects Tharn from shooting, heals Ravagers |
| Wild Argus | 6 | **new** `cir.wild-argus` | 4/7 and in the 50-point list; a light beast for Tanith's battlegroup whose animus lowers DEF |
| **Total** | **47** | 3 new | (the Wolf Rider Champion, 5/7, would make 51) |

### B.5 Cryx — Wraithbinder Nekane, Necrofactorium → `cry.l.skirmish` (50)

Evidence: 21 Nekane lists `[LS-cry]`, one at 50 points `[LS-36739]` and two at 30. Raptor 20/21 (Arc Node back on
almost every one; heads Doomspitter 15, Beaked Maw 12), Night Terrors 18, Necrosurgeon Initiates 16, The Furies 15,
Machine Wraith Dominator 10. The 50-point list is Hades, Raptor, Night Terrors, Brutes, Initiates and two solos.

| Entry | Pts | Status | Why |
|---|---|---|---|
| Wraithbinder Nekane | 0 | exists `cry.nekane` | starter Leader |
| Hades | 16 | exists `cry.hades` | starter |
| Master Necrotech Chatterbane | 4 | exists `cry.chatterbane` | starter |
| The Furies ×3 | 10 | exists `cry.furies` | starter (15/21) |
| Night Terrors ×3 | 10 | **new** `cry.night-terrors` | 18/21; incorporeal cavalry that finishes damaged models |
| Raptor (Doomspitter / Arc Node) | 6 | **new** `cry.raptor-arc` | 20/21; Nekane's arc node, the most common head |
| Necrosurgeon Initiates ×3 | 4 | **new** `cry.initiates` | 16/21; feed focus to warjacks, raise fallen grunts |
| **Total** | **50** | 3 new | |

### B.6 Protectorate of Menoth — Feora, Marshal of the Flameguard, Covenant of the Flame → `men.l.skirmish` (50)

Evidence: 5 Feora lists from September 2026 events (the army was playable in the app and on Wartable before the
kits ship) `[LS-men]`: Cleanser Preceptor 5/5, Vassals of Menoth 5/5, Revenger 5/5 (Repulsor Shield 7, Light
Immolator 5, Arc Node / Defensive / Paladin heads), Cleanser Sanctifiers 4/5, Pyrrhus 4/5. These are the first
lists of a brand-new army, so the evidence is thin (see sources). The LS prices match the starter costs already in
our data: Crusader 13 (Venerable 2 + Blazing Star 5 + Flame Belcher 6), Valeria 5, Pyrrhus 4, Flameguard Defenders 8.

| Entry | Pts | Status | Why |
|---|---|---|---|
| Feora, Marshal of the Flameguard | 0 | exists `men.feora` | starter Leader |
| Crusader (Venerable / Blazing Star / Flame Belcher) | 13 | exists `men.crusader` | starter |
| Valeria, the Whisper of Death (AD) | 5 | exists `men.valeria` | starter |
| Pyrrhus, Flameguard Commander | 4 | exists `men.pyrrhus` | starter |
| Flameguard Defenders ×5 | 8 | exists `men.defenders` | starter |
| Revenger (Arc Node / Repulsor Shield / Light Immolator) | 7 | **new** `men.revenger-arc` | 5/5; the new plastic light jack, an arc node for Feora |
| Cleanser Sanctifiers ×3 | 9 | **new** `men.cleanser-sanctifiers` | 4/5; armoured medium-base Cleansers |
| Vassals of Menoth ×3 | 4 | **new** `men.vassals` | 5/5; warjack support for two jacks |
| **Total** | **50** | 3 new | (the Cleanser Preceptor, 5/5, does not fit: adding it makes 55, swapping it for the Vassals makes 51) |

**New models: 18 (3 per faction), 19 figure sculpts** (the Krielstone has two). All are in-print kits: the
Storm Legion, Winter Korps, Necrofactorium and Covenant ranges are SFG plastic; Dozer & Smigg, the Krielstone, the
Runebearer, the Wolf Riders, the Ravager Shaman and the Wild Argus are older Privateer Press kits still sold
through SFG/retailers for the Legacy armies (confirm stock when sculpting; figures only need reference photos).

---

## C. Per new model: what to research, base, sculpt

Every new model needs **all** of its card data from the newest MK4 source (the official app first; WA and CD as
cross-checks; the LS price as the cost check): name and `shipName`, type and class, keywords, FA, **points** (and
each hardpoint's cost for jacks), **unit size** and trooper roles, **base**, SPD MAT RAT AAT DEF ARM (ARC/CTRL n/a),
**health** (boxes per trooper, warjack grid with system letters, warbeast life spiral with aspects), FURY and THR
for beasts, every weapon (RAT/MAT, RNG, ROF, AOE, POW, location, qualities, damage type, abilities), every advantage
and ability (own words), granted or leadership rules, special actions and attacks, spells or animus. Mark each value
with the confidence key the faction specs use. The column "Engine work" names rules the engine lacks today
(grep of `src/engine` and `src/data/core`); the faction agent writes faction-only hooks, the core list goes to WP-CORE.

| New id | Figure slug | Base | Known so far (to confirm) | Engine work | Sculpt (pose, weapons) |
|---|---|---|---|---|---|
| `cyg.tempest-assailers` | `wm-tempest-assailer` (1 sculpt ×3) | 40 (WA) | 3 models, 9 pts, FA 2; SPD 5 MAT 7 DEF 12 ARM 18, 8 boxes each; Heavy Voltaic Hammer RNG 2 POW 15; Resistance: Electricity, Repulsor Field, Shield Wall, Smite | Repulsor Field, Smite (slam d6"), Shield Wall exists (Hounds) | heavily armoured Storm Legion trooper striding forward, long two-handed voltaic war hammer raised, crackling coils, shield plate on the off arm, blue-and-white plating |
| `cyg.storm-vanes` | `wm-storm-vane` (×3) | 30 (WA) | 3 models, 5 pts, FA 2; SPD 5 RAT 5 DEF 12 ARM 14, 5 boxes; Storm Surge spray RNG Sp6 POW 10; Galvanic Capacitor, Lightning Wreath, Polarity Field Generator, Wind Weaver, Plasma Nimbus | Wind Weaver (anti-ranged aura), granted Electro Leap | stormsmith in a coat with a back-mounted spinning vane rotor and a gauntlet spray emitter held forward, sparks around the vanes |
| `cyg.courser-sg` | `wm-courser` | 40 (confirm) | light warjack, SPD 6 MAT 5 RAT 6 DEF 14 ARM 16, 26-box grid; Shield Guard 1 + Heavy Stormthrower 2 + Voltaic Punching Spike 3 = 6; Insulated Cortex, Resistance: Electricity | Shield Guard | lean Cygnar light warjack mid-stride, stormthrower gun arm levelled right, spiked punching fist left, small domed head with a shield-guard plate |
| `kha.dire-wolf-gun` | `wm-dire-wolf` | 50 (confirm) | heavy warjack SPD 5 MAT 6 RAT 4 DEF 10 ARM 19, 30-box grid; Accuracy head (+1 RAT) 1 + Cannon (RNG 12 POW 15, Beat Back, crit knockdown) 5 + Heavy Chain Gun (RNG 10, ROF d3+1, POW 12, Volley Fire) 5; Anchor | Beat Back exists; Volley Fire, Anchor | squat Khador heavy warjack with a boiler stack, heavy cannon arm right, belt-fed chain-gun arm left, braced stance, red armour with a sighting-lens head |
| `kha.arkanists` | `wm-arkanist` (×3) | 30 (WA) | 3 models, 4 pts, FA 4; SPD 6 AAT 4 DEF 13 ARM 13, 1 box; Magic Ability (Razor Wind), Empower, Sigil of Power | Empower (give focus/power to a jack), Magic Ability spells | Winter Korps arcanist in a fur-trimmed greatcoat, one hand raised trailing frost-blue sigils, a rune-etched focus rod in the other |
| `kha.wk-snipers` | `wm-wk-sniper` (×3) | 30 (WA) | 3 models, 4 pts, FA 3; SPD 6 MAT 4 RAT 6 DEF 13 ARM 13, 1 box; Hunting Rifle RNG 14 POW 10; Sniper, Advance Deployment | Sniper (choose damage or no hit penalty, per card) | kneeling Winter Korps rifleman in a snow cloak and fur cap, long scoped hunting rifle shouldered |
| `trl.dozer-smigg` | `wm-dozer-smigg` | 50 (WA) | heavy beast SPD 5 MAT 7 RAT 5 DEF 12 ARM 19 FURY 4 THR 10, 30-box spiral; Bombard RNG 14 AOE 3 POW 14/8, 2 Claws POW 15; Bond (Gunnbjorn), Bulldoze, Regeneration d3, Snacking, Gunfighter; animus Lucky Shot | Bond, Bulldoze, Snacking (Regeneration exists) | big dire troll hauling a huge bombard on its shoulder, a small pyg gunner (Smigg) perched on its back loading a shell, free claw clenched |
| `trl.krielstone` | `wm-krielstone-bearer`, `wm-stone-scribe` | Bearer 50? Scribes 30? (confirm) | unit 5 pts, FA 1; Bearer SPD 5 DEF 12 ARM 13, Tough; Protective Aura, Serenity, Take Up; Scribes with hand weapons POW 10; WA page not found, use CD + app | Protective Aura (ARM aura), Serenity, Take Up | Bearer: hulking trollkin hunched under a massive carved runestone strapped to his back, glowing runes; Scribe: trollkin with chisel and mallet, robes and braids |
| `trl.runebearer` | `wm-runebearer` | 40 (WA) | solo 3 pts, FA 1; SPD 6 AAT 6 DEF 12 ARM 14, 5 boxes; Attached, Arcane Repeater, Magic Ability, Guidance, Harmonious Exaltation, Spell Slave | Attached (bound to a beast or Leader per card), Spell Slave, Guidance | young trollkin runecaster holding a staff hung with rune tokens, other hand raised with a glowing glyph, satchel of stones |
| `cir.wolf-riders` | `wm-wolf-rider` (×3) | 50 (WA) | cavalry unit 3 models, 8 pts, FA 2; SPD 9 MAT 7 RAT 6 DEF 15 ARM 14, 5 boxes; Annoyance, Reposition 3, Unpredictable Movement, Unyielding; weapons (lance/thrown?) to research | **Cavalry** (boosted charge attack, RB p112), Unpredictable Movement, Annoyance | Tharn rider low on a huge grey wolf at full gallop, spear couched, bone trophies and fur |
| `cir.ravager-shaman` | `wm-ravager-shaman` | 40 (WA) | solo 4 pts, FA 2; SPD 6 AAT 6 MAT 7 DEF 13 ARM 15, 8 boxes; Magic Ability (Chain Lightning, Hunter's Grace, Sky Shaker), Blood Rage, Body Snatcher/Heart Eater, Rapid Healing, Treewalker | Magic Ability spells, Sky Shaker (blast resist, −RNG aura) | horned Tharn shaman with a bone-and-antler staff crackling with lightning, mid-chant, wolf pelt cloak |
| `cir.wild-argus` | `wm-wild-argus` | 40 (WA) | light beast SPD 6 MAT 5 DEF 14 ARM 15 FURY 3 THR 9, 21 boxes; bites ×2 (research); animus Doppler Bark | animus aura (DEF −) | two-headed shaggy wolf-hound mid-howl, both jaws open, bristling mane |
| `cry.night-terrors` | `wm-night-terror` (×3) | 50 (WA) | cavalry unit 3, 10 pts, FA 3; SPD 7 MAT 6 DEF 14 ARM 16, 5 boxes; Scything Blade POW 12; Cavalry, Incorporeal, Undead, Unstoppable; Apparition, Finisher, Reposition 3 | **Cavalry**, Finisher | ghostly wraith on a skeletal half-mechanical steed trailing green mist, long scythe blade swept back |
| `cry.raptor-arc` | `wm-raptor` | 40 (confirm) | light warjack SPD 7 MAT 5 RAT 5 DEF 14 ARM 14, 20-box grid; Doomspitter head 4 + Arc Node back 2 = 6; Dodge, Pathfinder | Eyeless Sight (Doomspitter, confirm), Arc Node exists | hunched raptor-like bonejack on clawed legs, gun-mouth head (Doomspitter), arc-node spire on its back, green vents |
| `cry.initiates` | `wm-initiate` (×3) | 30 (WA) | 3 models, 4 pts, FA 4; SPD 6 MAT 4 DEF 14 ARM 12, 1 box; Anatomical Precision, Grim Returns, Empower, Necrosurgery | Empower, Grim Returns (return a dead grunt) | hooded undead surgeon in a stained apron, bone saw and hooked implement, stitched mask |
| `men.revenger-arc` | `wm-revenger` | 40 (WA) | light warjack SPD 5 MAT 6 RAT 5 DEF 12 ARM 17, 26 boxes; Arc Node 1 + Repulsor Shield (POW 12) 3 + Light Immolator (flail POW 14) 3 = 7; Sanctified Hull | Arc Node exists; Repulsor Shield push, Sanctified Hull (as Crusader) | Menite light warjack with a tall crested head, round repulsor shield left, chained flail right, white-and-gold plating |
| `men.cleanser-sanctifiers` | `wm-sanctifier` (×3) | 40 (WA) | 3 models, 9 pts, FA 2; SPD 5 MAT 7 RAT 5 DEF 12 ARM 18, 8 boxes; weapons and rules to research (WA page thin) | per card | heavily armoured Cleanser in a full gas-mask helm with fuel tanks, flame weapon and a heavy blade (confirm from photos) |
| `men.vassals` | `wm-vassal` (×3) | 30 (WA) | 3 models, 4 pts, FA 2; SPD 5 DEF 13 ARM 13, 5 boxes; rules to research | likely repair/empower | robed Vassal mechanik with a wrench and a censer-like tool pack, hood and veil |

Unit composition note: WA lists unit sizes as the min; confirm min/max with the app (MK4 most units are fixed).

---

## D. Work packages

Two ordering constraints:

1. **M13 overlap.** The M13 spec (91 D.2) gives `src/engine/setup.ts` and `scenario.ts` to its WP3,
   `src/data/battlefields.ts` to WP7, `src/client/ui/start/*` to WP5 and `src/data/core/abilities.json`,
   `power-attacks.ts`, `phases/activation.ts` to WP2. The engine, core-rules and client packages below must run
   **before M13 starts or after it lands, never at the same time**. If M13 runs first, WP5 builds C1 (the game-size
   select) as part of its start-screen work and WP-CLI shrinks to C2–C4.
2. Data agents run first (in worktrees, one per faction); WP-ENG can run alongside them; WP-CORE after the data
   agents report which core abilities they reference; WP-CLI and WP-AI last; WP-FIG any time after the data ids are
   fixed (it needs only this spec and reference photos).

| WP | Owns (only) | Builds | Depends |
|---|---|---|---|
| **WP-D-cyg** | `src/data/factions/cyg/**`, `src/data/lists/cyg-skirmish.json`, `src/engine/factions/cygnar.ts`, `tests/data/cyg-skirmish.test.ts`, `docs/spec/factions/cygnar.md` (Skirmish section) | B.1 list; the 3 new profiles, weapons, abilities with the C research checklist and confidence marks; faction-only hooks | — |
| **WP-D-kha** | same pattern for `kha` / `khador.ts` / `khador.md` | B.2 | — |
| **WP-D-trl** | same pattern for `trl` / `trollbloods.ts` / `trollbloods.md` | B.3 | — |
| **WP-D-cir** | same pattern for `cir` / `circle.ts` / `circle.md` | B.4 | — |
| **WP-D-cry** | same pattern for `cry` / `cryx.ts` / `cryx.md` | B.5 | — |
| **WP-D-men** | same pattern for `men` / `menoth.ts` / `menoth.md`; also re-checks the starter profiles against WA (the M9 values were proxies) | B.6 | — |
| **WP-ENG** | `src/engine/setup.ts`, `src/data/index.ts`, `src/data/layout48.ts` (new), `src/data/battlefields.ts`, `src/data/raw.ts`, `src/data/scenarios/copperline-crossing.json`, `tools/validate-data.ts`, `tools/sim.ts`, `tools/ai-bench.ts`, `docs/spec/11-scenarios.md`, `docs/needs-rules-check.md`, `tests/engine/skirmish.test.ts`, `tests/data/skirmish-scenario.test.ts` | E1–E7 (A.4); RULINGs of A.2 | — |
| **WP-CORE** | `src/engine/code-hooks.ts`, `src/engine/attack.ts`, `src/engine/movement.ts`, `src/data/core/abilities.json`, `tests/engine/skirmish-core.test.ts` | shared mechanics the new cards use that no faction file should own: **Cavalry** (boosted charge attack roll, RB p112), **Shield Guard**, **Empower** (Arkanists, Initiates), **Attached** (Runebearer), **Sniper**, **Volley Fire**, Repulsor push, Smite/Bulldoze slam-push reuse, Finisher, Grim Returns (unit trooper return), Protective Aura. Any engine type change: additive, logged in 00 §14 and in `issues` | data agents' ability lists |
| **WP-CLI** | `src/client/ui/start/{StartScreen.tsx,startOptions.ts,start.css}`, `src/client/store/settingsStore.ts`, `src/client/App.tsx`, `src/client/store/testHooks.ts`, `src/client/board/{layout.ts,Board.tsx}` and the camera preset file, `src/client/ui/help/helpContent.ts`, `tests/client/start-size.test.ts`, `tests/e2e/skirmish.spec.ts` | C1–C4; e2e: each faction's skirmish list vs the Normal bot on S3 to round 2 with no page errors, screenshots `e2e-out/skirmish-<id>.png` and the picker at Skirmish | WP-ENG, data agents |
| **WP-AI** | `src/ai/{scenario.ts,deploy.ts,roles.ts,plan.ts}`, `tests/ai/skirmish.test.ts` | four-objective roles (a 50 mm needs a Leader or Cohort, a 40 mm needs a whole unit: send units, not solos, to 40 mm); deployment in the 6"/11" zones on 48" with about twice the models; decision time ≤ 10 ms mean with 15–20 models a side (worker budget); cavalry and incorporeal threat in `threat.ts` if WP-CORE adds them; `npm run bench:ai -- --size skirmish --games 20`: Normal beats Easy ≥ 14/20, 0 stalls | WP-ENG, WP-CORE |
| **WP-FIG** (optional, figure pipeline) | `public/assets/models/wm-<slug>.glb` for the 19 slugs in C, `public/assets/models/{manifest.json,skirmish-slugs.json}`, `src/client/figures/glbModels.ts`, `art/figure-sheets/skirmish-*.png` | MGSD figures from reference photos (outside the repo) per the Hunyuan pipeline | data ids fixed |

Acceptance for the stage: `npm run typecheck && npm test && npm run validate:data` green; `npm run sim -- --size
skirmish --games 30 --seed 1`: 30/30 end, 0 violations; every `*-skirmish` list loads and costs 46–50.

## E. Test IDs

| ID | Test |
|---|---|
| SKM-001 | each `*-skirmish` list: level `skirmish`, recomputed cost 46–50, ≥1 non-lesser Cohort, FA and character limits |
| SKM-002 | `createGame` rejects a skirmish list on a recon-only scenario and mixed levels (`E_BAD_SETUP`) |
| SKM-003 | S3 deployment zones: first z ∈ [−24, −18], second [13, 24]; Advance 3" deeper |
| SKM-004 | S3 scoring starts at the second player's round-2 turn; a lone solo cannot secure a 50 mm; a whole unit secures a 40 mm |
| SKM-005 | Kill Box on S3 from the first player's round 2 |
| SKM-006 | every `<layout>-48` record exists in the bundle and equals `scaleLayout48` of its source |
| TER-110 | S3 objectives clear all impassable footprints by ≥1" and overlap no obstacle in all 15 scaled layouts |
| SKM-007 | client: `?size=skirmish&lists=cyg,kha` starts a 48" game with both skirmish lists |
