# Faction: Cygnar (Storm Legion, Hellslinger cadre) — Recon starter

- **Sources:** the official Quick Start guide (Jul 2025, `docs/sources/`, printed pages 34–47 plus the template page) and
  community MK4 card data (`isorna/wardice-warmachine-data`, fetched 2026-10-04). The app version of the
  community data is unknown.
- **The Quick Start prints no stat cards.** It gives values only where the worked turns use them
  (pp36–47), the layout diagram (p35: base sizes) and the Razor damage grid (p41). Everything else
  stays community data until the **open app check** (record the app version, confirm every non-QS value).
- **Confidence key** (QS beats community data on any conflict):
  - `verified (QS pN)`: printed in the Quick Start on page N (or read from its diagram); data entry may use it;
  - `V-cd`: community data and handoff G agree, not contradicted by the QS;
  - `U-cd`: community data only;
  - `U-guess`: no source; data entry must not trust it.
- All prose is ours. Names are real (Mallet posture). UI names come from `shipName`.

## Roster (30 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| cyg.caine | Major Allister Caine | Caine | Leader (warcaster) | 0 | 30 | 15 | base verified (QS p35); pts, boxes V-cd |
| cyg.deuce | Deuce | Deuce | Heavy war-engine (warjack), character | 17 | 50 | grid 30 | base verified (QS p35); grid see below |
| cyg.falk | Captain Bastian Falk | Falk | Solo, character | 4 | 30 | 8 | base verified (QS p35); boxes verified (QS p47) |
| cyg.black13 | The Black 13th | Black 13th | Unit, 3 character troopers (Ryan, Glover, Watts) | 9 | 30 | per trooper; use 5 each until the app check (Ryan survives 4, so ≥5; Glover survives 1) | base verified (QS p35); boxes U-guess |

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | conf |
|---|---|---|---|---|---|---|---|---|---|
| cyg.caine | 7 | 6 | — | 9 | 17 | 13 | 6 | 12 | SPD verified (QS p42); ARC, CTRL verified (QS p40); rest V-cd |
| cyg.deuce | 6 | — | 6 | 7 | 13 | 18 | — | — | SPD verified (QS p40); RAT verified (QS p41); DEF, ARM verified (QS p39); MAT V-cd |
| cyg.falk | 6 | — | 6 | 7 | 15 | 12 | — | — | SPD verified (QS p42); RAT verified (QS p43); DEF, ARM verified (QS p47); MAT V-cd |
| cyg.black13 Ryan | 6 | — | 5 | 7 | 15 | 12 | — | — | SPD, RAT, DEF verified (QS p43); ARM verified (QS p46); MAT V-cd |
| cyg.black13 Glover | 6 | — | 5 | 7 | 15 | 12 | — | — | SPD verified (QS p43); RAT verified (QS p44); ARM verified (QS p46); MAT, DEF V-cd |
| cyg.black13 Watts | 6 | — | 5 | 7 | 15 | 12 | — | — | SPD verified (QS p43); RAT verified (QS p44); ARM verified (QS p46); MAT, DEF V-cd |

- Caine has no melee weapon in the data, so his MAT is empty.
- Deuce's ARM is 19 while the Crescent Blade's system works: its **Buckler** quality adds +1 ARM
  (verified QS p39, p46; it still applies while Deuce is knocked down, QS p46).
- Warcaster and warjack basics the QS shows for this army: Caine refills focus to ARC 6 (Focus
  Manipulation), Deuce gains 1 focus from Power Up while in Caine's CTRL, and a warjack holds at most
  3 focus (QS p40).

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| cyg.caine | Gunfighter, Pathfinder | **Evasive**; **Field Marshal [Evasive]**; **Gatecrasher**; **Head Shot**; **Leadership [Gun Mage]** (see the hook map) | Gun Mage keyword verified (QS p40); rest U-cd |
| cyg.deuce | Construct, Dual Attack, Headbutt, Slam, Trample | **Accumulator [Gun Mage]**: starting its activation within 3" of a friendly Gun Mage gives it 1 focus (cap 3). **True Sight**: it sees through clouds. **Reposition [3"]** | Accumulator verified (QS p40); True Sight verified (QS p40); Construct verified (QS p42, warjacks are constructs); rest U-cd |
| cyg.falk | Advance Deployment, Ambush, Dual Attack, Pathfinder | **Leadership [Gun Mages]** (grants Reciprocate); **Prowl**; **Reciprocate**; **Run & Gun** | Advance Deployment verified (QS p35); Pathfinder verified (QS p42: shallow water costs him nothing); living (QS p42); rest U-cd |
| cyg.black13 | Advance Deployment, Gunfighter, Pathfinder | **Granted: Prey** (from Ryan); **Granted: True Sight** (from Glover); Prowl; Reposition [3"] | Granted rules verified (QS p43); rest U-cd |

Keywords: every model is Gun Mage and Hellslinger Cadre except Deuce (the QS calls all of Deuce's allies
Gun Mages, p40). Leadership [Gun Mage] reaches Caine, Falk and the Black 13th, and Accumulator
triggers off any of them.

**Granted rules (verified QS p43):** while the granting trooper is in play, its whole unit has the
rule. Ryan grants **Prey**: after deployment (R11.5) the unit picks one enemy model; the unit's attack
and damage rolls against it get +2; when the prey is destroyed, the unit picks a new one. Glover grants
**True Sight**.

## Ability → descriptor / code hook map

Ops and fields from `hooks.ts` (00 §14). `[A1:n]` = the "after the attack is resolved" tier (R7.18 step 16).

| Ability | Hook point | Descriptor (or code hook) | Test |
|---|---|---|---|
| Evasive | `attack.resolved` [A1:12] | when `{all:[hit, attackKind ranged, isEnemy attacker]}`; `{op:'advance', dist:2, direction:'any'}`; optional | FAC-CYG-001 |
| Field Marshal [Evasive] | passive | scope `warEngines` (battlegroup); `{op:'grantAbility', ability:'evasive'}` | FAC-CYG-002 |
| Gatecrasher | `attack.resolved` [A1:11] | when `{code:'destroyedEnemyThisActivation'}`; `{op:'place', dist:5}` then `{op:'endActivation'}`; optional | MOVE-023 |
| Head Shot | `attack.declared` + `death.boxed` | ranged only: `{op:'forbid', what:'tough'}` on the target; at boxed `{op:'removeFromPlay'}` | DMG-004 |
| Leadership [Gun Mage] | passive | scope friendly keyword gun-mage within 10; `{op:'grantAbility', ability:'head-shot'}` | FAC-CYG-003 |
| Accumulator [Gun Mage] | `activation.start` | when friendly gun-mage within 3; `{op:'gainFocus', value:1}` (cap 3) | FOC-011 FOC-012 |
| Reposition [3"] | `activation.end` | `{op:'advance', dist:3, direction:'any'}`; not after run/failed charge; units: per trooper | MOVE-021 MOVE-026 |
| True Sight | passive | `{op:'ignore', ignore:'clouds'}`, `{op:'ignore', ignore:'stealth'}` | LOS-010 LOS-018 |
| Prowl | passive | when `{test:'concealed'}`; `{op:'grantAbility', ability:'stealth'}` | LOS-016 LOS-017 |
| Reciprocate | `attack.resolved` [A1:12] | when `{all:[{not:hit}, attackKind ranged, isEnemy attacker]}`; `{op:'makeAttack', target:'attacker', weaponFilter:'ranged', basic:true}`; `makesAttack: true`; out of activation | ATK-014 |
| Leadership [Gun Mages] (Falk) | passive | gun-mage within 10: `{op:'grantAbility', ability:'reciprocate'}` | FAC-CYG-004 |
| Run & Gun | `activation.end` | code `hook.runAndGun` (destroyed an enemy with a ranged attack this activation → full advance) | FAC-CYG-005 |
| Granted: Prey | passive + setup | code `hook.prey` (choice via `abilityChoice` code `prey`; `UnitState.preyId`); `{op:'modRoll', roll:'attack', value:2}`, `{op:'modRoll', roll:'damage', value:2}` when `{test:'isPrey'}` | FAC-CYG-006 |
| Granted: True Sight | passive | scope unit while Glover is in play; `{op:'grantAbility', ability:'true-sight'}` | FAC-CYG-007 |
| AT Witch Mark | `attack.hit` | code `hook.witchMark` (this activation the caster's spells at that model auto-hit and ignore RNG/LOS) | ATK-010 |
| AT Thunderbolt | `attack.hit` / `attack.crit` | `{op:'push', dist:'d3', direction:'away'}`; on crit `{op:'knockDown'}` | ATK-011 |
| AT Heart Seeker | `damage.beforeRoll` / `damage.rolled` | `{op:'addDie', roll:'damage'}`, `{op:'discardLowest'}` | FAC-CYG-008 |
| Reload [∞] / [1] | `combat.chooseAttack` | engine core: extra ranged attack for 1 focus each (limit) | ATK-007 |
| AT Beat Back | `attack.resolved` [A1:11] | when hit: `{op:'push', dist:1, direction:'away'}` on target, then optional `{op:'advance', dist:1, direction:'toward'}` | FAC-CYG-009 |
| AT Decrepitation | `damage.beforeRoll` | when target construct or undead: `{op:'addDie', roll:'damage'}` | FAC-CYG-010 |
| AT Blast | `attack.declared` | code `hook.blastShot` (this shot becomes AOE 2, POW 12/6) | FAC-CYG-011 |
| Powerful Attack | `attack.beforeRoll` | code `hook.powerfulAttack` (optional: 1 focus boosts the attack and its damage roll) | ATK-008 |
| AT Incendiary | `attack.hit` | damage type fire; `{op:'applyCondition', condition:'fire'}` | SPR-007 COND-007 |
| AT Banish | `attack.resolved` [A1:11] | when it damaged a non-Leader enemy: `{op:'place', dist:1}` on the target (completely within 1" of its spot) | FAC-CYG-012 |
| AT Shadow Fire | `attack.hit` | code `hook.shadowFire` (the model hit doesn't block LOS, one turn) | COND-009 |
| AT Brutal Damage | `damage.beforeRoll` | direct hit only: `{op:'addDie', roll:'damage'}` | DICE-012 DMG-012 |
| Mage Storm (chain) | `attack.resolved` | code `hook.mageStorm`: both initial shots hit one model → `{op:'cloud', area:'hazard', placement:'centredOnTarget', count:1, hazard:{pow:12, damageType:'fire', on:['enter','endActivation']}}`, one round | AOE-010 |
| AT Black Penny | passive | `{op:'ignore', ignore:'targetInMelee'}` | TERR-007 |
| AT Momentum | `attack.hit` | target ≤ 40 mm: `{op:'slam', dist:'d3', collateralPow:<weapon POW>}`; larger: `{op:'knockDown'}` | PWR-017 |
| ★Attack Both Barrels | `combat.choose` | `{op:'modRoll', roll:'damage', value:4}`; `{op:'forbid', what:'weaponAttacks'}` for this weapon this activation | ATK-009 |
| Feat Arcane Conflagration | `feat.used` | code `hook.arcaneConflagrationCounter` (+1 stacking pistol damage per hit) and `death.boxed`: POW 10 within 1", then `{op:'removeFromPlay'}` | DMG-009 |
| Spell Deflection | `spell.cast` | scope friendly in CTRL; `{op:'modStat', stat:'DEF', value:2}` vs ranged and arcane only; duration round | SPL-015 |

## Weapons

`AT` = the weapon's Attack Type options: pick one per attack (R7.18 step 1).

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cyg.caine | Spellstorm Pistol | 2 | ranged | RAT 9 | 12 | 1 | — | 12 | — | Magical, Pistol | AT: Witch Mark / Thunderbolt / Heart Seeker. Reload [∞] | U-cd |
| cyg.deuce | Spellstorm Cannon | 1 | ranged | RAT 7 | 12 | 1 | — | 14 | L | Magical, Pistol | AT: Beat Back (hit: push the target 1" away, then Deuce may advance 1" toward it) / Decrepitation (+1 damage die against constructs and undead) / Blast. Powerful Attack (1 focus boosts the attack roll and its damage roll). Reload [1] | ROF verified (QS p40); POW verified (QS p41); RNG 12 verified (QS p40: "within 12"" puts Razor under threat); Beat Back, Powerful Attack verified (QS p40); Decrepitation, Reload [1] verified (QS p41); Blast, loc U-cd |
| cyg.deuce | Crescent Blade | 1 | melee | MAT 6 | 1 | — | — | 15 | R | Buckler (+1 ARM while its system works), Magical, Throw PA | — | Buckler verified (QS p39); RNG 1 verified (QS p46: both warjacks' melee RNG 1); rest V-cd |
| cyg.falk | Magelock Scattergun | 1 | ranged | RAT 7 | SP 8 | 1 | — | 12 | — | Magical, Pistol | Spray. AT: Decrepitation / Incendiary (fire damage) / Banish (never moves a Leader) | Spray, ROF, POW, the three ATs verified (QS p43); spray length 8 V-cd |
| cyg.falk | Sword | 1 | melee | MAT 6 | 1 | — | — | 10 | — | — | — | U-cd |
| cyg.black13 Ryan | Magelock Pistol | 2 | ranged | RAT 7 | 10 | 1 | — | 10 | — | Magical, Pistol | AT: Shadow Fire / Thunderbolt (hit: push d3" away; crit: knockdown) / Brutal Damage. Chain Attack: Mage Storm | Qty, ROF, POW, Thunderbolt verified (QS p43–44); rest U-cd |
| cyg.black13 Ryan | Gun Blade | 2 | melee | MAT 5 | 1 | — | — | 8 | — | — | — | U-cd |
| cyg.black13 Watts | Magelock Rifle | 1 | ranged | RAT 7 | 14 | 1 | — | 10 | — | Magical | AT: Brutal Damage (direct hit: +1 damage die) / Blast (AOE 2, POW 12/6) / Black Penny | ROF, POW, Brutal Damage verified (QS p44); range longer than the pistols' verified (QS p44); RNG value, rest U-cd |
| cyg.black13 Watts | Rifle Butt | 1 | melee | MAT 5 | 1 | — | — | 6 | — | — | — | U-cd |
| cyg.black13 Glover | Dual Magelock Pistol | 1 | ranged | RAT 7 | 10 | 2 | — | 10 | — | Magical, Pistol | AT: Black Penny / Momentum / Brutal Damage. ★Attack Both Barrels (replaces the initial attacks: one attack with +4 on its damage roll) | ROF, POW, Brutal Damage, Both Barrels verified (QS p44); rest U-cd |
| cyg.black13 Glover | Trench Knife | 1 | melee | MAT 5 | 1 | — | — | 9 | — | — | — | U-cd |

Handoff G lists "2× heavy pistol" for all three troopers; the QS gives each trooper its own weapons
(above).

## Deuce damage grid (heavy, 30 boxes)

The QS prints only Razor's grid (p41, p44). We assume Deuce uses the same heavy layout (**ASSUMED**,
open app check). Rows 1–6 run top to bottom as printed. `·` = a hull box, a letter = a system box,
`x` = no box.

| Row | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| 1 | x | x | · | · | x | x |
| 2 | · | · | · | · | · | · |
| 3 | · | · | · | · | · | · |
| 4 | · | L | · | · | R | · |
| 5 | L | L | M | C | R | R |
| 6 | x | M | M | C | C | x |

Column heights 4/5/6/6/5/4. Each column's boxes, top box first (this is the data the engine stores;
damage fills a column from its top box down, then moves right, R3.4):

| Column | Boxes (top → bottom) |
|---|---|
| 1 | · · · L |
| 2 | · · L L M |
| 3 | · · · · M M |
| 4 | · · · · C C |
| 5 | · · R R C |
| 6 | · · · R |

Systems: L = 3 (C1#4, C2#3, C2#4), M = 3 (C2#5, C3#5, C3#6), C = 3 (C4#5, C4#6, C5#5),
R = 3 (C5#3, C5#4, C6#4). No H system. `#n` = the n-th box of the column from its top box.
Cortex crippled: loses its focus and can't gain or spend any. Movement crippled: base DEF 5, can't run,
charge, slam or trample. L/R crippled: one fewer die on attack and damage rolls with weapons in that
location (QS p41).

## Spells (Caine)

The QS shows one spell. The rest of the list is community data; **open app check** for the current
list and every stat.

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Deflection | 3 | CTRL | — | — | RND | no | Friendly models within Caine's CTRL get +2 DEF against ranged and arcane attacks for one round (it still works in the opponent's next turn) | verified (QS p42; still active in Khador's round-2 turn, QS p46) |
| Blur | ? | ? | — | — | ? | no | Target friendly model or unit gains DEF vs ranged attacks | U-cd name; stats U-guess |
| Calamity | ? | ? | — | — | ? | ? | Debuff on an enemy that helps friendly attacks against it | U-cd name; stats U-guess |
| Heightened Reflexes | ? | ? | — | — | ? | no | Unknown | U-cd name |
| Magic Bullet | ? | ? | — | ? | — | yes | An offensive shot spell | U-cd name |
| Arcane Sight | ? | ? | — | — | ? | no | Unknown | U-cd name |

## Feat (Caine): Arcane Conflagration (U-cd)

Lasts one round:
- After each of Caine's ranged attacks that hits an enemy, his Spellstorm Pistol damage rolls gain
  a stacking +1.
- When a Spellstorm Pistol attack boxes a model, every model within 1" of it takes an unboostable
  POW 10 magical blast damage roll, and then the boxed model is RFP'd (the D3 window).

## Data notes
- Bases (QS p35 layout diagram, model discs measured against the 36" table): Caine, Falk and each Black
  13th trooper 30 mm; Deuce 50 mm.
- Every Black 13th trooper is a named character with its own loadout and box count, so the data model
  needs per-trooper weapons and health.
- The `qs-2025` bundle (GOLD-001, `13-golden-first-turn.md`) uses the verified values plus the community
  values the QS turns rely on (pistol and rifle RNG, Scattergun spray length, trooper box counts).
