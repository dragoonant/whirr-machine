# 11 Scenarios and victory

How a game is won, and the first scenario we ship. The basis is handoff E.10; `(verify)` points
are logged in `docs/needs-rules-check.md`.

## V1 Victory conditions (every scenario)

| ID | Rule |
|---|---|
| V1.1 | **Assassination:** a player with no Leader left loses at once, even mid-activation (R12.1). If both Leaders go in one simultaneous resolution, the game is a draw (verify) |
| V1.2 | **Scoring time:** at the end of every player turn, starting with the second player's turn in round 2. Both players score at each scoring point (verify) |
| V1.3 | **Lead-by-3:** right after scoring at the end of a turn, the *non-active* player wins if their VP ≥ the active player's VP + 3. You can never win this way at the end of your own turn |
| V1.4 | **Round limit:** the game ends after round 7 (both turns). The higher VP total wins |
| V1.5 | **Tiebreak 1:** scenario presence. Each player totals the points of their models that are within 3" of any scenario element and are able to contest; a Leader counts as 10 (verify the definition). Higher wins |
| V1.6 | **Tiebreak 2:** if it's still tied, the game is a draw (verify) |
| V1.7 | **Kill Box:** from the first player's turn 2 on, at the end of each of your turns, if your Leader is *completely within* 12" of your own table edge, your opponent gains 2 VP. This is checked before V1.3. The 12" isn't scaled for 36" tables (verify) |
| V1.8 | **Concession / timeout:** out of scope until the optional clock (later) |

## V2 Scenario elements and control

**Who counts**

| Model state | Can control | Can contest |
|---|---|---|
| Leader | yes (objectives, flags, terrain) | **no** |
| War-engine (not inert) | yes | yes |
| Solo, trooper | yes (40 mm objective and terrain; see below) | yes |
| Inert, wild, disabled or boxed | no | no |
| Knocked down or stationary | yes (verify) | yes (verify) |
| Off table (Ambush, not yet arrived) | no | no |

**Element types**

| ID | Element | Controlled when | Contested by |
|---|---|---|---|
| V2.1 | 50 mm objective | A friendly Leader, war-engine or battle engine is within 3" | Any eligible enemy within 3" |
| V2.2 | 40 mm objective | A friendly Leader is within 3", **or** every remaining trooper of one friendly unit is within 3" | Any eligible enemy within 3" |
| V2.3 | Flag (30 mm) | ≥2 friendly models within 2" (verify vs 1") | Any eligible enemy within 3" |
| V2.4 | Scenario terrain | ≥2 friendly models within 2" of the feature | Any eligible enemy within 3" |

- An element that is contested has no controller. When both sides meet the control test, that also
  counts as contested.
- Objectives are terrain-free markers. They don't block movement or LOS (verify). Flags block
  nothing.
- Control is checked only at scoring time (V1.2). There's no persistent "captured" state unless the
  scenario says otherwise.

## S1 First scenario: **Ashwall Divide** (`scn-ashwall-divide`)

Quick Start-style. Recon 30, on a 36"×36" table. Two ruined walls across the middle are the
scenario terrain. The name and layout are ours.

**Coordinates.** The origin is the first player's left table corner. x runs along the first
player's edge (0–36); y runs toward the second player's edge (0–36). Every position is a centre
point in inches. The layout is point-symmetric about (18, 18).

| Setting | Value |
|---|---|
| Table | 36"×36" |
| Rounds | 7 |
| Turn order | R11.4 (roll-off; the winner chooses first/second; the loser picks the edge) |
| First player deployment zone | y ∈ [0, 6]. Advance Deployment: y ≤ 9 |
| Second player deployment zone | y ∈ [25, 36]. Advance Deployment: y ≥ 22 |
| Ambush entry | From round 2, completely within 3" of the left, right or own edge (never the opponent's) |
| Kill Box | V1.7; the zone is y ≤ 12 for the first player and y ≥ 24 for the second |

**Layout**

| ID | Element | Type | Centre (x, y) | Size | Notes |
|---|---|---|---|---|---|
| W1 | West wall | Scenario terrain + obstacle | (9, 18) | 5"×1", long axis along x, 1" tall | Gives cover. Held at 2", contested at 3" |
| W2 | East wall | Scenario terrain + obstacle | (27, 18) | 5"×1", long axis along x, 1" tall | As W1 |
| B1 | Pumphouse | Obstruction (blocks LOS) | (18, 18) | 3"×3", 3" tall | Impassable; cover within 1" |
| F1 | Copse | Forest (rough, concealment) | (29, 9) | ellipse 6"×4", long axis along x | Point-symmetric to F2 |
| F2 | Copse | Forest | (7, 27) | ellipse 6"×4" | — |
| R1 | Rubble | Rough terrain, cover | (13, 11) | 3"×2" | Point-symmetric to R2 |
| R2 | Rubble | Rough terrain, cover | (23, 25) | 3"×2" | — |

**Scoring (at each V1.2 scoring point, for each player)**

| Condition | VP |
|---|---|
| You control W1 (V2.4) | 1 |
| You control W2 (V2.4) | 1 |
| Opponent's Kill Box (V1.7) | Opponent +2 |

**Victory:** assassination (V1.1), lead-by-3 (V1.3), or the most VP after round 7, with the
tiebreaks in V1.5–V1.6.

**Default armies (Part G):** Cygnar — Caine, Deuce, Falk, The Black 13th. Khador — Vilkul, Razor,
Lazarenko, The Hounds. Each list is 30 points.

**Engine data shape (for 20-data contracts):**
`{id, name, table:{w:36,h:36}, rounds:7, zones:[{player:1,yMin:0,yMax:6},{player:2,yMin:25,yMax:36}], advDeploy:3, killBox:12, elements:[{id,type,shape,cx,cy,w,h,rot,height,scenario:{holdR:2,contestR:3,minModels:2,vp:1}}], scoring:{startTurn:"P2R2",both:true,leadBy:3}}`

## Later
Steamroller-style scenarios (50 mm/40 mm objectives, flags, zones) reuse V2. The optional chess
clock ("Timed": 20 minutes per player at 30 points) comes later.
