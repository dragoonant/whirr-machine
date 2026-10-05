// Playable vertical slice. Workflow({ scriptPath: 'tools/workflows/w3-client.js' })
export const meta = {
  name: 'w3-client',
  description: 'Whirr Machine M3: playable client vs random bot on Pages, with in-game How to Play',
  phases: [
    { title: 'Core', detail: 'store, presentation director, bot driver, client contract' },
    { title: 'Build', detail: 'board+figures+interaction, decision UI+cards+dice, start screen+How to Play' },
    { title: 'Ship', detail: 'integrate, Playwright full game, screenshots, push, Pages' },
  ],
}

const ROOT = 'C:/Users/antho/OneDrive/Documents/WarMForge/whirr-machine'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }

const COMMON = `Project root: ${ROOT} (git repo, branch main, remote github.com/dragoonant/whirr-machine, Pages https://dragoonant.github.io/whirr-machine/). Windows; absolute paths, the cwd resets. Run long commands in the FOREGROUND. Orient from ${ROOT}/STATUS.md, then docs/spec/50-client.md and only the other sections named. The engine (src/engine, index.ts exports step/legalActions/UI-number helpers) and data (src/data loadBundle) exist; the client is the ONLY caller of engine.step, via the zustand store. The engine owns every number the UI shows: never compute hit/damage targets, LOS or scenario control in the client. Do not edit src/engine or src/data (report needed engine changes in issues). IP rule: all UI copy in our own words; unofficial fan project, not affiliated with Steamforged Games; no SFG logos/icons. Visual theme: dark charcoal and gold (--bg:#14161a --fg:#e8e6e1 --card:#1e2127 --accent:#c9a227, second accent brass #b87333). You may consult Mallet's client for patterns (C:/Users/antho/OneDrive/Documents/Mallet-42k/src/client/presentation, /dice, /ui) — read sparingly, copy the shape not the 40k logic. Concurrent agents share this tree: touch only files you own, never edit STATUS.md/package.json, never git commit or npm install unless told. Final output is raw JSON for an orchestrator.`

phase('Core')
const core = await agent(`${COMMON}
Build the client core and FREEZE its contract for three parallel agents that come next. You own src/client/store/**, src/client/presentation/**, src/client/bot/**, src/client/contract.ts, and may npm install if truly needed.
- zustand game store: new game from setup options (lists, scenario, who is human, bot), dispatch(action) -> engine.step, rejection messages, selected model, UI mode (select/move/target/measure/los), save/load to localStorage.
- presentation director + presented store: events become timed presentation steps (move tweens, dice rolls, damage pops, narration banners); the UI renders presented state at the animation cursor; speed setting; any click skips.
- bot driver: the random bot (src/ai) answers bot-owned decisions only when presentation is idle; 5 s no-progress watchdog force-answers.
- src/client/contract.ts: typed selectors and actions the board/UI/start-screen agents will use (list them with one-line comments), plus test hooks: ?test=1 exposes window.__game.
- Unit tests in tests/client/store.test.ts (a full bot-vs-bot game runs through the store headless).
Run typecheck and your tests. Return JSON: ok, summary, files, issues.`, { label: 'client-core', phase: 'Core', schema: RESULT, effort: 'high' })

phase('Build')
const PARTS = [
  { key: 'board', own: 'src/client/board/**, src/client/figures/**, src/client/interaction/**, src/client/vfx/**', task: `R3F battlefield: 36"x36" Recon table (support 48), board texture/grid, terrain pieces by rules type (walls, water, forest, rubble, obstructions; semi-transparent so they never hide models), deployment zones and scenario elements with controller colours from the engine. Procedural SD figures per model type (caster, heavy war-engine with boiler/smokestack, solo, trooper) on correct base sizes, side colours blue/gold vs red/iron, selection ring, damage/status indicators (knocked down tilt, focus orbs 0-3, clouds as 3" smoke domes). Interaction: click to select, move with a ghost path and legal-distance readout from the engine (advance/run/charge rings, threat range ring = SPD+3+reach), click target to attack, ruler tool (base edge to base edge), LOS view that shows the engine's verdict and reasons. Camera: orbit/pan/zoom, right/middle click never moves models, transitions <=600 ms. Performance: demand frameloop, dpr cap, shared geometry. Invisible DOM proxies data-testid="model-<id>" with data-x/data-z.` },
  { key: 'hud', own: 'src/client/ui/** (except src/client/ui/start/** and src/client/ui/help/**), src/client/dice/**', task: `In-game HUD: turn/phase/round banner and VP tracker with scenario control; activation panel for the selected model (stats, weapons, Normal Movement options, Combat Action options, spells with costs, feat button) with buttons that dispatch legal actions only; decision prompts that explain themselves (attacker, target, exact numbers and odds from the engine, e.g. "Boost hit? 2d6+7 vs DEF 14: 58% -> 83%"); focus allocation UI in the Control Phase; damage cards (caster box row, war-engine 6-column grid with system letters and crippled state); dice tray on the right rail under a dice log (every roll type routes there; target number read from state, not events); event feed with attack breakdowns; end-turn and end-activation buttons; game-over screen with result and VP. data-testid scheme <area>-<element>[-id].` },
  { key: 'start', own: 'src/client/ui/start/**, src/client/ui/help/**, src/client/App.tsx, src/main.tsx, index.html', task: `Start screen titled "Whirr Machine" (subtitle: unofficial fan project, not affiliated with Steamforged Games) that fits one screen: pick side (Cygnar or Khador starter list, show the 4 models), opponent (random bot), scenario, speed, a Start button, and a prominent "How to Play" button. HOW TO PLAY (owner requirement, must be good): an in-game guide reachable from the start screen AND from a "?" button during play, written in our own words, tabbed and skimmable: Goal (assassinate the enemy caster or win on scenario points; how VP and the lead-by-3 rule work), Your army (caster, focus, war-engines, solo, unit), Turn sequence (Maintenance, Control: focus allocation, Activation: move then Combat Action), Moving (advance, run, charge, aim; rough terrain; engaged), Attacking (2d6 + stat vs DEF, damage 2d6 + POW vs ARM, boosting, crits, power attacks), Focus and spells (allocate, boost, extra attacks, Power Field, upkeep, feat), Terrain and LOS, Controls (mouse/keyboard: select, move, attack, ruler, LOS view, camera, end activation/turn, skip animations), plus a short "Your first turn" walkthrough. Also first-time contextual tips: a dismissible coach line at the bottom that tells the player what to do next in the current phase/decision (driven by the engine's pending decision), remembered as dismissed in localStorage. App.tsx routes start screen <-> game; keep ?test=1/?gallery hooks.` },
]
const parts = await parallel(PARTS.map(p => () => agent(`${COMMON}
Read src/client/contract.ts first (frozen; if you need something missing, add a local adapter in your own files and note it in issues). Task: ${p.task}
You own ONLY: ${p.own}, plus tests/client/${p.key}*.test.ts. Run typecheck (ignore errors in files you don't own, report them) and your tests.
Return JSON: ok, summary (≤80 words), files, issues.`, { label: `client:${p.key}`, phase: 'Build', schema: RESULT, model: 'sonnet' })))

phase('Ship')
const ship = await agent(`${COMMON}
Integrate and ship the playable prototype. You may edit any file under src/client, tests, playwright config, package.json (npm install allowed), STATUS.md, HANDOFF.md; minimal src/engine fixes only if the client is blocked (mirror contract changes in docs/spec/00-architecture.md).
1. npm run typecheck, npm test, npm run build green.
2. Run the dev build yourself in Playwright and PLAY: start a game as Cygnar vs the bot, deploy, move, shoot, charge, allocate focus, cast a spell, end turns; fix every crash, stuck state, invisible prompt, or unexplained number you find. The human must always see what to do next.
3. tests/e2e/play.spec.ts: start screen -> open How to Play (assert all tabs) -> start game -> human plays turns via UI (clicks, not window.__game shortcuts where avoidable; use __game only to fast-forward) until the game ends or round 3; screenshots to e2e-out/: start.png, howto.png, deploy.png, midgame.png, attack-prompt.png, gameover-or-round3.png. Playwright serves /whirr-machine/ via vite preview.
4. Code-split engine/data from the client if the main chunk > 1 MB.
5. Update STATUS.md and HANDOFF.md (next: owner playtest feedback, then M4 AI). git add -A -- . ':(exclude)docs/sources' ':(exclude)e2e-out'; commit "M3: playable vertical slice with How to Play" + blank line + "${ATTR}"; git push origin main; gh run watch the deploy with --exit-status (fix and retry up to 2 times); then curl -s https://dragoonant.github.io/whirr-machine/ | grep -i whirr.
Return JSON: ok, summary (≤120 words: what a player can do, known gaps), files (include absolute screenshot paths), issues.`, { label: 'ship', phase: 'Ship', schema: RESULT, effort: 'high' })

const s = r => r && { ok: r.ok, summary: r.summary, files: r.files.slice(0, 10), issues: r.issues.slice(0, 8) }
return { core: s(core), parts: parts.map(s), ship: s(ship) }
