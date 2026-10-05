# Faction: Khador (Winter Korps, SKS-6 cadre) — Recon starter

- **Data source:** community MK4 card data (`isorna/wardice-warmachine-data`,
  `khador.winter-korps.profiles.json`), fetched 2026-10-04 and cross-checked against handoff Part G.
  We don't know which app version it was taken from (verify against the official app, and record
  the app version here once checked).
- **Confidence key:**
  - `V-cd`: our two sources agree (community data and handoff G);
  - `U-cd`: community data only;
  - `U-hg`: handoff G only;
  - `U-guess`: neither source; our best guess.
- All prose is ours.

The data also has a *solo* Vilkul (18 pts) and a *solo-companion* Razor. They are not used.
Recon uses the warcaster Vilkul (0 pts) and Razor (17 pts).

## Roster (30 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| kha.vilkul | Kapitan Zahara Vilkul | Vilkul | Leader (warcaster) | 0 | 30 | 17 | V-cd (base U-guess) |
| kha.razor | Razor | Razor | Heavy war-engine, character | 17 | 50 | grid 30 | V-cd |
| kha.lazarenko | Sergeant Goran Lazarenko, the Jackal | Lazarenko | Solo, character | 4 | 30 | 8 | U-cd (base U-guess) |
| kha.hounds | The Hounds | Hounds | Unit, 3 character troopers | 9 | 30 | 1 each | U-guess: no health in the data, so we default to 1 |

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | conf |
|---|---|---|---|---|---|---|---|---|---|
| kha.vilkul | 7 | 6 | 7 | 7 | 16 | 15 | 6 | 12 | V-cd |
| kha.razor | 5 | — | 6 | 6 | 11 | 19 | — | — | V-cd |
| kha.lazarenko | 6 | — | 5 | 7 | 14 | 16 | — | — | V-cd |
| kha.hounds (all) | 6 | — | 6 | 6 | 14 | 15 | — | — | V-cd |

- Razor's effective ARM is 21 while his L system (Ripper Shield) works.
- A Hound that is B2B with another Hound gets +2 ARM from Shield Wall.

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| kha.vilkul | Dual Attack, Pathfinder, Resist Corrosion, Resist Fire, Unstoppable, Tough | **Field Marshal [Prowl]** (her battlegroup's war-engines gain Prowl); **Prowl**; **Rise** (if she is knocked down at the start of her Maintenance Phase, she stands up); **Take Down** (her melee attacks deny Tough rolls, and the models they box are RFP'd); **Enhanced Alchemical Mask** (immune to gas, ignores clouds for LOS, ignores all concealment) | U-cd |
| kha.razor | Construct, Dual Attack, Headbutt, Slam, Trample, Pathfinder, Resist Corrosion, Resist Fire | **Anchor** (friendly warrior models B2B with it can't be knocked down); **Reposition [3"]**; **Swift Hunter** (after a basic ranged attack destroys an enemy, it may advance 2") | U-cd |
| kha.lazarenko | Advance Deployment, Ambush, Tough, Pathfinder, Resist Fire, Resist Corrosion, Unstoppable | **Alchemical Mask** (immune to gas; ignores clouds, and concealment from clouds, for LOS and attacks); **Marksman** (when his ranged attack damages a war-engine, he picks the column); **Prowl** | U-cd |
| kha.hounds | Advance Deployment, Dual Attack, Pathfinder, Resist Corrosion, Resist Fire, Tough | Alchemical Mask; **Girded** (it and friendly models B2B with it gain Resistance: Blast); Prowl; Reposition [3"]; **Shield Wall** (+2 ARM and can't be knocked down while B2B with a unit-mate) | U-cd |

## Weapons

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kha.vilkul | Thrown Axe | 1 | ranged | RAT 7 | 8 | 1 | — | 13 | — | Magical, Pistol, Weapon Master | AT: **Ward Breaker** (this attack gains Blessed) / **Eruption of Ash** (if a direct hit boxes the model, centre a 3" cloud hazard on it for one round, then RFP it; enemies entering it or ending their activation in it take POW 12 fire). **Reload [1]** | V-cd |
| kha.vilkul | Mechanika Axe | 1 | melee | MAT 7 | 1 | — | — | 13 | — | Magical, Weapon Master | AT: Ward Breaker / Eruption of Ash | V-cd |
| kha.vilkul | Combat Knife | 1 | melee | MAT 7 | 1 | — | — | 10 | — | Magical, Weapon Master | — | U-cd |
| kha.razor | Grenade Launcher | 2 | ranged | RAT 6 | 10 | 1 | 2 | 10/5 | none (verify) | — | **Arcing Fire** (may ignore intervening models). **Targeting Flare** (instead of shooting, place a 3" template completely within 10" with its centre in LOS, ignoring intervening models. For one turn, models in it lose Stealth, and clouds don't block LOS to them) | V-cd |
| kha.razor | Slug Cannon | 1 | ranged | RAT 6 | 8 | 1 | — | 16 | R | Pistol | **Momentum**; **Siege Weapon** (+1 damage die vs buildings and huge bases); **Reload [1]** | V-cd |
| kha.razor | Ripper Shield | 1 | melee | MAT 6 | 1 | — | — | 18 | L | Shield | **Critical Shred** (on a crit in its Combat Action, one extra attack with this weapon against the same model); **Beat Back** | V-cd |
| kha.lazarenko | 'Jack Buster | 1 | ranged | RAT 7 | 10 | 1 | 2 | 14/7 | — | — | **Brutal Damage**; **Critical Knockdown** (a crit knocks down the model hit) | V-cd |
| kha.lazarenko | Combat Knife | 1 | melee | MAT 5 | 1 | — | — | 9 | — | — | — | U-cd |
| kha.hounds Tererya | Death Whisper Carbine | 1 | ranged | RAT 6 | 8 | 1 | — | 6 | — | Pistol | **Armor-Piercing** (halve the base ARM of models hit) | V-cd |
| kha.hounds Fedyniak | Grenade Launcher | 1 | ranged | RAT 6 | 12 | 1 | 2 | 12/8 | — | Pistol | Arcing Fire | U-cd |
| kha.hounds Skrobala | Assault Cannon | 1 | ranged | RAT 6 | 12 | d3+1 | — | 12 | — | Pistol | **Volume Fire** (+1 to attack and damage vs medium bases, +2 vs large or bigger); Critical Knockdown | U-cd |
| kha.hounds (all) | Battle Shield | 1 | melee | MAT 6 | 1 | — | — | 12 | — | — | — | V-cd |

- Handoff G gives every Hound a carbine. The data gives a different gun to each trooper (above), so
  we follow the data.
- Razor's grenade launchers have no location in the data. Arm crippling doesn't affect them unless
  the app says otherwise (verify).

## Razor damage grid (heavy, 30 boxes)

Same layout as Deuce (community data). Rows count from the top. `·` = a plain box, `x` = no box.

| Row | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| 1 | · | · | · | · | · | · |
| 2 | · | · | · | · | · | · |
| 3 | · | L | · | · | R | · |
| 4 | L | L | · | · | R | R |
| 5 | x | M | M | C | C | x |
| 6 | x | x | M | C | x | x |

Systems: L = 3 (it holds the Ripper Shield, so crippling L also loses Razor's +2 ARM), M = 3,
C = 3, R = 3 (Slug Cannon). There is no H system. Conf U-cd.

## Spells (Vilkul)

The names come from the data (U-cd). **Neither source has the stat values**, so every number below
is U-guess.

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Cyclone | ? | ? | ? | ? | ? | ? | Unknown | U-guess |
| Cold Front | ? | ? | ? | ? | ? | ? | Unknown (probably cold-themed) | U-guess |
| Fog of War | 3? | CTRL? | — | — | UP? | no | Friendly models in her CTRL gain concealment | U-guess |
| Superiority | 2? | 6? | — | — | UP? | no | Buffs one war-engine in her battlegroup (exact effect ?) | U-guess |

Handoff G says she has a "cloud-maker" spell. That is likely Cyclone or Cold Front (verify).

## Feat (Vilkul): Pall of Ashes (U-cd)

The effect lasts one round:
- Place d3+3 cloud templates (3") completely within Vilkul's CTRL.
- Friendly Faction models in a template gain Pathfinder. They may also move through obstructions
  and other models if they have enough movement to end completely clear.
- Living models in a template suffer −2 DEF and −2 to attack rolls, and they lose Tough. Models
  that ignore gas are exempt. That covers every Khador model here (Alchemical Mask or Enhanced
  Alchemical Mask); Razor is a construct.

## Data notes
- Vilkul and Lazarenko are assumed to be on 30 mm bases (U-guess; handoff G shows "30?").
- Each Hound is a named character with a different gun, so the data model needs per-trooper weapons.
