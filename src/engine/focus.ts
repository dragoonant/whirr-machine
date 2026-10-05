// 00 section 4, R4.1, R8: focus is a first-class resource. Every change goes through these functions and emits FocusChanged.
import { cortexCrippled, isCaster, isDisrupted, isInert, isWarEngine, modelStat } from './effects'
import type { GameEvent } from './events'
import type { DataBundle, FocusPurpose, FocusReason, GameState, ModelId, ModelState, Rejection } from './types'

export const WAR_ENGINE_FOCUS_CAP = 3 // p100, p102

const setModel = (s: GameState, m: ModelState): GameState => ({ ...s, models: { ...s.models, [m.id]: m } })

/** True when this model can hold focus at all (R8.9, R9.4, crippled Cortex). */
export function canHoldFocus(state: GameState, m: ModelState): boolean {
  if (isInert(m) || m.life !== 'active') return false
  if (isWarEngine(m)) return !isDisrupted(state, m) && !cortexCrippled(m)
  return true
}
export const focusCap = (m: ModelState): number => (isWarEngine(m) ? WAR_ENGINE_FOCUS_CAP : Infinity)

function setFocus(state: GameState, id: ModelId, value: number, reason: FocusReason, purpose?: FocusPurpose, fromId?: ModelId): { state: GameState; events: GameEvent[] } {
  const m = state.models[id]!
  if (value === m.focus) return { state, events: [] }
  return {
    state: setModel(state, { ...m, focus: value }),
    events: [{ type: 'FocusChanged', modelId: id, delta: value - m.focus, after: value, reason, purpose, fromId }],
  }
}

/** Give focus. War-engines stop at 3 and take nothing while inert, disrupted or cortex-crippled. Returns the amount actually gained. */
export function gainFocus(state: GameState, id: ModelId, n: number, reason: FocusReason = 'gain', fromId?: ModelId): { state: GameState; events: GameEvent[]; gained: number } {
  const m = state.models[id]
  if (!m || n <= 0 || !canHoldFocus(state, m)) return { state, events: [], gained: 0 }
  const target = Math.min(m.focus + n, focusCap(m))
  const r = setFocus(state, id, target, reason, undefined, fromId)
  return { ...r, gained: target - m.focus }
}

/** Remove all focus (maintenance clear, disruption). */
export function clearFocus(state: GameState, id: ModelId, reason: FocusReason = 'maintenanceClear'): { state: GameState; events: GameEvent[] } {
  const m = state.models[id]
  if (!m || m.focus === 0) return { state, events: [] }
  return setFocus(state, id, 0, reason)
}

/** The one spend function (00 section 4). Rejects with E_INSUFFICIENT_FOCUS or E_CRIPPLED; never goes below 0. */
export function spendFocus(state: GameState, id: ModelId, n: number, purpose: FocusPurpose): { state: GameState; events: GameEvent[] } | { rejection: Rejection } {
  const m = state.models[id]
  if (!m) return { rejection: { code: 'E_TARGET_INVALID', message: `no model ${id}` } }
  if (isWarEngine(m) && (cortexCrippled(m) || isDisrupted(state, m) || isInert(m))) return { rejection: { code: 'E_CRIPPLED', message: 'this war-engine cannot use focus' } }
  if (m.focus < n) return { rejection: { code: 'E_INSUFFICIENT_FOCUS', message: `${id} has ${m.focus} focus, needs ${n}` } }
  const after = m.focus - n
  return {
    state: setModel(state, { ...m, focus: after }),
    events: n === 0 ? [] : [{ type: 'FocusChanged', modelId: id, delta: -n, after, reason: 'spend', purpose }],
  }
}
export const isRejection = (r: object): r is { rejection: Rejection } => 'rejection' in r

/** R4.1 Maintenance: war-engines lose all focus; casters above ARC drop to ARC (R4.1). */
export function maintenanceFocus(state: GameState, bundle: DataBundle, player: 'A' | 'B'): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  for (const m of Object.values(state.models)) {
    if (m.owner !== player || m.life === 'destroyed') continue
    if (isWarEngine(m)) {
      const r = clearFocus(s, m.id, 'maintenanceClear'); s = r.state; events.push(...r.events)
    } else if (isCaster(m)) {
      const arc = modelStat(s, bundle, m.id, 'ARC')
      if (s.models[m.id]!.focus > arc) { const r = setFocus(s, m.id, arc, 'trim'); s = r.state; events.push(...r.events) }
    }
  }
  return { state: s, events }
}

/** R4.4 Control: casters refill to current ARC (a crippled or inert model does not matter for casters). */
export function refillCasters(state: GameState, bundle: DataBundle, player: 'A' | 'B'): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  for (const m of Object.values(state.models)) {
    if (m.owner !== player || !isCaster(m) || m.life !== 'active' || m.offTable) continue
    const arc = modelStat(s, bundle, m.id, 'ARC')
    if (m.focus !== arc) { const r = setFocus(s, m.id, arc, 'refill'); s = r.state; events.push(...r.events) }
  }
  return { state: s, events }
}

/** Accumulator-style and other transfers: move up to n focus between two models (never past the cap). */
export function transferFocus(state: GameState, fromId: ModelId, toId: ModelId, n: number, reason: FocusReason = 'allocate'): { state: GameState; events: GameEvent[]; moved: number } {
  const from = state.models[fromId]
  const to = state.models[toId]
  if (!from || !to || !canHoldFocus(state, to)) return { state, events: [], moved: 0 }
  const moved = Math.max(0, Math.min(n, from.focus, focusCap(to) - to.focus))
  if (moved === 0) return { state, events: [], moved: 0 }
  const a = setFocus(state, fromId, from.focus - moved, reason)
  const b = setFocus(a.state, toId, to.focus + moved, reason, undefined, fromId)
  return { state: b.state, events: [...a.events, ...b.events], moved }
}
