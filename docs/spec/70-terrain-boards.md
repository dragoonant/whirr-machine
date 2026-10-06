# 70 Terrain boards (M8)

Five themed battlefields replace the plain table: each has its own ground mat, lighting and set of terrain pieces,
and a game picks one at random (or the one the player chose). This spec freezes the rules audit, the piece
catalog, the boards, the layouts, the selection rule, the client rendering and the test IDs.

**Owner decision (2026-10-05):** five boards: a haunted bog, ancient ruins, a frontier village, a blighted
wasteland and a snowy trench outpost. The official terrain packs only set the mood.

**IP rule (hard):** every piece and board is our own design. Names, shapes and prose are ours. No sculpt, art,
logo, faction symbol or trade dress from the official packs is copied, traced or described closely. Image
prompts (`tools/terrain-catalog.json`) describe generic objects only and never name a faction, product or
company. Photos of official products are never given to a generator as a reference. Board and piece names avoid
setting proper nouns (no faction, nation or region names).

Units: inches. Coordinates follow 20 §7: origin at the table centre, `{x, z}`, +z toward player B. Rotation `rot`
is radians about +y (terrain.ts: local `(x, z)` maps to `(x cos + z sin, −x sin + z cos)`). Tables in this file
give degrees; data stores `deg × π / 180`.

## A. Rules audit (R10 against the engine)

Sources read: `10-rules-core.md` R5.11–R5.17, R6.3, R6.6, R6.11, R9.8, R10; `20-data-schema.md` §8–9;
`src/engine/terrain.ts` (`terrainTraits`), `los.ts` (`pieceBlocksLine`, `forestBlocksLine`, `featureAlongLine`,
`meleeObscured`, `defModifiers`), `geometry.ts` (`sweepFrom`, `isLegalPlacement`, `validateAdvancePath`),
`movement.ts`, `scenario.ts`, `setup.ts` (`buildTerrain`), `src/data/schema/terrain.schema.json`.

| rulesType | R10 says | Engine does | Verdict |
|---|---|---|---|
| `obstacle` | Under 1" tall. Crossed only with movement to end completely past it (R5.13); charges, slams and tramples stop on contact; never stood on. Blocks LOS by height. Cover (wall) or concealment (hedge) within 1" along a line to the attacker; +2 DEF in melee if partly obscured | `move: 'obstacle'`; `validateAdvancePath` needs the leg to clear it; `sweepFrom` stops straight-line moves; `placementBlockers` forbids standing on it; `pieceBlocksLine` by height; `featureAlongLine` grants cover within 1" (concealment when `props.concealment === true` or `props.feature === 'hedge'`); `meleeObscured` +2 | Matches. The under-1" limit is not checked (gap G5) |
| `obstruction`, `building` | 1" or taller. Impassable except Flight/Incorporeal. Blocks LOS by height. Cover within 1". +2 melee. Elevation for models completely within (flyers, stairs) | `move: 'impassable'`, `blocksLos`, `cover: 'cover'`; melee +2 | Matches for Recon. Standing on top (R5.14) is not modelled (not needed: no Flight in Recon) |
| `forest` | Rough. LOS: a line that starts or ends inside may cross up to 3" of forest; with both ends outside it blocks anything beyond, however thin. Huge (120 mm) bases never blocked. Concealment completely inside | `rough`; `forestBlocksLine` with `FOREST_PEEK = 3`; `bHuge` skips forests for a 120 mm target; `insideCover: 'concealment'` | Matches. `props.losThrough` is ignored (constant 3) (G3) |
| `shallowWater`, `rough` | Rough (R5.12): the whole advance −2", minimum 1" | `rough: true`; `validateAdvancePath` and `sweepFrom` apply the penalty | Matches |
| `rubble` | Rough; cover to a model completely inside | `rough`, `insideCover: 'cover'` | Matches |
| `hill` | Open ground; elevation to models completely within; tall hills block by height; no cover or concealment; leaving one is never a fall | `blocksLos` by height, `elevation` = `props.elevation` or `height`; `elevationAt` needs the base completely within; `startedOnHill` skips the fall | Matches. A line whose end point is anywhere inside the hill's footprint ignores the hill, even for a base only partly on it (minor; G8) |
| `hazard` | Open ground plus the hazard: suffered on entering (once per advance; placement counts) and on ending an activation inside (R9.8) | `hazard: true` is set and `hazardsUnder()` exists, but **nothing calls it**. R9.8 runs only for hazard *clouds* (`phases/activation.ts` ~l.159). `props.hazard.effect` is never read | **Gap G1**: a hazard piece is plain open ground |
| `trench` | Not in R10. 20 §9: no LOS block, cover, open movement, `resistance: [blast]` | Falls to the `default` branch: open ground, no cover, no resistance | **Gap G2**: spec and engine disagree; R10 needs a trench row (rules check) |
| `deepWater` | Impassable, LOS clear | `move: 'impassable'` | Engine matches, but the data schema's enum has no `deepWater`, so data cannot use it (G4) |
| `scenarioTerrain` | As its base type plus scenario control | `effectiveType` reads `props.baseType` (default obstacle) | S1 marks its walls through scenario elements, not this type. `baseType` is not allowed by the schema (G3) |
| `openGround` | Open | Not in the engine's `TerrainRulesType`; `terrainTraits` returns plain traits; the client `STYLES` lookup misses it and draws an obstruction block | Schema-only value (G4) |

**Gaps (do not fix here; each needs its own task):**

| ID | Gap | Where | Effect on M8 |
|---|---|---|---|
| G1 | Hazard terrain is inert: `hazardsUnder` is never called; `props.hazard.effect` is never read. R9.8 entry and end-of-activation damage applies only to hazard clouds | `terrain.ts`, `movement.ts`, `phases/activation.ts` | The wasteland's Molten Blight Pool does nothing until fixed. TER-113 stays red until then |
| G2 | `trench` is open ground in the engine; 20 §9 gives cover and blast resistance; R10 has no trench row | `terrain.ts` `default` branch; `10-rules-core.md` R10 | The Zig-Zag Trench gives no protection. Needs a ruling in `docs/needs-rules-check.md` first |
| G3 | Schema `props` overrides are dead: `blocksLos losThrough cover rough impassable crossable meleeDefBonus resistance hazard` are never read. The engine reads `feature baseType baseElev`, which the schema forbids (`additionalProperties: false`) | `terrain.ts` `terrainTraits`; `terrain.schema.json` | M8 data uses only `props.concealment` (read) and `props.hazard` (G1) |
| G4 | rulesType enums differ: schema has `openGround`, engine has `deepWater` and `scenarioTerrain` | `terrain.schema.json`; `types.ts` | M8 uses neither. `openGround` would draw as a block |
| G5 | Obstacle under 1" and obstruction 1" or taller (R5.13, R5.14) are not checked: the type alone decides | `tools/validate-data.ts` | TER-102 adds the data check |
| G6 | A swapped layout without the scenario's terrain anchors is accepted. `distanceToElement` then quietly measures to the element's point (`scenario.ts` l.72–76), which changes control. `checkRefs` checks only the scenario's own `terrainLayout` | `scenario.ts`, `setup.ts`, `src/data/index.ts` | Selection (E) must only offer layouts that carry the anchors; TER-111 |
| G7 | The schema's `hazard.trigger` is one value (`enter`, `endActivation` or `maintenance`), but R9.8 needs both entry and end of activation | `terrain.schema.json` | Data can only state one trigger. M8 sets `enter` and expects the engine to apply R9.8 in full |
| G8 | The hill and obstacle "model standing on it" skip uses the line's end point, not "completely within" | `los.ts` `pieceBlocksLine` | Minor; a base half on a hill sees through the hill's crest |

## B. Piece catalog

37 pieces, 7–8 per board. Every board has a forest, an obstacle and a building or obstruction, and most have a
hill, rubble or trench, and water or a hazard. Each board's obstacle marked **S1 anchor** has exactly the Ashwall
wall's rules data (`rect 4 × 0.75`, height 0.75, `obstacle`), so Ashwall Divide plays the same on every board
(see D).

Columns: `id` is the data id (`terrain.<board>-<name>`). Footprint is local, centred on the piece origin, long
axis along local x. "Ellipse w × d" is the 12-gon with vertices `(w/2 cos a, d/2 sin a)` for `a = k·30°`, rounded to
0.001"; "octagon" is the same with 8 vertices (`k·45°`). The exact vertices are in `tools/terrain-catalog.json`,
and data copies them unchanged. Height is the rules prism height (LOS, R6.3). For hills it is also the elevation.
For forests, water, rough ground, hazards and trenches it never blocks LOS. Visual height is the tallest solid part
of the model. Thin spikes, branch tips and dome finials may rise above it.
Slug = `wt-<board>-<name>` (GLB at `public/assets/terrain/<slug>.glb`).

**Rules on silhouettes:** an obstacle never looks taller than 1" in its solid mass. A building is never drawn
lower than its rules height. A forest's trunks stand inside the footprint and canopies may overhang it by up to
0.5". Water, rough ground, hazards and trenches stay under 0.4" so they never hide a base.

### bog: haunted bog

| id | Name | rulesType | Footprint | Height | Visual |
|---|---|---|---|---|---|
| `terrain.bog-deadwood` | Gallows Deadwood | forest | ellipse 6 × 4.5 | 4 | 5 |
| `terrain.bog-stilt-hut` | Crooked Stilt Hut | building | rect 4 × 4 | 4.5 | 5.5 |
| `terrain.bog-hummock` | Mossy Hummock | hill | ellipse 7 × 5 | 1 | 1 |
| `terrain.bog-log-barrier` | Fallen Log Barrier (S1 anchor) | obstacle | rect 4 × 0.75 | 0.75 | 0.9 |
| `terrain.bog-murk-pool` | Murk Pool | shallowWater | ellipse 5 × 3.5 | 0 | 0.2 |
| `terrain.bog-bone-mire` | Bone-Strewn Mire | rough | ellipse 5 × 4 | 0 | 0.3 |
| `terrain.bog-stumps` | Mossy Stump Cluster | rubble | ellipse 4 × 3 | 0.5 | 0.8 |

### ruins: ancient ruins

| id | Name | rulesType | Footprint | Height | Visual |
|---|---|---|---|---|---|
| `terrain.ruins-monolith` | Root-Bound Monolith | obstruction | rect 2.5 × 2.5 | 5 | 6 |
| `terrain.ruins-arch` | Broken Archway | obstruction | rect 5 × 1.25 | 4 | 4.5 |
| `terrain.ruins-colonnade` | Fallen Colonnade (S1 anchor) | obstacle | rect 4 × 0.75 | 0.75 | 0.9 |
| `terrain.ruins-crystal` | Crystal Outcrop | obstruction | circle r 1.25 | 2.5 | 3 |
| `terrain.ruins-grove` | Shadowroot Grove | forest | ellipse 6 × 5 | 4 | 5 |
| `terrain.ruins-dais` | Flagstone Dais | hill | octagon 7 × 5 | 1 | 1 |
| `terrain.ruins-masonry` | Toppled Masonry | rubble | ellipse 5 × 3.5 | 0.5 | 0.7 |

The archway is solid for rules (an obstruction); models cannot walk under it. Its opening is drawn filled with
fallen stone so the look matches the rule.

### village: frontier village

| id | Name | rulesType | Footprint | Height | Visual |
|---|---|---|---|---|---|
| `terrain.village-chapel` | Domed Chapel | building | rect 5 × 4 | 5.5 | 6 |
| `terrain.village-watchtower` | Stone Watchtower | building | rect 3 × 3 | 6 | 7 |
| `terrain.village-pines` | Pine Stand | forest | ellipse 6 × 5 | 5 | 6 |
| `terrain.village-rail-fence` | Split-Rail Fence | obstacle, `props.concealment: true` | rect 5 × 0.5 | 0.75 | 1 |
| `terrain.village-stone-wall` | Fieldstone Wall (S1 anchor) | obstacle | rect 4 × 0.75 | 0.75 | 0.85 |
| `terrain.village-pond` | Mill Pond | shallowWater | ellipse 5 × 3.5 | 0 | 0.2 |
| `terrain.village-knoll` | Grassy Knoll | hill | ellipse 7 × 5 | 1 | 1 |
| `terrain.village-boulders` | Boulder Scatter | rubble | ellipse 4 × 3 | 0.5 | 0.8 |

The fence is see-through, so it gives concealment (+2), not cover (R6.11, hedge row).

### wasteland: blighted wasteland

| id | Name | rulesType | Footprint | Height | Visual |
|---|---|---|---|---|---|
| `terrain.wasteland-thorn-palisade` | Iron Thorn Palisade | obstruction | rect 6 × 1 | 3 | 3.5 |
| `terrain.wasteland-chain-barricade` | Chain-Strung Barricade (S1 anchor) | obstacle | rect 4 × 0.75 | 0.75 | 1 |
| `terrain.wasteland-thornwood` | Thornwood | forest | ellipse 6 × 4.5 | 4 | 5 |
| `terrain.wasteland-ritual-dais` | Ritual Dais | hill | circle r 3 | 1 | 1 |
| `terrain.wasteland-ash-flats` | Cracked Ash Flats | rough | ellipse 5 × 4 | 0 | 0.3 |
| `terrain.wasteland-blight-pool` | Molten Blight Pool | hazard | ellipse 4.5 × 3 | 0 | 0.3 |
| `terrain.wasteland-bone-spikes` | Bone Spike Field | rubble | ellipse 4 × 3 | 0.5 | 1 |

Blight pool data: `props.hazard = { effect: [{op:'damage', pow:10, damageType:'fire'}], trigger:'enter' }`. The rule
we want is R9.8 in full: entering it (once per advance, placement counts) and ending an activation in it each
cause one POW 10 fire damage roll, and Resistance: Fire gives immunity. It is inert until G1 is fixed. The board
still ships, and the piece's tooltip says "Hazard (not yet active)" while `query.*` reports no hazard.

### outpost: snowy trench outpost

| id | Name | rulesType | Footprint | Height | Visual |
|---|---|---|---|---|---|
| `terrain.outpost-blockhouse` | Timber Blockhouse | building | rect 6 × 4.5 | 4 | 5 |
| `terrain.outpost-snow-pines` | Snowbound Pines | forest | ellipse 6 × 4.5 | 5 | 6 |
| `terrain.outpost-trench` | Zig-Zag Trench | trench | rect 5 × 3 | 0 | 0.4 |
| `terrain.outpost-sandbags` | Sandbag Barricade (S1 anchor) | obstacle | rect 4 × 0.75 | 0.75 | 0.85 |
| `terrain.outpost-stakes` | Stake Barricade | obstacle | rect 5 × 1 | 0.9 | 1 |
| `terrain.outpost-wagon` | Supply Wagon | obstruction | rect 3.5 × 1.75 | 2 | 2.2 |
| `terrain.outpost-frozen-pond` | Frozen Pond | rough | ellipse 5 × 3.5 | 0 | 0.2 |
| `terrain.outpost-snow-rocks` | Snow-Capped Rocks | rubble | ellipse 4 × 3 | 0.5 | 0.8 |

The trench is drawn sunk into the mat (zig-zag cut within the 5 × 3 rectangle). Until G2 is ruled on it plays as
open ground. The frozen pond is ice, so it plays as rough ground, not water.

**Data files:** one file per board, `src/data/terrain/pieces-<board>.json` (schema `terrain[]`), each piece with
`mesh: "<slug>"`. Each new file gets a line in `src/data/raw.ts`. The existing `terrain.low-wall` and `terrain.pond`
stay unchanged.

## C. Boards

New record kind `board` (`src/data/terrain/boards.json`, new schema `board.schema.json` in both schema folders,
id prefix `board.`). Fields: `{id, name, text, pieces[], layouts[], reskin, ground, light, fallback}`.

| id | Display name | Ground mat (our description) | Light tint (key / ambient / fog) | Fallback colours (ground / accent / piece) |
|---|---|---|---|---|
| `board.bog` | Hollowmere Bog | Dark peat mud with moss patches, wet sheen in hollows, flattened reeds, leaf litter and a few pale twigs | `#c9d6b0` / `#4b5a47` / `#26302a` (green-grey dusk, light haze) | `#3a3b2b` / `#5c6e3c` / `#6b6450` |
| `board.ruins` | Veilstone Ruins | Short mossy turf broken by sunken pale flagstone fragments and drifts of fallen leaves | `#ddd3f2` / `#3f3b58` / `#28263a` (violet twilight) | `#4a5a3e` / `#9a94b8` / `#b8b2a4` |
| `board.village` | Ironpine Hamlet | Frost-bitten meadow grass with packed dirt cart tracks, pebbles and pine needles | `#f3e7cf` / `#56606a` / `#2e343a` (cold clear morning) | `#5a6440` / `#8a7a5a` / `#9c958a` |
| `board.wasteland` | Cinder Blight | Cracked dark ash crust with thin ember-orange fissures, cinders and grit | `#ffb27a` / `#3c2622` / `#2b1a16` (smouldering, warm haze) | `#3a302b` / `#c4521f` / `#5a524e` |
| `board.outpost` | Frostline Outpost | Trampled snow over frozen mud, wheel ruts, bootprints, patches of dark earth showing through | `#e0e9ff` / `#6a7488` / `#3a4250` (overcast winter light) | `#d9dde2` / `#6c5a46` / `#7d7a74` |

- `pieces[]`: the piece ids of section B. `layouts[]`: the layout ids of section D, in order.
- `reskin`: client-only GLB slugs for the generic pieces, so fixed-layout scenarios still look themed:
  `{"terrain.low-wall": "<board's S1 anchor slug>", "terrain.pond": "<board's water or ground-patch slug>"}`.
  The pond maps to `wt-bog-murk-pool`, `wt-village-pond`, `wt-wasteland-ash-flats` and `wt-outpost-frozen-pond`.
  The ruins have no water piece, so their pond stays the procedural water shape in the board's fallback colours. This
  is looks only: the rules stay those of the generic piece. A reskin must be a flat piece (visual height ≤ 0.4") so it
  never suggests cover. The tooltip shows the rules type, never the reskin name.
- `ground`: `{albedo, normal, rough}` paths (F). `light`: `{key, ambient, fog, keyIntensity, fogNear, fogFar}`.
  `fallback`: the three colours above, used when textures or GLBs are missing.
- Mat textures are made by our own pipeline from our own prompts (or procedurally). Photos of real gaming mats are
  never used. Ground-mat prompt pattern: "seamless top-down texture of <ground mat description>, even lighting, no
  shadows, no objects, no grid, photoreal, 2048 px".

## D. Layouts

**Rules every 36 × 36 layout follows (checked by TER-103 to TER-106):**

1. **Point symmetry:** every piece at `(x, z, rot)` has a twin of the same terrain at `(−x, −z, rot + 180°)`, unless
   it sits at the origin with a footprint that looks the same after a half turn (rect, circle, even-sided ellipse).
   Twins are named `<k>1` and `<k>2`; a centre piece is `<k>0`.
2. **S1 anchors:** pieces `w1` at (−6, −4) and `w2` at (6, 4), rot 0°, using the board's S1-anchor obstacle. Ashwall
   Divide's scenario elements (`el-w1`, `el-w2`, hold and contest within 2") then measure the same as on
   `layout.ashwall-divide`. The Ashwall ponds are left out: they are not scenario elements.
3. **Gaps:** at least 3" between any two footprints (a 50 mm base is 1.97" across), and at least 3" from the left
   and right table edges (`|x| ≤ 15`). The validator checks the exact polygons (circles as 48-gons).
4. **Deployment kept clear:** no footprint reaches `|z| > 11`, so the back 7" of both edges is open. Whichever edge
   the first player gets, their 6" zone is empty, and so is the back of the second player's 11" zone.
   Impassable pieces (building, obstruction) stay within `|z| ≤ 8`, at most 1" into the second player's zone. The
   ground in front of each wall stays open for 3" or more, so two models can stand within 2" to hold it.
5. **Count:** 5–8 pieces including `w1` and `w2`.

Positions are piece centres `(x, z)` in inches; rot in degrees. "Gap" is the smallest footprint-to-footprint gap in
the layout. Every layout below begins with `w1 wall (−6, −4) 0°; w2 wall (6, 4) 0°`.

| Layout | Name | Pieces | Gap | Other pieces (exact) |
|---|---|---|---|---|
| `layout.bog-1` | Drowned Path | 8 | 3.47" | f1 deadwood (−11.5, 2) 0°; f2 deadwood (11.5, −2) 180°; b1 stilt-hut (−2, 5.5) 0°; b2 stilt-hut (2, −5.5) 180°; p1 murk-pool (10, −9.25) 0°; p2 murk-pool (−10, 9.25) 180° |
| `layout.bog-2` | Gallows Hollow | 7 | 3.40" | h1 hummock (−11.5, 2) 0°; h2 hummock (11.5, −2) 180°; r1 stumps (−1, −9.25) 0°; r2 stumps (1, 9.25) 180°; p0 murk-pool (0, 0) 90° |
| `layout.bog-3` | Witchlight Fen | 8 | 4.09" | r1 bone-mire (−11.5, 2) 90°; r2 bone-mire (11.5, −2) 270°; b1 stilt-hut (−2, 5.5) 15°; b2 stilt-hut (2, −5.5) 195°; s1 stumps (−12, −9) 0°; s2 stumps (12, 9) 180° |
| `layout.ruins-1` | Fallen Court | 8 | 3.22" | f1 grove (−11.5, 2) 0°; f2 grove (11.5, −2) 180°; b1 monolith (−2, 5.5) 0°; b2 monolith (2, −5.5) 180°; r1 masonry (10, −9.25) 0°; r2 masonry (−10, 9.25) 180° |
| `layout.ruins-2` | Crystal Steps | 7 | 3.54" | h1 dais (−11.5, 2) 0°; h2 dais (11.5, −2) 180°; b1 arch (−2, 5.5) 0°; b2 arch (2, −5.5) 180°; b0 crystal (0, 0) 0° |
| `layout.ruins-3` | Veiled Colonnade | 8 | 4.00" | f1 grove (−11.5, 2) 0°; f2 grove (11.5, −2) 180°; b1 crystal (−2, 5.5) 0°; b2 crystal (2, −5.5) 180°; r1 masonry (−12, −9) 0°; r2 masonry (12, 9) 180° |
| `layout.village-1` | Chapel Square | 8 | 3.64" | f1 pines (−11.5, 2) 0°; f2 pines (11.5, −2) 180°; b1 chapel (−2, 5.5) 90°; b2 chapel (2, −5.5) 270°; o1 rail-fence (10, −9.25) 0°; o2 rail-fence (−10, 9.25) 180° |
| `layout.village-2` | Watch Hill | 8 | 3.16" | h1 knoll (−12, 1) 90°; h2 knoll (12, −1) 270°; b1 watchtower (−1.5, 6) 0°; b2 watchtower (1.5, −6) 180°; p1 pond (9.5, −9) 0°; p2 pond (−9.5, 9) 180° |
| `layout.village-3` | Millrace Lane | 7 | 3.66" | f1 pines (−11.5, 2) 0°; f2 pines (11.5, −2) 180°; p1 pond (−1, −9.25) 0°; p2 pond (1, 9.25) 180°; r0 boulders (0, 0) 0° |
| `layout.wasteland-1` | Chained Gate | 8 | 3.56" | f1 thornwood (−11.5, 2) 0°; f2 thornwood (11.5, −2) 180°; b1 thorn-palisade (−2.5, 5.5) 0°; b2 thorn-palisade (2.5, −5.5) 180°; z1 blight-pool (10, −9.25) 0°; z2 blight-pool (−10, 9.25) 180° |
| `layout.wasteland-2` | Ember Ring | 7 | 3.25" | h1 ritual-dais (−11.5, 2) 0°; h2 ritual-dais (11.5, −2) 180°; r1 bone-spikes (−1, −9.25) 0°; r2 bone-spikes (1, 9.25) 180°; r0 ash-flats (0, 0) 90° |
| `layout.wasteland-3` | Bone Road | 8 | 3.12" | b1 thorn-palisade (−12.5, 2) 90°; b2 thorn-palisade (12.5, −2) 270°; f1 thornwood (−2, 5.5) 0°; f2 thornwood (2, −5.5) 180°; r1 bone-spikes (10, −9.25) 0°; r2 bone-spikes (−10, 9.25) 180° |
| `layout.outpost-1` | Frostline Redoubt | 8 | 3.33" | f1 snow-pines (−11.5, 2) 0°; f2 snow-pines (11.5, −2) 180°; b1 blockhouse (−2.5, 5.75) 0°; b2 blockhouse (2.5, −5.75) 180°; t1 trench (11.5, −9.25) 0°; t2 trench (−11.5, 9.25) 180° |
| `layout.outpost-2` | Picket Line | 8 | 4.18" | f1 snow-pines (−11.5, 2) 0°; f2 snow-pines (11.5, −2) 180°; b1 wagon (−2, 5.5) 0°; b2 wagon (2, −5.5) 180°; o1 stakes (10, −9.25) 0°; o2 stakes (−10, 9.25) 180° |
| `layout.outpost-3` | Supply Road | 7 | 3.58" | b1 blockhouse (−12, 2.5) 90°; b2 blockhouse (12, −2.5) 270°; p1 frozen-pond (−1, −9.25) 0°; p2 frozen-pond (1, 9.25) 180°; r0 snow-rocks (0, 0) 0° |

Short names expand to `terrain.<board>-<name>` (for example `stilt-hut` on the bog is `terrain.bog-stilt-hut`). `wall` is
the board's S1 anchor. Data file: `src/data/terrain/layouts/<board>-<n>.json`, `table {w:36, d:36}`, pieces in the
order listed (w1, w2 first), `rot` in radians. Every layout above passed rules 1–5 with the polygons of
`tools/terrain-catalog.json` (smallest gap 3.12", widest |x| 15.0, widest |z| 11.0, widest impassable |z| 8.0; each at its limit).

**48 × 48 scale-up (until 48" scenarios ship their own layouts):** a 48" scenario with no layout of its own on the
chosen board uses the 36" layout with every centre multiplied by 4/3 (footprints and rotations unchanged), id
`<layout id>-48`, built by the selection code (not stored). This keeps the symmetry and widens every gap (the
smallest becomes 5.46"). Footprints reach at most |z| 14.1 and impassable ones |z| 9.9, clear of the 48" first
zone (7", |z| ≥ 17). `w1`/`w2` become plain obstacles, because a 48" scenario names its own anchors. A 48"
scenario whose anchors a scaled layout lacks falls back to its own `terrainLayout` (rule E3).

## E. Selection (board and layout from the seed)

The client picks before `createGame`. The engine only receives `GameSetup.layout`, which already exists
(`types.ts` l.51, "defaults to the scenario's terrainLayout") and is saved in `SaveFile.setup`, so replay and load
rebuild the same table. **No frozen contract changes.**

1. **Board.** Order `BOARDS = [board.bog, board.ruins, board.village, board.wasteland, board.outpost]`. If the player
   chose a board (start screen or URL), use it. Otherwise
   `BOARDS[nextU32(deriveSeed(seed, 'battlefield', 'board'))[0] % 5]` (`rng.ts` exports both; neither touches
   `state.rng`).
2. **Eligible layouts** for the scenario: the board's layouts whose `table` matches the scenario's table and that
   contain every `scenarioTerrain` element's `terrain` id, with the same footprint, height and rulesType as the
   piece of that id in the scenario's own `terrainLayout`, at the same pos and rot. For a 48" scenario, the scaled
   layouts of D are added.
3. **Layout.** If the scenario is in `FIXED_LAYOUT_SCENARIOS = ['scn-qs-demo']` (GOLD-001 depends on the Quick Start
   ponds), or nothing is eligible, use the scenario's `terrainLayout`; the board still sets the mat, light and
   `reskin`. Otherwise `eligible[nextU32(deriveSeed(seed, 'battlefield', 'layout'))[0] % eligible.length]`. A URL
   `?layout=<id>` overrides it when that layout is eligible (tests).
4. **Seed first.** `buildNewGame` makes the seed (`?seed=` or `randomSeed()`) before choosing, and passes both
   `seed` and `layout` to `newGame`, so `?seed=X` always gives the same board and layout when the board is Random.
5. **Persistence.** `ClientSave` (client type, not frozen) gains optional `board?: Id`. On load the board is
   `save.board`, else the board whose `layouts` contain `setup.layout`, else rule 1 from `file.seed`. The
   start-screen choice is remembered in the settings store (`localStorage`, try/catch).
6. **UI.** Start screen, next to Scenario: "Battlefield" select with *Random* (default) and the five display names.
   URL `?board=random|bog|ruins|village|wasteland|outpost` (a short name or the full id); an unknown value means
   Random and logs one console warning. The in-game Menu shows "Battlefield: <board name>, <layout name>".

**Files that change (implementation task, not this one):** `src/client/battlefield.ts` (new: `pickBattlefield`,
`boardOfLayout`, `scaleLayout48`), `src/client/ui/start/{StartScreen.tsx,startOptions.ts}`, `src/client/App.tsx`
(URL), `src/client/store/{gameStore.ts,settingsStore.ts}` (`NewGameOptions.board`, `ClientSave.board`),
`src/data/terrain/{boards.json,pieces-*.json,layouts/*.json}`, `src/data/raw.ts`, `src/data/index.ts`
(`RecordType 'board'`, board refs, the anchor check from rule 2 for every board layout and scenario pair),
`src/data/schema/board.schema.json` and `docs/spec/schemas/board.schema.json`, `tools/validate-data.ts` (TER-102 to
TER-106). Recommended, not a contract file: `src/engine/setup.ts` rejects with `E_BAD_SETUP` when a
`scenarioTerrain` element's piece is missing from the chosen layout (closes G6). If a later change needs the board
inside the engine state, add an optional `GameSetup.board?: Id` (additive, logged in 00 §14). It is not needed now.

## F. Client rendering

**Assets.** GLB per piece at `public/assets/terrain/<slug>.glb`. Model contract (the same as Mallet's ruins): y up,
origin at the bottom-face centre, long horizontal side along +x, metres or any unit (it is fitted). Ground mats at
`public/assets/terrain/boards/<board>/{albedo,normal,rough}.jpg`, 2048 × 2048, sRGB albedo, linear normal and
roughness, each under 1.5 MB. The table surround uses `public/assets/terrain/boards/table/{albedo,normal,rough}.jpg`
(dark walnut, 1024², tiled). Only the chosen board's files load; the start chunk loads none.

**Pipeline (tools, later task):** SDXL concept from `tools/terrain-catalog.json` `prompt` → owner pick → Hunyuan3D
mesh (the local pipeline used for the figures) → decimate to the budget → bake a 1024² albedo (plus normal if
cheap) → GLB. The output is a grey-resin model tinted at runtime by the board's `fallback.piece` colour times the
baked albedo, so one model style fits its board.

**Fit (`src/client/board/terrainFit.ts`, ported from Mallet `src/client/board/ruinFit.ts`).** It works in the
piece's local space (the engine's pos and rot are applied to the group afterwards):
- `localBounds(footprint)`: the bbox of the rect, circle or polygon.
- `simpleTurns(modelSize, bounds)`: a quarter turn when the model's long side is not the footprint's long side
  (Mallet's rule). Rect and polygon only; circles use 0.
- Scale: x and z each scale to the footprint bbox, but if the two factors differ by more than 15% use the smaller
  for both and centre the model (no squashed trees). y scales to `visualHeight`.
- `idVariant(id)` (Mallet's trailing-digit rule) flips twin pieces 180° about y only when the footprint looks the
  same after a half turn, so two copies of a piece don't look stamped. The flip stays inside the footprint.
- The fitted bbox must lie within the footprint bbox (±5% x/z) and within `visualHeight` (±5% y) (TER-121).
- Generic pieces (`terrain.low-wall`, `terrain.pond`) use `board.reskin`. Other non-board pieces have no GLB and
  use the fallback.

**Fallback.** The current `Terrain.tsx` prisms and instanced cones and chunks stay as the stand-in while a GLB
loads, if it fails, or on Low graphics when a piece has no GLB. They are tinted by `board.fallback`. A failed GLB
logs once and never throws.

**Footprint truth.** A faint footprint outline (the `outlineGeometry` edges at 25% opacity) is always drawn, so the
rules area is readable under organic models. The LOS view (L) and ruler use engine data only, as now.

**Occlusion.** A piece whose visual height is over 2" fades to 35% opacity while it stands between the camera and
the selected model, the hovered model or the current attack target (one ray per candidate per frame, only for
pieces whose bbox the ray hits). Rules do not change.

**Ground and table.** `Surface.tsx` draws the play area with the board's mat (`MeshStandardMaterial` with
`map`, `normalMap`, `roughnessMap`). The 1" grid becomes an optional overlay (Settings: Grid *Off / Subtle /
Full*, default Subtle = 6" ticks on the brass edge only). Outside the play edge sits a dark wood table top 12" wide
on every side (walnut texture, tiled every 12"), 0.05" below the mat, with the brass trim kept at the play edge. On
Low graphics the mat drops its normal and roughness maps and the wood uses a flat colour (`#2a1d14`).

**Light.** `Lights` takes the board's `light`: key colour and intensity, hemisphere/ambient colour, and scene fog
(near 40", far 110"). The background colour is the fog colour. Shadows stay High-only.

**Performance budget.**
- ≤ 15k triangles and ≤ 1 MB per piece GLB, one material, 1024² textures at most.
- One table (8 pieces, about 5 unique) ≤ 100k terrain triangles. Twins and repeated pieces share geometry and
  material (the existing `glbLoader` cache). Within a piece, repeated sub-parts (trees in a stand, stakes, rocks)
  are instanced when the GLB is authored as parts; otherwise the whole piece is one mesh.
- Board assets for one game ≤ 12 MB (8 GLBs + 3 mat maps + table), loaded after the game screen shows, with the
  fallback drawn meanwhile.
- `tests/e2e/art.spec.ts` frame time on each board ≤ the M5 baseline + 3 ms mean (18.5 ms → 21.5 ms headless).

## G. Test IDs

TER-101 to TER-124, listed in `12-rules-test-checklist.md` under "TER (M8: terrain boards)". Data and selection
tests go in `tests/data/terrain-boards.test.ts` and `tests/client/battlefield.test.ts`, rules in
`tests/engine/terrain-boards.test.ts`, rendering in `tests/client/terrainFit.test.ts` and `tests/e2e/art.spec.ts`.
TER-113 (hazard) and TER-114 (trench) stay `todo` until G1 and G2 are fixed.
