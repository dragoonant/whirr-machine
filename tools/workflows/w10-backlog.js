// M10+ backlog (owner, 2026-10-07): stats research for the M9 factions, Tanith redo, client and engine gaps,
// Skirmish 50pt, command cards, Steamroller scenarios, clock. Multiplayer and playtest fixes are on hold.
// Workflow({ scriptPath: 'tools/workflows/w10-backlog.js', args: { stage: 'research' | 'gaps' | 'skirmish-data' | 'concepts' | 'gpu' | 'cards-sr-clock' | 'docs' } })
export const meta = {
  name: 'w10-backlog',
  description: 'Whirr Machine M10+: web-sourced faction stats, Tanith redo, client/engine gaps, Skirmish 50pt, command cards, Steamroller, clock',
  phases: [
    { title: 'Research', detail: 'four faction stat audits from the web, Tanith refs, Skirmish + cards/SR/clock specs, notes fix, integrate' },
    { title: 'Gaps', detail: 'client painter/panels/drag movement, engine decision gaps, integrate' },
    { title: 'Skirmish data', detail: 'new model data per faction, 50pt lists, integrate' },
    { title: 'Concepts', detail: 'Gemini MGSD concepts of real sculpts (Tanith + new models)' },
    { title: 'GPU', detail: 'Hunyuan figures, wire, push' },
    { title: 'Cards SR clock', detail: 'command cards, Steamroller 2026 scenarios, chess clock, integrate' },
    { title: 'Docs', detail: 'STATUS, HANDOFF, PLAN final pass, push' },
  ],
}

const ROOT = 'C:/Users/antho/OneDrive/Documents/WarMForge/whirr-machine'
const HY2 = 'C:/Users/antho/Hunyuan3D-2'
const REFS = 'C:/Users/antho/OneDrive/Documents/WarMForge/refs-local'
const MEM = 'C:/Users/antho/.claude/projects/C--Users-antho-OneDrive-Documents-WarMForge/memory'
const SCRATCH = 'C:/Users/antho/AppData/Local/Temp/claude/C--Users-antho-OneDrive-Documents-WarMForge/98285fa4-70c9-4285-bf45-14691edbb08e/scratchpad'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const STAGE = (args && args.stage) || 'research'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const s = r => r && { ok: r.ok, summary: r.summary, files: (r.files || []).slice(0, 10), issues: (r.issues || []).slice(0, 12) }

const COMMON = `Project root: ${ROOT} (git repo, main, Pages https://dragoonant.github.io/whirr-machine/). Windows; use absolute paths, the cwd resets. Run long commands in the FOREGROUND. Orient from ${ROOT}/STATUS.md only, then the files named. IP rule (Mallet posture): real unit, weapon, ability and spell names and numeric stats are fine; ALL prose (ability text, lore, UI copy, docs) is in our own words, never copied card or rules text; never put SFG art, logos, icons, photos or community data files in the repo. Frozen contracts: src/engine/{types,actions,events,hooks,rng,decider,index}.ts: additive changes only, each needs a matching entry in docs/spec/00-architecture.md §14 and a line in your issues. MK3 guard: no facing, free strikes, STR or templates; melee range 1" (2" reach); run is SPD+5"; MK4 only. Rules ambiguities never block: decide, and add "RULING: <rule> | <what we did> | <why>" to docs/needs-rules-check.md. Concurrent agents share the tree: touch only files you own, never git commit or npm install unless told, never edit STATUS.md, HANDOFF.md, PLAN.md or package.json unless told. Rules PDFs: ${ROOT}/docs/sources/*.pdf (gitignored; extract with /mingw64/bin/pdftotext into ${SCRATCH}/pdf/ if not already there). Final output is raw JSON, ≤300 tokens.`

const RESEARCH = `RESEARCH STANDARD (owner, 2026-10-07): the official app being unreadable is NOT a reason to give up. Search the web hard before calling anything unverified, using WebSearch and WebFetch. Try: Steamforged's free MK4 PDFs (faction/army rules, card or theme-force PDFs, errata or balance updates on steamforged.com or warmachine.steamforged.com); community card databases and list builders (e.g. github isorna/wardice-warmachine-data raw JSON, BSData-style repos, MK4 list-builder sites); Reddit r/Warmachine and r/HordesGame; forum or blog card reviews, unboxings and battle reports that show cards; store listings. Prefer MK4 values from 2024-2026 and the newest errata. Cross-check any value from a single weak source. Downloading free PDFs into ${ROOT}/docs/sources/ is approved (they are gitignored). Never commit community data. Record every source URL you used.`

const FACTIONS = [
  { key: 'trollbloods', id: 'trl', name: 'Trollbloods', models: 'Captain Gunnbjorn, Dire Troll Bomber, Braylen (Braylen Wanderheart), Highwaymen' },
  { key: 'circle', id: 'cir', name: 'Circle Orboros', models: 'Tanith (the Feral Heart / whichever MK4 Tanith is in the starter), Pureblood Warpwolf, Lord of the Feast, Tharn Ravagers' },
  { key: 'cryx', id: 'cry', name: 'Cryx', models: 'Nekane, Hades, Chatterbane, The Furies' },
  { key: 'menoth', id: 'men', name: 'Protectorate of Menoth', models: 'Feora, Crusader, Valeria, Pyrrhus, Defenders' },
]

const factionAgent = f => agent(`${COMMON}
${RESEARCH}
Task: audit and correct every card value of the ${f.name} starter (${f.models}) against real MK4 sources.
You own ONLY: ${ROOT}/src/data/factions/${f.id}/** , ${ROOT}/src/data/lists/${f.id}-*.json , ${ROOT}/docs/spec/factions/${f.key}.md , a new ${ROOT}/docs/spec/factions/${f.key}-sources.md , and the "${f.name}" lines inside the "M9 factions" section of ${ROOT}/docs/needs-rules-check.md (edit only your faction's lines; other agents edit theirs at the same time, so make small, targeted edits).
Steps:
1. Read STATUS.md "Factions (M9)", docs/spec/factions/${f.key}.md, the ${f.name} lines in docs/needs-rules-check.md, and src/data/factions/${f.id}/** (data shape only).
2. Research first: which models are in the real MK4 ${f.name} starter box or army box (if our starter list is wrong, fix it), then each model's full card: base size, SPD/AAT/MAT/RAT/DEF/ARM/ARC/FURY/CTRL/CMD, damage boxes or spiral, focus/fury, every weapon (RNG/ROF/AOE/POW and qualities), abilities, spells (COST/RNG/AOE/POW/DUR/OFF), feat, unit size and point costs.
3. Correct the data to match. Rewrite any ability or spell text in our own words. In ${f.key}.md, change each value you verified from "U-cd" to a source tag (e.g. "S1") and list the sources in ${f.key}-sources.md as S1..Sn with URLs. Leave U-cd only on values that no source showed, and list them with the sources you tried.
4. Resolve or update the ${f.name} RULINGs in needs-rules-check.md (starter choice, unit size, base sizes, spiral aspects, copied profiles).
5. Run: cd ${ROOT} && npm run validate:data && npx vitest run tests/data tests/engine --reporter=dot. Fix any failures your data changes cause (data and your spec files only; if engine code must change, list it in issues instead).
Return RESULT: summary = what changed (counts of values verified, corrected, still U-cd, starter changes); issues = remaining U-cd values and any needed engine change.`, { label: `research:${f.id}`, phase: 'Research', schema: RESULT, effort: 'high' })

const tanithRefs = () => agent(`${COMMON}
${RESEARCH}
Task: find good reference images of the REAL Tanith sculpt that is in our Circle Orboros starter (check ${ROOT}/src/data/factions/cir/models/tanith.json and ${ROOT}/docs/spec/factions/circle.md for which Tanith). Sources: Steamforged store or product pages, the Warmachine site, retailer listings, painting blogs and galleries (CoolMiniOrNot, Reddit r/Warmachine and r/minipainting), YouTube unboxing thumbnails. Also check whether our current figure ${ROOT}/public/assets/models/wm-tanith.glb (look at the contact sheet in ${ROOT}/art/figure-sheets/ if one exists) matches.
You own ONLY: ${REFS}/tanith/ (new; save 4-8 clear images there: front, side, back if available, at least one painted and one bare grey, no watermarks if avoidable) and ${REFS}/tanith/SOURCES.md (URL per image and a short description of the sculpt: pose, weapons, armour, hair, animal parts, base). These files are local references only, OUTSIDE the repo; never copy them into the repo.
Use WebFetch or curl to download image files (free public images; this is approved). Return RESULT with files = saved paths, summary = sculpt description in ≤60 words.`, { label: 'refs:tanith', phase: 'Research', schema: RESULT })

const skirmishSpec = () => agent(`${COMMON}
${RESEARCH}
Task: plan the Skirmish (50-point) game size. Owner decision: each of our six factions (Cygnar, Khador, Trollbloods, Circle Orboros, Cryx, Protectorate of Menoth) gets ONE 50-point list = its current starter (src/data/lists/*-recon.json) plus popular add-ons. Research what MK4 players actually take with that caster/warlock: tournament results and lists on Longshanks, Reddit, blogs and battle reports from 2025-2026, and the Steamroller 2026 rules in docs/sources for the game-size rules (points, table size, deployment, rounds, army composition limits such as theme forces, character restrictions, the Skirmish/Recon size table).
You own ONLY: ${ROOT}/docs/spec/90-skirmish.md (new) and ${ROOT}/docs/spec/90-skirmish-sources.md (new).
Write 90-skirmish.md with:
A. Game-size rules for 50pt from the rulebook/Steamroller (table, deployment depth, round limit, any list rules), mapped to our scenario system (read docs/spec/11-scenarios.md, src/data/scenarios/** and the battlefields in docs/spec/70-terrain-boards.md, which already support 48x48). State exactly which engine/data/client files change.
B. Per faction: the 50pt list (each model with points and why it is popular, with source refs), marking which models already exist in src/data and which are new. Aim for 3-6 new models per faction, at most ~30 new models in total across all six. Prefer models with plastic or currently available kits.
C. Per new model: what card data must be researched (all of it), base size, and a one-line sculpt description for the figure pipeline (pose, weapons). Name the figure slug wm-<slug>.
D. Work packages with disjoint file ownership: one data agent per faction (its src/data/factions/<id>/** and new list file src/data/lists/<id>-skirmish.json), one engine/scenario agent, one client agent (start screen game-size select; ?size=skirmish), one AI agent if anything changes.
Return RESULT; summary includes the count of new models per faction.`, { label: 'spec:skirmish', phase: 'Research', schema: RESULT, effort: 'high' })

const cardsSpec = () => agent(`${COMMON}
Task: spec command cards, the Steamroller 2026 scenarios and a game clock. Sources: docs/sources/WM-Steamroller-2026-JanuaryRules.pdf (and the printer-friendly version and TalesFromTheFrontlines), the MK4 rulebook PDF (command cards, game sizes). Search the web for the MK4 command-card list if the PDFs lack it (WebSearch/WebFetch; record URLs).
You own ONLY: ${ROOT}/docs/spec/91-cards-steamroller-clock.md (new) and an appended block of new test IDs (CARD-, SR-, CLK-) in ${ROOT}/docs/spec/12-rules-test-checklist.md.
Write 91-cards-steamroller-clock.md:
A. Command cards: every MK4 command card a player may take (names, timing window, cost, effect summarised in OUR words, with the exact mechanical effect), how many per game size, how they are chosen, and how each maps to our engine windows (read docs/spec/00-architecture.md §5-§7 and src/engine/hooks.ts for windows). Mark cards needing new windows or decisions.
B. Steamroller 2026 scenarios: each scenario's zones, flags, objectives, scoring, deployment and setup, as data that fits src/data/scenarios/** and docs/spec/11-scenarios.md (read both). Note anything the scenario engine cannot express today.
C. Clock: Steamroller timed turns or deathclock rules (per-player time pools, extensions, what happens when the clock runs out, and how the bot is treated), plus a client UX (top-bar clock, pause on menus, off by default, options).
D. Additive contract changes per frozen file, and work packages with disjoint file ownership (engine cards; scenario data; clock; client UI; AI use of cards).
Return RESULT.`, { label: 'spec:cards-sr-clock', phase: 'Research', schema: RESULT, effort: 'high' })

const notesFix = () => agent(`${COMMON}
Task: fix the stale project notes. You own ONLY: ${ROOT}/PLAN.md, ${ROOT}/HANDOFF.md, ${ROOT}/STATUS.md (you are told to edit these).
Facts (verify with git log --oneline -30 and the files):
- Milestones as built: M0-M7 as in PLAN.md; M8 = five themed battlefields with generated terrain (commits "M8: ..."); M9 = warlocks and fury plus Trollbloods, Circle, Cryx and Menoth, army picker, figures, faction audio, plus late polish (deployment clamp, hover tips, Feats tab, Prey prompt, ambient animation and ?fps).
- New plan from M10: M10 web-sourced stats for the M9 factions and the Tanith figure redo; M11 client and engine gaps (in-game army painter, slimmer side panels at 1280 wide, drag and multi-waypoint movement; reroll, rollAnyway, chooseGrid, combinedAttack, channel decisions, out-of-activation attacks, additional attacks listed as options); M12 Skirmish 50pt (starter plus popular add-ons per faction); M13 command cards, Steamroller 2026 scenarios, game clock; Later: multiplayer (on hold by the owner 2026-10-07) and owner playtest fixes (deferred).
- PLAN.md: rewrite the milestone table to this; add the 2026-10-07 owner decisions to Decisions (terrain, figures and audio accepted; Tanith must be the real sculpt; research stats on the web, not only the app; multiplayer on hold).
- HANDOFF.md: remove the stale claim that wt-wasteland-ritual-dais, wt-wasteland-bone-spikes and wt-ruins-grove still need a GPU redo and decimation (commit 8ee9ef5 redid them and decimated to ~6k tris; check git show --stat 8ee9ef5); replace the "M5 figures" paragraph that says eight figures with the per-model/per-trooper MGSD set; drop the "Engine requests from M3" item (done in M4); set Next to: M10 in progress overnight.
- STATUS.md: remove the client Known-gaps bullet saying query.attackPreview has no attackType (it was closed in M4); update "Figures and VFX (M5)" to the current figure count (count public/assets/models/*.glb); update the Battlefields frame/triangle notes to the decimated pieces if 8ee9ef5 changed them; set the Next line to match HANDOFF.
Keep the existing style: short plain sentences. Do not commit. Return RESULT.`, { label: 'notes', phase: 'Research', schema: RESULT, model: 'sonnet' })

const integrate = (what) => agent(`${COMMON}
You are the integrator for: ${what}. You may edit any file needed to make the tree green, but keep changes minimal and report them.
1. cd ${ROOT} && git status --short.
2. npm run typecheck && npm test && npm run validate:data && npm run sim -- --games 20 --seed 7. Fix failures (prefer fixing data/tests touched this stage; if an engine fix is needed, make it small).
3. npm run build. If any client file changed this stage, run the relevant e2e spec (PW_PORT=4183 npx playwright test <spec>) and note the result.
4. Stage files by exact path (never git add -A; never stage tools/out, e2e-out, test-results, .claude/), commit with message "${what.split('|')[0].trim()}" then a blank line then "${ATTR}", and git push origin main.
Return RESULT with summary = test counts, sim result, commit hash.`, { label: 'integrate', schema: RESULT, model: 'sonnet' })

if (STAGE === 'research') {
  phase('Research')
  const r = await parallel([
    ...FACTIONS.map(f => () => factionAgent(f)),
    () => tanithRefs(),
    () => skirmishSpec(),
    () => cardsSpec(),
    () => notesFix(),
  ])
  const labels = [...FACTIONS.map(f => f.id), 'tanith', 'skirmish', 'cards', 'notes']
  const out = {}
  r.forEach((x, i) => { out[labels[i]] = s(x) })
  out.integrate = s(await integrate('M10: web-sourced card values for Trollbloods, Circle, Cryx and Menoth; Skirmish, command card, Steamroller and clock specs; notes brought up to date | research stage'))
  return out
}

if (STAGE === 'gaps') {
  phase('Gaps')
  const engineGaps = () => agent(`${COMMON}
Task: close the engine Known gaps in STATUS.md, so these decisions work end to end with any content that triggers them: reroll, rollAnyway, chooseGrid, combinedAttack, channel; out-of-activation attacks beyond Avenging Force (a generic attack-out-of-activation path, e.g. Reciprocate-style triggers); and additional attacks listed as options in legalActions while initial attacks remain (when the rules allow buying them).
You own ONLY: ${ROOT}/src/engine/** (frozen contracts additive only, with §14 notes in docs/spec/00-architecture.md), ${ROOT}/src/ai/** (the bot must answer every new decision sensibly), ${ROOT}/tests/engine/** and ${ROOT}/tests/ai/**, and new test fixtures under ${ROOT}/tests/fixtures/** (synthetic test-only profiles that trigger each decision; do NOT add abilities to the real faction data).
Read docs/spec/10-rules-core.md and docs/spec/81-warlocks-fury.md for the rules of each item (and the MK4 rulebook text in docs/sources), and docs/spec/12-rules-test-checklist.md for test IDs. For each decision, name tests by checklist ID. legalActions must stay non-empty for every open decision.
Run npm run typecheck && npx vitest run tests/engine tests/ai --reporter=dot && npm run sim -- --games 20 --seed 3. Return RESULT; issues = any client prompt the UI now needs (decision kind and the fields it shows).`, { label: 'engine:gaps', phase: 'Gaps', schema: RESULT, model: 'sonnet', effort: 'high' })

  const clientUx = () => agent(`${COMMON}
Task: three client improvements.
1. In-game army painter: a "Paint" control (top bar or settings popover) that opens the existing painter presets and colour pickers (src/client/figures/glbPaint.ts, paintStore.ts; today only on ?gallery) for the human's faction and the opponent's, applied live to the figures on the table and persisted.
2. Slimmer side panels at 1280x760: the left activation panel and the right panels must cover far less of the board. Make them collapsible (remember the state), narrower, and remove the stats that repeat the grid card. The board should be clearly visible in the middle at 1280 wide.
3. Movement: drag to move (press on the selected model, drag, release to place, showing the ghost, path and legality the existing click mode shows) and multi-waypoint paths (each click adds a waypoint until Confirm or double-click; Backspace removes the last one; the ring and distance left update). Keep the existing click-to-place working. Use the engine's move check (query.*) for legality; the engine owns every number.
You own ONLY: ${ROOT}/src/client/** except src/client/ui/PromptForms.tsx and src/client/ui/promptView.ts (another agent may add prompts there), plus ${ROOT}/tests/client/** and a new ${ROOT}/tests/e2e/m11.spec.ts.
Read STATUS.md, HANDOFF.md "Client map", docs/spec/50-client.md (skim). Add focused unit tests; the e2e spec plays Khador vs the Normal bot, opens the painter, collapses the panels, drags a model and makes a two-waypoint move, with screenshots in e2e-out/m11-*.png at 1280x760. Run npm run typecheck && npx vitest run tests/client --reporter=dot && npm run build && PW_PORT=4183 npx playwright test tests/e2e/m11.spec.ts. Return RESULT.`, { label: 'client:ux', phase: 'Gaps', schema: RESULT, model: 'sonnet', effort: 'high' })

  const [e, c] = await parallel([engineGaps, clientUx])
  let prompts = null
  if (e && (e.issues || []).some(i => /prompt|decision|UI/i.test(i))) {
    prompts = await agent(`${COMMON}
Task: add client prompts for the new engine decisions. The engine agent reported: ${JSON.stringify((e.issues || []).slice(0, 12))}.
You own ONLY: ${ROOT}/src/client/ui/PromptForms.tsx, ${ROOT}/src/client/ui/promptView.ts, and new files under ${ROOT}/src/client/ui/prompts/**, plus ${ROOT}/tests/client/prompts*.test.ts.
Each decision gets a clear dock prompt in our own words with the engine's numbers (odds where query.* gives them), sensible defaults, and a How to Play note only if a tab already covers the topic. Run npm run typecheck && npx vitest run tests/client --reporter=dot. Return RESULT.`, { label: 'client:prompts', phase: 'Gaps', schema: RESULT, model: 'sonnet' })
  }
  // Faction ability engine work found by the M10 research (card data changed; behaviour must follow).
  const FENG = [
    { id: 'men', key: 'menoth', todo: 'menoth.ts still hooks the old guessed kit: remove stale hooks (fireStep, hexHammer, incite, battlePlan if no data uses them); blessingOfTheFirstGift must not roll POW 12 damage; key the free cast on men.a.illumination, once per turn. Build behaviour for every ability, weapon quality and spell in the new data: Four Gifts, Sanctified Hull, Marshal, Heavy Boiler, Gladiator, Thresher, Shield Guard, Heroic Inspiration, Holy Martyrs, Cleansing Volley, AP arrow POW 8, Featherweight double shot, Debilitating Heat, Lawgiver\'s Judgement, Teleport, Conflagration fire damage type.' },
    { id: 'cir', key: 'circle', todo: 'Admonition must allow any model in Tanith\'s battlegroup including Tanith (add a battlegroup target scope); Affliction must also allow the unit-target form. Check every other Circle ability or spell in the data has behaviour.' },
    { id: 'cry', key: 'cryx', todo: 'Marionette (enemy must reroll) now uses the new reroll decision; Soul Phase may be used any time during the activation, not only at its start; spell racking (MK4 rulebook) if the data needs it (RULING if the rack slot count has no source). Check every other Cryx ability or spell in the data has behaviour.' },
    { id: 'trl', key: 'trollbloods', todo: 'Highwaymen are now 5 grunts on 40 mm bases: fix src/engine/ambush.ts suggestAmbush placement (finer grid or smarter packing) so a 5-model unit can arrive inside the 3" edge strip with unit coherency, and restore CORE-040 to place all of them; remove the related RULING if fixed. Check every other Trollbloods ability or spell in the data has behaviour.' },
  ]
  const fac = await parallel(FENG.map(f => () => agent(`${COMMON}
Task (after the M10 card research, which changed ${f.key} data): make ${f.key} rules behave as the card data now says. ${f.todo}
Read docs/spec/factions/${f.key}.md (the source-tagged card values), src/data/factions/${f.id}/**, src/engine/code-hooks.ts and the existing faction hook file under src/engine/factions/.
You own ONLY: ${ROOT}/src/engine/factions/${f.id === 'men' ? 'menoth' : f.key}* (and a new file of the same prefix if needed)${f.id === 'trl' ? `, ${ROOT}/src/engine/ambush.ts` : ''}, ${ROOT}/tests/engine/${f.key}*.test.ts${f.id === 'trl' ? `, ${ROOT}/tests/engine/core-m9.test.ts` : ''}, and only the ${f.key} RULING lines in docs/needs-rules-check.md. If a change is needed in a shared engine file (code-hooks.ts, spells.ts, attack.ts ...), make the smallest additive change and list it in issues (other faction agents run at the same time; keep shared edits tiny and additive).
Name tests by checklist ID where one exists. Run npm run typecheck && npx vitest run tests/engine --reporter=dot && npm run sim -- --games 10 --seed 5 --json | tail -5. Return RESULT; issues = anything still unbuilt.`, { label: `engine:${f.id}`, phase: 'Gaps', schema: RESULT, model: 'sonnet', effort: 'high' })))

  const i = await integrate(`M11: in-game painter, slimmer panels, drag and waypoint movement; reroll, grid choice, combined attacks, channel, out-of-activation and additional attacks; faction abilities match the sourced cards | gaps stage. ALSO, before testing: copy the RULING lines listed in docs/spec/90-skirmish.md §A.2 and docs/spec/91-cards-steamroller-clock.md §B.6 into docs/needs-rules-check.md under new "M12 Skirmish" and "M13 cards, Steamroller, clock" sections (skip duplicates)`)
  return { engine: s(e), client: s(c), prompts: s(prompts), factions: fac.map(s), integrate: s(i) }
}

const SK = [
  { key: 'cygnar', id: 'cyg' }, { key: 'khador', id: 'kha' }, { key: 'trollbloods', id: 'trl' },
  { key: 'circle', id: 'cir' }, { key: 'cryx', id: 'cry' }, { key: 'menoth', id: 'men' },
]

if (STAGE === 'concepts') {
  phase('Concepts')
  const refs = await parallel(SK.map(f => () => agent(`${COMMON}
${RESEARCH}
Task: collect reference photos of the REAL sculpts of the NEW ${f.key} Skirmish models listed in ${ROOT}/docs/spec/90-skirmish.md §B/§C (figure slugs wm-<slug>; read the one-line sculpt notes there).
You own ONLY: ${REFS}/${f.key}-sk/<slug>/ (new; 2-5 clear images per slug: official product or studio shots first, then painted examples; front and three-quarter views) and ${REFS}/${f.key}-sk/<slug>/SOURCES.md (URLs plus a 40-word description of the sculpt: pose, weapons, armour, colours, mount). Local references only, OUTSIDE the repo. Downloading free public images is approved (curl/WebFetch). Note any slug with no usable photo.
Return RESULT with files = the slug folders, issues = slugs with weak refs.`, { label: `refs:${f.id}`, phase: 'Concepts', schema: RESULT, model: 'sonnet' })))

  const gemini = (label, what, refDirs) => agent(`${COMMON}
You own ONLY: ${HY2}/refs/wm/gemini/wm-<slug>.png for these slugs, ${HY2}/refs/wm/gemini/sheet-${label}.png, and copies under ${REFS}/ (outside the repo).
Task: ${what}. For each slug make ONE master-grade SD (MGSD) concept image of the REAL sculpt in Gemini (owner's Google account) through Claude in Chrome on this Windows PC. The owner approved this on 2026-10-07. Reference photos: ${refDirs}. First look at two existing results ${HY2}/refs/wm/gemini/wm-caine.png and wm-razor.png and match their style (painted chibi miniatures with real faces, framing, white background).
Browser: load the Chrome tools with ONE ToolSearch call: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__file_upload,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__tabs_close_mcp". Work in a NEW tab at https://gemini.google.com/app; close it at the end.
SAFETY (hard rules, see ${MEM}/gemini-clipboard-guard.md): NEVER use the clipboard (no ctrl+v, no ClipboardItem). Attach the reference photo only via: click "Upload & tools"/"+", hover "Upload files" so the hidden input[type=file] elements render, find them, then file_upload with a path inside C:/Users/antho/OneDrive/Documents/WarMForge/refs-local/. Before pressing Enter, read the prompt box and verify it contains only your prompt. Do not accept terms, change settings or sign in; if Gemini is not signed in or asks for anything, stop and report ok=false.
Prompt per model (adapt): "Turn the miniature in this photo into a chibi / super-deformed PAINTED TABLETOP MINIATURE of the same character: only the PROPORTIONS change (noticeably oversized head about a third of total height, short compact torso, short sturdy legs, oversized hands and weapons). Keep the original sculpt's design language exactly: real organic faces and skin, cloth, leather, fur, bone and fantasy armour as sculpted. NOT a Gundam or mecha: no robot faces or visors, no V-fins, no panel lines, no mechanical joints or robot hands on living models. Same armour, weapons, pose and paint colours as the photo, painted like a hand-painted resin miniature. Single figure, full body, front three-quarter view, standing on nothing (no base), plain pure white background, no text." Warjacks and warbeasts: the same, but keep their huge bulk and silhouette. Cavalry: keep the mount. Use a new chat per model so styles don't bleed.
Download: Gemini's download button is unreliable. Pull the image with in-page JS (a canvas for blob: images, or fetch(src + '?alr=yes', {credentials:'include'}) for lh3 images), trigger a download, and move it from C:/Users/antho/Downloads to ${HY2}/refs/wm/gemini/wm-<slug>.png. Look at each result with the Read tool. Regenerate up to twice if it is the wrong character, shows more than one figure, has a base, has a background that isn't white, or (for Tanith) misses the hood, braid, patchwork cape or hooked staff. Make a contact sheet sheet-${label}.png with Pillow (${HY2}/.venv/Scripts/python.exe).
Return RESULT: summary (slugs done), files, issues.`, { label: `gemini:${label}`, phase: 'Concepts', schema: RESULT, model: 'sonnet' })

  const out = { refs: refs.map(s) }
  out.tanith = s(await gemini('tanith', 'Redo Tanith (slug tanith; the current concept is wrong: an antlered druid). Keep the old image as wm-tanith.old.png. The real sculpt is described in ' + REFS + '/tanith/SOURCES.md: a lunging hooded woman with a long blonde braid, a fang necklace, a green cowl, knotwork leather and plate with long greaves, a fur mantle, a huge stitched patchwork cape spread like wings, and a long staff with a clawed hook head. Use refs 01, 03 and 07 first', `${REFS}/tanith/`))
  out.sk = []
  for (const f of SK) out.sk.push(s(await gemini(`sk-${f.id}`, `every NEW ${f.key} Skirmish slug listed in ${ROOT}/docs/spec/90-skirmish.md §C`, `${REFS}/${f.key}-sk/<slug>/`)))
  return out
}

const wp = (spec, id, extra, opts) => agent(`${COMMON}
${RESEARCH}
Task: build work package ${id} of ${ROOT}/docs/spec/${spec} (read the whole spec once, then §D's row for ${id}: you own ONLY the files in its "Owns" column, plus RULING lines in docs/needs-rules-check.md under your milestone's section). ${extra || ''}
Card data you enter must come from real MK4 sources (the spec's source list first; search the web for anything missing; tag each value with its source in the faction doc). Ability and spell text in our own words. Name tests by checklist ID from docs/spec/12-rules-test-checklist.md. Before returning, run npm run typecheck and the tests in the files you own (npx vitest run <paths> --reporter=dot) and fix what you broke. Return RESULT; issues = anything another package must do, and anything unbuilt.`, { label: id, schema: RESULT, model: 'sonnet', effort: 'high', ...(opts || {}) })

if (STAGE === 'skirmish-data') {
  phase('Skirmish data')
  const SPEC = '90-skirmish.md'
  const first = await parallel([
    ...SK.map(f => () => wp(SPEC, `WP-D-${f.id}`, 'Do not use a worktree; other data agents own the other factions in the same tree.', { phase: 'Skirmish data' })),
    () => wp(SPEC, 'WP-ENG', '', { phase: 'Skirmish data' }),
  ])
  const core = await wp(SPEC, 'WP-CORE', `The data agents reported: ${JSON.stringify(first.slice(0, 6).map(r => r && (r.issues || []).slice(0, 6)))}`, { phase: 'Skirmish data' })
  const last = await parallel([
    () => wp(SPEC, 'WP-CLI', '', { phase: 'Skirmish data' }),
    () => wp(SPEC, 'WP-AI', `WP-CORE reported: ${JSON.stringify(core && (core.issues || []).slice(0, 8))}`, { phase: 'Skirmish data' }),
  ])
  const i = await integrate('M12: Skirmish at 50 points: six lists of starter plus popular add-ons, Copperline Crossing on 48 inches, cavalry and other shared rules | skirmish stage. Also run npm run sim -- --size skirmish --games 30 --seed 1 and PW_PORT=4183 npx playwright test tests/e2e/skirmish.spec.ts; look at e2e-out/skirmish-*.png with the Read tool')
  return { first: first.map(s), core: s(core), last: last.map(s), integrate: s(i) }
}

if (STAGE === 'cards-sr-clock') {
  phase('Cards SR clock')
  const SPEC = '91-cards-steamroller-clock.md'
  const P = { phase: 'Cards SR clock' }
  const w1 = await wp(SPEC, 'WP1', 'Land every D.1 contract change first, with the §14 rows; typecheck must be green before you return.', P)
  const mid = await parallel(['WP2', 'WP3', 'WP4', 'WP7'].map(id => () => wp(SPEC, id, `WP1 reported: ${JSON.stringify(w1 && (w1.issues || []).slice(0, 6))}`, P)))
  const late = await parallel(['WP5', 'WP6'].map(id => () => wp(SPEC, id, `Earlier packages reported: ${JSON.stringify(mid.map(r => r && (r.issues || []).slice(0, 4)))}. ${id === 'WP5' ? 'Also write tests/e2e/steamroller.spec.ts: Cygnar vs the Normal bot on two SR26 scenarios with cards On and the clock On, to round 2, playing one card through the UI; screenshots e2e-out/sr-*.png at 1280x760.' : ''}`, P)))
  const i = await integrate('M13: command cards, Steamroller 2026 scenarios and the game clock | cards stage. Also run PW_PORT=4183 npx playwright test tests/e2e/steamroller.spec.ts and look at e2e-out/sr-*.png with the Read tool')
  return { wp1: s(w1), mid: mid.map(s), late: late.map(s), integrate: s(i) }
}

if (STAGE === 'gpu' || STAGE === 'gpu-figs' || STAGE === 'gpu-wire') {
  phase('GPU')
  const figs = STAGE === 'gpu-wire' ? (args.figs || null) : await agent(`${COMMON}
GPU work is owner-approved (2026-10-07). Only one GPU job at a time: if another process holds >4 GB VRAM, wait and re-check every few minutes; never kill other processes.
You own ONLY: ${HY2}/wm_units.json and ${HY2}/wm_picks.json (new entries), ${HY2}/outputs/wm-*/** for these slugs, ${HY2}/run_wm10_*.sh, ${ROOT}/public/assets/models/wm-<slug>.glb for these slugs, ${ROOT}/art/figure-sheets/m10-*.png.
Slugs: tanith (REDO; keep the old GLB as ${HY2}/outputs/wm-tanith/old.glb) and every Skirmish slug in ${ROOT}/docs/spec/90-skirmish.md §C that has a concept at ${HY2}/refs/wm/gemini/wm-<slug>.png.
Use the same chain as the earlier figures: read git -C ${ROOT} show --stat dcf82a3, ${HY2}/run_wm_pipeline.sh and the latest ${HY2}/run_wm9_*.sh, docs/spec/30-figures.md (cutout -> 2.1 shape -> paint -> finalize into public/assets/models, black round base, scaled in inches by base size; cavalry on 50 mm, check the spec). Each Bash call must stay under 10 minutes: run one slug per call in the FOREGROUND, in a loop.
Quality: after each GLB, render a preview (render_views.py) and LOOK at it with the Read tool. Redo it (new seed or cleaner cutout) up to twice if it's the wrong character, a blob, missing its weapons, or floating off the base. Tanith must show the hood, braid, patchwork cape and hooked staff. Keep each GLB ≤1.5 MB.
Do not commit. Return RESULT: summary (slugs done or failed, minutes per figure), files, issues.`, { label: 'gpu:figures', phase: 'GPU', schema: RESULT, model: 'sonnet' })
  if (STAGE === 'gpu-figs') return { figs: s(figs) }
  const wire = await agent(`${COMMON}
You own ONLY: src/client/figures/glbModels.ts, public/assets/models/{manifest.json,skirmish-slugs.json}, tests/client/figures*.test.ts, art/figure-sheets/**.
New figure GLBs (Tanith redo + Skirmish slugs) are in public/assets/models; the GPU agent reported: ${JSON.stringify(figs && s(figs))}. Map every new Skirmish profile id (src/data/factions/*/models, see docs/spec/90-skirmish.md §C for slug -> model) to its GLB; keep the procedural fallback for any missing slug. List the slugs in manifest.json; make sure ?gallery shows them and the painter hue bands work. Run the art and skirmish e2e specs (PW_PORT=4183) and look at the screenshots with the Read tool.
Stage by exact path (public/assets/models, src/client/figures, tests/client, art/figure-sheets), commit "M10: real Tanith sculpt; M12: Skirmish figures" + blank line + "${ATTR}", and git push origin main. Return RESULT.`, { label: 'gpu:wire', phase: 'GPU', schema: RESULT, model: 'sonnet' })
  return { figs: s(figs), wire: s(wire) }
}

if (STAGE === 'docs') {
  phase('Docs')
  const d = await agent(`${COMMON}
You own ONLY: ${ROOT}/STATUS.md, ${ROOT}/HANDOFF.md, ${ROOT}/PLAN.md (you are told to edit these).
Bring them up to date with git log since db87dd0 (M10-M13 work tonight) and these stage results: ${JSON.stringify(args.results || {}).slice(0, 6000)}.
STATUS: sections for M10 (sourced stats; per-faction source docs; Tanith real sculpt), M11 (painter, panels, movement, new decisions), M12 (Skirmish lists, scenario, how to start one), M13 (cards, SR26 scenarios, clock); refresh test counts (run npm test once) and Known gaps. PLAN: mark M10-M13 state honestly (done, partial with what's missing). HANDOFF: a morning summary at the top for the owner (≤12 lines: what shipped, URLs/params to try, screenshots in e2e-out), then "Owner questions" (${(args.questions || []).join(' | ')}), then Next. Short plain sentences.
Stage only these three files, commit "M13: notes for M10-M13" + blank line + "${ATTR}", push. Return RESULT.`, { label: 'docs', phase: 'Docs', schema: RESULT, model: 'sonnet' })
  return s(d)
}

throw new Error(`stage ${STAGE} not written yet`)
