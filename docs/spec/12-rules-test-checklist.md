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
| FAC-CYG-013 | Smite (★Attack): the model hit is slammed d6" away, half if its base is larger, then knocked down | cygnar.md (M12 skirmish) |
| FAC-CYG-013a | card values of the three new models | cygnar.md (M12 skirmish) |
| FAC-CYG-014 | Repulsor Field: an enemy that hits an Assailer in melee is pushed 1" directly away from it | cygnar.md (M12 skirmish) |
| FAC-CYG-015 | Plasma Nimbus: a Vane hit in melee may fry the attacker with a POW 10 electrical roll | cygnar.md (M12 skirmish) |
| FAC-CYG-016 | Resistance: Electricity, Shield Wall and Critical Armor-Piercing on the new models | cygnar.md (M12 skirmish) |
| FAC-CYG-017 | Shield Guard (Courser): a ranged direct hit on a friend within 3" lands on the Courser instead | cygnar.md (M12 skirmish) |
| FAC-CYG-018 | Galvanic Capacitor: the Vanes pick distinct effects; Lightning Wreath gives a friend Electro Leap | cygnar.md (M12 skirmish) |
| FAC-KHA-001 | Razor in Vilkul's battlegroup completely inside a forest → Stealth (Prowl via Field Marshal) | khador.md |
| FAC-KHA-002 | Vilkul vs a target completely inside a forest → no concealment | khador.md |
| FAC-KHA-003 | Hound B2B with Razor hit by a Critical Knockdown → not knocked down (Anchor) | khador.md |
| FAC-KHA-004 | Ward Breaker vs a model with a spell DEF bonus (Deflection) → the bonus is ignored | khador.md |
| FAC-KHA-005 | Slug Cannon hits Deuce (50 mm) → knocked down before damage; hits a 30 mm → slammed d3" with POW 16 collateral | khador.md |
| FAC-KHA-006 | Siege Weapon vs a 120 mm target → +1 damage die | khador.md |
| FAC-KHA-007 | Volume Fire vs Deuce (50 mm) → +2 attack and damage | khador.md |
| FAC-KHA-008 | Superiority on Razor → SPD 7, MAT 8, DEF 13; a Thunderbolt crit doesn't knock it down | khador.md |
| FAC-KHA-009 | Avenging Force in play, Lazarenko damaged in the Cygnar turn → at the start of Khador Maintenance Razor advances 3" and makes one basic attack with no focus spending | khador.md |
| FAC-KHA-020 | Accuracy: the Dire Wolf shoots at RAT 5 while its Head works and RAT 4 once the Head is crippled | khador.md (M12 skirmish) |
| FAC-KHA-021 | Volley Fire: a Heavy Chain Gun attack roll against a warrior model is boosted for free and no boost is offered | khador.md (M12 skirmish) |
| FAC-KHA-021b | Volley Fire is skipped against a battle engine (not a warrior model), and so is the Cannon (no such rule) | khador.md (M12 skirmish) |
| FAC-KHA-022 | Sniper: a Sniper hit on a high-ARM warjack inflicts exactly 1 point instead of a roll that cannot beat ARM (loop seeds for a hit) | khador.md (M12 skirmish) |
| FAC-KHA-023 | Sniper rule seams: 1 point replaces the roll on a one-box target or below 1 expected damage; Tough is denied on a ranged boxing | khador.md (M12 skirmish) |
| FAC-KHA-024 | Magic Ability: an Arkanist offers Razor Wind as a star attack and resolves it as an arcane attack at AAT 4 | khador.md (M12 skirmish) |
| FAC-KHA-025 | Empower: an Arkanist action gives the nearest-in-range warjack with the least focus 1 focus and ends its Disruption | khador.md (M12 skirmish) |
| FAC-KHA-026 | Sigil of Power: the friendly unit nearest an enemy makes magical damage for the turn; others do not | khador.md (M12 skirmish) |
| FAC-KHA-027 | Razor Wind critical: a crit on a warjack fills the unmarked boxes of the last column damaged; no crit, no fill | khador.md (M12 skirmish) |

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

## M9 warlocks and fury (FURY)

Spec: `81-warlocks-fury.md` (`Ref` = its F-ids, FZ steps and T steps). Fixtures need one fury list: a warlock
(ARC 6, CTRL 12) and beasts with spiral branches 6/3/7/5/6/3 (Mind 1–2, Body 3–4, Spirit 5–6) unless a case says
otherwise. FURY-031 stays `todo` until non-attack damage can raise a transfer prompt.

| ID | Case | Ref |
|---|---|---|
| FURY-001 | Game start: warlock ARC 6 holds 6 fury (`FuryChanged reason 'start'`), its beasts 0, `focus` 0 on all fury models | F1.4 |
| FURY-002 | Maintenance: warlock at 8 fury with ARC 6 drops to 6 (`trim`); a beast holding 3 keeps 3 | F2.4 |
| FURY-003 | Leech cap: ARC 7, warlock at 2, two beasts in CTRL with 3 each → `leech {3,3}` rejected `E_FURY_CAP`; `{3,2}` accepted → warlock 7, beasts 0 and 1 | F4.1 F4.3 |
| FURY-004 | Leech from a beast outside CTRL → `E_OUT_OF_CTRL`; from a beast of another battlegroup or a wild beast → `E_TARGET_INVALID` | F4.4 |
| FURY-005 | Self-leech 2 → warlock gains 2 and suffers 2 damage points; no `transferDamage` is raised for that damage | F4.2 F8 T1 |
| FURY-006 | Self-leech that fills the warlock's last box → disabled; a Tough warlock rolls Tough in its death window | F4.2 F10.6 |
| FURY-007 | Spirit Bond: one destroyed 50 mm beast and one destroyed 30 mm beast of this battlegroup → +1 fury after leeching, auto-applied (`FuryLeeched.spiritBond = 1`), never above ARC | F4.5 F4.6 |
| FURY-008 | Spirit Bond: a beast that returned to play no longer counts; a beast that was wild when destroyed never counts | F4.5 F9.6 |
| FURY-009 | Order: a beast at 4 fury leeched to 0 in C2 makes no threshold roll in C6; upkeep (C5) is paid after leeching | F3 C2 C5 C6 |
| FURY-010 | Upkeep with fury: warlock at 1 fury with two upkeeps → `payUpkeep` keeping both rejected `E_INSUFFICIENT_FURY`; keeping one spends 1, the other expires (`upkeepDropped`) | F6.1 |
| FURY-011 | Threshold: THR 9, fury 3, rolls 3,3 → total 9 → passes; rolls 3,4 → total 10 → frenzies (`ThresholdChecked.frenzied`) | F7 |
| FURY-012 | A Construct beast with fury makes no threshold roll | F1.7 F7.1 |
| FURY-013 | Frenzy target: a friendly solo 2" away and an enemy 3" away, both in LOS → the beast charges and attacks the friendly solo | F7 FZ3 FZ5 |
| FURY-014 | Frenzy tie: two models at the same distance → one `frenzyTie` roll picks; `Frenzied.tiedIds` lists both; replay gives the same pick | F7 FZ3 F7.b |
| FURY-015 | Frenzy with no model in LOS → `Frenzied reason 'noTarget'`, no movement, `adjustFury` raised, and the beast is not offered in this turn's `chooseActivation` | FZ3 FZ7 F7.c |
| FURY-016 | Frenzy while knocked down and engaged: stands up with no fury gained, then charges the closest model even though engaged | FZ2 FZ4 |
| FURY-017 | Frenzy attack uses the highest-POW melee weapon that reaches; its attack roll is boosted for free (`RollBoosted source 'frenzy'`); moved 4" → damage boosted (charge attack); moved 2" → damage not boosted | FZ5 |
| FURY-018 | Frenzy activation: no additional-attack, force, animus or special-action option is ever offered; the activation ends after the one attack; the beast cannot activate again this turn | FZ5 FZ6 |
| FURY-019 | Frenzy end: `adjustFury` lists deltas 0..−3 for a beast at 3; choosing −2 leaves 1 (`FrenzyEnded.vented = 2`), then the next beast's threshold check runs | FZ7 F3.b |
| FURY-020 | A beast outside its warlock's CTRL is offered no run, charge, slam or trample; `chooseMovement run` → `E_OUT_OF_CTRL` | F5 gate 3, F5.1 |
| FURY-021 | Cap: beast FURY 3 at 3 fury → `boostAttack` rejected `E_FURY_CAP`; at 2 → boost accepted, fury 3, `BeastForced {purpose:'boostAttack', gained:1}` | F5 gate 5, F5.3 |
| FURY-022 | Spirit crippled: every force rejected `E_CRIPPLED`; the beast can still advance and make its initial attacks | F5 gate 4, F10.5 |
| FURY-023 | Beast forced for two additional melee attacks → two extra attacks, +2 fury; never a ranged additional attack without a card rule | F5.2 |
| FURY-024 | Warlock: 1 fury per boost and per additional melee attack in its activation; an out-of-activation attack by the warlock offers no fury spend | F2.1 F2.2 |
| FURY-025 | Beast power attacks: headbutt costs +1 fury at `chooseCombatAction`; slam costs +1 once when declared (not again for the movement); with Mind crippled neither is offered | F5.4 F5.b F10.5 |
| FURY-026 | Rile: FURY 4 beast at 1 → `adjustFury +2` → 3; `+4` rejected `E_FURY_CAP`; before a run the AT sample offers rile `room` and `room − 1` | F5.7 F5.a |
| FURY-027 | Shed: warlock at 5 → `adjustFury −3` → 2 (`reason 'shed'`); `−6` rejected | F2.3 |
| FURY-028 | Beast forced animus COST 2 → +2 fury, `SpellCast.forced`; a second animus cast that activation → `E_ALREADY_USED`; a cast that would pass FURY → `E_FURY_CAP` | F12.3 |
| FURY-029 | Warlock casts a battlegroup beast's animus while the beast is in CTRL (pays COST in fury); with the beast outside CTRL the animus is not offered | F12.2 |
| FURY-030 | One friendly animus per model: a second friendly animus affecting the same model replaces the first; an enemy animus does not | F12.4 |
| FURY-031 | Continuous fire damage to a warlock in Maintenance raises `transferDamage` (todo until F8.c is lifted) | F8.c |
| FURY-032 | Transfer: warlock with 1 unmarked box takes 10 points; transfer to a beast with 8 unmarked → beast marks 8 (branch rolled), 2 overflow hit the warlock with no second prompt, warlock disabled; `DamageTransferred {absorbed:8, overflow:2}` | F8 T4–T6 |
| FURY-033 | A beast at fury = FURY is not a transfer candidate; a forged `transferDamage` to it → `E_FURY_CAP` | F8 T2 |
| FURY-034 | No transfer prompt when the warlock has 0 fury or the instance deals 0 points | F8 T1 |
| FURY-035 | A beast destroyed by transferred damage is not reaved (fury lost); next Control it counts for Spirit Bond | F8.3 F9.3 F4.5 |
| FURY-036 | After a transfer the warlock still counts as damaged: its "when damaged" trigger fires once; the beast's own "when damaged" trigger fires too | F8 T7 |
| FURY-037 | Transfer onto a Tough beast that fills its spiral: beast rolls Tough (5 → survives, knocked down); the overflow computed before marking still goes to the warlock; death windows run beast then warlock | F8.1 F8.a |
| FURY-038 | Reave: a beast with 3 fury in CTRL destroyed by an enemy attack → warlock +3 (auto, `FuryReaved`); at ARC 6 with 5 fury → +1, `lost: 2` | F9.1 F9.2 F9.5 F12.a |
| FURY-039 | No reave when the beast was destroyed by a friendly frenzy attack or outside CTRL: its fury is lost (`FuryChanged reason 'lose'`) | F9.3 F9.4 |
| FURY-040 | Spiral fill: branches 6/3/7/5/6/3, branch 2 already has 1 mark, branch roll 2, 5 points → 2 boxes in branch 2 (outer first), then 3 in branch 3 from its outermost box; a 6 on a full branch 6 wraps to branch 1 | F10.2 |
| FURY-041 | All Spirit boxes marked → `AspectCrippled spirit` and `SystemCrippled 's'`; healing one Spirit box → `AspectRestored spirit` | F10.4 B.1 |
| FURY-042 | Crippled Body: a 2d6 damage roll becomes 1d6, boosted 3d6 becomes 2d6. Crippled Mind: attack roll −1 die; power attacks and ★Attacks not offered | F10.5 |
| FURY-043 | "Suffers 2 damage to Mind" → the lowest-numbered branch with an unmarked Mind box, outermost Mind boxes first | F10.3 |
| FURY-044 | Warlock destroyed: each beast of its battlegroup becomes wild (`BeastWild`, fury 0, `inert`), its upkeeps expire; wild beasts don't activate, have base DEF 5, are auto-hit in melee and neither secure nor contest scenario elements | F11.1 F11.2 F11.4 |
| FURY-045 | Take control: a friendly same-Faction warlock within 1" pays 1 fury → the beast joins its battlegroup and forfeits its Combat Action this turn; another Faction's warlock → `E_TARGET_INVALID`; 1.5" away → `E_OUT_OF_RANGE` | F11.3 |
| FURY-046 | Heal: warlock spends 2 fury on a beast in CTRL → 2 boxes removed, the default order restores a crippled Spirit first; a Construct beast → `E_TARGET_INVALID` | F2.2 F10.7 F1.7 |
| FURY-047 | C7 shake: warlock knocked down at 1 fury and a stationary beast in CTRL at 0 fury → both offered; shaking costs the warlock 1 fury and gives the beast +1; a beast outside CTRL is not offered | F6.4 F6.5 F3.a |
| FURY-048 | An effect lowers a beast's FURY from 4 to 3 while it holds 4 → 1 fury removed at once (`capTrim`) | F5.8 |
| FURY-049 | `npm run sim` with a fury list (30 games): every new decision's `legalActions` is non-empty and each member passes `validate`; 0 invariant violations | 00 §5, 81 C.1 |
| FURY-050 | Recon setup: a warlock list whose only beast is lesser → `E_BAD_SETUP`; with a light beast → valid | F1.6 |
| FURY-051 | A beast secures a 50 mm objective like a war-engine (Cohort); the same beast while wild cannot | F13.3 F11.2 |

## M13 command cards (CARD)

Spec: `91-cards-steamroller-clock.md` part A (CC*, A.2 to A.5).

| ID | Case | Ref |
|---|---|---|
| CARD-001 | `GameSetup.cards` omitted → `players.*.cards` undefined, no `playCard` option anywhere; GOLD-001 replays unchanged | A.4 |
| CARD-002 | Hand of six cards, or a duplicate, or For the Motherland for a list without a Khador Winter Korps / Old Umbrey `army` → `E_BAD_SETUP` | CC1 CC2 A.4 |
| CARD-003 | Universal hand of five: Careful Reconnaissance offered on `chooseMovement` of a friendly activation; never on an enemy turn, never inside an attack or a trigger window | A.5 |
| CARD-004 | Third card in one turn → `E_ALREADY_USED`; two cards in turn 1 and one more in turn 3 → allowed | CC4 |
| CARD-005 | Second card on the same unit in one turn (first on trooper 1, second on trooper 2) → `E_ALREADY_USED` | CC5 |
| CARD-006 | A played card is gone for the rest of the game (`played` has it; no option offered in later turns) | CC3 |
| CARD-007 | Careful Reconnaissance A: a trooper unit advancing through a forest moves its full SPD (Pathfinder); next activation it is slowed again | A.2 |
| CARD-008 | Careful Reconnaissance B: model advances, attacks, then gets a 3" advance and the activation ends; after a run → no Reposition move | A.2 |
| CARD-009 | Blessings A: a magical, blessed attack hits an Incorporeal target normally and deals damage; the weapons lose both after the activation | A.2 |
| CARD-010 | Blessings offered only on the activation's first decision; after `chooseMovement('advance')` it is gone | A.5 |
| CARD-011 | Blessings B on a war-engine holding 3 focus → focus option not offered; on one holding 2 → 3. On a warlock below FURY → +1 fury. Soul token offered only to a model with a soul-gaining rule | A.2 |
| CARD-012 | Duck and Cover A: a unit within 3" of a 40 mm objective → ranged attack target number +4 (cover) and blast damage resisted; LOS through a dug-in model is clear | A.2 |
| CARD-013 | Dig In ends when the model moves, is placed, or becomes engaged (each case removes the effect) | A.2 |
| CARD-014 | Duck and Cover B: an enemy charge attack roll against the model has −2; the same model 4" from every element → no −2 | A.2 |
| CARD-015 | Duck and Cover on a warjack, warbeast or battle engine → `E_TARGET_INVALID` | A.2 |
| CARD-016 | Bite and Hold A: unit secures the 40 mm objective, card played, unit runs off; end-of-turn scoring → still secured, VP scored; the same with one enemy model within 3" → contested, no VP; next turn → normal rules | A.2 |
| CARD-017 | Bite and Hold B: model within 3" of an objective is not moved by a push (no collateral); slammed → moves normally | A.2 |
| CARD-018 | Put the Fires Out: maintenance prompt raised only when a model would gain (on fire, corroded, knocked down, stationary, or damaged); A on a burning model → Fire ends before the continuous roll; B → d3+1 boxes healed | A.5 |
| CARD-019 | Put the Fires Out B on a Grievous Wounds model → option not offered | A.2 |
| CARD-020 | For the Motherland on a trooper unit: a trooper that would be disabled rolls Tough; after the round it does not | A.3 |
| CARD-021 | `query.cards` for both players: hands visible, `playsLeft` 2 then 1 then 0, `usedOn` lists the unit | CC6 |
| CARD-022 | `npm run sim` 30 games with both hands: every `playCard` in `legalActions` passes `validate`; 0 invariant violations; replay identical | 00 §5 |

## M13 Steamroller 2026 scenarios (SR)

Spec: `91-cards-steamroller-clock.md` part B (SR*, B.3, B.4).

| ID | Case | Ref |
|---|---|---|
| SR-001 | Each of the seven `scn-sr26-*` files validates; element centres match B.4 to 0.01"; table 48×48; deployment 6 / 11 | B.4 SR2 |
| SR-002 | Attacker on the −z edge → element positions as authored; Attacker on +z → every element rotated 180° (x, z negated); on west/east → rotated 90° | SR5 |
| SR-003 | Flag pick: Attacker first; only pieces within 5" of the flag offered; with none, the flag becomes a 30 mm obstruction scenario terrain | SR10 |
| SR-004 | Scenario terrain (area): one solo inside → secured; one trooper inside → not; two troopers → secured; two troopers 1" outside the forest edge → not | SR9 |
| SR-005 | Scenario terrain (impassable / flag-obstruction): one Leader within 3" → secured | SR9 |
| SR-006 | Trench Warfare: own flag terrain held → 0 VP; opponent's flag terrain held → 2 VP | B.4 S-SR1 |
| SR-007 | Trench Warfare cache: a model within 3" of the opponent's cache forfeits its Combat Action, no enemy within 3" → `CacheClaimed`, cache removed, +2 VP at this turn's scoring; own cache → option not offered; contested → not offered | SR11 |
| SR-008 | Cache claim before the Defender's round-2 turn → not offered | B.6 cache timing |
| SR-009 | Earthworks: a medium-based trooper within 3" of its own 50 mm objective gets cover vs ranged; within 3" of the opponent's → none; a large-based model → none | B.3 |
| SR-010 | Two Fronts: one player secures both 40 mm objectives and the flag terrain → 2 + 1 + 1 = 4 VP | B.4 S-SR2 |
| SR-011 | Wolves: Kill Box depth 12" in round 2, 14" from the start of the Attacker's round-3 turn, 22" in round 7, for both players | B.3 killBoxGrowth |
| SR-012 | Wolves heel tokens: securing own 40 → token offer; after a token the opponent may move it 3" toward the same-colour 50 (stops short of an obstruction it cannot clear) | B.3 heelTokens |
| SR-013 | Wolves race: first player to reach 3 tokens alone → +3 VP once; both reach 3 at the same scoring point → no VP and no later award | B.3 tokenRace |
| SR-014 | Pressure Point: 50 mm secured → 2 VP; four neutral flags picked A, D, A, D | B.4 S-SR4 |
| SR-015 | High Stakes: 50 secured by A → A must pick an element with tokens and remove d3; nobody secures → d3 picks blue terrain / red terrain / 50 and removes 1 | B.4 S-SR5 |
| SR-016 | High Stakes: an element reaching 0 → POW 14 magical blast roll on each model in or within 3" of it, friend and foe, once; then +1 VP while secured at 0 | B.4 S-SR5 |
| SR-017 | Fault Line: a player securing two of their own objectives → +1; three → +2; two of the opponent's → no bonus | B.4 S-SR6 |
| SR-018 | Payload: own 50 secured plus one other objective → move offer 0..4"; the move ends inside the opponent's flag terrain → +3 VP, objective removed | B.4 S-SR7 |
| SR-019 | Payload haul: after the end-of-own-turn move, one Cohort model moves up to 5" straight toward the 50; on the opponent's turn → no haul | B.4 S-SR7 |
| SR-020 | Payload: a 4 VP lead after the opponent's turn → no win (lead-by-3 off); the game runs to round 7 | B.6 Payload |
| SR-021 | Every SR scenario: no scoring before the Defender's round-2 turn; Kill Box from the Attacker's round-2 turn | SR13 SR14 |
| SR-022 | SR layout fit: no impassable piece within 1" of an element base after setup | B.5 item 12 |
| SR-023 | Presence tiebreak in an SR scenario counts a unit inside area scenario terrain, not one 2" outside it | SR9 V1.5 |
| SR-024 | `npm run sim -- --scenario scn-sr26-<id>` 20 games each: every game ends, 0 invariant violations, every scoring decision legal | 00 §5 |

## M13 game clock (CLK)

Spec: `91-cards-steamroller-clock.md` part C.

| ID | Case | Ref |
|---|---|---|
| CLK-001 | Steamroller preset: 30 → 20 min, 50 → 30, 75 → 50, 100 → 60 per player | CLK1 |
| CLK-002 | Clock off by default: no chips in the top bar, no `clockExpired` ever stepped | C.2 |
| CLK-003 | Charged player = `pending.player`; nobody before deployment (turn order, edge, flag picks) or at game over | CLK2 C.2 |
| CLK-004 | A reaction decision owned by the inactive player (power field, reroll, transfer) charges that player | CLK3 |
| CLK-005 | Auto-pause while a presentation beat plays, a menu or modal is open, or the tab is hidden; resumes after | C.2 |
| CLK-006 | Bot untimed by default (its pool never drains); "Time the bot" drains it by its answer time | C.2 |
| CLK-007 | `clockExpired` for the active player, opponent scoring gives them more VP → winner opponent, reason `scenario`, `result.timeout` set | CLK5 |
| CLK-008 | `clockExpired` for the active player, no VP lead → their Leader is destroyed (cause `timeout`), reason `assassination` | CLK5 |
| CLK-009 | `clockExpired` before scoring starts (round 1) → no opponent scoring; Leader destroyed, `assassination` | CLK5 B.6 |
| CLK-010 | `clockExpired` for the inactive player → `clockOut` set; their later decisions auto-answered; at the end of the active turn: more VP → `scenario`, else `assassination` | CLK6 |
| CLK-011 | `clockExpired` is never in `legalActions`; with a stale `decisionId` → `E_WRONG_DECISION`; after `gameOver` → `E_GAME_OVER` | C.2 |
| CLK-012 | A save with a `clockExpired` in its log replays to the same result with no clock running | C.2 |
| CLK-013 | Continue restores both remaining times from `wm.save.<slot>.clock`, paused until the first decision shows | C.2 |
| CLK-014 | Custom +30 s per turn: a player's pool gains 30 s when their turn ends | C.2 |
| CLK-015 | E2E: `?clock=20&test=1`, `__clock.set('A', 500)` on the human's decision → "Out of time" banner, game-over screen names the clock | C.2 |


## M12 Skirmish shared rules (SKC)

| ID | Case | Ref |
|---|---|---|
| SKC-001 | a Wolf Rider (flag cavalry) rolls 3 dice on its charge attack, 2 on any other melee attack | 91 skirmish shared rules |
| SKC-002 | the flag marker reaches the shared core ability; a model without the flag does not get it | 91 skirmish shared rules |
| SKC-003 | Night Terrors keep their own Cavalry hook and are boosted exactly once (no double boost from the core one) | 91 skirmish shared rules |
| SKC-004 | core.a.arc-node exists and flag-only records (Raptor, Revenger) get it | 91 skirmish shared rules |
| SKC-005 | Feora may channel Conflagration through the Revenger in her CTRL (the channel option is offered) | 91 skirmish shared rules |
| SKC-006 | a living enemy within 1" of a Wolf Rider takes -1 on its attack roll, once however many riders stand there | 91 skirmish shared rules |
| SKC-007 | Annoyance does not touch constructs, the carrier\'s own side, or the carrier\'s own rolls | 91 skirmish shared rules |
| SKC-008 | Ashen Veil: living enemies within 2" of a Revenger take -2; a crippled right arm switches it off; fire resistance ignores it | 91 skirmish shared rules |
| SKC-009 | Wind Weaver: Cygnar models within 3" of the Vane resist blast while they stay there, not after they walk away | 91 skirmish shared rules |
| SKC-010 | Sky Shaker: Circle Faction models within 3" of the Shaman resist blast, live, and models of another faction do not | 91 skirmish shared rules |
| SKC-011 | an effect that carries magicalWeapons adds the magical damage type to weapon attacks, not to spells | 91 skirmish shared rules |
| SKC-012 | a condition code only a faction registers (wholeUnit) is evaluated, an unknown one is false | 91 skirmish shared rules |
| SKC-013 | a target 6" away is in reach of an RNG 8 gun, and out of reach (an automatic miss) once a Vane near it has used Wind Weaver | 91 skirmish shared rules |
| SKC-014 | the penalty is for the Faction models near the carrier only: a model 10" away or of another faction keeps its full range | 91 skirmish shared rules |

## M12 follow-ups: engine (SKF) and AI (AIF)

| ID | Case | Ref |
|---|---|---|
| SKF-001 | the general targeted-action flag (needsTarget replaced by targetedSpec) | m12-followups |
| SKF-002 | Khador Arkanists: Empower and Sigil of Power ask for a target | m12-followups |
| SKF-003 | Storm Vanes: Lightning Wreath names its model, and a Vane uses one capacitor effect a turn (Galvanic Capacitor) | m12-followups |
| SKF-004 | Cryx Initiates: Grim Returns and Empower are offered only when they can do something | m12-followups |
| SKF-005 | Trollbloods Runebearer: Guidance names its model and the weapons it gives are magical | m12-followups |
| SKF-006 | Polarity Field Generator: a construct cannot pick the unit as a charge or slam target | m12-followups |
| SKF-007 | Warping Winds: the target list loses 3 RNG at a protected model | m12-followups |
| SKF-008 | Insulated Cortex: this warjack cannot be disrupted | m12-followups |
| SKF-009 | Shield Guard is general: any friendly model, ended by a crippled Head | m12-followups |
| SKF-010 | solos name their Leader (setup gives them a controllerId) | m12-followups |
| SKF-011 | Serenity is called from the Control Phase (before the leech) | m12-followups |
| SKF-012 | Harmonious Exaltation costs 1 less on the next spell and is then spent | m12-followups |
| SKF-013 | an animus with a range is offered with targets (Lucky Shot, Wraithbane) | m12-followups |
| SKF-014 | a power attack needs no weapon: the Raptor (no melee weapon) may Headbutt | m12-followups |
| SKF-015 | Assault: after a successful charge a Wolf Rider may shoot the charged model, ignoring Target in Melee | m12-followups |
| SKF-016 | Unpredictable Movement: the rest of the unit is placed within 4", not 2 | m12-followups |
| SKF-017 | Doppler Bark forbids run, charge, slam and trample for the round | m12-followups |
| SKF-018 | Unyielding shows in the attack preview (+2 ARM against melee, not against shots) | m12-followups |
| SKF-019 | an Incorporeal model takes no non-magical damage, and the preview says so | m12-followups |
| SKF-020 | Ashen Veil gives its carrier concealment against ranged and arcane attacks | m12-followups |
| SKF-021 | Razor Wind is a spray: it rolls AAT at every model along its line | m12-followups |
| SKF-022 | the Kill Box chip needs the Kill Box in force (query.control reports killBoxActive) | m12-followups |
| SKF-023 | tools/sim.ts: a destroyed Grunt may come back active only through Grim Returns | m12-followups |
| SKF-024 | Righteous Intervention: arming it, and the reaction to a friendly death | m12-followups |
| SKF-025 | Penance of the Corrupted: damage paid for focus in the allocation | m12-followups |
| SKF-026 | Enliven lets the model advance its own SPD, not a flat 5" | m12-followups |
| AIF-001 | a free boost (Cavalry on a charge) is not bought a second time | m12-followups, 40-ai |
| AIF-002 | Incorporeal: threat from attackers that cannot hurt it is nothing | m12-followups, 40-ai |
| AIF-003 | Warping Winds shortens the shots the AI expects against the protected model | m12-followups, 40-ai |
| AIF-004 | targeted special actions are valued per target | m12-followups, 40-ai |
| AIF-006 | the focus allocation uses Penance when a Vassal has boxes to spare | m12-followups, 40-ai |
| AIF-007 | ai-bench list options: mirror and rotation | m12-followups, 40-ai |
