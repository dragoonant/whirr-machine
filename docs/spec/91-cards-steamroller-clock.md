# 91 Command cards, Steamroller 2026 scenarios, game clock (M13)

Spec for M13 (PLAN.md). Three features, one contract pass, seven work packages. All prose here is our own
summary of the mechanics; card and scenario names are the real ones (IP rule, Mallet posture). Coordinates follow
20 §7 and 11: inches, origin = table centre, `{x, z}`.

Sources (checked 2026-10-07):

| Tag | Source |
|---|---|
| `SR p<n>` | `docs/sources/WM-Steamroller-2026-JanuaryRules.pdf` and the printer-friendly copy (same text). Scenario maps read from the rendered pages 5 to 11 |
| `RB p<n>` | `docs/sources/WMH-MK4-Rulebook_Digital_144-OP_Abridged.pdf` (Command Cards p121, encounter levels p118, setup p115 to 117) |
| `TF` | `docs/sources/WM-Steamroller-2026-TalesFromTheFrontlines...pdf`: casual scenarios, leagues, campaigns. No command-card list, no clock rules; not used below |
| `CL26` | Mid-Year Update 2026 changelog v1.1: https://cdn.shopify.com/s/files/1/0602/0156/6449/files/WM-Changelog-2026-June-B_W.pdf (the previous universal cards were cut, five new universal cards added; Defenses are no longer a card, each Defense costs points, FA 3 in total) |
| `WA` | Warmachine Academy wiki, Commands page (last edited 2026-10-04): https://warmachineacademy.miraheze.org/wiki/Commands and its `Template:Command:_*`, `Barrier`, `Fire_Pit`, `Powder_Keg`, `Spike_Trap`, `Template:Dig_In`, `Template:Set_Defense`, `Template:Sturdy` pages |
| `BTH` | Boost to Hit, mid-year 2026 notes: https://boosttohit.home.blog/2026/06/04/winners-losers-and-hot-takes-from-the-mid-year-update/ (every army has the same five universal cards; Defenses moved onto the army list; the Sapper card was cut) |
| `PP24` | Privateer Press app update 2024-01-10: https://home.privateerpress.com/2024/01/10/warmachine-app-update-january-10-2024/ (older cards: High Alert, Grave Robbing, Duck!, Put the Fires Out; history only) |
| `PP23` | Privateer Press MKIV preview: Defenses, 2023-01-20: https://home.privateerpress.com/2023/01/20/warmachine-mkiv-preview-defenses/ (placement limits; older than CL26) |
| `BETA` | MKIV beta card PDF 2022 (https://home.privateerpress.com/wp-content/uploads/2022/07/Mk-IV-Cards.pdf): beta-era, not used |

Note on currency: the Steamroller 2026 January pack still mentions "the Defenses command card" (SR p2, setup step 07).
The June 2026 update (CL26) turned Defenses into list entries. We follow CL26 and keep SR's placement order.

---

## A. Command cards

### A.1 Core rules (RB p121, CL26, BTH)

| ID | Rule |
|---|---|
| CC1 | Each player starts with a **hand of five** cards picked while building the army. The size does not change with the encounter level: Recon, Skirmish, Pitched Battle, Grand Melee and Total War all use five (RB p118 step 5, p121). Grymkin start with seven (RB p130, not one of our factions) |
| CC2 | A hand holds at most **one copy** of each card, and only cards open to the player's Faction or army |
| CC3 | Each card is played **once per game**, then discarded |
| CC4 | A player plays at most **two cards per turn** |
| CC5 | A model or unit can be the subject of at most **one card per turn**. RULING: a card played on one trooper uses up the whole unit for that turn |
| CC6 | Hands are open information: either player may look at both hands at any time (our UI shows both) |
| CC7 | Most cards cost 0 army points; some cost points, paid from the list's total (RB p121). All five universal cards cost 0 |
| CC8 | Each card says when it can be played. Every current card is played in its owner's own turn |
| CC9 | Since June 2026 the universal pool is exactly five cards (CL26), so an army with no army-specific cards always holds all five. Armies with extra cards (below) pick five from the larger pool |

### A.2 The universal cards (CL26 "new set of 5"; texts from WA, summarised in our words)

| Card | Cost | Played | Subject | Option A | Option B |
|---|---|---|---|---|---|
| **Bite and Hold** | 0 | any time during the activation of one of your models or units | the activating model or unit | One scenario element the subject is securing right now stays secured by you until the end of this turn, even if your models leave it, unless an enemy model contests it | For one round, while the subject is inside area scenario terrain or within 3" of another scenario element, it gains **Sturdy** (it cannot be pushed) |
| **Blessings of the Gods** | 0 | at the start of the activation of one of your models | the activating model (RULING: for a unit, one trooper of it) | This activation, that model's weapons gain **Blessed** and **Damage Type: Magical** | That model gains one focus, one fury or one essence point, or one corpse, rage or soul token |
| **Careful Reconnaissance** | 0 | any time during the activation of one of your models or units | the activating model or unit | It gains **Pathfinder** this activation | It gains **Reposition [3"]** this activation: at the end of an activation in which it did not run or fail a charge, it may advance up to 3", and then the activation ends |
| **Duck and Cover!** | 0 | any time during the activation of one of your **warrior** models or units | the activating warrior model or unit | For one round, while inside area scenario terrain or within 3" of another scenario element, it gains **Dig In**: cover, Resistance: Blast, and it does not block LOS; it stops being dug in as soon as it moves, is placed or becomes engaged | For one round, under the same position condition, it gains **Set Defense**: enemy charge attack rolls and slam power attack rolls against it suffer −2 |
| **Put the Fires Out** | 0 | at the start of your Maintenance Phase | one of your models (A: model or unit; B: one model) | Every shakeable effect and every continuous effect on it ends | Remove d3+1 damage from that model |

Exact mechanics (what the engine does):

- **Bite and Hold A**: the card names one element `e` whose `computeControl` controller is the player now and whose
  holders include the subject (a trooper of the subject unit counts). It writes `elementState[e].stickyHold =
  {player, round, turn}`. At this turn's scoring, an element with a sticky hold for player P and no current holder is
  controlled by P unless an eligible enemy model contests it (V2 contest rules). If P still holds it normally nothing
  changes. The sticky hold ends after this turn's end-of-turn scoring. If the subject secures no element, option A is
  not offered.
- **Bite and Hold B / Duck and Cover A and B**: an effect of duration `round` on each subject model whose bonus is
  live only while the model passes the **near-element test**: its base is inside the area of an area scenario-terrain
  piece, or within 3" of any other scenario element (objective, flag, cache, impassable scenario terrain, the
  flag-obstruction of V2.3). RULING: the test is checked whenever the bonus would matter (a push, an attack against
  it, a charge or slam roll), not only when the card is played. Dig In also ends early (the effect is removed) when the
  model moves (any advance, run, charge, push, slam or throw movement), is placed, or is engaged at any check.
- **Sturdy**: a push against the model is cancelled (no movement, no collateral). Slam and throw are not pushes; they
  still work (WA: "cannot be pushed").
- **Dig In** reuses the existing cover path (+4 DEF against ranged and magic attack rolls, not spray, through
  `grantedCover` of 00 §14) and `resist: blast`; "does not block LOS" means the model is ignored as an intervening
  model and as a screen for LOS (our `los.ts` treats it like a model that gives no LOS block).
- **Set Defense** is a −2 modifier on charge attack rolls and slam power attack rolls whose target is the model.
- **Blessings of the Gods A**: every weapon of the model gets the `blessed` quality and damage type `magical` until its
  activation ends. **B**: a list of gains, offered only where the model can use them: focus (a model with Focus
  Manipulation, or a war-engine; RULING: a war-engine may not go above its 3-focus cap, a caster has no cap), fury (a
  warlock up to its FURY, or a warbeast up to its FURY), soul or corpse token (only a model with a rule that lets it
  gain that token, as Grave Robbing used to say, PP24). Essence and rage are not used by our factions and are never
  offered.
- **Careful Reconnaissance A**: grants the Pathfinder ability (data `core.pathfinder`) for the activation. **B**: grants
  `core.reposition` with distance 3 for the activation (the M9 Reposition path in `phases/activation.ts`). For a unit,
  every trooper gains it (RULING).
- **Put the Fires Out A**: ends every `EffectInstance` and condition on the subject that is shakeable (knocked down,
  stationary, Shadow Bind, Blind and any effect marked `shakeable`) or continuous (fire, corrosion and any effect with
  duration `continuous`). For a unit, every trooper. **B**: roll `d3` (purpose `d3`), heal that +1 boxes through the
  normal heal path (grid models: the default healing order of 10-rules-core R3; spiral models: the M9 order). A model
  that cannot have damage removed (Grievous Wounds `forbid heal`) gets no option B.

### A.3 Army cards

| Card | Cost | Army | Status |
|---|---|---|---|
| **For the Motherland** | 0 | Khador Winter Korps and Old Umbrey | **ship in M13**: any time during the activation of one of your warrior models or units; those models gain **Tough** for one round (our existing Tough path) |
| **Heavy Airdrop** | 5, FA 2 | Cygnar Gravediggers | deferred: needs airdropped crates and squad warjacks |
| **Light Airdrop** | 0, FA 2 | Cygnar Gravediggers | deferred: needs Ammo Crate, Fuel Canister, Mantlet and Medical Crate deployables |
| **Military Engineering** | 0 | Cygnar Gravediggers | deferred: needs Defenses (A.6) |
| Accursed, Fortune's Path, Ill Omens, Labyrinth, Ruin, Sacrifice, Shroud | — | Grymkin | not a Whirr Machine faction |
| Castle, Invisibility, Plunder, Reverse Tactics, Revivification | 0 | campaign only (WA) | out of scope |

Cut cards (CL26) such as High Alert, Grave Robbing, Duck!, Defenses and Sapper are not offered. Battle Plans (Menoth,
Desperate Pace etc.) are model abilities, not cards, and stay where M9 put them.

### A.4 How the hand is chosen

- `GameSetup.cards?: Partial<Record<PlayerId, Id[]>>`. Omitted, or a player missing from it, means **no cards** for
  that player (keeps every existing game, the golden replay and the sims unchanged). `[]` also means no cards.
- The client passes a hand when the start-screen option "Command cards" is On (default **On** for new skirmish games,
  always Off for `scn-qs-demo`). The hand is the five universal cards unless the list's army has army cards; then the
  army picker shows a "Cards" row where the player picks five of the pool (default: the five universal ones). The bot's
  hand is the same rule applied to its list (the AI package may later pick For the Motherland over a weak universal
  card).
- `createGame` validates the hand: ≤5 cards (7 reserved for Grymkin), no duplicates, every card open to the list's
  army (`card.armies` empty = universal; else the list's `army` must be in it), total card cost + list cost ≤ the
  level's points. Failure: `E_BAD_SETUP`.
- The list schema gains `army?: Id` (e.g. `kha.old-umbrey`); a list without it can take universal cards only.

### A.5 Mapping onto engine windows (00 §5 to §7)

No new `WindowId`. Every card rides on a window the engine already has.

| Timing | Window | How the engine offers it |
|---|---|---|
| any time during your model/unit's activation (Bite and Hold, Careful Reconnaissance, Duck and Cover!, For the Motherland) | the activation's AT points: `chooseMovement`, `chooseCombatAction`, `chooseAttack` before an attack is declared (00 §5 column AT) | `playCard` options are added to those decisions' `options` (like the M9 any-time spell and feat options), one per (card, option, extra choice). Never inside an attack, a spell, a trigger window or a placement |
| start of your model's activation (Blessings of the Gods) | `activation.start` | offered only on the **first** decision of the activation, before any movement, attack, spell, feat or other card; if the activation opens with an `abilityChoice` `startTrigger` (M9), the card options ride on that decision instead. RULING: this is "the start" (no new prompt per activation) |
| start of your Maintenance Phase (Put the Fires Out) | `maintenance.start` | before continuous effects roll, the engine raises `abilityChoice` with `context.data.code = 'card'` for the active player **only if** they hold the card, have card plays left and at least one model would gain something (damage to remove, or a shakeable or continuous effect to end). Options: one per (target, option), plus `pass` (`canPass: true`) |

Both limits (CC4, CC5) and the once-per-game rule are checked in `validate`; a breach is `E_ALREADY_USED`, a bad
subject `E_TARGET_INVALID`, a card offered outside its window `E_NOT_AN_OPTION`. A played card emits `CardPlayed` and then
the effect's own events (`EffectApplied`, `Healed`, `ConditionRemoved`, `FocusChanged`, `TokenGained`...).

**Cards needing decisions or new work** (marked for WP2):

| Card | Needs |
|---|---|
| Bite and Hold A | `ScenarioState.elementState[].stickyHold` and a change in `computeControl` (WP3 owns `scenario.ts`; WP1 adds the field) |
| Bite and Hold B | Sturdy: push cancel in the push path (`power-attacks.ts` / `effects.ts` push helper) |
| Duck and Cover A | Dig In end-on-move/place/engaged hook (engine internals, `EffectExtras.endsOn`), LOS transparency for dug-in models (`los.ts`) |
| Duck and Cover B | Set Defense roll modifier on charge attacks and slams |
| all position-gated cards | the near-element test: exported by WP3 as `nearScenarioElement(state, model)` |
| Blessings A | weapon quality and damage-type grant for one activation (`EffectExtras.weaponGrants`) |
| Put the Fires Out | the new maintenance-start prompt |

### A.6 Defenses (CL26, WA, PP23), deferred to a follow-up package (WP8, M13b)

Defenses are list entries now, not cards. Spec kept here so the contract pass can reserve the shapes.

| Defense | Cost | Footprint | Rules (our summary) |
|---|---|---|---|
| Barrier | 2 | wall 4" × ½", ¾" tall | obstacle, gives cover; a large-or-smaller base without Flight or Pathfinder that crosses it loses 2" of that move |
| Fire Pit | 1 | 50 mm round | obstacle; hazard: a model without Flight entering it gains Fire (a trooper unit advancing through: every model); models within 5" lose Stealth |
| Powder Keg | 1 | 30 mm round | obstacle; DEF 5, targetable by both sides (no friendly charge); explodes (POW 15 blast to models within 2", then removed) on a crit against it, when an extra-large or huge base touches it, when slammed or thrown models hit it, or after being thrown; can be thrown as a medium base, +2" throw distance; Demolition ★Action (medium+ base with Throw, within 1"): remove it and one other Defense or trapdoor within 10" |
| Spike Trap | 1 | 50 mm square area, rough | hazard: an enemy model without Flight entering it or ending its activation within 1" suffers a POW 10 damage roll; an enemy warjack entering also loses its first open Movement box; the placing player's models are immune |

- FA 3 Defenses per list in any mix (CL26). Placement: after scenario elements and flags, before deployment, starting with
  the Defender, players alternate placing one Defense each until both are done (SR p2 step 07). RULING (from PP23,
  older than CL26): on the placing player's own half of the table, not within 2" of an objective, flag or cache, not
  overlapping terrain or another Defense; a Defense may sit on a hill only if it fits on its flat top.
- Contracts reserved for WP8 (not in the M13 pass): `DecisionKind 'placeDefense'`, `PlaceDefenseAction {defenseId,
  pos, rot}`, list entry `{defense: 'defense.barrier'}`.

---

## B. Steamroller 2026 scenarios

### B.1 Rules shared by every SR scenario (SR p2 to p4)

| ID | Rule | Today |
|---|---|---|
| SR1 | Table 48" × 48". **Attacker = first player = red**, **Defender = second player = blue**. The roll-off winner picks Attacker or Defender (`chooseTurnOrder`); the Defender picks the table edge (`chooseEdge`) | yes |
| SR2 | Deployment: Attacker completely within **6"** of its edge, Defender within **11"** (every SR map; SR differs from RB p117's 7/10). Advance Deployment +3" | data only |
| SR3 | Setup order (SR p2): scenario → lists → roll-off → Defender's edge → place elements → flags pick their terrain, Attacker first → Defenses, Defender first → Attacker deploys → Defender deploys → Attacker Advance Deployment → Defender Advance Deployment → other pre-game effects (Prey) → Attacker's turn 1 | flags step missing |
| SR4 | Element positions are measured from the table edge **to the near edge of the element's base** (SR p2). Our data stores centres: centre = printed distance + base radius (50 mm 0.98", 40 mm 0.79", 30 mm 0.59"). The pixel check on the rendered maps agrees within 0.4" | — |
| SR5 | The maps are drawn with the Attacker at the bottom. Data positions are in that **attacker frame** (+z toward the Defender, +x to the Attacker's right). After `chooseEdge`, the engine rotates every element about the origin so the frame matches the real edges (180° when the Attacker sits on the +z edge, ±90° for east/west) and writes the result into `elementState[id].pos`. Terrain does not rotate | missing (S1 is point-symmetric, so it never mattered) |
| SR6 | 50 mm objective: secured by ≥1 Leader, Cohort model (warjack, warbeast) or battle engine within 3" | yes (V2.1) |
| SR7 | 40 mm objective: secured by ≥1 Leader within 3", or a unit whose remaining models are all within 3" | yes (V2.2) |
| SR8 | Contest (objective, flag terrain, cache): any enemy model within 3" (inside the area for area scenario terrain), except Leaders, inert, wild, autonomous and disabled models | yes |
| SR9 | Scenario terrain (from a flag): secured by **one** Leader, **or one** solo, **or two or more** models of any other kinds, **inside its area**, or within 3" of it when standing inside is impossible (obstacles, obstructions, the flag-obstruction) | **gap**: `hold` cannot say "one Leader or one solo, else two"; and `distanceToElement` uses 3" from the edge for every piece, also area terrain. SCN-026 expects a lone solo to secure; the default `{models: 2, eligible: ['any']}` fails it |
| SR10 | Flags: before deployment, starting with the Attacker, each player picks one terrain piece within 5" of **their own** flag; the flag moves onto or beside it and the piece becomes scenario terrain. With no piece within 5", the flag itself becomes a 30 mm obstruction scenario-terrain piece. A destroyed or removed scenario-terrain piece leaves its flag at its edge as the new obstruction piece | missing |
| SR11 | Caches (30 mm): only the **opponent's** cache can be scored. A friendly model within 3" of it forfeits its Combat Action while no enemy contests the cache; the cache is removed at once and the scenario's cache VP are scored | missing |
| SR12 | Objectives, flags and caches are not models, never block LOS; models may pass through only if they can end completely past them | yes (V2) |
| SR13 | **Kill Box**: from the Attacker's round-2 turn, a player ending their turn with their Leader completely within 12" of their own edge gives the opponent 2 VP | yes (V1.7) |
| SR14 | Scoring from the **Defender's round-2 turn**, at the end of every turn, both players | yes (V1.2) |
| SR15 | Scenario victory: right after scoring at the end of the opponent's turn, a player 3+ VP ahead wins (all except Payload, which prints no such rule) | yes; Payload needs "off" |
| SR16 | Game ends at the end of the Defender's 7th turn; then VP, then scenario presence (V1.5) | yes |
| SR17 | Assassination: SR p4 as V1.1 | yes |
| SR18 | Scenario choice: TO pick, agreement, or d8: 1 Trench Warfare, 2 Two Fronts, 3 Wolves at Our Heels, 4 Pressure Point, 5 High Stakes, 6 Fault Line, 7 Payload, 8 reroll (SR p14). The pack says "six scenarios" but lists seven; we ship all seven | client option |
| SR19 | Levels: SR rounds run at 30, 50, 75 or 100 points (SR p14 clock table). Our SR scenarios list `levels: ["recon", "skirmish", "pitched", "grandMelee"]` and always use the 48" table | data only |

### B.2 Data shape (additions to 20 §7 and `scenario.schema.json`, owned by WP1)

```jsonc
{
  "id": "scn-sr26-trench-warfare", "name": "Trench Warfare", "source": "SR p5",
  "levels": ["recon", "skirmish", "pitched", "grandMelee"],
  "table": { "w": 48, "d": 48 },
  "deployment": { "first": 6, "second": 11, "advance": 3, "unitSpread": 3 },
  "rounds": 7,
  "frame": "attacker",                       // SR5: positions are in the attacker frame, rotated at chooseEdge
  "scoring": { "fromRound": 2, "fromPlayer": "second", "winMargin": 3, "winOnOpponentTurnOnly": true, "leaderPresence": 10,
    "rules": [ /* B.3 */ ] },
  "killBox": { "fromRound": 2, "fromPlayer": "first", "depth": 12, "vp": 2 },
  "setup": { "flagRadius": 5, "flagPickOrder": "attackerFirst" },
  "special": [ /* B.3 */ ],
  "elements": [
    { "id": "el-50-blue", "kind": "objective50", "owner": "second", "pos": { "x": -11.02, "z": 2.02 }, "hold": { "within": 3 }, "vp": {} }
  ]
}
```

- `kind` += `cache`. `owner` = the element's colour: `first` = Attacker (red), `second` = Defender (blue), omitted =
  neutral. Owner never limits who can secure an objective; it matters only where a rule says "own" or "opponent's".
- `hold` += `single?: string[]` (one model of these kinds is enough even when `models` > 1; SR9 default for
  `flag`/`scenarioTerrain`: `{within: 3, models: 2, eligible: ['any'], single: ['leader', 'solo'], mode: 'area'}`) and
  `mode?: 'within' | 'area'` (`area` = inside the piece's area for area terrain, within `within` for impassable pieces
  or the flag-obstruction). The new default applies to every scenario whose `scoring.fromPlayer` is `second` (the SR
  scenarios and `scn-test-sr`, which fixes SCN-026); S1 keeps its explicit QS `hold`. RULING in B.6.
- `vp.control` stays for simple scenarios. SR scenarios use `scoring.rules[]` instead and set `vp: {}` (control 0);
  when `rules` is present the per-element `vp.control` is ignored.
- `scoring.winMargin: 0` = no lead-by-3 win (Payload). The schema minimum drops to 0.
- `setup.flagRadius` (5) and `setup.flagPickOrder` (`attackerFirst`: Attacker, Defender, Attacker... over the flags;
  for an owned flag only its owner picks).

### B.3 Scoring rules and specials (vocabulary)

`scoring.rules[]` entries, evaluated at every scoring point for each player P, in order:

| `kind` | Fields | Meaning |
|---|---|---|
| `control` | `select: {kinds[], owner: 'any' \| 'own' \| 'opponent' \| 'neutral'}`, `vp` | +vp per element matching `select` that P controls now. `kinds` uses `flag` for "the scenario terrain chosen by that flag" |
| `countBonus` | `select`, `atLeast`, `vp` | +vp once if P controls at least `atLeast` matching elements |
| `zeroTokenBonus` | `select`, `vp` | +vp per matching element P controls whose token count is 0 |
| `cache` | `vp` | VP for each cache P claimed this turn (SR11), banked at this scoring point |
| `tokenRace` | `vp`, `third: 3` | Wolves: once per game, the first scoring point at which one player's own 40 gets its third token and the other's does not → that player +vp; if both reach it at the same point, no VP, and the race is over |
| `delivered` | `vp` | Payload: +vp for P, at once, when P's own 50 ends a move inside the opponent's scenario terrain (or within 3" of it when inside is impossible); the objective is removed |

`special[]` entries:

| `kind` | Fields | Meaning |
|---|---|---|
| `earthworks` | `within: 3`, `bases: [30, 40]`, `warriorOnly: true`, `of: ['objective40', 'objective50']` | Trench Warfare: small- and medium-based warrior models within 3" of **their own player's** 40 or 50 mm objectives have cover and Resistance: Blast |
| `killBoxGrowth` | `fromRound: 3`, `fromPlayer: 'first'`, `step: 2` | Wolves: at the start of each Attacker turn from round 3, the Kill Box depth grows by 2" for both players (r3 14", r4 16", r5 18", r6 20", r7 22"); `elementState`-free: `ScenarioState.killBoxDepth` |
| `heelTokens` | `on: 'objective40'`, `toward: 'objective50'`, `move: 3` | Wolves: after scoring at each scoring point, a player who secures their **own** 40 may add one token to it; if they do, the opponent may move that objective up to 3" straight toward the 50 of the same colour |
| `fuse` | `tokens: 5`, `on: ['flag', 'objective50']`, `d3: ['flag:second', 'flag:first', 'objective50']`, `blast: {pow: 14, damageType: 'magical', within: 3}` | High Stakes (B.4 S5) |
| `payload` | `move: 3`, `perOther: 1`, `toward: 'opponentFlagTerrain'`, `haul: 5` | Payload (B.4 S7) |

Objective movement (SR p3, used by `heelTokens` and `payload`): the objective moves in a straight line toward the
target point (an objective's centre; a terrain piece's footprint centroid, RULING), ignores models, obstacles,
obstructions and terrain it can move completely past, and otherwise stops short of them. It never leaves the table.
Emits `ElementMoved`.

### B.4 The seven scenarios

Distances in brackets are the printed edge distances (L/R = from the Attacker's left/right edge, T = from the
Defender's edge, B = from the Attacker's edge). Positions are centres in the attacker frame.

**S-SR1 Trench Warfare (`scn-sr26-trench-warfare`, SR p5)**

| Element | Kind | Owner | Pos (x, z) | Printed |
|---|---|---|---|---|
| el-50-blue | objective50 | second | (−11.02, 2.02) | L12, T21 |
| el-40-blue | objective40 | second | (−1.21, 11.21) | L22, T12 |
| el-cache-blue | cache | second | (−3.41, 5.41) | L20, T18 |
| el-flag-blue | flag | second | (17.41, 8.41) | R6, T15 |
| el-50-red | objective50 | first | (11.02, 1.98) | R12, B25 |
| el-40-red | objective40 | first | (1.21, −9.21) | R22, B14 |
| el-cache-red | cache | first | (3.41, −1.41) | R20, B22 |
| el-flag-red | flag | first | (−17.41, −6.41) | L6, B17 |

Rules: `control {objective40, objective50; any} 1`; `control {flag; opponent} 2`; own flag terrain 0 (no rule);
`cache 2`. Special `earthworks`. Lead-by-3 on. Caches: SR11 (only the opponent's cache).

**S-SR2 Two Fronts (`scn-sr26-two-fronts`, SR p6)**

| Element | Kind | Owner | Pos | Printed |
|---|---|---|---|---|
| el-40-blue | objective40 | second | (−11.21, 4.21) | L12, T19 |
| el-50-blue | objective50 | second | (11.02, 6.02) | R12, T17 |
| el-flag | flag | neutral | (−0.41, −0.59) | L23, T24 |
| el-40-red | objective40 | first | (−15.21, −3.21) | L8, B20 |
| el-50-red | objective50 | first | (15.02, −4.02) | R8, B19 |

Rules: `control {objective40, objective50; any} 1`; `control {flag; any} 1`; `countBonus {objective40; any} atLeast 2
→ 1`; `countBonus {objective50; any} atLeast 2 → 1`. RULING: the neutral flag's terrain is picked by the Attacker.

**S-SR3 Wolves at Our Heels (`scn-sr26-wolves`, SR p7)**

| Element | Kind | Owner | Pos | Printed |
|---|---|---|---|---|
| el-flag-blue | flag | second | (−11.41, 3.41) | L12, T20 |
| el-50-blue | objective50 | second | (4.02, 3.02) | R19, T20 |
| el-40-blue | objective40 | second | (15.21, 8.21) | R8, T15 |
| el-50-red | objective50 | first | (−4.02, 0.98) | L19, B24 |
| el-40-red | objective40 | first | (−15.21, −3.21) | L8, B20 |
| el-flag-red | flag | first | (11.41, −3.41) | R12, B20 |

Rules: `control {objective40, objective50; any} 1`; `control {flag; any} 1`; `tokenRace 3`. Specials
`killBoxGrowth`, `heelTokens`. Order at each scoring point: score → token race check → token offers (active player
first) → opponent's move choice for each token added.

**S-SR4 Pressure Point (`scn-sr26-pressure-point`, SR p8)**

| Element | Kind | Owner | Pos | Printed |
|---|---|---|---|---|
| el-flag-1 | flag | neutral | (−11.41, 3.41) | L12, T20 |
| el-flag-2 | flag | neutral | (11.41, 3.41) | R12, T20 |
| el-flag-3 | flag | neutral | (−17.41, −7.59) | L6, T31 |
| el-flag-4 | flag | neutral | (17.41, −7.59) | R6, T31 |
| el-50 | objective50 | neutral | (0.02, −1.02) | R23, B22 |

Rules: `control {flag; any} 1`; `control {objective50; any} 2`. RULING: the map colours the 50 red but no rule uses its
owner, so it is neutral; flag picks alternate Attacker, Defender, Attacker, Defender, each picking any unresolved flag.

**S-SR5 High Stakes (`scn-sr26-high-stakes`, SR p9)**

| Element | Kind | Owner | Pos | Printed |
|---|---|---|---|---|
| el-flag-blue | flag | second | (−15.41, 0.41) | L8, T23 |
| el-50 | objective50 | neutral | (0.02, 1.02) | R23, T22 |
| el-40-blue | objective40 | second | (9.21, 6.21) | R14, T17 |
| el-40-red | objective40 | first | (−9.21, −5.21) | L14, B18 |
| el-flag-red | flag | first | (15.41, −3.41) | R8, B20 |

Rules: `control {objective40; any} 1`; `control {objective50; any} 1`; `control {flag; any} 1`;
`zeroTokenBonus {objective50, flag; any} 1`. Special `fuse`:
1. Setup: 5 countdown tokens on each flag's scenario terrain and on the 50 (`elementState[].tokens = 5`).
2. At each scoring point (from the Defender's round-2 turn), **before** scoring: if a player secures the 50 now, that
   player must pick the 50 or either flag terrain that still has tokens and remove d3 (purpose `scenario`; floor 0;
   `abilityChoice` code `fuse`). If nobody secures it, roll d3: 1 → blue flag terrain, 2 → red flag terrain, 3 → the
   50, and remove one token from it (none if it is already at 0, RULING). If every element is at 0, nothing happens.
3. An element that reaches 0 **detonates once**: every model inside the flag terrain's area (or within 3" of it when
   it is impassable), or within 3" of the 50, suffers a POW 14 magical blast damage roll (not an attack; not
   boostable; friend and foe; normal death windows). `ElementDetonated`. Then scoring runs.

**S-SR6 Fault Line (`scn-sr26-fault-line`, SR p10)**

| Element | Kind | Owner | Pos | Printed |
|---|---|---|---|---|
| el-40-blue-a | objective40 | second | (15.21, 8.21) | R8, T15 |
| el-50-blue | objective50 | second | (0.02, 3.02) | R23, T20 |
| el-40-blue-b | objective40 | second | (−15.21, −1.79) | L8, T25 |
| el-40-red-a | objective40 | first | (15.21, 1.79) | R8, B25 |
| el-50-red | objective50 | first | (−0.02, −3.02) | L23, B20 |
| el-40-red-b | objective40 | first | (−15.21, −8.21) | L8, B15 |

Rules: `control {objective40, objective50; any} 1`; `countBonus {objective40, objective50; own} atLeast 2 → 1`;
`countBonus {objective40, objective50; own} atLeast 3 → 1`. No flags.

**S-SR7 Payload (`scn-sr26-payload`, SR p11)**

| Element | Kind | Owner | Pos | Printed |
|---|---|---|---|---|
| el-50-blue | objective50 | second | (−14.02, 7.02) | L9, T16 |
| el-40-blue | objective40 | second | (−3.21, 3.21) | L20, T20 |
| el-flag-blue | flag | second | (7.41, 4.41) | R16, T19 |
| el-flag-red | flag | first | (−7.41, −4.41) | L16, B19 |
| el-40-red | objective40 | first | (3.21, −3.21) | R20, B20 |
| el-50-red | objective50 | first | (14.02, −7.02) | R9, B16 |

Rules: `control {objective40, objective50; any} 1`; `control {flag; any} 1`; `delivered 3`. `winMargin: 0`. Special
`payload`: after scoring at each scoring point, each player (active first) who secures **their own** 50 may move it
up to 3" + 1" per other objective (40 or 50) they secure, toward the opponent's flag terrain (`abilityChoice` code
`payload`, options: each whole inch from 0 to the maximum). If it ends inside that terrain (or within 3" when inside is
impossible) the player scores 3 VP at once and the 50 is removed. **Made To Haul**: after moving their 50 at the end
of **their own** turn, the player may move one friendly Cohort model up to 5" straight toward that 50
(`moveModel` with `straightLine`, `toward` a point, `data.code = 'haul'`); RULING: a straight move that is not an
advance (rough terrain does not shorten it), blocked by bases and impassable terrain (stops short), no Normal Movement
effects. Lead-by-3 does not apply (SR p11 prints no Scenario Victory rule; RULING, B.6).

### B.5 What the scenario engine cannot express today (gaps for WP3)

1. SR9 hold rule ("one Leader or one solo, else two") and "inside the area" measuring for area terrain (also in the
   presence tiebreak).
2. Element ownership as colour and the rules that read it (`own` / `opponent` selections, Earthworks).
3. The attacker frame and its rotation at `chooseEdge` (SR5).
4. Flags choosing terrain before deployment, the flag-obstruction fallback and the flag left behind when scenario
   terrain is destroyed or removed (Rock Wall, Rift: housekeeping removals).
5. Caches: the Combat-Action forfeit that claims one, removal, banked VP.
6. Scoring rules beyond "1 VP per controlled element": count bonuses, opponent-only terrain, zero-token bonus, token
   race, delivery.
7. Runtime element state: moved positions, tokens, removal, sticky holds (cards).
8. Decisions inside end-of-turn scoring: fuse choice, token offers, objective moves, the haul move; scoring is a pure
   function today (`endOfTurnScoring`) and must become a small step machine that can raise decisions and resume.
9. Scenario-caused damage (fuse blast) at scoring time, with death windows and assassination checks.
10. Kill Box depth that changes by round.
11. Lead-by-3 switched off.
12. Layout fit: no 48" layouts exist; the 4/3 scale-up of 70 §E is the stand-in. SR scenarios also need: no impassable
    piece within 1" of any element base (RULING: drop such a piece at setup, SR p15 says move it), and at least one
    terrain piece within 5" of each flag where possible (else the flag-obstruction applies, which is legal).

### B.6 Rulings (to copy into `docs/needs-rules-check.md`; this agent does not own that file)

- RULING: SR element positions | printed distances are to the near base edge, so centre = distance + base radius | SR p2 says to measure to the base edge; the rendered maps agree within 0.4"
- RULING: SR attacker frame | data positions assume the Attacker at the bottom of the map; the engine rotates elements after the edge choice, terrain stays | maps are drawn from the Attacker's side
- RULING: SR deployment depths | Attacker 6", Defender 11" | every SR 2026 map shows 6/11; RB p117's 7/10 is the non-scenario default
- RULING: neutral flags | a neutral flag's terrain is picked in the alternation (Attacker first) by whoever's pick it is | SR p3 speaks of "their own" flag only
- RULING: Pressure Point 50 mm owner | neutral | no rule reads its colour
- RULING: High Stakes centre 50 owner | neutral | the d3 table names the 50 separately from the coloured terrain
- RULING: Payload lead-by-3 | off | SR p11 prints no Scenario Victory rule, unlike the other six
- RULING: Payload "their 50mm" | a player moves only the 50 of their own colour | Made To Haul and the delivery line both say "their"
- RULING: Payload move target | straight toward the footprint centroid of the opponent's flag terrain; whole inches | "toward a piece" needs a point
- RULING: Made To Haul | only after the player moved their own 50 at the end of their own turn; straight, not an advance | SR text says "at the end of their turn"
- RULING: Wolves token move | the opponent chooses 0 or the full 3", straight toward the same-colour 50 | "may move ... 3 inches"
- RULING: Wolves token race | the first scoring point where any own-40 reaches 3 tokens settles it, VP or not | "checked only once per game"
- RULING: High Stakes d3 on an empty element | nothing happens | removing a token from 0 is impossible
- RULING: fuse blast | a blast damage roll on every model inside the terrain (or within 3" when impassable) or within 3" of the 50; not an attack; magical | SR p9
- RULING: cache timing | a cache can be claimed only during a turn that ends with scoring (from the Defender's round-2 turn); the 2 VP are added at that turn's scoring | SR p5 lists cache VP among the end-of-turn scoring items
- RULING: cache claimers | any friendly model (a trooper uses its own Combat Action) that can forfeit its Combat Action | SR p3 says "a friendly model"
- RULING: scenario-terrain hold default | `single: ['leader', 'solo']`, `models: 2`, `mode: 'area'` for scenarios that score from the Defender's round 2; S1 keeps its explicit QS rule | SR p3
- RULING: obstructions over elements | at setup, drop any impassable piece within 1" of an element base | SR p15 says move it; dropping is deterministic
- RULING: flag-obstruction | 30 mm round obstruction, 1.5" tall | SR p3 gives no size beyond the base
- RULING: card subject in a unit | a card on one trooper counts for the whole unit that turn; Careful Reconnaissance B, Duck and Cover and Put the Fires Out A apply to every trooper | RB p121 "model or unit"
- RULING: Blessings timing | offered on the activation's first decision only | "at the start of the activation" without a new prompt
- RULING: Blessings focus on a war-engine | respects the 3-focus cap | the cap is the normal focus limit for war-engines
- RULING: near-element test | checked live whenever the bonus would matter | "while within" wording
- RULING: clock-out scoring | C.2: the opponent scores alone, with the scenario's normal rules, and only on a turn that would score | SR p14 "check to see if they score any scenario elements"
- RULING: clock-out on the opponent's turn | "scenario victory" at the end of that turn = more VP than the timed-out player, as in the own-turn case | SR p14 uses that test in the own-turn case
- RULING: decisions owed by a timed-out player | answered automatically with the default (pass / no / keep / no reroll) | the player has no time left

---

## C. Game clock

### C.1 Steamroller deathclock (SR p14)

| ID | Rule |
|---|---|
| CLK1 | Chess clock: each player has one time pool for the whole game. Pool by points: **30 → 20 min, 50 → 30 min, 75 → 50 min, 100 → 60 min** |
| CLK2 | The clock starts when the first player (Attacker) begins normal deployment; each player taps over after normal deployment, after advance deployment, and at the end of each turn. Roll-off, edge choice, flag picks and Defenses are before the clock |
| CLK3 | Players cannot pause it; only a judge can (rules calls). While the inactive player rolls dice, measures, marks damage, moves models or makes a decision during the active player's turn, the clock may be switched to them |
| CLK4 | No extensions or per-turn increments |
| CLK5 | **Out of time on your own turn**: you lose. Your opponent may at once score scenario elements; if they now have more VP than you, they win by scenario; otherwise your Leader is destroyed and they win by assassination on the current table |
| CLK6 | **Out of time on the opponent's turn**: they finish their turn; at its end they may check for scenario victory; failing that, your Leader is destroyed and they win by assassination |
| CLK7 | (Event rule, not used) at round end, games with more than 5 combined minutes left are ties |

### C.2 Our clock

**Owner of the running time.** The clock charges the player who owns `pending` (`pending.player`), which is exactly
CLK3's switching rule done automatically. It runs only in phases `deploy`, `maintenance`, `control` and `activation`
(CLK2) and never for `gameOver`, `chooseTurnOrder`, `chooseEdge`, flag picks or Defense placement.

**Auto-pause** (time charged to nobody; this stands in for the judge):
- any presentation beat is playing (director busy: moves, dice, attack narration, banners, the dice tray roll); the
  clock resumes when the director goes idle and a decision is open;
- the Menu, Settings popover, How to Play, the ? help, the army painter or any modal is open;
- the tab is hidden (`visibilitychange`) or the window lost focus for more than 2 s;
- the game is over, or the engine has not answered yet (worker busy for the human's own action).

**The bot.** Default: the bot is **untimed**; its chip shows its pool frozen and the label "untimed". Option "Time the
bot": the bot's pool is charged with the wall time from the decision being raised until its answer is stepped, minus
auto-pauses (in practice milliseconds; it never flags). In hotseat (later) both sides are timed.

**Running out.** At 0 the client steps `{type: 'clockExpired', timedOut: P, player: P, decisionId: pending.id}` through the
GameRunner (the only caller of `step`). The engine (WP4 `src/engine/clock.ts`) applies CLK5/CLK6:
- Timed-out player P is the active player, or P is deploying: emit `ClockExpired {player: P, active}`; if scoring is
  active this turn, score the opponent O alone (rules of B.3, no Kill Box, no lead-by-3); if O's VP > P's VP → game
  ends, winner O, reason `scenario`; else P's Leader is destroyed (`LifeStateChanged` → `ModelRemoved`, cause
  `timeout`) and the game ends, winner O, reason `assassination`. `ScenarioState.result.timeout = P`. The final record
  scoring of V1.1 runs as for any assassination.
- P is not the active player (P's reaction decision ran the clock out): set `ScenarioState.clockOut = P`; every
  later decision owned by P is answered automatically with its default (`DecisionAutoResolved`); at the end of the
  active player's turn, after normal scoring and the lead-by-3 check, if the game has not ended: active VP > P's VP →
  `scenario` win; else P's Leader is destroyed → `assassination`.
- `clockExpired` is accepted at any open decision except `gameOver` (its `decisionId` must match; the
  `E_NOT_YOUR_DECISION` check is skipped), is never returned by `legalActions`, and is recorded in the action log, so
  replays and loads reproduce it without a clock.

**Client UX.**
- **Off by default.** Start screen, below the scenario select: "Clock: Off / Steamroller / Custom". Steamroller uses
  CLK1 from the game size (30 → 20 min). Custom: minutes per player (5 to 90, step 5) and "+ seconds per turn" (0, 10,
  30, 60; a casual option SR does not have). Check box "Time the bot" (off). "Allow pause" (on for Custom, forced
  off for Steamroller). Saved in `wm.settings` (clock block).
- **Top bar**: two chips in the centre, left = the human, right = the opponent, each with faction colour, `mm:ss`
  (tenths under 10 s) and a ring that fills as time drains. The running chip is bright with a slow pulse; the other is
  dim. Paused: a pause glyph and the reason on hover ("Paused: menu open", "Paused: animation"). Amber under 5:00, red
  under 1:00, a toast at 5:00 and 1:00 (existing UI sound, no new audio). With "Allow pause" a pause button sits
  between the chips; while paused the board is dimmed and inputs are blocked.
- **Out of time**: a short banner "Out of time" over the board, then the normal game-over screen with the cause line
  ("Vilkul's clock ran out; Cygnar wins by assassination").
- In-game Settings shows the clock settings read-only, with one action: "Turn the clock off" (cannot be turned back
  on in that game).
- **Saves**: remaining time per player and the config are saved next to the autosave (`wm.save.<slot>.clock`, a
  client key, no `SaveFile` change); Continue restores them paused until the first decision is shown. A replayed or
  exported save without that key plays untimed.
- `?clock=steamroller|off|<min>` URL override for tests; `?test=1` exposes `window.__clock` (`remaining`, `running`,
  `pausedBy`) and `__clock.set(player, ms)` to force a flag in e2e.

---

## D. Contracts and work packages

### D.1 Additive contract changes (WP1 lands all of them first; each needs a row in 00 §14)

| File | Change |
|---|---|
| `types.ts` | `GameSetup.cards?: Partial<Record<PlayerId, Id[]>>`; `PlayerState.cards?: CardHandState`; new `CardHandState {hand: Id[]; played: CardPlay[]}` and `CardPlay {cardId: Id; option: string; targetIds: Id[]; round: number; turn: number}`; new `ElementRuntime {pos?: Vec2; tokens?: number; removed?: boolean; terrainId?: Id \| null; stickyHold?: {player: PlayerId; round: number; turn: number}}`; `ScenarioState` += `elementState?: Record<Id, ElementRuntime>`, `killBoxDepth?: number`, `onceDone?: string[]`, `clockOut?: PlayerId`, `cachesClaimed?: {player: PlayerId; elementId: Id; turn: number}[]`; `ScenarioState.result` += `timeout?: PlayerId`. No new `WindowId`, `DecisionKind`, `RollPurpose` or `RejectionCode` (cards and scenario choices use `abilityChoice` codes `card`, `flagTerrain`, `fuse`, `heelToken`, `heelMove`, `payload`; the haul uses `moveModel` with `data.code = 'haul'`) |
| `actions.ts` | `PlayCardAction extends Base<'playCard'> {cardId: Id; option: string; targetId: ModelId \| UnitId; data?: {elementId?: Id; gain?: 'focus' \| 'fury' \| 'soul' \| 'corpse'; trooperId?: ModelId}}`; `ClockExpiredAction extends Base<'clockExpired'> {timedOut: PlayerId}` (union 39 → 41); `ChooseCombatActionAction.elementId?: Id` (cache claim: `choice: 'specialAction'`, `abilityId: 'scn.claimCache'`) |
| `events.ts` | `CardPlayed {player, cardId, option, targetIds}`, `CacheClaimed {player, elementId, modelId}`, `FlagTerrainChosen {player, flagId, terrainId: Id \| null}`, `ElementMoved {elementId, from, to, by: PlayerId}`, `ElementTokensChanged {elementId, tokens, delta, by: PlayerId \| null}`, `ElementDetonated {elementId}`, `ElementRemoved {elementId, reason: 'claimed' \| 'delivered' \| 'terrainGone'}`, `KillBoxExtended {depth}`, `ClockExpired {player, active: PlayerId}` (union 68 → 77); `LifeStateChanged`/`ModelRemoved` cause += `'timeout'` where a cause field exists |
| `hooks.ts` | **No change.** Card effects are code hooks in `src/engine/cards.ts`; Sturdy, Dig In and Set Defense ride on engine internals (`EffectExtras` += `endsOn`, `weaponGrants`, `rollMods` for Set Defense) as in 00 §14's M9 rows |
| `index.ts` | `query.cards(state, player): CardsView` with `CardsView {hand: CardView[]; playsLeft: number; usedOn: Id[]}` and `CardView {cardId, name, text, cost, played: boolean, playableNow: boolean, options: {id, label, targets: Id[]}[]}`; `query.control` result += `elementState`, `killBoxDepth`, `clockOut`; `describe` titles for `abilityChoice` codes above and lines for the nine new events and two new actions; `step` routes `playCard` (any decision that lists it) and `clockExpired` (any open decision) |
| `decider.ts`, `rng.ts` | No change |
| schemas + 20 §7 | new `card.schema.json` (`{id, name, text, cost, fa?, armies[], timing: 'activationAny' \| 'activationStart' \| 'maintenanceStart', subject: 'modelOrUnit' \| 'model' \| 'warriorModelOrUnit', options: [{id, label, text, code}]}`); `scenario.schema.json` additions of B.2/B.3 (`cache`, `owner` meaning, `hold.single`, `hold.mode`, `winMargin` ≥ 0, `scoring.rules`, `special`, `setup`, `frame`); `list.schema.json` += `army?`; data kind `card` in `src/data/core/cards.json` |

### D.2 Work packages (disjoint file ownership)

| WP | Owns | Builds | Depends |
|---|---|---|---|
| **WP1 contracts** | `src/engine/{types,actions,events,index}.ts` (additions and stubs only), `src/engine/cards.ts` and `src/engine/clock.ts` and `src/engine/scenario-rules.ts` (stub exports with final signatures), `src/data/schema/*` (and the mirrored copy), `docs/spec/00-architecture.md` §14, `docs/spec/20-data-schema.md` §7 | D.1; stubs throw `not implemented (M13)`; typecheck green | — |
| **WP2 engine cards** | `src/engine/cards.ts`, `src/engine/phases/maintenance.ts`, `src/engine/phases/activation.ts`, `src/engine/power-attacks.ts` (Sturdy), `src/engine/los.ts` (Dig In), `src/data/core/cards.json`, `src/data/core/abilities.json` (Sturdy, Dig In, Set Defense entries), `tests/engine/cards.test.ts` | A.1 to A.5; the card options in AT decisions; the maintenance prompt; also the call site in `activation.ts` for WP3's `scenarioSpecialActions` / `resolveScenarioSpecialAction` (cache claim) | WP1 |
| **WP3 engine scenarios** | `src/engine/scenario.ts`, `src/engine/scenario-rules.ts`, `src/engine/setup.ts`, `src/engine/turnflow.ts` (scoring step machine hook), `tests/engine/steamroller.test.ts` | B.1, B.3, B.5: frame rotation, flags, caches, rules vocabulary, specials, decisions during scoring, Earthworks cover (exported `scenarioCover(state, model)`, read by `attack.ts` through a one-line call WP3 also owns), near-element test | WP1 |
| **WP4 clock** | `src/engine/clock.ts`, `src/client/clock/*` (store, `ClockBar.tsx`, `clock.css`), `tests/engine/clock.test.ts`, `tests/client/clock.test.ts` | C.2 engine resolution and the client clock store, the chips and the pause logic. Exposes `ClockBar` and `clockConfigFromStart(choices)` for WP5 | WP1 |
| **WP5 client UI** | `src/client/ui/cards/*` (hand tray, card prompt form), `src/client/ui/TopBar.tsx` (mounts `ClockBar`), `src/client/ui/Prompt.tsx`, `src/client/ui/PromptForms.tsx`, `src/client/ui/promptView.ts`, `src/client/ui/start/*` (scenario list with SR + "Random (d8)", game size, Command cards On/Off and hand picker, clock options), `src/client/ui/help/*` (How to Play: Cards and Steamroller tabs), `src/client/board/scenarioElements.tsx` (caches, tokens, countdown, moved objectives, flag terrain highlight, Kill Box line) | the UI for A, B and C; every number from `query.*` | WP2, WP3, WP4 |
| **WP6 AI** | `src/ai/cards.ts`, `src/ai/scenario.ts`, `src/ai/decider.ts` (one call into cards), `tests/ai/cards.test.ts` | D.3 | WP2, WP3 |
| **WP7 scenario data** | `src/data/scenarios/sr26-*.json` (7), `src/data/battlefields.ts` (SR layout fit: drop impassable pieces near elements, prefer layouts with terrain within 5" of each flag), `tests/data/steamroller-data.test.ts` | B.4 data; validates with the WP1 schema | WP1 |
| WP8 Defenses (M13b) | later | A.6 | WP3 |

Order: WP1 alone → WP2, WP3, WP4, WP7 in parallel → WP5 and WP6 in parallel → e2e (`tests/e2e/steamroller.spec.ts`,
owned by whoever runs the stage) → STATUS/HANDOFF by the main loop.

### D.3 AI use of cards (WP6, normal tier; easy tier plays a random legal card 25% of the time it may)

The bot keeps its two plays per turn and spends more freely late: a card is played when its score ≥ a threshold that
falls from 3.0 (round 1) to 1.0 (round 5+), score units = expected boxes of damage, or 4 per VP swing.

| Card | Plays when |
|---|---|
| Put the Fires Out | A: a model of value ≥ 5 points (or the Leader) is on fire or corroded (score = expected continuous damage), or the Leader or a heavy is knocked down within enemy threat. B: the Leader or a model of value ≥ 8 has ≥ 3 damage (score = 3 boxes × value weight). Leader first |
| Blessings of the Gods | A: the planned attack target has Incorporeal, or an effect only magical or blessed attacks get through. B: the Leader is exactly 1 short for its planned feat, spell or kill line, or a war-engine with < 3 focus has a planned attack whose expected damage rises by ≥ 2 with one more boost |
| Careful Reconnaissance | A: Pathfinder turns an unreachable charge or element into a reachable one (move planner with and without). B: the model ends its plan inside more enemy threat than 3" back would leave it, or the Leader's safety score improves |
| Duck and Cover! | A: a warrior unit or solo ends on or near an element and the enemy has ranged or blast threat on it. B: same position, enemy melee or slam threat larger than ranged |
| Bite and Hold | A: the subject secures an element now and will leave it or likely die before scoring (e.g. charging out); B: an enemy with push, slam or throw threatens to move it off an element |
| For the Motherland | a warrior unit on an element within enemy kill range, round ≥ 2 |

Scenario roles (`src/ai/scenario.ts`): cache raider (cheapest fast model claims the opponent's cache when uncontested),
Payload hauler (Cohort models secure their own 50; the bot always moves it the full distance toward the opponent's
terrain), fuse picker (remove tokens from the element it controls or will control next, never from one the enemy is
on), heel tokens (add a token only when the race is winnable or when the 3" move would not lose the objective),
objective moves against the opponent (always full distance when it pushes the objective away from the opponent's
models), flag terrain pick (the piece nearer its own deployment zone with most cover for its units).

---

## E. Test IDs

The new cases are the CARD-, SR- and CLK- block at the end of `12-rules-test-checklist.md`.
