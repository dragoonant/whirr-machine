# 10 Rules core (MK4, focus-only, Recon 30)

Engine contract for the rules. All prose is ours. Mechanics follow Warmachine MK4.
- **Sources:** handoff Part E (primary). Cross-checked against community card data and a community
  rules digest (research only, not shipped). `docs/sources/` was empty when this was written, so no
  official PDF has been checked yet.
- `(verify)` marks a point that is not confirmed against the official rules PDF. Rulings live in
  `docs/needs-rules-check.md`.
- Section IDs (`R5.3`) are referenced by `12-rules-test-checklist.md`.

## R0 Conventions and the MK3 guard

| Term | Meaning |
|---|---|
| inch | All distances are in inches and stay exact (never rounded) |
| within d | The nearest base edge is ≤ d from the reference edge or point |
| completely within d | The whole base is ≤ d |
| Leader / caster | The warcaster. Free in points; a character |
| war-engine | A warjack (light 40, heavy 50, super-heavy 80, colossal 120 mm) |
| cohort | A war-engine in its caster's battlegroup |
| trooper / unit | A unit model; the unit activates together |
| solo | An independent non-Leader, non-cohort model |
| active player | The player whose turn it is |

**MK3 guard (hard fail if any appears in code or data):**

| Not in MK4 | MK4 rule |
|---|---|
| Facing, back arcs, back strikes, free strikes | 360° vision; leaving melee only forfeits the Combat Action |
| 0.5" melee | 1" melee (Reach 2") |
| Run = 2×SPD | Run = SPD+5" |
| Coherency, unit leader, command range | Move one trooper, place the rest within 2" |
| AOE templates, deviation, scatter | Closest-N blast (R7.9) |
| STR, the FOCUS stat | Flat weapon POW; ARC is the focus cap |
| STR-based power attack POW | POW 12/14 by base comparison |
| Free run/charge for war-engines | 1 focus each (a 'jack marshal within 8" waives it; not in Recon) |

## R1 Dice

| ID | Rule |
|---|---|
| R1.1 | All dice are d6. A d3 is a d6 halved and rounded up (1-2→1, 3-4→2, 5-6→3) |
| R1.2 | Rounding: halved or fractional values round **up**, except distances, which stay exact |
| R1.3 | Attack roll = 2d6 + MAT, RAT or AAT. It hits if the total is ≥ the target's DEF |
| R1.4 | If every die shows 1, the attack misses. If every die shows 6 it hits, unless only one die was rolled |
| R1.5 | **Critical**: a hit where any two dice show the same number. Crit effects need a hit |
| R1.6 | Auto-miss beats auto-hit. An auto-hitting attacker may still roll, only to look for a crit, and the hit stands whatever the dice show |
| R1.7 | Damage roll = 2d6 + POW + mods − ARM, minimum 0 |
| R1.8 | **Boost**: +1 die. Declared before the roll. Once per roll. Paid per roll (1 focus) or granted (charge, forced) |
| R1.9 | **Additional dice**: each rule that grants one adds one die. Several dice from *different* rules stack. The same rule never stacks with itself. A boost stacks with additional dice |
| R1.10 | **Removed dice**: Resistance to the damage type removes one die, and only one even if several types match. A crippled weapon system removes one die (R3.6). Removals stack with each other. A roll always keeps at least 1 die (verify) |
| R1.11 | "Discard the lowest" effects (Heart Seeker) add their die first and then drop the single lowest die |
| R1.12 | Rerolls happen before hit/miss triggers. The rerolled dice replace the originals. A roll can't be rerolled more than once by the same rule |
| R1.13 | Stat modifier order: **set → ×2 → ½ → bonuses → penalties**, floor 0. Effects with the same name don't stack; different named effects do |
| R1.14 | The AI uses exact closed-form distributions for 1–5d6 (no Monte Carlo needed) |

## R2 Models, stats and weapons

**Base classes**

| Base | Class | Volume height | Example |
|---|---|---|---|
| 30 mm | small | 1.75" | casters, solos, troopers |
| 40 mm | medium | 2.25" | light war-engine |
| 50 mm | large | 2.75" | heavy war-engine |
| 80 mm | large+ (verify class) | 2.75" (verify) | super-heavy |
| 120 mm | huge | 5.0" | colossal, battle engine, structure |

Base comparison ("bigger", "smaller", "equal") uses the diameter in mm.

**Model stats:** SPD, AAT, MAT, RAT, DEF, ARM, ARC (focus cap and refill), CTRL (inches from the
base edge), health (boxes or grid), base, advantages, abilities. There is no STR and no FOCUS stat.

**Weapon stats:** name, type (melee or ranged), attack stat, RNG (melee: 1 or 2; ranged: inches or
`SP X`), ROF (an integer or a dice expression such as `d3+1`), AOE, POW (`D` or `D/B` for an AOE),
location (`L`, `R`, `H`, `S` or none), qualities, abilities, quantity.

**Weapon qualities used in the first release**

| Quality | Effect |
|---|---|
| Pistol | Can be fired while the bearer is engaged (R7.7) |
| Magical damage | The damage is magical |
| Shield | +2 ARM while the weapon's system isn't crippled. Several shields stack |
| Buckler | +1 ARM while the weapon's system isn't crippled. Stacks with Shield |
| Weapon Master | +1 damage die with this weapon |
| Throw PA | The weapon can make Throw power attacks |
| Reach | Melee range 2" |
| Blessed | Ignores DEF and ARM bonuses that come from spells |

**Advantages used in the first release**

| Advantage | Effect |
|---|---|
| Dual Attack | Can mix melee and ranged initial attacks in one Combat Action |
| Gunfighter | Can make ranged attacks while engaged, at any target (R7.7) (verify) |
| Pathfinder | Ignores the rough terrain penalty |
| Tough | When disabled, roll d6. On 5–6 the model heals 1 box and becomes knocked down (R3.9) |
| Stealth | Ranged and arcane attacks from more than 5" away miss automatically |
| Unstoppable | Can't be knocked down (verify) |
| Construct | Not a living model |
| Advance Deployment | Deploys up to 3" beyond its deployment zone |
| Ambush | Starts off the table and enters later (R11.6) |
| Arc Node | Spells can be channelled through it (R8.7) |
| Resistance: X | −1 damage die against type X; immune to the matching continuous effect (verify) |
| Headbutt / Slam / Trample PA | The model can make that power attack. Read from data, never assumed from the model type |

## R3 Damage capacity, grids and death

| ID | Rule |
|---|---|
| R3.1 | Each damage point fills one box. A model without a health value has **1** box |
| R3.2 | Casters and solos have a single row of boxes (Caine 15, Vilkul 17, the solos 8) |
| R3.3 | **War-engine grid:** 6 columns, each with its own height. Boxes are indexed by row from the top (1 = top) |
| R3.4 | **Fill order:** roll d6 to pick the column, then fill unmarked boxes from the top down. When that column is full, continue at the top of the next column to the right, wrapping from column 6 to column 1. Each damage roll gets its own column roll. Marksman, and the attacker on a colossal, choose instead of rolling |
| R3.5 | **Systems:** letters on specific boxes (L, R, M, C, H, A). A system is **crippled** while every box carrying that letter is filled. Healing any one of those boxes un-cripples it |
| R3.6 | **Crippled effects:** see the table below |
| R3.7 | **Colossals** have two grids (left and right). An attack's damage goes to the grid the attacker picks. Other damage rolls d6: 1–3 left, 4–6 right. Not in Recon |
| R3.8 | **Healing** clears filled boxes. On a grid, clear the lowest-row boxes first in the column the healer picks (verify) |
| R3.9 | **Death states, one mechanism.** See below |
| R3.10 | **Removed from play (RFP)** skips the *destroyed* window. "Destroyed by" counts still count a model that was destroyed and then RFP'd by a replacement effect (Head Shot) |

**Crippled systems (R3.6)**

| System | While crippled |
|---|---|
| L / R (weapon location) | Attack and damage rolls with weapons in that location roll 1 fewer die. No power attacks or ★Attacks with them. Their Shield and Buckler ARM bonuses are lost |
| M movement | Base DEF becomes 5. No run, charge, slam or trample |
| C cortex | Loses all focus. Can't gain or spend focus, so no boost, run, charge or power attack |
| H head | Loses the rules the card grants to the head (no Recon model has H) |
| A arc node | Loses Arc Node |

**Death state machine (R3.9).** Every damage source enters it the same way.

| Step | State | Window (who acts) | Exit |
|---|---|---|---|
| D1 | The last box is filled | — | The model becomes **disabled** |
| D2 | disabled | *Disabled* triggers: Tough roll (unless the attacker has Head Shot or Take Down for this attack), healing effects | If any box is healed: back to normal, stop. Otherwise go to D3 |
| D3 | **boxed** | *Boxed* triggers: Eruption of Ash, Arcane Conflagration's 1" blast, "remove from play instead" effects | If RFP'd: removed, skip D4 triggers. Otherwise go to D4 |
| D4 | **destroyed** | *Destroyed* triggers: counters for Swift Hunter, Run & Gun and Gatecrasher, assassination check (R12.1), the Leader's war-engines turn inert | Remove the model |

- A disabled or boxed model doesn't block LOS, can't engage and can't contest, but it isn't
  removed until D4 (verify).
- With simultaneous damage (blast, spray, trample, collateral), apply every damage roll first.
  Then run D1–D4 for each affected model, active player's choices first.

## R4 Turn structure

A game is up to 7 rounds. Each round, every player takes one turn in a fixed order (first player
first). A turn runs: **start-of-turn → Maintenance → Control → Activation → end-of-turn (scoring)**.

| Step | ID | Action |
|---|---|---|
| Start | R4.0 | "Start of turn" effects. Effects that last "one round" and were created by this player expire now (verify) |
| Maint 1 | R4.1 | Remove all focus from this player's war-engines. Casters above ARC drop to ARC |
| Maint 2 | R4.2 | Each continuous effect on this player's models rolls d6. 1–2: it expires. 3–6: it resolves. Fire = POW 12 fire damage roll (not boostable); Corrosion = 1 damage point |
| Maint 3 | R4.3 | Other maintenance triggers (Rise stands the model up). Effects that last "one turn" expire at the end of the turn they were created in (R12.3) |
| Ctrl 1 | R4.4 | Casters refill to ARC |
| Ctrl 2 | R4.5 | **Power up:** each cohort with an uncrippled cortex and within its caster's CTRL gains 1 focus |
| Ctrl 3 | R4.6 | **Allocate:** the caster gives focus to cohorts within CTRL. A war-engine never holds more than **3** focus (verify whether the cap is absolute) |
| Ctrl 4 | R4.7 | **Upkeep:** the caster pays 1 per upkeep spell it wants to keep. Unpaid spells expire |
| Ctrl 5 | R4.8 | **Shake:** a caster or war-engine may spend 1 focus to end knockdown or stationary (or another effect marked shakeable) on itself |
| Ctrl 6 | R4.9 | Ambush models may enter (R11.6) |
| Act | R4.10 | Activate every model and unit once, in any order. Each activation: Normal Movement, then the Combat Action, then end-of-activation effects (Reposition) |
| End | R4.11 | End-of-turn scoring and victory checks (11-scenarios.md) |

- Casters start the game with focus = ARC (R11.7).
- "Any time" rules (spells, feats, heals) can be used before or after the move and between attacks.
  They can't be used mid-move, mid-attack, during another trigger, or after running.
- A model must activate unless a rule lets it skip. Inert models never activate.

## R5 Movement

**Normal Movement options (R5.1)**

| Option | Distance | Notes |
|---|---|---|
| Forfeit | 0 | — |
| Aim | 0 | +2 to ranged attack rolls this activation. Not allowed while engaged |
| Full advance | ≤ SPD | Any path |
| Run | ≤ SPD+5" | Forfeits the Combat Action. The activation ends after the move. A war-engine pays 1 focus. Not while engaged at the start |
| Charge | ≤ SPD+3", straight | R5.2. A war-engine pays 1 focus. Not while engaged |

| ID | Rule |
|---|---|
| R5.0 | Advancing is voluntary movement, measured by the distance the base travels. A base can't pass through another base or end overlapping one |
| R5.2 | **Charge:** needs a melee weapon. Declare an enemy target in LOS before moving (any range). Move in a straight line toward it, up to SPD+3". Once the target is in melee range the model may stop; before that it can't stop voluntarily. It stops on contacting a model, an obstacle or an obstruction |
| R5.3 | Success = the target is within melee range at the end of the move. If the model moved ≥3", its first melee attack against the target in this Combat Action is a **charge attack**, with an automatic damage boost. The charge attack must be the first attack it makes, at the charge target. With <3" moved it's still a success, but the attack isn't a charge attack |
| R5.4 | A failed charge ends the activation immediately (no Combat Action, no Reposition) |
| R5.5 | A model that charged can't make power attacks that activation |
| R5.6 | **Engaged at the start:** no run, charge or slam. Trample is still allowed (R7.14) |
| R5.7 | **Disengage:** a model that leaves the melee range of an enemy that was engaging it forfeits its Combat Action. There are no free strikes |
| R5.8 | **Unit movement:** pick one trooper and resolve its Normal Movement (advance, run or charge). Then **place** every other trooper completely within 2" of it and in its LOS (verify "completely"). A trooper that can't be placed legally is destroyed |
| R5.9 | Unit run: every trooper forfeits its Combat Action. Unit charge: only the chosen trooper charges; the placed troopers can make normal melee attacks |
| R5.10 | A placed trooper that ends outside the melee range of an enemy that was engaging it forfeits its Combat Action |
| R5.11 | Placement isn't advancing. It ignores rough terrain and obstacles in between, but the end point must be legal (no overlap, no obstruction, not in impassable terrain) |
| R5.12 | **Rough terrain:** if the model starts in rough terrain or enters it during the advance, the whole advance is reduced by 2" (minimum 1"). Pathfinder ignores this. It never applies to involuntary movement or placement |
| R5.13 | **Obstacles** (≤1" tall, such as walls): can be crossed only if the model has enough movement left to end completely past them. A model can't end its move on top of one unless it's wide enough to stand on (then it's elevated) |
| R5.14 | **Obstructions** (>1" tall, such as buildings): impassable except to Flight or Incorporeal (not in Recon) |
| R5.15 | **Push X:** move directly away from the source up to X". Stop on contacting a model, an obstacle or an obstruction. It isn't an advance, so no disengage forfeit and no rough penalty |
| R5.16 | **Slam X:** move directly away up to X" and become knocked down. The model passes through bases smaller than its own; each one it contacts is knocked down and takes collateral damage. It stops on an obstacle, an obstruction or an equal-or-larger base, and then takes +1 die on its slam damage. An equal-sized model it stops against also takes collateral |
| R5.17 | **Throw X:** like a slam, but the model flies over every base on the way. At the landing point it contacts everything under it: equal-or-smaller bases there take collateral and are knocked down. It stops early only on an obstruction (or an obstacle, verify) |
| R5.18 | **Collateral damage:** a damage roll at the power-attack POW (12 if the attacking model's base ≤ the collateral model's base, else 14), or at the weapon's POW for Momentum. Not boostable and not attack damage |
| R5.19 | **Falling** (moving off an edge ≥1" high): knocked down and a POW 12 damage roll, +1 die for each full 2" beyond the first 1" (verify the step) |
| R5.20 | **Table edge:** involuntary movement stops at the edge, with no extra damage |
| R5.21 | **Least disturbance:** if bases overlap after involuntary movement or placement, move the fewest models (never the one that moved) the shortest total distance to clear the overlap |
| R5.22 | **Place:** not movement. The base must end in a legal spot. It never triggers disengage forfeits unless the rule says so (R5.10 is the exception) |
| R5.23 | **Reposition [X]:** at the end of an activation in which the model or unit didn't run or fail a charge, it may advance up to X". A unit moves one trooper and places the rest (R5.8). Then the activation ends |

## R6 LOS and targeting

| ID | Rule |
|---|---|
| R6.1 | **Volume:** a vertical cylinder of the base diameter and the volume height (R2), standing on the model's surface elevation |
| R6.2 | **LOS** from A to B exists if at least one straight 3D segment, from any point of A's volume to any point of B's volume, isn't blocked (R6.3–R6.6) |
| R6.3 | LOS-blocking terrain (obstructions, forest depth rule R10) blocks a segment that passes through it |
| R6.4 | **Intervening models** block only if their base is **≥ the target's base**. A segment is blocked when it passes through that model's volume (3D) (verify 2D "over the base" vs 3D). These never block: A and B themselves, troopers of A's own unit, knocked-down models, and disabled or boxed models |
| R6.5 | **Clouds:** a cloud is a vertical cylinder of unlimited height (3" across). A segment that passes through a cloud is blocked unless A or B is within that cloud. You can see into and out of a cloud, but not through it. True Sight and Enhanced Alchemical Mask ignore clouds for LOS |
| R6.6 | **Elevation:** a model on terrain ≥1" higher than another is *elevated* relative to it. An elevated viewer ignores lower intervening models, except those within 1" of the target. A lower viewer ignores intervening models that are lower than the target |
| R6.7 | Vision is 360°. There is no facing |
| R6.8 | **Range** is measured from the edge of the point of origin's base nearest the target to the nearest edge of the target's base. Point of origin = the attacker, or the channelling arc node. LOS and LOS-based modifiers also use the point of origin |
| R6.9 | Range is checked after the attack is declared. An out-of-range attack misses automatically (R7.3) |
| R6.10 | **Stealth:** a ranged or arcane attack whose point of origin is more than 5" from a Stealth target misses automatically. Spray rolls ignore Stealth (verify). True Sight ignores Stealth. Prowl grants Stealth while the model has concealment |

**DEF modifiers against ranged and arcane attacks (R6.11)**

| Modifier | DEF | When |
|---|---|---|
| Concealment | +2 | The target is within a concealing feature (forest, cloud, hedge), or within 1" of one that intervenes (verify) |
| Cover | +4 | The target is within 1" of an intervening cover feature (wall, rubble, building) (verify). Doesn't stack with concealment; use the higher |
| Elevation | +2 | The target is elevated relative to the attacker's point of origin. Stacks with cover or concealment |
| Target in melee | +4 | The target is engaging or engaged by any model other than the attacker (verify) |
| Knocked down or stationary | DEF = 5 | It's a *set*, so it's applied before the bonuses (R1.13). Concealment, cover and elevation don't apply (verify) |
| 80 mm or 120 mm base | — | Never gains concealment, cover or elevation |

- Ignoring modifiers: Black Penny ignores target in melee; Alchemical Mask ignores cloud
  concealment; Enhanced Alchemical Mask ignores all concealment; Arcing Fire ignores intervening
  models for LOS.
- **Melee DEF modifiers:** +2 if the target is partly obscured from the attacker by an obstacle or
  obstruction. Knocked-down and stationary targets are hit automatically in melee.

## R7 Combat Action

**R7.1 The Combat Action choices (pick one).** A trooper in a unit chooses its own.

| Choice | Detail |
|---|---|
| Melee initial attacks | One initial attack with each melee weapon, against targets in that weapon's range |
| Ranged initial attacks | ROF initial attacks with each ranged weapon (roll ROF dice first when it's a dice value) |
| Dual Attack | Both of the above together, in any order |
| ★Attack | One special attack instead of all initial attacks (Both Barrels) |
| ★Action | One special action |
| Power attack | One (R7.10–R7.13). A war-engine pays 1 focus |
| Forfeit | — |

| ID | Rule |
|---|---|
| R7.2 | **Additional attacks.** Melee: 1 focus each, from the model's own focus (casters and war-engines), with any melee weapon. Ranged: only through Reload [N] (up to N extra, 1 focus each) or Reload [∞]. Additional attacks come after the initial attacks of that weapon type (verify) |
| R7.3 | **Declare, then measure:** the target must be in LOS when declared. A melee target must also be in that weapon's range. A ranged target that turns out to be beyond RNG is missed automatically |
| R7.4 | A war-engine that made a power attack can't make ranged attacks that activation. Power attacks are never additional attacks |
| R7.5 | Casters may cast spells and use the feat between attacks ("any time") |
| R7.6 | **Engaged / engaging:** A is *engaged* if A is within an enemy's melee range and that enemy has LOS to A. The enemy is then *engaging* A. Knocked-down models neither engage nor are engaged |
| R7.7 | **Shooting while engaged:** with a Pistol weapon, the model may target only models engaging it. Gunfighter models may use any ranged weapon and pick any target. Neither pays the target-in-melee +4 when the target is engaged only by the attacker (verify) |
| R7.8 | **Melee:** 2d6 + MAT. Each weapon reaches only within its own melee range (1" or 2"). The model's melee range is its longest |
| R7.9 | **AOE (no templates):** on a direct hit, the target takes the direct POW. Then the N closest *other* models within N" of the target's base edge take blast POW (N = AOE), friend and foe alike. Ties are broken at random. On a miss, if the target was in range, only the target takes blast POW. Out of range: nothing happens. Blast rolls are simultaneous; each is boostable separately (verify). Brutal Damage doesn't apply to blast. Resistance: Blast removes a die from blast rolls |
| R7.10 | **Power attacks, common:** a melee attack (2d6 + MAT). Not in an activation where the model charged. POW 12 if the attacker's base ≤ the target's base, else 14. On a hit the target is moved or knocked down first, then takes damage. The damage roll is boostable |
| R7.11 | **Headbutt:** range 1" (2" for 120 mm). The target's base must be ≤ the attacker's. Hit: knocked down, then damage |
| R7.12 | **Slam:** uses both the movement and the Combat Action. Declare a target in LOS, then advance up to SPD+3" directly toward it; the target must be within 1" at the end. −2 to hit a larger base. With ≥3" moved, a hit slams the target d6" directly away (half that, rounded as a distance, if its base is larger; +2" if the attacker is 120 mm), then knocks it down and deals damage (+1 die if it stopped against something, R5.16). With <3" moved, a hit deals damage only. Not reaching the target ends the activation |
| R7.13 | **Throw:** needs an uncrippled weapon with Throw PA. Range 1". The target's base must be ≤ the attacker's. Hit: thrown d6" directly away from the attacker (R5.17), knocked down, then damage |
| R7.14 | **Trample:** large base or bigger. Uses both the movement and the Combat Action. Allowed while engaged, with no disengage forfeit. Advance up to SPD+3" in a straight line. It passes through small (30 mm) bases and stops at bigger bases or terrain. Then it makes one melee attack roll against each small enemy model it passed over. The rolls and damage are simultaneous. Damage uses the power-attack POW |
| R7.15 | **Spray (SP X):** draw a line from the attacker's base edge through the target's centre, X" long. Every model whose volume the line crosses is a potential target and gets its own attack roll. A model completely blocked from the attacker by terrain is excluded; clouds are ignored. Concealment, cover and Stealth are ignored (verify target in melee). All hits are direct; damage is simultaneous; each roll is boosted separately |
| R7.16 | **Combined attacks:** the primary attacker gets +1 to attack and damage per contributing trooper. No first-release model has them |
| R7.17 | **Charge attack:** an auto-boosted damage roll (R5.3). Cavalry also boost the attack roll (none in Recon) |

**R7.18 Attack pipeline, one attack (normative timing)**

| # | Step | Detail |
|---|---|---|
| 1 | Declare | Attacker, weapon or spell, attack kind (melee / ranged / arcane / power / spray / AOE), target. Check legality: LOS (R6.2), engagement limits (R7.7), melee weapon range, target type. Pick any "Attack Type" option for the weapon now |
| 2 | Measure | Range from the point of origin. Out of range → auto-miss (an AOE does nothing). Stealth >5" → auto-miss |
| 3 | Modifiers | The attack stat and its bonuses (Aim +2, slam −2, Volume Fire, combined); the target's DEF with R6.11 / melee mods; auto-hit flags (knocked down or stationary in melee, inert); die counts (crippled −1, additional dice) |
| 4 | Attack boost decision | Pay 1 focus, or it's forced (Powerful Attack: pay 1 focus *or* boost both rolls) |
| 5 | Roll | Roll the dice (skip it if auto-missing; optional if auto-hitting) |
| 6 | Rerolls | Apply any reroll effects; the new dice replace the old |
| 7 | Resolve | All 1s → miss. All 6s (≥2 dice) → hit. Total ≥ DEF → hit. Crit = hit + any matching pair. Auto-miss beats auto-hit |
| 8 | Hit/miss triggers | On hit: Witch Mark, Thunderbolt push, Critical Knockdown, Momentum slam, power-attack movement or knockdown. AOE: fix the blast set now (closest N). On miss: AOE blast on target only (if in range); else jump to 16 |
| 9 | Damage boost decision | Per damage roll: charge attack (auto), Powerful Attack (forced), or 1 focus |
| 10 | Damage dice | 2 + boost + additional dice (Brutal Damage on a direct hit, Weapon Master, Heart Seeker, Decrepitation vs construct, Siege Weapon vs huge, slam stop +1, Both Barrels +4 flat) − Resistance die − crippled die |
| 11 | Damage roll | Roll; damage rerolls; discard-lowest effects. Damage = total + POW + flat bonuses − ARM (Armor-Piercing halves the target's *base* ARM, then add Shield/Buckler/Shield Wall/spell bonuses). Minimum 0 |
| 12 | Power Field | A Leader about to take damage may spend 1 focus to reduce this damage instance by 5 (minimum 0). Once per instance |
| 13 | Apply | Mark the boxes. Grids: roll the column (or Marksman picks), fill and spill (R3.4) |
| 14 | Systems | Check crippling (R3.6) |
| 15 | Death windows | If the last box is filled: disabled → Tough window → boxed → boxed triggers → destroyed → destroyed triggers (R3.9). Head Shot or Take Down blocks the Tough roll |
| 16 | After resolution | "After the attack is resolved" triggers, active player first, then the other player: Beat Back, Banish, Evasive, Reciprocate, Swift Hunter, Critical Shred's extra attack. Then the next attack |

- Simultaneous groups (AOE blast set, spray, trample) run steps 9–11 for every roll, then step 13
  for all of them, then 15 for all of them, then 16 once.
- Blast damage isn't a "hit" for on-hit triggers.

## R8 Focus, spells and feats

| ID | Rule |
|---|---|
| R8.1 | **Spending focus.** Casters spend their own focus; war-engines spend focus allocated to them (or gained). Casters can't spend a war-engine's focus |
| R8.2 | **Uses** (1 focus each unless noted): boost an attack or damage roll; an additional melee attack; a Reload extra shot; a war-engine run, charge or power attack; shake (Control Phase); a caster heal (any time in its activation: 1 focus removes 1 damage point from itself (verify); the digest says d3); Power Field (R7.18 step 12); spells (COST) |
| R8.3 | **Spells:** COST, RNG (inches, SELF or CTRL), AOE, POW, DUR (`—` instant, `TURN`, `RND`, `UP`), OFF (yes/no). Cast any number per activation while focus lasts, "any time" in the activation (R4.10), never after running |
| R8.4 | **Offensive spells** are arcane attacks: 2d6 + AAT vs DEF, using the ranged DEF modifiers (R6.11) and Stealth. The damage is magical. A caster may cast while engaged; the target-in-melee bonus applies as for ranged attacks (verify) |
| R8.5 | **Targeting:** spells with a target need LOS and range from the point of origin. CTRL spells measure from the caster. SELF spells affect the caster only |
| R8.6 | **Upkeep:** costs 1 in each Control Phase (R4.7). Each model or unit carries at most 1 friendly and 1 enemy upkeep; a newer one from the same side replaces the older. The caster's upkeeps end when it is destroyed |
| R8.7 | **Channelling:** through an Arc Node cohort within the caster's CTRL. The node is the point of origin, and the caster needs no LOS to the target. Not allowed while the node is engaged, knocked down or stationary. SELF spells can't be channelled. No Recon model has Arc Node |
| R8.8 | **Feat:** once per game, any time during the caster's activation |
| R8.9 | **Inert war-engine** (its caster is destroyed): DEF 5, hit automatically in melee, never activates, can't contest or control, and loses all focus |
| R8.10 | **Accumulator:** a model that starts its activation within 3" of a qualifying friendly model gains 1 focus (the R4.6 cap still applies, verify) |

## R9 Conditions and continuous effects

| ID | Condition | Rule |
|---|---|---|
| R9.1 | Knocked down | DEF 5. Hit automatically in melee. No melee range, so it can't engage or be engaged. Can't advance, attack or cast. Doesn't block LOS. Ends by shaking (R4.8), Rise, or standing up |
| R9.2 | Standing up | In its activation the model forfeits either its Normal Movement or its Combat Action to stand up. If it forfeits the Combat Action it may still advance, but not run, charge, slam or trample |
| R9.3 | Stationary | Like knocked down, but it can't stand up. It ends with its duration or by shaking |
| R9.4 | Disruption | A war-engine loses all its focus and can't gain any for one round |
| R9.5 | Fire (continuous) | R4.2: POW 12 fire damage roll on 3–6, expires on 1–2. Resistance: Fire blocks gaining it (verify) |
| R9.6 | Corrosion (continuous) | R4.2: 1 damage point on 3–6, expires on 1–2 |
| R9.7 | Cloud | 3" diameter, blocks LOS through it (R6.5). A model completely inside has concealment |
| R9.8 | Hazard template | A model entering it, or ending its activation in it, suffers the hazard (e.g. POW 12 fire damage roll). Once per model per activation (verify) |
| R9.9 | Gas | Effects tagged as gas don't affect models that ignore gas (Alchemical Mask) |
| R9.10 | Same-named effects | Don't stack; the newer one refreshes the duration (verify) |

## R10 Terrain

| Type | Move | LOS | Ranged DEF |
|---|---|---|---|
| Open | Normal | Clear | — |
| Rough (rubble, shallow water) | R5.12 | Clear | Rubble: cover if within 1" and intervening (verify) |
| Forest | Rough | A segment passing through more than 3" of forest is blocked (verify) | Concealment for models within it |
| Obstacle (wall ≤1") | R5.13 | Doesn't block LOS | Cover if within 1" and intervening; +2 in melee if partly obscured |
| Obstruction (building >1") | Impassable | Blocks | Cover if within 1" and partly obscured |
| Hill | Open, elevated | Elevation rule R6.6 | +2 elevation |
| Hazard | Open plus the hazard effect | Clear | — |
| Deep water | Impassable | Clear | — |
| Scenario terrain | As its base type | As its base type | As its base type, plus scenario control (11-scenarios.md) |

## R11 Recon army and deployment

| ID | Rule |
|---|---|
| R11.1 | **Recon:** 30 points, 1 Leader (free), at least 1 non-lesser war-engine. No battle engines, colossals or gargantuans. A list may come in up to 4 points under |
| R11.2 | Characters (FA C) appear at most once. Units take ≤1 command attachment and ≤3 weapon attachments (none in Recon) |
| R11.3 | **Table** 36"×36". Depth: first player 6", second player 11" (QS values, verify). At 48": 7" and 10" (verify) |
| R11.4 | **Turn order:** both roll d6, rerolling ties. The high roller chooses to go first or second; the other player picks the table edge |
| R11.5 | **Deployment order:** the first player deploys their whole army, then the second player. Then Advance Deployment models, first player first (verify order). Advance Deployment allows +3" of depth. Unit troopers deploy within 3" of each other |
| R11.6 | **Ambush:** the model isn't deployed. At the end of any of its controller's Control Phases from round 2 on, it may be placed completely within 3" of any table edge except the opponent's back edge. On that turn it forfeits either its Normal Movement or its Combat Action (verify). A model with both Ambush and Advance Deployment chooses one |
| R11.7 | Casters start with focus = ARC. War-engines start with 0 |

## R12 Victory hooks and timing

| ID | Rule |
|---|---|
| R12.1 | **Assassination:** the moment a player has no Leader left (destroyed or RFP'd), the opponent wins and the game ends mid-activation. If both Leaders go in one simultaneous resolution, the game is a draw (verify) |
| R12.2 | "Until end of turn" = until the end of the current player turn |
| R12.3 | "For one turn" = until the end of the current player turn (verify). "For one round" = until the start of the creating player's next turn (verify) |
| R12.4 | **Trigger order:** when several effects trigger at once, the active player resolves all of theirs in the order they choose, then the inactive player resolves theirs |
| R12.5 | Model rules beat the core rules. "Cannot" beats "can" and "must" |
| R12.6 | Measuring is free at any time (the UI shows the ruler and the LOS view) |
