# 12 Rules test checklist

One line per case: setup → expected result. The IDs are stable; never renumber them, only append.
A retired ID stays in its table, marked *retired*. `Ref` points into `10-rules-core.md` (R*),
`11-scenarios.md` (V*, S*) or a faction file. Every case was checked against the rulebook, QS and SR
on 2026-10-04; `(unsourced)` marks a case that rests on our ruling. Dice are seeded: "rolls 3,4" means
the dice show 3 and 4.

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
| DICE-008 | Auto-hit melee vs a knocked-down target (DEF 5), MAT 6, the attacker chooses to roll 4,4 → hit and crit | R1.6 |
| DICE-009 | POW 12 vs ARM 18, rolls 2,3 → 0 damage, never negative | R1.7 |
| DICE-010 | Boost declared after the roll → rejected by the engine | R1.8 |
| DICE-011 | Two boosts on one roll → second rejected | R1.8 |
| DICE-012 | Weapon Master + boost + Brutal Damage on a direct hit → 5 damage dice | R1.9 |
| DICE-013 | Resistance: Fire vs a fire+magical attack → removes exactly 1 die | R1.10 |
| DICE-014 | Attack: a 2-die roll with a crippled arm (−1) and another −1 die effect → 0 dice → auto-miss, no roll. Damage: the same removals → total = POW + mods, no dice (unsourced) | R1.10 |
| DICE-015 | Reroll replaces the original dice; the hit is decided on the new dice | R1.12 |
| DICE-016 | Stat order: DEF 15, set 5 then +2 → 7 | R1.13 |
| DICE-017 | Stat order: ARM 18, halve then +2 → 11 (9+2) | R1.13 |
| DICE-018 | The closed-form P(2d6 ≥ 8) = 15/36 matches 1e6 seeded rolls within 0.2% | R1.14 |
| DICE-019 | Auto-hit melee vs a knocked-down target, the attacker chooses to roll 1,1 → miss (the roll decides) | R1.6 |
| DICE-020 | Two effects set base DEF to 7 and to 5 → base DEF 5 (lowest set wins) | R1.13 |

## LOS

| ID | Case | Ref |
|---|---|---|
| LOS-001 | Open ground, 2 small bases 10" apart → LOS | R6.2 |
| LOS-002 | An obstruction taller than both volumes fully between them → no LOS | R6.3 |
| LOS-003 | A 30 mm model whose base every viewer–target line crosses, target 30 mm → blocked | R6.4 |
| LOS-004 | Same placement, target 50 mm → not blocked (intervening base smaller) | R6.4 |
| LOS-005 | A 50 mm intervening base crossed by every line, target 30 mm → blocked | R6.4 |
| LOS-006 | A unit-mate between a trooper and its target → doesn't block | R6.4 |
| LOS-007 | A knocked-down 50 mm model whose base every line crosses, target 30 mm → not blocked | R6.4 R9.1 |
| LOS-008 | A line passing over a cloud's footprint with neither model in it → blocked | R6.5 |
| LOS-009 | Target in a cloud (part of its base under it), viewer outside → LOS | R6.5 |
| LOS-010 | True Sight viewer, cloud between → LOS | R6.5 |
| LOS-011 | Elevated viewer (+2" hill), a 30 mm model on the ground mid-way and 4" from the 30 mm target → ignored | R6.6 |
| LOS-012 | Elevated viewer, a 30 mm model on the ground within 1" of the target → still blocks | R6.6 |
| LOS-013 | Range is edge to edge: centres 13" apart, two 30 mm bases (radius 0.59") → 11.82" | R6.8 |
| LOS-014 | Target at 12.01" with RNG 12 → declared, then auto-miss | R6.9 |
| LOS-015 | Stealth target at 5.0" → normal roll; at 5.01" → auto-miss | R6.10 |
| LOS-016 | Prowl model completely inside a forest, attacker 8" away → Stealth → auto-miss | R6.10 |
| LOS-017 | Prowl model in the open → no Stealth | R6.10 |
| LOS-018 | True Sight attacker vs a Stealth target at 9" → rolls normally | R6.10 |
| LOS-019 | Both models outside a forest, a 1" sliver of forest on every line between them → blocked. Viewer inside the forest, the line crosses 2.5" of forest → LOS; 3.5" → blocked | R10 |
| LOS-020 | Engaged non-Gunfighter, any ranged weapon (rifle), target = its engager → allowed; target ≠ an engager → `E_TARGET_INVALID` | R7.7 |
| LOS-021 | Engaged model that Aimed → its ranged attack gets no +2 | R7.7 R5.1 |
| LOS-022 | Engaged Gunfighter → may target a model 8" away | R7.7 |
| LOS-023 | Intervening 30 mm base: a line partly crossing it, target 30 mm → that line is blocked; a line that clears its base edge → not blocked, so LOS exists | R6.4 |
| LOS-023b | Engaged attacker shoots its own engager: Pistol → no +4 Target in Melee; rifle → +4 applies | R2 R6.11 |
| LOS-024 | Stealth 30 mm model between a viewer and a 30 mm target: viewer 6" from it → doesn't block; viewer 4" from it → blocks | R2 R6.4 |
| LOS-025 | A cloud between the viewer and a 120 mm target → not blocked | R6.5 |
| LOS-026 | Both outside a forest, a 120 mm target beyond it → not blocked | R10 |
| LOS-027 | Stationary 50 mm model whose base every line crosses, target 30 mm → blocked (only knockdown removes blocking) | R6.4 R9.3 |

## TERR (DEF modifiers and terrain)

| ID | Case | Ref |
|---|---|---|
| TERR-001 | Target completely inside a forest → +2 DEF vs ranged; partly inside → none | R6.11 R10 |
| TERR-002 | Target within 1" behind a wall → +4 DEF vs ranged | R6.11 |
| TERR-003 | Target behind a wall but 2" from it → no cover | R6.11 |
| TERR-004 | Cover and concealment both apply → +4 only | R6.11 |
| TERR-005 | Elevated target, lower attacker → +2; stacks with cover → +6 | R6.11 |
| TERR-006 | Target engaged by a third model → +4 (target in melee) | R6.11 |
| TERR-007 | Black Penny shot at an engaged target → no +4 | R6.11 |
| TERR-008 | Knocked-down target completely inside a forest → DEF 7 (5 + concealment) | R6.11 |
| TERR-009 | Alchemical Mask attacker vs a target completely inside a cloud → no concealment | R6.11 |
| TERR-010 | Melee target partly obscured by a wall → +2 DEF | R6.11 |
| TERR-011 | Melee vs a stationary target → auto-hit | R6.11 |
| TERR-012 | Hazard area: a model advances into it, out and back in during one advance, then ends its activation inside → 2 hazard rolls (one entry per advance, one end of activation) | R9.8 |
| TERR-013 | 80 mm target in melee → no +4; 80 mm target within 1" of a wall → no cover | R6.11 |
| TERR-014 | Stationary target (base DEF 5) within 1" behind a wall → DEF 9 | R6.11 R1.13 |
| TERR-015 | Aim, not engaged → +2 on every ranged attack roll that activation | R5.1 |
| TERR-016 | Spray at a target within 1" behind a wall and inside a forest → no cover, no concealment | R6.11 R7.15 |

## MOVE

| ID | Case | Ref |
|---|---|---|
| MOVE-001 | Run with SPD 6 → 11"; the Combat Action is forfeited; the activation ends | R5.1 |
| MOVE-002 | War-engine run → costs 1 focus; with 0 focus → rejected | R5.1 |
| MOVE-003 | War-engine with a crippled cortex → can't run | R3.6 |
| MOVE-004 | Crippled movement → can't run or charge; base DEF 5 | R3.6 |
| MOVE-005 | Aim while engaged → allowed, but no +2 on its ranged attacks | R5.1 |
| MOVE-006 | Model engaged at the start → run rejected | R5.6 |
| MOVE-007 | Leaving an engager's melee range in Normal Movement → the Combat Action is forfeited; no attack happens to the mover | R5.7 |
| MOVE-008 | Rough terrain entered mid-move, SPD 6 → 4" total | R5.12 |
| MOVE-009 | Starting in rough terrain, SPD 6 → 4" | R5.12 |
| MOVE-010 | Pathfinder in rough terrain → full SPD | R5.12 |
| MOVE-011 | Wall crossing with 0.5" left and a 1"-deep wall → can't cross; stops short | R5.13 |
| MOVE-012 | Unit: move Ryan 6", place Watts and Glover within 2" and in LOS → valid | R5.8 |
| MOVE-013 | Unit placement with the base edge 2.5" from the moved trooper → rejected; edge 1.9" (centre 3.08") → allowed | R5.8 |
| MOVE-014 | Unit trooper with no legal placement → destroyed | R5.8 |
| MOVE-015 | Unit run → all troopers forfeit their Combat Action | R5.9 |
| MOVE-016 | Unit advance: a trooper engaged by two enemies is placed within one's melee range only → keeps its Combat Action; placed out of both → forfeits | R5.10 |
| MOVE-017 | Push 3" into a model at 1" → stops at contact | R5.15 |
| MOVE-018 | Push out of melee range → no Combat Action forfeit (it isn't an advance) | R5.15 |
| MOVE-019 | Push off a 2" ledge → falls; knocked down; 2d6 + 12 | R5.19 |
| MOVE-020 | Fall of 4" → 3d6 + 12 | R5.19 |
| MOVE-021 | Reposition 3" after shooting → advance ≤3"; the activation ends | R5.23 |
| MOVE-022 | Reposition after a failed charge → not offered | R5.23 |
| MOVE-023 | Gatecrasher after a kill → placed completely within 5"; the activation ends | cygnar.md |
| MOVE-024 | Swift Hunter: a kill with a basic ranged attack → advance 2" | khador.md |
| MOVE-025 | Unstoppable model starts engaged and advances out of melee in Normal Movement → keeps its Combat Action | R2 R5.7 |
| MOVE-026 | Unit Reposition [3"] → each trooper advances ≤3" independently; no placement step | R5.23 |
| MOVE-027 | Fall of 5" → 4d6 + 12; a 30 mm model landed on (faller 50 mm) → knocked down, same roll | R5.19 |
| MOVE-028 | Advance path through an obstruction → `E_PATH_BLOCKED` | R5.14 |
| MOVE-029 | Thrown 30 mm lands overlapping a 30 mm model → the other model moves the shortest distance clear; equal options → seeded random | R5.21 |
| MOVE-030 | Slam d6 = 5 with the table edge 2" away → stops at the edge; no extra damage die | R5.20 |
| MOVE-031 | Unit run: the moving trooper is destroyed by a hazard before placement → the player picks another trooper and any Normal Movement option | R5.8 |
| MOVE-032 | Reposition out of an engager's melee range → no forfeit (not Normal Movement) | R5.7 |
| MOVE-033 | Placement into a hazard area → counts as entering (hazard roll) | R5.11 R9.8 |

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
| CHG-011 | Unit charge, charger moved 4": each placed trooper's first melee attack vs a model in the charger's melee range → charge attack (boosted damage); vs a model outside it → not | R5.9 |
| CHG-012 | Charge vs a knocked-down target → auto-hit; the damage is boosted | R5.3 R9.1 |
| CHG-013 | Unit charge: a placed trooper with no enemy in its melee range → forfeits its Combat Action; no ranged attack offered | R5.9 |
| CHG-014 | Successful charger → `chooseCombatAction` offers only melee initial attacks or a melee ★Attack; ranged → rejected | R5.3 |
| CHG-015 | Pathfinder charge across a wall → doesn't stop at the wall (Vilkul, QS p46) | R2 R5.2 |
| CHG-016 | Unit charge: the chosen trooper is engaged → rejected | R5.9 |
| CHG-017 | Unit charge: a trooper engaged by two enemies before placement is placed in only one's range → forfeits (all required) | R5.9 |
| CHG-018 | Charge line crosses rough terrain, non-Pathfinder → max distance drops by 2" | R5.2 R5.12 |

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
| ATK-008 | Powerful Attack: 1 focus spent → 3d6 attack and 3d6 damage; a second focus to boost either roll again → rejected; no focus spent → 2d6/2d6 (QS p40) | cygnar.md R7.18 |
| ATK-009 | Both Barrels: one shot at +4 damage; any further Dual Magelock shots → rejected | cygnar.md |
| ATK-010 | Witch Mark direct hit → that activation, spells at that model auto-hit and ignore RNG/LOS | cygnar.md |
| ATK-011 | Thunderbolt hit → push d3" before damage; a crit also knocks down | cygnar.md R7.18 |
| ATK-012 | Critical Shred crit → one extra attack vs the same model, no focus, after Beat Back and inactive triggers | khador.md |
| ATK-013 | Critical Knockdown crit → the target is knocked down before damage | khador.md |
| ATK-014 | Reciprocate: Falk missed by a ranged attack → 1 basic ranged shot back after it resolves | cygnar.md |
| ATK-015 | Armor-Piercing vs ARM 18 with Buckler +1 → effective ARM 9+1 = 10 | khador.md R1.13 |
| ATK-016 | Pipeline order: the hit trigger (push) happens before the damage roll | R7.18 |
| ATK-017 | Pipeline order: the Tough roll happens after the damage is applied, before boxed triggers | R7.18 |
| ATK-018 | Pipeline order: Evasive/Reciprocate fire after the death windows | R7.18 |
| ATK-019 | Fixture: one attack fires an active non-attack trigger (Beat Back), an inactive trigger (Evasive-style advance) and an active attack-making trigger (Critical Shred), declared in reverse order → resolved Beat Back, then the inactive trigger, then Critical Shred | R7.18 R12.4 |
| ATK-020 | Arcane attack uses AAT and the ranged DEF modifiers | R8.4 |
| ATK-021 | One attack would earn two extra attacks (two granting rules) → the controller picks one; only one extra attack is made | R7.19 |
| ATK-022 | Out-of-activation attack (Avenging Force, Reciprocate) → no `boostAttack`/`boostDamage` focus option; a focus boost action is rejected | R4.10 R7.18 |

## DMG

| ID | Case | Ref |
|---|---|---|
| DMG-001 | Model without damage boxes takes 1 → disabled → boxed → destroyed → removed | R3.9 |
| DMG-002 | Tough roll of 5 → heal 1, knocked down, stays in play | R3.9 |
| DMG-003 | Tough roll of 4 → boxed → destroyed | R3.9 |
| DMG-004 | Head Shot ranged kill on a Tough Hound → no Tough roll; RFP | cygnar.md R3.10 |
| DMG-005 | Take Down melee kill on a Tough model → no Tough roll; boxed → RFP | khador.md |
| DMG-006 | RFP → destroyed triggers skipped | R3.10 |
| DMG-007 | Eruption of Ash: a direct hit boxes the target → cloud hazard centred on it, then RFP | khador.md |
| DMG-008 | Eruption of Ash on blast damage only → no cloud (needs a direct hit) | khador.md |
| DMG-009 | Arcane Conflagration: a pistol attack boxes the target → POW 10 to models within 1", then RFP | cygnar.md |
| DMG-010 | Shield Wall Hound B2B with a unit-mate → ARM +2; alone → base ARM | khador.md |
| DMG-011 | Girded: a Hound B2B with Razor gives Razor Resistance: Blast | khador.md |
| DMG-012 | Brutal Damage applies to the direct-hit target only, not to blast | R7.9 |
| DMG-013 | Simultaneous blast kills 2 Tough models → both Tough rolls after all damage is rolled | R3.9 |
| DMG-014 | Caine heals with 1 focus in his activation → 1 box cleared | R8.2 |
| DMG-015 | Disabled model healed in the D2 window → returns to normal | R3.9 |
| DMG-016 | Pall of Ashes: a living enemy model in the cloud loses Tough | khador.md |
| DMG-017 | Leader destroyed → its war-engines become inert at once | R3.9 R8.9 |
| DMG-018 | Critical Knockdown on a Tough Hound, then lethal damage → no Tough roll (knocked down loses Tough) | R2 R3.9 |
| DMG-019 | Inert Razor: base DEF 5, melee auto-hit, no Ripper Shield +2 ARM, no melee range | R8.9 |
| DMG-020 | Ryan (multi-box trooper, QS) takes 4 damage → survives with 4 boxes filled | cygnar.md |

## GRID

| ID | Case | Ref |
|---|---|---|
| GRID-001 | Deuce, column 1, 3 damage → C1 rows 1–3 filled | R3.4 |
| GRID-002 | Column 1, 6 damage → C1 r1–4, then C2 r1–2 | R3.4 |
| GRID-003 | Column 6, 6 damage → C6 r1–4, then wraps to C1 r1–2 | R3.4 |
| GRID-004 | Fill C1 r4 + C2 r3–4 → L crippled; weapons in L roll 1 fewer attack and damage die | R3.5 R3.6 |
| GRID-005 | L crippled on Razor → Ripper Shield loses +2 ARM (ARM 19) | R3.6 khador.md |
| GRID-006 | M crippled → base DEF 5; no charge or slam | R3.6 |
| GRID-007 | C crippled → focus set to 0; allocation to it is rejected; Power up skipped | R3.6 R4.5 |
| GRID-008 | Heal one L box → L un-crippled | R3.5 |
| GRID-009 | 30 damage → disabled (no Tough on war-engines) → destroyed | R3.9 |
| GRID-010 | Marksman (Lazarenko) picks column 4 → filling starts at C4 | R3.4 khador.md |
| GRID-011 | Grid data validates: heights 4/5/6/6/5/4, total 30, systems L3 M3 C3 R3 | cygnar.md |
| GRID-012 | Razor R crippled → Slug Cannon and the R grenade launcher roll 1 fewer die; the L launcher is unaffected (QS p42) | khador.md |
| GRID-013 | Heal on a grid: the healer picks any filled boxes | R3.8 |
| GRID-014 | M crippled mid-charge (hazard damage) → stops; activation ends | R3.6 |

## PWR

| ID | Case | Ref |
|---|---|---|
| PWR-001 | Power attack costs a war-engine 1 focus | R7.10 |
| PWR-002 | Headbutt vs a 30 mm target from a 50 mm attacker → POW 14 | R7.10 |
| PWR-003 | Headbutt at a larger base → rejected | R7.11 |
| PWR-004 | Headbutt hit → knocked down, then damage | R7.11 |
| PWR-005 | Slam with 3"+ moved, hit → d6" slam, knocked down, damage | R7.12 |
| PWR-006 | Slam with 2" moved, hit → damage only, no movement, no knockdown | R7.12 |
| PWR-007 | Slam at a larger base → −2 to hit; distance halved | R7.12 |
| PWR-008 | Slam that doesn't reach the target → activation ends | R7.12 |
| PWR-009 | Slammed into a wall → +1 damage die | R5.16 |
| PWR-010 | Slammed 30 mm model into another 30 mm → stops (equal base), +1 die; the other gets collateral + knockdown | R5.16 |
| PWR-011 | Slammed 50 mm model through a 30 mm → passes through; the 30 mm is knocked down and takes collateral | R5.16 |
| PWR-012 | Collateral can't be boosted; Power Field may still reduce it | R5.18 R7.18 |
| PWR-013 | Throw with Deuce's Crescent Blade (Throw PA, RNG 1) vs 30 mm at 1" → d6" away; at 1.1" → rejected | R7.13 |
| PWR-014 | Throw with the weapon's system crippled → rejected | R7.13 |
| PWR-015 | Trample while engaged → allowed; no disengage forfeit | R7.14 |
| PWR-016 | Trample passes through two 30 mm enemies → two simultaneous attack rolls | R7.14 |
| PWR-017 | Momentum: a Glover shot directly hits a 30 mm → slam d3", collateral at the weapon's POW | cygnar.md |
| PWR-018 | *retired*: Unstoppable is not knockdown immunity (see MOVE-025) | R2 |
| PWR-019 | Thrown 40 mm passes over a 30 mm (no contact, unharmed) and hits a 50 mm → stops, +1 die; the 50 mm is unharmed and stays standing | R5.17 |
| PWR-020 | Throw with Deuce's Crescent Blade → its Magical quality and other weapon rules don't apply (POW 12/14 non-magical) | R7.10 |
| PWR-021 | Slam declared at a model that was out of LOS at the start of Normal Movement → rejected | R7.12 |

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
| AOE-008 | Each blast roll is boosted separately, 1 focus each | R7.9 R1.8 |
| AOE-009 | Arcing Fire grenade over an intervening model → allowed | khador.md |
| AOE-010 | Mage Storm: both Ryan shots hit the same model → a cloud hazard may be centred on it | cygnar.md |
| AOE-011 | AOE direct hit on a 120 mm target → no other model takes blast | R7.9 |
| AOE-012 | Targeting Flare placed over a Prowl model in a cloud → the model loses Stealth and the cloud doesn't block LOS to it; the flare itself blocks nothing | khador.md R6.5 |

## SPR

| ID | Case | Ref |
|---|---|---|
| SPR-001 | SP 8 line through the target centre; 3 models crossed → 3 attack rolls | R7.15 |
| SPR-002 | Falk's Scattergun ROF 1 (QS) → one spray per Combat Action | R7.15 cygnar.md |
| SPR-003 | Spray at a Prowl/Stealth target 7" away → rolls normally | R7.15 |
| SPR-004 | Spray ignores cover and concealment | R7.15 |
| SPR-005 | A model completely blocked by an obstruction → excluded | R7.15 |
| SPR-006 | A cloud on the line → ignored; the models behind are still attacked | R7.15 |
| SPR-007 | Every hit is a direct hit; Incendiary sets fire on each | R7.15 |
| SPR-008 | Spray at a 30 mm target in melee → +4 Target in Melee applies | R7.15 |

## FOC

| ID | Case | Ref |
|---|---|---|
| FOC-001 | Caine starts the game with 6 focus | R11.7 |
| FOC-002 | Caine at 8 (from an effect) → trimmed to 6 in Maintenance | R4.1 |
| FOC-003 | Power up: Deuce within CTRL 12 → +1 | R4.5 |
| FOC-004 | Allocate 3 to Deuce after Power up (1) → only 2 allowed (cap 3) | R4.6 |
| FOC-005 | Allocate to a war-engine out of CTRL → rejected | R4.6 |
| FOC-006 | Upkeep paid → the spell stays; unpaid → it expires | R4.7 |
| FOC-007 | Caine knocked down → shakes in Control for 1 of his focus → stands | R4.8 |
| FOC-008 | Power Field: 9 incoming damage, spend 1 → 4 | R7.18 |
| FOC-009 | Power Field: 4 incoming, spend 1 → 0 (minimum 0) | R7.18 |
| FOC-010 | Power Field: 2 focus on one instance → rejected | R7.18 |
| FOC-011 | Accumulator: Deuce starts its activation within 3" of Caine → +1 focus | R8.10 |
| FOC-012 | Accumulator at 3 focus → stays at 3 (cap) | R8.10 |
| FOC-013 | Disruption → focus 0 and can't gain any for one round | R9.4 |
| FOC-014 | Feat used twice → second rejected | R8.8 |
| FOC-015 | Feat mid-movement → rejected | R4.10 |
| FOC-016 | Deuce knocked down, holds 1 focus in Control → spends its own focus → stands; Caine can't pay for it | R4.8 |
| FOC-017 | Power Field reduces damage to 0 → "when damaged" triggers still fire (e.g. Avenging Force condition) | R3.9 R7.18 |
| FOC-018 | Caster spending focus in the opponent's turn other than Power Field → rejected | R4.10 R8.1 |

## SPL

| ID | Case | Ref |
|---|---|---|
| SPL-001 | Cast with COST > current focus → rejected | R8.3 |
| SPL-002 | Spell mid-attack (between dice) → rejected | R4.10 |
| SPL-003 | Offensive spell: 2d6 + AAT vs DEF, with ranged modifiers | R8.4 |
| SPL-004 | Offensive spell vs Stealth at 6" → auto-miss | R6.10 |
| SPL-005 | A targeted spell without LOS → rejected (unless Witch Mark) | R8.5 |
| SPL-006 | Out of RNG: an offensive spell → auto-miss; a non-offensive spell → cast, COST paid, no effect | R8.5 |
| SPL-007 | A second friendly upkeep on the same model → replaces the first | R8.6 |
| SPL-008 | Caster destroyed → its upkeeps end | R8.6 |
| SPL-009 | Channel through a non-Arc-Node → rejected | R8.7 |
| SPL-010 | Channel a SELF spell → rejected | R8.7 |
| SPL-011 | Channel through an engaged node → rejected | R8.7 |
| SPL-012 | Engaged caster casts an offensive spell at a model that isn't engaging it → allowed (R7.7 is ranged only) | R8.4 |
| SPL-013 | Vilkul recasts Superiority on another target → the first casting ends when COST is paid | R8.6 |
| SPL-014 | An enemy offensive upkeep that misses → the target's existing enemy upkeep stays | R8.6 |
| SPL-015 | Caine casts Deflection (3 focus): friendly models in CTRL get +2 DEF vs ranged and arcane until his next turn; not vs melee (QS p42, p46) | cygnar.md |

## COND

| ID | Case | Ref |
|---|---|---|
| COND-001 | Knocked down → base DEF 5; no melee range; can't engage | R9.1 |
| COND-002 | Knocked down model's activation: forfeit movement to stand → may attack | R9.2 |
| COND-003 | Knocked down: forfeit the Combat Action to stand → may advance, not run or charge | R9.2 |
| COND-004 | Rise: Vilkul knocked down at the start of Maintenance → stands | R4.3 khador.md |
| COND-005 | Fire continuous: Maintenance roll 2 → expires, no damage | R4.2 |
| COND-006 | Fire continuous: roll 4 → POW 12 fire roll | R4.2 |
| COND-007 | Incendiary hit on a Resistance: Fire Hound → no Fire continuous effect | R9.5 |
| COND-008 | A cloud lasting one round placed in P1's turn → still there in P2's turn; gone at the start of P1's next turn | R12.3 |
| COND-009 | A "one turn" effect (Shadow Fire) → gone at the end of the current turn | R12.3 |
| COND-010 | A model completely inside a cloud → concealment; partly inside → none | R9.7 |
| COND-011 | Pall of Ashes: d3+3 clouds, all completely within CTRL | khador.md |
| COND-012 | Pall of Ashes: an enemy living model inside → −2 DEF, −2 attack | khador.md |
| COND-013 | Knocked-down model hit by another knockdown → no change; it may still stand next activation | R9.1 |
| COND-014 | Knocked-down caster → castSpell and useFeat rejected (`E_KNOCKED_DOWN`) | R9.1 |

## SCN

| ID | Case | Ref |
|---|---|---|
| SCN-001 | Recon list of 31 points → invalid | R11.1 |
| SCN-002 | List without a war-engine → invalid | R11.1 |
| SCN-003 | Both starter lists total 30 → valid | R11.1 |
| SCN-004 | S1 deployment: P1 model at z = −11.5 → rejected; Advance Deployment at z = −9.1 → allowed | S1 |
| SCN-005 | Unit troopers deployed 3.5" apart → rejected | R11.5 |
| SCN-006 | Ambush placement in round 1 → rejected | R11.6 |
| SCN-007 | Ambush entry → that turn the model must forfeit its Normal Movement or its Combat Action | R11.6 |
| SCN-008 | `scn-test-sr`: no scoring at the end of P1 R1, P2 R1 or P1 R2 | V1.2 |
| SCN-009 | `scn-test-sr`: first scoring at the end of P2 R2. S1: first scoring at the end of P1 R1 | V1.2 |
| SCN-010 | Both players score at every scoring point (S1 end of P2 R1: both walls held → 1 VP each) | V1.2 |
| SCN-011 | S1: W1 with 2 friendly models within 2" and no enemy within 2" → 1 VP | S1 |
| SCN-012 | S1: W1 held, but one enemy model within 2" → contested; no VP. Enemy at 2.5" → not contested | S1 |
| SCN-013 | `scn-test-sr`: an enemy Leader within 3" of the 50 mm objective doesn't contest | V2.1 |
| SCN-014 | S1: a friendly Leader + 1 trooper within 2" → holds | S1 |
| SCN-015 | Lead by 3 at the end of your own turn → no win | V1.3 |
| SCN-016 | Lead by 3 at the end of the opponent's turn → win | V1.3 |
| SCN-017 | `scn-test-sr` Kill Box: Leader completely within 12" of its own edge at the end of its round-2 turn → opponent +2 | V1.7 |
| SCN-018 | Kill Box with the base straddling the 12" line → not applied (completely within required) | V1.7 |
| SCN-019 | Assassination mid-activation → the game ends at once | V1.1 |
| SCN-020 | Both Leaders boxed by one simultaneous blast → game ends; VP decide, then presence | V1.1 V1.5 |
| SCN-021 | VP tie after round 7 → scenario presence (Leader = 10) decides | V1.5 |
| SCN-022 | Presence tie → draw (unsourced) | V1.6 |
| SCN-023 | 40 mm objective: 2 of 3 troopers within 3" → no; all 3 remaining → yes | V2.2 |
| SCN-024 | Ashwall Divide layout loads; point symmetry about the origin holds for every element | S1 |
| SCN-025 | Roll-off winner chooses second player → the winner (second player) picks the edge | R11.4 |
| SCN-026 | `scn-test-sr` scenario terrain: a lone friendly solo in the forest → secured; a lone trooper → not (needs 2) | V2.4 |
| SCN-027 | S1: an enemy Leader alone within 2" of a held wall → contests | S1 |
| SCN-028 | Knocked-down war-engine within 3" of the 50 mm objective → secures it | V2 |
| SCN-029 | Deployment order: P1 normal, P2 normal, P1 Advance Deployment, P2 Advance Deployment, then Prey choice | R11.5 |

## VICT

| ID | Case | Ref |
|---|---|---|
| VICT-001 | End of round 7 (P2's turn) → game over; higher VP wins (`roundLimit`) | V1.4 |
| VICT-002 | Round 7 ends with equal VP → presence tiebreak (`tiebreakPresence`) | V1.5 |

## ACT

| ID | Case | Ref |
|---|---|---|
| ACT-001 | `endTurn` while a model or unit is unactivated → rejected | R4.10 |
| ACT-002 | `castSpell` at `activation.start`, before a required forfeit (Ambush entry turn) is resolved → rejected | R4.10 |
| ACT-003 | Any-time actions offered at `chooseMovement`, `chooseCombatAction`, `chooseAttack` (before declaring) and `combat.end` only; never inside a trigger window or between an attack and its generated attack | R4.10 00 §5 |
| ACT-004 | createGame resolves the roll-off itself: first pending is `chooseTurnOrder`, events include `RollOffWon` | R11.4 00 §5 |

## LINT

| ID | Case | Ref |
|---|---|---|
| LINT-001 | Data containing key `STR` → `validate-data` error | 20 §2 |
| LINT-002 | Data containing `facing`, `freeStrike`, `template`, `scatter` or `deviation` → error | 20 §2 |
| LINT-003 | Melee weapon with `rng` 0.5 → schema error | 20 §5 |
| LINT-004 | `ability` with `{code}` not in the registry → error | 20 §2 |

## FAC (faction abilities without a core case)

| ID | Case | Ref |
|---|---|---|
| FAC-CYG-001 | Caine hit by an enemy ranged attack and survives → after the attack resolves he may advance 2" (inactive tier) | cygnar.md |
| FAC-CYG-002 | Deuce (Field Marshal [Evasive]) hit by a ranged attack → may advance 2" | cygnar.md |
| FAC-CYG-003 | Falk within 10" of Caine kills a Tough Hound with a ranged attack → no Tough roll (Head Shot via Leadership) | cygnar.md |
| FAC-CYG-004 | A Black 13th trooper within 10" of Falk is missed by a ranged attack → Reciprocate shot | cygnar.md |
| FAC-CYG-005 | Falk destroys an enemy with a ranged attack → at activation end may full advance (not after running) | cygnar.md |
| FAC-CYG-006 | Prey = Razor: Watts' attack and damage get +2 vs Razor, not vs Lazarenko; Razor destroyed → new prey chosen | cygnar.md |
| FAC-CYG-007 | Glover in play → every Black 13th trooper ignores clouds for LOS; Glover destroyed → they lose it | cygnar.md |
| FAC-CYG-008 | Heart Seeker damage roll 3 dice showing 1,4,5 → keeps 4,5 | cygnar.md R1.11 |
| FAC-CYG-009 | Beat Back hit → target pushed 1" away, then the attacker may advance 1" toward it (QS p40) | cygnar.md |
| FAC-CYG-010 | Decrepitation vs Razor (construct) → +1 damage die; vs Vilkul → none | cygnar.md |
| FAC-CYG-011 | Blast attack type → the cannon shot is AOE 2, POW 12/6 | cygnar.md |
| FAC-CYG-012 | Banish damages a Hound → it is placed completely within 1" of its spot; vs Vilkul (Leader) → no effect | cygnar.md |
| FAC-KHA-001 | Razor in Vilkul's battlegroup completely inside a forest → Stealth (Prowl via Field Marshal) | khador.md |
| FAC-KHA-002 | Vilkul vs a target completely inside a forest → no concealment | khador.md |
| FAC-KHA-003 | Hound B2B with Razor hit by a Critical Knockdown → not knocked down (Anchor) | khador.md |
| FAC-KHA-004 | Ward Breaker vs a model with a spell DEF bonus (Deflection) → the bonus is ignored | khador.md |
| FAC-KHA-005 | Slug Cannon hits Deuce (50 mm) → knocked down before damage; hits a 30 mm → slammed d3" with POW 16 collateral | khador.md |
| FAC-KHA-006 | Siege Weapon vs a 120 mm target → +1 damage die | khador.md |
| FAC-KHA-007 | Volume Fire vs Deuce (50 mm) → +2 attack and damage | khador.md |
| FAC-KHA-008 | Superiority on Razor → SPD 7, MAT 8, DEF 13; a Thunderbolt crit doesn't knock it down | khador.md |
| FAC-KHA-009 | Avenging Force in play, Lazarenko damaged in the Cygnar turn → at the start of Khador Maintenance Razor advances 3" and makes one basic attack with no focus spending | khador.md |

## GOLD

| ID | Case | Ref |
|---|---|---|
| GOLD-001 | **Quick Start worked turns (QS pp36–46), replayed on `scn-qs-demo` with bundle `qs-2025`.** The QS prints no coordinates, so the test authors positions that satisfy the narrative (who is in range, behind which wall, inside which cloud) and feeds the printed dice. Assert: Pall of Ashes d3 = 1 → 4 clouds; Vilkul focus 6→4→2; Razor run costs 1; Lazarenko 2+3+7 = 12 vs DEF 13 miss, blast 1+6+7 = 14 vs ARM 19 → 0; K 1 VP; Deuce Accumulator → 3 focus; Powerful Attack 1+3+4+7 = 15 hit, push 1", follow 1", damage 2+2+3+14 = 21 vs 21 → 0; Reload; 4+5+6+7 = 22 hit, 1+2+5+6+14 = 28 → 7 damage, column 5 → C5 full (5) then C6 r1–2; Caine Deflection 3 focus; Falk 5+6+7−2 = 16 vs 16 hit, 3+4+12 = 19 − 15 = 4 → Power Field → 0, Vilkul focus 1; Ryan 4+4+7 = 15 crit, push 1", knockdown, 1+2+10 = 13 vs 14 → 0; Glover Both Barrels 1+5+7 = 13 vs DEF 5 hit, 2+2+3+10+4 = 21 − 14 → 7; Watts 2+5+7+2 = 16 hit, 3+4+6+10+2 = 25 − 21 → 4, column 6 r3–4 then C1 r1–2 → R crippled; end of turn C 1 / K 2. Round 2: Avenging Force advance 3" + Slug Cannon miss; Razor 5+5+6 = 16 vs 15 hit, Deuce knocked down, 2+6+16 = 24 − 19 = 5 → column 3; grenade (L) 3+6+6+6 = 21 vs 21 hit, Ryan 4, Glover 1, Watts 0; Vilkul charge across the wall (Pathfinder), 1,1 miss, extra attack + boost 2+5+5+7 = 19 hit, 1+4+4+13 = 22 − 12 = 10 → Falk destroyed | all |

## TER (M8: terrain boards)

Spec: `70-terrain-boards.md`. Pieces, boards and layouts come from `src/data/terrain/` and must match
`tools/terrain-catalog.json`. G-numbers are the gaps in 70 §A. TER-113 and TER-114 stay `todo` until G1 and G2
are fixed.

| ID | Case | Ref |
|---|---|---|
| TER-101 | Every catalog entry has a data piece with the same id, rulesType, footprint (vertex for vertex), height and `mesh` = slug; every board piece is in the catalog; the 37 pieces pass `terrain.schema.json` | 70 §B |
| TER-102 | validate-data: an `obstacle` with height ≥ 1 or an `obstruction`/`building` with height < 1 is rejected; all 37 pieces pass | R5.13 R5.14 70 G5 |
| TER-103 | Every board layout is point-symmetric: each piece has a twin of the same terrain at (−x, −z, rot + 180°), or sits at the origin with a half-turn-symmetric footprint | 70 §D.1 |
| TER-104 | Every 36" board layout: footprint gaps ≥ 3", \|x\| ≤ 15, \|z\| ≤ 11, impassable \|z\| ≤ 8, 5–8 pieces (exact polygons; circles as 48-gons) | 70 §D.3–5 |
| TER-105 | Every 36" board layout has `w1` (−6, −4) and `w2` (6, 4) at rot 0 with an obstacle `rect 4 × 0.75`, height 0.75; on `scn-ashwall-divide` with any board layout, `query.control` matches `layout.ashwall-divide` for the same model positions (20 seeded positions near each wall) | 70 §D.2 S1 |
| TER-106 | 48" scale-up: `scaleLayout48(layout)` keeps the symmetry, gaps ≥ 3", impassable \|z\| ≤ 10.67 and all \|z\| ≤ 16 for all 15 layouts | 70 §D |
| TER-107 | `pickBattlefield(seed, scn-ashwall-divide, 'random')` is deterministic (same seed → same board and layout), and over seeds `s0..s999` each board is picked 160–240 times and every layout of a board at least once | 70 §E.1–3 |
| TER-108 | `?board=village` (or `board.village`) forces that board; `?board=random`, a missing value or an unknown value use the seed (an unknown value logs one warning); `?layout=layout.bog-2` with board bog is honoured; an ineligible `?layout=` is ignored | 70 §E.3, E.6 |
| TER-109 | `scn-qs-demo` always gets `layout.ashwall-divide` on every board; GOLD-001 passes with each board selected | 70 §E.3 GOLD-001 |
| TER-110 | Save on board ruins, layout `layout.ruins-2`, then load → same board and layout; a bare engine SaveFile with `setup.layout = layout.outpost-1` loads as the outpost board; replaying the save gives the same final state | 70 §E.5 |
| TER-111 | `createGame` on `scn-ashwall-divide` with a layout that lacks `w1` → `E_BAD_SETUP` (after the G6 fix); the selection code never offers such a layout | 70 G6 |
| TER-112 | `npm run sim` on each of the 15 board layouts (4 games each, normal vs normal): every game ends, 0 invariant violations, 0 stalls, 0 rejected AI actions | 70 §D, 60 §2 |
| TER-113 | Molten Blight Pool: a model advances into it → one POW 10 fire damage roll; out and back in during the same advance → no second roll; ends its activation inside → one more roll; Resistance: Fire → no damage; placed into it → one roll (todo until G1) | R9.8 70 G1 |
| TER-114 | Zig-Zag Trench behaves per the trench ruling in `docs/needs-rules-check.md` (todo until G2 is ruled and built) | 70 G2 |
| TER-115 | Target within 1" behind the Split-Rail Fence → concealment +2, not cover; the same spot behind the Fieldstone Wall → cover +4 | R6.11 R10 |
| TER-116 | 30 mm model completely on the Mossy Hummock vs a ground attacker → elevation +2; the same model half on it → no elevation; walking off it → no fall | R6.6 R5.19 R10 |
| TER-117 | Pine Stand: viewer inside, line crosses 2.5" of forest → LOS; 3.5" → blocked; both ends outside, line clips 0.5" of forest → blocked; a 120 mm target behind it → LOS | R10 |
| TER-118 | 40 mm model completely inside Toppled Masonry → cover +4 vs ranged; partly inside → none; advancing into it → −2" | R10 R5.12 |
| TER-119 | Advance that enters the Frozen Pond (rough) → whole advance −2" (min 1"); Pathfinder → no penalty | R5.12 |
| TER-120 | Path through the Crooked Stilt Hut → `E_PATH_BLOCKED`; placing a base overlapping it → `E_PLACEMENT`; a charge whose line meets the Iron Thorn Palisade stops on contact | R5.2 R5.11 R5.14 |
| TER-121 | Client fit: for each of the 37 GLBs, the fitted bbox is within the footprint bbox ±5% (x, z) and `visualHeight` ±5% (y); each GLB ≤ 15k triangles and ≤ 1 MB; a missing GLB draws the procedural fallback with no page error | 70 §F |
| TER-122 | Each board: the 3 mat maps exist at 2048 × 2048; the wood surround and brass trim render; the board's key, ambient and fog colours are applied; Low graphics drops the normal and roughness maps | 70 §C, §F |
| TER-123 | `art.spec` on each board: all terrain GLBs load, no console errors, mean frame time ≤ M5 baseline + 3 ms | 70 §F |
| TER-124 | IP lint: no board or piece name, prose or catalog prompt contains a faction, product or company name from the denylist in `tools/validate-data.ts`; catalog prompts are ≤ 60 words | 70 IP rule |
