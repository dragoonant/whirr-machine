// Engine to "full games run headless". Workflow({ scriptPath: 'tools/workflows/w1-engine.js', args: { lean: true } })
// Reconcile specs with the official PDFs -> build modules (disjoint files) -> rules phases -> integrate + sim + random bot.
export const meta = {
  name: 'w1-engine',
  description: 'Whirr Machine M1+M2: reconcile specs with PDFs, build geometry/LOS, dice/attack/grid, data, phases, integrate with headless sim',
  phases: [
    { title: 'Reconcile', detail: 'rulebook vs spec; Quick Start cards/scenario/worked turn vs data' },
    { title: 'Foundations', detail: 'geometry+LOS+terrain, dice+attack+damage+grid, data entry+validate' },
    { title: 'Rules', detail: 'turn/focus/conditions, movement+charge+power attacks, combat action+spells+scenario' },
    { title: 'Integrate', detail: 'fix suite, random bot, headless sim, golden replay, commit, push' },
  ],
}

const ROOT = 'C:/Users/antho/OneDrive/Documents/WarMForge/whirr-machine'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const LEAN = !(args && args.lean === false)
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }

const COMMON = `Project root: ${ROOT} (git repo, branch main, remote github.com/dragoonant/whirr-machine). Windows; use absolute paths, the cwd resets. Run long commands (npm test, typecheck, sim) in the FOREGROUND. Orient from ${ROOT}/STATUS.md, then only the spec sections your task names (docs/spec/). Official sources are PDFs in ${ROOT}/docs/sources/ (gitignored; never commit or quote them at length): WMH-MK4-Rulebook_Digital_144-OP_Abridged.pdf (core rules + timing appendix) and "WM-Quickstart Guide_JUL-2025.pdf" (starter cards, scenario, worked first turn). Fastest: extract text with /mingw64/bin/pdftotext into the session scratchpad and grep it; or read PDFs with the Read tool's pages parameter (≤20 pages per call): find the contents page first, then read only the pages you need. IP rule: mechanics 1:1 from Warmachine MK4; names may match; ALL prose our own words, never copy rules/card text. MK3 must not leak in (no facing/back arcs/free strikes/STR/templates/scatter; melee range 1"; run SPD+5"; unit move one trooper then place rest within 2"; power attack POW 12/14 by base). Engine contracts src/engine/{types,actions,events,hooks,rng,decider,index}.ts are frozen: if a change is unavoidable make it minimal, mirror it in docs/spec/00-architecture.md and note it in issues. Concurrent agents share this working tree: touch only files you own, never edit STATUS.md/package.json, never run git commit or npm install unless your task says so. Prefer 'npx vitest run <your tests>' over the full suite. Tests are named with checklist IDs from docs/spec/12-rules-test-checklist.md. Rules ambiguities never block: follow the spec and list them in issues. Final output is raw JSON for an orchestrator.`
const LEAN_NOTE = LEAN ? '\nLEAN MODE: the owner wants a playable prototype fast. Make it work in a real game, write ~10 focused tests for the main flows, do not chase checklist coverage.' : ''

// ---------- Reconcile
phase('Reconcile')
const recRules = null
const recData = await agent(`${COMMON}
Task: reconcile starter data and scenario with the Quick Start PDF (and the rulebook only if needed). You own ONLY: docs/spec/factions/cygnar.md, docs/spec/factions/khador.md, docs/spec/11-scenarios.md, and NEW file docs/spec/13-golden-first-turn.md.
0. M0 already corrected most QS stats; check what remains open (grep (app)/(unsourced) in these files) and focus there.
1. Every stat, weapon, ability, spell (COST/RNG/AOE/POW/DUR/OFF), feat, damage boxes and grid layout (columns + system letters) for the 8 starter models: take them from the Quick Start cards; set confidence=verified (QS p.N). Summarize ability text in our own words.
2. 11-scenarios.md: replace the placeholder scenario with the Quick Start scenario's exact layout (table size, deployment depths, terrain and element positions in inches, scoring) under an ORIGINAL scenario name; keep MK4 victory rules consistent with the book.
3. 13-golden-first-turn.md: transcribe the worked first turn as a machine-checkable script: deployment positions (inches, board centred at origin, y=forward axis documented), then each action in order with the dice values rolled and the expected results (hits, damage, boxes, focus). Where the QS omits a needed value, choose one and mark ASSUMED.
Return JSON: ok, summary (≤80 words), files, issues (list any RULING lines for docs/needs-rules-check.md, format "RULING: rule | what we did | why").`, { label: 'reconcile:quickstart', phase: 'Reconcile', schema: RESULT, effort: 'high' })
const commitAll = (msg, extra) => agent(`${COMMON}
Task: land this stage. ${extra || ''} Run 'npm run typecheck' and 'npm test' and 'npm run validate:data' (FOREGROUND); make minimal fixes if anything fails (never weaken a test without citing the spec in issues). Update STATUS.md (What exists / Spec status / Next). git add -A -- . ':(exclude)docs/sources' then confirm 'git status --short' shows no PDFs or *.token* files staged; commit "${msg}" + blank line + "${ATTR}" (retry if .git/index.lock); git push origin main (git pull --rebase first if rejected).
Return JSON: ok, summary (≤60 words), files, issues.`, { label: 'commit', schema: RESULT, model: 'sonnet' })
const dataRulings = recData ? recData.issues.filter(s => s.startsWith('RULING')) : []
const c0 = await commitAll('M1: reconcile specs with official rulebook and Quick Start', dataRulings.length ? `First append these lines to docs/needs-rules-check.md: ${JSON.stringify(dataRulings)}.` : '')

// ---------- Foundations
phase('Foundations')
const FOUND = [
  { key: 'geometry', model: 'sonnet', spec: '00-architecture.md (coordinates, measurement), 10-rules-core.md (LOS, DEF modifiers, movement geometry, terrain types, clouds)', own: 'src/engine/geometry.ts, src/engine/measure.ts, src/engine/los.ts, src/engine/terrain.ts, tests/engine/geometry*.test.ts, tests/engine/los*.test.ts', task: 'circle bases, base-edge distances, straight-line sweeps that stop at first contact with pass-through rules by base size, place-within-2" helper, rule of least disturbance, terrain prisms by rules type, cylinder-volume LOS with intervening-model/elevation/cloud/forest rules, and a LOS verdict object that explains WHY (for the UI LOS view), DEF-modifier calculation (concealment/cover/elevation/target-in-melee/knocked down).', ids: 'LOS-*, TERR-*' },
  { key: 'combat', model: 'sonnet', spec: '10-rules-core.md (dice, attack and damage timing sequence, damage tracks, war-engine grid, crippling, colossal, death windows, Tough)', own: 'src/engine/rng.ts (implementation only), src/engine/dice.ts, src/engine/attack.ts, src/engine/damage.ts, tests/engine/dice*.test.ts, tests/engine/attack*.test.ts, tests/engine/damage*.test.ts, tests/engine/grid*.test.ts', task: 'seeded RNG, 2d6/3d6 rolls with boost and rerolls, auto-hit/auto-miss/crit, stat modifier order, damage roll with resistance, single-row and grid damage (column roll, top-down fill, spill wrap 6->1, system crippling/uncrippling), the ONE disabled->boxed->destroyed mechanism with Tough, and exact closed-form hit/damage probability helpers the UI prompts and AI will use.', ids: 'DICE-*, ATK-*, DMG-*, GRID-*' },
  { key: 'data', model: 'sonnet', spec: '20-data-schema.md, factions/cygnar.md, factions/khador.md, 11-scenarios.md', own: 'src/data/** (except src/data/schema/), tools/validate-data.ts, tests/data/*.test.ts', task: 'enter all 8 starter models, their weapons, abilities (declarative, {code:hook} escape hatch names listed in issues), spells, feats, the two 30-point lists, the scenario and its terrain layout as JSON validated against src/data/schema; write tools/validate-data.ts (ajv) and a loadBundle() in src/data/index.ts returning the bundle the engine takes.', ids: '(data validity only)' },
]
const foundRes = await parallel(FOUND.map(m => () => agent(`${COMMON}
Read spec: ${m.spec}. Build: ${m.task}
You own ONLY: ${m.own}. Checklist IDs: ${m.ids}.${LEAN_NOTE}
Return JSON: ok, summary (≤80 words), files, issues.`, { label: `impl:${m.key}`, phase: 'Foundations', schema: RESULT, model: m.model })))
const c1 = await commitAll('M1: geometry, LOS, dice, attack, damage grid, starter data')

// ---------- Rules
phase('Rules')
const RULES = [
  { key: 'turn', spec: '10-rules-core.md (turn structure, Maintenance/Control/Activation, focus economy, conditions, continuous effects), 11-scenarios.md (setup, deployment, scoring, victory)', own: 'src/engine/phases/maintenance.ts, src/engine/phases/control.ts, src/engine/focus.ts, src/engine/effects.ts, src/engine/scenario.ts, src/engine/setup.ts, tests/engine/turn*.test.ts, tests/engine/focus*.test.ts, tests/engine/scenario*.test.ts', task: 'game setup (list selection, roll-off, deployment zones and placement validation incl. unit 3" rule, Advance Deployment), round/turn/phase machine, maintenance (focus removal, continuous effects), control (refill, power up, allocation decision, upkeep, shake), conditions (knocked down, stationary, disruption), scenario control exported from the engine, VP scoring, Kill Box, assassination, 7 rounds and tiebreakers.', ids: 'FOC-*, COND-*, SCN-*' },
  { key: 'movement', spec: '10-rules-core.md (movement, charge, unit placement, engaged/disengage, rough terrain, obstacles, power attacks, involuntary movement)', own: 'src/engine/movement.ts, src/engine/power-attacks.ts, tests/engine/move*.test.ts, tests/engine/charge*.test.ts, tests/engine/power*.test.ts', task: 'Normal Movement options (forfeit, aim, advance, run, charge) with war-engine focus costs, unit move-one-place-rest, engagement/disengage forfeits, rough terrain, obstacles/obstructions, charge attack boost, slam/throw/headbutt/trample with collateral, push, falling, table edge. Use geometry.ts and attack.ts (read, do not edit).', ids: 'MOVE-*, CHG-*, PWR-*' },
  { key: 'action', spec: '10-rules-core.md (Combat Action, melee, ranged, AOE, spray, combined attacks, spells, channelling, feats, Power Field, clouds), factions/*.md (abilities/spells/feats of the 8 starter models)', own: 'src/engine/phases/activation.ts, src/engine/spells.ts, src/engine/code-hooks.ts, src/engine/factions/cygnar.ts, src/engine/factions/khador.ts, tests/engine/action*.test.ts, tests/engine/spell*.test.ts, tests/engine/faction*.test.ts', task: 'activation flow (Normal Movement then Combat Action, spells any time outside moves/attacks), Combat Action choices, additional attacks for focus, Dual Attack, ranged ROF/AOE closest-N blast/spray line, combined attacks, boost/Power Field/reroll PendingDecisions, spells with upkeep and channelling, feats, every code hook the starter data references. Call movement.ts/attack.ts/damage.ts (read, do not edit).', ids: 'ATK-* (flow), AOE-*, SPR-*, SPL-*' },
]
const rulesRes = await parallel(RULES.map(m => () => agent(`${COMMON}
Read spec: ${m.spec}. Also read STATUS.md for what foundations exist (geometry/los/dice/attack/damage/data). Build: ${m.task}
You own ONLY: ${m.own}. Checklist IDs: ${m.ids}.${LEAN_NOTE}
Return JSON: ok, summary (≤80 words), files, issues.`, { label: `impl:${m.key}`, phase: 'Rules', schema: RESULT, model: 'sonnet' })))

// ---------- Integrate
phase('Integrate')
const integ = await agent(`${COMMON}
All engine modules now exist. You may edit ANY engine, data, test or tools file, STATUS.md, HANDOFF.md, package.json (npm install allowed).
1. Wire src/engine/index.ts: step(), legalActions() (never empty for an open decision; feasibility = some candidate passes full validation), save/load/replay, and the "numbers for the UI" helpers (hit/damage targets with odds, LOS verdicts, threat ranges, scenario control) the spec 50-client.md needs.
2. 'npm run typecheck' and 'npm test' green.
3. src/ai/random.ts: a random-legal Decider that prefers sensible actions (moves toward enemies/objectives, attacks when possible) so a human can play a whole game against it.
4. tools/sim.ts ('npm run sim -- --games N --seed S'): bot vs bot on the real starter lists and scenario; invariants after every step (no NaN, damage in range, focus caps, non-empty legalActions, phase order); per-game decision cap and stall detector; print wins/draws by cause (assassination/scenario/rounds), mean rounds, violations with seed+index.
5. tests/engine/golden.test.ts (GOLD-001): replay docs/spec/13-golden-first-turn.md with forced dice; it.skip with a reason only if a mechanic is genuinely missing (list it in issues).
6. 'npm run sim -- --games 50 --seed 1' must report zero violations and every game must end.
7. Update STATUS.md and HANDOFF.md (next: M3 playable client). git add -A -- . ':(exclude)docs/sources'; commit "M2: rules engine integrated, random bot, headless sim" + blank line + "${ATTR}"; git push origin main (pull --rebase if rejected). Confirm the Pages run passes (gh run watch on the latest run).
Return JSON: ok, summary (≤120 words incl. sim stats), files, issues.`, { label: 'integrate+sim', phase: 'Integrate', schema: RESULT, effort: 'high' })

const s = r => r && { ok: r.ok, summary: r.summary, issues: r.issues.slice(0, 8) }
return {
  reconcile: { rules: s(recRules), data: s(recData), commit: s(c0) },
  foundations: foundRes.map(s), commit1: s(c1),
  rules: rulesRes.map(s),
  integrate: s(integ),
}
