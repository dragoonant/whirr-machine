# 30: Figures

How models look on the table. Rules never read meshes: measurement, LOS and collision use the base circle and the LOS
cylinder from data (`20-data-schema` §4). Pipeline detail is in handoff Part D.3; this file is the game-side contract.

## 1. Style ("master grade SD")

| Aspect | Rule |
|---|---|
| Proportions | Gundam SD model-kit, NOT chibi: ~3 heads tall, head ≈ ⅓ height, short compact torso, short sturdy legs |
| Detail | crisp hard-surface panels, rivets; oversized hands and weapons |
| Base | plain round black base, sized by the model's real MK4 base |
| War-engines | the stars: chunky boilers, smokestacks, rivets, oversized fists; *heavier* silhouette than infantry, not just bigger |
| Casters | exaggerated staffs, guns, coats, armour |
| Faction read | archetypes only: "industrial blue-and-gold republic" vs "frozen red-and-iron empire"; no SFG designs |
| Markings | original from day one; no SFG icons, cog-and-sword or faction symbols (`faction.marking` slug) |
| House reference | `C:\Users\antho\Hunyuan3D-2\refs\librarian.webp` |
| Concept prompts | each faction gets a clean two-hue scheme in the prompt (army painter input, §4) |

## 2. Bases and heights

| Base | Diameter (in) | LOS volume height (in) | Typical class | Mesh height (in) |
|---|---|---|---|---|
| 30mm | 1.181 | 1.75 | infantry, solo, caster | 1.15–1.3 |
| 40mm | 1.575 | 2.25 | light war-engine, large solo | ~1.8 |
| 50mm | 1.969 | 2.75 | heavy war-engine | 2.3–2.6 |
| 80mm | 3.150 | 3.25 | super-heavy | ~3.2 |
| 120mm | 4.724 | 5.0 | colossal, battle engine | ~4.5 |

- `model.figure.heightIn` overrides mesh height; `model.losHeight` overrides the LOS height (rare).
- `stage_finalize.py` scales the mesh to `heightIn`, adds the black base cylinder at the base diameter, matte material.
- The LOS cylinder is drawn as a faint ghost only in the LOS view and the `?gallery` debug toggle.

## 3. GLB mapping and procedural fallback (`src/client/figures/`)

| File | Role |
|---|---|
| `glbModels.ts` | `GLB_SLUG_BY_MODEL: Record<profileId, slug>` (default = `model.figure.slug`), `ENABLED_GLB_SLUGS: Set<slug>` |
| `glbLoader.ts` | loads `${BASE_URL}assets/models/<slug>.glb` with a shared cache; draco off; 1024 textures |
| `GlbBody.tsx` | renders the GLB; attaches weapon sub-meshes to sockets (§5) |
| `glbPaint.ts` | army painter shader + material cache (§4) |
| `Procedural.tsx` | fallback body per `figure.archetype`, from shared geometries |

- Slug = `<faction>-<model-kebab>` (`cygnar-caine`, `khador-razor`); one GLB per slug in `public/assets/models/`.
- A model renders its GLB only if its slug is in `ENABLED_GLB_SLUGS` **and** the file exists; otherwise procedural.
- Before overwriting GLBs, `git mv` old ones to `art/archive/` in the same commit; `main` never enables a slug
  without its file (a test checks `ENABLED_GLB_SLUGS` ⊆ files on disk).
- Budgets: ≈10k faces and one 1024 texture per figure; terrain ≈15k faces.

Procedural archetypes (M3 placeholders, also the permanent fallback). One `BufferGeometry` per part type shared by
every instance; materials shared per (faction, part).

| Archetype | Build |
|---|---|
| `infantry` | capsule body, sphere head (⅓ height), box gun or blade, base disc |
| `caster` | infantry + tall coat cone, staff cylinder, shoulder plates |
| `solo` | infantry + one signature prop |
| `lightEngine` | rounded box hull, short legs, one smokestack, two arm boxes |
| `heavyEngine` | wide boiler cylinder, two stacks, big fist boxes, stubby legs, head dome |
| `superHeavyEngine` / `colossal` | heavyEngine scaled with 3–4 stacks, extra arm pair or plating |
| `battleEngine` / `structure` | chassis box + mounted weapon |

## 4. Army painter (two-hue remap)

- GLB textures are baked, so a fragment shader (`onBeforeCompile` on `MeshStandardMaterial`) converts each texel to
  HSV and remaps texels whose hue is within ±`band` (default 22°) of `faction.sourceHues[0|1]` to the chosen paint
  `primary` / `secondary`, keeping the source value (lightness) and scaling saturation.
- Texels with saturation < 0.18 (metal, black, white) are untouched.
- Materials are cloned per `(sourceMaterialUuid, paintKey)` and cached; never per figure.
- The base cylinder is a separate material recoloured to `palette.base` (default near-black).
- Setup panel: per side, a preset list (faction default + 4 originals) and two colour pickers; persisted in
  `localStorage` (`wm.paint.<faction>`).
- Procedural figures use `palette.primary` / `secondary` directly.

## 5. Status visuals (driven by state, never by animation)

| State | Visual |
|---|---|
| knocked down | figure tipped ~80° onto its side, base stays flat |
| stationary | translucent ice/stun shell (shared geometry), slow shimmer |
| crippled system | sparks (arm L/R), smoke (head H), steam puffs (movement M), flicker (cortex C), from the socket nearest the system |
| focus on a war-engine | 0–3 glowing orbs orbiting the hull at ~0.7× height; caster focus as a number badge + orbs |
| disabled | grey desaturation, figure slumped; kept until boxed/destroyed resolves |
| destroyed | short collapse clip, then removal (state removes the model) |
| fire / corrosion | small flame / green drip particle loop |
| cloud effect | 3" translucent smoke dome at the effect point |
| inert | dim emissive, desaturated |
| upkeep spell | thin coloured ring under the base, colour per side |
| selected / target / engaged | gold ring / red ring / red engaged arc on the base edge |

All particles are pooled; `Low` graphics replaces particles with static icons.

## 6. Open question for the M3 owner gate: war-engine weapon loadouts

War-engine hardpoints swap arms and heads; a fused GLB cannot show the chosen loadout (Mallet never solved
"weapon matches loadout").

| | A. Sockets (separate arm/weapon GLBs) | B. One GLB per common loadout |
|---|---|---|
| How | body GLB with empty hands/shoulders; weapon GLBs attached at named sockets (`hand-l`, `hand-r`, `shoulder-l`, `shoulder-r`, `head`, `back`) | generate `<slug>--<option-ids>.glb` for each loadout in lists we ship |
| Generation | Hunyuan makes a weapon-less body (prompt "empty fists") + one GLB per weapon; socket transforms set once per body in `glbModels.ts` | each loadout is a full pipeline run (~90 s shape + 20 s paint) |
| Fidelity | joins can look stuck-on; needs a small socket-alignment tool in `?gallery` | best-looking, single fused mesh |
| Scale with content | linear in weapons; any loadout combination works | combinatorial; unknown loadouts fall back to default |
| Crippled sparks | emit from the weapon's socket exactly | approximate socket points per GLB |
| Data hook | `WeaponMount.socket` (already in the schema) | `GLB_SLUG_BY_MODEL` keyed by `profile + loadout` |

- **Recommendation:** A for war-engines (sockets), fused GLBs for casters, solos and troopers. B as a fallback for any
  engine whose socket version looks wrong at the gate.
- **Gate deliverable (M3):** one heavy war-engine done both ways through the full pipeline, side by side in
  `?gallery`, with 2 loadouts each. Owner picks; record the decision in `PLAN.md`.

## 7. Gallery (`?gallery`)

Grid of every profile in the bundle (procedural and GLB side by side), base ring and LOS cylinder toggles, army-painter
pickers, status-visual toggles (§5), loadout picker and socket gizmos. Used for owner review and screenshot tests.
