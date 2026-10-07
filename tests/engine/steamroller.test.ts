// 91 B and 12 SR-: Steamroller 2026 scenario rules in the engine (WP3). The seven scenarios are built here from the 91 B.4 tables (the shipped
// data files are WP7's), on an ad hoc 48" layout, with skirmish lists made of existing profiles as in skirmish.test.ts.
import { describe, expect, it } from 'vitest'
import { droppedPieces } from '../../src/data/battlefields'
import { loadBundle } from '../../src/data/index'
import type { Action } from '../../src/engine/actions'
import type { GameEvent } from '../../src/engine/events'
import { createGame, legalActions, query, step, validate } from '../../src/engine/index'
import { resistsDamageType } from '../../src/engine/code-hooks'
import { hasGrantedCover } from '../../src/engine/factions/trollbloods'
import { baseRadius } from '../../src/engine/geometry'
import {
  computeControl, controlReport, inKillBox, killBoxActive, presenceTotals, scenarioDef, scoringActive,
} from '../../src/engine/scenario'
import {
  applyAttackerFrame, CLAIM_CACHE_ABILITY, elementPos, isScoringDecision, nearScenarioElement, resolveScenarioSpecialAction, scenarioCover, scenarioSpecialActions,
  answerScoringStep, scenarioTurnStart, scoreTurnEndStep, type ScoringOut,
} from '../../src/engine/scenario-rules'
import type { DataBundle, EdgeId, GameSetup, GameState, ModelState, PlayerId, StepResult, Vec2 } from '../../src/engine/types'
import { runGame } from '../../tools/sim'
import { finishActivations, must } from './turn-helpers'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const real = loadBundle()

// ---------- the seven scenarios (91 B.4), authored in the attacker frame ----------
type E = [id: string, kind: string, owner: 'first' | 'second' | null, x: number, z: number]
const els = (list: E[]): Any[] => list.map(([id, kind, owner, x, z]) => ({ id, kind, ...(owner ? { owner } : {}), pos: { x, z }, hold: { within: 3 }, vp: {} }))
const CTL = (kinds: string[], vp: number, owner = 'any'): Any => ({ kind: 'control', select: { kinds, owner }, vp })
const FUSE = { kind: 'fuse', tokens: 5, on: ['flag', 'objective50'], d3: ['flag:second', 'flag:first', 'objective50'], blast: { pow: 14, damageType: 'magical', within: 3 } }
const SCN: Record<string, { elements: Any[]; rules: Any[]; special?: Any[]; winMargin?: number }> = {
  'scn-t-trench': {
    elements: els([
      ['el-50-blue', 'objective50', 'second', -11.02, 2.02], ['el-40-blue', 'objective40', 'second', -1.21, 11.21], ['el-cache-blue', 'cache', 'second', -3.41, 5.41], ['el-flag-blue', 'flag', 'second', 17.41, 8.41],
      ['el-50-red', 'objective50', 'first', 11.02, 1.98], ['el-40-red', 'objective40', 'first', 1.21, -9.21], ['el-cache-red', 'cache', 'first', 3.41, -1.41], ['el-flag-red', 'flag', 'first', -17.41, -6.41],
    ]),
    rules: [CTL(['objective40', 'objective50'], 1), CTL(['flag'], 2, 'opponent'), { kind: 'cache', vp: 2 }],
    special: [{ kind: 'earthworks', within: 3, bases: [30, 40], warriorOnly: true, of: ['objective40', 'objective50'] }],
  },
  'scn-t-two-fronts': {
    elements: els([
      ['el-40-blue', 'objective40', 'second', -11.21, 4.21], ['el-50-blue', 'objective50', 'second', 11.02, 6.02], ['el-flag', 'flag', null, -0.41, -0.59],
      ['el-40-red', 'objective40', 'first', -15.21, -3.21], ['el-50-red', 'objective50', 'first', 15.02, -4.02],
    ]),
    rules: [CTL(['objective40', 'objective50'], 1), CTL(['flag'], 1), { kind: 'countBonus', select: { kinds: ['objective40'] }, atLeast: 2, vp: 1 }, { kind: 'countBonus', select: { kinds: ['objective50'] }, atLeast: 2, vp: 1 }],
  },
  'scn-t-wolves': {
    elements: els([
      ['el-flag-blue', 'flag', 'second', -11.41, 3.41], ['el-50-blue', 'objective50', 'second', 4.02, 3.02], ['el-40-blue', 'objective40', 'second', 15.21, 8.21],
      ['el-50-red', 'objective50', 'first', -4.02, 0.98], ['el-40-red', 'objective40', 'first', -15.21, -3.21], ['el-flag-red', 'flag', 'first', 11.41, -3.41],
    ]),
    rules: [CTL(['objective40', 'objective50'], 1), CTL(['flag'], 1), { kind: 'tokenRace', vp: 3, third: 3 }],
    special: [{ kind: 'killBoxGrowth', fromRound: 3, fromPlayer: 'first', step: 2 }, { kind: 'heelTokens', on: 'objective40', toward: 'objective50', move: 3 }],
  },
  'scn-t-pressure': {
    elements: els([
      ['el-flag-1', 'flag', null, -11.41, 3.41], ['el-flag-2', 'flag', null, 11.41, 3.41], ['el-flag-3', 'flag', null, -17.41, -7.59], ['el-flag-4', 'flag', null, 17.41, -7.59], ['el-50', 'objective50', null, 0.02, -1.02],
    ]),
    rules: [CTL(['flag'], 1), CTL(['objective50'], 2)],
  },
  'scn-t-stakes': {
    elements: els([
      ['el-flag-blue', 'flag', 'second', -15.41, 0.41], ['el-50', 'objective50', null, 0.02, 1.02], ['el-40-blue', 'objective40', 'second', 9.21, 6.21],
      ['el-40-red', 'objective40', 'first', -9.21, -5.21], ['el-flag-red', 'flag', 'first', 15.41, -3.41],
    ]),
    rules: [CTL(['objective40'], 1), CTL(['objective50'], 1), CTL(['flag'], 1), { kind: 'zeroTokenBonus', select: { kinds: ['objective50', 'flag'] }, vp: 1 }],
    special: [FUSE],
  },
  'scn-t-fault': {
    elements: els([
      ['el-40-blue-a', 'objective40', 'second', 15.21, 8.21], ['el-50-blue', 'objective50', 'second', 0.02, 3.02], ['el-40-blue-b', 'objective40', 'second', -15.21, -1.79],
      ['el-40-red-a', 'objective40', 'first', 15.21, 1.79], ['el-50-red', 'objective50', 'first', -0.02, -3.02], ['el-40-red-b', 'objective40', 'first', -15.21, -8.21],
    ]),
    rules: [CTL(['objective40', 'objective50'], 1), { kind: 'countBonus', select: { kinds: ['objective40', 'objective50'], owner: 'own' }, atLeast: 2, vp: 1 }, { kind: 'countBonus', select: { kinds: ['objective40', 'objective50'], owner: 'own' }, atLeast: 3, vp: 1 }],
  },
  'scn-t-payload': {
    elements: els([
      ['el-50-blue', 'objective50', 'second', -14.02, 7.02], ['el-40-blue', 'objective40', 'second', -3.21, 3.21], ['el-flag-blue', 'flag', 'second', 7.41, 4.41],
      ['el-flag-red', 'flag', 'first', -7.41, -4.41], ['el-40-red', 'objective40', 'first', 3.21, -3.21], ['el-50-red', 'objective50', 'first', 14.02, -7.02],
    ]),
    rules: [CTL(['objective40', 'objective50'], 1), CTL(['flag'], 1), { kind: 'delivered', vp: 3 }],
    special: [{ kind: 'payload', move: 3, perOther: 1, toward: 'opponentFlagTerrain', haul: 5 }],
    winMargin: 0,
  },
  'scn-t-bare': { elements: els([['el-flag', 'flag', 'first', 0, 0]]), rules: [CTL(['flag'], 1)] },
}
const FOREST = 'terrain.village-pines' // a 3" radius forest (rough, standable)
const layoutFor = (id: string, mono = false): Any => {
  const s = SCN[id]!
  const pieces: Any[] = s.elements.filter((e) => e.kind === 'flag' && id !== 'scn-t-bare').map((e) => ({ id: `f-${e.id}`, terrain: mono ? 'terrain.ruins-monolith' : FOREST, pos: { x: e.pos.x, z: e.pos.z + 3.5 }, rot: 0 }))
  if (id !== 'scn-t-bare') pieces.push({ id: 'decoy', terrain: 'terrain.village-stone-wall', pos: { x: 0, z: 20 }, rot: 0 })
  return { id: `layout.${id}${mono ? '-mono' : ''}`, name: id, recordType: 'terrain-layout', table: { w: 48, d: 48 }, pieces }
}
const scenarioRecord = (id: string): Any => {
  const s = SCN[id]!
  return {
    id, name: id, recordType: 'scenario', text: 'test', source: 'test', levels: ['skirmish'], table: { w: 48, d: 48 }, frame: 'attacker',
    deployment: { first: 6, second: 11, advance: 3, unitSpread: 3 }, rounds: 7,
    scoring: { fromRound: 2, fromPlayer: 'second', winMargin: s.winMargin ?? 3, winOnOpponentTurnOnly: true, leaderPresence: 10, rules: s.rules },
    killBox: { fromRound: 2, fromPlayer: 'first', depth: 12, vp: 2 }, setup: { flagRadius: 5, flagPickOrder: 'attackerFirst' },
    special: s.special ?? [], elements: s.elements, terrainLayout: `layout.${id}`,
  }
}
const SK = [{ profile: 'cyg.deuce' }, { profile: 'kha.razor' }, { profile: 'cyg.falk' }, { profile: 'cyg.black13', size: 3 }, { profile: 'kha.lazarenko' }] // 17 + 17 + 4 + 9 + 4 = 51: over 50, so no Lazarenko below
const SK50 = [{ profile: 'cyg.deuce' }, { profile: 'kha.razor' }, { profile: 'cyg.falk' }, { profile: 'cyg.black13', size: 3 }] // 47
void SK
const B: DataBundle = (() => {
  const byId = { ...real.byId } as Record<string, any>
  for (const id of Object.keys(SCN)) { byId[id] = scenarioRecord(id); byId[`layout.${id}`] = layoutFor(id); byId[`layout.${id}-mono`] = layoutFor(id, true) }
  byId['t.l.sk-a'] = { id: 't.l.sk-a', name: 'a', recordType: 'list', faction: 'cyg', leader: 'cyg.caine', level: 'skirmish', entries: SK50 }
  byId['t.l.sk-b'] = { id: 't.l.sk-b', name: 'b', recordType: 'list', faction: 'cyg', leader: 'cyg.caine', level: 'skirmish', entries: SK50 }
  byId['t.l.sk-kha'] = { id: 't.l.sk-kha', name: 'k', recordType: 'list', faction: 'cyg', leader: 'cyg.caine', army: 'kha.winter-korps', level: 'skirmish', entries: SK50 }
  return { ...real, byId }
})()

// ---------- helpers ----------
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const setupFor = (scenario: string, extra: Partial<GameSetup> = {}): GameSetup => ({ scenario, lists: { A: 't.l.sk-a', B: 't.l.sk-b' }, ...extra })
const act = (st: { state: GameState }, id: string): StepResult => {
  const o = st.state.pending.options?.find((x) => x.id === id)
  if (!o) throw new Error(`no option '${id}' in ${st.state.pending.kind}: ${(st.state.pending.options ?? []).map((x) => x.id).join(',')}`)
  const r = step(st.state, o.action)
  if (r.rejection) throw new Error(`rejected ${JSON.stringify(r.rejection)}`)
  return r
}
const isFlagPending = (s: GameState): boolean => s.pending.kind === 'abilityChoice' && s.pending.context.data?.code === 'flagTerrain'

/** Create the game, go first, put the Attacker on `attackerEdge`, and stop at the first flag pick or deployment decision. */
function begin(scn: string, attackerEdge: EdgeId = 'north', setup: Partial<GameSetup> = {}): { r: StepResult; events: GameEvent[] } {
  let r = createGame(setupFor(scn, setup), 'sr-seed', B)
  if (r.rejection) throw new Error(JSON.stringify(r.rejection))
  r = act(r, 'first')
  const secondEdge: EdgeId = attackerEdge === 'north' ? 'south' : 'north'
  const events: GameEvent[] = []
  r = act(r, secondEdge); events.push(...r.events)
  return { r, events }
}
/** Answer flag picks with `choose` (default: the first option) and deploy, until the first Control decision. */
function play(scn: string, choose: (s: GameState, i: number) => string = (s) => s.pending.options![0]!.id, setup: Partial<GameSetup> = {}): GameState {
  let { r } = begin(scn, 'north', setup)
  let i = 0
  for (let g = 0; g < 60; g++) {
    const s = r.state
    if (isFlagPending(s)) { r = act(r, choose(s, i++)); continue }
    if (s.pending.kind === 'deploy' || s.pending.kind === 'advanceDeploy') { r = act(r, 'auto'); continue }
    if (s.pending.kind === 'abilityChoice' && s.pending.context.data?.code === 'prey') { r = act(r, s.pending.options![0]!.id); continue }
    break
  }
  return r.state
}
const mid = (p: PlayerId, tag: string): string => `${p}:${tag}`
const park = (s: GameState): GameState => ({ ...s, models: Object.fromEntries(Object.entries(s.models).map(([k, m]) => [k, { ...m, offTable: true }])) })
const put = (s: GameState, id: string, pos: Vec2): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, pos, offTable: false, life: 'active' } as ModelState } })
const turn = (s: GameState, active: PlayerId, round: number): GameState => ({ ...s, round, turn: active === s.firstPlayer ? 2 * round - 1 : 2 * round, activePlayer: active })
const pos = (s: GameState, el: string): Vec2 => elementPos(s, B, el)!
const beside = (s: GameState, el: string, dx = 2.2, dz = 0): Vec2 => { const p = pos(s, el); return { x: p.x + dx, z: p.z + dz } }
const stand = (s: GameState, id: string, el: string, dx = 2.2, dz = 0): GameState => put(s, id, beside(s, el, dx, dz))
/** All three troopers of a unit, 1.3" apart, around an element. */
const standUnit = (s: GameState, p: PlayerId, el: string, dx = 2.2): GameState => [1, 2, 3].reduce((a, k) => put(a, `${p}:u3.${k}`, beside(a, el, dx, (k - 2) * 1.3)), s)
const forestOf = (s: GameState, flag: string): Vec2 => { const t = s.terrain.find((x) => x.id === `f-${flag}`)!; return t.pos }
const defOf = (s: GameState) => scenarioDef(B, s.scenario.id)
const ctl = (s: GameState, el: string) => computeControl(s, defOf(s))[el]!
/** A quiet mid-game table: both armies parked off the table, the turn set, nothing pending but the activation choice. */
function table(scn: string, active: 'F' | 'D' = 'D', round = 2, picks?: (s: GameState, i: number) => string): GameState {
  const s0 = play(scn, picks)
  const F = s0.firstPlayer!
  return turn(park(s0), active === 'F' ? F : other(F), round)
}
const vpOf = (r: ScoringOut) => r.state.scenario.vp
const score = (s: GameState): ScoringOut => scoreTurnEndStep(s, B)
const types = (ev: GameEvent[]) => ev.map((e) => e.type)
/** Answer scoring decisions with a policy keyed by the decision's code until the machine finishes. */
function settle(out: ScoringOut, policy: Record<string, string> = {}): ScoringOut {
  let cur = out
  const events = [...out.events]
  for (let g = 0; g < 30 && cur.pending; g++) {
    const code = (cur.pending.context.data?.code ?? 'haul') as string
    const want = policy[code]
    const o = cur.pending.options?.find((x) => x.id === want) ?? cur.pending.options![0]!
    const a = want === 'pass' ? ({ type: 'pass', decisionId: cur.pending.id, player: cur.pending.player } as Action) : o.action
    const r = answer(cur.state, a)
    events.push(...r.events)
    cur = r
  }
  return { ...cur, events }
}
function answer(s: GameState, a: Action): ScoringOut {
  const r = answerScoringStep(s, B, a)
  if ('rejection' in r) throw new Error(`rejected ${JSON.stringify(r.rejection)}`)
  return r
}

describe('SR setup: frame, flags', () => {
  it('SR-002 the Attacker on the north edge keeps the elements as authored; south turns them 180 degrees; west and east a quarter', () => {
    const s0 = play('scn-t-trench')
    const F = s0.firstPlayer!
    const withEdge = (edge: EdgeId): GameState => applyAttackerFrame({ ...s0, players: { ...s0.players, [F]: { ...s0.players[F], edge } } }, B)
    const at = (s: GameState, id: string) => s.scenario.elementState![id]!.pos!
    expect(at(withEdge('north'), 'el-50-blue')).toEqual({ x: -11.02, z: 2.02 })
    expect(at(withEdge('south'), 'el-50-blue')).toEqual({ x: 11.02, z: -2.02 })
    expect(at(withEdge('west'), 'el-50-blue')).toEqual({ x: 2.02, z: 11.02 }) // 26" from the west edge, 11" off the centre line
    expect(at(withEdge('east'), 'el-50-blue')).toEqual({ x: -2.02, z: -11.02 })
    expect(s0.terrain.find((t) => t.id === 'decoy')!.pos).toEqual({ x: 0, z: 20 }) // terrain does not rotate
  })

  it('SR-002 chooseEdge applies the frame: the Attacker south puts the Attacker-frame cache on the real far side', () => {
    const { r } = begin('scn-t-trench', 'south')
    expect(r.state.scenario.elementState!['el-cache-blue']!.pos).toEqual({ x: 3.41, z: -5.41 })
    expect(elementPos(r.state, B, 'el-cache-blue')).toEqual({ x: 3.41, z: -5.41 })
  })

  it('SR-003 flag picks come first, Attacker first, each player only for their own flag and only pieces within 5"', () => {
    let { r, events } = begin('scn-t-trench')
    const F = r.state.firstPlayer!
    expect(isFlagPending(r.state)).toBe(true)
    expect(r.state.pending.player).toBe(F)
    const opts = r.state.pending.options!.map((o) => o.id)
    expect(opts).toEqual(['el-flag-red|f-el-flag-red']) // the decoy wall is 26" away; the blue flag is not the Attacker's
    expect(types(events)).not.toContain('ModelDeployed')
    r = act(r, opts[0]!)
    expect(types(r.events)).toContain('FlagTerrainChosen')
    expect(isFlagPending(r.state)).toBe(true)
    expect(r.state.pending.player).toBe(other(F))
    expect(r.state.pending.options!.map((o) => o.id)).toEqual(['el-flag-blue|f-el-flag-blue'])
    r = act(r, 'el-flag-blue|f-el-flag-blue')
    expect(r.state.pending.kind).toBe('deploy')
    expect(r.state.scenario.elementState!['el-flag-red']!.terrainId).toBe('f-el-flag-red')
    expect(r.state.scenario.elementState!['el-flag-blue']!.terrainId).toBe('f-el-flag-blue')
  })

  it('SR-003 with no piece within 5" the flag becomes a 30 mm obstruction scenario piece and needs no pick', () => {
    const { r, events } = begin('scn-t-bare')
    expect(r.state.pending.kind).toBe('deploy')
    expect(r.state.scenario.elementState!['el-flag']!.terrainId).toBeNull()
    expect(events.concat(r.events).find((e) => e.type === 'FlagTerrainChosen')).toMatchObject({ flagId: 'el-flag', terrainId: null })
  })

  it('SR-014 four neutral flags are picked Attacker, Defender, Attacker, Defender, each taking any unresolved flag', () => {
    let { r } = begin('scn-t-pressure')
    const F = r.state.firstPlayer!
    const order: PlayerId[] = []
    const seen: string[] = []
    while (isFlagPending(r.state)) {
      order.push(r.state.pending.player)
      const first = r.state.pending.options![r.state.pending.options!.length - 1]! // always the last flag listed
      seen.push(first.id.split('|')[0]!)
      r = act(r, first.id)
    }
    expect(order).toEqual([F, other(F), F, other(F)])
    expect(new Set(seen).size).toBe(4)
    expect(r.state.pending.kind).toBe('deploy')
  })
})

describe('SR control of scenario terrain (SR9)', () => {
  const trench = () => table('scn-t-trench', 'D')
  const inside = (s: GameState, flag: string, k = 0): Vec2 => { const c = forestOf(s, flag); return { x: c.x - 1 + k * 1.4, z: c.z } }
  it('SR-004 one solo inside the area secures; one trooper does not; two troopers do; two troopers 1" outside do not', () => {
    const s0 = trench()
    const F = s0.firstPlayer!, D = other(F)
    const el = 'el-flag-red' // F's flag terrain, scored by D's models
    expect(ctl(put(s0, mid(D, 'e2'), inside(s0, el)), el)).toMatchObject({ controller: D })
    expect(ctl(put(s0, mid(D, 'u3.1'), inside(s0, el)), el).controller).toBeNull()
    expect(ctl(put(put(s0, mid(D, 'u3.1'), inside(s0, el)), mid(D, 'u3.2'), inside(s0, el, 1)), el).controller).toBe(D)
    const c = forestOf(s0, el)
    const out = (k: number): Vec2 => ({ x: c.x + 3 + baseRadius(30) + 1 + 0.3, z: c.z + k * 1.4 })
    expect(ctl(put(put(s0, mid(D, 'u3.1'), out(0)), mid(D, 'u3.2'), out(1)), el).controller).toBeNull()
  })

  it('SR-004 an enemy model inside the area contests it (a Leader does not)', () => {
    const s0 = trench()
    const F = s0.firstPlayer!, D = other(F)
    const el = 'el-flag-red'
    let s = put(put(s0, mid(D, 'e2'), inside(s0, el)), mid(F, 'e2'), inside(s0, el, 1))
    expect(ctl(s, el)).toMatchObject({ controller: null, contested: true })
    s = put(put(s0, mid(D, 'e2'), inside(s0, el)), mid(F, 'L'), inside(s0, el, 1))
    expect(ctl(s, el).controller).toBe(D)
  })

  it('SR-005 an impassable scenario piece is secured by one Leader within 3" of it', () => {
    const s0 = turn(park(play('scn-t-trench', undefined, { layout: 'layout.scn-t-trench-mono' })), 'B', 2)
    const D = s0.firstPlayer === 'A' ? 'B' : 'A'
    const el = 'el-flag-red'
    expect(s0.scenario.elementState![el]!.terrainId).toBe('f-el-flag-red')
    const c = forestOf(s0, el)
    const near = { x: c.x + 1.25 + 2 + baseRadius(30), z: c.z } // 2" off the 2.5" monolith's side
    expect(ctl(put(s0, mid(D, 'L'), near), el).controller).toBe(D)
    expect(ctl(put(s0, mid(D, 'L'), { x: c.x + 1.25 + 4 + baseRadius(30), z: c.z }), el).controller).toBeNull()
    expect(ctl(put(s0, mid(D, 'e2'), { x: c.x, z: c.z + 1.25 + 0.6 }), el).controller).toBe(D) // a solo within 3": one is enough
  })

  it('SR-005 the flag-obstruction is secured by a Leader within 3" of the flag', () => {
    const s0 = turn(park(play('scn-t-bare')), 'B', 2)
    const D = s0.firstPlayer === 'A' ? 'B' : 'A'
    expect(ctl(put(s0, mid(D, 'L'), { x: 2.5, z: 0 }), 'el-flag').controller).toBe(D)
    expect(ctl(put(s0, mid(D, 'L'), { x: 5, z: 0 }), 'el-flag').controller).toBeNull()
  })

  it('SR-023 the presence tiebreak counts a unit inside area scenario terrain, not one 2" outside it', () => {
    const s0 = table('scn-t-trench', 'D', 7)
    const F = s0.firstPlayer!
    const c = forestOf(s0, 'el-flag-blue')
    const group = (s: GameState, dx: number): GameState => [1, 2, 3].reduce((a, k) => put(a, mid(F, `u3.${k}`), { x: c.x + dx, z: c.z + (k - 2) * 1.2 }), s)
    expect(presenceTotals(group(s0, 0), B, defOf(s0))[F]).toBe(9) // the unit's cost
    expect(presenceTotals(group(s0, 3 + baseRadius(30) + 2), B, defOf(s0))[F]).toBe(0)
  })
})

describe('SR scoring rules', () => {
  it('SR-006 Trench Warfare: your own flag terrain is worth 0, the opponent\'s 2', () => {
    const s0 = table('scn-t-trench', 'D')
    const F = s0.firstPlayer!, D = other(F)
    const c = forestOf(s0, 'el-flag-blue') // the Defender's own flag terrain
    const own = score(put(s0, mid(D, 'e2'), { x: c.x - 1, z: c.z }))
    expect(vpOf(own)[D]).toBe(0)
    const theirs = score(put(s0, mid(F, 'e2'), { x: c.x - 1, z: c.z }))
    expect(vpOf(theirs)[F]).toBe(2)
    expect(types(theirs.events)).toContain('ControlChecked')
  })

  it('SR-007 a cache: a friendly model within 3" of the opponent\'s cache claims it, +2 VP at this turn\'s scoring; own cache and a contested cache are not offered', () => {
    const s0 = table('scn-t-trench', 'D')
    const F = s0.firstPlayer!, D = other(F)
    const theirs = 'el-cache-red' // F's cache, claimable by D
    let s = stand(s0, mid(D, 'e2'), theirs, 2)
    const offers = scenarioSpecialActions(s, B, mid(D, 'e2'))
    expect(offers.map((o) => o.id)).toEqual([`claim:${theirs}:${mid(D, 'e2')}`])
    expect((offers[0]!.action as Any).abilityId).toBe(CLAIM_CACHE_ABILITY)
    expect(scenarioSpecialActions(stand(s0, mid(D, 'e2'), 'el-cache-blue', 2), B, mid(D, 'e2'))).toEqual([]) // D's own cache
    // an enemy trooper within 3" contests it; the enemy Leader does not
    expect(scenarioSpecialActions(stand(s, mid(F, 'u3.1'), theirs, -2), B, mid(D, 'e2'))).toEqual([])
    expect(scenarioSpecialActions(stand(s, mid(F, 'L'), theirs, -2), B, mid(D, 'e2')).length).toBe(1)
    const claim = resolveScenarioSpecialAction(s, B, offers[0]!.action as Any as Parameters<typeof resolveScenarioSpecialAction>[2])
    const done = must(claim)
    expect(types(done.events)).toEqual(['CacheClaimed', 'ElementRemoved'])
    expect(elementPos(done.state, B, theirs)).toBeNull()
    expect(scenarioSpecialActions(done.state, B, mid(D, 'e2'))).toEqual([]) // it is gone
    s = done.state
    const r = score(s)
    expect(vpOf(r)[D]).toBe(2)
    expect(vpOf(r)[F]).toBe(0)
    // next turn's scoring does not bank it again
    expect(vpOf(score(turn(r.state, F, 3)))[D]).toBe(2)
  })

  it('SR-008 no cache claim before the Defender\'s round-2 turn', () => {
    const s0 = table('scn-t-trench', 'F', 2) // the Attacker's round-2 turn: nothing scores yet
    const F = s0.firstPlayer!
    const s = stand(s0, mid(F, 'e2'), 'el-cache-blue', 2)
    expect(scenarioSpecialActions(s, B, mid(F, 'e2'))).toEqual([])
    expect(scenarioSpecialActions(turn(s, F, 3), B, mid(F, 'e2')).length).toBe(1)
  })

  it('SR-009 Earthworks: small and medium warrior models within 3" of their own 40 or 50 get cover and Resistance: Blast', () => {
    const s0 = table('scn-t-trench', 'D')
    const F = s0.firstPlayer!, D = other(F)
    const own50 = F === s0.firstPlayer ? 'el-50-red' : 'el-50-blue'
    let s = stand(s0, mid(F, 'u3.1'), own50, 2)
    expect(scenarioCover(s, B, mid(F, 'u3.1'))).toEqual({ cover: true, resistBlast: true })
    expect(hasGrantedCover(s, B, mid(F, 'u3.1'))).toBe(true)
    expect(resistsDamageType(s, B, mid(F, 'u3.1'), ['blast'])).toBe(true)
    expect(resistsDamageType(s, B, mid(F, 'u3.1'), ['fire'])).toBe(false)
    s = stand(s0, mid(D, 'u3.1'), own50, 2) // the opponent's objective
    expect(scenarioCover(s, B, mid(D, 'u3.1'))).toEqual({ cover: false, resistBlast: false })
    s = stand(s0, mid(F, 'e0'), own50, 3) // a 50 mm warjack: large, and not a warrior
    expect(scenarioCover(s, B, mid(F, 'e0')).cover).toBe(false)
    expect(scenarioCover(stand(s0, mid(F, 'u3.1'), own50, 6), B, mid(F, 'u3.1')).cover).toBe(false) // 6" away
  })

  it('SR-010 Two Fronts: both 40s and the flag terrain are 2 + 1 + 1 = 4 VP', () => {
    const s0 = table('scn-t-two-fronts', 'D')
    const F = s0.firstPlayer!, D = other(F)
    let s = stand(s0, mid(D, 'L'), 'el-40-blue', 2) // a Leader secures one 40
    s = standUnit(s, D, 'el-40-red', 2.5) // a whole unit secures the other
    const c = forestOf(s, 'el-flag')
    s = put(s, mid(D, 'e2'), { x: c.x, z: c.z }) // a solo inside the flag's terrain
    const r = score(s)
    expect(vpOf(r)[D]).toBe(4) // 1 + 1 (the 40s) + 1 (flag) + 1 (both 40s)
    expect(vpOf(r)[F]).toBe(0)
  })

  it('SR-017 Fault Line: two of your own objectives +1, all three +2, two of the opponent\'s no bonus', () => {
    const s0 = table('scn-t-fault', 'D')
    const F = s0.firstPlayer!
    // F's own are the red ones; the active (D) scores both players, so read F's VP
    let s = stand(s0, mid(F, 'e0'), 'el-50-red', 2.5)
    s = stand(s, mid(F, 'L'), 'el-40-red-a', 2)
    expect(vpOf(score(s))[F]).toBe(3) // 2 held + 1 for two
    s = standUnit(s, F, 'el-40-red-b', 2.5)
    expect(vpOf(score(s))[F]).toBe(5) // 3 held + 1 + 1
    let t = stand(s0, mid(F, 'e0'), 'el-50-blue', 2.5)
    t = stand(t, mid(F, 'L'), 'el-40-blue-a', 2)
    expect(vpOf(score(t))[F]).toBe(2) // two of the opponent's: no bonus
  })

  it('SR-014 Pressure Point: the 50 is 2 VP, each flag terrain 1', () => {
    const picks = (s: GameState): string => s.pending.options![0]!.id
    const s0 = table('scn-t-pressure', 'D', 2, picks)
    const F = s0.firstPlayer!
    let s = stand(s0, mid(F, 'e0'), 'el-50', 2.5)
    expect(vpOf(score(s))[F]).toBe(2)
    const tid = s0.scenario.elementState!['el-flag-1']!.terrainId!
    const f = s0.terrain.find((t) => t.id === tid)!
    s = put(s, mid(F, 'e2'), { x: f.pos.x, z: f.pos.z })
    expect(vpOf(score(s))[F]).toBe(3)
  })

  it('SR-021 no scoring before the Defender\'s round-2 turn; the Kill Box starts on the Attacker\'s round-2 turn (all seven)', () => {
    for (const id of Object.keys(SCN)) {
      const s0 = table(id, 'D', 1)
      const F = s0.firstPlayer!
      const def = defOf(s0)
      expect(scoringActive(turn(s0, F, 1), def)).toBe(false)
      expect(scoringActive(turn(s0, other(F), 1), def)).toBe(false)
      expect(scoringActive(turn(s0, F, 2), def)).toBe(false)
      expect(scoringActive(turn(s0, other(F), 2), def)).toBe(true)
      expect(killBoxActive(turn(s0, other(F), 1), def)).toBe(false)
      expect(killBoxActive(turn(s0, F, 2), def)).toBe(true)
    }
  })

  it('SR-020 Payload has no lead-by-3 win; another scenario with a 4 VP lead ends at once', () => {
    const lead = (id: string): GameState => { const s = table(id, 'F', 3); const D = other(s.firstPlayer!); return { ...s, scenario: { ...s.scenario, vp: { ...s.scenario.vp, [D]: 4 } } } }
    expect(score(lead('scn-t-payload')).ended).toBe(false)
    const r = score(lead('scn-t-fault'))
    expect(r.ended).toBe(true)
    expect(r.state.scenario.result).toMatchObject({ reason: 'scenario' })
  })

  it('SR query.control: vpNow follows the scenario rules and the SR elements report removed and moved state', () => {
    const s0 = table('scn-t-fault', 'D')
    const F = s0.firstPlayer!
    const s = stand(s0, mid(F, 'e0'), 'el-50-red', 2.5)
    const rep = query.control(s)
    expect(rep.vpNow[F]).toBe(1)
    expect(rep.elementState).toBeDefined()
    expect(controlReport(s, B).elements['el-50-red']!.controller).toBe(F)
  })
})

describe('SR Wolves at Our Heels', () => {
  it('SR-011 the Kill Box is 12" in round 2, 14" from the Attacker\'s round-3 turn, 22" in round 7, for both players', () => {
    const s0 = table('scn-t-wolves', 'F', 2)
    const F = s0.firstPlayer!, D = other(F)
    const depthAt = (s: GameState): number | undefined => { const r = scenarioTurnStart(s, B); return r.state.scenario.killBoxDepth }
    expect(depthAt(turn(s0, F, 2))).toBeUndefined() // round 2: the scenario's own 12"
    const r3 = scenarioTurnStart(turn(s0, F, 3), B)
    expect(r3.state.scenario.killBoxDepth).toBe(14)
    expect(r3.events).toEqual([{ type: 'KillBoxExtended', depth: 14 }])
    expect(depthAt(turn(s0, D, 3))).toBeUndefined() // the Defender's turn does not extend it
    expect(depthAt(turn(s0, F, 7))).toBe(22)
    expect(depthAt(turn(s0, F, 5))).toBe(18)
    // a Leader 13" off the edge is out of the box at 12 and in it at 14, for either player
    const def = defOf(s0)
    const edge = s0.players[F].edge
    expect(edge).toBe('north')
    const s = put(turn(s0, F, 3), mid(F, 'L'), { x: 0, z: -24 + 13 })
    expect(inKillBox(s, def, F)).toBe(false)
    expect(inKillBox(scenarioTurnStart(s, B).state, def, F)).toBe(true)
    const sd = put(scenarioTurnStart(turn(s0, F, 3), B).state, mid(D, 'L'), { x: 0, z: 24 - 13 })
    expect(inKillBox(sd, def, D)).toBe(true)
  })

  const wolves = (): { s: GameState; F: PlayerId; D: PlayerId } => {
    const s0 = table('scn-t-wolves', 'D', 2)
    const F = s0.firstPlayer!
    return { s: s0, F, D: other(F) }
  }
  it('SR-012 securing your own 40 offers a token; after one the opponent may move the objective 3" toward the same colour 50', () => {
    const { s: s0, F, D } = wolves()
    // D is active; D's own 40 is the blue one. D's unit secures it.
    const s = standUnit(s0, D, 'el-40-blue', 2.5)
    const out = score(s)
    expect(out.pending!.context.data!.code).toBe('heelToken')
    expect(out.pending!.player).toBe(D)
    const yes = answer(out.state, out.pending!.options!.find((o) => o.id === 'yes')!.action)
    expect(yes.pending!.context.data!.code).toBe('heelMove')
    expect(yes.pending!.player).toBe(F) // the opponent decides
    expect(yes.state.scenario.elementState!['el-40-blue']!.tokens).toBe(1)
    const from = pos(yes.state, 'el-40-blue')
    const mv = answer(yes.state, yes.pending!.options!.find((o) => o.id === 'move')!.action)
    expect(mv.pending).toBeNull()
    const to = pos(mv.state, 'el-40-blue')
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeCloseTo(3, 1)
    const fifty = pos(mv.state, 'el-50-blue')
    expect(Math.hypot(to.x - fifty.x, to.z - fifty.z)).toBeLessThan(Math.hypot(from.x - fifty.x, from.z - fifty.z))
    expect(types(mv.events)).toContain('ElementMoved')
  })

  it('SR-012 the objective stops short of an obstruction it cannot move completely past', () => {
    const { s: s0, D } = wolves()
    let s = standUnit(s0, D, 'el-40-blue', 2.5)
    // a big monolith-like blocker: park a model so the full 3" move would end on it
    const from = pos(s, 'el-40-blue'), fifty = pos(s, 'el-50-blue')
    const d = Math.hypot(fifty.x - from.x, fifty.z - from.z)
    const u = { x: (fifty.x - from.x) / d, z: (fifty.z - from.z) / d }
    s = put(s, mid(other(D), 'L'), { x: from.x + u.x * 3.0, z: from.z + u.z * 3.0 }) // a base right where the 40 would end (a Leader does not contest)
    const out = score(s)
    const yes = answer(out.state, out.pending!.options!.find((o) => o.id === 'yes')!.action)
    const mv = answer(yes.state, yes.pending!.options!.find((o) => o.id === 'move')!.action)
    const to = pos(mv.state, 'el-40-blue')
    const moved = Math.hypot(to.x - from.x, to.z - from.z)
    expect(moved).toBeLessThan(3)
    expect(moved).toBeLessThan(3 - 1) // stopped short of the base, not on it
  })

  it('SR-013 the token race: the only player to reach 3 gets +3 once; both at the same point get nothing and the race is over', () => {
    const { s: s0, F, D } = wolves()
    const withTokens = (s: GameState, id: string, n: number): GameState => ({ ...s, scenario: { ...s.scenario, elementState: { ...s.scenario.elementState, [id]: { ...s.scenario.elementState?.[id], tokens: n } } } })
    let s = withTokens(standUnit(s0, D, 'el-40-blue', 2.5), 'el-40-blue', 2)
    let r = settle(score(s), { heelToken: 'yes', heelMove: 'stay' })
    expect(r.state.scenario.elementState!['el-40-blue']!.tokens).toBe(3)
    expect(vpOf(r)[D]).toBe(3 + 1) // the race, and the 40 itself
    expect(r.state.scenario.onceDone).toContain('tokenRace')
    // and never again
    r = settle(score(turn(r.state, D, 3)), { heelToken: 'yes', heelMove: 'stay' })
    expect(r.state.scenario.vp[D]).toBe(3 + 1 + 1)
    // both reach 3 at the same scoring point
    s = withTokens(withTokens(standUnit(standUnit(s0, D, 'el-40-blue', 2.5), F, 'el-40-red', 2.5), 'el-40-blue', 2), 'el-40-red', 2)
    r = settle(score(s), { heelToken: 'yes', heelMove: 'stay' })
    expect(r.state.scenario.elementState!['el-40-blue']!.tokens).toBe(3)
    expect(r.state.scenario.elementState!['el-40-red']!.tokens).toBe(3)
    expect(vpOf(r)[D]).toBe(1)
    expect(vpOf(r)[F]).toBe(1)
    expect(r.state.scenario.onceDone).toContain('tokenRace')
  })

  it('SR-012 the engine routes the scoring decisions: step() takes the answers and finishes the turn, legalActions is never empty', () => {
    const { s: s0, D } = wolves()
    const s = standUnit(s0, D, 'el-40-blue', 2.5)
    const fo = finishActivations(s)
    let r = step(fo.state, fo.pending.options![0]!.action)
    expect(r.rejection).toBeUndefined()
    expect(r.state.pending.context.data!.code).toBe('heelToken')
    expect(isScoringDecision(r.state)).toBe(true)
    expect(types(r.events)).not.toContain('TurnEnded') // the turn is still open
    expect(legalActions(r.state).length).toBeGreaterThan(1)
    expect(legalActions(r.state).some((a) => a.type === 'pass')).toBe(true)
    r = step(r.state, { type: 'pass', decisionId: r.state.pending.id, player: D })
    expect(r.rejection).toBeUndefined()
    expect(types(r.events)).toContain('TurnEnded')
    expect(isScoringDecision(r.state)).toBe(false)
    expect(r.state.activePlayer).toBe(s.firstPlayer) // next round, the Attacker
    expect(r.state.round).toBe(3)
    expect(validate(r.state, { type: 'abilityChoice', decisionId: 'd:0', player: D, optionId: 'yes' })).not.toBeNull()
  })
})

describe('SR High Stakes: the fuse', () => {
  const stakes = (): { s: GameState; F: PlayerId; D: PlayerId } => {
    const s0 = table('scn-t-stakes', 'D', 2)
    const F = s0.firstPlayer!
    return { s: s0, F, D: other(F) }
  }
  const setTokens = (s: GameState, t: Record<string, number>): GameState => ({ ...s, scenario: { ...s.scenario, elementState: Object.fromEntries(Object.entries({ ...s.scenario.elementState }).map(([k, v]) => [k, { ...v, ...(t[k] !== undefined ? { tokens: t[k] } : {}) }])) } })
  const tok = (s: GameState, id: string) => s.scenario.elementState![id]!.tokens!

  it('SR-015 five tokens at setup; the player securing the 50 removes d3 from an element that has tokens', () => {
    const { s: s0, D } = stakes()
    expect(tok(s0, 'el-50')).toBe(5)
    expect(tok(s0, 'el-flag-blue')).toBe(5)
    const s = stand(s0, mid(D, 'e0'), 'el-50', 2.5)
    const out = score(s)
    expect(out.pending!.context.data!.code).toBe('fuse')
    expect(out.pending!.player).toBe(D)
    expect(out.pending!.options!.map((o) => o.id).sort()).toEqual(['el-50', 'el-flag-blue', 'el-flag-red'])
    const done = answer(out.state, out.pending!.options!.find((o) => o.id === 'el-flag-red')!.action)
    expect(done.pending).toBeNull()
    expect(tok(done.state, 'el-flag-red')).toBeGreaterThanOrEqual(2)
    expect(tok(done.state, 'el-flag-red')).toBeLessThanOrEqual(4)
    expect(types(done.events)).toContain('ElementTokensChanged')
    expect(vpOf(done)[D]).toBe(1) // the 50 itself
  })

  it('SR-015 nobody securing the 50: a d3 picks the blue terrain, the red terrain or the 50 and one token comes off', () => {
    const { s: s0 } = stakes()
    const out = score(s0)
    expect(out.pending).toBeNull()
    const ch = out.events.filter((e) => e.type === 'ElementTokensChanged') as Any[]
    expect(ch.length).toBe(1)
    expect(ch[0].delta).toBe(-1)
    expect(['el-flag-blue', 'el-flag-red', 'el-50']).toContain(ch[0].elementId)
    expect(types(out.events)).toContain('DiceRolled')
  })

  it('SR-015 an element at 0 cannot be chosen; with every element at 0 nothing happens', () => {
    const { s: s0, D } = stakes()
    const s = stand(setTokens(s0, { 'el-flag-red': 0 }), mid(D, 'e0'), 'el-50', 2.5)
    expect(score(s).pending!.options!.map((o) => o.id).sort()).toEqual(['el-50', 'el-flag-blue'])
    const dead = setTokens(s0, { 'el-flag-red': 0, 'el-flag-blue': 0, 'el-50': 0 })
    const out = score(stand(dead, mid(D, 'e0'), 'el-50', 2.5))
    expect(out.pending).toBeNull()
    expect(types(out.events)).not.toContain('ElementTokensChanged')
  })

  it('SR-016 an element reaching 0 detonates once: a POW 14 blast roll on each model within 3", then +1 VP while secured at 0', () => {
    const { s: s0, F, D } = stakes()
    let s = setTokens(s0, { 'el-50': 1 })
    s = stand(s, mid(D, 'e0'), 'el-50', 2.5)
    s = stand(s, mid(F, 'L'), 'el-50', -2.0) // an enemy Leader on the other side (it cannot contest), friend and foe both get it
    s = stand(s, mid(F, 'u3.1'), 'el-50', 0, 12) // far away: spared
    const out = score(s)
    expect(out.pending!.context.data!.code).toBe('fuse')
    const done = answer(out.state, out.pending!.options!.find((o) => o.id === 'el-50')!.action)
    expect(tok(done.state, 'el-50')).toBe(0)
    expect(types(done.events)).toContain('ElementDetonated')
    const blast = done.events.filter((e) => e.type === 'DamageApplied' || e.type === 'DiceRolled').length
    expect(blast).toBeGreaterThan(1)
    const hit = (id: string): boolean => done.events.some((e) => (e as Any).modelId === id || (e as Any).targetId === id || (e as Any).ownerId === id)
    expect(hit(mid(D, 'e0'))).toBe(true)
    expect(hit(mid(F, 'L'))).toBe(true)
    expect(hit(mid(F, 'u3.1'))).toBe(false)
    expect(done.state.scenario.onceDone).toContain('detonated:el-50')
    // D secures the 50 at 0: control 1 + zero-token bonus 1
    expect(vpOf(done)[D]).toBeGreaterThanOrEqual(2)
    const scored = done.events.find((e) => e.type === 'ScenarioScored' && (e as Any).player === D) as Any
    expect(scored.sources.map((x: Any) => x.vp).reduce((a: number, b: number) => a + b, 0)).toBe(scored.delta)
    // never detonates twice
    const again = score(turn(done.state, F, 3))
    expect(types(again.events)).not.toContain('ElementDetonated')
  })
})

describe('SR Payload', () => {
  const payload = (): { s: GameState; F: PlayerId; D: PlayerId } => {
    const s0 = table('scn-t-payload', 'D', 2)
    const F = s0.firstPlayer!
    return { s: s0, F, D: other(F) }
  }
  const moveTo = (s: GameState, el: string, p: Vec2): GameState => ({ ...s, scenario: { ...s.scenario, elementState: { ...s.scenario.elementState, [el]: { ...s.scenario.elementState?.[el], pos: p } } } })

  it('SR-018 your own 50 secured plus one other objective: a move of 0 to 4" toward the opponent\'s flag terrain', () => {
    const { s: s0, D } = payload()
    // D is active: D's own 50 is the blue one, its 40 the blue one
    let s = stand(s0, mid(D, 'e0'), 'el-50-blue', 2.5)
    let out = score(s)
    expect(out.pending!.context.data!.code).toBe('payload')
    expect(out.pending!.options!.map((o) => o.id)).toEqual(['d0', 'd1', 'd2', 'd3']) // 3" alone
    s = stand(s, mid(D, 'L'), 'el-40-blue', 2)
    out = score(s)
    expect(out.pending!.options!.map((o) => o.id)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4'])
    const from = pos(out.state, 'el-50-blue')
    const done = answer(out.state, out.pending!.options!.find((o) => o.id === 'd4')!.action)
    const to = pos(done.state, 'el-50-blue')
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeCloseTo(4, 1)
    expect(types(done.events)).toContain('ElementMoved')
  })

  it('SR-018 a 50 that ends its move inside the opponent\'s flag terrain scores 3 VP at once and is removed', () => {
    const { s: s0, F, D } = payload()
    const flagTerrain = forestOf(s0, 'el-flag-red') // F's flag terrain: D delivers into it
    let s = moveTo(s0, 'el-50-blue', { x: flagTerrain.x, z: flagTerrain.z - 6.2 }) // 3.2" short of the forest edge, in the 3" + reach
    s = stand(s, mid(D, 'e0'), 'el-50-blue', 2.5)
    const out = score(s)
    expect(out.pending!.context.data!.code).toBe('payload')
    const vp0 = vpOf(out)[D]
    const done = answer(out.state, out.pending!.options!.find((o) => o.id === 'd3')!.action)
    expect(types(done.events)).toContain('ElementRemoved')
    expect((done.events.find((e) => e.type === 'ElementRemoved') as Any).reason).toBe('delivered')
    expect(elementPos(done.state, B, 'el-50-blue')).toBeNull()
    expect(vpOf(done)[D]).toBe(vp0 + 3)
    void F
  })

  it('SR-019 Made To Haul: after moving your 50 on your own turn one Cohort model may move up to 5" straight toward it; the other player gets no haul', () => {
    const { s: s0, F, D } = payload()
    let s = stand(s0, mid(D, 'e0'), 'el-50-blue', 2.5)
    s = put(s, mid(D, 'e1'), { x: pos(s, 'el-50-blue').x + 12, z: pos(s, 'el-50-blue').z })
    const out = score(s)
    const moved = answer(out.state, out.pending!.options!.find((o) => o.id === 'd2')!.action)
    expect(moved.pending!.kind).toBe('moveModel')
    expect(moved.pending!.context.data!.code).toBe('haul')
    expect(moved.pending!.player).toBe(D)
    const opt = moved.pending!.options!.find((o) => o.id === `haul:${mid(D, 'e1')}`)!
    const m0 = moved.state.models[mid(D, 'e1')]!
    const after = answer(moved.state, opt.action)
    expect(after.pending?.context.data?.code).not.toBe('haul')
    const m1 = after.state.models[mid(D, 'e1')]!
    const fifty = pos(after.state, 'el-50-blue')
    const travelled = Math.hypot(m1.pos.x - m0.pos.x, m1.pos.z - m0.pos.z)
    expect(travelled).toBeGreaterThan(4.5)
    expect(travelled).toBeLessThanOrEqual(5.01)
    expect(Math.hypot(m1.pos.x - fifty.x, m1.pos.z - fifty.z)).toBeLessThan(Math.hypot(m0.pos.x - fifty.x, m0.pos.z - fifty.z))
    // a wrong point is rejected
    expect(() => answer(moved.state, { type: 'moveModel', decisionId: moved.pending!.id, player: D, modelId: mid(D, 'e1'), path: [{ x: m0.pos.x, z: m0.pos.z - 4 }] })).toThrow(/rejected/)
    // the non-active player moving their own 50 gets the offer but no haul afterwards
    let s2 = stand(turn(s0, F, 3), mid(D, 'e0'), 'el-50-blue', 2.5) // the Attacker's turn: D is the other player
    s2 = put(s2, mid(D, 'e1'), { x: pos(s2, 'el-50-blue').x + 12, z: pos(s2, 'el-50-blue').z })
    const out2 = score(s2)
    expect(out2.pending!.player).toBe(D)
    const mv2 = answer(out2.state, out2.pending!.options!.find((o) => o.id === 'd2')!.action)
    expect(mv2.pending).toBeNull()
  })
})

describe('SR game flow', () => {
  it('SR-003 a plain game: createGame with no cards leaves players.cards unset (CARD-001)', () => {
    const s = play('scn-t-fault')
    expect(s.players.A.cards).toBeUndefined()
    expect(s.players.B.cards).toBeUndefined()
  })

  it('CARD-002 a hand of six cards, a duplicate or an army card for a list without the army fails createGame with E_BAD_SETUP; a good hand is stored', () => {
    const U = ['core.card.bite-and-hold', 'core.card.blessings-of-the-gods', 'core.card.careful-reconnaissance', 'core.card.duck-and-cover', 'core.card.put-the-fires-out']
    const mk = (cards: Partial<Record<PlayerId, string[]>>, lists = { A: 't.l.sk-a', B: 't.l.sk-b' }) => createGame({ scenario: 'scn-t-fault', lists, cards }, 'c1', B)
    expect(mk({ A: [...U, 'kha.card.for-the-motherland'] }).rejection?.code).toBe('E_BAD_SETUP')
    expect(mk({ A: [U[0]!, U[0]!] }).rejection?.code).toBe('E_BAD_SETUP')
    expect(mk({ A: [U[0]!, 'kha.card.for-the-motherland'] }).rejection?.code).toBe('E_BAD_SETUP') // list a has no army
    const ok = mk({ A: U, B: [U[1]!] })
    expect(ok.rejection).toBeUndefined()
    expect(ok.state.players.A.cards).toEqual({ hand: U, played: [] })
    expect(ok.state.players.B.cards).toEqual({ hand: [U[1]], played: [] })
    expect(mk({ A: [U[0]!, 'kha.card.for-the-motherland'] }, { A: 't.l.sk-kha', B: 't.l.sk-b' }).rejection).toBeUndefined()
  })

  it('CLK-010 a clocked-out player is judged at the end of the active turn: no VP lead is an assassination of their Leader', () => {
    const s0 = play('scn-t-fault')
    const F = s0.firstPlayer!, D = other(F)
    const s = { ...s0, scenario: { ...s0.scenario, clockOut: D } }
    const fo = finishActivations(turn(s, F, 1))
    const r = step(fo.state, fo.pending.options![0]!.action)
    expect(r.rejection).toBeUndefined()
    expect(r.state.scenario.result).toMatchObject({ winner: F, reason: 'assassination', timeout: D })
  })

  it('SR Wolves: the engine grows the Kill Box when the Attacker\'s round-3 turn begins (turn flow)', () => {
    const s0 = table('scn-t-wolves', 'D', 2)
    const F = s0.firstPlayer!
    const fo = finishActivations(s0) // the Defender ends round 2
    const r = step(fo.state, fo.pending.options![0]!.action)
    expect(r.rejection).toBeUndefined()
    expect(r.state.round).toBe(3)
    expect(r.state.activePlayer).toBe(F)
    expect(r.state.scenario.killBoxDepth).toBe(14)
    expect(types(r.events)).toContain('KillBoxExtended')
  })

  it('SR near-element test: inside area scenario terrain, or within 3" of an objective, a cache or a flag-obstruction', () => {
    const s0 = table('scn-t-trench', 'D')
    const F = s0.firstPlayer!
    const c = forestOf(s0, 'el-flag-red')
    expect(nearScenarioElement(put(s0, mid(F, 'e2'), { x: c.x, z: c.z }), B, mid(F, 'e2'))).toBe(true)
    expect(nearScenarioElement(put(s0, mid(F, 'e2'), { x: c.x + 3 + 2, z: c.z }), B, mid(F, 'e2'))).toBe(false) // outside an area piece is not near it
    expect(nearScenarioElement(stand(s0, mid(F, 'e2'), 'el-50-red', 2.5), B, mid(F, 'e2'))).toBe(true)
    expect(nearScenarioElement(stand(s0, mid(F, 'e2'), 'el-50-red', 8), B, mid(F, 'e2'))).toBe(false)
    expect(nearScenarioElement(stand(s0, mid(F, 'e2'), 'el-cache-red', 2), B, mid(F, 'e2'))).toBe(true)
    const bare = turn(park(play('scn-t-bare')), 'B', 2)
    expect(nearScenarioElement(put(bare, mid('A', 'e2'), { x: 2.5, z: 0 }), B, mid('A', 'e2'))).toBe(true)
    expect(nearScenarioElement(put(bare, mid('A', 'e2'), { x: 5, z: 0 }), B, mid('A', 'e2'))).toBe(false)
  })

  it('SR-021 a Steamroller game plays turns end to end with the scoring machine (random first options, no rejections)', () => {
    let s = play('scn-t-fault')
    let r: StepResult = { state: s, events: [], pending: s.pending }
    for (let i = 0; i < 400 && r.state.phase !== 'ended' && r.state.round <= 3; i++) {
      const legal = legalActions(r.state)
      expect(legal.length).toBeGreaterThan(0)
      // prefer ending the turn so the scoring machine runs every turn
      const a = legal.find((x) => x.type === 'endTurn') ?? legal.find((x) => x.type === 'pass') ?? legal[0]!
      r = step(r.state, a)
      expect(r.rejection).toBeUndefined()
    }
    s = r.state
    expect(s.round).toBeGreaterThanOrEqual(2)
  })
})

describe('SR sim', () => {
  for (const id of Object.keys(SCN).filter((x) => x !== 'scn-t-bare')) {
    it(`SR-024 ${id}: bot vs bot games end with no invariant violations and every offered scoring answer is legal`, () => {
      for (let g = 0; g < 2; g++) {
        const r = runGame(g, { seed: `sr-${id}`, scenario: id, cap: 6000, stall: 300, wallMs: 60_000, lists: ['t.l.sk-a', 't.l.sk-b'], size: 'skirmish' }, B)
        expect(r.violations).toEqual([])
        expect(r.summary.ended).toBe(true)
      }
    }, 120_000)
  }
})

describe('SR runtime element state', () => {
  const sticky = (s: GameState, el: string, player: PlayerId, turnNo = s.turn): GameState =>
    ({ ...s, scenario: { ...s.scenario, elementState: { ...s.scenario.elementState, [el]: { ...s.scenario.elementState?.[el], stickyHold: { player, round: s.round, turn: turnNo } } } } })
  it('CARD-016 a sticky hold keeps the element for this turn only, and an eligible enemy within 3" breaks it (a Leader does not)', () => {
    const s0 = table('scn-t-fault', 'D')
    const F = s0.firstPlayer!, D = other(F)
    const held = sticky(s0, 'el-40-red-a', D) // D keeps it for this turn although nobody stands there
    expect(ctl(held, 'el-40-red-a')).toMatchObject({ controller: D })
    expect(vpOf(score(held))[D]).toBe(1)
    expect(ctl(stand(held, mid(F, 'u3.1'), 'el-40-red-a', 2), 'el-40-red-a').controller).toBeNull() // an enemy trooper contests
    expect(ctl(stand(held, mid(F, 'L'), 'el-40-red-a', 2), 'el-40-red-a').controller).toBe(D) // an enemy Leader holds it, but cannot contest
    expect(ctl({ ...held, turn: held.turn + 2 }, 'el-40-red-a').controller).toBeNull() // the next turn it is gone
  })

  it('SCN-026 the SR9 hold default applies to the scenarios that score from the Defender\'s round 2 only; Ashwall Divide keeps its explicit Quick Start hold', () => {
    const flag = defOf(table('scn-t-trench', 'D')).elements.find((e) => e.id === 'el-flag-red')!
    expect(flag.hold).toMatchObject({ within: 3, models: 2, eligible: ['any'], single: ['leader', 'solo'], mode: 'area' })
    const w = scenarioDef(real, 'scn-ashwall-divide').elements[0]!
    expect(w.hold.single).toBeUndefined()
    expect(w.hold.mode).toBeUndefined()
    expect(w.hold.within).toBe(2)
  })

  it('SR elementState is absent for a game that does not use it, and the plain scenarios score exactly as before', () => {
    const s = must(createGame({ scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }, 's', real))
    expect(s.state.scenario.elementState).toBeUndefined()
    expect(s.state.scenario.killBoxDepth).toBeUndefined()
    expect(s.state.scenario.cachesClaimed).toBeUndefined()
  })
})

describe('SR cache claims through step()', () => {
  it('SR-007 a human claim of the cache from the Combat Action decision is accepted by step() (the option carries the open decision id)', () => {
    const s0 = table('scn-t-trench', 'D')
    const F = s0.firstPlayer!, D = other(F)
    const e = mid(D, 'e2')
    let s = stand(s0, e, 'el-cache-red', 2)
    s = { ...s, phase: 'activation', activePlayer: D, pending: { ...s.pending, kind: 'chooseActivation', player: D, id: 'd:900', options: [], canPass: false }, decisionSeq: 900 }
    const go = (st: StepResult, a: Record<string, unknown>): StepResult => {
      const r = step(st.state, { ...a, decisionId: st.state.pending.id, player: st.state.pending.player } as unknown as Action)
      if (r.rejection) throw new Error(`rejected ${JSON.stringify(r.rejection)} on ${String(a.type)}`)
      return r
    }
    let r: StepResult = { state: s, events: [], pending: s.pending }
    r = go(r, { type: 'chooseActivation', activate: e })
    r = go(r, { type: 'chooseMovement', option: 'forfeit', modelId: e })
    expect(r.state.pending.kind).toBe('chooseCombatAction')
    const claim = r.state.pending.options!.find((o) => (o.action as Any).abilityId === CLAIM_CACHE_ABILITY)
    expect(claim, 'the claim is offered').toBeDefined()
    expect(claim!.action.decisionId).toBe(r.state.pending.id)
    expect(legalActions(r.state).some((a) => (a as Any).abilityId === CLAIM_CACHE_ABILITY)).toBe(true)
    const done = step(r.state, claim!.action)
    expect(done.rejection).toBeUndefined()
    expect(types(done.events)).toContain('CacheClaimed')
    expect(done.state.scenario.cachesClaimed).toHaveLength(1)
  })
})

describe('SR terrain drops at setup', () => {
  it('SR-010 setup omits the layout pieces droppedPieces names (an impassable piece within the clearance of an objective), and keeps the rest', () => {
    const scn = 'scn-sr26-trench-warfare'
    const layout = 'layout.bog-1-48'
    const dropped = droppedPieces(real, scn, layout)
    expect(dropped.length).toBeGreaterThan(0)
    const r = createGame({ scenario: scn, lists: { A: 'kha.l.skirmish', B: 'cyg.l.skirmish' }, layout }, 'sr-drop', real)
    expect(r.rejection).toBeUndefined()
    const ids = r.state.terrain.map((t) => t.id)
    for (const d of dropped) expect(ids).not.toContain(d)
    expect(ids.length).toBe((real.byId[layout] as Any).pieces.length - dropped.length)
  })
})
