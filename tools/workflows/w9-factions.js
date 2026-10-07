// M9 four new factions (Trollbloods, Circle Orboros, Cryx, Protectorate of Menoth) + warlocks/fury + army picker.
// Workflow({ scriptPath: 'tools/workflows/w9-factions.js', args: { stage: 'spec' | 'build' | 'client' | 'concepts' | 'audio' | 'gpu' } })
export const meta = {
  name: 'w9-factions',
  description: 'Whirr Machine M9: Trollbloods, Circle, Cryx, Menoth starters, warlocks and fury, any-vs-any army picker, figures and audio',
  phases: [
    { title: 'Spec', detail: 'fury spec + contract plan ∥ four faction specs with refs' },
    { title: 'Build', detail: 'contracts, fury engine ∥ four faction data sets, adversarial rules verify, fix, push' },
    { title: 'Client', detail: 'army picker + faction colours, warlock UI, placeholder figures, AI fury, push' },
    { title: 'Concepts', detail: 'Gemini MGSD concepts of the real sculpts via Claude in Chrome' },
    { title: 'Audio', detail: 'SFX, narrator lines, four faction themes, push' },
    { title: 'GPU', detail: 'Hunyuan figures from concepts, wire, terrain redo + decimate, push' },
  ],
}

const ROOT = 'C:/Users/antho/OneDrive/Documents/WarMForge/whirr-machine'
const HY2 = 'C:/Users/antho/Hunyuan3D-2'
const HY21 = 'C:/Users/antho/Hunyuan3D-2.1'
const MALLET = 'C:/Users/antho/OneDrive/Documents/Mallet-42k'
const SCRATCH = 'C:/Users/antho/AppData/Local/Temp/claude/C--Users-antho-OneDrive-Documents-WarMForge/99905eb5-ef31-407f-8f8a-059349faa0bd/scratchpad'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const STAGE = (args && args.stage) || 'spec'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fail'] }, coverage: { type: 'string' }, failing: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string' }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'where', 'problem', 'fix'] } }, notes: { type: 'string' } }, required: ['verdict', 'coverage', 'failing', 'notes'] }
const s = r => r && { ok: r.ok, summary: r.summary, files: (r.files || []).slice(0, 10), issues: (r.issues || []).slice(0, 10) }

const COMMON = `Project root: ${ROOT} (git repo, main, Pages https://dragoonant.github.io/whirr-machine/). Windows; use absolute paths, the cwd resets. Run long commands in the FOREGROUND. Orient from ${ROOT}/STATUS.md only, then the spec sections named. IP rule (Mallet posture): real unit, weapon, ability and spell names are fine; ALL prose (ability text, lore, UI copy, docs) is in our own words, never copied card or rules text; never put SFG art, logos, icons or photos in the repo. Frozen contracts: src/engine/{types,actions,events,hooks,rng,decider,index}.ts — additive changes only, each needs a matching entry in docs/spec/00-architecture.md §14 and a line in your issues. MK3 guard: no facing, free strikes, STR or templates; melee range 1" (2" reach); run is SPD+5"; MK4 rules only (docs/WARMACHINE-HANDOFF.md Part E.11 has the MK3→MK4 table). Rules ambiguities never block: decide, and record "RULING: <rule> | <what we did> | <why>". Concurrent agents share the tree: touch only files you own, never git commit or npm install unless told, never edit STATUS.md or package.json unless told. Rules sources: ${ROOT}/docs/sources/*.pdf (gitignored; extract with /mingw64/bin/pdftotext into ${SCRATCH}/pdf/ if not there already, and read the text). Community card data: github isorna/wardice-warmachine-data (fetch raw JSON from GitHub; research aid only, never commit it). Final output is raw JSON, ≤300 tokens.`

const FACTIONS = [
  { key: 'trollbloods', id: 'trl', name: 'Trollbloods', kind: 'warlock', note: 'Hordes faction: warlock + warbeasts (fury). Typical starter shape: warlock, a heavy warbeast (e.g. a Troll Axer/Impaler/Bouncer or a character heavy), a solo, a 3-model unit.' },
  { key: 'circle', id: 'cir', name: 'Circle Orboros', kind: 'warlock', note: 'Hordes faction: warlock + warbeasts (fury). Typical shape: warlock, a heavy warbeast (Woldwarden/Warpwolf/Gorax class), a solo, a 3-model unit.' },
  { key: 'cryx', id: 'cry', name: 'Cryx', kind: 'warcaster', note: 'Warmachine faction: warcaster + warjacks (focus). Typical shape: warcaster, a heavy warjack (Kraken/Leviathan/Slayer/Harrower class), a solo, a 3-model unit. Expect corpse/soul tokens or Undead/Incorporeal style rules if present in MK4.' },
  { key: 'menoth', id: 'men', name: 'Protectorate of Menoth', kind: 'warcaster', note: 'Warmachine faction: warcaster + warjacks (focus). Typical shape: warcaster, a heavy warjack (Crusader/Templar/Castigator class), a solo, a 3-model unit.' },
]

// ---------------------------------------------------------------- SPEC
const furySpecAgent = () => agent(`${COMMON}
You own ONLY: docs/spec/81-warlocks-fury.md (new), an appended "M9 warlocks and fury" block of FURY-xxx IDs in docs/spec/12-rules-test-checklist.md, and docs/spec/00-architecture.md §14 (append a PLANNED additive contract change list; do not edit the .ts contracts yet).
Read: STATUS.md, docs/spec/00-architecture.md (§2-§7, §14), docs/spec/10-rules-core.md (focus, power attacks, spells, phases), docs/spec/20-data-schema.md, src/engine/{types,actions,events,decider,focus}.ts and src/engine/phases/** (skim), src/data/schema/** (skim), and the MK4 rulebook text in docs/sources (warlocks, warbeasts, fury, leaching, reaving, forcing, frenzy, threshold, animus, transfers/damage transfer, life spirals/spiral, healing, rile, warbeast power attacks and any Hordes-only rules).
Write docs/spec/81-warlocks-fury.md that freezes, with rulebook page references:
A. Rules: every warlock/warbeast/fury rule in MK4 as an exact step list (control phase order incl. leach/reave/upkeep, fury limits, forcing for boosts/additional attacks/power attacks/animi/healing, frenzy test and frenzy behaviour incl. how the AI/engine picks targets, threshold checks if present, transfers and how they interact with Tough/disabled/boxed windows, life spiral damage tracking (aspects: Mind/Body/Spirit, with what each disables), warbeast death with fury left on it, warlock destroyed effects on battlegroup).
B. State and data: ModelState fields (fury on warlock and on beasts, fury capacity FURY stat, spiral boxes), data schema additions (warbeast profile type, FURY stat, spiral definition with branch/aspect boxes, animus spell entry, threshold), focus/fury symmetry so the existing focus code is reused where it is truly the same.
C. Decisions: every new PendingDecision kind (leach, reave, force (boost/extra attack/animus), transfer y/n + target, frenzy target if the rules give the controller a choice, upkeep with fury) with the legalActions shape; which existing decisions gain fury variants.
D. Events and query.*: new events (FuryLeached, BeastForced, Frenzied, DamageTransferred, Spiral box marked, AspectCrippled ...) and query extensions for the UI (fury bars, spiral view, transfer odds).
E. Exact additive contract changes per frozen file (types/actions/events/hooks/decider/index), so a single contracts agent can apply them before fan-out. Also list per-file engine work packages (new src/engine/fury.ts etc.) with disjoint file ownership for parallel builders.
F. AI notes: what the utility AI must decide (how much fury to leach, when to force, when to transfer, frenzy risk), consistent with docs/spec/40-ai.md.
G. Client notes: fury display on cards and HUD, spiral grid component, transfer prompt, frenzy beats.
Append FURY-001.. checklist IDs (≥25) to docs/spec/12-rules-test-checklist.md.
Return JSON: ok, summary, files, issues (open rules questions + RULING lines).`, { label: 'fury-spec', phase: 'Spec', schema: RESULT, effort: 'high' })

const factionSpecAgent = (f) => agent(`${COMMON}
Faction: ${f.name} (data id prefix "${f.id}", engine file key "${f.key}"). ${f.note}
You own ONLY: docs/spec/factions/${f.key}.md (new), ${HY2}/refs/wm/${f.key}/** (local reference photos; NOT in the repo), ${SCRATCH}/research/${f.key}/** (scratch).
Read: docs/spec/factions/cygnar.md (copy its structure and confidence key exactly), docs/spec/20-data-schema.md, src/data/factions/cyg/** and src/data/lists/cyg-qs-recon.json (shape only). Warlock factions also note that docs/spec/81-warlocks-fury.md is being written in parallel; describe fury-related stats in plain terms (FURY stat, spiral boxes per aspect, animus), and do not wait for it.
Owner decision: each new faction gets its OFFICIAL MK4 30-point starter box (the box SFG sells as the faction's starter/battlegroup/army starter in MK4; check warmachine.gg / steamforged.com store pages and the community data). If no 30-point starter exists, use the closest official MK4 box (battlegroup or army box) trimmed to the Cygnar/Khador shape: leader (caster/warlock, 0 pts), one heavy war-engine (warjack or warbeast), one solo, one 3-model unit, totalling ≤30 points; prefer models that are in that official box, and record the choice as a RULING line.
Research cap: ≤8 web fetches plus the community data files you need.
Write docs/spec/factions/${f.key}.md: sources, chosen box and why, roster table, full stat lines, weapons (RNG/ROF/AOE/POW, qualities), abilities (our own short wording), spells (COST/RNG/AOE/POW/DUR/OFF), feat, damage grid or spiral layout, base sizes, the id scheme (${f.id}.<slug>), a palette (primary/secondary/metal/base/ui hex + two sourceHues) and an original marking name for the army painter, shipName per model. Mark every value with the confidence key. List "New mechanics needed" (anything the engine does not do today per STATUS.md: e.g. corpse/soul tokens, Incorporeal, Undead, choir-style, animi, Weapon Master ...) with a one-line implementation sketch each. End with "## Needs rules check" holding RULING lines.
References for figures: download 2–4 official product/store photos per model (store pages, warmachine.gg CDN images) with curl into ${HY2}/refs/wm/${f.key}/<slug>-<n>.<ext> where slug is the model's id slug; for the 3-model unit get the unit photo and note which trooper is which. These are local references only and are never committed. Also write ${HY2}/refs/wm/${f.key}/refs.json [{slug, files[], source urls[], notes}] where notes describe each sculpt's pose, weapons and colours in ≤30 words.
Return JSON: ok, summary (box chosen, points total), files, issues (low-confidence values, new mechanics).`, { label: `spec:${f.key}`, phase: 'Spec', schema: RESULT, effort: 'high' })

if (STAGE === 'spec') {
  phase('Spec')
  const res = await parallel([furySpecAgent, ...FACTIONS.map(f => () => factionSpecAgent(f))])
  return { fury: s(res[0]), factions: FACTIONS.map((f, i) => ({ key: f.key, r: s(res[i + 1]) })) }
}

const FSPEC = f => `docs/spec/factions/${f.key}.md`
const FURY = 'docs/spec/81-warlocks-fury.md'
const commit = (msg, paths) => `Run npm run typecheck, npm test, npm run validate:data and npm run build; fix anything red that is yours, and for anything else record it in issues. Then stage by exact paths (${paths}), confirm no PDF, token, community data file or photo is staged, commit "${msg}" + a blank line + "${ATTR}", git pull --rebase --autostash, git push origin main, and check the Pages workflow run with gh run list -L 1.`

// ---------------------------------------------------------------- BUILD (contracts -> fury ∥ factions -> core mechanics)
const contractsAgent = () => agent(`${COMMON}
You own ONLY: src/engine/{types,actions,events,hooks,decider,index}.ts (additive changes), docs/spec/00-architecture.md §14, docs/spec/20-data-schema.md, src/data/schema/**, tools/validate-data.ts, src/data/raw.ts, src/data/index.ts, src/engine/code-hooks.ts (registration lines only), new stub files src/engine/factions/{trollbloods,circle,cryx,menoth}.ts, new stub dirs src/data/factions/{trl,cir,cry,men}/ (faction.json only), tests/data/** (only to keep the raw-coverage test working).
Read ${FURY} §B, §C, §D, §E and every docs/spec/factions/{trollbloods,circle,cryx,menoth}.md (roster, "New mechanics needed").
1. Apply the additive contract changes in ${FURY} §E exactly (types, actions, events, decider, hooks, index), plus any type additions the four faction specs' new mechanics need (tokens such as corpse/soul, new keyword flags). Update 00-architecture §14 and 20-data-schema.md and the JSON schemas (warbeast profile, FURY stat, spiral, animus, anything the faction specs need). validate-data must accept the new shapes.
2. Make data registration conflict-free for parallel builders: split src/data/raw.ts so each faction has its own src/data/factions/<id>/raw.ts (static imports of its own JSON files, exported as a group) and raw.ts just spreads the per-faction groups (move cyg and kha too, keep behaviour identical). Create src/data/factions/{trl,cir,cry,men}/{faction.json,raw.ts} using each spec's palette/sourceHues/marking.
3. Create stub engine faction modules src/engine/factions/{trollbloods,circle,cryx,menoth}.ts exporting empty <key>Hooks and <key>Plugins with the same shape as cygnar.ts, and register them in code-hooks.ts now, so faction builders never touch code-hooks.ts.
4. Add engine stubs that compile for every new contract function (throwing or returning no-ops is fine) so builders can start; list them in issues.
${commit('M9: warlock, fury and faction contracts, per-faction data registration', 'src/engine docs/spec src/data tools/validate-data.ts tests')}
Return JSON: ok, summary, files, issues (stubs left for builders).`, { label: 'contracts', phase: 'Build', schema: RESULT })

const furyEngineAgent = () => agent(`${COMMON}
You own ONLY: src/engine/fury.ts (new), src/engine/focus.ts, src/engine/phases/control.ts (or whichever phase file runs the control phase), src/engine/damage.ts (transfers, spiral marking, aspect crippling), src/engine/pending.ts (new decision builders), new tests tests/engine/fury*.test.ts. If you need a change in another engine file (activation.ts, attack.ts, power-attacks.ts, spells.ts, turnflow.ts), make the smallest possible edit and list it in issues; faction builders do not touch those files.
Implement ${FURY} §A–§D fully: leaching, reaving, fury upkeep, forcing (boost, additional attacks, power attacks, animi, healing if MK4 has it), frenzy, threshold if present, damage transfer windows, life spirals and aspect effects, warlock death effects, query.* extensions. Reuse focus code where the spec says it is the same. Tests named by the FURY-xxx IDs in docs/spec/12-rules-test-checklist.md, at least one per ID (use a tiny inline test bundle with a generic warlock and warbeast so you do not depend on the faction data being written in parallel).
Run typecheck and your tests (do not commit). Return JSON: ok, summary, files, issues.`, { label: 'fury-engine', phase: 'Build', schema: RESULT, model: 'sonnet' })

const factionDataAgent = (f) => agent(`${COMMON}
Faction: ${f.name} (id prefix ${f.id}).
You own ONLY: src/data/factions/${f.id}/** (models/, weapons.json, abilities.json, spells.json, feats.json, raw.ts, faction.json), src/data/lists/${f.id}-*.json (and its import line inside src/data/factions/${f.id}/raw.ts — lists for your faction register there), src/engine/factions/${f.key}.ts, tests/engine/${f.key}*.test.ts, tests/data/${f.key}*.test.ts.
Read ${FSPEC(f)} (all), docs/spec/20-data-schema.md, ${f.kind === 'warlock' ? FURY + ' §B (data shapes)' : ''}, src/data/factions/cyg/** and src/engine/factions/cygnar.ts as the pattern.
Enter the full starter: every model (and a model file per trooper, like cyg black13-*), weapons, abilities (our own wording), spells, feat, damage grid or spiral, and the 30-point list ${f.id}-starter-recon.json with the same entries shape as cyg-qs-recon.json. Implement every faction-specific ability in src/engine/factions/${f.key}.ts via hooks/plugins like cygnar.ts. If an ability needs a CORE engine change (anything outside your files), do NOT make it: implement the data side, add a TODO with the id, and list it in issues prefixed "CORE:" with an exact description.
Add tests for each special ability and a smoke test that loads the list and runs a headless game vs cyg-qs-recon to round 2 with the random decider (fury stubs may be incomplete while the fury engine is written in parallel; if the warlock smoke test fails only because of fury stubs, mark it it.todo and say so in issues).
Run typecheck, validate:data and your tests (do not commit). Return JSON: ok, summary, files, issues.`, { label: `data:${f.key}`, phase: 'Build', schema: RESULT, model: 'sonnet' })

const coreMechanicsAgent = (todo) => agent(`${COMMON}
You own ONLY: core engine files under src/engine/ except src/engine/factions/** and the frozen contracts (additive contract edits are allowed if strictly needed; then update 00-architecture §14), plus tests/engine/core-m9*.test.ts. Faction files may receive minimal wiring edits to remove the TODOs listed below.
The fury engine and four faction data sets were just written. Their CORE requests:
${todo || '(none)'}
Implement each request properly (generic mechanism per docs/spec/00-architecture.md §6, not faction special cases), wire the faction TODOs, add tests. Then run the whole suite; make every faction smoke test (tests/engine/{trollbloods,circle,cryx,menoth}*) and the fury tests pass, turning any it.todo smoke tests back on. Run npm run sim for a few seeds of each new list vs cyg and kha and fix crashes or stuck decisions (legalActions never empty).
${commit('M9: warlocks and fury, Trollbloods, Circle, Cryx and Menoth starters', 'src tests docs/spec tools/validate-data.ts')}
Return JSON: ok, summary, files, issues.`, { label: 'core-mechanics', phase: 'Build', schema: RESULT, model: 'sonnet' })

if (STAGE === 'build') {
  phase('Build')
  const c = await contractsAgent()
  if (!c || !c.ok) return { contracts: s(c), stopped: 'contracts failed' }
  const res = await parallel([furyEngineAgent, ...FACTIONS.map(f => () => factionDataAgent(f))])
  const core = res.filter(Boolean).flatMap(r => (r.issues || []).filter(i => /^CORE:|another engine file|outside/i.test(i)))
  const m = await coreMechanicsAgent(core.map(x => '- ' + x).join('\n'))
  return { contracts: s(c), fury: s(res[0]), factions: FACTIONS.map((f, i) => ({ key: f.key, r: s(res[i + 1]) })), core: s(m) }
}

// ---------------------------------------------------------------- VERIFY (adversarial, per faction + fury) -> fix -> push
const verifyAgent = (label, scope) => agent(`${COMMON}
You are an adversarial rules verifier. You NEVER edit files. Default to "fail" when unsure.
Scope: ${scope}
Check against the MK4 rulebook text in docs/sources and the spec named: every stat, weapon, ability, spell and feat value vs the spec; every rule step implemented with the right timing; MK3 leaks; tests that pass without proving the rule; legalActions never empty; numbers the UI shows come from query.*. Run the relevant tests and a few npm run sim seeds.
Return VERDICT JSON: verdict, coverage (what you checked), failing [{owner (the file path that must change), where, problem, fix}] (≤12, most severe first), notes.`, { label: `verify:${label}`, phase: 'Verify', schema: VERDICT, effort: 'high' })

const fixAgent = (label, owns, findings) => agent(`${COMMON}
You own ONLY: ${owns}.
Fix these verified findings (each names the file that must change):
${findings.map(x => `- ${x.where}: ${x.problem} -> ${x.fix}`).join('\n')}
Add or correct a test per finding. Run typecheck and the relevant tests (do not commit). Return JSON: ok, summary, files, issues.`, { label: `fix:${label}`, phase: 'Verify', schema: RESULT, model: 'sonnet' })

if (STAGE === 'verify') {
  phase('Verify')
  const scopes = [
    { label: 'fury', owns: 'src/engine/** except src/engine/factions/**, tests/engine/fury*.test.ts, tests/engine/core-m9*.test.ts', scope: `${FURY} vs src/engine (fury.ts, control phase, damage transfers, spirals, forcing, frenzy) and tests/engine/fury*.` },
    ...FACTIONS.map(f => ({ label: f.key, owns: `src/data/factions/${f.id}/**, src/data/lists/${f.id}-*.json, src/engine/factions/${f.key}.ts, tests/engine/${f.key}*.test.ts, tests/data/${f.key}*.test.ts`, scope: `${FSPEC(f)} vs src/data/factions/${f.id}/**, src/data/lists/${f.id}-*.json, src/engine/factions/${f.key}.ts and its tests.` })),
  ]
  const out = await pipeline(scopes,
    sc => verifyAgent(sc.label, sc.scope),
    (v, sc) => {
      if (!v || v.verdict === 'pass' || !v.failing.length) return { label: sc.label, verdict: v && v.verdict, fixed: null }
      // findings owned outside this scope's files go to the fury/core owner
      return fixAgent(sc.label, sc.owns + (sc.label === 'fury' ? '' : ' (and minimal edits elsewhere in src/engine if a finding names such a file; list them in issues)'), v.failing)
        .then(r => ({ label: sc.label, verdict: v.verdict, failing: v.failing.length, fixed: s(r) }))
    })
  const ship = await agent(`${COMMON}
Integrate the M9 verify fixes. You may edit any file under src/ and tests/ to make the suite green. ${commit('M9: rules verify fixes for fury and the four new factions', 'src tests docs')}
Also append every "RULING:" line from docs/spec/81-warlocks-fury.md and docs/spec/factions/{trollbloods,circle,cryx,menoth}.md "Needs rules check" sections to docs/needs-rules-check.md (dedupe) and include it in the commit.
Return JSON: ok, summary, files, issues.`, { label: 'verify-ship', phase: 'Verify', schema: RESULT, model: 'sonnet' })
  return { verify: out, ship: s(ship) }
}

// ---------------------------------------------------------------- CLIENT
const clientAgents = [
  () => agent(`${COMMON}
You own ONLY: the start screen and setup UI (src/client/ui/Start*.tsx or wherever the faction/scenario pick lives; find it from src/client/App.tsx), src/client/figures/{paintStore,glbPaint}.ts colour defaults, side colour plumbing in src/client/store/gameStore.ts and src/client/presentation/labels.ts, tests/client/start*.test.ts.
Owner decisions: any faction vs any faction (cyg, kha, trl, cir, cry, men; mirror matches allowed), army picker for both sides (player and opponent), each side takes its FACTION colours (faction.json palette.ui/primary) instead of fixed seat colours (seat A blue / seat B orange today); in a mirror match the second side uses a contrasting alternate palette (darken/hue-shift; never identical). URL params ?lists= keep working. The bot picks a random army by default with an option to choose. Faction names from faction.json (ours). Keep the IP footer line.
Run typecheck and tests. Return JSON: ok, summary, files, issues.`, { label: 'client:picker', phase: 'Client', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: new src/client/ui/fury/** components, src/client/ui/promptView.ts and src/client/ui/PromptForms.tsx (fury decision kinds), src/client/ui/ActivationPanel.tsx and activationView.ts (force buttons, animus), the stat card/grid card component (spiral view), src/client/presentation/director.ts + beats (fury events: leach, force, frenzy, transfer, spiral marks), tests/client/fury*.test.ts.
Read ${FURY} §C, §D, §G and docs/spec/50-client.md. Build the warlock UI: fury pips on warlocks and beasts (board labels + cards), leach/reave/upkeep forms in the control phase, forcing for boosts/extra attacks/power attacks/animi, transfer prompt with odds, a life spiral grid component (aspect colours, crippled aspects shown), frenzy beat and feed lines. Every number from query.* (the engine owns every displayed number). How to Play gets a short "Warlocks and fury" tab in our own words.
Run typecheck and tests. Return JSON: ok, summary, files, issues.`, { label: 'client:fury-ui', phase: 'Client', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: src/client/figures/{glbModels,profile,procedural*}.ts(x) and the procedural figure code, src/client/figures/Gallery.tsx, src/client/weaponFlavour.ts, src/client/vfx/** (new effect kinds only), tests/client/figures*.test.ts.
Every new model (trl, cir, cry, men data) needs a placeholder figure until the GLBs arrive tonight: extend the procedural figure so warbeasts read as beasts (hunched, big arms/claws, no boiler; Circle warpwolf/woldwarden variants by profile keywords), Cryx jacks as skeletal bone-jacks, Menoth jacks as tall robed crusader jacks, infantry/solos by base size and weapons, all painted in the faction palette. Keep glbModels.ts mapping profile id -> slug "wm-<slug>" for the new models (slug = model id slug; troopers map to their own slug) and fall back to procedural when the GLB file is missing (fetch HEAD or a manifest; no console errors). Map every new weapon id to a weapon flavour (add flavours such as claws, bite, chain-weapon, soul-cannon, flame, holy-fire, lightning, thorn/thresher as needed) and add VFX for any new flavour. Gallery shows all six factions.
Run typecheck and tests. Return JSON: ok, summary, files, issues.`, { label: 'client:figures', phase: 'Client', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: src/ai/** and tools/ai-bench.ts, tests/ai/**.
Read ${FURY} §F and docs/spec/40-ai.md. Teach the utility AI warlocks and fury: leach amount, reave, forcing (boosts, extra attacks, power attacks, animi), transfers, frenzy risk management, warlock safety (fury on beasts vs transfers), and any new faction mechanic decisions in docs/spec/factions/{trollbloods,circle,cryx,menoth}.md (corpse/soul tokens etc.). Normal tier must beat the random bot with each new faction: run npm run bench:ai with each new list vs cyg and kha, ≥10 games each, and report win rates. No stuck games (every game ends).
Run typecheck and tests. Return JSON: ok, summary (win rates), files, issues.`, { label: 'client:ai', phase: 'Client', schema: RESULT, model: 'sonnet' }),
]

if (STAGE === 'client') {
  phase('Client')
  const res = await parallel(clientAgents)
  const ship = await agent(`${COMMON}
Integrate the M9 client work. You may edit any file under src/, tests/, e2e and docs to make everything green. Add a Playwright spec tests/e2e/factions.spec.ts that, for each new faction, starts it vs a random other faction with control=bot,bot (or player vs bot), plays to round 2 with no page errors, and writes e2e-out/m9-<faction>.png; plus one screenshot of the army picker (e2e-out/m9-picker.png) and one of a warlock's fury UI (e2e-out/m9-fury.png). Update STATUS.md (new "Factions (M9)" section: what each faction has, fury support, picker, placeholders) and HANDOFF.md (current state + owner to-dos: verify stats in the app, see docs/needs-rules-check.md M9 rulings).
${commit('M9: army picker for six factions, faction colours, warlock UI, AI fury', 'src tests e2e STATUS.md HANDOFF.md docs')}
Return JSON: ok, summary, files (screenshots), issues.`, { label: 'client-ship', phase: 'Client', schema: RESULT, effort: 'high' })
  return { agents: res.map(s), ship: s(ship) }
}

// ---------------------------------------------------------------- CONCEPTS (Gemini via Claude in Chrome, one faction at a time; the browser is shared)
const conceptAgent = (f) => agent(`${COMMON}
You own ONLY: ${HY2}/refs/wm/gemini/wm-<slug>.png for ${f.name}'s models, ${HY2}/refs/wm/gemini/sheet-${f.key}.png, ${HY2}/refs/wm/${f.key}/** , and copies in C:/Users/antho/OneDrive/Documents/WarMForge/refs-local/${f.key}/** (outside the repo; file_upload only accepts files inside the session folder C:/Users/antho/OneDrive/Documents/WarMForge).
Task: for ${f.only ? "ONLY these slugs (redo; overwrite the old image, keep the old one as wm-<slug>.gundam.png): " + f.only.join(", ") + " of" : "every model and trooper of"} ${f.name} in docs/spec/factions/${f.key}.md, make ONE master-grade SD (MGSD) concept image of the REAL sculpt in Gemini (owner's Google account) through Claude in Chrome on this Windows PC. Owner approved this. First read: ${MALLET}/docs/HANDOFF-sd-figures-v2.md (Gemini recipe), and look at two existing results ${HY2}/refs/wm/gemini/wm-caine.png and wm-razor.png (match /refs/wm/gemini/sheet-cygnar.png: painted chibi miniatures with real faces; framing and white background like wm-caine.png), and ${HY2}/refs/wm/${f.key}/refs.json.
Browser: load the Chrome tools with ONE ToolSearch call: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__file_upload,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__get_page_text". Use the Windows browser (already selected). Work in a NEW tab at https://gemini.google.com/app; close it at the end.
SAFETY (hard rules): NEVER use the clipboard (no ctrl+v, no ClipboardItem). Attach the reference photo only via: click "Upload & tools"/"+", hover "Upload files" so hidden input[type=file] elements render, find them, then file_upload with a path inside C:/Users/antho/OneDrive/Documents/WarMForge/refs-local/${f.key}/ (copy refs there first). Before pressing Enter, read the prompt box and verify it contains only your prompt. Do not accept terms, change settings, or sign in; if Gemini is not signed in or asks for anything, stop and report ok=false.
Prompt per model (adapt): "Turn the miniature in this photo into a chibi / super-deformed PAINTED TABLETOP MINIATURE of the same character: only the PROPORTIONS change (noticeably oversized head about a third of total height, short compact torso, short sturdy legs, oversized hands and weapons). Keep the original sculpt's design language exactly: real organic faces and skin, cloth, leather, fur, bone and fantasy armour as sculpted. NOT a Gundam or mecha: no robot faces or visors, no V-fins, no panel lines, no mechanical joints or robot hands on living models. Same armour, weapons, pose and paint colours as the photo, painted like a hand-painted resin miniature. Single figure, full body, front three-quarter view, standing on nothing (no base), plain pure white background, no text." Warbeasts and warjacks: same, but keep their huge bulk and silhouette. Use a new chat per model so styles do not bleed. If a model has no usable reference photo (e.g. Circle's Tanith) or only a group shot, first try ≤3 web fetches for an official product photo (local refs are owner-approved downloads); else crop the group shot; else prompt Gemini from the refs.json description alone and note it in issues.
Download: Gemini's download button is unreliable; pull the image with in-page JS (canvas for blob: images, or fetch(src + '?alr=yes', {credentials:'include'}) for lh3 images, following text bodies that contain a URL until the blob type is image/*), then trigger a download per image (or one JSON bundle per tab) and move it from C:/Users/antho/Downloads to ${HY2}/refs/wm/gemini/wm-<slug>.png. Look at each result with the Read tool; regenerate once if it is not the right character, has multiple figures, has a base or a non-white background. Make a contact sheet sheet-${f.key}.png with Python (Pillow, ${HY2}/.venv/Scripts/python.exe).
Return JSON: ok, summary (slugs done), files, issues.`, { label: `concepts:${f.key}`, phase: 'Concepts', schema: RESULT, model: 'sonnet' })

if (STAGE === 'concepts') {
  phase('Concepts')
  const out = []
  const redo = (args && args.redo) || null
  for (const f of FACTIONS) { if (redo && !redo[f.key]) continue; out.push({ key: f.key, r: s(await conceptAgent(redo ? { ...f, only: redo[f.key] } : f)) }) }
  return out
}

// ---------------------------------------------------------------- AUDIO
const TOKEN = 'C:/Users/antho/OneDrive/Documents/WarMForge/Tokens.txt'
const CEIL = (args && args.creditCeiling) || 0
const AUDIO = `SECRET: the ElevenLabs key is in ${TOKEN} as "EL=<key>". Load it only as an env var inside the same shell command: ELEVENLABS_API_KEY="$(sed 's/^EL=//' '${TOKEN}' | tr -d '\\r\\n ')" npx tsx tools/gen-audio.ts ... — NEVER echo, log, write or commit it. CREDIT CEILING: the account's character_count (GET https://api.elevenlabs.io/v1/user/subscription) must never exceed ${CEIL}; check before each batch and stop if it would. Music costs ~12.5 credits per second and a 502 is still charged. Read STATUS.md Audio section, tools/audio-manifest.json, tools/gen-audio.ts. All prompts and narrator lines in our own words.`
if (STAGE === 'audio') {
  phase('Audio')
  if (!CEIL) return { error: 'pass args.creditCeiling' }
  const [sfx, music] = await parallel([
    () => agent(`${COMMON}
${AUDIO}
You own ONLY: tools/audio-manifest.json (new sfx/voice items), src/client/audio/manifest.ts (mirror), public/audio/** (new files), src/client/audio/trims.ts, src/client/audio/eventSounds.ts, tools/audio-src/**.
Add and generate SFX for the new factions and fury: warbeast footsteps/roars per faction (troll grunt, warpwolf howl, wold stone grind), claws/bite impacts, fury leach (hissing ember draw), forcing (beast snarl strain), frenzy (feral roar), damage transfer (magic whoosh-thud), Cryx: bone-jack clatter, necrotic/soul weapon shots, arc node; Menoth: holy fire/flame jets, choir hum spell, crusader hammer clang; each new weapon flavour in src/client/weaponFlavour.ts; trooper deaths per new faction. Narrator lines (same voice and model as the existing narrator) for each new faction name and each new leader on selection/turn start, "Frenzy!", "Fury transferred!", "Warlock down!". Measure and trim like the existing ones (RMS 0.15-0.18). Wire new events (fury events from src/engine/events.ts) to sounds in eventSounds.ts. Keep sounds.html complete.
Run typecheck and tests. Return JSON: ok, summary (items made, credits used), files, issues.`, { label: 'audio:sfx', phase: 'Audio', schema: RESULT, model: 'sonnet' }),
    () => agent(`${COMMON}
${AUDIO}
You own ONLY: public/audio/music/** (new tracks), tools/audio-manifest.json (music items only; the sfx agent also edits this file, so make one small, targeted edit at the very end and re-read before writing), public/audio/CREDITS.md.
Owner approved up to ~12k credits of music: one battle theme per new faction, ~60 s each, loopable, instrumental, no vocals, sitting under SFX. Direction (our words): Trollbloods — war drums, deep horns, tribal stomping, Celtic-tinged pipes; Circle Orboros — primal druidic strings, low choir-less drones, wooden percussion, wolf-howl-like brass; Cryx — dark industrial, detuned organ, clanking bones, sinister low synth pulses; Menoth — sacred martial, massive brass and timpani, monastic organ, march rhythm. First generate one track, measure the credit delta, then the rest only if under the ceiling. Measure loudness and set trims like the existing music. Ids music-faction-<key>.
Return JSON: ok, summary (tracks, credits per track), files, issues.`, { label: 'audio:music', phase: 'Audio', schema: RESULT, model: 'sonnet' }),
  ])
  const ship = await agent(`${COMMON}
Integrate the M9 audio. You may edit src/client/audio/**, tools/audio-manifest.json, public/audio/**, public/sounds.html. The music bus plays the faction theme of the human player's army in game (fallback to the existing battle loops), title theme unchanged. Verify headlessly that new clips load with no errors.
${commit('M9: faction SFX, narrator lines and four faction themes', 'tools/audio-manifest.json tools/audio-src public/audio public/sounds.html src/client/audio')}
Return JSON: ok, summary, files, issues.`, { label: 'audio-ship', phase: 'Audio', schema: RESULT, model: 'sonnet' })
  return { sfx: s(sfx), music: s(music), ship: s(ship) }
}

// ---------------------------------------------------------------- GPU (from 00:00; figures first, then terrain)
if (STAGE === 'gpu' || STAGE === 'gpu-figs' || STAGE === 'gpu-wire' || STAGE === 'gpu-terrain') {
  phase('GPU')
  const figs = (STAGE === 'gpu-wire' || STAGE === 'gpu-terrain') ? null : await agent(`${COMMON}
GPU work is owner-approved now. Only one GPU job at a time: if another process holds >4 GB VRAM, wait and re-check every few minutes; never kill other processes.
You own ONLY: ${HY2}/wm_units.json and ${HY2}/wm_picks.json (new entries), ${HY2}/outputs/wm-*/** for the new slugs, ${HY2}/run_wm9_*.sh, ${ROOT}/public/assets/models/wm-<new slugs>.glb, ${ROOT}/art/figure-sheets/m9-*.png (small contact sheets).
Read how the existing starter figures were built from the Gemini concepts: git -C ${ROOT} show --stat dcf82a3, ${HY2}/run_wm_pipeline.sh, ${HY2}/{stage_cutout,stage_paint,stage_finalize}.py and ${HY21}/stage_shape.py, docs/spec/30-figures.md, and STATUS.md "Figures". Use the same chain (cutout -> 2.1 shape -> paint -> finalize into ${ROOT}/public/assets/models, black round base, scaled in inches by base size) with the Gemini concepts ${HY2}/refs/wm/gemini/wm-<slug>.png as the input image for every new model and trooper of Trollbloods, Circle, Cryx and Menoth (slugs = the new concept files: wm-gunnbjorn, wm-bomber, wm-braylen, wm-highwaymen, wm-tanith, wm-pureblood, wm-lord-of-the-feast, wm-ravager-1/2/3, wm-nekane, wm-hades, wm-chatterbane, wm-furies-1/2/3, wm-feora, wm-crusader, wm-valeria, wm-pyrrhus, wm-defenders; write ${ROOT}/public/assets/models/m9-slugs.json mapping each slug to the faction-spec model id it depicts, read from docs/spec/factions/*.md and the concept agents' notes in ${HY2}/refs/wm/<faction>/refs.json). Do not commit; another stage wires and commits them. If a concept is missing, fall back to SDXL concepts_sdxl.py from the refs notes and say so. Each Bash call must stay under 10 minutes: run one slug per call in the FOREGROUND, looping.
Quality: after each GLB, render a preview (render_views.py) and LOOK at it with the Read tool; redo (new seed / cleaner cutout) up to 2 times if it is not the right character, is mush, lost its weapons, or floats off the base. Size: GLB ≤1.5 MB each (re-encode texture JPEG q85/1024 if larger).
Return JSON: ok, summary (slugs done/failed, minutes per figure), files, issues.`, { label: 'gpu:figures', phase: 'GPU', schema: RESULT, model: 'sonnet' })
  const wire = STAGE !== 'gpu-wire' && STAGE !== 'gpu' ? null : await agent(`${COMMON}
You own ONLY: src/client/figures/glbModels.ts and the figure manifest, tests/e2e/art.spec.ts or factions.spec.ts screenshot steps.
The 21 new figure GLBs are in public/assets/models with public/assets/models/m9-slugs.json (slug -> spec model id; Highwaymen and Defenders have one shared slug for all troopers; Ravagers map to the unit id but have three sculpts wm-ravager-1/2/3, assign one per trooper; Furies map to cry.furies-a/b/c). List every slug in public/assets/models/manifest.json so tests/client/figures-m9.test.ts passes. Contact sheets are in art/figure-sheets/m9-*.png. Also update STATUS.md (Factions (M9) section: figures are now GLBs) and HANDOFF.md (owner: veto figures; weakest are wm-hades, wm-nekane, wm-valeria, wm-pureblood; Tanith is not the real sculpt). Make sure every new profile maps to its GLB (procedural fallback still works for any missing), the gallery shows them, the painter hue bands match each faction's sourceHues (adjust sourceHues in src/data/factions/<id>/faction.json if the remap looks wrong). Run the art and factions e2e specs and look at the screenshots with the Read tool.
${commit('M9: MGSD figures for Trollbloods, Circle, Cryx and Menoth', 'public/assets/models src/client/figures src/data/factions tests art/figure-sheets STATUS.md')}
Return JSON: ok, summary, files (screenshots), issues.`, { label: 'gpu:wire', phase: 'GPU', schema: RESULT, model: 'sonnet' })
  const terrain = STAGE !== 'gpu-terrain' ? null : await agent(`${COMMON}
GPU work is owner-approved. You own ONLY: ${HY2}/outputs/wt-*/**, ${HY2}/terrain_*.py (adapt, don't break), ${ROOT}/tools/terrain-catalog.json (prompt edits), ${ROOT}/public/assets/terrain/*.glb, ${ROOT}/art/terrain-sheets/**, ${ROOT}/src/client/board/** (only for the pine base fix if it is a material/colour issue), docs/spec/70-terrain-boards.md notes.
Context: this is a separate task from the figure-concept redo (another workflow does that in Chrome; ignore it). The owner approved this exact terrain work in chat on 2026-10-06 ("Yes, after figures" to: dais/bone spikes/grove redo, decimate to ~6k tris, pine base fix), and pushing to main is pre-approved in CLAUDE.md. Other agents have uncommitted changes in src/engine, src/data and docs: never stage those; stage only your own paths listed below.
Owner-approved terrain tasks (from HANDOFF.md):
1. GPU redo of wt-wasteland-ritual-dais (reads as a sawn log slice; must read as a raised stone ritual platform with carved runes), wt-wasteland-bone-spikes (remove the bright orange tray under the spikes), wt-ruins-grove (pale unpainted trees; must be painted living trees on ruin flagstones). Use the terrain pipeline (terrain_batch.py --only <slug>, see tools/workflows/w8-terrain.js stage 'redo' for the recipe), strengthen prompts, look at each result's sheet with the Read tool, up to 3 attempts each.
2. Decimate every terrain GLB to about 6k triangles (keep silhouettes and textures; quadric decimation, e.g. with trimesh/pymeshlab or gltf-transform simplify) and re-check headless frame time on the overview camera (budget 21.5 ms; report before/after).
3. Village pine bases look too snowy on the green mat: fix (retexture/recolour the base region or regenerate wt-village-pines with "grassy earth base, no snow").
Re-make the contact sheets. ${commit('M8: terrain redo (dais, bone spikes, grove), decimation to ~6k tris, village pine bases', 'public/assets/terrain tools/terrain-catalog.json art/terrain-sheets src/client/board docs/spec/70-terrain-boards.md STATUS.md HANDOFF.md')}
Return JSON: ok, summary (frame time before/after), files, issues.`, { label: 'gpu:terrain', phase: 'GPU', schema: RESULT, model: 'sonnet' })
  return { figs: s(figs), wire: s(wire), terrain: s(terrain) }
}

return { error: `unknown stage ${STAGE}` }
