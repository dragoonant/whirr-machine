// R5 movement: Normal Movement options, charge/slam/trample moves, unit placement, disengage, involuntary movement. Pure.
// Card stats are not in GameState, so callers pass what they know via MoverInfo / lookups.
import type { GameEvent, MoveKind } from './events'
import {
  EPS, baseRadius, dist, edgeDistance, isOnTable, norm, sub, surfaceElevation, segPointDist,
  sweepFrom, validateAdvancePath, placeWithin, leastDisturbance, isLegalPlacement, type SweepResult,
} from './geometry'
import { circleInsideShape, terrainPieces } from './terrain'
import { rollDamage, applyDamage, resolveDeath, type GridLayout } from './damage'
import type { GameState, ModelId, ModelState, MovementOption, RejectionCode, UnitId, Vec2 } from './types'

export interface MoverInfo {
  spd: number
  warEngine?: boolean
  beast?: boolean // M9: run, charge, slam and trample cost a force (1 fury put on the beast)
  forceBlock?: string // why the beast cannot be forced right now (fury.forceGate block code)
  aggressive?: boolean // Aggressive: run and charge cost no focus (cryx.md)
  blind?: boolean // Blind: no run, charge, slam or trample
  noAdvance?: boolean // Shadow Bind: cannot advance (no Normal Movement but forfeit and aim)
  passIds?: ModelId[] // friendly models this mover may pass through (Precision Strike)
  ghostly?: boolean // Incorporeal / Warp: Ghostly: moves through models and terrain it can clear
  hasMelee?: boolean
  meleeRange?: number // default 1
  pathfinder?: boolean
  flying?: boolean
  unstoppable?: boolean // waives the disengage forfeit (R5.7, R5.10)
  slam?: boolean // has the Slam power attack (R7.12); undefined = not checked here
  trample?: boolean // has the Trample power attack (R7.14); undefined = not checked here
  /** an enemy model's melee range, for engagement; default 1 */
  rangeOf?: (id: ModelId) => number
}
export interface Rejected { ok: false; code: RejectionCode; message: string }
export interface MoveOk {
  ok: true
  state: GameState
  events: GameEvent[]
  forfeitCombat: boolean
  endsActivation: boolean
}

export const setModel = (s: GameState, m: ModelState): GameState => ({ ...s, models: { ...s.models, [m.id]: m } })
const rej = (code: RejectionCode, message: string): Rejected => ({ ok: false, code, message })
const len2 = (v: Vec2) => v.x * v.x + v.z * v.z

// ---------- engagement (R7.6) ----------
export function engagedBy(state: GameState, id: ModelId, rangeOf: (id: ModelId) => number = () => 1): ModelId[] {
  const m = state.models[id]
  if (!m || !isOnTable(m)) return []
  return Object.values(state.models)
    .filter((o) => o.owner !== m.owner && isOnTable(o) && !o.inert && !o.conditions.includes('knockedDown')
      && edgeDistance(m.pos, m.base, o.pos, o.base) <= Math.max(rangeOf(o.id), 0) + EPS)
    .map((o) => o.id)
}
export const isEngaged = (state: GameState, id: ModelId, rangeOf?: (id: ModelId) => number): boolean => engagedBy(state, id, rangeOf).length > 0

// ---------- option availability (R5.1, R5.6, R9.2) ----------
export interface OptionInfo { option: MovementOption; maxDist: number; focusCost: number; allowed: boolean; reason?: string }
export function movementOptions(
  state: GameState, id: ModelId, info: MoverInfo,
  opts: { combatForfeited?: boolean; standingUp?: boolean } = {},
): OptionInfo[] {
  const m = state.models[id]!
  const engaged = isEngaged(state, id, info.rangeOf)
  const blocked = m.conditions.includes('knockedDown') ? 'knocked down' : m.conditions.includes('stationary') ? 'stationary' : undefined
  const bound = info.noAdvance ? 'cannot advance' : undefined
  const noMove = m.crippled.includes('M')
  const fc = (info.warEngine || info.beast) && !info.aggressive ? 1 : 0
  const beastWhy = info.forceBlock === 'outOfCtrl' ? 'out of CTRL' : info.forceBlock === 'cap' ? 'at its FURY cap' : info.forceBlock === 'spirit' ? 'Spirit crippled' : 'cannot be forced'
  const canPay = info.aggressive || (info.beast ? !info.forceBlock : !info.warEngine || (m.focus >= 1 && !m.crippled.includes('C')))
  const standing = !!opts.standingUp || !!info.blind || !!info.noAdvance // blind: no run, charge, slam or trample; bound: none of them either
  const mk = (option: MovementOption, maxDist: number, focusCost: number, ok: boolean, reason: string): OptionInfo =>
    ({ option, maxDist, focusCost, allowed: ok, reason: ok ? undefined : reason })
  const why = (fallback: string) => blocked ?? (engaged ? 'engaged' : noMove ? 'movement crippled' : fallback)
  return [
    mk('forfeit', 0, 0, true, ''),
    mk('aim', 0, 0, true, ''),
    mk('advance', info.spd, 0, !blocked && !bound, blocked ?? bound ?? ''),
    mk('run', info.spd + 5, fc, !blocked && !engaged && !noMove && canPay && !standing, why(!canPay ? (info.beast ? beastWhy : 'no focus') : 'standing up')),
    mk('charge', info.spd + 3, fc, !blocked && !engaged && !noMove && canPay && !!info.hasMelee && !opts.combatForfeited && !standing,
      why(!info.hasMelee ? 'no melee weapon' : opts.combatForfeited ? 'combat action forfeited' : !canPay ? (info.beast ? beastWhy : 'no focus') : 'standing up')),
    // R7.10-R7.14: slam and trample are power attacks that use Normal Movement and the Combat Action; a war-engine pays 1 focus
    mk('slam', info.spd + 3, fc, info.slam !== false && !blocked && !engaged && !noMove && !opts.combatForfeited && !standing && canPay,
      why(info.slam === false ? 'no Slam power attack' : opts.combatForfeited ? 'combat action forfeited' : !canPay ? (info.beast ? beastWhy : 'no focus') : 'standing up')),
    mk('trample', info.spd + 3, fc, info.trample !== false && !blocked && !noMove && !opts.combatForfeited && !standing && canPay,
      blocked ?? (noMove ? 'movement crippled' : info.trample === false ? 'no Trample power attack' : opts.combatForfeited ? 'combat action forfeited' : !canPay ? (info.beast ? beastWhy : 'no focus') : 'standing up')),
  ]
}

export function spendFocus(state: GameState, id: ModelId, purpose: 'run' | 'charge' | 'powerAttack'): { state: GameState; events: GameEvent[] } {
  const m = state.models[id]!
  const after = Math.max(0, m.focus - 1)
  return {
    state: setModel(state, { ...m, focus: after }),
    events: [{ type: 'FocusChanged', modelId: id, delta: -1, after, reason: 'spend', purpose } as GameEvent],
  }
}

// ---------- events / helpers ----------
export function movedEvent(modelId: ModelId, kind: MoveKind, from: Vec2, to: Vec2, path: Vec2[], elevAfter: number, stoppedBy?: string): GameEvent {
  return { type: 'ModelMoved', modelId, kind, from, to, path, distance: dist(from, to), elevAfter, ...(stoppedBy ? { stoppedBy } : {}) } as GameEvent
}
export function relocate(state: GameState, id: ModelId, to: Vec2): GameState {
  const m = state.models[id]!
  return setModel(state, { ...m, pos: to, elev: surfaceElevation(state, to, m.base) })
}
export function addKnockdown(state: GameState, id: ModelId, sourceId?: string): { state: GameState; events: GameEvent[] } {
  const m = state.models[id]
  if (!m || m.conditions.includes('knockedDown')) return { state, events: [] }
  return {
    state: setModel(state, { ...m, conditions: [...m.conditions, 'knockedDown'] }),
    events: [{ type: 'ConditionAdded', modelId: id, condition: 'knockedDown', sourceId } as GameEvent],
  }
}
const stopId = (sw: SweepResult): string | undefined => sw.stoppedBy.id ?? (sw.stoppedBy.kind === 'edge' ? 'edge' : undefined)

// ---------- advance / run (R5.0, R5.7, R5.12, R5.13) ----------
export interface AdvanceArgs { modelId: ModelId; waypoints: Vec2[]; kind: 'advance' | 'run'; info: MoverInfo; ignoreIds?: ModelId[] }
export function resolveAdvance(state: GameState, a: AdvanceArgs): MoveOk | Rejected {
  const m = state.models[a.modelId]!
  const maxMove = a.kind === 'run' ? a.info.spd + 5 : a.info.spd
  const chk = validateAdvancePath(state, a.modelId, a.waypoints, maxMove, { pathfinder: a.info.pathfinder || a.info.ghostly, flying: a.info.flying || a.info.ghostly, ignoreIds: a.ignoreIds, passModels: a.info.ghostly ? true : a.info.passIds })
  if (!chk.ok) return rej(chk.code ?? 'E_PATH_BLOCKED', chk.message ?? 'illegal path')
  const before = engagedBy(state, a.modelId, a.info.rangeOf)
  const s = relocate(state, a.modelId, chk.end)
  const events: GameEvent[] = [movedEvent(a.modelId, a.kind, m.pos, chk.end, a.waypoints, s.models[a.modelId]!.elev)]
  const range = a.info.rangeOf ?? (() => 1)
  const left = before.filter((e) => edgeDistance(chk.end, m.base, s.models[e]!.pos, s.models[e]!.base) > range(e) + EPS)
  let forfeit = a.kind === 'run'
  if (a.kind === 'advance' && left.length > 0 && !a.info.unstoppable) {
    forfeit = true
    events.push({ type: 'CombatActionForfeited', modelId: a.modelId, reason: 'disengaged' } as GameEvent)
  }
  if (a.kind === 'run') events.push({ type: 'CombatActionForfeited', modelId: a.modelId, reason: 'run' } as GameEvent)
  return { ok: true, state: s, events, forfeitCombat: forfeit, endsActivation: a.kind === 'run' }
}

// ---------- straight moves: charge, slam (R5.2, R7.12) ----------
export interface StraightResult extends MoveOk {
  success: boolean
  distance: number
  chargeAttack: boolean
  sweep: SweepResult
}
function sweepWithRough(state: GameState, m: ModelState, dir: Vec2, max: number, info: MoverInfo, ignoreIds: ModelId[], keepId?: ModelId): SweepResult {
  // a ghostly mover passes through every base except the one it charges
  const ids = info.ghostly ? [...ignoreIds, ...Object.keys(state.models).filter((x) => x !== m.id && x !== keepId)] : ignoreIds
  const opts = { obstacles: (info.pathfinder || info.ghostly ? 'ignore' : 'stop') as 'ignore' | 'stop', ignoreObstructions: info.flying || info.ghostly, ignoreIds: ids }
  let sw = sweepFrom(state, m, m.pos, dir, max, opts)
  if (sw.roughEntered && !info.pathfinder && !info.ghostly) sw = sweepFrom(state, m, m.pos, dir, Math.max(1, max - 2), opts)
  return sw
}
export interface ChargeArgs { modelId: ModelId; targetId: ModelId; info: MoverInfo; kind?: 'charge' | 'slam'; range?: number; ignoreIds?: ModelId[] }
export function resolveCharge(state: GameState, a: ChargeArgs): StraightResult | Rejected {
  const m = state.models[a.modelId]!
  const t = state.models[a.targetId]
  if (!t || !isOnTable(t) || t.owner === m.owner) return rej('E_TARGET_INVALID', 'charge target must be an enemy on the table')
  const kind = a.kind ?? 'charge'
  if (isEngaged(state, a.modelId, a.info.rangeOf)) return rej('E_ENGAGED', 'engaged models cannot charge or slam')
  const range = a.range ?? a.info.meleeRange ?? 1
  const sw = sweepWithRough(state, m, norm(sub(t.pos, m.pos)), a.info.spd + 3, a.info, a.ignoreIds ?? [], a.targetId)
  const success = edgeDistance(sw.end, m.base, t.pos, t.base) <= range + EPS
  const s = relocate(state, a.modelId, sw.end)
  const events: GameEvent[] = [
    { type: 'ChargeDeclared', modelId: a.modelId, targetId: a.targetId } as GameEvent,
    movedEvent(a.modelId, kind, m.pos, sw.end, [sw.end], s.models[a.modelId]!.elev, stopId(sw)),
  ]
  const chargeAttack = kind === 'charge' && success && sw.travelled >= 3 - EPS
  if (kind === 'charge') events.push({ type: 'ChargeResolved', modelId: a.modelId, targetId: a.targetId, distance: sw.travelled, success, chargeAttack } as GameEvent)
  return { ok: true, state: s, events, forfeitCombat: false, endsActivation: !success, success, distance: sw.travelled, chargeAttack, sweep: sw }
}

/**
 * R5.2 with a chosen end point: a straight line toward `to` (any direction that could bring the target into melee range),
 * up to SPD+3". The model can't stop voluntarily before the target is in its melee range; it stops on contact.
 */
export function resolveChargeTo(state: GameState, a: ChargeArgs & { to: Vec2 }): StraightResult | Rejected {
  const m = state.models[a.modelId]!
  const t = state.models[a.targetId]
  if (!t || !isOnTable(t) || t.owner === m.owner) return rej('E_TARGET_INVALID', 'charge target must be an enemy on the table')
  const kind = a.kind ?? 'charge'
  if (isEngaged(state, a.modelId, a.info.rangeOf)) return rej('E_ENGAGED', 'engaged models cannot charge or slam')
  const range = a.range ?? a.info.meleeRange ?? 1
  const want = dist(m.pos, a.to)
  const max = a.info.spd + 3
  if (want > max + EPS) return rej('E_TOO_FAR', `a charge moves at most ${max}"`)
  const inRangeAt = (p: Vec2): boolean => edgeDistance(p, m.base, t.pos, t.base) <= range + EPS
  const dir = norm(sub(want > EPS ? a.to : t.pos, m.pos))
  if (want > EPS) {
    // the line must be one that would bring the target into melee range (distance and blockers ignored)
    const far = { x: m.pos.x + dir.x * 1000, z: m.pos.z + dir.z * 1000 }
    if (segPointDist(m.pos, far, t.pos).d > baseRadius(m.base) + baseRadius(t.base) + range + EPS) return rej('E_NOT_STRAIGHT', 'that line never brings the target into melee range')
  }
  const sw = sweepWithRough(state, m, dir, max, a.info, a.ignoreIds ?? [], a.targetId)
  if (want > sw.travelled + EPS) return rej('E_PATH_BLOCKED', `the charge stops after ${sw.travelled.toFixed(2)}"`)
  const end = want >= sw.travelled - EPS ? sw.end : a.to
  // it may stop short only once the target is in melee range; a blocked charge simply ends where it stopped
  if (!inRangeAt(end) && want < sw.travelled - EPS) return rej('E_NOT_AN_OPTION', 'a charging model cannot stop before its target is in melee range')
  const travelled = dist(m.pos, end)
  const success = inRangeAt(end)
  const s = relocate(state, a.modelId, end)
  const events: GameEvent[] = [
    { type: 'ChargeDeclared', modelId: a.modelId, targetId: a.targetId } as GameEvent,
    movedEvent(a.modelId, kind, m.pos, end, [end], s.models[a.modelId]!.elev, want >= sw.travelled - EPS ? stopId(sw) : undefined),
  ]
  const chargeAttack = kind === 'charge' && success && travelled >= 3 - EPS
  if (kind === 'charge') events.push({ type: 'ChargeResolved', modelId: a.modelId, targetId: a.targetId, distance: travelled, success, chargeAttack } as GameEvent)
  return { ok: true, state: s, events, forfeitCombat: false, endsActivation: !success, success, distance: travelled, chargeAttack, sweep: sw }
}

// ---------- trample move (R7.14) ----------
export interface TrampleResult extends MoveOk { distance: number; trampled: ModelId[]; sweep: SweepResult }
/**
 * R7.14: a straight advance of up to SPD+3" along `dir` that passes through small (30 mm) bases and stops on contacting a
 * medium-or-larger base, an obstacle (not with Pathfinder) or an obstruction. `dist` picks a shorter move (default: as far
 * as it goes). The end point needs room for the base. Leaving melee ranges forfeits nothing.
 */
export function resolveTrampleMove(state: GameState, a: { modelId: ModelId; dir: Vec2; info: MoverInfo; dist?: number }): TrampleResult | Rejected {
  const m = state.models[a.modelId]!
  if (len2(a.dir) < 1e-12) return rej('E_BAD_PAYLOAD', 'trample needs a direction')
  const max = a.info.spd + 3
  if (a.dist !== undefined && a.dist > max + EPS) return rej('E_TOO_FAR', `a trample moves at most ${max}"`)
  const small = Object.values(state.models).filter((o) => o.id !== m.id && isOnTable(o) && o.base === 30 && m.base > 30).map((o) => o.id)
  const dir = norm(a.dir)
  const sw = sweepWithRough(state, m, dir, max, a.info, small)
  if (a.dist !== undefined && a.dist > sw.travelled + EPS) return rej('E_PATH_BLOCKED', `the trample stops after ${sw.travelled.toFixed(2)}"`)
  const go = a.dist === undefined ? sw.travelled : Math.min(a.dist, sw.travelled)
  const end = go >= sw.travelled - EPS ? sw.end : { x: m.pos.x + dir.x * go, z: m.pos.z + dir.z * go }
  const room = isLegalPlacement(state, a.modelId, end, m.base)
  if (!room.ok) return rej(room.code ?? 'E_BASE_OVERLAP', `no room for the base at the end of the trample (${room.message ?? 'blocked'})`)
  const r = baseRadius(m.base)
  const trampled = small.filter((id) => {
    const o = state.models[id]!
    return segPointDist(m.pos, end, o.pos).d <= r + baseRadius(o.base) - EPS
  })
  const s = relocate(state, a.modelId, end)
  const events: GameEvent[] = [movedEvent(a.modelId, 'trample', m.pos, end, [end], s.models[a.modelId]!.elev, go >= sw.travelled - EPS ? stopId(sw) : undefined)]
  return { ok: true, state: s, events, forfeitCombat: false, endsActivation: false, distance: go, trampled, sweep: sw }
}

// ---------- unit movement (R5.8-R5.10) ----------
export interface PlaceUnitResult { state: GameState; events: GameEvent[]; forfeit: ModelId[]; destroyed: ModelId[] }
export function placeUnit(
  state: GameState, unitId: UnitId, anchorId: ModelId,
  opts: { engagedBefore?: Record<ModelId, ModelId[]>; charge?: boolean; unstoppable?: boolean; rangeOf?: (id: ModelId) => number; los?: (a: ModelId, pos: Vec2) => boolean; placed?: Record<ModelId, Vec2> } = {},
): PlaceUnitResult {
  const unit = state.units[unitId]!
  const others = unit.troopers.filter((t) => t !== anchorId && state.models[t]?.life === 'active')
  // explicit placements (a validated placeTroopers answer): troopers left out could not be placed
  const res = opts.placed
    ? { placed: Object.fromEntries(others.filter((t) => opts.placed![t]).map((t) => [t, opts.placed![t]!])), failed: others.filter((t) => !opts.placed![t]) }
    : placeWithin(state, anchorId, others, { dist: 2, completely: false, visible: opts.los ? (p) => opts.los!(anchorId, p) : undefined })
  let s = state
  const events: GameEvent[] = []
  const placements: { modelId: ModelId; pos: Vec2 }[] = []
  for (const [id, pos] of Object.entries(res.placed)) {
    const from = s.models[id]!.pos
    s = relocate(s, id, pos)
    placements.push({ modelId: id, pos })
    events.push(movedEvent(id, 'place', from, pos, [pos], s.models[id]!.elev))
  }
  for (const id of res.failed) {
    s = setModel(s, { ...s.models[id]!, life: 'destroyed' })
    events.push({ type: 'ModelRemoved', modelId: id, reason: 'unplaceable' } as GameEvent)
  }
  if (res.failed.length) s = { ...s, units: { ...s.units, [unitId]: { ...s.units[unitId]!, troopers: s.units[unitId]!.troopers.filter((t) => !res.failed.includes(t)) } } }
  events.push({ type: 'TroopersPlaced', unitId, anchorId, placements, destroyed: res.failed } as GameEvent)
  const range = opts.rangeOf ?? (() => 1)
  const forfeit: ModelId[] = []
  for (const [id, enemies] of Object.entries(opts.engagedBefore ?? {})) {
    if (id === anchorId || res.failed.includes(id) || opts.unstoppable || enemies.length === 0) continue
    const m = s.models[id]!
    const inRange = (e: ModelId) => !!s.models[e] && edgeDistance(m.pos, m.base, s.models[e]!.pos, s.models[e]!.base) <= range(e) + EPS
    const ok = opts.charge ? enemies.every(inRange) : enemies.some(inRange)
    if (!ok) { forfeit.push(id); events.push({ type: 'CombatActionForfeited', modelId: id, reason: 'placedOutOfMelee' } as GameEvent) }
  }
  return { state: s, events, forfeit, destroyed: res.failed }
}

/** Unit Normal Movement: `move` performs the lead trooper's movement, then the rest are placed. */
export function resolveUnitMove(
  state: GameState, unitId: UnitId, leadId: ModelId, info: MoverInfo,
  move: (s: GameState) => MoveOk | Rejected, opts: { charge?: boolean; los?: (a: ModelId, pos: Vec2) => boolean } = {},
): (MoveOk & { forfeit: ModelId[] }) | Rejected {
  const unit = state.units[unitId]!
  const engagedBefore: Record<ModelId, ModelId[]> = {}
  for (const t of unit.troopers) engagedBefore[t] = engagedBy(state, t, info.rangeOf)
  const r = move(state)
  if (!r.ok) return r
  const p = placeUnit(r.state, unitId, leadId, { engagedBefore, charge: opts.charge, unstoppable: info.unstoppable, rangeOf: info.rangeOf, los: opts.los })
  return { ...r, state: p.state, events: [...r.events, ...p.events], forfeit: p.forfeit }
}

// ---------- involuntary movement (R5.15-R5.21) ----------
export interface InvoluntaryResult {
  state: GameState
  events: GameEvent[]
  travelled: number
  stoppedAgainst: boolean // an obstacle, obstruction or equal-or-larger base (the +1 die case)
  contacted: ModelId[] // models given collateral
}
export interface HitLookups {
  arm: (id: ModelId) => number
  layouts?: (id: ModelId) => GridLayout[] | undefined
  tough?: (id: ModelId) => boolean
  /** true when a rule stops the model being knocked down (Shield Wall); it is still moved and damaged */
  noKnockdown?: (id: ModelId) => boolean
  /** Incorporeal: cannot be pushed, slammed or thrown */
  immovable?: (id: ModelId) => boolean
  /** Incorporeal: takes no damage from non-magical sources (collateral, falls, power attacks) */
  noMundaneDamage?: (id: ModelId) => boolean
}
/** Knock a model down unless a rule forbids it. */
export function knockDownUnless(state: GameState, id: ModelId, look: HitLookups, sourceId?: string): { state: GameState; events: GameEvent[] } {
  if (look.noKnockdown?.(id)) return { state, events: [] }
  return addKnockdown(state, id, sourceId)
}

/** Collateral POW by base comparison (R5.18). `sourceMm` is the base of the model doing the hitting. */
export const collateralPow = (sourceMm: number, hitMm: number): 12 | 14 => (sourceMm <= hitMm ? 12 : 14)

/** One unboostable damage roll that is not an attack (collateral, falls). */
export function plainDamage(state: GameState, id: ModelId, pow: number, dice: number, kind: 'collateral' | 'fall', look: HitLookups): { state: GameState; events: GameEvent[] } {
  if (look.noMundaneDamage?.(id)) return { state, events: [] }
  const r = rollDamage(state, { pow, armor: look.arm(id), dice: { added: dice - 2 }, ownerId: id })
  const a = applyDamage(r.state, id, r.points, { source: kind, layouts: look.layouts?.(id) })
  let s = a.state
  const events = [...r.events, ...a.events]
  if (s.models[id]!.life === 'disabled') {
    const d = resolveDeath(s, id, { tough: look.tough?.(id), layouts: look.layouts?.(id), cause: kind })
    s = d.state; events.push(...d.events)
  }
  return { state: s, events }
}

const startedOnHill = (state: GameState, m: ModelState): boolean =>
  terrainPieces(state).some((p) => p.traits.type === 'hill' && circleInsideShape(m.pos, baseRadius(m.base), p.shape))

/** Falling (R5.19): `drop` inches. Knocked down, then 2d6+12 (+1 die per further 2" or part of 2"). */
export function resolveFall(state: GameState, id: ModelId, drop: number, look: HitLookups): { state: GameState; events: GameEvent[] } {
  if (drop < 1 - EPS) return { state, events: [] }
  const dice = 2 + (drop > 2 ? Math.ceil((drop - 2) / 2 - EPS) : 0)
  const kd = addKnockdown(state, id, 'fall')
  const d = plainDamage(kd.state, id, 12, dice, 'fall', look)
  const at = d.state.models[id]!
  return { state: d.state, events: [...kd.events, ...d.events, movedEvent(id, 'fall', at.pos, at.pos, [], at.elev)] }
}
function checkFall(state: GameState, prev: ModelState, id: ModelId, look: HitLookups): { state: GameState; events: GameEvent[] } {
  const drop = prev.elev - state.models[id]!.elev
  if (drop >= 1 - EPS && !startedOnHill(state, prev)) return resolveFall(state, id, drop, look)
  return { state, events: [] }
}

/** Push X (R5.15): directly away from `from`, stops on contact. No rough penalty, no disengage. */
export function push(state: GameState, id: ModelId, from: Vec2, x: number, look: HitLookups, opts: { flying?: boolean } = {}): InvoluntaryResult {
  const m = state.models[id]!
  if (look.immovable?.(id)) return { state, events: [], travelled: 0, stoppedAgainst: false, contacted: [] }
  const sw = sweepFrom(state, m, m.pos, norm(sub(m.pos, from)), x, { passThrough: 'none', obstacles: 'stop', ignoreObstructions: opts.flying })
  const s = relocate(state, id, sw.end)
  const events: GameEvent[] = [movedEvent(id, 'push', m.pos, sw.end, [sw.end], s.models[id]!.elev, stopId(sw))]
  const f = checkFall(s, m, id, look)
  return { state: f.state, events: [...events, ...f.events], travelled: sw.travelled, stoppedAgainst: false, contacted: [] }
}

/**
 * Slam/throw movement of the target (R5.16/R5.17) away from `from`, up to `x`. Rolls collateral for the models it
 * hits; the mover's own knockdown and damage are the caller's (power-attacks.ts).
 */
export function slideAway(state: GameState, id: ModelId, from: Vec2, x: number, mode: 'slam' | 'throw', look: HitLookups): InvoluntaryResult {
  const m = state.models[id]!
  if (look.immovable?.(id)) return { state, events: [], travelled: 0, stoppedAgainst: false, contacted: [] }
  const sw = sweepFrom(state, m, m.pos, norm(sub(m.pos, from)), x, { passThrough: 'smaller', obstacles: 'stop' })
  let s = relocate(state, id, sw.end)
  const events: GameEvent[] = [movedEvent(id, mode, m.pos, sw.end, [sw.end], s.models[id]!.elev, stopId(sw))]
  const k = sw.stoppedBy.kind
  const stoppedAgainst = k === 'obstacle' || k === 'obstruction' || k === 'model'
  const hit = new Set<ModelId>()
  if (mode === 'slam') {
    for (const pid of sw.passedThrough) hit.add(pid)
    if (sw.contacted && s.models[sw.contacted]!.base <= m.base) hit.add(sw.contacted)
  } else {
    for (const o of Object.values(s.models)) {
      if (o.id === id || !isOnTable(o)) continue
      if (edgeDistance(sw.end, m.base, o.pos, o.base) <= 0.01 && o.base <= m.base) hit.add(o.id)
    }
  }
  const contacted = [...hit]
  for (const cid of contacted) {
    const kd = knockDownUnless(s, cid, look, 'collateral')
    s = kd.state; events.push(...kd.events)
    const d = plainDamage(s, cid, collateralPow(m.base, s.models[cid]!.base), 2, 'collateral', look)
    s = d.state; events.push(...d.events)
  }
  if (mode === 'throw') {
    for (const [mid, p] of Object.entries(leastDisturbance(s, id).moves)) {
      const from0 = s.models[mid]!.pos
      s = relocate(s, mid, p)
      events.push(movedEvent(mid, 'leastDisturbance', from0, p, [p], s.models[mid]!.elev))
    }
  }
  const f = checkFall(s, m, id, look)
  return { state: f.state, events: [...events, ...f.events], travelled: sw.travelled, stoppedAgainst, contacted }
}

/** Shifter and any place with placeMode 'b2bWithTarget': put the mover base to base with the target at the legal spot nearest where it stood. */
export function placeBaseToBase(state: GameState, id: ModelId, targetId: ModelId, sourceId?: string): { state: GameState; events: GameEvent[] } | null {
  const me = state.models[id]
  const t = state.models[targetId]
  if (!me || !t || !isOnTable(me) || !isOnTable(t) || me.id === t.id) return null
  if (edgeDistance(me.pos, me.base, t.pos, t.base) <= 0.01) return { state, events: [] }
  const R = baseRadius(me.base) + baseRadius(t.base) + 0.001
  const home = Math.atan2(me.pos.z - t.pos.z, me.pos.x - t.pos.x)
  for (let i = 0; i < 48; i++) {
    const off = Math.ceil(i / 2) * (Math.PI / 24) * (i % 2 === 0 ? 1 : -1)
    const pos = { x: t.pos.x + Math.cos(home + off) * R, z: t.pos.z + Math.sin(home + off) * R }
    if (!isLegalPlacement(state, me.id, pos, me.base).ok) continue
    const s2 = relocate(state, me.id, pos)
    return { state: s2, events: [movedEvent(me.id, 'place', me.pos, pos, [pos], s2.models[me.id]!.elev, sourceId)] }
  }
  return null
}
