# Faction: Khador (Winter Korps, SKS-6 cadre) — Recon starter

- **Sources:** the official Quick Start guide (Jul 2025, `docs/sources/`, worked turns QS pp36–46) and
  community MK4 card data (`isorna/wardice-warmachine-data`, fetched 2026-10-04). The app version of the
  community data is unknown. **Open app check:** record the app version and confirm every non-QS value
  before data entry.
- **Confidence key** (QS beats community data on any conflict): `QS-2025` printed in the QS turns;
  `V-cd` community data and handoff G agree, not contradicted by the QS; `U-cd` community data only;
  `U-guess` no source.
- All prose is ours.

The data also has a *solo* Vilkul (18 pts) and a *solo-companion* Razor. They are not used.
Recon uses the warcaster Vilkul (0 pts) and Razor (17 pts).

## Roster (30 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| kha.vilkul | Kapitan Zahara Vilkul | Vilkul | Leader (warcaster) | 0 | 30 | 17 | V-cd (base U-guess) |
| kha.razor | Razor | Razor | Heavy war-engine, character | 17 | 50 | grid 30 | V-cd; QS-2025 columns 5 = 5 and 6 = 4 boxes |
| kha.lazarenko | Sergeant Goran Lazarenko, the Jackal | Lazarenko | Solo, character | 4 | 30 | 8 | U-cd, QS-consistent (survives 7) |
| kha.hounds | The Hounds | Hounds | Unit, 3 character troopers (Tererya, Fedyniak, Skrobala) | 9 | 30 | unknown; use 5 until the app check (the Black 13th have several) | U-guess |

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | conf |
|---|---|---|---|---|---|---|---|---|---|
| kha.vilkul | 7 | 6 | 7 | 7 | 16 | 15 | 6 | 12 | QS-2025 (AAT, RAT V-cd) |
| kha.razor | 5 | — | 6 | 6 | 11 | 19 | — | — | QS-2025 (MAT V-cd) |
| kha.lazarenko | 6 | — | 5 | 7 | 14 | **14** | — | — | QS-2025 (MAT V-cd); the community data's ARM 16 is wrong |
| kha.hounds (all) | 6 | — | 6 | 6 | 14 | 15 | — | — | SPD QS-2025; rest V-cd |

- Razor's effective ARM is 21 while his L system (Ripper Shield) works (QS p40).
- A Hound that is B2B with another Hound gets +2 ARM from Shield Wall (QS p37).

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| kha.vilkul | Dual Attack, Pathfinder, Resist Corrosion, Resist Fire, Unstoppable, Tough | **Field Marshal [Prowl]**; **Prowl**; **Rise**; **Take Down**; **Enhanced Alchemical Mask** | Pathfinder, Resist Fire QS-2025; rest U-cd |
| kha.razor | Construct, Dual Attack, Headbutt, Slam, Trample, Pathfinder, Resist Corrosion, Resist Fire | **Anchor**; **Reposition [3"]**; **Swift Hunter** | Reposition QS-2025; rest U-cd |
| kha.lazarenko | Advance Deployment, Ambush, Tough, Pathfinder, Resist Fire, Resist Corrosion, Unstoppable | **Alchemical Mask**; **Marksman**; **Prowl** | Advance Deployment, Alchemical Mask QS-2025; rest U-cd |
| kha.hounds | Advance Deployment, Dual Attack, Pathfinder, Resist Corrosion, Resist Fire, Tough | Alchemical Mask; **Girded**; Prowl; Reposition [3"]; **Shield Wall** | Girded, Shield Wall QS-2025; rest U-cd |

Unstoppable (R2) only waives the disengage forfeit. Knockdown immunity comes from Shield Wall, Anchor
and Superiority.

## Ability → descriptor / code hook map

Ops and fields from `hooks.ts` (00 §14). `[A1:n]` = the "after the attack is resolved" tier (R7.18 step 16).

| Ability | Hook point | Descriptor (or code hook) | Test |
|---|---|---|---|
| Field Marshal [Prowl] | passive | scope `warEngines` (battlegroup); `{op:'grantAbility', ability:'prowl'}` | FAC-KHA-001 |
| Prowl | passive | when `{test:'concealed'}`; `{op:'grantAbility', ability:'stealth'}` | LOS-016 |
| Rise | `maintenance.start` | when knocked down: `{op:'removeCondition', condition:'knockedDown'}` | COND-004 |
| Take Down | `attack.declared` + `death.boxed` | melee only: `{op:'forbid', what:'tough'}` on the target; at boxed `{op:'removeFromPlay'}` | DMG-005 |
| Enhanced Alchemical Mask | passive | `{op:'ignore', ignore:'gas'}`, `{op:'ignore', ignore:'clouds'}`, `{op:'ignore', ignore:'concealment'}` | FAC-KHA-002 |
| Alchemical Mask | passive | `ignore gas`, `ignore clouds` (LOS and the concealment clouds give) | TERR-009 |
| Anchor | passive | scope friendly warrior models with `{test:'b2b'}`: `{op:'forbid', what:'knockDown'}` | FAC-KHA-003 |
| Reposition [3"] | `activation.end` | `{op:'advance', dist:3, direction:'any'}`; units per trooper | MOVE-021 MOVE-026 |
| Swift Hunter | `attack.resolved` [A1:11] | when a basic ranged attack destroyed an enemy: `{op:'advance', dist:2, direction:'any'}`; optional | MOVE-024 |
| Marksman | `damage.beforeApply` | code `hook.marksmanColumn` (ranged damage to a war-engine: the attacker picks the column) | GRID-010 |
| Girded | passive | scope self + friendly `{test:'b2b'}`: `{op:'grantResistance', damageType:'blast'}` | DMG-011 AOE-005 |
| Shield Wall | passive | when B2B with a unit-mate: `{op:'modStat', stat:'ARM', value:2}`, `{op:'forbid', what:'knockDown'}` | DMG-010 |
| AT Ward Breaker | `attack.declared` | code `hook.grantQuality` (`blessed`) | FAC-KHA-004 |
| AT Eruption of Ash | `death.boxed` | direct hit only: `{op:'cloud', area:'hazard', placement:'centredOnTarget', count:1, hazard:{pow:12, damageType:'fire', on:['enter','endActivation']}}` (enemies only, one round), then `{op:'removeFromPlay'}` | DMG-007 DMG-008 |
| Reload [1] | `combat.chooseAttack` | engine core | ATK-007 |
| Arcing Fire | passive (weapon) | `{op:'ignore', ignore:'interveningModels'}` | AOE-009 |
| Targeting Flare | `combat.choose` (attack option) | `{op:'cloud', area:'flare', placement:'point', aoe:3, blocksLos:false}`, completely within 10", centre in LOS ignoring intervening models; one turn | AOE-012 |
| Momentum (Slug Cannon) | `attack.hit` | target ≤ 40 mm: `{op:'slam', dist:'d3', collateralPow:16}`; larger: `{op:'knockDown'}` (QS p45: Deuce knocked down) | FAC-KHA-005 |
| Siege Weapon | `damage.beforeRoll` | vs 120 mm or a building: `{op:'addDie', roll:'damage'}` | FAC-KHA-006 |
| Critical Shred | `attack.crit` → `attack.resolved` [A1:13] | in its Combat Action: `{op:'makeAttack', target:'target', weaponFilter:'same'}`, no focus; `makesAttack: true`; R7.19 | ATK-012 |
| Beat Back (Ripper Shield) | `attack.resolved` [A1:11] | as Cygnar Beat Back | FAC-CYG-009 |
| Brutal Damage | `damage.beforeRoll` | direct hit only: `{op:'addDie', roll:'damage'}` | DMG-012 |
| Critical Knockdown | `attack.crit` | `{op:'knockDown'}` (before damage; denies Tough) | ATK-013 DMG-018 |
| Armor-Piercing | `damage.beforeRoll` | code `hook.armorPiercing` (halve the target's base ARM) | ATK-015 |
| Volume Fire | `attack.beforeRoll` / `damage.beforeRoll` | target 40 mm: `{op:'modRoll', roll:'any', value:1}`; ≥ 50 mm: value 2 | FAC-KHA-007 |
| Feat Pall of Ashes | `feat.used` | `{op:'cloud', area:'cloud', placement:'ctrl', count:'d3+3', aoe:3}` (one round); in a cloud: living non-gas-immune enemies `{op:'modStat', stat:'DEF', value:-2}`, `{op:'modRoll', roll:'attack', value:-2}`, `{op:'forbid', what:'tough'}` (gas); friendly Faction models code `hook.pallOfAshesMove` (Pathfinder, move through obstructions and models) | COND-011 COND-012 DMG-016 |
| Spell Superiority | `spell.cast` | target war-engine in her battlegroup: `{op:'modStat', stat:'SPD', value:2}`, MAT +2, DEF +2, `{op:'forbid', what:'knockDown'}`; upkeep | FAC-KHA-008 SPL-013 |
| Spell Avenging Force | `spell.cast` + `maintenance.effects` | code `hook.avengingForce`: if a friendly model was damaged in the enemy turn, in her next Maintenance Phase the affected war-engine `{op:'advance', dist:3}` then `{op:'makeAttack', basic:true}` (out of activation, no focus); upkeep | FAC-KHA-009 |

## Weapons

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kha.vilkul | Thrown Axe | 1 | ranged | RAT 7 | 8 | 1 | — | 13 | — | Magical, Pistol, Weapon Master | AT: Ward Breaker / Eruption of Ash. Reload [1] | V-cd |
| kha.vilkul | Mechanika Axe | 1 | melee | MAT 7 | 1 | — | — | 13 | — | Magical, Weapon Master | AT: Ward Breaker / Eruption of Ash | POW, RNG, Weapon Master QS-2025 |
| kha.vilkul | Combat Knife | 1 | melee | MAT 7 | 1 | — | — | 10 | — | Magical, Weapon Master | — | U-cd |
| kha.razor | Grenade Launcher | 2 (one in L, one in R) | ranged | RAT 6 | 10 | 1 | 2 | 10/5 | L and R | — | Arcing Fire. Targeting Flare | locations, ROF, POW QS-2025 (R crippling hit one launcher, QS p42); rest V-cd |
| kha.razor | Slug Cannon | 1 | ranged | RAT 6 | 8 | 1 | — | 16 | R | Pistol | Momentum; Siege Weapon; Reload [1] | POW, ROF, loc, Momentum QS-2025 |
| kha.razor | Ripper Shield | 1 | melee | MAT 6 | 1 | — | — | 18 | L | Shield | Critical Shred; Beat Back | Shield QS-2025; rest V-cd |
| kha.lazarenko | 'Jack Buster | 1 | ranged | RAT 7 | **12** | 1 | 2 | 14/7 | — | — | Brutal Damage; Critical Knockdown | RNG, ROF, AOE, blast POW QS-2025 (community data said RNG 10) |
| kha.lazarenko | Combat Knife | 1 | melee | MAT 5 | 1 | — | — | 9 | — | — | — | U-cd |
| kha.hounds Tererya | Death Whisper Carbine | 1 | ranged | RAT 6 | 8 | 1 | — | 6 | — | Pistol | Armor-Piercing | V-cd |
| kha.hounds Fedyniak | Grenade Launcher | 1 | ranged | RAT 6 | 12 | 1 | 2 | 12/8 | — | Pistol | Arcing Fire | U-cd |
| kha.hounds Skrobala | Assault Cannon | 1 | ranged | RAT 6 | 12 | d3+1 | — | 12 | — | Pistol | Volume Fire; Critical Knockdown | U-cd |
| kha.hounds (all) | Battle Shield | 1 | melee | MAT 6 | 1 | — | — | 12 | — | — | — | V-cd |

Handoff G gives every Hound a carbine. The data gives a different gun to each trooper (above).

## Razor damage grid (heavy, 30 boxes)

Same layout as Deuce. Rows count from the top. `·` = a plain box, `x` = no box.

| Row | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| 1 | · | · | · | · | · | · |
| 2 | · | · | · | · | · | · |
| 3 | · | L | · | · | R | · |
| 4 | L | L | · | · | R | R |
| 5 | x | M | M | C | C | x |
| 6 | x | x | M | C | x | x |

Systems: L = 3 (Ripper Shield and the L launcher; crippling L also loses +2 ARM), M = 3, C = 3,
R = 3 (Slug Cannon and the R launcher). No H system. QS check: 7 damage from column 5 fills C5 (5 boxes)
and C6 r1–2; 4 more from column 6 fill C6 r3–4 and C1 r1–2, which cripples R (QS pp41–43). Conf U-cd,
QS-consistent.

## Spells (Vilkul)

The QS confirms two spells. The rest of the list is community data; **open app check** for the current
list and every stat.

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Superiority | 2 | ? | — | — | UP | no | Target war-engine in her battlegroup: +2 SPD, MAT and DEF; can't be knocked down | QS-2025 (RNG U-guess) |
| Avenging Force | 2 | ? | — | — | UP | no | If a friendly model is damaged during the enemy turn, in her next Maintenance Phase the war-engine advances 3" and makes one basic attack | QS-2025 (RNG and target rules U-guess) |
| Cyclone | ? | ? | ? | ? | ? | ? | Unknown | U-cd name |
| Cold Front | ? | ? | ? | ? | ? | ? | Unknown | U-cd name |
| Fog of War | ? | CTRL? | — | — | ? | no | Friendly models in her CTRL gain concealment | U-cd name; stats U-guess |

## Feat (Vilkul): Pall of Ashes (QS-2025 for the count, placement and duration)

Lasts one round:
- Place d3+3 cloud areas (3") completely within Vilkul's CTRL (QS p36: d3 = 1 → 4 clouds).
- Friendly Faction models in a cloud gain Pathfinder and may move through obstructions and other
  models if they have enough movement to end completely clear (U-cd).
- Living models in a cloud suffer −2 DEF and −2 to attack rolls (QS p42 for the attack penalty on
  Falk), and they lose Tough. It's gas: models that ignore gas are exempt (every Khador model here;
  Razor is a construct).

## Data notes
- Vilkul and Lazarenko are assumed to be on 30 mm bases (U-guess; handoff G shows "30?").
- Each Hound is a named character with a different gun, so the data model needs per-trooper weapons.
