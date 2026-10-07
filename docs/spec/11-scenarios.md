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

The Quick Start demo scenario (QS pp34–36): its table, deployment depths, terrain layout and scoring,
under our own name and ids. Recon 30, 36"×36". Each side has a low stone wall a little way in front of
its deployment zone, and those two walls are the scenario terrain; two shallow ponds sit between the
walls on each player's right.

| Setting | Value |
|---|---|
| Table | 36"×36" (QS p35) |
| Rounds | 7 (ours; QS sets none) |
| Turn order | R11.4 (roll-off; the winner chooses first/second; the **second** player picks the edge). The QS fixes Khador first; S2 does the same |
| First player deployment zone | completely within 6" of their back edge: z ∈ [−18, −12] (QS p35) |
| Second player deployment zone | completely within 11" of their back edge: z ∈ [7, 18] (QS p35) |
| Advance Deployment | 3" deeper: first z ≤ −9, second z ≥ 4 (QS p35) |
| Deployment order | P1 normal, P2 normal, P1 Advance Deployment, P2 Advance Deployment, then Prey (QS p35, p43) |
| Ambush entry | R11.6: from round 2, completely within 3" of the left, right or own edge |
| Scoring | `{fromRound: 1, fromPlayer: 'first', winMargin: 3, winOnOpponentTurnOnly: true}` (QS p36, p39) |
| Kill Box | none (QS has none) |

**Layout** (centre points in inches, `{x, z}`, origin = table centre, +z toward the second player;
point-symmetric about the origin). Sizes come from the QS template page (the unnumbered page after p47, printed at 1:1).
Positions come from the QS text (p35) and its layout diagram, measured against the 36" table.

| ID | Element | Type | Centre (x, z) | Size and orientation | Source |
|---|---|---|---|---|---|
| W1 | First player's wall | Scenario terrain + obstacle (linear, gives cover) | (−6, −4) | 4"×0.75" box, long axis along x; 0.75" tall (height ASSUMED: an obstacle, below 1") | QS p35: ≈14" from the first player's back edge and 12" from their left, measured to the centre (the diagram agrees to 0.1") |
| W2 | Second player's wall | as W1 | (6, 4) | as W1 | the same distances from the second player's view |
| P1 | First player's pond | Shallow water (rough terrain, R5.12) | (3.25, −2) | capsule 3.5" long, 2" wide (end radius 1"); long axis along the direction (1, 1) | QS diagram: 16" from the first player's back edge, ≈14¾" from their right edge |
| P2 | Second player's pond | as P1 | (−3.25, 2) | as P1; long axis along (1, 1) (point symmetry) | the same from the second player's view |

Note on the ponds: the QS text says "14" from the left", but its diagram puts each pond on the
player's *right*, 16" from their back edge, and the worked turns depend on the diagram (Falk walks
through the second player's pond toward the centre, QS p42). We follow the diagram. The diagram draws
P2's long axis the other way; we mirror it so the layout stays point-symmetric (SCN-024).

**Wall control (QS p36, p39):** a player holds a wall with ≥2 of their models (any kind, Leaders
included) within 2" of it; one eligible enemy model within 2" contests it. Leaders **may** contest in
S1 (QS: "one of their models"; unsourced). Inert, disabled and off-table models never count.

| Condition at each scoring point | VP |
|---|---|
| You hold W1 | 1 |
| You hold W2 | 1 |

Both players score at the end of every player turn from the first player's round-1 turn (V1.2).

**Victory:** assassination (V1.1), lead-by-3 (V1.3: a player who leads by 3 or more right after scoring
at the end of their *opponent's* turn wins; QS p36), or the most VP after round 7, then V1.5–V1.6.

**Default armies (Part G):** Cygnar — Caine, Deuce, Falk, The Black 13th. Khador — Vilkul, Razor,
Lazarenko, The Hounds. Each list is 30 points.

**Element data (20 §7):** `{kind:'scenarioTerrain', terrain:'w1', hold:{within:2, models:2, eligible:['any']},
contest:{within:2, excludes:['inert','disabled']}, vp:{control:1}}`, and the same for `w2`.

**Terrain data (20 §8):** walls `{rulesType:'obstacle', footprint:{rect:{w:4, d:0.75}}, height:0.75}`, placed with
`rot: 0`. Ponds `{rulesType:'shallowWater', footprint:{polygon:[...]}, height:0}`, where the polygon is the capsule in
local coordinates (long axis along local x): (0.75, −1), (1.457, −0.707), (1.75, 0), (1.457, 0.707), (0.75, 1),
(−0.75, 1), (−1.457, 0.707), (−1.75, 0), (−1.457, −0.707), (−0.75, −1). Each pond is placed so that local +x points
along (1, 1) in `{x, z}`; with the right-handed, y-up rotation that is `rot: −π/4`.

## S2 Quick Start demo (`scn-qs-demo`, tests and tutorial only)

S1 with the QS's fixed setup, for GOLD-001 (`13-golden-first-turn.md`). Not in the Recon menu.

| Setting | Value |
|---|---|
| Layout, deployment, scoring | as S1 |
| Players | Khador = player A = first player, back edge z = −18; Cygnar = player B = second, back edge z = +18. No roll-off and no edge choice |
| Command cards | none (the QS skips them, p35) |
| Data | pinned bundle `qs-2025` (the values marked verified in `factions/*.md`, plus the community values the turns rely on) |

## S3 Skirmish scenario: **Copperline Crossing** (`scn-copperline-crossing`)

Our own scenario for the 50-point game size, built only from features the engine already has (V1, V2.1, V2.2,
V1.7). It is the default Skirmish scenario; the Steamroller 2026 scenarios of M13 join the Skirmish list later and
this one stays as the learner's choice. Sources and rulings: `90-skirmish.md` A.1 to A.3. Skirmish level only
(`levels: ['skirmish']`): a recon list cannot be played on it and a skirmish list cannot be played on S1 or S2
(`createGame` answers `E_BAD_SETUP`, SKM-002).

| Setting | Value |
|---|---|
| Table | 48"×48" (RB p116; SR p15 splits it into four 24" quadrants) |
| Rounds | 7 |
| Turn order | R11.4 as S1: the roll-off winner picks first or second, the second player picks the edge |
| Deployment | first player completely within 6" of their back edge (z ∈ [−24, −18] on the north edge), second within 11" (z ∈ [13, 24]); Advance Deployment 3" deeper (z ≤ −15 and z ≥ 10); a unit's models within 3" of each other. Every SR 2026 map uses 6/11 (91 SR2) |
| Scoring | `{fromRound: 2, fromPlayer: 'second', winMargin: 3, winOnOpponentTurnOnly: true, leaderPresence: 10}`: both players score at the end of every turn from the second player's round-2 turn (V1.2) |
| Kill Box | `{fromRound: 2, fromPlayer: 'first', depth: 12, vp: 2}` (V1.7); the 12" is the SR value, measured from the edge of the 48" table |
| Terrain | a board layout's 48" twin (`<layout id>-48`, below); the scenario's own fallback is `layout.village-2-48` |

**Objectives** (centres, `{x, z}`, origin = table centre, +z toward player B; point-symmetric about the origin; each is
worth 1 VP per scoring point while held):

| ID | Kind | Centre | Held when |
|---|---|---|---|
| `el-50-w` | 50 mm objective | (−10, −3) | a friendly Leader, warjack, warbeast or battle engine is within 3" and no eligible enemy is within 3" (V2.1) |
| `el-50-e` | 50 mm objective | (10, 3) | as `el-50-w` |
| `el-40-w` | 40 mm objective | (−10, 3) | a friendly Leader is within 3", or every remaining trooper of one friendly unit is (V2.2) |
| `el-40-e` | 40 mm objective | (10, −3) | as `el-40-w` |

So each player has a 50 mm close on their left and a 40 mm close on their right: the big one wants a Leader or Cohort
model, the small one a whole unit, and a lone solo secures neither. Enemy Leaders do not contest (SR p3).

**Victory:** assassination (V1.1), lead-by-3 after the opponent's turn (V1.3), or the most VP after round 7 and then
V1.5 to V1.6.

**Why these positions:** the first draft at (±12, ±3) clipped six flank forests and hills and sat 0.96" from the Outpost
3 blockhouse. At (±10, ±3) no footprint of any of the 15 scaled layouts touches an objective base, and the nearest
impassable footprint is 2.96" from a base edge (TER-110 keeps it that way).

**Terrain at 48" (E2, E3).** Every board layout has a derived twin in the data bundle, `<layout id>-48`, equal to
`scaleLayout48` (70 §D: every centre times 4/3, footprints and rotations unchanged, so symmetry holds and every gap
grows). `src/data/layout48.ts` is the pure helper and `loadBundle` adds the twins before checking references; the board
records still list the 36" ids. For a 48" scenario `eligibleLayouts` returns the board's twins, for a 36" one the
originals. The Ashwall Divide (no board) has no twin.

**Game size (E1).** A list that names a `level` is capped by it (recon 30, skirmish 50, pitched 75, grand melee 100) and
must cost at least 4 under the cap (RB p118); the declared `points` is not trusted. Both lists must share a level and the
scenario's `levels` must include it.

## Test fixture `scn-test-sr`

Steamroller rules for V2 tests: one 50 mm objective at (0, 0), one 40 mm objective at (−8, 0), one
scenario terrain piece (forest) at (8, 0), `scoring {fromRound: 2, fromPlayer: 'second'}`, `killBox
{fromRound: 2, fromPlayer: 'first', depth: 12, vp: 2}`.

## Later
Steamroller 2026 scenarios (Trench Warfare etc.) reuse V2. The optional chess clock ("Timed": 20
minutes per player at 30 points) comes later.
