# 10 Rules core (MK4, focus-only, Recon 30)

Engine contract for the rules. All prose is ours. Mechanics follow Warmachine MK4.
- **Sources (checked 2026-10-04):** the MK4 rulebook PDF in `docs/sources/` (core rules pp60–127, timing
  appendix A1 pp128–129; page refs below are `p<n>`), the Quick Start guide (Jul 2025, `QS p<n>`) and
  Steamroller 2026 (`SR p<n>`). Handoff Part E is secondary.
- Every former `(verify)` has been checked. Tags now mean:
  - `(unsourced)`: the sources are silent; the rule is our ruling, logged in `docs/needs-rules-check.md`.
  - `(app)`: card data that only the official app can settle.
- Section IDs (`R5.3`) are referenced by `12-rules-test-checklist.md`. IDs are never renumbered.

## R0 Conventions and the MK3 guard

| Term | Meaning |
|---|---|
| inch | All distances are in inches and stay exact (never rounded) |
| within d | The nearest base edge is ≤ d from the reference edge or point. Exactly d counts. Overlapping bases are 0" apart |
| completely within d | The whole base is ≤ d |
| in an area | Any part of the base is inside it. A rule's area includes the space under the source's base |
| Leader / caster | The warcaster. Free in points; a character |
| war-engine | A warjack (light 40, heavy 50, super-heavy 80, colossal 120 mm) |
| cohort | A war-engine in its caster's battlegroup |
| trooper / unit | A unit model; the unit activates together |
| solo | An independent non-Leader, non-cohort model |
| active player | The player whose turn it is; during an attack, the attacker's controller (p62). Stays fixed until every trigger of that attack is resolved |
| in melee | Engaged or engaging (R7.6) |

**MK3 guard (hard fail if any appears in code or data):**

| Not in MK4 | MK4 rule |
|---|---|
| Facing, back arcs, back strikes, free strikes | 360° vision; leaving melee only forfeits the Combat Action |
| 0.5" melee | 1" melee (Reach 2") |
| Run = 2×SPD | Run = SPD+5" |
| Coherency, unit leader, command range | Move one trooper, place the rest within 2" (Normal Movement only) |
| AOE templates, deviation, scatter | Closest-N blast (R7.9) |
| STR, the FOCUS stat | Flat weapon POW; ARC is the focus refill |
| STR-based power attack POW | POW 12/14 by base comparison |
| Free run/charge for war-engines | 1 focus each (a 'jack marshal within 8" waives it; not in Recon) |
| Shooting while engaged only with Pistols | Any engaged model may shoot, at its engagers only (R7.7) |

## R1 Dice

| ID | Rule |
|---|---|
| R1.1 | All dice are d6. A d3 is a d6 halved and rounded up (1-2→1, 3-4→2, 5-6→3) |
| R1.2 | Rounding: halved or fractional values round **up**, except distances, which stay exact |
| R1.3 | Attack roll = 2d6 + MAT, RAT or AAT. It hits if the total is ≥ the target's DEF |
| R1.4 | If every die shows 1, the attack misses. If every die shows 6 it hits, unless only one die was rolled |
| R1.5 | **Critical**: a direct hit where any two dice show the same number. Crit effects need a hit |
| R1.6 | Auto-miss beats auto-hit. An auto-hitting attacker may still roll (to look for a crit), but then the roll decides: a failed roll misses (p85) |
| R1.7 | Damage roll = 2d6 + POW + mods − ARM, minimum 0. A model can't take more damage than it has unmarked boxes |
| R1.8 | **Boost**: +1 die. Declared before the roll. Once per roll. Paid per roll (1 focus) or granted (charge, Powerful Attack). With several models affected, each model's rolls are boosted separately (p60) |
| R1.9 | **Additional dice**: each rule that grants one adds one die. Several dice from *different* rules stack. The same rule never stacks with itself. A boost stacks with additional dice |
| R1.10 | **Removed dice**: Resistance to the damage type removes one die, and only one even if several types match. A crippled weapon system removes one die (R3.6). Removals stack. An **attack** roll reduced to 0 dice misses automatically (p85). A **damage** roll reduced to 0 dice totals POW + mods with no dice (unsourced) |
| R1.11 | "Discard the lowest" effects (Heart Seeker) add their die first and then drop the single lowest die |
| R1.12 | Rerolls happen before hit/miss and damage triggers. The new dice replace the old (removed dice come back before the reroll, A1). A roll can't be rerolled more than once by the same rule |
| R1.13 | Stat order: **set base → ×2 → ½ → bonuses → penalties**, floor 0 (p66). If several rules set the same base stat, the **lowest** wins. Effects with the same name don't stack; different named effects do (p62) |
| R1.14 | The AI uses exact closed-form distributions for 1–5d6 (no Monte Carlo needed) |

## R2 Models, stats and weapons

**Base classes (p71, p82)**

| Base | Class | Volume height | Example |
|---|---|---|---|
| 30 mm | small | 1.75" | casters, solos, troopers |
| 40 mm | medium | 2.25" | light war-engine |
| 50 mm | large | 2.75" | heavy war-engine |
| 80 mm | extra large | 3.25" | super-heavy |
| 120 mm | huge | 5.0" | colossal, battle engine, structure |

Base comparison ("bigger", "smaller", "equal") uses the diameter in mm. Volumes are used **only** for
terrain LOS, spray lines and melee across elevations; intervening models use the 2D base (R6.4).

**Model stats:** SPD, AAT, MAT, RAT, DEF, ARM, ARC (focus refill), CTRL (inches from the base edge),
health (boxes or grid), base, advantages, abilities. There is no STR and no FOCUS stat.

**Weapon stats:** name, type (melee or ranged), attack stat, RNG (melee: 1 or 2; ranged: inches or
`SP X`), ROF (an integer or a dice expression such as `d3+1`), AOE, POW (`D` or `D/B` for an AOE),
location (`L`, `R`, `H`, `S` or none), qualities, abilities, quantity.

**Weapon qualities used in the first release (p70)**

| Quality | Effect |
|---|---|
| Pistol | An attack with it against a model the attacker is in melee with ignores Target in Melee (R6.11). It does **not** govern who may shoot while engaged (R7.7) |
| Magical damage | The damage is magical |
| Shield | +2 ARM while the weapon's system isn't crippled. Several shields stack |
| Buckler | +1 ARM while the weapon's system isn't crippled. Stacks with Shield |
| Weapon Master | +1 damage die with this weapon |
| Throw PA | The weapon can make Throw power attacks |
| Reach | Melee range 2" |
| Blessed | Ignores DEF and ARM bonuses that come from spells |

**Advantages used in the first release (p68)**

| Advantage | Effect |
|---|---|
| Dual Attack | Can make initial melee and ranged attacks in one Combat Action, in any order. No ranged attacks after a power attack |
| Gunfighter | When it shoots while engaged, it may target models other than its engagers (R7.7) |
| Pathfinder | Treats rough terrain as open while advancing. While charging, slamming or trampling it doesn't stop on contacting an obstacle (it still counts as contacting it) |
| Tough | When disabled, roll d6. On 5–6 remove 1 damage point; it is no longer disabled and becomes knocked down (R3.9). A knocked-down model **loses Tough**, so a knockdown before the damage roll (Critical Knockdown) denies the roll (p85) |
| Stealth | Ranged and arcane attacks from a point of origin more than 5" away miss automatically. For LOS drawn from a model more than 5" away it is not an intervening model |
| Unstoppable | Doesn't forfeit its Combat Action when it advances or is placed out of enemy melee ranges during its Normal Movement (waives R5.7 and R5.10). It has nothing to do with knockdown |
| Construct | Not a living model |
| Advance Deployment | Deploys up to 3" beyond its deployment zone (R11.5) |
| Ambush | Starts off the table and enters later (R11.6) |
| Arc Node | Spells can be channelled through it (R8.7) |
| Resistance: X | −1 damage die against type X. Fire and Corrosion also grant immunity to the matching continuous effect, which ends at once if already present (p69). Blast: −1 die on blast damage rolls |
| Headbutt / Slam / Trample PA | The model can make that power attack. Read from data, never assumed from the model type |

Knockdown immunity comes only from card rules (Shield Wall, Anchor, Superiority); "cannot" beats
"must" (p62).

## R3 Damage capacity, grids and death

| ID | Rule |
|---|---|
| R3.1 | Each damage point fills one box. A model without damage boxes is disabled by 1 damage point (p96) |
| R3.2 | Casters, solos and multi-box troopers have a single row of boxes, filled left to right (counts per faction file) |
| R3.3 | **War-engine grid:** 6 columns, each with its own height. Boxes are indexed by row from the top (1 = top) |
| R3.4 | **Fill order (p94):** roll d6 to pick the column, then fill unmarked boxes from the top down. When that column is full, continue at the topmost unmarked box of the next column to the right that has one, wrapping from 6 to 1. Each damage roll gets its own column roll. Marksman chooses the column instead of rolling. "Damage to the first X box" uses the lowest-numbered column with an unmarked X box, topmost first |
| R3.5 | **Systems:** letters on specific boxes (L, R, M, C, H, A, F, G). A system is **crippled** while every box carrying that letter is filled. Removing any one of those points un-cripples it |
| R3.6 | **Crippled effects:** see the table below |
| R3.7 | **Colossals** have two grids. Attack damage goes to the grid the **attacker** picks; other damage rolls d6 (1–3 left, 4–6 right). The column is still rolled. A full grid spills to the other. Not in Recon |
| R3.8 | **Healing** removes filled boxes from anywhere on the grid (the healer picks); a single track clears from the end. Healing a disabled model ends *disabled* (p97) |
| R3.9 | **Death states, one mechanism.** See below |
| R3.10 | **Removed from play (RFP)** instead of being destroyed skips the boxed/destroyed steps that follow; the model is not destroyed and makes no soul token (p97). RFP'd models can never return. All effects on a removed model expire |

**Crippled systems (R3.6, p95)**

| System | While crippled |
|---|---|
| L / R (weapon location) | Attack and damage rolls with weapons in that location roll 1 fewer die. No power attacks or ★Attacks with them (and no Throw). Their Shield and Buckler ARM bonuses are lost |
| M movement | Base DEF becomes 5. No run, charge, slam or trample. Crippled mid-charge or mid-slam: it stops at once and its activation ends |
| C cortex | Loses all focus. Can't gain or spend focus, so no boost, run, charge or power attack |
| H head | Loses the rules tied to the head; head weapons count as a crippled location (no Recon model has H) |
| A arc node | Loses Arc Node |

**Death state machine (R3.9, p96 and A1 damage application).** Every damage source enters it the same way.

| Step | State | Window (who acts) | Exit |
|---|---|---|---|
| D0 | Damage suffered | "When damaged" triggers (A1 9A). Power Field still counts as damage suffered even at 0 (p101) | — |
| D1 | The last box is filled | — | The model becomes **disabled** |
| D2 | disabled | *Disabled* triggers: Tough roll (unless denied: knocked down, Head Shot, Take Down, Pall of Ashes), healing effects | If damage is removed: no longer disabled, stop; later disabled/boxed triggers don't happen. Otherwise D3 |
| D3 | **boxed** | *Boxed* triggers: Eruption of Ash, Arcane Conflagration's 1" blast, "remove from play instead" effects | If RFP'd: removed, not destroyed, skip D4. Otherwise D4 |
| D4 | **destroyed** | *Destroyed* triggers: counters for Swift Hunter, Run & Gun and Gatecrasher, assassination check (R12.1), the Leader's war-engines turn inert, its upkeeps expire | Remove the model |

- D0–D4 run immediately for one model before the next model's damage is applied (A1 step 9: one
  model at a time, the active player choosing the order).
- With simultaneous damage (blast, spray, trample, collateral, falls), **all** attack and damage rolls
  are made first; triggers from damage, disabling or removal wait until every roll is done (p85).
- A disabled or boxed model still occupies its base; it doesn't block LOS, engage or contest
  (unsourced; the window is instant in play).

## R4 Turn structure

A game is up to 7 rounds (SR; the core rules set no limit). Each round, every player takes one turn
in a fixed order (first player first). A turn runs: **start-of-turn → Maintenance → Control →
Activation → end-of-turn (scoring)**.

| Step | ID | Action |
|---|---|---|
| Start | R4.0 | "Start of turn" effects. Effects lasting "one round" created by this player expire now (p72) |
| Maint 1 | R4.1 | Remove all focus from this player's war-engines. Casters above ARC drop to ARC |
| Maint 2 | R4.2 | Each continuous effect on this player's models rolls d6. 1–2: it expires. 3–6: it resolves. Fire = POW 12 fire damage roll; Corrosion = 1 corrosion damage point. A model has at most one of each continuous effect |
| Maint 3 | R4.3 | Other maintenance triggers (Rise stands the model up; Avenging Force's advance and attack) |
| Ctrl 1 | R4.4 | Casters refill to current ARC |
| Ctrl 2 | R4.5 | **Power up:** each cohort with an uncrippled cortex within its caster's CTRL gains 1 focus |
| Ctrl 3 | R4.6 | **Allocate:** the caster gives focus to cohorts within CTRL (no LOS needed). A war-engine never holds more than **3** focus, from any source at any time (p100, p102) |
| Ctrl 4 | R4.7 | **Upkeep:** the caster pays 1 per upkeep spell it keeps, even if the spell is outside its CTRL. Unpaid spells expire |
| Ctrl 5 | R4.8 | **Shake** (after allocation): each caster or war-engine may spend **its own** 1 focus to stand up, end stationary, or end another shakeable effect on itself |
| Ctrl 6 | R4.9 | Other Control Phase effects, then Ambush models may enter (R11.6) |
| Act | R4.10 | Activate every model and unit once, in any order; **endTurn is rejected while one is unactivated** (unless a rule lets it skip). One activation (A1): start-of-activation effects → required forfeits → before-movement effects → Normal Movement → end-of-movement effects → Combat Action (each trooper in turn) → end-of-Combat-Action effects → end-of-activation effects (Reposition) |
| End | R4.11 | End-of-turn scoring and victory checks (11-scenarios.md) |

- Casters start the game with focus = ARC (R11.7).
- **Any time** rules (spells, feats, heals) can be used before or after moving and before or after
  an attack. Not mid-move, mid-attack, during the spellcasting sequence, while a trigger resolves
  (including between attacks one attack generated), before required forfeits are resolved, or after
  running (p63, A1).
- **Focus is spent only in the model's own activation** unless a rule says otherwise (p100, p102).
  Exceptions in Recon: Power Field (R7.18 step 12), shake and upkeep (Control Phase).
- A model must activate unless a rule lets it skip. Inert models never activate. A model must be on
  the table to activate.

## R5 Movement

**Normal Movement options (R5.1, p74)**

| Option | Distance | Notes |
|---|---|---|
| Forfeit | 0 | — |
| Aim | 0 | +2 to every ranged attack roll this activation. Allowed while engaged, but the bonus doesn't apply while the model is engaged (p74, p90) |
| Full advance | ≤ SPD | Any path |
| Run | ≤ SPD+5" | Forfeit the Combat Action first; the activation ends after the move. A war-engine pays 1 focus. Not if engaged at the start of Normal Movement |
| Charge | ≤ SPD+3", straight | R5.2. A war-engine pays 1 focus. Not if engaged at the start of Normal Movement, or if the Combat Action is already forfeited |

| ID | Rule |
|---|---|
| R5.0 | Advancing is any intentional movement, measured by how far the leading edge of the base travels. A base can't pass over another base or end overlapping one. A model may be moved 0" |
| R5.2 | **Charge (p75):** needs a melee weapon. Declare an enemy target in LOS before moving (any range). Advance up to SPD+3" in a straight line in any direction that would bring the target into melee range (ignoring terrain, distance and models when choosing the line). It can't stop voluntarily until the target is in its melee range; from then on it may stop at any time but must keep the target in range for the rest of the move. It stops on contacting a model, an obstacle (not with Pathfinder) or an obstruction, or if pushed, slammed, thrown or placed. Entering rough terrain costs 2" (R5.12) |
| R5.3 | Success = the target is in melee range at the end of the move. The charger **must** spend its Combat Action on initial melee attacks or a melee ★Attack (no ranged option, no ★Action). Its first melee attack must target the charge target; if it can't, it may attack another eligible target without the boost. If it moved ≥3", that first attack is a **charge attack**: a hit's damage roll is auto-boosted. With <3" moved it's still a success, but there is no charge attack |
| R5.4 | A failed charge ends the activation immediately (no Combat Action, no end-of-activation movement) |
| R5.5 | A model that charged can't make power attacks that activation |
| R5.6 | **Engaged at the start of Normal Movement:** no run, charge or slam. Trample is still allowed (R7.14) |
| R5.7 | **Disengage (p86):** a model that starts its Normal Movement engaged by one or more non-incorporeal enemies and, during that Normal Movement, advances out of the melee range of one or more of them forfeits its Combat Action. No free strikes. Unstoppable waives this. Movement outside Normal Movement (Reposition, Evasive) never triggers it |
| R5.8 | **Unit movement (p73):** for a unit's Normal Movement only (advance, run or charge), pick one trooper and resolve its movement. Then place every other trooper simultaneously **within 2"** (base edge, not completely) of it and in its LOS. A trooper that can't be placed that way is destroyed. A trooper under a no-advance effect is placed normally but forfeits its Combat Action. If the moving trooper is destroyed or RFP'd before the others are placed, the player picks another trooper and any Normal Movement option for the unit. All other unit movement (Reposition, Evasive, pushes) moves each trooper on its own |
| R5.9 | **Unit run:** every trooper forfeits its Combat Action. **Unit charge (p76):** the charging trooper must start unengaged. After placement: if it moved ≥3", each trooper's first melee attack against a model that was in the charger's melee range at the end of the charge is a charge attack. Troopers with an enemy in their melee range must make initial melee attacks or a melee ★Attack; troopers with none must forfeit their Combat Action (so no ranged attacks). A trooper that was engaged before placement never makes a charge attack, and forfeits its Combat Action unless placed within the melee range of **all** models that were engaging it (p76). If the charger fails, the others are placed and then the unit's activation ends |
| R5.10 | **Placement out of melee (p86):** outside a unit charge, a trooper that was engaged before placement forfeits its Combat Action unless placed within the melee range of **any** model that was engaging it. Unstoppable waives this |
| R5.11 | Placement isn't advancing. It ignores rough terrain and anything in between, but the end point must be legal: room for the base, no overlap with a base, obstacle or obstruction, not in impassable terrain. A model placed into an area **enters** it (hazards, R9.8) |
| R5.12 | **Rough terrain (p122):** if the model starts in rough terrain or enters it one or more times while advancing, the whole advance is reduced by 2" (minimum 1"). Pathfinder ignores this. Involuntary movement and placement never pay it |
| R5.13 | **Obstacles (<1" tall, p124):** a non-charging advancing model crosses one only if it has enough movement left to end completely past it; otherwise it stops short. A charging, slamming or trampling model stops on contact (Pathfinder doesn't). A model can never partly cross, climb or stand on an obstacle |
| R5.14 | **Obstructions (≥1" tall):** impassable except to Flight or Incorporeal (not in Recon). They give elevation to models completely within them (only flyers or via stairs) |
| R5.15 | **Push X:** move directly away from the source up to X". Stop on contacting a model, an obstacle or an obstruction. It suffers hazards it moves through. Not an advance: no disengage forfeit, no rough penalty |
| R5.16 | **Slam X (p78):** move directly away from the point of origin up to X", then become knocked down, then take the damage roll. It passes through bases smaller than its own; it stops on contacting an obstacle, an obstruction or an equal-or-larger base, and then gets +1 die on its damage roll. Every equal-or-smaller model it contacts or passes through is knocked down and takes collateral damage; a larger contacted model is unaffected. It suffers hazards it moves through |
| R5.17 | **Throw X (p79):** move directly away up to X". It passes through smaller bases **without contacting** them and stops on contacting an obstacle, an obstruction or an equal-or-larger base (+1 die on its damage roll). Then it is knocked down and contacts every model it is base-to-base with or overlaps: equal-or-smaller ones are knocked down and take collateral damage; larger ones are unaffected. Overlaps resolve by least disturbance (R5.21) |
| R5.18 | **Collateral damage:** a damage roll at POW 12 if the attacking model's base ≤ the collateral model's base, else 14 (p87); Momentum uses the weapon's POW. Not boostable, not damage from an attack or a model, resolved simultaneously with the main damage |
| R5.19 | **Falling (p79):** a model moved off a surface onto one at least 1" lower falls: knocked down and a damage roll of 2d6 + 12 for a fall of up to 2", +1 die for each further 2" or part of 2" (4" → 3d6, 5" → 4d6, 7" → 5d6). An equal-or-smaller model it lands on is knocked down and takes the same roll; a larger one is unaffected. All fall damage is simultaneous. Leaving a hill is never a fall |
| R5.20 | **Table edge:** involuntary movement or placement past the edge stops at the edge; the edge isn't an obstacle, so no extra die |
| R5.21 | **Least disturbance (p79):** after involuntary movement, the mover keeps its spot and others move: pick the fewest models, then the least total distance, ties at random (seeded). If the mover overlaps a model that can't move, or a larger base, the mover is moved instead |
| R5.22 | **Place:** not movement or advancing. It counts as entering any area it ends in. It triggers the disengage forfeit only through R5.9/R5.10 |
| R5.23 | **Reposition [X] (p74):** at the end of an activation in which the model or unit didn't run or fail a charge, it may advance up to X". In a unit, **each trooper advances independently** (no placement). Then the activation ends. If two end-of-activation movement rules apply, the controller picks one |

## R6 LOS and targeting

| ID | Rule |
|---|---|
| R6.1 | **Volume:** a vertical cylinder of the base diameter and the volume height (R2), from the bottom of the base. Used only for terrain tests (R6.3), spray lines and melee between elevations |
| R6.2 | **LOS (p81)** from A to B exists if some straight line from any part of A's volume to any part of B's volume passes every test R6.3–R6.5. Try lines until one passes |
| R6.3 | **Terrain (3D):** the 3D segment between the volumes must not pass through LOS-blocking terrain (obstructions by height, forests per R10) |
| R6.4 | **Intervening models (2D):** project the line onto the table. A third model is *intervening* if the line passes over any part of its base. It blocks only if its base is **≥ the target's base**. A line that clears the base edge isn't blocked. Never intervening: A and B, troopers of A's own unit (for a trooper viewer), knocked-down models, Stealth models when A is more than 5" from them, disabled or boxed models (unsourced). Stationary models still intervene |
| R6.5 | **Clouds (2D, p98):** a cloud is its 3" footprint. A line passing over a cloud's footprint is blocked unless A or B is in that cloud (any part of the base). Clouds never block LOS to 120 mm bases. Flares never block (Cloud.kind). True Sight and (Enhanced) Alchemical Mask ignore clouds for LOS |
| R6.6 | **Elevation (p122):** elevation is set per terrain piece (hills and obstruction tops give it to models completely within them); we treat a surface ≥1" higher as higher elevation (unsourced threshold). An elevated viewer ignores intervening models on lower elevations except those within 1" of the target. A lower viewer ignores intervening models on lower elevations than the target. Melee between elevations measures volume to volume |
| R6.7 | Vision is 360°. There is no facing |
| R6.8 | **Range** is measured from the edge of the point of origin's base nearest the target to the nearest edge of the target's base. Point of origin = the attacker, or the channelling arc node. LOS and LOS-based modifiers also use the point of origin (p83) |
| R6.9 | Range is checked after the attack is declared (A1 step 3). An out-of-range attack misses automatically (R7.3) |
| R6.10 | **Stealth:** a ranged or arcane attack whose point of origin is more than 5" from a Stealth target misses automatically. Spray ignores Stealth (p93). True Sight ignores Stealth. Prowl grants Stealth while the model has concealment. A model in a Targeting Flare loses Stealth |

**DEF modifiers against ranged and arcane attacks (R6.11, p90, p93, p122)**

| Modifier | DEF | When |
|---|---|---|
| Concealment | +2 | Completely inside a forest or a cloud; or within 1" of an intervening concealing feature (hedge) along at least one line to the attacker; or from an effect. No benefit against spray |
| Cover | +4 | Completely inside rubble; or within 1" of an intervening cover feature (wall, building, obstruction) along at least one line to the attacker. No benefit against spray. Doesn't stack with concealment: use the higher |
| Elevation | +2 | The target (large base or smaller) is on a higher elevation than the attacker. Stacks with cover or concealment |
| Target in melee | +4 | The target (large base or smaller) is in melee with **any** model, the attacker included. Pistol ignores it against a model the attacker is in melee with; Black Penny ignores it |
| Knocked down or stationary | base DEF = 5 | A *set* of the base stat (R1.13). Concealment, cover, elevation, spells and other bonuses still add afterwards (p66: stationary behind a wall = 9) |
| 80 mm or 120 mm base | — | Never gains concealment, cover, elevation or target in melee |

- "Intervening terrain feature": some line from the attacker's volume to the target's volume passes
  through it (p90).
- Ignoring modifiers: Black Penny ignores target in melee; Alchemical Mask ignores clouds and the
  concealment clouds give; Enhanced Alchemical Mask ignores all concealment; Arcing Fire ignores
  intervening models for LOS; Spray ignores concealment, cover, Stealth and intervening models.
- **Melee DEF modifiers:** +2 if any part of the target's volume is obscured from the attacker by an
  obstacle or obstruction (p86, p124). Knocked-down, stationary and inert targets are hit automatically
  in melee.

## R7 Combat Action

**R7.1 The Combat Action choices (pick one, p80).** A trooper in a unit chooses its own.

| Choice | Detail |
|---|---|
| Melee initial attacks | One initial attack with each melee weapon, against targets in that weapon's range |
| Ranged initial attacks | ROF initial attacks with each ranged weapon (roll ROF dice first when it's a dice value) |
| Dual Attack | Both of the above together, in any order |
| ★Attack | One special attack instead of all initial attacks (Both Barrels) |
| ★Action | One special action |
| Power attack | One (R7.10–R7.14). A war-engine pays 1 focus |
| Forfeit | — |

Attacks may be split among eligible targets. Each attack is completely resolved before the next.

| ID | Rule |
|---|---|
| R7.2 | **Additional attacks (p80):** only during the Combat Action, after the initial attacks, ★Attack or power attack. Melee: 1 focus each from the model's own focus (casters and war-engines), basic attacks with any melee weapon. Ranged: only through a card rule (Reload [N]: up to N, 1 focus each; Reload [∞]). Never a ★Attack or power attack |
| R7.3 | **Declare, then measure:** the target must be an enemy in LOS when declared. A melee target must also be in that weapon's range. A ranged target that turns out to be beyond RNG is missed automatically |
| R7.4 | A model that made a power attack can't make ranged attacks that activation (Dual Attack text). Power attacks are never additional attacks |
| R7.5 | Casters may cast spells, heal and use the feat between attacks ("any time"), but not between an attack and the attacks it generates |
| R7.6 | **Engaged / engaging (p86):** A is *engaged* if A is within an enemy's melee range and in that enemy's LOS; the enemy is then *engaging* A. Knocked-down, stationary and inert models have no melee range and neither engage nor are engaged |
| R7.7 | **Shooting while engaged (p90):** any engaged model may make ranged attacks, with any ranged weapon, but only at enemies engaging it, and Aim gives it no bonus. Gunfighter lifts the target restriction. The Target in Melee +4 still applies unless the weapon is a Pistol and the target is in melee with the attacker. Arcane attacks are not ranged attacks: an engaged caster may target anyone |
| R7.8 | **Melee:** 2d6 + MAT. Each weapon reaches only within its own melee range (1" or 2"). The model's melee range is its longest. A model with no melee weapon has no melee range |
| R7.9 | **AOE (no templates, p92):** on a direct hit on a target with a base of 80 mm or smaller, the target takes the direct POW and the N closest *other* models within N" of the target's base take blast POW (N = AOE), friend and foe alike; equal distances are randomised (seeded). A direct hit on a 120 mm target hits no one else. On a miss with the target in range, the target alone is hit (not directly) and takes blast POW. Out of range: nothing. Blast rolls are simultaneous and each is boosted separately. Brutal Damage and other direct-hit rules don't apply to blast. Resistance: Blast removes a die from blast rolls. AOE reduced to 0 → not an AOE |
| R7.10 | **Power attacks, common (p86):** a melee attack roll (2d6 + MAT). Only in the model's own activation; not in an activation where it charged; never at a friendly model. Weapon special rules don't apply unless they mention power attacks. POW 12 if the attacker's base ≤ the target's base, else 14. On a hit the target is moved and/or knocked down first, then takes the damage roll (boostable). Additional melee attacks may follow |
| R7.11 | **Headbutt:** range 1" (2" for 120 mm). The target's base must be ≤ the attacker's. Hit: knocked down, then damage |
| R7.12 | **Slam (p87):** uses both Normal Movement and the Combat Action (neither may be forfeited). Declare a target that was in LOS at the start of Normal Movement. Advance the full SPD+3" directly toward it; it can't stop voluntarily until the target is in its slam range (1"; 2" for 120 mm), then may stop. It stops on contacting a model, an obstacle (not with Pathfinder) or an obstruction. Target not in slam range at the end: failed slam, activation ends. With ≥3" moved: attack roll, −2 against a larger base; a hit slams the target d6" directly away (half the roll if the target's base is larger; +2" if the attacker is 120 mm and the target smaller), then knockdown and power-attack damage (+1 die if it stopped against something, R5.16). With <3" moved: still a slam attack roll, and a hit deals slam damage only (no movement, no knockdown) |
| R7.13 | **Throw (p88):** needs an uncrippled weapon with Throw PA; range = that weapon's melee range. The target's base must be ≤ the attacker's. Hit: thrown d6" directly away (+2" if the attacker is 120 mm and the target smaller; R5.17), knocked down, then damage |
| R7.14 | **Trample (p89):** uses both Normal Movement and the Combat Action. Declare it and a direction at the start of Normal Movement. Advance up to SPD+3" in a straight line; it moves through small (30 mm) bases and needs room for its base at the end. It stops on contacting a medium-or-larger base, an obstacle (not with Pathfinder) or an obstruction. Leaving melee ranges doesn't forfeit anything. Then one melee attack roll against each small enemy model it moved through; hits take power-attack damage. All simultaneous |
| R7.15 | **Spray (SP X, p93):** declared at a target in LOS like any attack. Draw a line X" long from the attacker's base edge through the target's centre. Every model whose volume the line crosses may be hit and gets its own attack roll, unless the attacker's LOS to it is completely blocked by terrain (clouds ignored). Concealment, cover, Stealth and intervening models are ignored; **Target in Melee still applies**. All hits are direct; the attack is simultaneous; each roll is boosted separately |
| R7.16 | **Combined attacks:** the primary attacker gets +1 to attack and damage per participating trooper, the primary included (n contributors = +(n+1)), with no cap. It is a charge attack only if every participant charged. Menoth Defenders have it |
| R7.17 | **Charge attack:** an auto-boosted damage roll (R5.3). Cavalry also boost the attack roll (none in Recon) |
| R7.19 | **Attack-generating rules (p85):** one attack can grant at most one further attack. If several rules would grant one, the attacker's controller picks which applies. A generated attack may itself generate one |

**R7.18 Attack pipeline, one attack (normative timing, A1 pp128–129)**

| # | A1 | Step | Detail |
|---|---|---|---|
| 1 | 01 | Declare | Attacker, weapon or spell, attack kind (melee / ranged / arcane / power / spray / AOE), target. Check legality: enemy target, LOS (R6.2), engagement limits (R7.7), melee weapon range. Pick any "Attack Type" option now |
| 2 | 02 | Targeted | "When targeted" effects |
| 3 | 03 | Measure | Range from the point of origin. Out of range → auto-miss (an AOE does nothing; skip to step 8) |
| 4 | 04 | Auto hit/miss | Stealth >5" → auto-miss; knocked down / stationary / inert in melee, Witch Mark → auto-hit. Auto-miss wins |
| 5 | 05A | Modifiers and boost | The attack stat and bonuses (Aim +2 unless engaged, slam −2, Volume Fire, Prey); the target's DEF with R6.11 / melee mods; dice count (crippled −1, additional dice). Boost decision: 1 focus, or **Powerful Attack**: pay 1 focus once to boost both this attack roll and its damage roll (each counts as that roll's one boost) |
| 6 | 05B–E | Roll | Roll (optional if auto-hitting; then the roll decides). Remove dice; 0 dice → miss. Rerolls replace the dice |
| 7 | 05D | Resolve | All 1s → miss. All 6s (≥2 dice) → hit. Total ≥ DEF → hit. Crit = direct hit + any matching pair |
| 8 | 06–07 | Hit/miss triggers | Switching targets first. On hit: Witch Mark, Thunderbolt push, Critical Knockdown, Momentum slam/knockdown, power-attack movement or knockdown, Critical Shred's grant is recorded (it resolves in step 16). AOE: fix the blast set now (closest N). On miss: Reciprocate is recorded; AOE blast on target only (if in range) |
| 9 | 08A | Damage dice and boost | Per damage roll: charge attack (auto), Powerful Attack (already paid), or 1 focus. Dice = 2 + boost + additional dice (Brutal Damage on a direct hit, Weapon Master, Heart Seeker, Decrepitation vs construct/undead, Siege Weapon vs huge, slam/throw stop +1) |
| 10 | 08B–C | Damage roll | Roll; remove dice (Resistance, crippled); 0 dice → total = POW + mods |
| 11 | 08D–E | Total | Damage = dice + POW + flat bonuses (Both Barrels +4, Prey +2, Arcane Conflagration +n) − ARM. Armor-Piercing halves the target's *base* ARM, then Shield/Buckler/Shield Wall/spell bonuses add. Minimum 0. Rerolls replace dice |
| 12 | 08F–G | Would suffer damage | "Fails to exceed ARM" triggers; then Power Field: a model with it may spend 1 of its own focus (any time, even outside its activation) to reduce this instance by 5 (minimum 0); it still counts as damaged. Once per instance |
| 13 | 09 | Apply | One damaged model at a time (active player's order): mark boxes; grids roll the column (or Marksman picks), fill and spill (R3.4) |
| 14 | 09 | Systems | Check crippling (R3.6) |
| 15 | 09A–E | Death windows | "When damaged" → disabled → Tough window → boxed → boxed triggers → destroyed → destroyed triggers → remove (R3.9). Then the next damaged model |
| 16 | 10–13 | After resolution | The attack is resolved. Then, in three tiers: **(11)** the active player's "after the attack is resolved" triggers that don't make an attack (Beat Back, Banish, Swift Hunter's advance); **(12)** all of the inactive player's (Evasive, Reciprocate); **(13)** the active player's triggers that make an attack (Critical Shred), subject to R7.19. Trigger descriptors carry `makesAttack` |

- Simultaneous groups (AOE blast set, spray, trample, collateral) run steps 9–12 for every roll
  first, then 13–15 model by model, then 16 once (p85).
- Blast damage isn't a "hit" for on-hit triggers.
- Attacks outside an activation (Reciprocate, Avenging Force) use this pipeline with
  `outOfActivation`; focus can't be spent on them unless the rule says so (R4.10).

## R8 Focus, spells and feats

| ID | Rule |
|---|---|
| R8.1 | **Spending focus.** Casters spend their own focus; war-engines spend focus allocated to them or gained. Casters can't spend a war-engine's focus. Only in the model's own activation unless a rule says otherwise (R4.10) |
| R8.2 | **Uses** (1 focus each unless noted): boost an attack or damage roll; an additional melee attack; a Reload extra shot; a war-engine run, charge or power attack; shake (Control Phase, own focus); a caster heal (any time in its activation: 1 focus removes 1 of its own damage points, p101); Power Field (R7.18 step 12); spells (COST) |
| R8.3 | **Spells (p108):** COST, RNG (inches, SELF or CTRL), AOE, POW, DUR (`—` instant, `TURN`, `RND`, `UP`), OFF (yes/no). Cast any number per activation while focus lasts, the same spell more than once too, "any time" in the activation, never after running. Sequence (A1): pay COST → declare target → "when targeted" → range check → resolve |
| R8.4 | **Offensive spells** are arcane attacks: 2d6 + AAT vs DEF, using the ranged DEF modifiers (R6.11), Stealth and Target in Melee, but not ranged-only rules (Aim, R7.7). The damage is magical |
| R8.5 | **Targeting:** a spell may target any model in the point of origin's LOS (CTRL spells: within the caster's CTRL, LOS still needed). A non-offensive spell with a numeric RNG may target its own point of origin. SELF spells affect the caster only. Out of range: an offensive spell misses automatically; a **non-offensive spell is still cast** (COST paid) and has no effect |
| R8.6 | **Upkeep (p110):** costs 1 in each Control Phase (R4.7). A caster has at most one instance of each upkeep spell in play; recasting it ends the old casting when the new COST is paid. Each model or unit carries at most 1 friendly and 1 enemy upkeep; a newer one from the same side replaces the older only when the new spell actually affects (or hits) a model there, so a missed offensive upkeep replaces nothing. For a unit, one affected trooper is enough. The caster's upkeeps end when it is destroyed or RFP'd |
| R8.7 | **Channelling (p111):** through an Arc Node cohort within the caster's CTRL. The node is the point of origin and needs LOS; the caster needs none. Not while the node is engaged, knocked down or stationary. SELF spells can't be channelled. The node can't be the target of an offensive spell channelled through it. No Recon model has Arc Node |
| R8.8 | **Feat:** once per game, any time during the caster's activation |
| R8.9 | **Inert war-engine (p96)** (its caster is gone): base DEF 5, hit automatically in melee, no melee range (can't engage or be engaged; nothing is in melee with it), never activates, advances or attacks, can't contest or control, loses all focus and can't gain any, and loses Shield/Buckler ARM |
| R8.10 | **Accumulator:** a model that starts its activation within 3" of a qualifying friendly model gains 1 focus (the 3-focus cap still applies, QS p40) |

## R9 Conditions and continuous effects

| ID | Condition | Rule |
|---|---|---|
| R9.1 | Knocked down (p99) | Base DEF 5. Hit automatically in melee. No melee range, so it can't engage or be engaged. Can't advance, make attacks or ★Actions, cast spells, use its feat, or channel. Doesn't block LOS and is never intervening. Loses Tough. Not cumulative (a second knockdown does nothing). Ends by standing up (R9.2), shaking (R4.8) or Rise |
| R9.2 | Standing up | At the start of its next activation the model may forfeit either its Normal Movement or its Combat Action to stand. If it forfeits the Combat Action it may still full advance, but not run, charge, slam or trample |
| R9.3 | Stationary (p99) | Base DEF 5, hit automatically in melee, no melee range, can't advance, attack, use ★Actions, cast, use its feat or channel. Unlike knockdown it **still blocks LOS** and can't stand up. It ends with its duration or by shaking |
| R9.4 | Disruption (p70) | A war-engine loses all its focus, can't gain any (including allocation) and can't channel, for one round |
| R9.5 | Fire (continuous) | R4.2: POW 12 fire damage roll on 3–6, expires on 1–2. Resistance: Fire grants immunity (p69) |
| R9.6 | Corrosion (continuous) | R4.2: 1 corrosion damage point on 3–6, expires on 1–2. Resistance: Corrosion grants immunity |
| R9.7 | Cloud (p98) | 3" diameter. A model with any part of its base under it is in it; a model completely inside has concealment. LOS rule R6.5. No protection against melee |
| R9.8 | Hazard area | A model suffers the hazard when it enters the area (at most once per advance, p77; placement counts) and when it ends its activation in it (p126) |
| R9.9 | Gas | Effects tagged as gas don't affect models that ignore gas (Alchemical Mask) |
| R9.10 | Same-named effects (p62) | Don't stack. The effect lasts until its last instance expires (engine: keep the later expiry) |

## R10 Terrain (p122–126)

| Type | Move | LOS | Ranged DEF |
|---|---|---|---|
| Open | Normal | Clear | — |
| Rough (shallow water) | R5.12 | Clear | — |
| Rubble | Rough | Clear | Cover to a model completely inside |
| Forest | Rough | Huge bases never blocked. If the line starts or ends at a point inside the forest, it may pass through up to 3" of forest; more blocks. If both ends are outside it, the forest blocks LOS to anything beyond it, however thin | Concealment to a model completely inside |
| Obstacle (wall <1") | R5.13 | By height against volumes (R6.3) | Cover (wall) or concealment (hedge) within 1" of it along a line to the attacker; +2 in melee if partly obscured |
| Obstruction (building ≥1") | Impassable | By height against volumes | Cover within 1" along a line to the attacker; +2 in melee if partly obscured |
| Hill | Open, elevation to models completely within | Tall hills can block by height | Elevation +2 only; no cover or concealment |
| Hazard | Open plus the hazard (R9.8) | Clear (burning earth is also a cloud) | — |
| Deep water / impassable | Impassable | Clear | — |
| Scenario terrain | As its base type | As its base type | As its base type, plus scenario control (11-scenarios.md) |

## R11 Recon army and deployment

| ID | Rule |
|---|---|
| R11.1 | **Recon (p118):** 30 points, 1 Leader (free), at least 1 non-lesser cohort in its battlegroup. No battle engines, colossals or gargantuans. A list may come in up to 4 points under |
| R11.2 | Characters (FA C) appear at most once. Units take ≤1 command attachment and ≤3 weapon attachments (none in Recon) |
| R11.3 | **Table** 36"×36". Depth: first player 6", second player 11" (QS p34). On 48" tables the core default is 7" and 10" (p117) |
| R11.4 | **Turn order (p116):** both roll d6, rerolling ties. The high roller chooses to be first or second player; then the **second player** chooses the table edge. The first player deploys on the opposite edge |
| R11.5 | **Deployment order (p116):** the first player deploys (except models held for Advance Deployment), then the second player. Then the first player's Advance Deployment models, then the second player's, up to 3" beyond the zone. Unit troopers deploy within 3" of every other trooper. Then Prey (and similar) choices are made |
| R11.6 | **Ambush (p117):** the model needn't be deployed. At the end of any of its controller's Control Phases after round 1, it may be placed completely within 3" of any table edge except the back edge of the opponent's deployment zone (units within 3" of each other). That turn it forfeits either its Normal Movement or its Combat Action. Ambush and Advance Deployment are options; a model may deploy normally |
| R11.7 | Casters start with focus = ARC. War-engines start with 0 |

## R12 Victory hooks and timing

| ID | Rule |
|---|---|
| R12.1 | **Assassination (p116, SR p4):** the moment one player has the only Leader left in play, that player wins and the game ends, even mid-activation. If every Leader is destroyed at once, the game ends and the tiebreakers decide (V1.1) |
| R12.2 | "Until end of turn" = until the end of the current player turn |
| R12.3 | "For one round" = until the start of the creating player's next turn (p72). "For one turn" (TURN) = until the end of the current player turn (unsourced) |
| R12.4 | **Trigger order (p62, A1):** effects triggered at the same moment resolve active player first, in the order they choose, then the inactive player. Each trigger's condition is rechecked as it resolves; a lapsed one doesn't resolve. "After the attack is resolved" uses the three tiers of R7.18 step 16 |
| R12.5 | Model rules beat the core rules. "Cannot" beats "can" and "must" (p62) |
| R12.6 | Measuring is free at any time (the UI shows the ruler and the LOS view) |
