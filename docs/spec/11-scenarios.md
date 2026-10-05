# 11 Scenarios and victory

How a game is won, and the scenarios we ship. Sources: Quick Start guide Jul 2025 (`QS p<n>`),
Steamroller 2026 (`SR p<n>`), MK4 rulebook (`p<n>`). `(unsourced)` = our ruling, logged in
`docs/needs-rules-check.md`. Coordinates follow 20 §7: inches, origin = table centre, `{x, z}`, +z toward
player B (the second player in S1).

**Ruling (2026-10-04): S1 uses the Quick Start rules** (hold 2+ models within 2", contest within 2",
scoring from round 1). Steamroller rules (V2.1–V2.4) are implemented for later scenarios and tested with
the fixture `scn-test-sr`.

## V1 Victory conditions (every scenario)

| ID | Rule |
|---|---|
| V1.1 | **Assassination (p116, SR p4):** when one player has the only Leader left in play, they win at once, even mid-activation. If all Leaders go in one simultaneous resolution, the game ends and V1.5 then V1.6 decide (no automatic draw). Scoring is still run once on the final state for the record (SR p4) |
| V1.2 | **Scoring time:** at the end of every player turn from the scenario's start (`scoring.fromRound` / `fromPlayer`). S1 (QS p38): from the first player's round-1 turn. SR scenarios: from the second player's round-2 turn. **Both** players score at every scoring point (QS p39, SR p5) |
| V1.3 | **Lead-by-3:** right after scoring at the end of a turn, the *non-active* player wins if their VP ≥ the active player's VP + 3 (QS p35, SR p5). Nobody wins this way at the end of their own turn |
| V1.4 | **Round limit:** the game ends after round 7, both turns (SR p5; QS sets none, we use 7). Then V1.5 |
| V1.5 | **Tiebreak 1, VP:** more VP wins. **Tiebreak 2, scenario presence (SR p4):** each player totals the points of their models that could control a scenario element they are in or near (whether or not it is contested): the element's hold range and hold eligibility apply, so a Leader counts (worth 10) and a unit counts its full cost only if all its remaining troopers are in range of the same element (our reading). Ignore models with no cost, inert and wild models. Higher total wins |
| V1.6 | **Tiebreak 3:** still tied → draw (unsourced) |
| V1.7 | **Kill Box (SR p3):** only in scenarios with `killBox`. From the first player's round-2 turn, a player who ends their turn with their Leader *completely within* the depth (12") of their own table edge gives the opponent 2 VP. Checked before V1.3. Not scaled on 36" tables (unsourced). S1 has none |
| V1.8 | **Concession / timeout:** out of scope until the optional clock (later) |

## V2 Scenario elements and control (Steamroller, SR p3)

**Who counts (SR p3)**

| Model state | Can control (secure) | Can contest |
|---|---|---|
| Leader | yes | **no** (SR); S1 overrides: yes |
| War-engine (not inert) | yes | yes |
| Solo, trooper | yes (per element) | yes |
| Inert, wild, disabled or boxed | no | no |
| Knocked down or stationary | yes (not in SR's exclusion list) | yes |
| Off table (Ambush, not yet arrived) | no | no |

**Element types**

| ID | Element | Secured when (and not contested) | Contested by |
|---|---|---|---|
| V2.1 | 50 mm objective | ≥1 friendly Leader, war-engine or battle engine within 3" | any eligible enemy within 3" |
| V2.2 | 40 mm objective | ≥1 friendly Leader within 3", **or** every remaining trooper of one friendly unit within 3" | any eligible enemy within 3" |
| V2.3 | Flag (30 mm) | Marks scenario terrain: before deployment each player picks a terrain piece within 5" of their flag, which becomes V2.4 terrain. With no valid piece, the flag itself becomes an obstruction scenario-terrain piece | — |
| V2.4 | Scenario terrain | ≥1 friendly Leader, **or** ≥1 friendly solo, **or** ≥2 friendly models of any other kinds, within the terrain's area (or within 3" of it when standing inside is impossible) | one eligible enemy in the area (or within 3") |

- An element that is contested has no controller.
- Objectives and caches are not models and don't block LOS. A model may advance (or be pushed,
  slammed or thrown) through one only if it can end completely past it; otherwise it stops short.
  No extra die or collateral for contacting one (SR p3).
- Control is evaluated only at scoring time (V1.2); there is no persistent "captured" state.

## S1 First scenario: **Ashwall Divide** (`scn-ashwall-divide`)

Quick Start rules (QS p35, p39) on our own layout. Recon 30, 36"×36". Two ruined walls across the middle
are the scenario terrain. The name and layout are ours.

| Setting | Value |
|---|---|
| Table | 36"×36" |
| Rounds | 7 |
| Turn order | R11.4 (roll-off; the winner chooses first/second; the **second** player picks the edge) |
| First player deployment zone | z ∈ [−18, −12]. Advance Deployment: z ≤ −9 |
| Second player deployment zone | z ∈ [7, 18]. Advance Deployment: z ≥ 4 |
| Ambush entry | R11.6: from round 2, completely within 3" of the left, right or own edge |
| Scoring | `{fromRound: 1, fromPlayer: 'first', winMargin: 3, winOnOpponentTurnOnly: true}` |
| Kill Box | none (QS has none) |

**Layout** (centre points; point-symmetric about the origin)

| ID | Element | Type | Centre (x, z) | Size | Notes |
|---|---|---|---|---|---|
| W1 | West wall | Scenario terrain + obstacle | (−9, 0) | 5"×1", long axis along x, 1" tall | Gives cover. Held by ≥2 models within 2"; contested by 1 enemy within 2" |
| W2 | East wall | Scenario terrain + obstacle | (9, 0) | 5"×1", long axis along x, 1" tall | As W1 |
| B1 | Pumphouse | Obstruction (blocks LOS) | (0, 0) | 3"×3", 3" tall | Impassable; cover within 1" |
| F1 | Copse | Forest (rough, concealment) | (11, −9) | ellipse 6"×4", long axis along x | Point-symmetric to F2 |
| F2 | Copse | Forest | (−11, 9) | ellipse 6"×4" | — |
| R1 | Rubble | Rough terrain, cover inside | (−5, −7) | 3"×2" | Point-symmetric to R2 |
| R2 | Rubble | Rough terrain, cover inside | (5, 7) | 3"×2" | — |

**Wall control (QS p35):** a player holds a wall with ≥2 of their models (any kind, Leaders
included) within 2" of it; one eligible enemy model within 2" contests it. Leaders **may** contest in
S1 (QS: "one of their models"; unsourced). Inert, disabled and off-table models never count.

| Condition at each scoring point | VP |
|---|---|
| You hold W1 | 1 |
| You hold W2 | 1 |

**Victory:** assassination (V1.1), lead-by-3 (V1.3), or the most VP after round 7, then V1.5–V1.6.

**Default armies (Part G):** Cygnar — Caine, Deuce, Falk, The Black 13th. Khador — Vilkul, Razor,
Lazarenko, The Hounds. Each list is 30 points.

**Element data (20 §7):** `{kind:'scenarioTerrain', terrain:'w1', hold:{within:2, models:2, eligible:['any']},
contest:{within:2, excludes:['inert','disabled']}, vp:{control:1}}`.

## S2 Quick Start demo (`scn-qs-demo`, tests and tutorial only)

Reproduces the QS demo table (QS p34–35) for GOLD-001. Not in the skirmish menu.

| Setting | Value |
|---|---|
| Table | 36"×36"; Khador = first player = player A, edge z = −18 |
| Deployment | first 6", second 11"; Advance Deployment +3" (QS p35) |
| Walls (objective terrain) | two; each ≈14" from a back edge and 12" from that player's left: A's at (−6, −4), B's at (6, 4); 5"×1", 1" tall (template size unsourced) |
| Ponds (shallow water) | two; ≈16" from a back edge and 14" from that player's left: A's at (−4, −2), B's at (4, 2); 3" circles (unsourced) |
| Scoring | S1 wall rules, from round 1 |
| Data | pinned bundle `qs-2025` (faction values marked QS-2025 in `factions/*.md`) |

## Test fixture `scn-test-sr`

Steamroller rules for V2 tests: one 50 mm objective at (0, 0), one 40 mm objective at (−8, 0), one
scenario terrain piece (forest) at (8, 0), `scoring {fromRound: 2, fromPlayer: 'second'}`, `killBox
{fromRound: 2, fromPlayer: 'first', depth: 12, vp: 2}`.

## Later
Steamroller 2026 scenarios (Trench Warfare etc.) reuse V2. The optional chess clock ("Timed": 20
minutes per player at 30 points) comes later.
