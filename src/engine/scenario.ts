// 11-scenarios: element control, scoring, Kill Box, assassination, lead-by-3, round limit, tiebreakers. Pure.
import { expireCasterEffects, markInertCohorts, otherPlayer, profileOf, type Profile } from './effects'
import type { GameEvent } from './events'
import { baseRadius, isOnTable } from './geometry'
import { modelToPoint } from './measure'
import { distToShape, worldShape } from './terrain'
import type {
  DataBundle, ElementControl, GameEndReason, GameState, Id, ModelId, ModelState, PlayerId, ScenarioState, TerrainInstance, Vec2,
} from './types'

// ---------- scenario data ----------
export interface ElementDef {
  id: Id
  kind: 'objective50' | 'objective40' | 'flag' | 'scenarioTerrain' | 'zone'
  pos: Vec2
  terrain?: Id
  hold: { within: number; models: number; eligible: string[] }
  contest: { within: number; excludes: string[] }
  vp: { control: number }
}
export interface ScoringDef { fromRound: number; fromPlayer: 'first' | 'second'; winMargin: number; winOnOpponentTurnOnly: boolean; leaderPresence: number }
export interface KillBoxDef { fromRound: number; fromPlayer: 'first' | 'second'; depth: number; vp: number }
export interface ScenarioDef {
  id: Id
  table: { w: number; d: number }
  rounds: number
  deployment: { first: number; second: number; advance: number; unitSpread: number }
  scoring: ScoringDef
  killBox?: KillBoxDef
  elements: ElementDef[]
}

const DEFAULT_SCORING: ScoringDef = { fromRound: 1, fromPlayer: 'first', winMargin: 3, winOnOpponentTurnOnly: true, leaderPresence: 10 }

/** Read the scenario record and fill the per-kind defaults of 20-data-schema section 7. */
export function scenarioDef(bundle: DataBundle, scenarioId: Id): ScenarioDef {
  const r = bundle.byId[scenarioId] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!r) throw new Error(`scenario '${scenarioId}' not in bundle`)
  const elements: ElementDef[] = ((r.elements ?? []) as Record<string, any>[]).map((e) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const kind = e.kind as ElementDef['kind']
    const holdDefault =
      kind === 'objective50' ? { within: 3, models: 1, eligible: ['leader', 'warEngine', 'battleEngine'] }
        : kind === 'objective40' ? { within: 3, models: 1, eligible: ['leader', 'unitAll'] }
          : { within: 3, models: 2, eligible: ['any'] }
    return {
      id: e.id, kind, pos: e.pos ?? { x: 0, z: 0 }, terrain: e.terrain,
      hold: { ...holdDefault, ...(e.hold ?? {}) },
      contest: { within: 3, excludes: ['leader', 'inert', 'disabled', 'wild'], ...(e.contest ?? {}) },
      vp: { control: e.vp?.control ?? 1 },
    }
  })
  return {
    id: r.id, table: r.table ?? { w: 36, d: 36 }, rounds: r.rounds ?? 7,
    deployment: { advance: 3, unitSpread: 3, ...r.deployment },
    scoring: { ...DEFAULT_SCORING, ...(r.scoring ?? {}) },
    killBox: r.killBox, elements,
  }
}

/**
 * G6: a swapped layout must carry every terrain anchor the scenario's elements name (an element's `terrain` is a piece id of the
 * scenario's own layout). The piece must have the same rules type, footprint and height as the scenario's own piece, at the same
 * position and rotation, so control measures exactly as designed. Returns one message per problem; [] means the layout is usable.
 */
export function scenarioAnchorProblems(bundle: DataBundle, scenarioId: Id, layoutId: Id): string[] {
  const sc = bundle.byId[scenarioId] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  const lay = bundle.byId[layoutId] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!sc) return [`unknown scenario '${scenarioId}'`]
  if (!lay) return [`unknown layout '${layoutId}'`]
  const own = bundle.byId[sc.terrainLayout as string] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  const problems: string[] = []
  if (sc.table && lay.table && (sc.table.w !== lay.table.w || sc.table.d !== lay.table.d)) problems.push(`layout table ${lay.table.w}x${lay.table.d} does not match the scenario's ${sc.table.w}x${sc.table.d}`)
  if (layoutId === sc.terrainLayout) return problems
  const find = (l: Record<string, any> | undefined, id: string) => ((l?.pieces ?? []) as Record<string, any>[]).find((p) => p.id === id) // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const e of (sc.elements ?? []) as Record<string, any>[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (e.kind !== 'scenarioTerrain' || typeof e.terrain !== 'string') continue
    const want = find(own, e.terrain), got = find(lay, e.terrain)
    if (!got) { problems.push(`layout '${layoutId}' has no piece '${e.terrain}' (anchor of element '${e.id}')`); continue }
    if (!want) continue
    const a = bundle.byId[want.terrain] as Record<string, any> | undefined, c = bundle.byId[got.terrain] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
    const same = a && c && a.rulesType === c.rulesType && a.height === c.height && JSON.stringify(a.footprint) === JSON.stringify(c.footprint)
    if (!same) problems.push(`anchor '${e.terrain}' in '${layoutId}' differs in rules type, footprint or height`)
    if (Math.abs(want.pos.x - got.pos.x) > 1e-9 || Math.abs(want.pos.z - got.pos.z) > 1e-9 || Math.abs((want.rot ?? 0) - (got.rot ?? 0)) > 1e-9) problems.push(`anchor '${e.terrain}' in '${layoutId}' is not at the scenario's position and rotation`)
  }
  return problems
}

export function initialScenarioState(def: ScenarioDef): ScenarioState {
  return {
    id: def.id, table: def.table, vp: { A: 0, B: 0 },
    elements: Object.fromEntries(def.elements.map((e) => [e.id, { controller: null, contested: false, holders: [], contesters: [], reason: 'not yet checked' }])),
    killBox: { A: false, B: false }, log: [],
  }
}

// ---------- element control (V2) ----------
const elementRadius = (k: ElementDef['kind']): number => (k === 'objective50' ? baseRadius(50) : k === 'objective40' ? baseRadius(40) : k === 'flag' ? baseRadius(30) : 0)

/** Distance from a model's base edge to the element (to its terrain piece, or to its point). */
function distanceToElement(state: GameState, el: ElementDef, m: ModelState): number {
  if (el.kind === 'scenarioTerrain' && el.terrain) {
    const t: TerrainInstance | undefined = state.terrain.find((x) => x.id === el.terrain || x.pieceId === el.terrain)
    if (t) return Math.max(0, distToShape(m.pos, worldShape(t)) - baseRadius(m.base))
  }
  return Math.max(0, modelToPoint(m, el.pos) - elementRadius(el.kind))
}

const live = (m: ModelState): boolean => isOnTable(m) && !m.inert && !m.conditions.includes('inert')
const unitOf = (state: GameState, m: ModelState) => (m.unitId ? state.units[m.unitId] : undefined)

function eligibleToHold(token: string, m: ModelState): boolean {
  switch (token) {
    case 'any': return true
    case 'leader': return m.type === 'leader'
    case 'warEngine': return m.type === 'warEngine'
    case 'battleEngine': return m.type === 'battleEngine'
    case 'solo': return m.type === 'solo'
    default: return false
  }
}

/** Models of `player` that satisfy the element's hold rule, or [] when it is not held. */
function holders(state: GameState, el: ElementDef, player: PlayerId): ModelId[] {
  const near = Object.values(state.models).filter((m) => m.owner === player && live(m) && distanceToElement(state, el, m) <= el.hold.within + 1e-6)
  if (el.hold.eligible.includes('any')) return near.length >= el.hold.models ? near.map((m) => m.id) : []
  const direct = near.filter((m) => el.hold.eligible.some((t) => eligibleToHold(t, m)))
  if (direct.length >= el.hold.models) return direct.map((m) => m.id)
  if (el.hold.eligible.includes('unitAll')) {
    for (const u of Object.values(state.units)) {
      if (u.owner !== player) continue
      const troopers = u.troopers.map((id) => state.models[id]!).filter((m) => m && m.life === 'active')
      if (troopers.length > 0 && troopers.every((m) => live(m) && distanceToElement(state, el, m) <= el.hold.within + 1e-6)) return troopers.map((m) => m.id)
    }
  }
  return []
}

function contesters(state: GameState, el: ElementDef, against: PlayerId): ModelId[] {
  const ex = el.contest.excludes
  return Object.values(state.models)
    .filter((m) => m.owner === against && live(m)
      && !(ex.includes('leader') && m.type === 'leader') && !ex.includes(m.type)
      && distanceToElement(state, el, m) <= el.contest.within + 1e-6)
    .map((m) => m.id)
}

/** V2: who controls each element right now (not persistent; evaluated at scoring time). */
export function computeControl(state: GameState, def: ScenarioDef): Record<Id, ElementControl> {
  const out: Record<Id, ElementControl> = {}
  for (const el of def.elements) {
    const hA = holders(state, el, 'A'), hB = holders(state, el, 'B')
    const cA = contesters(state, el, 'A'), cB = contesters(state, el, 'B')
    const aOk = hA.length > 0 && cB.length === 0
    const bOk = hB.length > 0 && cA.length === 0
    const controller: PlayerId | null = aOk && !bOk ? 'A' : bOk && !aOk ? 'B' : null
    const contested = controller === null && (hA.length > 0 || hB.length > 0)
    out[el.id] = {
      controller, contested,
      holders: controller === 'A' ? hA : controller === 'B' ? hB : [],
      contesters: controller === 'A' ? cB : controller === 'B' ? cA : [...cA, ...cB],
      reason: controller ? `${controller} holds it` : contested ? 'contested' : 'nobody holds it',
    }
  }
  return out
}

// ---------- scoring ----------
const isFirst = (state: GameState, p: PlayerId): boolean => state.firstPlayer === p

/** V1.2: scoring happens at the end of every player turn from the scenario's first scoring point. */
export function scoringActive(state: GameState, def: ScenarioDef): boolean {
  const s = def.scoring
  if (state.round > s.fromRound) return true
  if (state.round < s.fromRound) return false
  return s.fromPlayer === 'first' || !isFirst(state, state.activePlayer)
}

export function inKillBox(state: GameState, def: ScenarioDef, player: PlayerId): boolean {
  const kb = def.killBox
  const edge = state.players[player].edge
  const leader = state.models[state.players[player].leaderId]
  if (!kb || !edge || !leader || !isOnTable(leader)) return false
  const r = baseRadius(leader.base)
  const hw = def.table.w / 2, hd = def.table.d / 2
  const { x, z } = leader.pos
  switch (edge) {
    case 'north': return z - r >= -hd - 1e-6 && z + r <= -hd + kb.depth + 1e-6
    case 'south': return z + r <= hd + 1e-6 && z - r >= hd - kb.depth - 1e-6
    case 'west': return x - r >= -hw - 1e-6 && x + r <= -hw + kb.depth + 1e-6
    default: return x + r <= hw + 1e-6 && x - r >= hw - kb.depth - 1e-6
  }
}

export function killBoxActive(state: GameState, def: ScenarioDef): boolean {
  const kb = def.killBox
  if (!kb) return false
  if (state.round > kb.fromRound) return true
  if (state.round < kb.fromRound) return false
  return kb.fromPlayer === 'first' || !isFirst(state, state.activePlayer)
}

export interface EndOfTurnResult { state: GameState; events: GameEvent[]; ended: boolean }

function endGame(state: GameState, winner: PlayerId | null, reason: GameEndReason): { state: GameState; events: GameEvent[] } {
  const next: GameState = {
    ...state, phase: 'ended', window: 'game.end', activation: null, attack: null,
    scenario: { ...state.scenario, result: { winner, reason } },
  }
  return { state: next, events: [{ type: 'GameEnded', winner, reason, vp: { ...state.scenario.vp } }] }
}

/**
 * V1.2, V1.7, V1.3, V1.4: run at the end of a player turn. Scores both players, applies the Kill Box,
 * then lead-by-3 for the non-active player, then the round limit. `lastTurn` = the final turn of the final round.
 */
export function endOfTurnScoring(state: GameState, bundle: DataBundle): EndOfTurnResult {
  const def = scenarioDef(bundle, state.scenario.id)
  let s = state
  const events: GameEvent[] = []
  const active = state.activePlayer

  if (scoringActive(s, def)) {
    const control = computeControl(s, def)
    events.push({ type: 'ControlChecked', elements: control })
    const gained: Record<PlayerId, { elementId?: Id; reason: string; vp: number }[]> = { A: [], B: [] }
    for (const el of def.elements) {
      const c = control[el.id]!
      if (c.controller && el.vp.control > 0) gained[c.controller].push({ elementId: el.id, reason: `controls ${el.id}`, vp: el.vp.control })
    }
    let vp = { ...s.scenario.vp }
    const log = [...s.scenario.log]
    // both players score at every scoring point (QS p39, SR p5); the active player first
    for (const p of [active, otherPlayer(active)]) {
      const delta = gained[p].reduce((a, g) => a + g.vp, 0)
      if (delta === 0) continue
      vp = { ...vp, [p]: vp[p] + delta }
      for (const g of gained[p]) log.push({ round: s.round, turn: s.turn, player: p, vp: g.vp, source: g.reason })
      events.push({ type: 'ScenarioScored', player: p, delta, vp: { ...vp }, sources: gained[p] })
    }
    s = { ...s, scenario: { ...s.scenario, elements: control, vp, log } }
  }

  if (killBoxActive(s, def)) {
    const inBox = inKillBox(s, def, active)
    s = { ...s, scenario: { ...s.scenario, killBox: { ...s.scenario.killBox, [active]: inBox } } }
    if (inBox) {
      const ben = otherPlayer(active)
      const vp = { ...s.scenario.vp, [ben]: s.scenario.vp[ben] + def.killBox!.vp }
      s = { ...s, scenario: { ...s.scenario, vp, log: [...s.scenario.log, { round: s.round, turn: s.turn, player: ben, vp: def.killBox!.vp, source: 'killBox' }] } }
      events.push({ type: 'KillBoxScored', offender: active, beneficiary: ben, vp: def.killBox!.vp })
    }
  }

  const other = otherPlayer(active)
  if (s.scenario.vp[other] >= s.scenario.vp[active] + def.scoring.winMargin) {
    const e = endGame(s, other, 'scenario')
    return { state: e.state, events: [...events, ...e.events], ended: true }
  }
  if (s.round >= def.rounds && !isFirst(s, active)) {
    const e = finalResult(s, bundle)
    return { state: e.state, events: [...events, ...e.events], ended: true }
  }
  return { state: s, events, ended: false }
}

// ---------- assassination (V1.1) ----------
const leaderInPlay = (state: GameState, p: PlayerId): boolean => {
  const m = state.models[state.players[p].leaderId]
  return !!m && m.life !== 'destroyed' && m.life !== 'boxed'
}

/**
 * Call after any death resolves. Cleans up a destroyed caster's upkeeps and war-engines, then ends the game at once when
 * only one Leader is left (V1.1). All Leaders gone at once: tiebreakers decide.
 */
export function afterDeaths(state: GameState, bundle: DataBundle): EndOfTurnResult {
  let s = state
  const events: GameEvent[] = []
  for (const p of ['A', 'B'] as PlayerId[]) {
    const lid = s.players[p].leaderId
    if (!leaderInPlay(s, p)) {
      const a = expireCasterEffects(s, lid); s = a.state; events.push(...a.events)
      const b = markInertCohorts(s, lid); s = b.state; events.push(...b.events)
    }
  }
  if (s.phase === 'ended') return { state: s, events, ended: true }
  const a = leaderInPlay(s, 'A'), b = leaderInPlay(s, 'B')
  if (a && b) return { state: s, events, ended: false }
  if (a !== b) {
    const e = endGame(s, a ? 'A' : 'B', 'assassination')
    return { state: e.state, events: [...events, ...e.events], ended: true }
  }
  const e = finalResult(s, bundle)
  return { state: e.state, events: [...events, ...e.events], ended: true }
}

// ---------- tiebreakers (V1.5, V1.6) ----------
const modelCost = (p: Profile): number => (typeof p.cost === 'number' ? p.cost : 0)

/** V1.5 tiebreak 2: points of models that could control an element they are in or near. */
export function presenceTotals(state: GameState, bundle: DataBundle, def: ScenarioDef): Record<PlayerId, number> {
  const tot: Record<PlayerId, number> = { A: 0, B: 0 }
  for (const p of ['A', 'B'] as PlayerId[]) {
    const counted = new Set<string>() // model ids, or unit ids, already counted
    for (const el of def.elements) {
      for (const m of Object.values(state.models)) {
        if (m.owner !== p || !live(m) || distanceToElement(state, el, m) > el.hold.within + 1e-6) continue
        if (m.type === 'leader') {
          if (!counted.has(m.id)) { counted.add(m.id); tot[p] += def.scoring.leaderPresence }
          continue
        }
        if (!el.hold.eligible.includes('any') && !el.hold.eligible.some((t) => eligibleToHold(t, m))) continue
        const u = unitOf(state, m)
        if (u) {
          if (counted.has(u.id)) continue
          const all = u.troopers.map((id) => state.models[id]!).filter((x) => x && x.life === 'active')
          if (all.length > 0 && all.every((x) => live(x) && distanceToElement(state, el, x) <= el.hold.within + 1e-6)) {
            counted.add(u.id); tot[p] += modelCost((bundle.byId[u.profileId] ?? {}) as Profile)
          }
        } else if (!counted.has(m.id)) { counted.add(m.id); tot[p] += modelCost(profileOf(bundle, m)) }
      }
    }
  }
  return tot
}

/** End the game on the final state: VP, then scenario presence, then a draw. */
export function finalResult(state: GameState, bundle: DataBundle): { state: GameState; events: GameEvent[] } {
  const def = scenarioDef(bundle, state.scenario.id)
  const vp = state.scenario.vp
  if (vp.A !== vp.B) return endGame(state, vp.A > vp.B ? 'A' : 'B', state.round >= def.rounds ? 'roundLimit' : 'scenario')
  const pr = presenceTotals(state, bundle, def)
  if (pr.A !== pr.B) return endGame(state, pr.A > pr.B ? 'A' : 'B', 'tiebreakPresence')
  return endGame(state, null, 'draw')
}

/** query.control (00 section 8): the live report. Pure; wire into index.ts query.control. */
export function controlReport(state: GameState, bundle: DataBundle): { elements: Record<Id, ElementControl>; vpNow: Record<PlayerId, number>; killBox: Record<PlayerId, boolean> } {
  const def = scenarioDef(bundle, state.scenario.id)
  const elements = computeControl(state, def)
  const vpNow = { ...state.scenario.vp }
  for (const el of def.elements) { const c = elements[el.id]!.controller; if (c) vpNow[c] += el.vp.control } // what this point would add
  return { elements, vpNow, killBox: { A: inKillBox(state, def, 'A'), B: inKillBox(state, def, 'B') } }
}
