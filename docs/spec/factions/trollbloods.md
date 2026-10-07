# Faction: Trollbloods (United Kriels, Gunnbjorn's gun line) — Recon starter

- **Sources:** the MK4 rulebook (abridged digital, `docs/sources/`, ch. 4 pp96–97 life spirals and crippled
  aspects, ch. 7 pp104–105 warlocks and fury, ch. 8 pp106–107 warbeasts, ch. 9 pp108–110 animi) for the
  general rules; community MK4 card data (`isorna/wardice-warmachine-data`, `trollbloods.united-kriels`
  profiles, fetched 2026-10-06) for every model value. The app version of the community data is unknown.
  Privateer Press product photos (PIP 71045, 71058, 71087, 71096; retailer copies) for base sizes and
  sculpts only.
- **No Quick Start or MK4 starter covers this faction.** Nothing here is printed in an official MK4 source;
  every model value stays community data until the **open app check** (record the app version, confirm
  every value).
- **Confidence key** (QS beats community data on any conflict):
  - `verified (QS pN)`: printed in the Quick Start on page N (or read from its diagram); data entry may use it;
  - `V-cd`: community data and handoff G agree, not contradicted by the QS;
  - `U-cd`: community data only;
  - `U-guess`: no source; data entry must not trust it.
- All prose is ours. Names are real (Mallet posture). UI names come from `shipName`.
- This is a Hordes faction: a **warlock** runs a battlegroup of **warbeasts** on **fury**, not focus. The
  fury rules are specified in `81-warlocks-fury.md` (written in parallel); this file only states the
  per-model numbers in plain terms. The Quick Start key's `verified` tier is empty here.

## Chosen box and why

SFG sells **no MK4 Trollbloods starter**: the MK4 Command Starters and battlegroup box for the trollkin
went to the Southern Kriels (Foulblood's Armada, Kithguard, Brineblood Marauders), and the classic
Trollbloods live on as the United Kriels and Storm of the North armies built from older kits. The closest
official box is the **Trollbloods Army Box (2017, Privateer Press)**: Captain Gunnbjorn, Dire Troll
Mauler, Dire Troll Bomber, Dozer & Smigg, Trollkin Highwaymen (10), Krielstone Bearer & Stone Scribes and
Braylen Wanderheart. Every model in it is in the MK4 **United Kriels** army, so one army covers the list.

Trimmed to the Cygnar/Khador shape (leader 0, one heavy war-engine, one solo, one 3-model unit):
Gunnbjorn (0) + **Dire Troll Bomber** (17) + **Braylen Wanderheart** (4) + **Trollkin Highwaymen ×3** (7)
= **28 points** (≤30, and ≥26 as `validate-data` requires). Braylen's Leadership names the Highwaymen
(like Falk and the Black 13th), and the Bomber's gun suits Gunnbjorn's ranged spells and feat.

## Roster (28 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| trl.gunnbjorn | Captain Gunnbjorn | Gunnbjorn | Leader (warlock) | 0 | 40 | 17 | pts, boxes U-cd; base U-guess (product label PIP 71045 reads 40 mm, not an MK4 source) |
| trl.bomber | Dire Troll Bomber | Bomber | Heavy war-engine (warbeast) | 17 | 50 | spiral 30 | pts, boxes U-cd; base U-guess (label PIP 71058: 50 mm) |
| trl.braylen | Braylen Wanderheart, Trollkin Outlaw | Braylen | Solo, character | 4 | 40 | 8 | pts, boxes U-cd; base U-guess (label PIP 71087: 40 mm) |
| trl.highwaymen | Trollkin Highwaymen | Highwaymen | Unit, 3 grunts (`trl.highwaymen-grunt`) | 7 | 40 | 1 each (Tough) | pts U-cd; size 3 U-guess (see RULING); boxes U-cd (no health field = 1 box); base U-guess (label PIP 71096: 40 mm) |

Field allowance (U-cd): Gunnbjorn C, Bomber 4, Braylen C, Highwaymen 2.
Keywords (U-cd): all are Trollblood and United Kriels; Gunnbjorn, Braylen are Trollkin (Gunnbjorn also
Scout); the Bomber is a Heavy Warbeast (also Storm of the North). The Highwaymen entry lists no Trollkin
keyword in the data (ASSUMED Trollkin; open app check).

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | FURY | THR | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|
| trl.gunnbjorn | 6 | — | 6 | 7 | 15 | 16 | 6 | 12 | — | — | U-cd (no AAT in the data: he has no offensive spell) |
| trl.bomber | 5 | — | 6 | 5 | 12 | 18 | — | — | 4 | 8 | U-cd |
| trl.braylen | 6 | — | — | 7 | 14 | 15 | — | — | — | — | U-cd (no melee weapon, so no MAT) |
| trl.highwaymen-grunt | 6 | — | — | 6 | 12 | 14 | — | — | — | — | U-cd (no melee weapon, so no MAT) |

Fury in plain terms (rulebook pp104–107; details belong to `81-warlocks-fury.md`):
- **Gunnbjorn (ARC 6):** starts the game with 6 fury and never leeches above 6. In his Control Phase he
  takes fury off the Bomber (if it is inside his CTRL 12) and can draw more from his own body at 1 damage
  per point. He spends fury to cast spells, boost, buy extra melee attacks, heal himself or the Bomber,
  shake effects, and pay 1 to move a hit onto the Bomber (transfer). Warlocks have no Power Field.
- **Bomber (FURY 4, THR 8):** gains fury when forced (run, charge, power attack, boost, extra attack,
  Forced Reload, Regeneration, its animus, rile, shake). It can never hold more than 4. After leeching, a
  Bomber still holding fury rolls 2d6 + fury; above 8 it frenzies (charges the nearest model in LOS).
- **Animus (Bomber): Far Strike** — Gunnbjorn may cast it as his own spell while the Bomber is in his CTRL,
  or the Bomber can be forced to cast it (it gains fury equal to the COST).

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| trl.gunnbjorn | Tough | **Field Marshal [Run & Gun]**: warbeasts in his battlegroup gain Run & Gun. **Resourceful**: he keeps upkeep spells running on his battlegroup for free | U-cd |
| trl.bomber | Dual Attack, Headbutt, Slam, Trample | **Regeneration [d3]**: once per activation, force it to heal d3; not in an activation it ran. **Snacking**: when it boxes a living model with a melee attack, it may remove that model from play to heal d3 | U-cd |
| trl.braylen | Advance Deployment, Ambush, Pathfinder, Tough | **Dodge**: after an enemy attack misses her, she may advance up to 2". **Leadership [Trollkin Highwaymen]**: Highwaymen within 10" gain Dodge. **Prowl**. **Run & Gun** | U-cd |
| trl.highwaymen | Advance Deployment, Ambush, Pathfinder, Tough | **Prowl**; **Swift Hunter**: after a basic ranged attack destroys an enemy, the model may advance up to 2" | U-cd |

## Ability → descriptor / code hook map

Ops and fields from `hooks.ts` (00 §14). `[A1:n]` = the "after the attack is resolved" tier (R7.18 step 16).
Fury ops (`gainFury`, `force`) are **not in `hooks.ts` yet**; they wait for `81-warlocks-fury.md`.

| Ability | Hook point | Descriptor (or code hook) | Test |
|---|---|---|---|
| Field Marshal [Run & Gun] | passive | scope `warEngines` (battlegroup); `{op:'grantAbility', ability:'run-and-gun'}` (reuse cyg `hook.runAndGun`) | FAC-TRL-001 |
| Resourceful | `phase.maintenance` (upkeep step) | code `hook.resourceful` (upkeep cost 0 for spells on battlegroup models) | FAC-TRL-002 |
| Regeneration [d3] | `activation.any` | code `hook.regeneration` (special: force for 1 fury, `{op:'heal', value:'d3'}`; once per activation; forbidden after run) | FAC-TRL-003 |
| Snacking | `death.boxed` | when `{all:[attackKind melee, {test:'living'}]}`; optional `{op:'removeFromPlay'}` then `{op:'heal', value:'d3'}` on self | FAC-TRL-004 |
| Dodge | `attack.resolved` [A1:12] | when `{all:[{not:hit}, isEnemy attacker]}`; `{op:'advance', dist:2, direction:'any'}`; optional | FAC-TRL-005 |
| Leadership [Trollkin Highwaymen] | passive | scope friendly `trl.highwaymen` within 10; `{op:'grantAbility', ability:'trl.a.dodge'}` | FAC-TRL-006 |
| Prowl | passive | reuse `core.a.prowl` | LOS-016 |
| Run & Gun | `activation.end` | reuse code `hook.runAndGun` | FAC-CYG-005 |
| Swift Hunter | `attack.resolved` [A1:11] | when `{all:[basic, attackKind ranged, {code:'destroyedEnemyThisAttack'}]}`; `{op:'advance', dist:2, direction:'any'}`; optional (shared with kha Razor) | FAC-TRL-007 |
| Critical Devastation | `attack.crit` | code `hook.criticalDevastation` (roll d6 once; throw every model hit directly away from the attacker, farthest first; non-direct-hit models take a POW 8 damage roll instead of blast damage; collateral POW 8) | FAC-TRL-008 |
| Forced Reload [1] | `combat.chooseAttack` | like `Reload [1]` but paid by forcing (1 fury on the Bomber) instead of focus | FAC-TRL-009 |
| Both Barrels (★Attack) | `combat.choose` | reuse cyg Both Barrels (`modRoll damage +4`, no more attacks with that weapon) | ATK-009 |
| Luck | `attack.rolled` | code `hook.luck` (raise a `reroll` decision on a miss; once per attack roll) | FAC-TRL-010 |
| Throw (quality, Claw) | — | engine core throw power attack | PWR-0xx |
| Feat Fortification | `feat.used` | scope friendly faction in CTRL; `{code:'grantCover'}`, `{op:'grantResistance', damageType:'blast'}`, `{op:'forbid', what:'knockDown'}`; duration round | FAC-TRL-011 |

## Weapons

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| trl.gunnbjorn | Bazooka | 1 | ranged | RAT 7 | 12 | 1 | 2 | 14 (blast 8) | — | Magical damage | Critical Devastation (above) | U-cd |
| trl.gunnbjorn | Axe | 1 | melee | MAT 6 | 1 | — | — | 11 | — | — | — | U-cd |
| trl.bomber | Powder Bomb | 1 | ranged | RAT 5 | 8 | 1 | 3 | 16 (blast 8) | H | — | Forced Reload [1]: force once to make one more shot with it | U-cd; loc U-guess (warbeasts have no locations; use `-`, see Data notes) |
| trl.bomber | Claw | 2 | melee | MAT 6 | 1 | — | — | 15 | — | Throw PA | — | U-cd |
| trl.braylen | Heavy Pistol | 2 | ranged | RAT 7 | 8 | 1 | — | 12 | — | Pistol | Both Barrels (★Attack); Luck (reroll missed attack rolls once each) | U-cd |
| trl.highwaymen-grunt | Pistol | 2 | ranged | RAT 6 | 8 | 1 | — | 10 | — | Pistol | Both Barrels (★Attack) | U-cd |

Use `location: '-'` on every warbeast weapon: a spiral has no L/R systems; crippled aspects act on all
weapons (Body: −1 damage die; Mind: −1 attack die and no chain, power or special attacks).

## Bomber life spiral (heavy, 30 boxes)

Branch sizes 6 / 3 / 7 / 5 / 6 / 3 are **U-cd** (community `health.grid.columns`, layout `spiral`). The data
does not say which boxes belong to which aspect. **ASSUMED** (U-guess, open app check): each aspect owns two
neighbouring branches, as on the older cards — **Mind = branches 1–2 (9 boxes), Body = 3–4 (12),
Spirit = 5–6 (9)**. Every box is an aspect box.

| Branch | Boxes (outer → inner) | Aspect |
|---|---|---|
| 1 | M M M M M M | Mind |
| 2 | M M M | Mind |
| 3 | B B B B B B B | Body |
| 4 | B B B B B | Body |
| 5 | S S S S S S | Spirit |
| 6 | S S S | Spirit |

Recording (rulebook p96): roll d6 for the branch; mark from the outermost unmarked box inward; when the
branch is full continue in the next branch clockwise (6 wraps to 1). An aspect is crippled while all its
boxes are marked, and recovers when any of them is healed. Crippled **Body**: one fewer damage die.
Crippled **Mind**: one fewer attack die, no chain, power or special attacks. Crippled **Spirit**: can't be
forced (so no run, charge, power attack, Regeneration or Forced Reload).

Proposed data shape (additive, for `20-data-schema` §4): `{track:'spiral', branches:[6 strings]}`, each
string outer box first, letters `M B S` (or `-` for a box with no aspect, if the app shows some).

## Spells (Gunnbjorn) and animus (Bomber)

All four spells and the animus are community data; **open app check** for the current list and every stat.

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Guided Fire | 3 | SELF | CTRL | — | TURN | no | This turn, models in Gunnbjorn's battlegroup inside his CTRL roll an extra die on ranged attack rolls (boosted) | U-cd |
| Rock Wall | 2 | CTRL | — | — | UP | no | Put a straight wall piece fully inside his CTRL, clear of bases and terrain; it is an obstacle giving cover; an 80 mm or 120 mm base touching it removes it | U-cd; DUR UP looks odd (older cards: TURN) and wall size U-guess (4" × 1") |
| Sentry | 2 | 6 | — | — | UP | no | A friendly Faction model gets Rapid Fire: one basic ranged attack in your Maintenance Phase | U-cd |
| Snipe | 2 | 6 | — | — | UP | no | A friendly Faction model's or unit's ranged weapons reach 3" further | U-cd |
| Far Strike (animus) | 1 | SELF | — | — | TURN | no | The caster's ranged weapons reach 3" further this turn | U-cd |

## Feat (Gunnbjorn): Fortification (U-cd)

Lasts one round: friendly Faction models inside Gunnbjorn's CTRL count as in cover (+4 DEF against ranged
and arcane attacks, R6), gain Resistance: Blast, and can't be knocked down.

## Id scheme

Faction id `trl` (engine file key `trollbloods`: `src/engine/factions/trollbloods.ts`). Models
`trl.gunnbjorn`, `trl.bomber`, `trl.braylen`, `trl.highwaymen` (unit) with grunt profile
`trl.highwaymen-grunt`. Weapons `trl.w.bazooka`, `trl.w.axe`, `trl.w.powder-bomb`, `trl.w.claw`,
`trl.w.heavy-pistol`, `trl.w.pistol`. Abilities `trl.a.field-marshal-run-and-gun`, `trl.a.resourceful`,
`trl.a.regeneration`, `trl.a.snacking`, `trl.a.dodge`, `trl.a.leadership-highwaymen`,
`trl.a.critical-devastation`, `trl.a.forced-reload`, `trl.a.luck`, `trl.a.swift-hunter` (or promote to
`core.a.swift-hunter` together with Khador). Spells `trl.s.guided-fire`, `trl.s.rock-wall`, `trl.s.sentry`,
`trl.s.snipe`, `trl.s.far-strike` (animus). Feat `trl.f.fortification`. List `trl.l.army-recon`
(entries: Bomber; Braylen `advanceDeploy`; Highwaymen size 3 `advanceDeploy`).

## Palette and marking

| Key | Hex | Why |
|---|---|---|
| primary | `#4f87a6` | blue-grey troll skin |
| secondary | `#3e6b4c` | green tartan kilts and sashes |
| metal | `#a8743a` | brass and copper fittings |
| base | `#6b5b3e` | peaty earth and dry grass |
| ui | `#3fa0c4` | brighter skin blue for the HUD |

`sourceHues`: `[200, 30]` (skin blue and the tan leather coats the sculpts wear). Marking: **`river-knot`**
(our own name: a three-loop knot stencil for the army painter).

## Data notes
- Bases: from the product photos' labels (40 mm trollkin, 50 mm Dire Troll); no MK4 source yet.
- Trooper and warbeast damage: Highwaymen have no health field, so 1 box each with Tough; the Bomber
  has a 30-box spiral, Gunnbjorn 17, Braylen 8.
- No model here has a melee weapon except Gunnbjorn and the Bomber; Braylen and the Highwaymen have no
  melee range (engaging rules as for Caine).
- Gunnbjorn's warlock basics apply to every warlock: Fury Manipulation, Battlegroup Controller, Leader,
  Feat, Spellcaster, Spirit Bond, Reaving, Transfer (rulebook pp104–105).

## New mechanics needed

| Mechanic | Who | Implementation sketch |
|---|---|---|
| Fury economy | Gunnbjorn, Bomber | `ModelState.fury`; Control Phase steps: leech (incl. self-leech at 1 damage each), Spirit Bond, upkeep, threshold checks; spend paths mirror focus (boost, extra attack, heal, shake); warlock fury capped at ARC. Owned by `81-warlocks-fury.md` |
| Forcing warbeasts | Bomber | a `force` cost on run, charge, power attacks, boosts, extra attacks, Forced Reload, Regeneration, animus, rile, shake: +fury on the beast, refused past FURY or outside CTRL or while Spirit is crippled |
| Threshold and frenzy | Bomber | Control Phase 2d6 + fury vs THR; on fail, an auto activation: shake, charge the nearest model in LOS, one boosted attack with the highest-POW melee weapon |
| Life spiral | Bomber | `damage.track:'spiral'` with 6 branch strings; d6 picks the branch, fill outer→inner, spill clockwise; aspects cripple as in the table above (additive to DamageState) |
| Transfer and Reaving | Gunnbjorn | `damage.beforeApply`: pay 1 fury to move the hit onto a battlegroup beast in CTRL below its FURY (overflow back, untransferable); reave fury from a beast destroyed in CTRL (not by friendly attack) |
| Animus | Bomber | a spell list on warbeasts; castable by the beast (forced, gains COST fury) or by its warlock while in CTRL; one friendly animus per model |
| Wild warbeasts | Bomber | on Gunnbjorn's death: fury lost, no forcing or animus (mirrors inert warjacks) |
| Regeneration [d3] | Bomber | special action-like "any time" option costing one force; once per activation; not after running |
| Snacking | Bomber | `death.boxed` option: RFP a living model it boxed in melee and heal d3; needs a `living` test |
| Critical Devastation | Gunnbjorn | `attack.crit` code hook: one d6 throw for every model hit, ordered farthest first; swaps blast damage for a POW-8 damage roll |
| Rock Wall | Gunnbjorn | runtime terrain: add an obstacle piece to `GameState` terrain while the upkeep lasts; removed on contact by 80/120 mm bases |
| Rapid Fire (Sentry) | Gunnbjorn | Maintenance Phase window: one basic ranged attack by the target (out-of-activation attack, like Avenging Force) |
| Range buffs | Snipe, Far Strike | `{op:'modStat', stat:'RNG', value:3}` scoped to ranged weapons |
| Granted cover (feat) | Fortification | a `grantCover` code hook read by `los.ts` cover checks for the round |
| Dodge | Braylen, Highwaymen | Evasive-like hook on any missed enemy attack, 2" advance |
| Luck | Braylen | raise the `reroll` decision (not raised by the starter content today) |
| Ambush choice | Braylen, Highwaymen | `setup.ts` says Ambush choices are not offered yet: offer "hold in reserve" at deployment and an entry at the end of later Control Phases |
| Forced Reload | Bomber | Reload-style extra shot paid in fury on the beast, not focus |

## Needs rules check

- RULING: MK4 Trollbloods starter | used the 2017 Trollbloods Army Box (Gunnbjorn), trimmed to Gunnbjorn + Dire Troll Bomber + Braylen + Highwaymen ×3 = 28 pts | SFG sells no MK4 Trollbloods starter; every model in that box is in the MK4 United Kriels army.
- RULING: heavy choice | Dire Troll Bomber (17) over Dozer & Smigg (14) or the Mauler (12) | 14+4+7 = 25 and 12+4+7 = 23 fall below the 26-point floor in `validate-data`; the Bomber's gun fits Gunnbjorn's ranged feat and spells.
- RULING: Highwaymen unit size | field 3 grunts at the listed 7 pts | the community data gives no MK4 size range or cost by size; 3 matches the Black 13th and Hounds shape. Open app check for the minimum size and its cost.
- RULING: spiral aspects | branches 1–2 Mind, 3–4 Body, 5–6 Spirit, every box an aspect box | the community data gives branch sizes only; the rulebook text allows mixed branches, so confirm against the card.
- RULING: warbeast weapon location | `-` on the Powder Bomb and Claws | spirals have no L/R/H systems; crippled aspects cover all weapons.
- RULING: base sizes | Gunnbjorn, Braylen, Highwaymen 40 mm; Bomber 50 mm | read from Privateer Press product labels; MK4 stat bars not seen.
- RULING: Rock Wall duration | keep UP as the data says, wall 4" × 1" | community data says Up and gives no size; older cards were one turn. Confirm both.
- RULING: Highwaymen keyword | treat as Trollkin | the data entry lacks the Trollkin keyword the sculpts and other trollkin units carry; it matters only for keyword-scoped rules.
- RULING: Gunnbjorn AAT | none | the data has no arcane attack stat for him and all his spells are non-offensive.
- RULING: Fortification cover | +4 DEF against ranged and arcane attacks as normal cover (R6) | the feat grants "cover" with no number; MK4 cover is +4 DEF.
