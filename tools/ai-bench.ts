// AI bench (40-ai §9): tier vs tier on the starter lists, both sides and both factions alternated.
// Run: npm run bench:ai -- --games N --seed S [--size recon|skirmish] [--pairs normal:random,normal:easy] [--scenario id] [--json] [--mirror] [--rotate cyg,kha,trl,cir,cry,men]
// --mirror: both tiers play the same list (--xlist, else the first default list), so the result is AI skill and not list balance.
// --rotate a,b,c: game g plays an ordered pair of those lists (every pair, each also swapped), so every list is used for and against the tier alike.
// --size skirmish (90-skirmish E6): the 50-point *-skirmish lists on Copperline Crossing; --xlist/--ylist take list ids or faction ids.
// Prints win rates by cause, own-Leader losses, assassination lines found/committed, mean and p95 ms per decision,
// and engine rejections/stalls/cap hits (all must be 0). Writes tools/out/bench-<date>.json.
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadBundle } from '../src/data/index'
import { decideSync, newBrain, type Brain } from '../src/ai/decider'
import { pickSensible } from '../src/ai/random'
import { applyTuning } from '../src/ai/tiers'
import { GAME_SIZES, SIZE_DEFAULTS, resolveList, sizeProblem, type GameSize } from './sim'
import { createGame, legalActions, step, type Action, type GameSetup, type GameState, type PlayerId } from '../src/engine/index'

type Tier = 'random' | 'easy' | 'normal'
interface Args { games: number; seed: string; pairs: [Tier, Tier][]; scenario: string; cap: number; json: boolean; quiet: boolean; xList?: string; yList?: string; size: GameSize; scenarioGiven: boolean; mirror: boolean; rotate?: string[] }

function parseArgs(argv: string[]): Args {
  const a: Args = { games: 20, seed: '1', pairs: [['normal', 'random'], ['normal', 'easy']], scenario: SIZE_DEFAULTS.recon.scenario, cap: 4000, json: false, quiet: false, size: 'recon', scenarioGiven: false, mirror: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!, v = argv[i + 1]
    if (k === '--games' && v) { a.games = Number(v); i++ }
    else if (k === '--seed' && v) { a.seed = v; i++ }
    else if ((k === '--pairs' || k === '--pair') && v) { a.pairs = v.split(',').map((p) => p.split(':') as [Tier, Tier]); i++ }
    else if (k === '--scenario' && v) { a.scenario = v; a.scenarioGiven = true; i++ }
    else if (k === '--size' && v) { if (!(GAME_SIZES as readonly string[]).includes(v)) { console.error(`--size must be one of ${GAME_SIZES.join(', ')}`); process.exit(2) } a.size = v as GameSize; i++ }
    else if (k === '--cap' && v) { a.cap = Number(v); i++ }
    else if (k === '--xlist' && v) { a.xList = v; i++ }
    else if (k === '--ylist' && v) { a.yList = v; i++ }
    else if (k === '--json') a.json = true
    else if (k === '--quiet') a.quiet = true
    else if (k === '--mirror') a.mirror = true
    else if (k === '--rotate' && v) { a.rotate = v.split(',').filter(Boolean); i++ }
  }
  if (!a.scenarioGiven) a.scenario = SIZE_DEFAULTS[a.size].scenario
  if (a.xList) a.xList = resolveList(a.xList, a.size)
  if (a.yList) a.yList = resolveList(a.yList, a.size)
  if (a.rotate) a.rotate = a.rotate.map((t) => resolveList(t, a.size))
  return a
}

/** Ordered pairs of the rotation: (i, j) then (j, i) for every unordered pair, so a run of games is balanced between the lists. */
export function rotationPairs(lists: readonly string[]): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < lists.length; i++) for (let j = i + 1; j < lists.length; j++) out.push([lists[i]!, lists[j]!], [lists[j]!, lists[i]!])
  return out
}
/** The lists tier x and tier y play in game g: the mirror (one list for both), the rotation, the --xlist/--ylist pair, or nothing (the default pair, alternated by side). */
export function listsForGame(args: Pick<Args, 'mirror' | 'rotate' | 'xList' | 'yList' | 'size'>, g: number): { xList?: string; yList?: string } {
  if (args.rotate && args.rotate.length > 1) { const p = rotationPairs(args.rotate); const [x, y] = p[g % p.length]!; return { xList: x, yList: y } }
  if (args.mirror) { const l = args.xList ?? SIZE_DEFAULTS[args.size].lists[0]; return { xList: l, yList: l } }
  return { xList: args.xList, yList: args.yList }
}

export interface GameResult {
  pair: string; game: number; seed: string; xSide: PlayerId; winner: 'x' | 'y' | 'draw' | 'unfinished'; reason: string; rounds: number
  decisions: number; rejected: number; stall: boolean; cap: boolean; xLeaderLost: boolean; yLeaderLost: boolean
  ms: { x: number[]; y: number[] }; brains: { x?: Brain; y?: Brain }
  /** the lists the two tiers played (x's and y's) */
  lists: { x: string; y: string }
  /** fury events by the side that owns the model (x / y): frenzies, transfers, leeches, forced points, reaves */
  fury: { x: Record<string, number>; y: Record<string, number> }
}

/** One game between tiers x and y; x plays side `xSide`. */
export function playGame(x: Tier, y: Tier, xSide: PlayerId, swapLists: boolean, seed: string, scenario: string, cap = 4000, xList?: string, yList?: string, size: GameSize = 'recon'): GameResult {
  const bundle = loadBundle()
  const [kha, cyg] = SIZE_DEFAULTS[size].lists
  const base = swapLists ? { A: kha, B: cyg } : { A: cyg, B: kha }
  // --xlist/--ylist: x's list and y's list by id (x plays xSide), overriding the default starter pair
  const lists = xList && yList ? (xSide === 'A' ? { A: xList, B: yList } : { A: yList, B: xList }) : base
  const setup: GameSetup = { scenario, lists }
  let s: GameState = createGame(setup, seed, bundle).state
  const tierOf = (p: PlayerId): Tier => (p === xSide ? x : y)
  const brains: Record<PlayerId, Brain> = { A: newBrain(), B: newBrain() }
  const ms: Record<PlayerId, number[]> = { A: [], B: [] }
  const fury: GameResult['fury'] = { x: {}, y: {} }
  const tally = (events: { type: string; [k: string]: unknown }[]): void => {
    for (const e of events) {
      if (!['Frenzied', 'DamageTransferred', 'FuryLeeched', 'BeastForced', 'FuryReaved', 'SpellCast', 'FeatUsed', 'Healed', 'UpkeepPaid', 'TokenSpent', 'BeastControlTaken'].includes(e.type)) continue
      const id = (e.beastId ?? e.warlockId ?? e.modelId ?? e.reaverId ?? e.casterId) as string | undefined
      const owner = id ? s.models[id]?.owner : undefined
      const bucket = owner === xSide ? fury.x : fury.y
      bucket[e.type] = (bucket[e.type] ?? 0) + 1
    }
  }
  let rejected = 0, i = 0, still = 0, sig = ''
  let stall = false
  for (; i < cap; i++) {
    if (s.pending.kind === 'gameOver') break
    const legal = legalActions(s)
    const p = s.pending.player
    const t = tierOf(p)
    const t0 = performance.now()
    let a: Action
    if (t === 'random') a = pickSensible(s, s.pending, legal, `${seed}:${p}`)
    else a = decideSync(s, s.pending, legal, { tier: t, seed: `${seed}:${p}`, brain: brains[p] })
    ms[p].push(performance.now() - t0)
    const r = step(s, a)
    if (r.rejection) {
      rejected++
      if (process.env.AI_DEBUG) console.error('rejected', s.pending.kind, a.type, r.rejection.message)
      const fb = legal[0]
      if (!fb) break
      const fr = step(s, fb)
      tally(fr.events as never)
      s = fr.state
    } else { tally(r.events as never); s = r.state }
    const ns = `${s.round}|${s.turn}|${s.scenario.vp.A}|${s.scenario.vp.B}|${Object.values(s.models).filter((m) => m.activated).length}|${Object.values(s.models).reduce((n, m) => n + (m.damage.track === 'single' ? m.damage.filled : 0) + (m.life !== 'active' ? 100 : 0), 0)}|${s.activation?.activeId ?? ''}`
    if (ns === sig) { if (++still > 200) { stall = true; break } } else { sig = ns; still = 0 }
  }
  const res = s.scenario.result
  const yS: PlayerId = xSide === 'A' ? 'B' : 'A'
  const lost = (p: PlayerId): boolean => { const L = s.models[s.players[p].leaderId]; return !!L && L.life !== 'active' }
  return {
    pair: `${x}:${y}`, game: 0, seed, xSide,
    winner: !res ? 'unfinished' : res.winner === null ? 'draw' : res.winner === xSide ? 'x' : 'y',
    reason: res?.reason ?? 'unfinished', rounds: s.round, decisions: i, rejected, stall, cap: i >= cap,
    xLeaderLost: lost(xSide), yLeaderLost: lost(yS), fury, lists: { x: lists[xSide], y: lists[yS] },
    ms: { x: x === 'random' ? [] : ms[xSide], y: y === 'random' ? [] : ms[yS] },
    brains: { ...(x !== 'random' ? { x: brains[xSide] } : {}), ...(y !== 'random' ? { y: brains[yS] } : {}) },
  }
}

const pct = (n: number, d: number): string => `${d ? ((100 * n) / d).toFixed(0) : '0'}%`
const quant = (xs: number[], q: number): number => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]! }

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  applyTuning(process.env.AI_TUNE)
  const problem = sizeProblem(loadBundle(), args.size, args.scenario, args.xList && args.yList ? [args.xList, args.yList] : SIZE_DEFAULTS[args.size].lists)
  if (problem) { console.error(`bench:ai: ${problem}`); process.exit(2) }
  const out: Record<string, unknown> = {}
  const lines: string[] = []
  for (const [x, y] of args.pairs) {
    const rs: GameResult[] = []
    for (let g = 0; g < args.games; g++) {
      const xSide: PlayerId = g % 2 === 0 ? 'A' : 'B'
      const swap = Math.floor(g / 2) % 2 === 1
      const gl = listsForGame(args, g)
      const r = playGame(x, y, xSide, swap, `${args.seed}:${x}-${y}:g${g}`, args.scenario, args.cap, gl.xList, gl.yList, args.size)
      r.game = g
      rs.push(r)
      if (!args.quiet && !args.json) console.log(`${x} vs ${y} game ${g} (${x} as ${xSide}${swap ? ', lists swapped' : ''}): ${r.winner === 'x' ? x : r.winner === 'y' ? y : r.winner} by ${r.reason}, round ${r.rounds}, ${r.decisions} decisions${r.rejected ? `, ${r.rejected} REJECTED` : ''}${r.stall ? ', STALL' : ''}`)
    }
    const byCause: Record<string, { x: number; y: number; draw: number }> = {}
    for (const r of rs) {
      const c = (byCause[r.reason] ??= { x: 0, y: 0, draw: 0 })
      if (r.winner === 'x') c.x++; else if (r.winner === 'y') c.y++; else c.draw++
    }
    const wins = rs.filter((r) => r.winner === 'x').length
    const msX = rs.flatMap((r) => r.ms.x), msY = rs.flatMap((r) => r.ms.y)
    const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
    const linesFound = rs.reduce((a, r) => a + (r.brains.x?.stats.linesFound ?? 0), 0)
    const linesCommitted = rs.reduce((a, r) => a + (r.brains.x?.stats.linesCommitted ?? 0), 0)
    const fallbacks = rs.reduce((a, r) => a + (r.brains.x?.stats.fallbacks ?? 0) + (r.brains.y?.stats.fallbacks ?? 0), 0)
    const kinds: Record<string, { n: number; ms: number; max: number }> = {}
    for (const r of rs) for (const b of [r.brains.x, r.brains.y]) if (b) for (const [k, v] of Object.entries(b.stats.byKind)) {
      const e = (kinds[k] ??= { n: 0, ms: 0, max: 0 }); e.n += v.n; e.ms += v.ms; e.max = Math.max(e.max, v.max)
    }
    const byXList: Record<string, { games: number; wins: number }> = {}
    for (const r of rs) { const e = (byXList[r.lists.x] ??= { games: 0, wins: 0 }); e.games++; if (r.winner === 'x') e.wins++ }
    const furyTot = (k: 'x' | 'y'): Record<string, number> => { const o: Record<string, number> = {}; for (const r of rs) for (const [n, v] of Object.entries(r.fury[k])) o[n] = (o[n] ?? 0) + v; return o }
    const summary = {
      games: rs.length, fury: { x: furyTot('x'), y: furyTot('y') }, winRate: wins / Math.max(1, rs.length), byCause, byXList,
      xLeaderLostPerGame: rs.filter((r) => r.xLeaderLost).length / Math.max(1, rs.length),
      meanMsPerDecision: { [x]: Number(mean(msX).toFixed(2)), ...(y !== 'random' ? { [`${y}(opp)`]: Number(mean(msY).toFixed(2)) } : {}) },
      p95Ms: Number(quant(msX, 0.95).toFixed(1)), maxMs: Number(Math.max(0, ...msX).toFixed(1)),
      perKind: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { n: v.n, mean: Number((v.ms / v.n).toFixed(2)), max: Number(v.max.toFixed(1)) }])),
      linesFound, linesCommitted, fallbacks,
      rejected: rs.reduce((a, r) => a + r.rejected, 0), stalls: rs.filter((r) => r.stall).length, capHits: rs.filter((r) => r.cap).length,
      unfinished: rs.filter((r) => r.winner === 'unfinished').length, meanRounds: Number(mean(rs.map((r) => r.rounds)).toFixed(2)),
    }
    out[`${x}:${y}`] = summary
    lines.push(`${x} vs ${y}: ${x} wins ${pct(wins, rs.length)} of ${rs.length} (${Object.entries(byCause).map(([c, v]) => `${c} ${v.x}-${v.y}${v.draw ? `-${v.draw}` : ''}`).join(', ')})`)
    lines.push(`  ${x} ${summary.meanMsPerDecision[x]} ms/decision mean, p95 ${summary.p95Ms}, max ${summary.maxMs}; own Leader lost ${pct(rs.filter((r) => r.xLeaderLost).length, rs.length)} of games; lines found ${linesFound}, committed ${linesCommitted}`)
    if (Object.keys(summary.fury.x).length + Object.keys(summary.fury.y).length) lines.push(`  fury events per game: ${x} ${JSON.stringify(Object.fromEntries(Object.entries(summary.fury.x).map(([n, v]) => [n, Number((v / rs.length).toFixed(1))])))}; ${y} ${JSON.stringify(Object.fromEntries(Object.entries(summary.fury.y).map(([n, v]) => [n, Number((v / rs.length).toFixed(1))])))}`)
    if (Object.keys(byXList).length > 1 || args.mirror) lines.push(`  ${x} wins by the list it played: ${Object.entries(byXList).map(([l, v]) => `${l} ${v.wins}/${v.games}`).join(', ')}`)
    lines.push(`  rejected ${summary.rejected}, stalls ${summary.stalls}, cap hits ${summary.capHits}, fallbacks ${fallbacks}, mean rounds ${summary.meanRounds}`)
  }
  try {
    mkdirSync('tools/out', { recursive: true })
    writeFileSync(`tools/out/bench-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ args: { ...args, pairs: args.pairs.map((p) => p.join(':')) }, results: out }, null, 2))
  } catch { /* the summary still prints */ }
  if (args.json) console.log(JSON.stringify(out, null, 2))
  else { console.log(''); for (const l of lines) console.log(l) }
}

const isMain = (() => { try { return process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!) } catch { return false } })()
if (isMain) main()
