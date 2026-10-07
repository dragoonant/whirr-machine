// M4 AI + engine gap fixes. Workflow({ scriptPath: 'tools/workflows/w4-ai.js' })
export const meta = {
  name: 'w4-ai',
  description: 'Whirr Machine M4: fix preview odds and add slam/trample, then a real utility AI with tiers, benchmarked',
  phases: [
    { title: 'Engine', detail: 'attackPreview shot modes + charge boost, slam/trample options, decision titles' },
    { title: 'AI', detail: 'utility decider: activation order, moves, targets, focus knapsack, caster safety, assassination search' },
    { title: 'Ship', detail: 'bench vs random, sim invariants, commit, push' },
  ],
}

const ROOT = 'C:/Users/antho/OneDrive/Documents/WarMForge/whirr-machine'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }

const COMMON = `Project root: ${ROOT} (git repo, main). Windows; absolute paths, the cwd resets. Run long commands (tests, sim, bench) in the FOREGROUND. Orient from ${ROOT}/STATUS.md, then only the spec sections named. Another workflow (audio) is editing src/client/audio, tools/*audio*, public/audio, src/client/weaponFlavour.ts and a settings UI file concurrently: never touch those; stage commits by exact path, never git add -A. Engine contracts frozen (additive changes only, mirrored in docs/spec/00-architecture.md §14). MK3 must not leak in. Rules ambiguities: follow the spec, list in issues. Final output is raw JSON.`

phase('Engine')
const eng = await agent(`${COMMON}
You own src/engine/**, tests/engine/**, docs/spec/00-architecture.md §14, docs/needs-rules-check.md. Read docs/spec/10-rules-core.md sections on charge, power attacks (slam, trample), and attack types.
1. query.attackPreview: accept the attack type/shot mode (e.g. Spellstorm Cannon Blast/Beat Back/Decrepitation) and infer chargeAttack (auto-boosted damage on the first attack after a ≥3" charge) so the odds the UI shows are exact. Then update the client call sites that label odds "for a standard shot" (grep src/client/ui for it) to pass the mode and drop that caveat — this is the one client edit you may make.
2. Offer slam and trample as Normal Movement / power-attack options with full validation (SPD+3 straight line, focus cost, base-size limits, collateral, knockdown, failed-slam ends activation), wired through legalActions; tests PWR-* for both.
3. describe.decision(): a short human title per decision kind in our own words (the client uses it as a fallback).
4. Out-of-activation attacks other than Avenging Force: list any in the starter data that are still unwired and wire them.
npm run typecheck, npm test, npm run sim -- --games 30 --seed 3 (zero violations). Return JSON: ok, summary, files, issues.`, { label: 'engine-gaps', phase: 'Engine', schema: RESULT, effort: 'high' })

phase('AI')
const ai = await agent(`${COMMON}
You own src/ai/**, tools/ai-bench.ts, tests/ai/**, and src/client/bot/** (only to register tiers). Read docs/spec/40-ai.md fully and src/engine/index.ts exports (query.* helpers are the source of numbers).
Build the utility decider implementing the engine Decider interface:
- activation ordering (buffs/spells first, then shooters, then chargers, then scenario movers, caster last unless it has an assassination line);
- sampled move destinations scored by expected damage dealt/received (closed-form 2d6/3d6 via the engine's exact distribution helpers), scenario control/VP, threat maps, and terrain cover;
- target choice by expected damage × target value and kill probability; boost decisions by marginal kill-probability gain;
- focus allocation as a small knapsack; Power Field reserve;
- caster safety as a HARD constraint: keep the caster out of enemy charge/threat ranges where possible and keep reserve focus;
- each turn, search for its own assassination lines on the enemy caster and take them when probability is good;
- deployment that never fails in shallow zones (chain-deploy fallback);
- tiers: random (existing), easy (noise + no lookahead), normal (full). Must decide within ~300 ms per decision on this PC; if it would block the UI, provide a Web Worker wrapper.
Register easy/normal in the client bot driver so the start screen's bot strength selector picks them (default normal).
tools/ai-bench.ts ('npm run bench:ai -- --games N --seed S'): normal vs random and normal vs easy, both sides alternated; print win rates by cause and mean ms per decision.
Tests: tests/ai/*.test.ts (decider never returns an illegal action across 5 seeded games; assassination line found in a constructed position; caster-safety constraint holds in a constructed position).
Return JSON: ok, summary (≤80 words incl bench numbers), files, issues.`, { label: 'ai-decider', phase: 'AI', schema: RESULT, effort: 'high' })

phase('Ship')
const ship = await agent(`${COMMON}
Land M4. npm run typecheck, npm test, npm run sim -- --games 30 --seed 4, npm run bench:ai -- --games 20 --seed 1. Normal must beat random in ≥80% of games; if not, make targeted fixes in src/ai (max 2 rounds) and re-bench. Update STATUS.md (Engine + AI lines only) and HANDOFF.md (one line). Stage by exact paths (src/engine src/ai src/client/bot tests/engine tests/ai tools/ai-bench.ts docs/spec/00-architecture.md docs/needs-rules-check.md STATUS.md HANDOFF.md package.json plus any src/client/ui file the engine agent edited), commit "M4: utility AI, exact previews, slam and trample" + blank line + "${ATTR}", git pull --rebase, git push origin main, watch the Pages run.
Return JSON: ok, summary (≤80 words incl final bench), files, issues.`, { label: 'ai-ship', phase: 'Ship', schema: RESULT, effort: 'high' })

const s = r => r && { ok: r.ok, summary: r.summary, issues: r.issues.slice(0, 6) }
return { engine: s(eng), ai: s(ai), ship: s(ship) }
