// 11-scenarios: element control, scoring, Kill Box, assassination, lead-by-3, round limit, tiebreakers. Pure.
import { expireCasterEffects, markInertCohorts, otherPlayer, profileOf, type Profile } from './effects'
import { markWildBeasts, onBeastLeavesPlay } from './fury'
import { awardSoul } from './factions/cryx'
import type { GameEvent } from './events'
import { baseRadius, isOnTable } from './geometry'
import { modelToPoint } from './measure'
import type { ElementSelect, ScenarioRulesDef } from './scenario-rules'
import { circleOverlapsShape, distToShape, terrainTraits, worldShape, type WorldShape } from './terrain'
import type {
  DataBundle, ElementControl, GameEndReason, GameState, Id, ModelId, ModelState, PlayerId, ScenarioState, TerrainInstance, Vec2,
} from './types'

// ---------- scenario data ----------
/** M13 (91 B.2): `cache` joins the kinds; `owner` is the element's colour (first = Attacker, second = Defender; A and B name a player outright). */
export type ElementKindId = 'objective50' | 'objective40' | 'flag' | 'scenarioTerrain' | 'zone' | 'cache'
export interface ElementDef {
  id: Id
  kind: ElementKindId
  pos: Vec2
  terrain?: Id
  owner?: 'A' | 'B' | 'first' | 'second'
  /** `single` (SR9): one model of these kinds holds it even when `models` is more; `mode: 'area'`: inside the piece for area terrain, within `within` for impassable pieces. */
  hold: { within: number; models: number; eligible: string[]; single?: string[]; mode?: 'within' | 'area' }
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
/** SR9: scenario terrain (flags) is secured by one Leader or one solo, else two models of any kind, inside its area (or within 3" of an impassable piece). */
const SR9_HOLD = { within: 3, models: 2, eligible: ['any'], single: ['leader', 'solo'], mode: 'area' as const }

const DEF_CACHE = new WeakMap<object, ScenarioDef>()
/** Read the scenario record and fill the per-kind defaults of 20-data-schema section 7. */
export function scenarioDef(bundle: DataBundle, scenarioId: Id): ScenarioDef {
  const r = bundle.byId[scenarioId] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!r) throw new Error(`scenario '${scenarioId}' not in bundle`)
  const hit = DEF_CACHE.get(r)
  if (hit) return hit
  const fromSecond = (r.scoring?.fromPlayer ?? DEFAULT_SCORING.fromPlayer) === 'second'
  const elements: ElementDef[] = ((r.elements ?? []) as Record<string, any>[]).map((e) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const kind = e.kind as ElementDef['kind']
    const holdDefault =
      kind === 'objective50' ? { within: 3, models: 1, eligible: ['leader', 'warEngine', 'battleEngine'] }
        : kind === 'objective40' ? { within: 3, models: 1, eligible: ['leader', 'unitAll'] }
          : (kind === 'flag' || kind === 'scenarioTerrain') && fromSecond ? SR9_HOLD // M13: the scenarios that score from the Defender's round 2 are the Steamroller ones
            : { within: 3, models: 2, eligible: ['any'] }
    return {
      id: e.id, kind, pos: e.pos ?? { x: 0, z: 0 }, terrain: e.terrain, ...(e.owner ? { owner: e.owner } : {}),
      hold: { ...holdDefault, ...(e.hold ?? {}) },
      contest: { within: 3, excludes: ['leader', 'inert', 'disabled', 'wild'], ...(e.contest ?? {}) },
      vp: { control: e.vp?.control ?? (kind === 'cache' ? 0 : 1) },
    }
  })
  const def: ScenarioDef = {
    id: r.id, table: r.table ?? { w: 36, d: 36 }, rounds: r.rounds ?? 7,
    deployment: { advance: 3, unitSpread: 3, ...r.deployment },
    scoring: { ...DEFAULT_SCORING, ...(r.scoring ?? {}) },
    killBox: r.killBox, elements,
  }
  DEF_CACHE.set(r, def)
  return def
}

const RULES_CACHE = new WeakMap<object, ScenarioRulesDef>()
/** The M13 extras of a scenario record (91 B.2, B.3) with defaults filled; `rules` empty = the plain per-element `vp.control` scoring. */
export function readScenarioRules(bundle: DataBundle, scenarioId: Id): ScenarioRulesDef {
  const r = bundle.byId[scenarioId] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!r) throw new Error(`scenario '${scenarioId}' not in bundle`)
  const hit = RULES_CACHE.get(r)
  if (hit) return hit
  const out: ScenarioRulesDef = {
    frame: r.frame === 'attacker' ? 'attacker' : null,
    rules: Array.isArray(r.scoring?.rules) ? r.scoring.rules : [],
    special: Array.isArray(r.special) ? r.special : [],
    setup: { flagRadius: r.setup?.flagRadius ?? 5, flagPickOrder: 'attackerFirst' },
  }
  RULES_CACHE.set(r, out)
  return out
}
/** True when the scenario uses the M13 scoring vocabulary or specials, so end-of-turn scoring runs the step machine of scenario-rules.ts. */
export const usesScenarioRules = (bundle: DataBundle, scenarioId: Id): boolean => { const d = readScenarioRules(bundle, scenarioId); return d.rules.length > 0 || d.special.length > 0 }

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
export const elementRadius = (k: ElementDef['kind']): number =>
  k === 'objective50' ? baseRadius(50) : k === 'objective40' ? baseRadius(40) : k === 'flag' || k === 'cache' ? baseRadius(30) : 0

/** The player an element's colour names (first = Attacker, second = Defender), or null for a neutral element or before the turn order is known. */
export function elementOwner(state: GameState, el: ElementDef): PlayerId | null {
  switch (el.owner) {
    case 'A': return 'A'
    case 'B': return 'B'
    case 'first': return state.firstPlayer ?? null
    case 'second': return state.firstPlayer ? otherPlayer(state.firstPlayer) : null
    default: return null
  }
}

/** Where an element stands now and what shape it has: the scenario terrain piece it stands for, or its point and base. `present` is false once it is removed. */
export interface ElementGeom { present: boolean; pos: Vec2; r: number; shape: WorldShape | null; /** a piece a base can stand inside (not an obstacle, obstruction or building) */ area: boolean }
export function elementGeom(state: GameState, el: ElementDef): ElementGeom {
  const rt = state.scenario.elementState?.[el.id]
  const pos = rt?.pos ?? el.pos
  if (rt?.removed) return { present: false, pos, r: 0, shape: null, area: false }
  const pieceId = el.kind === 'scenarioTerrain' ? el.terrain : el.kind === 'flag' ? (rt?.terrainId ?? undefined) : undefined
  if (pieceId) {
    const t: TerrainInstance | undefined = state.terrain.find((x) => x.id === pieceId || x.pieceId === pieceId)
    if (t) return { present: true, pos, r: 0, shape: worldShape(t), area: terrainTraits(t).move === 'none' }
  }
  return { present: true, pos, r: elementRadius(el.kind), shape: null, area: false }
}

/** Distance from a model's base edge to the element (to its terrain piece, or to its point); Infinity once the element is removed. */
export function distanceToElement(state: GameState, el: ElementDef, m: ModelState): number {
  const g = elementGeom(state, el)
  if (!g.present) return Infinity
  if (g.shape) return Math.max(0, distToShape(m.pos, g.shape) - baseRadius(m.base))
  return Math.max(0, modelToPoint(m, g.pos) - g.r)
}

/** Is the model in reach of the element for holding or contesting it: inside the area of an area piece (mode 'area'), else within the rule's distance. */
export function reaches(state: GameState, el: ElementDef, m: ModelState, kind: 'hold' | 'contest'): boolean {
  const g = elementGeom(state, el)
  if (!g.present) return false
  if (el.hold.mode === 'area' && g.area && g.shape) return circleOverlapsShape(m.pos, baseRadius(m.base), g.shape)
  const within = kind === 'hold' ? el.hold.within : el.contest.within
  return distanceToElement(state, el, m) <= within + 1e-6
}

export const live = (m: ModelState): boolean => isOnTable(m) && !m.inert && !m.conditions.includes('inert')
const unitOf = (state: GameState, m: ModelState) => (m.unitId ? state.units[m.unitId] : undefined)

function eligibleToHold(token: string, m: ModelState): boolean {
  switch (token) {
    case 'any': return true
    case 'leader': return m.type === 'leader'
    case 'warEngine': return m.type === 'warEngine' || m.type === 'beast' // M9 F13.3: warbeasts are Cohort models like war-engines
    case 'battleEngine': return m.type === 'battleEngine'
    case 'solo': return m.type === 'solo'
    case 'beast': return m.type === 'beast'
    case 'trooper': return m.type === 'trooper'
    case 'unit': return !!m.unitId
    default: return false
  }
}

/** Models of `player` that satisfy the element's hold rule, or [] when it is not held. */
export function holders(state: GameState, el: ElementDef, player: PlayerId): ModelId[] {
  if (el.kind === 'cache') return []
  const near = Object.values(state.models).filter((m) => m.owner === player && live(m) && reaches(state, el, m, 'hold'))
  if (near.length === 0) return []
  // SR9: one model of these kinds is enough even when the rule asks for more
  if (el.hold.single?.length && near.some((m) => el.hold.single!.some((t) => eligibleToHold(t, m)))) return near.map((m) => m.id)
  if (el.hold.eligible.includes('any')) return near.length >= el.hold.models ? near.map((m) => m.id) : []
  const direct = near.filter((m) => el.hold.eligible.some((t) => eligibleToHold(t, m)))
  if (direct.length >= el.hold.models) return direct.map((m) => m.id)
  if (el.hold.eligible.includes('unitAll')) {
    for (const u of Object.values(state.units)) {
      if (u.owner !== player) continue
      const troopers = u.troopers.map((id) => state.models[id]!).filter((m) => m && m.life === 'active')
      if (troopers.length > 0 && troopers.every((m) => live(m) && reaches(state, el, m, 'hold'))) return troopers.map((m) => m.id)
    }
  }
  return []
}

/** The models of `against` that contest the element (those that may: not Leaders, inert, wild or disabled models by the SR rule). */
export function contesters(state: GameState, el: ElementDef, against: PlayerId): ModelId[] {
  const ex = el.contest.excludes
  return Object.values(state.models)
    .filter((m) => m.owner === against && live(m)
      && !(ex.includes('leader') && m.type === 'leader') && !ex.includes(m.type)
      && reaches(state, el, m, 'contest'))
    .map((m) => m.id)
}

/** V2: who controls each element right now (not persistent; evaluated at scoring time). */
export function computeControl(state: GameState, def: ScenarioDef): Record<Id, ElementControl> {
  const out: Record<Id, ElementControl> = {}
  for (const el of def.elements) {
    if (el.kind === 'cache' || !elementGeom(state, el).present) {
      out[el.id] = { controller: null, contested: false, holders: [], contesters: [], reason: el.kind === 'cache' ? 'a cache is claimed, not held' : 'removed' }
      continue
    }
    const hA = holders(state, el, 'A'), hB = holders(state, el, 'B')
    const cA = contesters(state, el, 'A'), cB = contesters(state, el, 'B')
    // Bite and Hold (91 A.2): this turn the player keeps an element they secured even if they have left it, unless an enemy contests it
    const sticky = state.scenario.elementState?.[el.id]?.stickyHold
    const stuck: PlayerId | null = sticky && sticky.round === state.round && sticky.turn === state.turn ? sticky.player : null
    const aOk = (hA.length > 0 || stuck === 'A') && cB.length === 0 && stuck !== 'B'
    const bOk = (hB.length > 0 || stuck === 'B') && cA.length === 0 && stuck !== 'A'
    const controller: PlayerId | null = aOk && !bOk ? 'A' : bOk && !aOk ? 'B' : null
    const contested = controller === null && (hA.length > 0 || hB.length > 0)
    out[el.id] = {
      controller, contested,
      holders: controller === 'A' ? hA : controller === 'B' ? hB : [],
      contesters: controller === 'A' ? cB : controller === 'B' ? cA : [...cA, ...cB],
      reason: controller ? `${controller} holds it${controller === stuck && (controller === 'A' ? hA : hB).length === 0 ? ' (kept this turn)' : ''}` : contested ? 'contested' : 'nobody holds it',
    }
  }
  return out
}

/** M13 scoring vocabulary (91 B.3): the VP player `player` gains from `rd.rules` at this scoring point, given the control map. Delivery and the token race are settled by scenario-rules.ts. */
export interface Gain { elementId?: Id; reason: string; vp: number }
export function rulesGain(state: GameState, def: ScenarioDef, rd: ScenarioRulesDef, control: Record<Id, ElementControl>, player: PlayerId): Gain[] {
  const out: Gain[] = []
  const match = (sel: ElementSelect): ElementDef[] => def.elements.filter((el) => {
    if (!(sel.kinds as string[]).includes(el.kind) || !elementGeom(state, el).present) return false
    const o = elementOwner(state, el)
    switch (sel.owner ?? 'any') {
      case 'own': return o === player
      case 'opponent': return o === otherPlayer(player)
      case 'neutral': return o === null
      default: return true
    }
  })
  for (const r of rd.rules) {
    if (r.kind === 'control') {
      for (const el of match(r.select)) if (control[el.id]?.controller === player && r.vp > 0) out.push({ elementId: el.id, reason: `controls ${el.id}`, vp: r.vp })
    } else if (r.kind === 'countBonus') {
      const n = match(r.select).filter((el) => control[el.id]?.controller === player).length
      if (n >= r.atLeast && r.vp > 0) out.push({ reason: `secures ${n} of ${r.select.kinds.join('/')} (${r.atLeast}+ bonus)`, vp: r.vp })
    } else if (r.kind === 'zeroTokenBonus') {
      for (const el of match(r.select)) if (control[el.id]?.controller === player && state.scenario.elementState?.[el.id]?.tokens === 0 && r.vp > 0) out.push({ elementId: el.id, reason: `${el.id} is burnt down`, vp: r.vp })
    } else if (r.kind === 'cache') {
      for (const c of state.scenario.cachesClaimed ?? []) if (c.player === player && c.turn === state.turn && r.vp > 0) out.push({ elementId: c.elementId, reason: `claimed ${c.elementId}`, vp: r.vp })
    }
  }
  return out
}
/** What `player` gains at a scoring point: the M13 rules when the scenario has any, else 1 per controlled element as in the plain scenarios. */
export function gainsFor(state: GameState, def: ScenarioDef, rd: ScenarioRulesDef, control: Record<Id, ElementControl>, player: PlayerId): Gain[] {
  if (rd.rules.length > 0) return rulesGain(state, def, rd, control, player)
  return def.elements.flatMap((el) => (control[el.id]?.controller === player && el.vp.control > 0 ? [{ elementId: el.id, reason: `controls ${el.id}`, vp: el.vp.control }] : []))
}

// ---------- scoring ----------
export const isFirst = (state: GameState, p: PlayerId): boolean => state.firstPlayer === p

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
  const depth = state.scenario.killBoxDepth ?? kb.depth // M13: Wolves at Our Heels grows the strip (scenario-rules.ts)
  const { x, z } = leader.pos
  switch (edge) {
    case 'north': return z - r >= -hd - 1e-6 && z + r <= -hd + depth + 1e-6
    case 'south': return z + r <= hd + 1e-6 && z - r >= hd - depth - 1e-6
    case 'west': return x - r >= -hw - 1e-6 && x + r <= -hw + depth + 1e-6
    default: return x + r <= hw + 1e-6 && x - r >= hw - depth - 1e-6
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

export function endGame(state: GameState, winner: PlayerId | null, reason: GameEndReason): { state: GameState; events: GameEvent[] } {
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
  if (def.scoring.winMargin > 0 && s.scenario.vp[other] >= s.scenario.vp[active] + def.scoring.winMargin) { // winMargin 0 = no lead-by-N win (Payload)
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
  // M9 (81 F9): warbeasts that left play this step record Spirit Bond and get reaved (not by a friendly attack)
  const actor = s.attack?.attackerId // only an attack can be a friendly attack (F9.3); other deaths in a friendly activation still reave
  const actorOwner = actor ? (s.models[actor]?.owner ?? s.units[actor]?.owner) : undefined
  for (const m of Object.values(s.models)) {
    if (m.type !== 'beast' || (m.life !== 'destroyed' && m.life !== 'boxed') || m.bondedTo !== undefined || m.controllerId === undefined || m.wild) continue
    const r = onBeastLeavesPlay(s, bundle, m.id, { friendlyAttack: actorOwner !== undefined && actorOwner === m.owner }); s = r.state; events.push(...r.events)
  }
  // death.destroyed window, once per model: a living model destroyed by something no attack accounted for (fire, a hazard, collateral,
  // a power attack) still gives a Soul Taker its soul. Attack kills were credited by the attack's own plugin before this runs.
  const credited = new Set<string>(((s.attack as { x?: { destroyed?: string[] } } | null)?.x?.destroyed) ?? [])
  for (const m of Object.values(s.models)) {
    if ((m.life !== 'destroyed' && m.life !== 'boxed') || m.deathHandled) continue
    s = { ...s, models: { ...s.models, [m.id]: { ...m, deathHandled: true } } }
    if (m.life === 'destroyed' && !credited.has(m.id)) { const r = awardSoul(s, bundle, m.id); s = r.state; events.push(...r.events) }
  }
  for (const p of ['A', 'B'] as PlayerId[]) {
    const lid = s.players[p].leaderId
    if (!leaderInPlay(s, p)) {
      const a = expireCasterEffects(s, lid); s = a.state; events.push(...a.events)
      const b = markInertCohorts(s, lid); s = b.state; events.push(...b.events)
      const w = markWildBeasts(s, lid); s = w.state; events.push(...w.events) // M9 F11.1
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
        if (el.kind === 'cache' || m.owner !== p || !live(m) || !reaches(state, el, m, 'hold')) continue
        if (m.type === 'leader') {
          if (!counted.has(m.id)) { counted.add(m.id); tot[p] += def.scoring.leaderPresence }
          continue
        }
        if (!el.hold.eligible.includes('any') && !el.hold.eligible.some((t) => eligibleToHold(t, m))) continue
        const u = unitOf(state, m)
        if (u) {
          if (counted.has(u.id)) continue
          const all = u.troopers.map((id) => state.models[id]!).filter((x) => x && x.life === 'active')
          if (all.length > 0 && all.every((x) => live(x) && reaches(state, el, x, 'hold'))) {
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
export function controlReport(state: GameState, bundle: DataBundle): { elements: Record<Id, ElementControl>; vpNow: Record<PlayerId, number>; killBox: Record<PlayerId, boolean>; killBoxActive: boolean } {
  const def = scenarioDef(bundle, state.scenario.id)
  const elements = computeControl(state, def)
  const vpNow = { ...state.scenario.vp }
  const rd = readScenarioRules(bundle, state.scenario.id)
  for (const p of ['A', 'B'] as PlayerId[]) vpNow[p] += gainsFor(state, def, rd, elements, p).reduce((a, g) => a + g.vp, 0) // what this point would add
  return { elements, vpNow, killBox: { A: inKillBox(state, def, 'A'), B: inKillBox(state, def, 'B') }, killBoxActive: killBoxActive(state, def) }
}
