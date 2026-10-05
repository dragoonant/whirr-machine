# Rules to check

Each line follows `RULING: <rule> | <what we did> | <why>`. The owner reconciles these in one sitting.

## Rules core, scenarios and starter data (M0 spec pass, 2026-10-04; no official PDFs in docs/sources)
RULING: Dice floor | A roll always keeps at least 1 die after crippled/resistance removals | Not stated in the handoff; avoids 0-die rolls
RULING: Crippled weapon system | −1 die on attack and damage, no power or ★attacks, Shield/Buckler lost | Handoff E.3; the community digest says −4, which looks wrong or MK3-era
RULING: Heavy grid systems | Deuce and Razor: L/M/C/R only (3 boxes each), no H; heights 4/5/6/6/5/4 | Community card data; the handoff guessed H in columns 3–4
RULING: Grid row indexing | Rows count from the top; damage fills top-down, so system boxes fill last | Community data keys system boxes by top-down index; handoff E.3 says top-down fill
RULING: Grid healing order | Heal the lowest filled boxes first in a column the healer picks | Not specified; nothing in Recon heals war-engines yet
RULING: Disabled/boxed models | Don't block LOS, engage or contest while still in the death windows | Mirrors removal timing; not specified
RULING: Both Leaders die simultaneously | Draw | Not specified in the handoff
RULING: One-round duration | Expires at the start of the creating player's next turn; "one turn" ends at the end of the current turn | Standard reading; the official timing is unconfirmed
RULING: War-engine focus cap 3 | Absolute (allocation, Power up and Accumulator can't push it past 3) | Handoff says "can hold at most 3"; the Accumulator interaction is unconfirmed
RULING: Caster heal | 1 focus removes 1 damage from the caster itself | Handoff E.8; the community digest says d3 per focus
RULING: Power Field scope | Any damage instance, including collateral, blast and continuous effects; once per instance | Handoff says "per damage instance"; the scope is unconfirmed
RULING: Pistol vs Gunfighter | Pistol: may shoot while engaged, only at an engager. Gunfighter: any ranged weapon, any target. Neither suffers +4 vs a target engaged only by the attacker | Black Penny on pistols implies Pistol doesn't ignore target-in-melee generally
RULING: Concealment/cover proximity | The bonus applies if the target is within 1" of an intervening feature, or inside a concealing feature | Community digest wording; the handoff is silent
RULING: Knocked-down DEF | Set to 5, and concealment/cover/elevation don't apply | "Base DEF 5" is ambiguous on whether terrain bonuses still add
RULING: Intervening model test | Blocks if the 3D segment passes through its volume (base ≥ target base) | Volumes are defined in E.6; 2D "over the base" would make heights pointless
RULING: Cloud LOS | Infinite-height 3" cylinder; blocks unless the viewer or target is in it | Handoff: "into and out of, not through"
RULING: Forest LOS | A segment through more than 3" of forest is blocked | Community digest; the handoff is silent
RULING: Model volume heights | 30 mm 1.75", 40 mm 2.25", 50 mm 2.75", 80 mm 2.75", 120 mm 5" | Community digest; the 80 mm value is a guess
RULING: Spray modifiers | Ignores concealment, cover and Stealth; target-in-melee still applies | Digest says it also ignores target-in-melee; we kept it pending verification
RULING: AOE blast boost | Each blast roll is boostable separately at 1 focus | Not specified in E.7
RULING: Slam with less than 3" moved | Hit deals damage only: no movement and no knockdown | Handoff: "nobody flies"; whether knockdown applies is unconfirmed
RULING: Collateral POW | Compares the attacking model's base to each collateral model's base | Handoff: "same comparison against each collateral model" is ambiguous
RULING: Falling damage | POW 12, +1 die per full 2" beyond the first 1" | Handoff "+1 die per extra 2"" read literally
RULING: Unit placement | Completely within 2" of the moved trooper and in its LOS | Handoff says "within 2""; "completely" is our assumption
RULING: Deployment order | P1 normal, P2 normal, then Advance Deployment models in turn order | Not specified in the handoff
RULING: Ambush entry | From round 2, at the end of the Control Phase, completely within 3" of a non-opponent edge; forfeits movement or the Combat Action | Community digest
RULING: Resistance and continuous effects | Resistance: Fire/Corrosion also blocks gaining the matching continuous effect | Community digest; the official wording is unconfirmed
RULING: Unstoppable | Model can't be knocked down | Not in either source text; recalled meaning
RULING: Scoring | Both players score at the end of every player turn from P2's round 2 turn; lead-by-3 is checked for the non-active player | Inferred from "can't win on your own turn"
RULING: Scenario presence tiebreak | Points of eligible models within 3" of any scenario element; Leader = 10 | Handoff gives "Leaders count as 10" only
RULING: Leaders and scenario | Leaders can control but can't contest | Handoff E.10 lists Leaders as non-contesters
RULING: Knocked-down models and scenario | They still control and contest | Not specified
RULING: Kill Box on 36" tables | Kept at 12" | Handoff gives 12" with no table-size scaling
RULING: Ashwall Divide | Original layout: 2 walls at y=18 (scenario terrain, hold 2"/contest 3"), central obstruction, 2 forests, 2 rubble, point-symmetric | QS-style placeholder until the QS PDF is checked
RULING: Trooper health | Black 13th and Hounds troopers have 1 box each | Community data gives no health for them; MK3 Black 13th had more boxes
RULING: Per-trooper loadouts | Each Black 13th and Hounds trooper carries different weapons (from the data) | Handoff G lists one loadout for all of them
RULING: Spell stats | Caine and Vilkul spell names come from the data; every COST/RNG/AOE/POW/DUR/OFF is TBD | Neither source has spell stats
RULING: Razor grenade launchers | No location, so arm crippling doesn't affect them | Community data has no location for them
RULING: Death states | disabled -> boxed -> destroyed, one advanceLife path with windows death.disabled/boxed/destroyed (00 §6.2) | handoff E.3 names the states; exact step semantics to confirm in the timing appendix
RULING: Shake payer | spec lists shake as 1 focus paid by the caster for itself or its war-engine (00 §4) | handoff E.4 says 1 focus each without naming the payer; verify whether war-engines spend their own focus
RULING: Grid column alignment | columns stored top box first, drawn bottom-aligned; example heavy L 1-2, M 2-3, H 3-4, C 4-5, R 5-6 | handoff E.3 typical layout; verify per real model
RULING: Blast damage order | direct damage resolves first, then all blast/collateral damage as one simultaneous batch (00 §7) | handoff E.7 says spray damage is simultaneous; AOE order to confirm in the timing appendix
RULING: Power Field in AI math | AI assumes the defender spends reserve focus greedily on the first positive damage instances | closed-form approximation; engine applies the real choice
RULING: Crit definition | crit = hit with at least two matching dice (40 §3) | handoff E.2; verify against the core rules

## Engine contracts (M0, 2026-10-04)
RULING: RNG algorithm | sfc32 seeded by cyrb128, state [u32 x4] in state.rng | 00 §9 names it; the task allowed mulberry32 but 00 wins on shapes
RULING: Coordinate frame | Engine uses table-centre origin, {x,z}, +z toward player B (20 §7); 11-scenarios S1 uses a corner origin {x,y} and must be converted when the scenario JSON is written | Two specs disagree; 00/20 win on shapes
RULING: DataBundle type | Engine declares a placeholder DataBundle {version, byId} and descriptor types (ConditionNode, EffectNode) in hooks.ts until src/data/types.ts exists | Engine may only import data types; that file does not exist yet
RULING: Dice kept order | DiceRolled.kept lists kept dice highest first after discard-lowest | Display only; totals are unaffected
