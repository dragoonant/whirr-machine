// M8 terrain + themed boards. Workflow({ scriptPath: 'tools/workflows/w8-terrain.js', args: { stage: 'spec' | 'art' | 'build' | 'ship' } })
export const meta = {
  name: 'w8-terrain',
  description: 'Whirr Machine M8: five themed boards with Hunyuan GLB terrain, random board/layout per game, full terrain rules',
  phases: [
    { title: 'Spec', detail: 'terrain/board spec + catalog ∥ one-piece GPU probe' },
    { title: 'Art', detail: 'SDXL concepts + Hunyuan GLBs for every piece ∥ five ground mats' },
    { title: 'Build', detail: 'engine/data layouts + rules audit ∥ client board + GLB terrain' },
    { title: 'Ship', detail: 'play through, screenshots, commit, push, Pages' },
  ],
}

const ROOT = 'C:/Users/antho/OneDrive/Documents/WarMForge/whirr-machine'
const MALLET = 'C:/Users/antho/OneDrive/Documents/Mallet-42k'
const HY2 = 'C:/Users/antho/Hunyuan3D-2'
const HY21 = 'C:/Users/antho/Hunyuan3D-2.1'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const STAGE = (args && args.stage) || 'spec'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }

const COMMON = `Project root: ${ROOT} (git repo, main, Pages https://dragoonant.github.io/whirr-machine/). Windows; use absolute paths, the cwd resets. Run long commands in the FOREGROUND. Orient from ${ROOT}/STATUS.md only, then the spec sections named. IP rule: terrain pieces are ORIGINAL designs merely inspired by the mood of the official Warmachine terrain packs (crooked trees, ruins, watchtowers, trench lines); never copy SFG sculpts, art, logos or trade dress; all prose in our own words; never feed SFG photos to any generator. Frozen contracts: src/engine/{types,actions,events,hooks,rng,decider,index}.ts — additive changes only, each needs a matching note in docs/spec/00-architecture.md §14 and an entry in your issues. MK3 guard: no facing, free strikes, STR or templates; melee range 1"; run is SPD+5". Concurrent agents share the tree: touch only files you own, never git commit or npm install unless told, never edit STATUS.md or package.json unless told. Final output is raw JSON, ≤300 tokens.`

const THEMES = `The five boards (owner decision 2026-10-05), each with its own ground mat and its own piece set:
1. bog — Grymkin-style haunted bog: twisted dead trees, a crooked stilt hut, mossy stumps, murky pools, bone-strewn mud.
2. ruins — Dusk-elf-style ancient ruins: carved monolith with tree roots, broken arches and colonnade walls, crystal clusters, flagstone ruin platforms, rocky rubble.
3. village — Umbreyan (Khador frontier) village: domed stone chapel, tall stone watchtower, pine stands, split-rail fences, low stone walls, a pond, rocks.
4. wasteland — Infernal blight: spiked iron-and-chain wall, thorny dead trees, ritual circle platforms, cracked ash, molten/blighted pools (hazard), bone spikes.
5. outpost — Gravedigger-style snowy trench outpost: timber palisade fort, snowy pines, zig-zag trench line, sandbag/stake barricades, supply wagon, frozen pond, snow-covered rocks.`

const specAgent = () => agent(`${COMMON}
You own ONLY: docs/spec/70-terrain-boards.md (new), tools/terrain-catalog.json (new), and an appended M8 block in docs/spec/12-rules-test-checklist.md.
Read: docs/spec/10-rules-core.md §R10 and §R5/§R6 terrain parts, docs/spec/20-data-schema.md (terrain + layouts), docs/spec/11-scenarios.md, src/engine/terrain.ts, src/engine/setup.ts (terrain placement), src/data/schema/{terrain,terrain-layout,scenario}.schema.json, src/data/terrain/**, src/client/board/{Terrain.tsx,Board.tsx,layout.ts} (skim), ${MALLET}/src/client/board/ruinFit.ts.
${THEMES}
Write docs/spec/70-terrain-boards.md that freezes:
A. Rules audit: for each TerrainRulesType, what R10 says vs what src/engine/terrain.ts/los.ts/movement.ts do; list concrete gaps (do not fix code).
B. Piece catalog: 6–8 pieces per board (≈35 total) covering forest, hill, obstacle (wall/fence/barricade), obstruction or building, rubble or trench, and water/hazard where it fits. Per piece: id "terrain.<board>-<name>", name, rulesType, footprint (rect or polygon in inches, sized like real tabletop pieces: forests ~5–7", hills ~6–8", walls ~4–5" x 0.75–1", buildings ~4–6"), height, glb slug "wt-<board>-<name>", visual height in inches.
C. Boards: id board.<theme>, display name (ours), ground mat description, lighting tint, fallback colours.
D. Layouts: 3 hand-authored layouts per board for 36x36 (and rule for 48x48 scale-up), point-symmetric about the centre for fairness, deployment zones and scenario objectives/flags kept clear (read the scenario files for their zones), 5–8 pieces each, ≥3" gaps so 50mm bases can pass. Give exact positions/rotations.
E. Selection: how a game picks board + layout deterministically from the game seed (start screen option "Battlefield: Random / <each board>"; URL ?board=). Prefer selection before engine setup so the engine just receives a layout id; say which files change and whether any frozen contract changes (additive only).
F. Client rendering: GLB at public/assets/terrain/<slug>.glb, fitted to footprint via a ported ruinFit; procedural fallback; ground mat textures at public/assets/terrain/boards/<board>/{albedo,normal,rough}.jpg 2k; a dark wood table surround beyond the play edge; per-board light tint; performance budget (≤15k tris per piece, instanced where repeated).
G. Checklist IDs TER-1xx for the new tests.
Also write tools/terrain-catalog.json: [{slug, pieceId, board, rulesType, footprint, height, visualHeight, prompt}] where prompt is an SDXL prompt for a SINGLE tabletop terrain piece, original design, "unpainted grey resin 28mm wargame terrain piece on a sculpted base, isolated, plain white background, studio lighting, three-quarter view, whole piece in frame" plus the piece's specifics. Keep each prompt ≤60 words.
Return JSON: ok, summary, files, issues (top rules gaps).`, { label: 'spec', phase: 'Spec', schema: RESULT, effort: 'high' })

const probeAgent = () => agent(`${COMMON}
You own ONLY: ${HY2}/wm_terrain_probe/** and new scripts named ${HY2}/terrain_*.py / ${HY21}/terrain_*.py (do not edit existing pipeline scripts; copy and adapt). GPU work is approved by the owner.
The figure pipeline: ${HY2}/{concepts_sdxl.py,stage_cutout.py,stage_paint.py} (2.0 venv, Python 3.11) and ${HY21}/{stage_shape.py,stage_finalize.py} (2.1 venv, 3.10); driven by units.json / picks.json; set UV_SYSTEM_CERTS=1; uv at C:/Users/antho/.local/bin/uv.exe. Read the scripts first. Figures get a black round base and are scaled by height; terrain must NOT get a black base, must keep its sculpted base, and must be scaled so its XZ footprint matches given inches (scale by the larger horizontal extent) with y up and the base resting at y=0.
Probe ONE piece end to end: "wt-bog-deadtree": prompt "unpainted grey resin 28mm wargame terrain piece on a sculpted base, a gnarled twisted dead tree with hollow trunk and spiral bark, roots gripping a muddy oval base, original design, isolated, plain white background, studio lighting, three-quarter view, whole piece in frame", footprint ~5x4", visual height 6". Generate 4 SDXL concepts (no style reference image or style 0), pick the cleanest, cut out, shape (do NOT cut the base: use the --nocut equivalent), paint texture, finalize to ${HY2}/wm_terrain_probe/wt-bog-deadtree.glb with a terrain-specific finalize (no black base, footprint scaling, ≤15k faces, 1024 texture, matte). Render a preview PNG.
Then write ${HY2}/terrain_batch.py (or .ps1) that runs the whole chain for every entry of a catalog JSON [{slug, prompt, footprint, visualHeight}] into an output dir, skipping slugs whose GLB exists, logging per-slug time; plus a contact-sheet script. Do not run the batch.
Report minutes per piece, VRAM peak, issues (white-background bleed, base cut, thin branches lost, texture quality).
Return JSON: ok, summary, files (glb, preview png, batch script), issues.`, { label: 'gpu-probe', phase: 'Spec', schema: RESULT, model: 'sonnet' })

if (STAGE === 'spec') {
  phase('Spec')
  const [spec, probe] = await parallel([specAgent, probeAgent])
  const sp = r => r && { ok: r.ok, summary: r.summary, files: (r.files || []).slice(0, 8), issues: (r.issues || []).slice(0, 8) }
  return { spec: sp(spec), probe: sp(probe) }
}

const SPEC = `${ROOT}/docs/spec/70-terrain-boards.md`
const CAT = `${ROOT}/tools/terrain-catalog.json`
const s = r => r && { ok: r.ok, summary: r.summary, files: (r.files || []).slice(0, 8), issues: (r.issues || []).slice(0, 8) }

const gpuAgent = () => agent(`${COMMON}
You own ONLY: ${HY2}/terrain_*.py, ${HY21}/terrain_*.py, ${HY2}/outputs/wt-*/**, ${HY2}/wm_terrain_probe/**, ${ROOT}/public/assets/terrain/*.glb, ${ROOT}/art/terrain-sheets/** (contact sheets, small PNGs only). GPU work is owner-approved; the GPU is the only heavy job right now (if another process holds >4 GB VRAM, wait and re-check every few minutes rather than fighting it; never kill other processes).
Read ${SPEC} §B and §F, ${CAT}, and the probe notes in ${HY2}/wm_terrain_probe/wt-bog-deadtree.json. The probe scripts (terrain_concepts.py, terrain_cutout.py, terrain_shape.py, terrain_paint.py, terrain_finalize.py, terrain_batch.py, terrain_contact.py) already exist.
Fix first:
1. Scaling: scale uniformly so the BASE footprint (horizontal extent of the lowest 0.25 in / lowest ~4% of height of the mesh) matches the catalog footprint's long side; then if the resulting height is off visualHeight by more than 25%, apply an extra y-only scale clamped to [0.8, 1.35]. Record base extent, overall extent and height in the sidecar JSON.
2. Axis: after scaling, rotate about y so the base's long axis lies along +X (catalog footprints are long on x).
3. Concepts: add to the negative prompt "multiple views, collage, turnaround sheet, black base, round black plinth, text, watermark, people, miniatures"; generate 4 seeds, auto-pick with the existing heuristic, reject collages (more than one connected component in the cutout mask covering >8% each).
4. Make terrain_batch.py robust: per-slug try/except, resume (skip slugs with a finished GLB), log JSON lines to ${HY2}/outputs/terrain_batch.log.jsonl.
Then run the batch over all catalog entries. Each Bash call must stay under 10 minutes, so invoke the batch one slug at a time (a --only <slug> flag) in the FOREGROUND, looping in your own turns. Do the five boards in order bog, ruins, village, wasteland, outpost. Re-use the probe tree for wt-bog-deadtree only if its slug matches the catalog; otherwise regenerate.
Copy each finished GLB to ${ROOT}/public/assets/terrain/<slug>.glb (≤1.5 MB each; re-encode texture JPEG q85 / 1024 if larger). Make one contact sheet per board at ${ROOT}/art/terrain-sheets/<board>.png (≤600 KB).
QUALITY CHECK EVERY PIECE (owner order: redo anything less than ideal). After each slug finishes, open its <slug>_sheet.png with the Read tool and LOOK at it. Reject and redo if ANY of: it is not the object the catalog names (e.g. a fence that came out as a cabin, an arch with no opening); it is a near-duplicate of another piece on the same board; a backdrop/panel/slab or ground plane is fused to it; parts are missing or it floats; base cut off or not flat on y=0; the silhouette is mush or blobby; the size in the sidecar is off the footprint/visualHeight by more than 35% (e.g. a "very low" rough-ground patch with a 2" tall lump); colours look muddy or garish next to the other pieces of its board. To redo: delete the GLB + work dir for that slug, strengthen the prompt in tools/terrain-catalog.json (say concretely what it must be and add "no ..." for what went wrong; long thin pieces work better with "wide side view"), try new seeds, and run again. Up to 3 attempts; keep the best attempt and list it in issues if still weak. Already-finished pieces from the previous run (13 GLBs in public/assets/terrain) were reviewed by the owner and approved; do not redo them. Five were deleted for redo with improved prompts: wt-village-pines, wt-village-rail-fence, wt-ruins-arch, wt-bog-stumps, wt-bog-bone-mire — run those after the remaining new pieces. At the end, view each board's contact sheet once more as a set and redo any piece that clashes with its board.
Return JSON: ok, summary (pieces done/failed, mean minutes per piece), files (the 5 contact sheets), issues (failed slugs + why).`, { label: 'gpu-batch', phase: 'Art', schema: RESULT, model: 'sonnet' })

const matsAgent = () => agent(`${COMMON}
You own ONLY: ${ROOT}/public/assets/terrain/boards/**, ${ROOT}/public/assets/terrain/CREDITS.md, ${ROOT}/art/board-textures/**.
Read ${SPEC} §C and §F and ${ROOT}/art/board-textures/gen.py (Mallet's battle-scarred FFT-noise ground generator) if it exists; else port it from ${MALLET}/art/board-textures/gen.py.
Make a ground mat for each of the five boards (bog, ruins, village, wasteland, outpost) plus one dark wood tabletop for the surround: public/assets/terrain/boards/<board>/{albedo,normal,rough}.jpg at 2048 (≤900 KB each; the wood at 1024 is fine, put it at boards/table/). Base them on CC0 Poly Haven textures (download the 2k JPGs via the polyhaven API: https://api.polyhaven.com/files/<id>; pick fitting ids such as forest/mud/brown_mud, rocky/stone/flagstone variants, snow, ash/burnt/volcanic ground, wood_table / dark_wooden_planks), then make them non-tiling and characterful with gen.py-style large-scale noise: patches of moss/puddles for the bog, flagstone ruins + crystal-lit cracks for the ruins, muddy grass and a cart track for the village, cracked ash with ember glow in cracks for the wasteland, trampled snow with mud ruts for the outpost. Each mat should read as one 36"x36" table at a glance, not a repeating tile. Credit every source in CREDITS.md (asset name, author, CC0, URL). Also write public/assets/terrain/boards/boards.json: [{board, tint (hex light colour), fogColor, edgeColor, fallbackColor}] matching §C.
Write a quick preview PNG of all five albedos side by side to ${ROOT}/art/board-textures/preview.png (≤600 KB). QUALITY CHECK (owner order: redo anything less than ideal): open the preview with the Read tool and look; redo any mat that shows visible tiling/seams, is too busy or too dark to read figures on, or does not read as its theme at a glance.
Return JSON: ok, summary, files (preview + boards.json), issues.`, { label: 'ground-mats', phase: 'Art', schema: RESULT, model: 'sonnet' })

const engineAgent = () => agent(`${COMMON}
You own ONLY: src/engine/** (frozen files additive only, per the rule), src/data/** (terrain pieces, layouts, schemas, scenarios), src/ai/** (terrain awareness only), tests/engine/**, tests/ai/**, tests/data/**, docs/needs-rules-check.md, docs/spec/00-architecture.md §14, docs/spec/20-data-schema.md terrain sections.
Read ${SPEC} (all; §A gaps, §B catalog, §D layouts, §E selection), docs/spec/10-rules-core.md §R5 §R6 §R9.8 §R10.
1. Data: add every §B piece to src/data/terrain/pieces.json (or per-board files if the loader supports it) and every §D layout to src/data/terrain/layouts/ with the board id. Keep layout.ashwall-divide and its w1/w2 anchors. Make npm run validate:data pass.
2. Rules gaps G1–G7 from §A: wire hazard terrain (R9.8, entry and end-of-activation triggers), trench per a RULING you record, read the schema props overrides the engine should honour (or drop them from the schema), reconcile the rulesType enums, validate obstacle <1" / obstruction ≥1", reject a layout missing the scenario's terrain anchors. One RULING line each where the rule is unclear.
3. Selection per §E: a pure function (e.g. src/data/battlefields.ts or wherever §E says) pickBattlefield(seed, scenarioId, boardPref) -> {board, layoutId}, deterministic from the seed.
4. AI: make the utility bot value cover/concealment (positions behind walls/in forests when shooting is expected), avoid hazards, and not try to path through obstructions; keep bench normal-vs-random ≥ 18/20 (npm run bench:ai -- --games 20 --seed 1).
Tests: ~12 focused tests named TER-1xx from the checklist (hazard damage, trench cover, forest LOS 3", hill elevation, building blocks movement, pickBattlefield determinism, every layout valid and symmetric with no piece in a deployment zone).
Run npm run typecheck, npm test, npm run validate:data. Return JSON: ok, summary, files, issues (contract notes + rulings).`, { label: 'engine-data', phase: 'Build', schema: RESULT, model: 'sonnet' })

const clientAgent = () => agent(`${COMMON}
You own ONLY: src/client/** except src/client/contract.ts (additive edits only there, noted in issues), tests/client/**, tests/e2e/** (new terrain spec only).
Read ${SPEC} §C §E §F and docs/spec/50-client.md. Port ${MALLET}/src/client/board/ruinFit.ts (and its test) for fitting GLBs to footprints.
1. Replace the marble board: ground plane uses public/assets/terrain/boards/<board>/{albedo,normal,rough}.jpg (load via import.meta.env.BASE_URL; fall back to boards.json fallbackColor if missing); a dark wood table surround (boards/table/) extending ~8" past the play edge with a subtle bevelled lip; per-board light tint and fog from boards/boards.json.
2. Terrain pieces render public/assets/terrain/<slug>.glb (slug from tools/terrain-catalog.json or the data piece -> slug map you create in src/client/board/terrainModels.ts), fitted to the engine footprint, shared geometry/material per slug, cast/receive shadows on High graphics; procedural fallback when a GLB is missing or fails (keep today's look but tinted per board). Keep a faint footprint outline only while a model is selected or when a "Show terrain zones" toggle (settings popover) is on, so the rules area stays readable. Forest areas get a subtle darker ground decal.
3. Start screen: "Battlefield: Random / <each board name>" selector next to the scenario picker; the choice + seed go through the engine agent's pickBattlefield (import from where §E says; if it is not there yet, code against the §E signature and note it). URL ?board=<id> overrides. Show the board name in the top bar and on the end screen.
4. Terrain tooltip on hover: name + rules in our own words (cover/concealment/rough/elevation/obstruction/hazard).
5. Performance: one draw call per slug via instancing where a slug repeats; keep frame time similar to today on the Low setting (Low = no terrain shadows, 1k textures).
Run npm run typecheck and your tests. Return JSON: ok, summary, files, issues.`, { label: 'client-board', phase: 'Build', schema: RESULT, model: 'sonnet' })

if (STAGE === 'art-build') {
  const results = await parallel([
    () => { phase('Art'); return gpuAgent() },
    matsAgent,
    () => { phase('Build'); return engineAgent() },
    clientAgent,
  ])
  const [gpu, mats, engine, client] = results
  return { gpu: s(gpu), mats: s(mats), engine: s(engine), client: s(client) }
}

if (STAGE === 'redo') {
  phase('Art')
  const REDO = (args && args.redo) || []
  const r = await agent(`${COMMON}
You own ONLY: ${HY2}/terrain_*.py, ${HY2}/outputs/wt-*/**, ${ROOT}/tools/terrain-catalog.json (prompts of the slugs below only), ${ROOT}/public/assets/terrain/<slug>.glb for the slugs below, ${ROOT}/art/terrain-sheets/*.png. GPU work is owner-approved. Use ${HY2}/terrain_batch.py (--only <slug> --force, one slug per FOREGROUND Bash call, each under 10 minutes) and terrain_contact.py.
The owner ordered: redo anything less than ideal. The main loop reviewed the contact sheets and rejected these pieces; for each, the problem and what it must become:
${REDO.map(x => `- ${x.slug}: ${x.why}`).join('\n')}
For each: rewrite its catalog prompt (keep the house prefix, say concretely what the object must look like, add "no ..." for the failure seen), try fresh seeds, run, then open <slug>_sheet.png with the Read tool and judge it honestly against the catalog name, footprint and visualHeight. Up to 3 attempts per slug; keep the best and say in issues if still weak. Copy the final GLB to ${ROOT}/public/assets/terrain/<slug>.glb (≤1.5 MB). Finally rebuild all five ${ROOT}/art/terrain-sheets/<board>.png (≤600 KB each, delete village-partial.png) and view each once.
Return JSON: ok, summary (per slug: attempts, verdict), files (the five sheets), issues.`, { label: 'gpu-redo', phase: 'Art', schema: RESULT, model: 'sonnet' })
  return { redo: s(r) }
}

if (STAGE === 'ship') {
  phase('Ship')
  const ship = await agent(`${COMMON}
Integrate M8. You may edit any src file, tests, STATUS.md, HANDOFF.md, package.json, public/assets/terrain/**.
1. npm run typecheck, npm test, npm run validate:data, npm run build green; npm run bench:ai -- --games 20 --seed 1 normal ≥18/20.
2. Play in Playwright (vite preview at /whirr-machine/): for EACH of the five boards (?board=<id>), start Khador vs the normal bot, deploy, play one round through the UI. Fix any crash, missing/misplaced GLB (piece floating, sunk, rotated off its footprint, clipping a deployment zone), unreadable ground, stuck prompt. Report ms/frame per board.
2b. Quality check in-game (owner order: redo anything less than ideal): open each screenshot with the Read tool and judge it. Fix (client fit, ground mat contrast, lighting tint, scale, z-fighting, piece sunk/floating) until each board looks like a finished tabletop. A GLB that looks wrong in context: list its slug in issues as "needs GPU redo" (do not run the GPU yourself).
3. Screenshots to e2e-out/: board-<id>.png for all five (the overview camera after deployment) and board-<id>-close.png for two of them (low angle across terrain toward the figures).
4. Update STATUS.md + HANDOFF.md (M8 done; owner to veto pieces from art/terrain-sheets/*.png). Stage by exact paths: src public/assets/terrain tools/terrain-catalog.json tools/workflows/w8-terrain.js docs/spec docs/needs-rules-check.md art/terrain-sheets art/board-textures tests STATUS.md HANDOFF.md package.json package-lock.json (never docs/sources, Tokens, e2e-out, refs). Commit "M8: five themed battlefields with generated terrain, random board per game" + blank line + "${ATTR}"; git pull --rebase; git push origin main; gh run watch the Pages deploy (fix and retry up to 2 times).
Return JSON: ok, summary (≤120 words), files (absolute screenshot paths), issues.`, { label: 'terrain-ship', phase: 'Ship', schema: RESULT, effort: 'high' })
  return { ship: s(ship) }
}

return { error: `stage ${STAGE} not written yet` }
