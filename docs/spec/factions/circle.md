# Faction: Circle Orboros (Devourer's Host, Tanith battlegroup) — Recon starter

- **Sources:** community MK4 card data (`isorna/wardice-warmachine-data`, `mk4/profiles/circle-orboros.devourer-s-host.profiles.json`
  plus `abilities/abilities.json`, `spells/spells.json`, `advantages/advantages.json`, fetched 2026-10-06); the MK4
  rulebook (`docs/sources/WMH-MK4-Rulebook_Digital_144-OP_Abridged.pdf`: life spirals p96, threshold and frenzy p107,
  animi p109, corpse tokens p97, cloud effects p98); official Privateer Press product photos (base-size labels). The app
  version of the community data is unknown.
- **No Quick Start coverage.** The QS (Jul 2025) is Cygnar vs Khador only, and handoff G has no Circle entry, so no value
  here can reach `verified` or `V-cd`. Everything is `U-cd` or `U-guess` until the **open app check** (record the app
  version, confirm every value).
- **Confidence key** (QS beats community data on any conflict):
  - `verified (QS pN)`: printed in the Quick Start on page N (or read from its diagram); data entry may use it;
  - `V-cd`: community data and handoff G agree, not contradicted by the QS;
  - `U-cd`: community data only;
  - `U-guess`: no source; data entry must not trust it.
- All prose is ours. Names are real (Mallet posture). UI names come from `shipName`.
- Fury terms are used plainly here; the engine rules for them are `81-warlocks-fury.md` (written in parallel). FURY on a
  warbeast = how many fury points it can hold when forced; THR = threshold for the frenzy check; a warlock's ARC = the
  most fury it can hold; an animus is a warbeast's own spell that its warlock can also cast.

## Chosen box and why

No official MK4 30-point Circle starter exists that we could find: Steamforged's store (steamforged.com, warmachine.gg)
lists no Circle Orboros product at all (store search 2026-10-06 returned none), the Privateer Press store search returns
0 results, and SFG's 2025–26 Command Starters / Battlegroup Boxes cover other factions. The closest official box is the
**Circle Orboros Battlegroup Starter** (Privateer Press, 2017): Tanith the Feral Song, Pureblood Warpwolf, Gorax (Rager in
MK4), Wild Argus. All four are in the MK4 **Devourer's Host** army in the community data. We keep Tanith and the
Pureblood, drop the two lights, and add a Devourer's Host solo and 3-model unit to reach the Cygnar/Khador shape:

| Slot | Model | Pts | In the official box? |
|---|---|---|---|
| Leader | Tanith the Feral Song | 0 | yes |
| Heavy warbeast | Pureblood Warpwolf | 15 | yes |
| Solo | Lord of the Feast | 5 | no (it was in the Privateer Press Circle All-in-One Army Box) |
| Unit (3) | Tharn Ravagers | 9 | no (Devourer's Host core unit; official plastic kit PIP 72066) |
| **Total** | | **29** | |

Not fielded: Gorax Rager (7, light, animus Primal) and Wild Argus (6, light, animus Doppler Bark). Two lights instead of the
solo would break the shape (one heavy, one solo, one unit).

## Roster (29 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| cir.tanith | Tanith the Feral Song | Tanith | Leader (warlock), character | 0 | 30 | 15 | pts, boxes U-cd; base U-guess (human-sized model) |
| cir.pureblood | Pureblood Warpwolf | Pureblood | Heavy war-engine (warbeast), living | 15 | 50 | spiral 28 | pts, spiral U-cd; base U-guess (official product photo label: 50 mm) |
| cir.lord-of-the-feast | Lord of the Feast | Feast Lord | Solo, character | 5 | 30 | 8 | pts, boxes U-cd; base U-guess |
| cir.ravagers | Tharn Ravagers | Ravagers | Unit, 3 troopers (`cir.ravager`) | 9 | 40 | 8 each (from the Tharn Ravager White Mane solo, same stat line); size 3 | pts U-cd; base U-guess (official product photo label: 40 mm); boxes, size U-guess |

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | FURY | THR | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cir.tanith | 6 | 7 | 6 | 6 | 15 | 15 | 6 | 12 | — | — | U-cd |
| cir.pureblood | 6 | — | 6 | 5 | 14 | 17 | — | — | 4 | 10 | U-cd |
| cir.lord-of-the-feast | 6 | — | 7 | 6 | 12 | 16 | — | — | — | — | U-cd |
| cir.ravager | 6 | — | 7 | — | 13 | 15 | — | — | — | — | U-cd (no ranged weapon, so RAT is empty) |

- Tanith's ARC 6 is the most fury she can hold; she starts the game with 6 and refills by leeching fury off her
  warbeasts in the Control Phase (rulebook p104). The Pureblood can be forced up to 4 fury per turn; with fury left on it
  in the Control Phase it rolls 2d6 + its fury against THR 10 and frenzies on a higher total (p107).
- Keywords: Tanith is Circle, Blackclad, Devourer's Host; the Pureblood is Circle, Devourer's Host (also Secret Dominion);
  the Lord and the Ravagers are Circle, Devourer's Host. All are living models (they leave corpses and souls).

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| cir.tanith | Dual Attack, Pathfinder | **Dark Power**: arcane attack rolls and arcane damage rolls get an extra die, then drop the lowest. **Field Marshal [Prowl]**: warbeasts in her battlegroup have Prowl. **Prowl**: Stealth while she has concealment. **Vital Magic**: when something would end her upkeep spells, she may keep each one by taking d3 damage for it | U-cd |
| cir.pureblood | Dual Attack, Headbutt, Slam, Trample, Pathfinder | **Controlled Warping**: at the start of its activation it picks one warp effect for one round: *Ghostly* (moves through terrain, obstacles, obstructions and models it can clear completely, no penalty), *Spell Ward* (spells can't target it) or *Warp Strength* (+2 melee damage). A frenzied Pureblood must pick Warp Strength. **Regeneration [d3]**: once per activation it can be forced to heal d3; not in an activation it runs. Animus **Wraithbane** | U-cd |
| cir.lord-of-the-feast | Advance Deployment, Pathfinder, Stealth, Dual Attack | **Body Snatcher: Heart Eater**: when it destroys a living or undead enemy with a melee attack it takes that model's corpse token (max 3). Tokens buy: **Blood Rage** (one extra melee attack per token in its Combat Action), **Meat for the Beast** (boost one attack or damage roll per token in its Combat Action), **Death Feast** (heal d3 per token in its activation). **Death-Powered**: +1 ARM and +1 melee damage for each corpse token it holds | U-cd |
| cir.ravagers | Pathfinder, Tough | **Body Snatcher: Heart Eater** with **Blood Rage** and **Meat for the Beast** (as above; per trooper). **Rapid Healing**: right after an enemy attack damages it, it heals d3. **Treewalker**: forests don't block its LOS; completely inside a forest it gets +2 DEF against melee attacks | U-cd |

## Ability → descriptor / code hook map

Ops and fields from `hooks.ts` (00 §14) and `20-data-schema.md` §5. `[A1:n]` = the "after the attack is resolved" tier
(R7.18 step 16). Rows marked **new** need an engine addition (see "New mechanics needed").

| Ability | Hook point | Descriptor (or code hook) | Test |
|---|---|---|---|
| Dark Power | `attack.beforeRoll` / `damage.beforeRoll` | when `{test:'attackKind', value:'arcane'}`: `{op:'addDie', roll:'attack'}` + `{op:'discardLowest', roll:'attack'}`; same for damage | FAC-CIR-001 |
| Field Marshal [Prowl] | passive | scope `warEngines` (battlegroup); `{op:'grantAbility', ability:'cir.a.prowl'}` | FAC-CIR-002 |
| Prowl | passive | when `{test:'concealed'}`; `{op:'grantAbility', ability:'stealth'}` (same as Cygnar) | LOS-016 |
| Vital Magic | `control.upkeep` + expiry | **new** code `hook.vitalMagic` (on a forced upkeep expiry, offer keep-for-d3-damage per spell) | FAC-CIR-003 |
| Controlled Warping | `activation.start` | **new** code `hook.controlledWarping` (`abilityChoice` of three warp abilities, duration round; frenzied → Warp Strength) | FAC-CIR-004 |
| •Ghostly | passive | **new** movement flag: pass through obstructions and models when the move clears them; terrain costs nothing | MOVE-0xx |
| •Spell Ward | passive | `{op:'forbid', what:'beTargeted'}` filtered to spells (needs a `byWhat: 'spell'` param, **new**) | FAC-CIR-005 |
| •Warp Strength | passive | `{op:'modRoll', roll:'damage', value:2}` when `attackKind melee` | FAC-CIR-006 |
| Regeneration [d3] | `activation.start`..`activation.end` | **new** code `hook.regeneration` (special action: force 1 fury, `{op:'heal', value:'d3'}`, once per activation, not if it ran) | FAC-CIR-007 |
| Body Snatcher: Heart Eater | `death.destroyed` | **new** corpse tokens: `{code:'claimToken', params:{kind:'corpse', cap:3, via:'melee'}}` | FAC-CIR-008 |
| Blood Rage | `combat.chooseAttack` | **new** code `hook.spendToken` → `{op:'addAttack', value:1}` per corpse | FAC-CIR-009 |
| Meat for the Beast | `attack.beforeRoll` / `damage.beforeRoll` | **new** code `hook.spendToken` → `{op:'boost'}` per corpse | FAC-CIR-010 |
| Death Feast | any time in activation | **new** code `hook.spendToken` → `{op:'heal', value:'d3'}` per corpse | FAC-CIR-011 |
| Death-Powered | passive | **new** code `hook.perToken` (`modStat ARM +n`, `modRoll damage +n` melee, n = corpse tokens) | FAC-CIR-012 |
| Rapid Healing | `attack.resolved` [A1:12] | when `{all:[damaged, isEnemy attacker]}`; `{op:'heal', value:'d3'}` | FAC-CIR-013 |
| Treewalker | passive | `{op:'ignore', ignore:'forest'}` (**new** ignore value) + `{op:'modStat', stat:'DEF', value:2}` vs melee when completely in forest | LOS-0xx |
| Tough | `death.disabled` | core `core.a.tough` (exists) | DMG-0xx |
| AT From Beneath | `attack.declared` | `{op:'ignore', ignore:'cover'}`, `{op:'ignore', ignore:'concealment'}` | FAC-CIR-014 |
| AT Critical Consume | `attack.crit` | when target small-based and not a Leader: `{op:'removeFromPlay'}` | FAC-CIR-015 |
| AT Shadow Bind | `attack.hit` | **new** condition `shadowBind` (−3 DEF, can't advance, one round, shakeable): `{op:'applyCondition', condition:'shadowBind'}` | COND-0xx |
| AT Brutal Charge | `damage.beforeRoll` | when charge attack: `{op:'modRoll', roll:'damage', value:2}` | FAC-CIR-016 |
| AT Blood Reaper | `combat.chooseAttack` | **new** code `hook.bloodReaper` (initial attack becomes one simultaneous attack on every model in LOS and melee range) | FAC-CIR-017 |
| AT Grievous Wounds | `attack.hit` | direct hit: `{op:'removeAbility', ability:'core.a.tough'}` and **new** `{op:'forbid', what:'heal'}` for one round | FAC-CIR-018 |
| AT Shifter | `attack.resolved` [A1:11] | when hit enemy: `{op:'place', dist:0}` B2B with the target (**new** placement mode `b2bWithTarget`) | FAC-CIR-019 |
| Feat Rites of the Wurm | `feat.used` | **new** code `hook.ritesOfTheWurm` (one turn: Tanith channels through battlegroup warbeasts in CTRL; spells and animi cast by her or them in CTRL cost 1 less, hers never below 1) | FAC-CIR-020 |

## Weapons

`AT` = the weapon's Attack Type options; here every listed ability is always on (none of these weapons has a pick-one AT).

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cir.tanith | Jaws of the Earth | 1 | ranged | RAT 6 | 10 | 1 | 2 | 13 / blast 7 | — | Magical damage | From Beneath (ignores cover and concealment). Critical Consume (crit on a small-based non-Leader: removed from play) | U-cd |
| cir.tanith | Staff of Fate | 1 | melee | MAT 6 | 2 | — | — | 11 | — | Magical damage | Shadow Bind (hit: −3 DEF and no advancing for one round; can be shaken) | U-cd |
| cir.pureblood | Death Howler | 1 | ranged | RAT 5 | SP 8 | 1 | — | 14 | H | Magical damage, Pistol | — | U-cd; loc U-guess (mouth) |
| cir.pureblood | Claw | 2 | melee | MAT 6 | 1 | — | — | 14 | L, R | Throw PA | — | U-cd; locs U-guess |
| cir.lord-of-the-feast | Raven | 1 | ranged | RAT 6 | 8 | 1 | — | — (no damage roll) | — | — | Shifter (hit: the Lord is placed base to base with the model hit) | U-cd |
| cir.lord-of-the-feast | Wurmblade | 1 | melee | MAT 7 | 1 | — | — | 13 | — | Magical damage | Blood Reaper (its initial attack hits at every model in LOS within its melee range, all at once). Grievous Wounds (direct hit: target loses Tough and can't heal for one round) | U-cd |
| cir.ravager | Tharn Axe | 1 | melee | MAT 7 | 2 | — | — | 15 | — | — | Brutal Charge (+2 on charge damage rolls) | U-cd |

Melee RNG 1 = 1", RNG 2 = 2" reach (MK4). The Pureblood's power attacks use POW 14 (large base, engine rule).

## Pureblood life spiral (heavy warbeast, 28 boxes)

The community data gives the box count per branch only: **5 / 3 / 5 / 3 / 7 / 5** (U-cd). It does not say which boxes
belong to which aspect, and MK4 lets one branch hold boxes of more than one aspect (rulebook p96). Until the app check we
assign whole branches to aspects (**ASSUMED**, U-guess; see RULING):

| Branch | Boxes (outermost → innermost) | Aspect |
|---|---|---|
| 1 | M M M M M | Mind |
| 2 | M M M | Mind |
| 3 | B B B B B | Body |
| 4 | B B B | Body |
| 5 | S S S S S S S | Spirit |
| 6 | S S S S S | Spirit |

Mind 8, Body 8, Spirit 12. Damage: roll a d6 for the branch, mark from its outermost unmarked box inward, then spill into
the next branch clockwise (1 → 2 → … → 6 → 1) (p96). Crippled when every box of an aspect is marked: **Body** one fewer
damage die; **Mind** one fewer attack die and no chain, power or special attacks; **Spirit** can't be forced (p96).
Healing anywhere un-cripples.

## Spells and animus

Tanith's spells (COST is paid in fury). DUR: `UP` upkeep, `RND` one round, `TURN` one turn.

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Admonition | 2 | 6 | — | — | UP | no | Cast on a model in her battlegroup. The first time an enemy ends a move or is placed within 6" of it, it may advance up to 3" at once; then the spell ends | U-cd; OFF U-guess |
| Affliction | 2 | 8 | — | — | UP | yes | Enemy model or unit: −2 DEF, and a direct-hit damage roll that fails to beat its ARM still deals 1 damage | U-cd; OFF U-guess |
| Rift | 3 | 10 | 3 (area only) | 13 | RND (the area) | yes | Magical attack at one model; on a direct hit a 3" area centred on it becomes rough terrain for one round (no blast damage to others) | U-cd; area 3" U-cd; OFF U-guess |
| Scything Touch | 2 | 6 | — | — | UP | no | Friendly Faction model gains Dark Shroud: enemies within 2" of it get −2 ARM | U-cd; OFF U-guess |
| Veil of Mists | 2 | CTRL | 3 | — | UP | no | A 3" cloud anywhere completely in her CTRL; friendly Faction models see through it, and inside it gain Pathfinder and can pass through obstructions and models they can clear | U-cd; AOE 3, OFF U-guess |
| Wraithbane (Pureblood animus) | 2 | 6 | — | — | TURN | no | Friendly Faction model's weapons gain Blessed and deal magical damage for one turn | U-cd; OFF U-guess |

The Pureblood can be forced to cast Wraithbane (it gains fury equal to the COST, never above FURY 4), or Tanith can cast it
as her own spell while the Pureblood is in her CTRL. A model holds one friendly animus at a time (rulebook p109).

## Feat (Tanith): Rites of the Wurm (U-cd)

Lasts one turn:
- Tanith can channel spells through any warbeast in her battlegroup that is in her CTRL.
- Spells cast by Tanith, and animi cast by those warbeasts while in her CTRL, cost 1 less; Tanith's own spells never drop
  below COST 1.

## Ids, palette and marking

- Ids: models `cir.tanith`, `cir.pureblood`, `cir.lord-of-the-feast`, `cir.ravagers` (unit) with trooper `cir.ravager`;
  weapons `cir.w.jaws-of-the-earth`, `cir.w.staff-of-fate`, `cir.w.death-howler`, `cir.w.claw`, `cir.w.raven`,
  `cir.w.wurmblade`, `cir.w.tharn-axe`; abilities `cir.a.<kebab name>` (e.g. `cir.a.controlled-warping`,
  `cir.a.body-snatcher`); spells `cir.s.admonition`, `cir.s.affliction`, `cir.s.rift`, `cir.s.scything-touch`,
  `cir.s.veil-of-mists`, `cir.s.wraithbane`; feat `cir.f.rites-of-the-wurm`; list `cir.l.starter-recon`. Engine file key
  `circle` (`src/engine/factions/circle.ts`).
- Faction keywords: `circle`, `devourers-host`, `blackclad`, `tharn`.
- Palette (moss, tanned leather, bronze, loam): `primary #4b6b3c`, `secondary #8a5a32`, `metal #a3874f`,
  `base #4a3d2c`, `ui #6fa35a`. `sourceHues: [110, 25]` (the stock sculpts' green cloth and brown leather/skin bands that the
  army painter remaps).
- Marking (original, for the army painter): **thornknot** — a ring of three interlaced thorn stems.
- shipName: Tanith, Pureblood, Feast Lord, Ravagers (troopers "Ravager 1–3").

## New mechanics needed

Per STATUS.md the engine runs warcasters, focus, warjack grids and the Cygnar/Khador hooks only.

| Mechanic | Used by | Implementation sketch |
|---|---|---|
| Fury economy (Fury Manipulation, leech, force, threshold, frenzy, wild) | Tanith, Pureblood | Owned by `81-warlocks-fury.md`: a `fury` field beside `focus`, a Control-Phase leech/upkeep/threshold step, `force` as the warbeast's spend action. |
| Life spiral damage track with aspects | Pureblood | Additive `DamageState` variant `{track:'spiral', branches: boolean[][], aspects}`; d6 branch, outer→inner fill, clockwise spill; cripple effects Mind/Body/Spirit as data in `core/systems.json`. |
| Animus (warbeast spell, castable by the warlock in CTRL) | Pureblood (Wraithbane) | A spell ref on the warbeast; `spell.cast` accepts caster = beast (pays fury onto itself) or warlock (pays from her pool); one friendly animus per model. |
| Corpse tokens (claim, cap, spend) | Lord, Ravagers | `ModelState.tokens: {corpse:n}`; claim on `death.destroyed` by the nearest eligible model; `spendToken` code hook drives Blood Rage, Meat for the Beast, Death Feast; Death-Powered reads the count. |
| Controlled Warping (pick a warp ability each activation) | Pureblood | `abilityChoice` decision at `activation.start` granting one of three abilities for a round; frenzy forces the pick. |
| Ghostly movement | Pureblood (warp), Veil of Mists | Movement option that skips obstruction and model collision when the path ends clear; terrain costs nothing. |
| Spell Ward (untargetable by spells) | Pureblood (warp) | `forbid beTargeted` with a spell filter. |
| Regeneration [d3] (forced heal) | Pureblood | Special action costing 1 fury: heal d3, once per activation, not after a run. |
| Rapid Healing | Ravagers | `attack.resolved` heal d3 when an enemy attack damaged it. |
| Grievous Wounds (no Tough, no healing) | Lord | Effect that removes Tough and sets a `noHeal` flag for one round. |
| Shadow Bind condition | Tanith | New stored condition: −3 DEF, no advancing, one round, shakeable (Control-Phase shake already exists). |
| Blood Reaper (attack everything in reach) | Lord | Code hook expanding one initial attack into simultaneous attacks on every model in LOS and melee range. |
| Shifter (place B2B after a hit; no-damage ranged weapon) | Lord | Weapon with no POW skips the damage roll; `place` mode `b2bWithTarget` after resolution. |
| Critical Consume | Tanith | `attack.crit` → RFP when the target is small-based and not a Leader. |
| Dark Power (arcane-only extra die) | Tanith | `addDie` + `discardLowest` gated on `attackKind arcane` (attack and damage). |
| Vital Magic (keep upkeeps for d3 each) | Tanith | Hook on forced upkeep expiry offering keep-for-d3 per spell. |
| Channeling through warbeasts + spell cost reduction | Tanith feat | Treat battlegroup beasts in CTRL as channelers (like an arc node) and apply a `spellCost −1` modifier with a floor of 1 for her. |
| Treewalker | Ravagers | `ignore: forest` for LOS plus +2 DEF vs melee when completely inside a forest. |
| Dynamic terrain from a spell (Rift) | Tanith | Place a temporary 3" rough-terrain area for one round, removed at `round.end`. |
| Friendly-transparent cloud with movement rider (Veil of Mists) | Tanith | Cloud with `blocksLos` false for friendly Faction models and a zone that grants Pathfinder and Ghostly-style movement. |
| Reactive advance on enemy movement (Admonition) | Tanith | Trigger at `movement.end`/`movement.place` of an enemy within 6": optional 3" advance, then expire. |
| Affliction's 1-damage floor | Tanith | `damage.rolled` rule: a failed direct-hit roll still deals 1 to the affected model. |
| Dark Shroud aura (−2 ARM within 2") | Scything Touch | Aura `modStat ARM −2` on enemies within 2" of the affected model. |
| Blessed via Wraithbane | Pureblood animus | Grant `core.q.blessed` and damage type magical to the target's weapons for a turn. |

Engine contract additions these imply (none made here; each needs a 00 §14 entry when built): `DamageState` spiral track,
`ModelState.fury` and `ModelState.tokens`, `ConditionId` `shadowBind`, `ignore` value `forest`, place mode
`b2bWithTarget`.

## Data notes
- Bases: Pureblood 50 mm and Tharn Ravagers 40 mm are printed on the official product photo labels (PIP 72057, PIP 72066);
  Tanith and the Lord are human-sized, so 30 mm until the app check.
- Reference photos (local only, not in the repo): `C:/Users/antho/Hunyuan3D-2/refs/wm/circle/refs.json`. No official
  Tanith photo was found within the fetch budget.
- The Ravagers' unit size and per-trooper boxes are not in the community data (it stores the unit profile only).

## Needs rules check

- RULING: starter box | No MK4 30-pt Circle starter found; used the official Circle Orboros Battlegroup Starter (Tanith, Pureblood, Gorax, Wild Argus) trimmed to Tanith + Pureblood, plus Lord of the Feast and 3 Tharn Ravagers (29 pts, all Devourer's Host) | closest official box whose models are all MK4-legal in one army; the shape needs a solo and a unit the box lacks
- RULING: army | Devourer's Host | Tanith is Devourer's Host only in the community data; the Pureblood, Lord and Ravagers are all in it
- RULING: Tharn Ravagers unit size | 3 troopers for 9 pts | the community data has no size; the faction shape asks for a 3-model unit
- RULING: Ravager trooper boxes | 8 each | the White Mane solo has the same stat line and weapon and 8 boxes; open app check
- RULING: Pureblood spiral aspects | branches 1–2 Mind, 3–4 Body, 5–6 Spirit, whole branches | the data gives box counts only; whole-branch aspects are simplest and keep each aspect crippleable
- RULING: Tanith and Lord of the Feast bases | 30 mm | human-sized models get small bases (rulebook p71); no label found
- RULING: Pureblood weapon locations | Death Howler H, Claws L and R | warbeasts have no grid systems; locations only matter for figure sockets
- RULING: Raven weapon | ranged attack with no damage roll; Shifter places the Lord B2B on a hit | the card lists no POW
- RULING: Rift | POW 13 on the model hit only; on a direct hit a 3" rough-terrain area is centred on it for one round; no blast damage | the data gives one POW and a 3" area with "*" duration; MK4 AOE blasts need a second POW, which it lacks
- RULING: Veil of Mists | 3" cloud (cloud effects are 3" areas in MK4, p98) | matches the rulebook's cloud size
- RULING: spell OFF flags | Affliction and Rift offensive, the rest not | the data has no OFF field; enemy-targeting spells are offensive
- RULING: Field Marshal [Prowl] | grants Prowl to warbeasts in Tanith's battlegroup | the MK4 rulebook calls warjacks and warbeasts Cohort models (ch. 2, Model types)
- RULING: Regeneration [d3] | costs 1 fury (a force) and is a once-per-activation heal | the data says "can be forced"
- RULING: Rites of the Wurm | one turn; cost floor of 1 applies only to Tanith's spells | as the data words it
- RULING: corpse tokens | Lord and each Ravager claim only from their own melee kills (Body Snatcher), nearest eligible model claims, cap 3 | rulebook p97 plus the ability text
- RULING: Controlled Warping pick | The player is asked at activation.start (abilityChoice: strength, ghostly, spellWard) and the pick lasts the round; a frenzied beast takes Strength with no question; before the pick there is no warp | the card text says "pick one", so a silent default would take the choice away
- RULING: Meat for the Beast auto-spend | The window is mandatory (no prompt), so the attack-roll boost is spent only while holding the cap of 3 tokens (a full pile is otherwise wasted) and the damage-roll boost on any direct-hit damage roll when a token is held; an attack with no damage roll (Raven) spends nothing | keeps a token from being lost to the cap without asking every roll
- RULING: Death Feast auto-spend | At activation.start every corpse token is spent, one d3 heal each, while the model still has damage marked and is not under Grievous Wounds; it never spends a token on a full model | a token is only worth spending when there is damage to heal, and one more prompt per token is not worth it
- RULING: Vital Magic auto-keep | When a forced expiry (Banishing Ward) would end Tanith's upkeep, she keeps it for d3 damage automatically, only while she has more than 6 boxes left | the expiry window is mandatory in our engine, and the 6-box floor stops it from boxing her
- RULING: Rapid Healing trigger | It heals d3 only when the enemy attack actually dealt damage to this model (logged in the attack's flags.damagedIds); a hit that deals 0, or damage already marked from earlier, does not heal | the card says an attack that damages the model
- RULING: Admonition target | Warbeasts of her battlegroup only (scope warbeasts: controlled by her, not wild); the Lord of the Feast is a solo and is not a legal target | the spec says battlegroup
- RULING: Affliction cast | An offensive spell with no POW: the cast is an attack roll that rolls no damage; a hit puts the upkeep effect (-2 DEF, the 1-damage floor) on the model hit, filed as an enemy upkeep of the caster | the spec marks it OFF yes; the card lists no POW
- RULING: Raven damage | A weapon with no POW never rolls damage, so riders that read a damage roll (Meat for the Beast, the Affliction floor) do not fire | the card lists no POW
