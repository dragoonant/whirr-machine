# 81: Warlocks, warbeasts and fury (M9)

Freezes the fury half of MK4 for the engine, data, AI and client before the M9 fan-out. All prose is ours; rules
are paraphrased, never quoted. Page refs `p<n>` are the printed page numbers of the MK4 rulebook PDF in
`docs/sources/` (abridged digital; book page = PDF page + 52); `A1` is the timing appendix (p128–129); `SR p<n>` is
Steamroller 2026. Rule IDs `F<n>.<m>` are stable and referenced by `12-rules-test-checklist.md` (FURY-xxx).
On a conflict this file wins for fury rules; `00-architecture` wins on names and shapes; `10-rules-core` wins for
everything that is not fury-specific. MK3 guard (10 R0) applies in full: no facing, free strikes, STR or
templates; melee 1" (reach 2"); run SPD+5"; frenzy charges use the normal MK4 charge (SPD+3").

**Glossary (code names).** *warlock* = a `type: 'leader'` model whose profile has `resource: 'fury'` (Fury
Manipulation, Battlegroup Controller). *beast* = a `type: 'beast'` model (a warbeast; a Cohort model, p65).
*battlegroup* = a warlock plus the beasts whose `controllerId` is that warlock. *fury model* = warlock or beast.
*forcing* = putting fury **on a beast** to buy an effect. *focus model* = warcaster or war-engine (unchanged).

---

## A. Rules (normative step lists)

### F1 Model types, stats and starting fury

| ID | Rule | Ref |
|---|---|---|
| F1.1 | A warlock is an independent Leader character with ARC, CTRL and AAT. It holds fury points instead of focus. Every warlock has Battlegroup Controller, Leader, Feat (once per game, any time in its activation), Fury Manipulation, Spirit Bond, Reaving, Healing, Transferring Damage and Spellcaster | p65, p104–105 |
| F1.2 | A beast is an independent Cohort model with FURY and THR. Classes by base: lesser 30 mm, light 40, heavy 50, super-heavy 80, gargantuan 120. Beasts have a life spiral, not a grid | p65, p106 |
| F1.3 | FURY = how much fury a beast can hold (its current FURY is a hard cap). THR = threshold for the frenzy check. ARC = the warlock's starting fury and its cap for leeching, Spirit Bond and (by RULING F12.1) reaving | p66 |
| F1.4 | A warlock starts the game with fury = ARC. Beasts start with 0 | p104, p117 |
| F1.5 | Every beast starts the game assigned to a battlegroup of a Fury Manipulation model in the same army (list data names the controller). Mercenary beasts only in a Mercenary warlock's battlegroup; Farrow and Gatorman beasts only with a warlock of the same kind | p120, p107, p131 |
| F1.6 | Recon, Skirmish, Pitched, Grand Melee: the Leader's battlegroup needs ≥1 non-lesser Cohort model (a light-or-larger beast satisfies it). Gargantuans are banned in Recon and Skirmish | p118 |
| F1.7 | Construct beasts never make threshold checks and cannot be healed | p106 |
| F1.8 | Wild beasts cannot gain fury, be forced or use their animus (F11) | p97, p106 |

### F2 Fury on the warlock (Fury Manipulation)

| ID | Rule | Ref |
|---|---|---|
| F2.1 | Fury is spent only in the warlock's own activation unless a rule says otherwise. The stated exceptions: upkeep (Control), shake (Control), transfer (any time it would suffer damage) | p104–105 |
| F2.2 | Spends, 1 fury each unless noted: boost one attack or damage roll in its activation; one additional melee attack per point (ranged only by a card rule); shake (F6.4); heal 1 damage point on itself or a beast of its battlegroup in its CTRL (any time in its activation); transfer one damage instance (F8); take control of a wild beast within 1" (F11.3); spells and animi of its battlegroup's beasts in CTRL pay their COST; upkeep 1 per spell | p105, p97, p109–110 |
| F2.3 | **Shedding:** any time in its activation, even after running, a warlock may remove any number of its own fury points | p105 |
| F2.4 | **Maintenance:** a warlock above its current ARC drops to ARC. Fury on beasts is **left alone** | p72, p104 |
| F2.5 | Control range: circle from the warlock's base edge, radius current CTRL; the warlock is always in its own CTRL. A beast must be in CTRL to be forced, leeched, healed, receive a transfer, or lend its animus to the warlock. LOS is never needed | p104, p106 |
| F2.6 | Execution Mode only: when a Leader spends fury in its activation to heal itself, each point removes 5 damage (not for beasts). Inactive until the engine has Execution Mode | p117 |

### F3 Control Phase order (fury and focus together)

Run for the active player, in this order. Windows are the `00 §7` ids plus the two new ones (§E).

| Step | Window | What happens | Ref |
|---|---|---|---|
| C1 | `control.refill` | Focus models refill to ARC (unchanged, R4.4) | p72 |
| C2 | `control.leech` | Each warlock, in model-id order: **leech** (F4.1–F4.4), then **Spirit Bond** (F4.5). Decision `leech` per warlock | p72, p104–105 |
| C3 | `control.powerUp` | War-engines power up (unchanged) | p72 |
| C4 | `control.allocate` | Focus allocation (unchanged) | p72 |
| C5 | `control.upkeep` | Focus **and fury** casters pay 1 per upkeep they keep (`payUpkeep`, one decision for the side) | p72, p110 |
| C6 | `control.threshold` | Threshold check for each beast with ≥1 fury, one at a time in model-id order; a failure frenzies at once and its whole frenzy activation resolves before the next check (F7) | p72, p107 |
| C7 | `control.shake` | One `shake` decision: focus shakes (unchanged), warlock fury shakes (F6.4), beast forced shakes (F6.5) | p105–106 |
| C8 | — | Other Control Phase effects; Ambush arrivals (R4.9) | p72 |

- RULING F3.a: the warlock's own fury shake ("after leeching") is offered at C7 with the beast shakes, not
  between C2 and C3. Still after leeching; one shake prompt per turn instead of two.
- RULING F3.b: threshold checks run in model-id order with no player choice of order.

### F4 Leeching and Spirit Bond (C2)

| ID | Rule | Ref |
|---|---|---|
| F4.1 | A warlock may take any number of fury points off beasts in **its** battlegroup that are in its CTRL; each point taken leaves the beast and lands on the warlock | p104 |
| F4.2 | **Self-leech:** it may also take fury from its own life force; each point costs it 1 damage point. That damage can never be transferred (it can still disable the warlock: Tough and the death windows apply as usual) | p105 |
| F4.3 | Cap: leeching (beasts + self together) can never push the warlock above its **current ARC**. A warlock already at or above ARC leeches nothing | p104–105 |
| F4.4 | Leeching happens at the start of Control, before upkeep and threshold checks. Beasts out of CTRL, wild beasts and beasts of other battlegroups can't be leeched | p72, p105 |
| F4.5 | **Spirit Bond:** after leeching, the warlock may gain up to 1 fury per **medium-or-larger** beast that was in its battlegroup and has been destroyed or removed from play (counted again every turn). Still capped at ARC. A destroyed beast that returns to play stops counting while it is in play | p72, p105 |
| F4.6 | Engine: Spirit Bond is strictly beneficial, so it is auto-applied at its maximum (no decision; reported in `FuryLeeched.spiritBond`). RULING F4.a | — |

### F5 Forcing beasts

**Forceable gate** `canForce(beast, n, purpose)` (all must hold; first failure is the rejection):

| # | Check | Rejection | Ref |
|---|---|---|---|
| 1 | Beast is `active`, on the table, not wild, not frenzied | `E_CANNOT_FORCE` | p97, p107 |
| 2 | Its controller is an active warlock on the table and the beast is in that warlock's battlegroup | `E_CANNOT_FORCE` | p104, p106 |
| 3 | Beast is in its controller's CTRL (no LOS needed) | `E_OUT_OF_CTRL` | p106 |
| 4 | Spirit aspect not crippled | `E_CRIPPLED` | p96 |
| 5 | `fury + n ≤ current FURY` | `E_FURY_CAP` | p106 |
| 6 | Purpose rules below (own activation; animus once; not while channelling) | `E_ALREADY_USED` / `E_NOT_AN_OPTION` | p106, p109, p111 |

Each successful force **adds** fury to the beast (the warlock pays nothing) and emits `BeastForced`.

| ID | Forced for | Fury gained | When | Ref |
|---|---|---|---|---|
| F5.1 | Run or charge (a beast **must** be forced to run or charge) | 1 | `chooseMovement`, on declaring | p74, p76, p106 |
| F5.2 | Additional melee attack (ranged only by a card rule, e.g. Forced Reload) | 1 each | `chooseAttack` | p80, p106 |
| F5.3 | Boost one attack or damage roll in its activation (each roll once) | 1 each | `boostAttack` / `boostDamage` | p106 |
| F5.4 | Power attack (headbutt, slam, throw, trample) | 1 | slam/trample on declaring the movement; headbutt/throw at `chooseCombatAction` | p86, p106 |
| F5.5 | Cast its animus | COST of the animus | any time in its activation, **once per activation** | p109 |
| F5.6 | Shake (stand up, end stationary, end one shakeable effect) | 1 each | C7 only, after threshold and frenzies | p106 |
| F5.7 | **Rile:** gain any number of fury for nothing else | n (1..room) | any time in its activation, even after running | p106 |

- F5.8 A force that would push the beast above its current FURY is refused (no partial forcing). If its current
  FURY drops (an effect), excess fury is removed at once (`FuryChanged reason 'capTrim'`) (p106).
- F5.9 Fury stays on a beast until leeched, reaved, vented after a frenzy, lost to wildness or removed by a rule
  (p106). Beasts never lose fury in Maintenance.
- F5.10 A channelling beast can't be forced to pay a channelled spell's COST or boost its rolls (p111).
- F5.11 Attacks outside the beast's own activation (out-of-activation triggers) offer no forcing unless the rule
  says so (mirrors R4.10 for focus).
- RULING F5.a: rile and shed "even after running" are offered at the any-time points **before** Normal Movement
  instead of after the run ends. The result is identical (the run itself adds 1, so the rile options list
  `room` and `room − 1`), and the engine needs no post-run window.
- RULING F5.b: a beast slam is one force (the power attack), not two; the slam's movement is not a charge.

### F6 Upkeep and shake with fury

| ID | Rule | Ref |
|---|---|---|
| F6.1 | A warlock keeps each upkeep spell for 1 fury in C5; unpaid upkeeps expire. Same one-friendly/one-enemy limit as focus (R8.6) | p110 |
| F6.2 | An animus cast by a warlock is the warlock's spell: if it is UP, the warlock upkeeps it | p109–110 |
| F6.3 | RULING F6.a: an UP animus cast by a **beast** can't be upkept (a beast has no fury to spend) and expires at its controller's next C5 | — |
| F6.4 | Warlock shake (C7): 1 fury of its own to stand up, end stationary, or end one shakeable effect on itself | p105 |
| F6.5 | Beast shake (C7): forced (+1) for the same three uses; needs the full forceable gate | p106 |

### F7 Threshold and frenzy (C6)

**Threshold check (each beast with ≥1 fury, not Construct, not wild):** roll 2d6 (`purpose 'threshold'`), add the
beast's fury; **frenzy iff total > current THR** (equal passes). `ThresholdChecked` records the roll (p107).
`pFrenzy = P(2d6 > THR − fury)`.

**Frenzy activation (exact steps, p107):**

| Step | Action |
|---|---|
| FZ1 | `frenzied = true`. The beast activates now (`ActivationStarted`, `activation.frenzy` set). It cannot activate again this turn (p73) |
| FZ2 | Without forcing it shakes knockdown, stationary and every shakeable effect (`ConditionRemoved reason 'frenzy'`). For this activation it ignores effects that would make it forfeit its Normal Movement or Combat Action |
| FZ3 | **Target:** the closest model (edge to edge) in its LOS, **friend or foe**, any type (wild, inert and enemy Leaders included). Ties → one seeded d6 roll-off among the tied models (`purpose 'frenzyTie'`). No model in LOS, or a rule stops it charging (a `forbid charge` effect; a gargantuan, which may only advance) → step FZ7 |
| FZ4 | **Charge** that target with no force: even if engaged; straight at it up to SPD+3"; it may not stop on its own before contacting the target (the engine moves it the full distance or until contact/blocked). Normal charge rules otherwise (rough terrain, stops on contact). `ChargeDeclared` / `ChargeResolved` as usual |
| FZ5 | If the target is in range of a melee weapon: one attack with the **highest-POW melee weapon that reaches** (tie: first in profile order, RULING F7.a). The attack roll is boosted for free (`RollBoosted source 'frenzy'`); if it moved ≥3" it is a charge attack and its damage roll is boosted. It may target a friendly model. No Assault, no additional attacks, no forcing, no animus, no special actions. A failed charge makes no attack |
| FZ6 | The activation ends at once after that attack resolves (all its triggers included) |
| FZ7 | `frenzied = false` (`FrenzyEnded`). Decision `adjustFury` (owner): remove any number of fury from the beast (0..all). Then the next threshold check |

- F7.1 Wild beasts never frenzy (they have no fury). Construct beasts never check.
- F7.2 The beast frenzies whatever its CTRL status; a frenzied beast can't be forced (F5 gate 1).
- F7.3 Frenzy damage to a friendly beast that kills it: no reave (F9.3, friendly attack). Spirit Bond still counts.
- RULING F7.b: no decision picks the frenzy target; the rules make it the closest model with a random
  tie-break, so the engine resolves it and reports the candidates in `Frenzied.tiedIds`.
- RULING F7.c: "cannot immediately activate" covers a beast that is off the table, already activated this turn
  or disabled; it skips FZ1–FZ6 and goes to FZ7.

### F8 Transferring damage

**Window:** `damage.beforeApply` (A1 step 08G, "would suffer damage"), per damage instance, after the damage roll
and any "fails to exceed ARM" triggers, before boxes are marked. Same window as Power Field.

| # | Step | Ref |
|---|---|---|
| T1 | Eligible iff: the damaged model is a warlock with ≥1 fury; the instance deals ≥1 damage point; the instance is not flagged `noTransfer` (self-leech damage, transfer overflow, a rule saying so) | p105 |
| T2 | Candidate beasts: in the warlock's battlegroup, in its CTRL, `active` on the table, not wild, **fury < current FURY**, able to suffer transferred damage (no `forbid beTransferred`) | p105 |
| T3 | Decision `transferDamage` for the warlock's controller (may be the inactive player): one option per candidate (cost `fury: 1`) and `keep` | p105 |
| T4 | On a transfer: warlock pays 1 fury (`FuryChanged purpose 'transfer'`). `absorbed = min(points, beast unmarked boxes)`, `overflow = points − absorbed` (computed **before** marking) | p105 |
| T5 | Mark `absorbed` on the beast normally (branch roll, F10). Emit `DamageTransferred` then `DamageApplied {source:'transfer'}` | p105 |
| T6 | Apply `overflow` to the warlock as a new instance flagged `noTransfer` (no second prompt) | p105 |
| T7 | Death windows: beast first, then the warlock (RULING F8.a; A1 lets the active player order them, we fix the order). The warlock **still counts as having suffered damage** ("when damaged" triggers on the warlock and the attacker's "if it damages" effects still see the warlock as damaged), even at 0 overflow | p105, A1 09A |

- F8.1 Interaction with **Tough**: Tough is rolled by whichever model is disabled (beast and/or warlock) in its
  own death window. A beast saved by Tough still sends its precomputed overflow to the warlock.
- F8.2 **Disabled / boxed** beasts are never candidates (no unmarked boxes, not `active`). A warlock already
  disabled is not offered a transfer for damage arriving inside its own death windows.
- F8.3 A beast destroyed by transferred damage can't be reaved (F9.3); Spirit Bond still counts it.
- F8.4 Spirit-crippled beasts can still receive transfers (transfer is not forcing). RULING F8.b.
- F8.5 Blast, collateral, spray, trample and other simultaneous damage: each instance gets its own prompt, in
  the order the engine applies instances.
- RULING F8.c (M9 scope): the prompt is raised for every instance in the attack pipeline (direct, blast,
  collateral, power-attack, spell, frenzy) and for no other source. Non-attack damage (continuous fire,
  hazards, non-attack falls) is applied without a transfer prompt in M9; FURY-031 is `todo` until Maintenance
  and hazards can raise decisions mid-step.

### F9 Reaving, beast death and lost fury

| ID | Rule | Ref |
|---|---|---|
| F9.1 | When a beast of a warlock's battlegroup is **destroyed or removed from play** while in that warlock's CTRL, the warlock may take all fury on it before it leaves the table (`death.destroyed`, or `death.boxed` for an RFP) | p105 |
| F9.2 | Cap: the reaver can't exceed its cap; excess is lost. Fury on a beast is only ever reaved by one model | p105 |
| F9.3 | No reave if the beast was destroyed by a **friendly attack** (any attack whose attacker is friendly to the beast, frenzy attacks included) or by **transferred damage** | p105 |
| F9.4 | Fury not reaved is lost with the beast (`FuryChanged reason 'lose'`) | p105 |
| F9.5 | Engine: reaving is strictly beneficial, so with one eligible reaver it is auto-applied (`DecisionAutoResolved {kind:'reave'}` + `FuryReaved`). Decision `reave` only when ≥2 models could reave (a card rule) | — |
| F9.6 | A beast that leaves play while in a battlegroup (not wild) records `bondedTo = controllerId` for Spirit Bond; return to play clears it | p105 |

### F10 Life spirals and aspects

| ID | Rule | Ref |
|---|---|---|
| F10.1 | Six branches numbered 1–6, each a run of damage boxes from the outermost inward. Every box may carry an aspect: Mind, Body or Spirit | p71, p96 |
| F10.2 | **Recording:** each damage instance rolls d6 (`purpose 'column'`) for the branch; mark from the outermost unmarked box inward; a full branch spills to the next branch clockwise that has an unmarked box (2→3 … 6→1). Same algorithm and storage as the war-engine grid (R3.4) with branch = column, outermost = top. RULING F10.a: clockwise = ascending branch number | p96 |
| F10.3 | **Damage to an aspect** (a rule names one): lowest-numbered branch with an unmarked box of that aspect, its outermost unmarked box of that aspect; repeat per point. RULING F10.b: if the aspect fills, remaining points continue as F10.2 from that branch | p96 |
| F10.4 | An aspect is **crippled** while all of its boxes are marked; removing any of them restores it | p96 |
| F10.5 | Crippled **Body**: the beast rolls one fewer die on its damage rolls (its attacks, power attacks and collateral it causes; RULING F10.c). Crippled **Mind**: one fewer die on its attack rolls; no chain attacks, power attacks or special attacks (★Attack). Crippled **Spirit**: cannot be forced (F5 gate 4). Dice floors as R1.10 | p96 |
| F10.6 | Disabled when every box is marked; then the one death machine (R3.9): Tough window, boxed, destroyed, removal | p96 |
| F10.7 | **Healing** removes damage from anywhere on the spiral (healer picks). Default order when no boxes are named (RULING F10.d): one box of each crippled aspect first, Spirit then Mind then Body; then the innermost marked box of the highest-numbered branch. Tough's 1-point heal uses the same default | p97, p68 |

### F11 Warlock destroyed, wild beasts, taking control

| ID | Rule | Ref |
|---|---|---|
| F11.1 | When a warlock is destroyed, removed from play or removed from the table, every beast in its battlegroup goes **wild**, and its upkeeps expire | p96 |
| F11.2 | A wild beast loses all fury, can't gain fury, be forced, cast or lend its animus, or frenzy; it doesn't activate, has no melee range, can't engage or be engaged, can't advance or attack, loses shield/buckler ARM, base DEF 5, melee attacks against it hit automatically; rules unusable while stationary are unusable. It can't secure or contest scenario elements | p97, SR p3 |
| F11.3 | Any time in its activation, a friendly **same-Faction** warlock within 1" of a wild beast may pay 1 fury to take control: the beast stops being wild, joins that warlock's battlegroup, and must forfeit its Combat Action this turn | p97 |
| F11.4 | Engine: a wild beast is stored as `wild: true` **and** `inert: true`, so every inert rule (R8.9) applies unchanged; fury code additionally reads `wild` | — |
| F11.5 | A warlock under enemy control: its beasts stay yours but outside any battlegroup until you regain it. No starter content does this; not built in M9 | p104 |

### F12 Spells and animi

| ID | Rule | Ref |
|---|---|---|
| F12.1 | A warlock casts spells by paying COST in fury, any number per activation, any time in its activation (never mid-move, mid-attack, or during another sequence) | p109 |
| F12.2 | A warlock may cast the animus of any beast of its battlegroup that is in its CTRL as if it were its own spell (it pays the COST; the warlock is caster and point of origin) | p105, p109 |
| F12.3 | A beast may be forced to cast its own animus once per activation, any time in it (not mid-move or mid-attack); it gains fury = COST and may not exceed FURY. A cast animus is a spell for every rule (a "can't cast" effect blocks forcing it; COST increases apply) | p109 |
| F12.4 | A model or unit carries at most one **friendly animus**; a newer one replaces the older when it affects the model (for a unit, one trooper affected is enough). An animus expiring on one trooper expires on the unit | p109 |
| F12.5 | Customizable beasts pick their animus at list building (hardpoint) and it never changes | p121 |
| F12.6 | Spell sequence (A1): paying COST includes "being forced to use an animus" | p128 |
| RULING F12.a | Reaving cap: the rule text says the reaver can't exceed its FURY. Warlocks have no FURY stat, so a warlock's reaving cap is its current ARC; a reaver with a FURY stat uses FURY | p105 |

### F13 Other warbeast rules

- F13.1 Beasts can make power attacks per their advantages (p86); all R7.10–R7.14 rules apply, paid by forcing.
- F13.2 Gargantuans (120 mm): always in a battlegroup; can only advance in Normal Movement (so no run or charge,
  forced or frenzied); never placed; Massive (no push, knockdown, stationary; no slam/throw movement). Not in
  Recon/Skirmish (p107, p118). M9 data has none; the flags are specified so the gate is correct.
- F13.3 Beasts are Cohort models: they can secure 50 mm objectives like war-engines (SR p3).
- F13.4 Warlock fury is never spent on a beast's own rolls, and a beast never spends fury (only gains it), unless
  a card rule says so.

---

## B. State and data

### B.1 ModelState (additive, `types.ts`)

| Field | Type | Meaning |
|---|---|---|
| `fury?` | `number` | Fury points. **Present iff the model is a fury model** (warlock: set to ARC at setup; beast: 0). `focus` stays 0 on fury models |
| `wild?` | `boolean` | F11; always set together with `inert: true` |
| `frenzied?` | `boolean` | true only during a frenzy activation (FZ1–FZ7) |
| `bondedTo?` | `ModelId` | Spirit Bond source (F9.6) |

- `controllerId` (existing) points a beast at its warlock. Crippled aspects live in the existing `crippled`
  array as the **lowercase** letters `m`, `b`, `s` (never collide with war-engine `L R M C H A` or the weapon
  location `S`); `Aspect = 'mind' | 'body' | 'spirit'` and `ASPECT_LETTER = {mind:'m', body:'b', spirit:'s'}`.
- `damage` for a beast is the existing `{track:'grid', grids:[{id:'main', cols}]}`: 6 columns = branches, row 0 =
  outermost box. No new `DamageState` member, so every grid consumer keeps compiling.
- `GameState.thresholdQueue?: ModelId[]` holds the beasts still to check in C6 while a frenzy activation waits
  on a decision; cleared when C6 ends.
- `ActivationContext.frenzy?: { beastId: ModelId; targetId: ModelId | null; tiedIds: ModelId[] }`.
- Animus once-per-activation uses the existing `ActivationContext.limitsUsed` entry `animus:<beastId>`.
- `DamageInstance` gains `noTransfer?: boolean` and `transferredFrom?: ModelId`; its `kind` gains `'transfer'`.

### B.2 Data schema (additive; `20-data-schema` §4 is updated by the data package)

| Where | Addition |
|---|---|
| model `type` | `'beast'` |
| model `resource` | `'focus' \| 'fury'`, default `'focus'`; leaders only. `'fury'` = warlock |
| model `beastClass` | `'lesser' \| 'light' \| 'heavy' \| 'superHeavy' \| 'gargantuan'`; beast only, required |
| model `animus` | spell `Id` (beast only; omitted when the hardpoint picks it) |
| `Stats` | beast requires `SPD MAT DEF ARM FURY THR` (RAT only with a ranged weapon); warlock requires `ARC CTRL AAT` |
| `DamageTrack` | `{track:'spiral', branches:[6 × SpiralBranch]}`; `SpiralBranch` = `^[-MBS]{1,10}$`, outermost box first; `M` Mind, `B` Body, `S` Spirit, `-` no aspect |
| hardpoint option | `animus?: Id` (customizable animus, p121) |
| spell | `animus?: boolean` (an animus record; same fields as a spell; `cost` = fury gained when a beast is forced to cast it) |
| ability `cost` | `{focus?, fury?, forced?}` (Regeneration-style "force for 1" = `forced: 1`) |
| `common.schema` | the `hooks.ts` additions in §E mirrored (window ids, ops, forbids, tests, scope `warbeasts`) |
| list entry | `controller?: <entry ref>` for beasts (defaults to the Leader) |
| validate-data | spiral = exactly 6 branches; letters only `-MBS`; beast weapons use location `-`; `resource:'fury'` only on leaders; beast lists: ≥1 non-lesser beast in the Leader's battlegroup for Recon; Mercenary/Farrow/Gatorman pairing; no gargantuan in Recon/Skirmish; MK3 lint unchanged (FURY is a real MK4 stat, never "FOCUS") |

Runtime mapping: `spiralLayout(profile)` (in `spiral.ts`) turns the branches into a `GridLayout {id:'main',
columns}` with letters lowercased (`M→m`, `B→b`, `S→s`), so `newGrid`, `fillGrid`, `crippledSystems` and
`healDamage` run unchanged. `gridLayoutsOf()` stays war-engine only; damage callers ask `layoutsFor(profile)`
which returns either.

### B.3 Focus / fury symmetry (what is reused)

| Concern | Focus (existing) | Fury | Reuse |
|---|---|---|---|
| Store | `ModelState.focus` | `ModelState.fury` | separate field; one dispatch layer `resource.ts` |
| Leader spend: boost, additional attack, spell COST, upkeep, heal, shake | `spendFocus` | `spendFury` | **same call sites**: `pay(state, b, modelId, purpose, n)` picks focus or fury |
| Cohort pays | war-engine spends its own focus | beast is **forced** (gains fury) | same call sites via `pay()`; costs shown as `cost.forced` |
| Refill | ARC refill (C1) | leech + Spirit Bond (C2) | none (different rule) |
| Give to cohorts | allocate (C4), cap 3 | none | — |
| Cohort cap | 3 | current FURY | `capOf(m)` |
| Maintenance | jacks cleared, casters trimmed | beasts kept, warlocks trimmed | `maintenanceFocus` skips fury models; `maintenanceFury` |
| Damage reaction | Power Field (−5, 1 focus) | Transfer (1 fury) | same window `damage.beforeApply`, sibling decision |
| Loss of control | inert war-engine | wild beast (`inert` + `wild`) | inert rules reused |
| Crippled resource | Cortex | Spirit | `crippled` letters |
| Any-time gating | `anytimeGate` | same | reused; rile/shed bypass the "after running" bar (RULING F5.a puts them before movement) |
| Events | `FocusChanged` | `FuryChanged` | parallel shapes |

`isCaster(m)` stays `type === 'leader'`; focus-only paths (refill, allocate, power up) add `!isFuryModel(m)`.
`isWarEngine` stays war-engine only; shared cohort paths (scenario holding, Recon minimum, power-attack
eligibility, threat) switch to `isCohort(m) = warEngine || beast`.

---

## C. Decisions

### C.1 New `DecisionKind`s

| Kind | Who | Window | Raised when | Answer | `legalActions` (finite, all validated) |
|---|---|---|---|---|---|
| `leech` | active | `control.leech` | per warlock (id order) with leech room > 0 and (a beast in CTRL holds fury, or self-leech is possible) | `leech {warlockId, from: {beastId: n}, self: n}` | `max` (drain beasts, highest pFrenzy first, ties by id; no self), `maxSelf` (as `max`, then self-leech to ARC but never to 0 unmarked boxes; only if it adds ≥1), `none`; any valid map passes `validate` |
| `transferDamage` | warlock's controller | `damage.beforeApply` | F8 T1–T2 hold | `transferDamage {toId: beastId \| null}` | one per candidate (`cost {focus:0, fury:1}`, `context.data` carries the `query.transferPreview` row) + `keep` (`toId: null`); `canPass: false` |
| `adjustFury` | owner | `activation.end` | frenzy end (FZ7) with fury on the beast | `adjustFury {modelId, delta}` (delta ≤ 0) | every delta from −fury to 0 (≤ FURY+1 options; `removeAll` first) |
| `reave` | reaver's controller | `death.destroyed` / `death.boxed` | ≥2 eligible reavers (card rules) | `reave {reaverId \| null}` | one per reaver + `none` |

Not added: a frenzy-target decision (F7.b, random), a threshold-order decision (F3.b), a Spirit Bond decision
(F4.6), a post-run rile window (F5.a).

### C.2 New any-time actions (accepted wherever `00 §5` column AT allows `castSpell`)

| Action | Who | Effect | Gate |
|---|---|---|---|
| `adjustFury {modelId, delta}` | active beast (`delta > 0`, **rile**) or active warlock (`delta < 0`, **shed**) | F5.7 / F2.3 | rile: forceable gate with `n = delta`; shed: `−delta ≤ fury` |
| `takeControl {casterId, targetId}` | active warlock | F11.3 | wild same-Faction beast within 1", 1 fury |
| `heal` (existing) | active warlock | gains `targetId?` (self or a battlegroup beast in CTRL, not Construct) and `boxes?` (spiral picks) | fury ≥ points |
| `castSpell` (existing) | active warlock or active beast | gains `animusOf?` (the beast whose animus the warlock casts). A beast casting its own animus = forced COST | F12 |

Option samples: each AT-accepting decision adds, for an eligible active model, `rile:<room>` and `rile:<room−1>`
(beast), `shed:all` (warlock), `heal:<n>` per target, `takeControl:<id>`, animus casts. The sample stays ≤64.

### C.3 Existing decisions that gain fury variants

| Decision | Change |
|---|---|
| `payUpkeep` | fury casters pay fury; option `cost` = `{focus: f, fury: u}` |
| `shake` | options include warlock fury shakes and beast forced shakes (`cost.forced`); `ShakeAction` shape unchanged (payer derived from the model) |
| `chooseMovement` | beast `run`/`charge`/`slam`/`trample` options only when forceable (`cost {focus:0, forced:1}`); otherwise only advance, aim, forfeit (and stand up) |
| `chooseCombatAction` | beast `powerAttack` (headbutt/throw) `cost.forced = 1`; not offered with Mind crippled; ★Attacks not offered with Mind crippled |
| `chooseAttack` | `additional` options: warlock `cost.fury = 1`, beast `cost.forced = 1` |
| `boostAttack` / `boostDamage` | payer by attacker: focus, fury or forced; Powerful Attack the same |
| `castSpell` | warlock spells and battlegroup animi in CTRL (`cost.fury = COST`); beast animus (`cost.forced = COST`) |
| `chooseActivation` | wild beasts and already-frenzied beasts are not listed (inert path) |
| `powerField` | unchanged; never raised for fury models |

`DecisionOption.cost` becomes `{ focus: number; fury?: number; forced?: number }` (forced = fury the **beast**
gains). The AI and client read all three.

---

## D. Events and `query.*`

### D.1 New events

| Event | Fields | Emitted |
|---|---|---|
| `FuryChanged` | `modelId, delta, after, reason: FuryReason, purpose?: FuryPurpose, fromId?` | every fury change (mirror of `FocusChanged`) |
| `FuryLeeched` | `warlockId, sources: {modelId, points}[], selfPoints, spiritBond, after` | end of each warlock's C2 (summary beat; the `FuryChanged` pairs come first) |
| `FuryReaved` | `reaverId, beastId, points, lost` | F9 |
| `BeastForced` | `beastId, controllerId, purpose: ForcePurpose, gained, after` | every force (F5) |
| `ThresholdChecked` | `beastId, rollId, fury, thr, total, frenzied` | C6 |
| `Frenzied` | `beastId, targetId: ModelId \| null, tiedIds: ModelId[], tieRollId?, reason?: 'noTarget' \| 'cannotCharge' \| 'cannotActivate'` | FZ1/FZ3 |
| `FrenzyEnded` | `beastId, vented: number` | FZ7 after `adjustFury` |
| `DamageTransferred` | `warlockId, beastId, points, absorbed, overflow, attackId?, instanceId?` | F8 T5 |
| `AspectCrippled` / `AspectRestored` | `modelId, aspect: Aspect` | F10.4, alongside the existing `SystemCrippled/Restored` with the lowercase letter (so `presentation/apply.ts` keeps `crippled` right) |
| `BeastWild` | `modelId, warlockId` | F11.1 |
| `BeastControlTaken` | `modelId, warlockId` | F11.3 |

Spiral marks reuse `DamageApplied` (`column` = branch 1–6, `boxes[].col` = branch − 1, `row` = index from the
outermost box, `source` may be `'transfer'`). Additive fields on existing events: `SpellCast.animus?: boolean`,
`SpellCast.forced?: boolean`; `RollBoosted.source` += `'fury' | 'frenzy'`; `ActivationEnded.reason` += `'frenzy'`;
`ConditionRemoved.reason` += `'frenzy'`; `CombatActionForfeited.reason` += `'tookControl'`.

Enums: `FuryReason = 'start' | 'leech' | 'leechSelf' | 'spiritBond' | 'reave' | 'forced' | 'spend' | 'shed' | 'trim' |
'capTrim' | 'vent' | 'wild' | 'lose' | 'gain'`; `FuryPurpose = 'boostAttack' | 'boostDamage' | 'additionalAttack' |
'spell' | 'upkeep' | 'shake' | 'heal' | 'transfer' | 'takeControl' | 'reload'`; `ForcePurpose = 'run' | 'charge' |
'additionalAttack' | 'boostAttack' | 'boostDamage' | 'powerAttack' | 'animus' | 'shake' | 'rile' | 'reload' |
'ability'`.

### D.2 Query extensions (`index.ts`; the only numbers the UI and AI show)

| Query | Returns |
|---|---|
| `query.fury(state, id)` | `{kind:'warlock'\|'beast'\|null, fury, cap, capStat:'ARC'\|'FURY', controllerId?, inCtrl?, forceable, block?: 'wild'\|'frenzied'\|'spirit'\|'outOfCtrl'\|'cap'\|'noController', room}` |
| `query.battlegroup(state, warlockId)` | `{ctrl, leechRoom, spiritBond, beasts: query.fury rows + pFrenzyNow}` (HUD fury bars) |
| `query.threshold(state, beastId, extraFury = 0)` | `{thr, fury, need, pFrenzy, construct}`; `pFrenzy = P(2d6 > thr − fury − extra)` |
| `query.spiral(state, id)` | `{branches: {branch, boxes: {aspect: Aspect\|null, filled}[]}[], unmarked, aspects: Record<Aspect, {total, filled, crippled}>}` (spiral view) |
| `query.transferPreview(state, warlockId, points)` | per beast `{beastId, eligible, reason?, unmarked, fury, cap, absorbed, overflow, pDisabled, pCripple: Record<Aspect, number>}`; `pCripple` is exact over the 6 branch outcomes |
| `query.frenzyTarget(state, beastId)` | `{tiedIds, distance, friendly: boolean, canCharge, reason?}` (prediction for AI and UI) |
| `query.leechPreview(state, warlockId, plan)` | `{gained, selfDamage, after, pFrenzyAfter: Record<beastId, number>}` |
| `query.threat` (existing) | beasts: run/charge/slam assume a force only if `forceable`; `ThreatRanges.needsForce?: boolean` |
| `describe.decision` / `describe.event` | titles and lines for the new kinds and events, our words ("Leech fury", "Transfer the damage?", "Frenzy: the Bomber charges the closest model") |

---

## E. Contract changes (planned; applied by one contracts agent before fan-out)

All additive; each gets a row in `00-architecture` §14 when applied (the PLANNED block there lists them).

| File | Exact additions |
|---|---|
| `types.ts` | `ModelType` += `'beast'`. `WINDOW_IDS` += `'control.leech'`, `'control.threshold'` (insert after `control.refill` / `control.upkeep`; order is only for display). `ModelState` += `fury? wild? frenzied? bondedTo?`. `GameState` += `thresholdQueue?: ModelId[]`. `ActivationContext` += `frenzy?: {beastId, targetId: ModelId\|null, tiedIds: ModelId[]}`. `DamageInstance` += `noTransfer? transferredFrom?`, `kind` += `'transfer'`. `DecisionKind` += `'leech' 'transferDamage' 'adjustFury' 'reave'`. `DecisionOption.cost` → `{focus: number; fury?: number; forced?: number}`. `RejectionCode` += `'E_INSUFFICIENT_FURY' 'E_FURY_CAP' 'E_CANNOT_FORCE'`. `RollPurpose` += `'threshold' 'frenzyTie'`. New types `Aspect`, `ASPECT_LETTER`, `FuryReason`, `FuryPurpose`, `ForcePurpose` |
| `actions.ts` | New: `LeechAction 'leech' {warlockId, from: Record<ModelId, number>, self: number}`, `TransferDamageAction 'transferDamage' {toId: ModelId \| null}`, `AdjustFuryAction 'adjustFury' {modelId, delta}`, `ReaveAction 'reave' {reaverId: ModelId \| null}`, `TakeControlAction 'takeControl' {casterId, targetId}` (union 34 → 39). `HealAction` += `targetId?`, `boxes?: BoxRef[]`. `CastSpellAction` += `animusOf?: ModelId` |
| `events.ts` | The 12 events of D.1 (union 54 → 66) and the additive fields listed under D.1 |
| `hooks.ts` | `EffectOp` += `'gainFury' 'loseFury'`. `ForbidWhat` += `'gainFury' 'force' 'beTransferred' 'combatAction'`. `ConditionTest` += `'furyAtLeast' 'aspectCrippled' 'frenzied' 'inBattlegroup'`. `ScopeNode.who` += `'warbeasts'` (beasts of the subject's battlegroup). `DescriptorSource` += `'animus'`. `TriggerDescriptor.cost` → `{focus: number; fury?: number; forced?: number}` (focus stays required; descriptor builders default it to 0 when data omits it). `OP_HOOK_POINTS` += `gainFury`/`loseFury`: `['passive','activation.start','attack.resolved','spell.cast','feat.used','death.destroyed']` |
| `index.ts` | Signatures + result types for the D.2 queries (bodies may throw `not implemented (M9)` until E7 lands); `ThreatRanges.needsForce?`; `describe` strings; `ENGINE_VERSION` 0.3.0 when bodies land |
| `decider.ts` | No change (one interface already covers the new kinds) |
| `rng.ts` | No change (`RollPurpose` lives in `types.ts`) |
| schemas (`docs/spec/schemas/` and `src/data/schema/`, both copies) | B.2 (owned by D1, not the contracts agent) |

### E.1 Engine work packages (disjoint file ownership)

| Pkg | Owns (only these files) | Delivers | Depends on |
|---|---|---|---|
| **C0 contracts** | `types.ts actions.ts events.ts hooks.ts index.ts` (signatures/stubs), `00-architecture` §14 rows | §E table | — |
| **E1 fury core** | new `src/engine/fury.ts`, new `src/engine/resource.ts` | `isFuryModel isBeast isCohort isWild capOf`; `gainFury spendFury setFury canForce force rile shed clampFury maintenanceFury startingFury`; `leech(plan) spiritBond reaveOnDeath markWildBeasts takeControl`; `resource.ts`: `payerFor costFor pay` dispatch focus/fury/forced | C0 |
| **E2 spiral + setup** | new `src/engine/spiral.ts`, `damage.ts`, `setup.ts` | `spiralLayout layoutsFor fillAspect aspectEvents defaultHealBoxes`; `applyDamage`/`healDamage` emit `AspectCrippled/Restored` for spiral profiles; setup: spiral damage init, `fury` = ARC / 0, beast `controllerId` from the list, Recon cohort minimum with beasts | C0 |
| **E3 control flow** | `phases/control.ts`, new `phases/threshold.ts`, `phases/maintenance.ts`, `turnflow.ts`, `focus.ts` | C2 leech decision, C5 fury upkeep, C6 queue + resume after a frenzy, C7 combined shake; `maintenanceFury`; `refillCasters`/`maintenanceFocus` skip fury models | E1, E4 |
| **E4 frenzy** | new `phases/frenzy.ts` | FZ1–FZ7: target pick (`query.frenzyTarget` logic), auto charge path, attack declaration through `declareAttack`/`drive` (exported by activation.ts), `adjustFury` vent, hand back to E3 | E1, E5 exports |
| **E5 activation** | `phases/activation.ts`, `movement.ts`, `power-attacks.ts` | every `spendFocus` call → `pay()`; forced costs on run/charge/slam/trample/power/additional/boost; Mind/Body dice removal; Mind bans; transfer step in `applyJob` beside Power Field (T1–T7, beast-then-warlock death order); `finishActivation` returns to Control when `activation.frenzy`; exports `beginFrenzyActivation` helpers for E4 | E1, E2 |
| **E6 spells** | `spells.ts`, `effects.ts` | fury COST, warlock casts battlegroup animi, beast forced animus (once/activation), one-friendly-animus replacement, `heal` with `targetId`/`boxes`, `adjustFury` and `takeControl` any-time actions and their AT options, `expireCasterEffects` + `markWildBeasts` on warlock loss | E1, E2 |
| **E7 queries + hooks** | `index.ts` (bodies only), `code-hooks.ts`, `scenario.ts` | D.2 bodies, `describe.*`, `gainFury/loseFury` ops, new condition tests and forbids, scope `warbeasts`; scenario: beasts secure 50 mm as Cohort, wild beasts never secure/contest | E1, E2 |
| **D1 data** | `src/data/schema/*`, `docs/spec/schemas/*`, `src/data/types.ts`, `tools/validate-data.ts`, `20-data-schema.md` | B.2 | C0 |
| **A1 AI** | new `src/ai/fury.ts`, `src/ai/decider.ts`, `src/ai/focus.ts`, `src/ai/prob.ts`, `src/ai/damage.ts` | §F | E7 queries |
| **U1 client** | new `src/client/ui/spiralView.ts`, new spiral card component, prompt components for the new kinds, `presentation/apply.ts`, `audio/eventSounds.ts`, help text | §G | E7 |
| **T1 tests** | new `tests/engine/fury.test.ts`, `tests/engine/spiral.test.ts`, `tests/engine/frenzy.test.ts`, `tests/engine/transfer.test.ts` | FURY-001..051 | all engine pkgs |

Faction data (Trollbloods etc., `factions/*.md`) is a separate package and depends on D1.

---

## F. AI notes (`40-ai`)

| Decision | Policy (normal tier) |
|---|---|
| `leech` | Fury need = knapsack demand for this turn (boosts, extra attacks, spells, heals) + **transfer reserve** (below) − current fury, capped by leech room. Drain beasts in order of frenzy cost: `pFrenzy(fury) × frenzyCost(beast)` where `frenzyCost` uses `query.frenzyTarget` (closest is friendly → high; enemy in charge reach → low or negative; no target → small). Leave fury on a beast only when leech room is exhausted. Self-leech only if the plan still has value and `leaderRisk` stays ≤ τ_safe with the extra damage |
| forcing (knapsack) | Each beast is a knapsack group with budget `FURY − fury`; options cost "forced" points, not warlock fury. Penalty per point = Δ next-turn frenzy risk: next turn's leech capacity ≈ `ARC − fury the warlock keeps`; fury beyond it stays on beasts → `query.threshold` → `pFrenzy × frenzyCost`. Keep 1 point of room on beasts that are likely transfer targets |
| transfer reserve | Like Power Field in §3/§6: the warlock's retained fury `F` lets the first `F` enemy damage instances move to beasts with room (fury < FURY, unmarked ≥ points). `leaderRisk` is computed with that reserve; the warlock keeps enough fury to keep `leaderRisk ≤ τ_safe` |
| `transferDamage` | Always transfer if the damage would disable the warlock or leave it ≤ 3 boxes. Otherwise transfer when `points × leaderValueFactor > value lost on the beast` (expected box loss × beast value + `pCripple(spirit)` × planned forcing value + `pDisabled` × beast value). Pick the candidate with the least loss; prefer `overflow = 0` |
| `adjustFury` (vent) | Remove all unless the warlock will have leech room next turn that its other beasts can't fill **and** keeping it doesn't push next turn's `pFrenzy` above 0.2 |
| rile | Only at the end of the plan, to feed next turn's leech when the battlegroup would otherwise leave room unfilled and `pFrenzy` after expected leech stays < 0.15 |
| animus | Spell value model; warlock cast spends warlock fury, beast cast spends beast room — pick the cheaper in knapsack terms |
| heal | `−Δ leaderRisk` for self; Spirit-crippled beasts healed when forcing them is in the plan |
| `takeControl` | When a wild friendly beast is within reach and its value > 1 fury in the knapsack |
| threat maps | Enemy beasts outside their warlock's CTRL (or at cap / Spirit crippled) threaten only advance range |
| activation order | Beasts with high fury or planned rile go after the warlock has spent (leech room next turn) |

Tiers: `easy` leeches `max`, never self-leeches, forces up to `FURY − 1`, transfers when points ≥ 4 or lethal, vents
all. `random`: uniform over `legalActions` (the samples are built to be safe to pick). Bench: add a fury mirror to
`npm run bench:ai` once a fury list exists (frenzies per game, transfers per game, warlock deaths with fury left).

---

## G. Client notes (`50-client`)

- **Cards and HUD.** Fury models show a flame-pip bar (`fury / cap`, cap label ARC or FURY) from `query.fury`;
  beasts add THR and the next-check frenzy chance from `query.threshold` (badge turns red above 30%). A
  battlegroup strip under the warlock's portrait lists beasts with fury bars, in-CTRL dot, "can't force" reason.
- **Spiral view** (`spiralView.ts` + card component): six radial branches, outermost box on the outer ring,
  boxes tinted by aspect (theme tokens `--aspect-mind/body/spirit`), filled boxes solid, crippled aspect banner
  with its effect in our words. Last marks flash; during `damage.beforeApply` the incoming branch is previewed.
  Test ids `card-spiral-<modelId>`, boxes `spiral-box-<branch>-<i>` with `data-filled`, `data-aspect`.
- **Leech prompt.** Fury flames drift from beasts to the warlock; steppers per beast plus a self-leech stepper
  with a damage warning; buttons for the engine options (`max` labelled "Leech (safest)"). Shows
  `query.leechPreview` frenzy odds after the plan.
- **Forcing.** Options with `cost.forced` show "+n fury on <beast>" in red; disabled options show the `block`
  reason. Rile/shed buttons sit with Cast/Feat/Heal.
- **Transfer prompt.** Docked prompt: incoming points, warlock boxes left, one card per candidate with
  `absorbed / overflow`, fury x/FURY, aspect-cripple odds from `query.transferPreview`; `Keep` button. Bot
  transfers play a beat (arc from warlock to beast, numbers on both).
- **Threshold and frenzy beats.** Dice tray renders `threshold` rolls as "2d6 + fury vs THR" with PASS / FRENZY
  (frenzy when the total is **above** THR). Frenzy beat: red flash, camera cut to the beast, line to the
  target (friendly targets highlighted), charge, attack, then the vent prompt.
- **Wild beasts** are desaturated with a "wild" tag; take-control shows a 1" ring around wild beasts in reach.
- **Audio** (new ElevenLabs clips, via the audio pipeline): leech draw, force grunt, frenzy roar, transfer
  thud; mapped in `eventSounds.ts` for `FuryLeeched`, `BeastForced`, `Frenzied`, `DamageTransferred`.
- **How to Play:** a "Fury and warbeasts" tab in our own words. No SFG art, icons or logos for any of this.

---

## Open questions

- Q1 Aspect layout per box on each real spiral (data only; the app is the source). The community data gives
  branch sizes but not aspects.
- Q2 Whether a frenzied beast's free charge can be a slam or trample (we say no: FZ4 is a charge).
- Q3 Transfer for non-attack damage (F8.c) waits for decision-capable Maintenance and hazards.
- Q4 Order of simultaneous death windows after a transfer (F8.a fixes beast then warlock).
- Q5 Execution Mode Rapid Healing (F2.6) is inert until the engine has Execution Mode.
