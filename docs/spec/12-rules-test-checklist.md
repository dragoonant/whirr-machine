# 12 Rules test checklist

One line per case: setup → expected result. The IDs are stable; never renumber them, only append.
`Ref` points into `10-rules-core.md` (R*) or `11-scenarios.md` (V*, S*). Cases marked `(verify)`
depend on an unconfirmed rule, so they need an update once the official PDF has been checked.
Dice are seeded: "rolls 3,4" means the dice show 3 and 4.

## DICE

| ID | Case | Ref |
|---|---|---|
| DICE-001 | d3 maps 1,2→1; 3,4→2; 5,6→3 | R1.1 |
| DICE-002 | MAT 6 vs DEF 13, rolls 3,4 → total 13 → hit | R1.3 |
| DICE-003 | MAT 6 vs DEF 13, rolls 3,3 → total 12 → miss, and no crit is recorded | R1.3 R1.5 |
| DICE-004 | RAT 9 vs DEF 5, rolls 1,1 → miss (all 1s) | R1.4 |
| DICE-005 | RAT 3 vs DEF 20, rolls 6,6 → hit and crit | R1.4 R1.5 |
| DICE-006 | A one-die attack showing 6 with RAT 3 vs DEF 20 → miss (one-die exception) | R1.4 |
| DICE-007 | Auto-hit (knocked-down target) plus Stealth auto-miss (ranged at 7") → miss | R1.6 |
| DICE-008 | Auto-hit melee vs a knocked-down target, the attacker chooses to roll 4,4 → hit and crit | R1.6 |
| DICE-009 | POW 12 vs ARM 18, rolls 2,3 → 0 damage, never negative | R1.7 |
| DICE-010 | Boost declared after the roll → rejected by the engine | R1.8 |
| DICE-011 | Two boosts on one roll → second rejected | R1.8 |
| DICE-012 | Weapon Master + boost + Brutal Damage on a direct hit → 5 damage dice | R1.9 |
| DICE-013 | Resistance: Fire vs a fire+magical attack → removes exactly 1 die | R1.10 |
| DICE-014 | Crippled arm (−1 die) + Resistance on a 2-die roll → keeps 1 die (verify floor) | R1.10 |
| DICE-015 | Reroll replaces the original dice; the hit is decided on the new dice | R1.12 |
| DICE-016 | Stat order: DEF 15, set 5 then +2 → 7 | R1.13 |
| DICE-017 | Stat order: ARM 18, halve then +2 → 11 (9+2) | R1.13 |
| DICE-018 | The closed-form P(2d6 ≥ 8) = 15/36 matches 1e6 seeded rolls within 0.2% | R1.14 |

## LOS

| ID | Case | Ref |
|---|---|---|
| LOS-001 | Open ground, 2 small bases 10" apart → LOS | R6.2 |
| LOS-002 | An obstruction fully between them → no LOS | R6.3 |
| LOS-003 | A 30 mm intervening model in front of a 30 mm target → blocks | R6.4 |
| LOS-004 | A 30 mm intervening model in front of a 50 mm target → doesn't block | R6.4 |
| LOS-005 | A 50 mm intervening model in front of a 30 mm target → blocks | R6.4 |
| LOS-006 | A unit-mate between a trooper and its target → doesn't block | R6.4 |
| LOS-007 | A knocked-down 50 mm model between → doesn't block | R6.4 R9.1 |
| LOS-008 | A line passing through a cloud with neither model inside → blocked | R6.5 |
| LOS-009 | Target inside a cloud, viewer outside → LOS | R6.5 |
| LOS-010 | True Sight viewer through a cloud → LOS | R6.5 |
| LOS-011 | Elevated viewer (+2" hill), a small model mid-way and 4" from the target → ignored | R6.6 |
| LOS-012 | Elevated viewer, a small model within 1" of the target → still blocks | R6.6 |
| LOS-013 | Range is edge to edge: centres 13" apart, two 30 mm bases (1.18" each) → 11.82" | R6.8 |
| LOS-014 | Target at 12.01" with RNG 12 → declared, then auto-miss | R6.9 |
| LOS-015 | Stealth target at 5.0" → normal roll; at 5.01" → auto-miss | R6.10 |
| LOS-016 | Prowl model in a forest at 8" → Stealth → auto-miss | R6.10 |
| LOS-017 | Prowl model in the open → no Stealth | R6.10 |
| LOS-018 | True Sight attacker vs a Stealth target at 9" → rolls normally | R6.10 |
| LOS-019 | Forest: a line through 2.5" of forest → LOS; through 3.5" → blocked (verify) | R10 |
| LOS-020 | Engaged non-Gunfighter with a non-Pistol weapon → no ranged attack allowed | R7.7 |
| LOS-021 | Engaged model with a Pistol → may target only its engager (verify) | R7.7 |
| LOS-022 | Engaged Gunfighter → may target a model 8" away | R7.7 |

## TERR (DEF modifiers and terrain)

| ID | Case | Ref |
|---|---|---|
| TERR-001 | Target in a forest → +2 DEF vs ranged | R6.11 |
| TERR-002 | Target within 1" behind a wall → +4 DEF vs ranged | R6.11 |
| TERR-003 | Target behind a wall but 2" from it → no cover (verify) | R6.11 |
| TERR-004 | Cover and concealment both apply → +4 only | R6.11 |
| TERR-005 | Elevated target, lower attacker → +2; stacks with cover → +6 | R6.11 |
| TERR-006 | Target engaged by a third model → +4 (target in melee) | R6.11 |
| TERR-007 | Black Penny shot at an engaged target → no +4 | R6.11 |
| TERR-008 | Knocked-down target in a forest → DEF 5, no concealment (verify) | R6.11 |
| TERR-009 | Alchemical Mask attacker vs a target in a cloud → no concealment | R6.11 |
| TERR-010 | Melee target partly behind a wall → +2 DEF | R6.11 |
| TERR-011 | Melee vs a stationary target → auto-hit | R6.11 |
| TERR-012 | Hazard template: a model ends its activation inside → POW 12 fire roll once | R9.8 |

## MOVE

| ID | Case | Ref |
|---|---|---|
| MOVE-001 | Run with SPD 6 → 11"; the Combat Action is forfeited; the activation ends | R5.1 |
| MOVE-002 | War-engine run → costs 1 focus; with 0 focus → rejected | R5.1 |
| MOVE-003 | War-engine with a crippled cortex → can't run | R3.6 |
| MOVE-004 | Crippled movement → can't run or charge; DEF 5 | R3.6 |
| MOVE-005 | Aim while engaged → rejected | R5.1 |
| MOVE-006 | Model engaged at the start → run rejected | R5.6 |
| MOVE-007 | Leaving an engager's melee range → the Combat Action is forfeited; no attack happens to the mover | R5.7 |
| MOVE-008 | Rough terrain entered mid-move, SPD 6 → 4" total | R5.12 |
| MOVE-009 | Starting in rough terrain, SPD 6 → 4" | R5.12 |
| MOVE-010 | Pathfinder in rough terrain → full SPD | R5.12 |
| MOVE-011 | Wall crossing with 0.5" left and a 1"-deep wall → can't cross | R5.13 |
| MOVE-012 | Unit: move Ryan 6", place Watts and Glover within 2" and in LOS → valid | R5.8 |
| MOVE-013 | Unit placement 2.5" from the moved trooper → rejected | R5.8 |
| MOVE-014 | Unit trooper with no legal placement → destroyed | R5.8 |
| MOVE-015 | Unit run → all troopers forfeit their Combat Action | R5.9 |
| MOVE-016 | Placed trooper leaves an engager's range → that trooper forfeits its Combat Action | R5.10 |
| MOVE-017 | Push 3" into a model at 1" → stops at contact | R5.15 |
| MOVE-018 | Push out of melee range → no Combat Action forfeit (it isn't an advance) | R5.15 |
| MOVE-019 | Push off a 2" ledge → falls; knocked down; POW 12 | R5.19 |
| MOVE-020 | Fall of 4" → POW 12 plus 1 extra die (verify step) | R5.19 |
| MOVE-021 | Reposition 3" after shooting → advance ≤3"; the activation ends | R5.23 |
| MOVE-022 | Reposition after a failed charge → not offered | R5.23 |
| MOVE-023 | Gatecrasher after a kill → placed completely within 5"; the activation ends | cygnar.md |
| MOVE-024 | Swift Hunter: a kill with a basic ranged attack → advance 2" | khador.md |

## CHG

| ID | Case | Ref |
|---|---|---|
| CHG-001 | Charge with SPD 6 → max 9" straight | R5.2 |
| CHG-002 | Charge target not in LOS at declaration → rejected | R5.2 |
| CHG-003 | Charge stops on contacting a friendly model before reaching the target → failed charge | R5.2 R5.4 |
| CHG-004 | Charge ends with the target at 0.9" (1" melee) → success | R5.3 |
| CHG-005 | Moved 4" → the first attack vs the target is a charge attack (auto-boosted damage) | R5.3 |
| CHG-006 | Moved 2.5" and in range → success, but the attack isn't a charge attack | R5.3 |
| CHG-007 | Failed charge → the activation ends at once; no Reposition | R5.4 |
| CHG-008 | War-engine charge → 1 focus | R5.1 |
| CHG-009 | Charge declared while engaged → rejected | R5.6 |
| CHG-010 | Charged → power attack not offered | R5.5 |
| CHG-011 | Unit charge: only the chosen trooper charges; the others are placed and attack without the boost | R5.9 |
| CHG-012 | Charge vs a knocked-down target → auto-hit; the damage is boosted | R5.3 R9.1 |

## ATK

| ID | Case | Ref |
|---|---|---|
| ATK-001 | Melee weapon range 1": target at 1.0" → allowed; at 1.1" → rejected | R7.8 |
| ATK-002 | Skrobala's ROF d3+1 roll 5 → 4 shots | R7.1 |
| ATK-003 | Non-Dual Attack model mixing melee and ranged → rejected | R7.1 |
| ATK-004 | Deuce (Dual Attack) shoots the cannon, then swings the blade → allowed | R7.1 |
| ATK-005 | War-engine power attack, then a ranged attack → rejected | R7.4 |
| ATK-006 | An additional melee attack costs 1 focus; at 0 focus → rejected | R7.2 |
| ATK-007 | Reload [1]: 1 extra cannon shot for 1 focus; a second extra → rejected | R7.2 |
| ATK-008 | Powerful Attack with no focus spent → attack and damage are both forced-boosted | cygnar.md |
| ATK-009 | Both Barrels: one shot at +4 damage; any further Dual Magelock shots → rejected | cygnar.md |
| ATK-010 | Witch Mark direct hit → that activation, spells at that model auto-hit and ignore RNG/LOS | cygnar.md |
| ATK-011 | Thunderbolt hit → push d3" before damage; a crit also knocks down | cygnar.md R7.18 |
| ATK-012 | Critical Shred crit → one extra attack vs the same model, no focus | khador.md |
| ATK-013 | Critical Knockdown crit → the target is knocked down before damage | khador.md |
| ATK-014 | Reciprocate: Falk missed by a ranged attack → 1 basic ranged shot back after it resolves | cygnar.md |
| ATK-015 | Armor-Piercing vs ARM 18 with Buckler +1 → effective ARM 9+1 = 10 | khador.md R1.13 |
| ATK-016 | Pipeline order: the hit trigger (push) happens before the damage roll | R7.18 |
| ATK-017 | Pipeline order: the Tough roll happens after the damage is applied, before boxed triggers | R7.18 |
| ATK-018 | Pipeline order: Evasive/Reciprocate fire after the death windows | R7.18 |
| ATK-019 | Trigger order: active player's triggers first, then the inactive player's | R12.4 |
| ATK-020 | Arcane attack uses AAT and the ranged DEF modifiers | R8.4 |

## DMG

| ID | Case | Ref |
|---|---|---|
| DMG-001 | 1-box trooper takes 1 → disabled → boxed → destroyed → removed | R3.9 |
| DMG-002 | Tough roll of 5 → heal 1, knocked down, stays in play | R3.9 |
| DMG-003 | Tough roll of 4 → boxed → destroyed | R3.9 |
| DMG-004 | Head Shot ranged kill on a Tough Hound → no Tough roll; RFP | cygnar.md R3.10 |
| DMG-005 | Take Down melee kill on a Tough model → no Tough roll; boxed → RFP | khador.md |
| DMG-006 | RFP → destroyed triggers skipped | R3.10 |
| DMG-007 | Eruption of Ash: a direct hit boxes the target → cloud hazard centred on it, then RFP | khador.md |
| DMG-008 | Eruption of Ash on blast damage only → no cloud (needs a direct hit) | khador.md |
| DMG-009 | Arcane Conflagration: a pistol attack boxes the target → POW 10 to models within 1", then RFP | cygnar.md |
| DMG-010 | Shield Wall Hound B2B with a unit-mate → ARM 17; alone → 15 | khador.md |
| DMG-011 | Girded: a Hound B2B with Razor gives Razor Resistance: Blast | khador.md |
| DMG-012 | Brutal Damage applies to the direct-hit target only, not to blast | R7.9 |
| DMG-013 | Simultaneous blast kills 2 Tough models → both Tough rolls after all damage is applied | R3.9 |
| DMG-014 | Caine healing 1 focus → 1 box cleared (verify: d3?) | R8.2 |
| DMG-015 | Disabled model healed in the D2 window → returns to normal | R3.9 |
| DMG-016 | Pall of Ashes: a living enemy model in the cloud loses Tough | khador.md |
| DMG-017 | Leader destroyed → its war-engines become inert at once | R3.9 R8.9 |

## GRID

| ID | Case | Ref |
|---|---|---|
| GRID-001 | Deuce, column 1, 3 damage → C1 rows 1–3 filled | R3.4 |
| GRID-002 | Column 1, 6 damage → C1 r1–4, then C2 r1–2 | R3.4 |
| GRID-003 | Column 6, 6 damage → C6 r1–4, then wraps to C1 r1–2 | R3.4 |
| GRID-004 | Fill C1 r4 + C2 r3–4 → L crippled; the cannon rolls 1 fewer attack and damage die | R3.5 R3.6 |
| GRID-005 | L crippled on Razor → Ripper Shield loses +2 ARM (ARM 19) | R3.6 khador.md |
| GRID-006 | M crippled → DEF 5 vs everything; no charge or slam | R3.6 |
| GRID-007 | C crippled → focus set to 0; allocation to it is rejected; Power up skipped | R3.6 R4.5 |
| GRID-008 | Heal one L box → L un-crippled | R3.5 |
| GRID-009 | 30 damage → disabled (no Tough on war-engines) → destroyed | R3.9 |
| GRID-010 | Marksman (Lazarenko) picks column 4 → filling starts at C4 | R3.4 khador.md |
| GRID-011 | Grid data validates: heights 4/5/6/6/5/4, total 30, systems L3 M3 C3 R3 | cygnar.md |
| GRID-012 | Grenade Launchers (no location) are unaffected by L/R crippling (verify) | khador.md |

## PWR

| ID | Case | Ref |
|---|---|---|
| PWR-001 | Power attack costs a war-engine 1 focus | R7.10 |
| PWR-002 | Headbutt vs a 30 mm target from a 50 mm attacker → POW 14 | R7.10 |
| PWR-003 | Headbutt at a larger base → rejected | R7.11 |
| PWR-004 | Headbutt hit → knocked down, then damage | R7.11 |
| PWR-005 | Slam with 3"+ moved, hit → d6" slam, knocked down, damage | R7.12 |
| PWR-006 | Slam with 2" moved, hit → damage only, no movement, no knockdown (verify) | R7.12 |
| PWR-007 | Slam at a larger base → −2 to hit; distance halved | R7.12 |
| PWR-008 | Slam that doesn't reach the target → activation ends | R7.12 |
| PWR-009 | Slammed into a wall → +1 damage die | R5.16 |
| PWR-010 | Slammed 30 mm model through another 30 mm → stops (equal base); the other gets collateral + knockdown | R5.16 |
| PWR-011 | Slammed 50 mm model through a 30 mm → passes through; the 30 mm is knocked down and takes collateral | R5.16 |
| PWR-012 | Collateral can't be boosted; Power Field may still reduce it (verify) | R5.18 R7.18 |
| PWR-013 | Throw with Deuce's Crescent Blade (Throw PA) vs 30 mm → d6" away | R7.13 |
| PWR-014 | Throw with the R system crippled → rejected | R7.13 |
| PWR-015 | Trample while engaged → allowed; no disengage forfeit | R7.14 |
| PWR-016 | Trample passes through two 30 mm enemies → two simultaneous attack rolls | R7.14 |
| PWR-017 | Momentum: a Glover shot directly hits a 30 mm → slam d3", collateral at POW 12 | cygnar.md |
| PWR-018 | Unstoppable Vilkul hit by a Thunderbolt crit → not knocked down (verify) | R2 |

## AOE

| ID | Case | Ref |
|---|---|---|
| AOE-001 | AOE 2 direct hit, 3 models within 2" of the target → the closest 2 take blast | R7.9 |
| AOE-002 | Tie for the 2nd closest → seeded random choice | R7.9 |
| AOE-003 | Miss with the target in range → the target takes blast POW only; no others | R7.9 |
| AOE-004 | Miss with the target out of range → nothing | R7.9 |
| AOE-005 | Girded model → blast roll loses a die | R7.9 |
| AOE-006 | Blast rolls are simultaneous; deaths are resolved after all rolls | R7.18 |
| AOE-007 | Blast damage doesn't fire on-hit triggers (no Critical Knockdown on the blast set) | R7.18 |
| AOE-008 | Each blast roll boosted separately, costing 1 focus each (verify) | R7.9 |
| AOE-009 | Arcing Fire grenade over an intervening model → allowed | khador.md |
| AOE-010 | Mage Storm: both Ryan shots hit the same model → a cloud hazard may be centred on it | cygnar.md |

## SPR

| ID | Case | Ref |
|---|---|---|
| SPR-001 | SP 8 line through the target centre; 3 models crossed → 3 attack rolls | R7.15 |
| SPR-002 | ROF 2 scattergun → 2 separate sprays | R7.15 cygnar.md |
| SPR-003 | Spray ignores Stealth on a Prowl target (verify) | R7.15 |
| SPR-004 | Spray ignores cover and concealment | R7.15 |
| SPR-005 | A model completely blocked by an obstruction → excluded | R7.15 |
| SPR-006 | A cloud on the line → ignored; the models behind are still attacked | R7.15 |
| SPR-007 | Every hit is a direct hit; Incendiary sets fire on each | R7.15 |
| SPR-008 | Target in melee during a spray → +4 applies? (verify) | R7.15 |

## FOC

| ID | Case | Ref |
|---|---|---|
| FOC-001 | Caine starts the game with 6 focus | R11.7 |
| FOC-002 | Caine at 8 (from an effect) → trimmed to 6 in Maintenance | R4.1 |
| FOC-003 | Power up: Deuce within CTRL 12 → +1 | R4.5 |
| FOC-004 | Allocate 3 to Deuce after Power up (1) → only 2 allowed (cap 3) (verify) | R4.6 |
| FOC-005 | Allocate to a war-engine out of CTRL → rejected | R4.6 |
| FOC-006 | Upkeep paid → the spell stays; unpaid → it expires | R4.7 |
| FOC-007 | Shake knockdown in Control for 1 focus → stands | R4.8 |
| FOC-008 | Power Field: 9 incoming damage, spend 1 → 4 | R7.18 |
| FOC-009 | Power Field: 4 incoming, spend 1 → 0 (minimum 0) | R7.18 |
| FOC-010 | Power Field: 2 focus on one instance → rejected | R7.18 |
| FOC-011 | Accumulator: Deuce starts its activation within 3" of Caine → +1 focus | R8.10 |
| FOC-012 | Accumulator at 3 focus → stays at 3 (cap, verify) | R8.10 |
| FOC-013 | Disruption → focus 0 and can't gain any for one round | R9.4 |
| FOC-014 | Feat used twice → second rejected | R8.8 |
| FOC-015 | Feat mid-movement → rejected | R4.10 |

## SPL

| ID | Case | Ref |
|---|---|---|
| SPL-001 | Cast with COST > current focus → rejected | R8.3 |
| SPL-002 | Spell mid-attack (between dice) → rejected | R4.10 |
| SPL-003 | Offensive spell: 2d6 + AAT vs DEF, with ranged modifiers | R8.4 |
| SPL-004 | Offensive spell vs Stealth at 6" → auto-miss | R6.10 |
| SPL-005 | A targeted spell without LOS → rejected (unless Witch Mark) | R8.5 |
| SPL-006 | Out of RNG → the offensive spell auto-misses; a non-offensive spell is rejected (verify) | R8.5 |
| SPL-007 | A second friendly upkeep on the same model → replaces the first | R8.6 |
| SPL-008 | Caster destroyed → its upkeeps end | R8.6 |
| SPL-009 | Channel through a non-Arc-Node → rejected | R8.7 |
| SPL-010 | Channel a SELF spell → rejected | R8.7 |
| SPL-011 | Channel through an engaged node → rejected | R8.7 |
| SPL-012 | Engaged caster casting an offensive spell at its engager → allowed (verify) | R8.4 |

## COND

| ID | Case | Ref |
|---|---|---|
| COND-001 | Knocked down → DEF 5; no melee range; can't engage | R9.1 |
| COND-002 | Knocked down model's activation: forfeit movement to stand → may attack | R9.2 |
| COND-003 | Knocked down: forfeit the Combat Action to stand → may advance, not run or charge | R9.2 |
| COND-004 | Rise: Vilkul knocked down at the start of Maintenance → stands | R4.3 khador.md |
| COND-005 | Fire continuous: Maintenance roll 2 → expires, no damage | R4.2 |
| COND-006 | Fire continuous: roll 4 → POW 12 fire roll | R4.2 |
| COND-007 | Incendiary on a Resist-Fire Hound → no Fire continuous (verify) | R9.5 |
| COND-008 | A cloud lasting "one round" placed on P1's turn → gone at the start of P1's next turn (verify) | R12.3 |
| COND-009 | A "one turn" effect (Shadow Fire) → gone at the end of the current turn | R12.3 |
| COND-010 | A model completely inside a cloud → concealment; partly inside → none | R9.7 |
| COND-011 | Pall of Ashes: d3+3 clouds, all completely within CTRL | khador.md |
| COND-012 | Pall of Ashes: an enemy living model inside → −2 DEF, −2 attack | khador.md |

## SCN

| ID | Case | Ref |
|---|---|---|
| SCN-001 | Recon list of 31 points → invalid | R11.1 |
| SCN-002 | List without a war-engine → invalid | R11.1 |
| SCN-003 | Both starter lists total 30 → valid | R11.1 |
| SCN-004 | Deployment: P1 model at y = 6.5 → rejected; Advance Deployment at y = 8.9 → allowed | S1 |
| SCN-005 | Unit troopers deployed 3.5" apart → rejected | R11.5 |
| SCN-006 | Ambush placement in round 1 → rejected | R11.6 |
| SCN-007 | Ambush entry → forfeits movement or the Combat Action that turn (verify) | R11.6 |
| SCN-008 | No scoring at the end of P1 round 1, P2 round 1, or P1 round 2 | V1.2 |
| SCN-009 | First scoring at the end of P2 round 2 | V1.2 |
| SCN-010 | Both players score at every scoring point (verify) | V1.2 |
| SCN-011 | W1 with 2 friendly models within 2" and no enemy within 3" → 1 VP | V2.4 |
| SCN-012 | W1 held, but an enemy trooper within 3" → contested; no VP | V2.4 |
| SCN-013 | An enemy Leader within 3" doesn't contest | V2 |
| SCN-014 | A friendly Leader + 1 trooper within 2" → controls (Leaders can control) | V2 |
| SCN-015 | Lead by 3 at the end of your own turn → no win | V1.3 |
| SCN-016 | Lead by 3 at the end of the opponent's turn → win | V1.3 |
| SCN-017 | Kill Box: the Leader completely within 12" of its own edge at the end of its turn in round 2 → opponent +2 | V1.7 |
| SCN-018 | Kill Box with the base straddling the 12" line → not applied (completely within required) | V1.7 |
| SCN-019 | Assassination mid-activation → the game ends at once | V1.1 |
| SCN-020 | Both Leaders boxed by one simultaneous blast → draw (verify) | V1.1 |
| SCN-021 | VP tie after round 7 → scenario presence (Leader = 10) decides | V1.5 |
| SCN-022 | Presence tie → draw (verify) | V1.6 |
| SCN-023 | 40 mm objective: 2 of 3 troopers within 3" → no; all 3 remaining → yes | V2.2 |
| SCN-024 | Ashwall Divide layout loads; point symmetry about (18, 18) holds for every element | S1 |

## GOLD

| ID | Case | Ref |
|---|---|---|
| GOLD-001 | **Quick Start worked first turn, replayed.** Feed the official QS lists, deployment and the printed dice into a seeded replay. Every intermediate state (positions, focus, damage boxes, conditions) must match the PDF. **Blocked: needs the QS PDF in `docs/sources/`** | all |
