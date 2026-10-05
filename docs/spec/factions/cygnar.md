# Faction: Cygnar (Storm Legion, Hellslinger cadre) — Recon starter

- **Data source:** community MK4 card data (`isorna/wardice-warmachine-data`,
  `cygnar.storm-legion.profiles.json`), fetched 2026-10-04 and cross-checked against handoff Part G.
  We don't know which app version it was taken from (verify against the official app, and record
  the app version here once checked).
- **Confidence key:**
  - `V-cd`: our two sources agree (community data and handoff G);
  - `U-cd`: community data only;
  - `U-hg`: handoff G only;
  - `U-guess`: neither source; our best guess, so data entry must not trust it.
- All prose is ours. Names are real (Mallet posture). The UI names come from the `shipName` column,
  which the owner can rename later.

## Roster (30 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| cyg.caine | Major Allister Caine | Caine | Leader (warcaster) | 0 | 30 | 15 | V-cd (base U-hg) |
| cyg.deuce | Deuce | Deuce | Heavy war-engine, character | 17 | 50 | grid 30 | V-cd |
| cyg.falk | Captain Bastian Falk | Falk | Solo, character | 4 | 30 | 8 | U-cd (base U-guess) |
| cyg.black13 | The Black 13th | Black 13th | Unit, 3 character troopers | 9 | 30 | 1 each | U-guess: no health in the data, so we default to 1 |

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | conf |
|---|---|---|---|---|---|---|---|---|---|
| cyg.caine | 7 | 6 | — | 9 | 17 | 13 | 6 | 12 | V-cd |
| cyg.deuce | 6 | — | 6 | 7 | 13 | 18 | — | — | V-cd |
| cyg.falk | 6 | — | 6 | 7 | 15 | 12 | — | — | V-cd |
| cyg.black13 (all) | 6 | — | 5 | 7 | 15 | 12 | — | — | V-cd |

- Caine has no melee weapon in the data, so his MAT is empty.
- Deuce's effective ARM is 19 while his R system (Buckler) works.

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| cyg.caine | Gunfighter, Pathfinder | **Evasive** (after an enemy ranged attack hits him, he may advance 2"); **Field Marshal [Evasive]** (his battlegroup's war-engines gain Evasive); **Gatecrasher** (once he has destroyed or RFP'd an enemy this activation, he may place himself completely within 5", ending the activation); **Head Shot** (his ranged attacks deny Tough rolls, and the models they destroy are RFP'd); **Leadership [Gun Mage]** (friendly Gun Mages within 10" gain Head Shot) | U-cd |
| cyg.deuce | Construct, Dual Attack, Headbutt, Slam, Trample | **Accumulator [Gun Mage]** (+1 focus if it starts its activation within 3" of a friendly Gun Mage); **Reposition [3"]**; **True Sight** (ignores clouds for LOS and ignores Stealth) | U-cd |
| cyg.falk | Advance Deployment, Ambush, Dual Attack, Pathfinder | **Leadership [Gun Mages]** (friendly Gun Mages within 10" gain Reciprocate); **Prowl** (Stealth while concealed); **Reciprocate** (when an enemy ranged attack misses it, it may then shoot one basic ranged attack back at the attacker); **Run & Gun** (at the end of an activation in which it killed with ranged attacks, it may full advance) | U-cd |
| cyg.black13 | Advance Deployment, Gunfighter, Pathfinder | Prowl; Reposition [3"]; True Sight | U-cd |

Keywords: every model is Gun Mage and Hellslinger Cadre; Deuce is not a Gun Mage. So Leadership
[Gun Mage] reaches Caine, Falk and the Black 13th, and Accumulator triggers off any of them.

## Weapons

`AT` = the weapon's Attack Type options: pick one per attack (R7.18 step 1).

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cyg.caine | Spellstorm Pistol | 2 | ranged | RAT 9 | 12 | 1 | — | 12 | — | Magical, Pistol | AT: **Witch Mark** (a direct hit lets his spells target that model this activation, ignoring RNG and LOS, and auto-hit it) / **Thunderbolt** (an enemy hit is pushed d3" away; on a crit it is also knocked down) / **Heart Seeker** (+1 damage die, then drop the lowest die). **Reload [∞]** (1 focus per extra shot, no limit) | U-cd |
| cyg.deuce | Spellstorm Cannon | 1 | ranged | RAT 7 | 12 | 1 | — | 14 | L | Magical, Pistol | AT: **Beat Back** (after a hit, push the target 1" away, then Deuce may advance 1" toward it) / **Decrepitation** (+1 damage die vs construct or undead) / **Blast** (this shot becomes AOE 2, POW 12/6). **Powerful Attack** (pay 1 focus, or boost both rolls). **Reload [1]** | U-cd |
| cyg.deuce | Crescent Blade | 1 | melee | MAT 6 | 1 | — | — | 15 | R | Buckler, Magical, Throw PA | — | V-cd |
| cyg.falk | Magelock Scattergun | 1 | ranged | RAT 7 | SP 8 | 2 | — | 12 | — | Magical, Pistol | AT: **Decrepitation** / **Incendiary** (fire damage, sets the Fire continuous effect) / **Banish** (after it damages an enemy non-Leader, place that model completely within 1" of where it was) | V-cd |
| cyg.falk | Sword | 1 | melee | MAT 6 | 1 | — | — | 10 | — | — | — | U-cd |
| cyg.black13 Ryan | Magelock Heavy Pistol | 2 | ranged | RAT 7 | 10 | 1 | — | 12 | — | Magical, Pistol | AT: **Shadow Fire** (the model hit doesn't block LOS for one turn) / **Thunderbolt** / **Brutal Damage** (+1 damage die vs the target on a direct hit). **Chain Attack: Mage Storm** (if both initial shots hit one model, he may centre a 3" cloud hazard on it for one round: POW 12 fire to models entering it or ending their activation in it) | U-cd |
| cyg.black13 Ryan | Gun Blade | 2 | melee | MAT 5 | 1 | — | — | 8 | — | — | — | U-cd |
| cyg.black13 Watts | Magelock Rifle | 1 | ranged | RAT 7 | 14 | 1 | — | 12 | — | Magical | AT: Brutal Damage / Blast (AOE 2, POW 12/6) / **Black Penny** (ignores the target-in-melee DEF bonus) | U-cd |
| cyg.black13 Watts | Rifle Butt | 1 | melee | MAT 5 | 1 | — | — | 6 | — | — | — | U-cd |
| cyg.black13 Glover | Dual Magelock | 1 | ranged | RAT 7 | 10 | 2 | — | 12 | — | Magical, Pistol | AT: Black Penny / **Momentum** (a small or medium model directly hit is slammed d3" away, with collateral at this weapon's POW; a large or bigger model hit is knocked down) / Brutal Damage. **Both Barrels** (★Attack: +4 damage on this one shot; no more shots with this weapon this activation) | U-cd |
| cyg.black13 Glover | Trench Knife | 1 | melee | MAT 5 | 1 | — | — | 9 | — | — | — | U-cd |

Handoff G lists "2× heavy pistol" for all three troopers. The data gives each trooper different
weapons (above), so we follow the data.

## Deuce damage grid (heavy, 30 boxes)

Rows count from the top (1); damage fills top-down (R3.4). `·` = a plain box, `x` = no box.

| Row | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| 1 | · | · | · | · | · | · |
| 2 | · | · | · | · | · | · |
| 3 | · | L | · | · | R | · |
| 4 | L | L | · | · | R | R |
| 5 | x | M | M | C | C | x |
| 6 | x | x | M | C | x | x |

Column heights 4/5/6/6/5/4. Systems: L = 3 boxes (C1r4, C2r3, C2r4), M = 3 (C2r5, C3r5, C3r6),
C = 3 (C4r5, C4r6, C5r5), R = 3 (C5r3, C5r4, C6r4). There is no H system, although handoff E.3
expected one. Conf U-cd.

## Spells (Caine)

The spell names come from the data (U-cd). **None of the stat values are in either source**, so
every number below is U-guess and data entry must take it from the app.

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Blur | 2? | 6? | — | — | UP? | no | Target friendly model or unit gains +DEF vs ranged attacks (size ?) | U-guess |
| Calamity | ? | ? | — | — | UP? | yes? | Debuff on an enemy model or unit that helps friendly attacks against it (exact effect ?) | U-guess |
| Heightened Reflexes | ? | ? | — | — | ? | no | Unknown | U-guess |
| Magic Bullet | ? | ? | — | ? | — | yes | An offensive shot spell (details ?) | U-guess |
| Arcane Sight | ? | ? | — | — | ? | no | Unknown | U-guess |

The handoff warns that the post-2026 spell list may be fixed or different (verify).

## Feat (Caine): Arcane Conflagration (U-cd)

The effect lasts one round:
- After each of Caine's ranged attacks that hits an enemy, his Spellstorm Pistol damage rolls gain
  a stacking +1.
- When a Spellstorm Pistol attack boxes a model, every model within 1" of it takes an unboostable
  POW 10 magical blast damage roll, and then the boxed model is RFP'd (the D3 window).

## Data notes
- Bases: Caine and the Black 13th are 30 mm and Deuce is 50 mm (handoff G). Falk is assumed to be
  30 mm (U-guess).
- Every Black 13th trooper is a named character with a different loadout, so the data model needs
  per-trooper weapons.
