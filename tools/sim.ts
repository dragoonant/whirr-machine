// Headless bot-vs-bot games on the real starter lists and scenario, with engine invariants checked after every step (60 §2, §3).
// Run: npm run sim -- --games 50 --seed 1 [--size recon|skirmish] [--scenario scn-ashwall-divide|scn-qs-demo] [--cap 5000] [--json] [--lists trl.l.starter-recon,kha.l.qs-recon]
// --lists A,B plays those two lists (A and B swap sides on odd games); each may be a list id or a faction id (cyg kha trl cir cry men),
// which means that faction's list of the chosen size. Without --lists the Khador and Cygnar lists of the size play.
// --cards gives both sides a five-card command hand (the universal cards, plus For the Motherland for a Khador list), so playCard and the Maintenance prompt are exercised.
// --size skirmish (90-skirmish E6): 50-point *-skirmish lists on Copperline Crossing, 48" table; --scenario still overrides the scenario.
import { loadBundle } from '../src/data/index'
import type { DataBundle } from '../src/engine/types'
import { pickSensible } from '../src/ai/random'
import {
  createGame, legalActions, replay, save, load, step, validate,
  type Action, type GameSetup, type GameState, type LifeState, type Phase, type PlayerId,
} from '../src/engine/index'

export type GameSize = 'recon' | 'skirmish'
export const GAME_SIZES: readonly GameSize[] = ['recon', 'skirmish']
/** Default scenario and Khador-vs-Cygnar pair per game size. */
export const SIZE_DEFAULTS: Record<GameSize, { scenario: string; lists: [string, string] }> = {
  recon: { scenario: 'scn-ashwall-divide', lists: ['kha.l.qs-recon', 'cyg.l.qs-recon'] },
  skirmish: { scenario: 'scn-copperline-crossing', lists: ['kha.l.skirmish', 'cyg.l.skirmish'] },
}
const RECON_LISTS: Record<string, string> = {
  cyg: 'cyg.l.qs-recon', kha: 'kha.l.qs-recon', trl: 'trl.l.starter-recon', cir: 'cir.l.starter-recon', cry: 'cry.l.necro-recon', men: 'men.l.starter-recon',
}
/** A list id as given, or a bare faction id ('trl') resolved to that faction's list of the game size. */
export function resolveList(token: string, size: GameSize): string {
  if (token.includes('.')) return token
  return size === 'skirmish' ? `${token}.l.skirmish` : (RECON_LISTS[token] ?? token)
}
/** Why a size/scenario/lists choice cannot be played (a missing list, a scenario not played at that size), or null. */
export function sizeProblem(bundle: DataBundle, size: GameSize, scenario: string, lists: readonly string[]): string | null {
  for (const id of lists) {
    const l = bundle.byId[id] as { level?: string } | undefined
    if (!l) return `list '${id}' does not exist${size === 'skirmish' ? ' (the 50-point lists come from the faction data packages)' : ''}`
    if ((l.level ?? 'recon') !== size) return `list '${id}' is a ${l.level ?? 'recon'} list, not ${size}`
  }
  const sc = bundle.byId[scenario] as { levels?: string[] } | undefined
  if (!sc) return `scenario '${scenario}' does not exist`
  if (sc.levels && !sc.levels.includes(size)) return `scenario '${scenario}' is not played at ${size}`
  return null
}

interface Args { games: number; seed: string; scenario: string; cap: number; json: boolean; stall: number; wallMs: number; quiet: boolean; lists?: [string, string]; size: GameSize; scenarioGiven: boolean; cards: boolean }
function parseArgs(argv: string[]): Args {
  const a: Args = { games: 20, seed: '1', scenario: SIZE_DEFAULTS.recon.scenario, cap: 5000, json: false, stall: 200, wallMs: 60_000, quiet: false, size: 'recon', scenarioGiven: false, cards: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!, v = argv[i + 1]
    if (k === '--games' && v) { a.games = Number(v); i++ } else if (k === '--seed' && v) { a.seed = v; i++ } else if (k === '--scenario' && v) { a.scenario = v; a.scenarioGiven = true; i++ } else if (k === '--size' && v) { if (!(GAME_SIZES as readonly string[]).includes(v)) { console.error(`--size must be one of ${GAME_SIZES.join(', ')}`); process.exit(2) } a.size = v as GameSize; i++ } else if (k === '--cap' && v) { a.cap = Number(v); i++ } else if (k === '--stall' && v) { a.stall = Number(v); i++ } else if (k === '--json') a.json = true
    else if (k === '--lists' && v) { const [x, y] = v.split(','); if (x && y) a.lists = [x, y]; i++ }
    else if (k === '--quiet') a.quiet = true
    else if (k === '--cards') a.cards = true
  }
  if (!a.scenarioGiven) a.scenario = SIZE_DEFAULTS[a.size].scenario
  if (a.lists) a.lists = [resolveList(a.lists[0], a.size), resolveList(a.lists[1], a.size)]
  return a
}

export interface Violation { game: number; seed: string; index: number; kind: string; message: string; lastActions?: string[] }
export interface GameSummary { game: number; seed: string; ended: boolean; winner: PlayerId | null; reason: string; rounds: number; decisions: number; ms: number }

const LIFE_ORDER: Record<LifeState, number> = { active: 0, disabled: 1, boxed: 2, destroyed: 3 }
const PHASE_NEXT: Record<Phase, Phase[]> = {
  setup: ['setup', 'deploy', 'maintenance', 'control', 'activation', 'ended'],
  deploy: ['deploy', 'maintenance', 'control', 'activation', 'ended'],
  maintenance: ['maintenance', 'control', 'activation', 'ended'],
  control: ['control', 'activation', 'ended'],
  activation: ['activation', 'maintenance', 'control', 'ended'],
  ended: ['ended'],
}
const finite = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n)

/** Every invariant of 60 §2 we can check from one state. Returns messages (empty = fine). */
export function checkState(s: GameState, prev: GameState | null): string[] {
  const out: string[] = []
  if (!s.pending) out.push('no pending decision')
  else if ((s.pending.kind === 'gameOver') !== (s.phase === 'ended')) out.push(`pending ${s.pending.kind} in phase ${s.phase}`)
  for (const p of ['A', 'B'] as PlayerId[]) if (!finite(s.scenario.vp[p]) || s.scenario.vp[p] < 0) out.push(`bad VP for ${p}: ${s.scenario.vp[p]}`)
  for (const m of Object.values(s.models)) {
    if (!finite(m.pos.x) || !finite(m.pos.z) || !finite(m.elev)) out.push(`${m.id} position is not finite`)
    if (!finite(m.focus) || m.focus < 0 || !Number.isInteger(m.focus)) out.push(`${m.id} focus ${m.focus}`)
    if (m.type === 'warEngine' && m.focus > 3) out.push(`${m.id} war-engine focus ${m.focus} > 3`)
    if (m.type === 'warEngine' && m.crippled.includes('C') && m.focus > 0) out.push(`${m.id} cortex crippled with ${m.focus} focus`)
    const d = m.damage
    if (d.track === 'single') { if (!finite(d.filled) || d.filled < 0 || d.filled > d.boxes) out.push(`${m.id} damage ${d.filled}/${d.boxes}`) }
    else for (const g of d.grids) for (const col of g.cols) for (const box of col) if (typeof box !== 'boolean') out.push(`${m.id} grid box not boolean`)
    if (!m.offTable && m.life === 'active') {
      const half = (s.scenario.table?.w ?? 36) / 2 + 0.01
      if (Math.abs(m.pos.x) > half || Math.abs(m.pos.z) > (s.scenario.table?.d ?? 36) / 2 + 0.01) out.push(`${m.id} off the table at (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`)
    }
    const before = prev?.models[m.id]
    // two ways back are legal: a disabled model that makes its Tough roll, and a destroyed Grunt that Grim Returns (Cryx) brings back (its effect is on the model)
    const returned = before?.life === 'destroyed' && m.life === 'active' && s.effects.some((e) => e.sourceId === 'cry.a.grim-returns' && e.targetIds.includes(m.id))
    if (before && LIFE_ORDER[m.life] < LIFE_ORDER[before.life] && !(before.life === 'disabled' && m.life === 'active') && !returned) out.push(`${m.id} life ${before.life} -> ${m.life}`)
  }
  if (prev) {
    if (!PHASE_NEXT[prev.phase].includes(s.phase)) out.push(`phase ${prev.phase} -> ${s.phase}`)
    if (s.round < prev.round) out.push(`round went back ${prev.round} -> ${s.round}`)
    if (s.turn < prev.turn) out.push(`turn went back ${prev.turn} -> ${s.turn}`)
    if (s.round > 7) out.push(`round ${s.round} > 7`)
  }
  return out
}

const signature = (s: GameState): string => {
  let dmg = 0, act = 0
  for (const m of Object.values(s.models)) {
    if (m.activated) act++
    dmg += m.damage.track === 'single' ? m.damage.filled : m.damage.grids.reduce((a, g) => a + g.cols.reduce((c, col) => c + col.filter(Boolean).length, 0), 0)
    if (m.life !== 'active') dmg += 100
  }
  for (const u of Object.values(s.units)) if (u.activated) act++
  return `${s.round}|${s.turn}|${act}|${dmg}|${s.scenario.vp.A}|${s.scenario.vp.B}|${s.activation?.activeId ?? ''}`
}
const short = (a: Action): string => {
  const r = a as unknown as Record<string, unknown>
  const extra = ['activate', 'option', 'modelId', 'targetId', 'weaponId', 'choice', 'abilityId', 'elementId', 'optionId', 'boost', 'spend'].filter((k) => r[k] !== undefined).map((k) => `${k}=${String(r[k])}`)
  return `${a.decisionId} ${a.player} ${a.type} ${extra.join(' ')}`
}

/** --cards: a hand for a list, the universal command cards (91 A.3) with the army's cards in place of the last ones, five at most. */
export function handOf(bundle: DataBundle, listId: string): string[] {
  const army = (bundle.byId[listId] as { army?: string } | undefined)?.army
  const cards = Object.values(bundle.byId).filter((r) => r.recordType === 'card') as unknown as { id: string; armies?: string[] }[]
  const universal = cards.filter((c) => !(c.armies ?? []).length).map((c) => c.id)
  const own = army ? cards.filter((c) => (c.armies ?? []).includes(army)).map((c) => c.id) : []
  return [...universal.slice(0, 5 - own.length), ...own].slice(0, 5)
}

export function runGame(game: number, args: Pick<Args, 'seed' | 'scenario' | 'cap' | 'stall' | 'wallMs' | 'lists'> & { size?: GameSize; cards?: boolean }, bundle = loadBundle()): { summary: GameSummary; violations: Violation[] } {
  const seed = `${args.seed}:g${game}`
  const [la, lb] = args.lists ?? SIZE_DEFAULTS[args.size ?? 'recon'].lists
  const lists = game % 2 === 0 ? { A: la, B: lb } : { A: lb, B: la }
  const setup: GameSetup = { scenario: args.scenario, lists, ...(args.cards ? { cards: { A: handOf(bundle, lists.A), B: handOf(bundle, lists.B) } } : {}) }
  const violations: Violation[] = []
  const t0 = Date.now()
  const v = (index: number, kind: string, message: string, log?: Action[]) => violations.push({ game, seed, index, kind, message, lastActions: log?.slice(-20).map(short) })
  let r = createGame(setup, seed, bundle)
  if (r.rejection) { v(0, 'setup', r.rejection.message); return { summary: { game, seed, ended: false, winner: null, reason: 'setupFailed', rounds: 0, decisions: 0, ms: Date.now() - t0 }, violations } }
  let state = r.state
  let prev: GameState | null = null
  let sig = signature(state), still = 0
  let i = 0
  const midSaveAt = 150 + (game % 7) * 40
  for (; i < args.cap; i++) {
    for (const msg of checkState(state, prev)) v(i, 'invariant', msg, state.log)
    if (state.pending.kind === 'gameOver') break
    if (Date.now() - t0 > args.wallMs) { v(i, 'wall', `game exceeded ${args.wallMs} ms`, state.log); break }
    let legal: Action[]
    try { legal = legalActions(state) } catch (e) { v(i, 'throw', `legalActions: ${(e as Error).message}`, state.log); break }
    if (legal.length === 0) { v(i, 'emptyLegal', `no legal action for ${state.pending.kind} (${state.pending.id}, options ${state.pending.options?.length ?? 0})`, state.log); break }
    const pick = pickSensible(state, state.pending, legal, `${seed}:${state.pending.player}`)
    let next
    try { next = step(state, pick) } catch (e) { v(i, 'throw', `step ${short(pick)}: ${(e as Error).message}`, state.log); break }
    if (next.rejection) { v(i, 'rejected', `${short(pick)}: ${next.rejection.code} ${next.rejection.message}`, state.log); break }
    if (next.state.pending.id !== next.pending.id) v(i, 'invariant', 'StepResult.pending differs from state.pending', state.log)
    // reject, never throw: a malformed answer must come back as a rejection with the same state
    if (i % 25 === 0) {
      try {
        const bad = validate(state, { ...pick, decisionId: 'd:bogus' } as Action)
        if (!bad) v(i, 'invariant', 'a bogus decision id validated')
      } catch (e) { v(i, 'throw', `validate(bogus): ${(e as Error).message}`) }
    }
    prev = state
    state = next.state
    if (i === midSaveAt) {
      // save/load mid-game gives the same state and pending
      const back = load(save(state), bundle)
      if (back.rejection || JSON.stringify(back.state) !== JSON.stringify(state)) v(i, 'saveLoad', back.rejection ? back.rejection.message : 'reloaded state differs')
    }
    const nsig = signature(state)
    if (nsig === sig) { if (++still >= args.stall) { v(i, 'stall', `${args.stall} decisions without progress at ${state.pending.kind}`, state.log); break } } else { sig = nsig; still = 0 }
  }
  if (i >= args.cap) v(i, 'cap', `decision cap ${args.cap} reached at round ${state.round}`, state.log)
  const ended = state.phase === 'ended'
  if (ended) {
    const rep = replay(setup, seed, bundle, state.log)
    if (rep.rejection || JSON.stringify(rep.state) !== JSON.stringify(state)) v(i, 'determinism', rep.rejection ? `replay rejected: ${rep.rejection.message}` : 'replay differs from the played game')
  }
  const res = state.scenario.result
  return {
    summary: { game, seed, ended, winner: res?.winner ?? null, reason: res?.reason ?? 'unfinished', rounds: state.round, decisions: i, ms: Date.now() - t0 },
    violations,
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const bundle = loadBundle()
  const problem = sizeProblem(bundle, args.size, args.scenario, args.lists ?? SIZE_DEFAULTS[args.size].lists)
  if (problem) { console.error(`sim: ${problem}`); process.exit(2) }
  const games: GameSummary[] = []
  const violations: Violation[] = []
  const t0 = Date.now()
  for (let g = 0; g < args.games; g++) {
    const r = runGame(g, args, bundle)
    games.push(r.summary)
    violations.push(...r.violations)
    if (!args.quiet && !args.json) {
      const s = r.summary
      console.log(`game ${g} (${s.seed}): ${s.ended ? (s.winner ? `${s.winner} wins` : 'draw') : 'UNFINISHED'} by ${s.reason}, round ${s.rounds}, ${s.decisions} decisions, ${s.ms} ms${r.violations.length ? `, ${r.violations.length} violation(s)` : ''}`)
    }
  }
  const byCause: Record<string, { A: number; B: number; draw: number }> = {}
  for (const g of games) {
    const c = (byCause[g.reason] ??= { A: 0, B: 0, draw: 0 })
    if (g.winner) c[g.winner]++
    else c.draw++
  }
  const finished = games.filter((g) => g.ended)
  const meanRounds = finished.length ? finished.reduce((a, g) => a + g.rounds, 0) / finished.length : 0
  const ms = games.map((g) => g.ms).sort((a, b) => a - b)
  const summary = {
    games: games.length, finished: finished.length, size: args.size, scenario: args.scenario, seed: args.seed,
    byCause, meanRounds: Number(meanRounds.toFixed(2)),
    meanDecisions: Number((games.reduce((a, g) => a + g.decisions, 0) / Math.max(1, games.length)).toFixed(1)),
    p95GameMs: ms[Math.floor(ms.length * 0.95)] ?? 0, totalMs: Date.now() - t0,
    violations: violations.length,
  }
  if (args.json) { console.log(JSON.stringify({ ...summary, violationList: violations }, null, 2)); }
  else {
    console.log('')
    console.log(`games ${summary.games}, finished ${summary.finished}, mean rounds ${summary.meanRounds}, mean decisions ${summary.meanDecisions}, p95 ${summary.p95GameMs} ms, total ${summary.totalMs} ms`)
    for (const [cause, c] of Object.entries(byCause)) console.log(`  ${cause}: A ${c.A}, B ${c.B}, draw ${c.draw}`)
    console.log(`violations: ${violations.length}`)
    for (const x of violations.slice(0, 30)) {
      console.log(`  [${x.kind}] seed ${x.seed} index ${x.index}: ${x.message}`)
      if (x.lastActions) for (const l of x.lastActions.slice(-6)) console.log(`      ${l}`)
    }
  }
  if (violations.length || finished.length !== games.length) process.exitCode = 1
}

const isMain = (() => { try { return process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!) } catch { return false } })()
if (isMain) main()
