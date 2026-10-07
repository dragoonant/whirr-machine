// 00 section 4, R4.1, R8: focus is a first-class resource. Every change goes through these functions and emits FocusChanged.
import { cortexCrippled, isCaster, isDisrupted, isInert, isWarEngine, modelStat } from './effects'
import type { GameEvent } from './events'
import { canForce, force, isBeast, isFuryModel, isWarlock, maintenanceFury, spendFury } from './fury'
import { sheafBlocked } from './factions/menoth'
import type { DataBundle, ForcePurpose, FocusPurpose, FocusReason, FuryPurpose, GameState, ModelId, ModelState, Rejection } from './types'

export const WAR_ENGINE_FOCUS_CAP = 3 // p100, p102

const setModel = (s: GameState, m: ModelState): GameState => ({ ...s, models: { ...s.models, [m.id]: m } })

/** True when this model can hold focus at all (R8.9, R9.4, crippled Cortex). */
export function canHoldFocus(state: GameState, m: ModelState): boolean {
  if (isFuryModel(m)) return false // fury models never hold focus (M9, 81 B.3)
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
export function spendFocus(state: GameState, id: ModelId, n: number, purpose: FocusPurpose, bundle?: DataBundle): { state: GameState; events: GameEvent[] } | { rejection: Rejection } {
  const m = state.models[id]
  if (!m) return { rejection: { code: 'E_TARGET_INVALID', message: `no model ${id}` } }
  if (isFuryModel(m)) return pay(state, bundle, id, n, purpose) // M9: fury models never spend focus
  if (isWarEngine(m) && (cortexCrippled(m) || isDisrupted(state, m) || isInert(m))) return { rejection: { code: 'E_CRIPPLED', message: 'this war-engine cannot use focus' } }
  if (n > 0 && bundle && sheafBlocked(state, bundle, id)) return { rejection: { code: 'E_NOT_AN_OPTION', message: 'the Gift of the Sheaf: this cohort model cannot spend focus' } } // menoth
  if (m.focus < n) return { rejection: { code: 'E_INSUFFICIENT_FOCUS', message: `${id} has ${m.focus} focus, needs ${n}` } }
  const after = m.focus - n
  return {
    state: setModel(state, { ...m, focus: after }),
    events: n === 0 ? [] : [{ type: 'FocusChanged', modelId: id, delta: -n, after, reason: 'spend', purpose }],
  }
}
// M9 (81 B.3): one dispatch layer. A warlock pays fury, a beast is forced (gains fury), everything else pays focus.
const FORCE_PURPOSE: Partial<Record<FocusPurpose, ForcePurpose>> = {
  boostAttack: 'boostAttack', boostDamage: 'boostDamage', additionalAttack: 'additionalAttack', spell: 'animus', shake: 'shake',
  run: 'run', charge: 'charge', powerAttack: 'powerAttack', reload: 'reload',
}
const FURY_PURPOSE: Partial<Record<FocusPurpose, FuryPurpose>> = {
  boostAttack: 'boostAttack', boostDamage: 'boostDamage', additionalAttack: 'additionalAttack', spell: 'spell', upkeep: 'upkeep',
  shake: 'shake', heal: 'heal', reload: 'reload',
}
/** Can this model pay `n` for the purpose? Focus models read focus, warlocks read fury, beasts need the forceable gate. */
export function canPay(state: GameState, bundle: DataBundle | undefined, m: ModelState, n = 1, purpose?: FocusPurpose): boolean {
  if (isWarlock(m)) return (m.fury ?? 0) >= n
  if (isBeast(m)) return !!bundle && !canForce(state, bundle, m.id, n, purpose ? FORCE_PURPOSE[purpose] : undefined)
  if (isWarEngine(m) && (cortexCrippled(m) || isDisrupted(state, m) || isInert(m))) return false
  if (bundle && n > 0 && sheafBlocked(state, bundle, m.id)) return false // menoth: the Gift of the Sheaf
  return m.focus >= n
}
/** Pay in the model's own currency (focus, fury or forced fury). Beasts need the bundle (FURY and CTRL are stats). */
export function pay(state: GameState, bundle: DataBundle | undefined, id: ModelId, n: number, purpose: FocusPurpose): { state: GameState; events: GameEvent[] } | { rejection: Rejection } {
  const m = state.models[id]
  if (m && isBeast(m)) {
    if (!bundle) return { rejection: { code: 'E_CANNOT_FORCE', message: 'forcing needs the data bundle' } }
    return force(state, bundle, id, n, FORCE_PURPOSE[purpose] ?? 'ability')
  }
  if (m && isWarlock(m)) return spendFury(state, id, n, FURY_PURPOSE[purpose] ?? 'spell')
  return spendFocus(state, id, n, purpose)
}
/** Why a fury model cannot pay (the same rejection a real spend would give), or null. Focus models return null (their own checks run). */
export function payBlock(state: GameState, bundle: DataBundle | undefined, m: ModelState, n: number, purpose?: FocusPurpose): Rejection | null {
  if (isWarlock(m)) return (m.fury ?? 0) >= n ? null : { code: 'E_INSUFFICIENT_FURY', message: `${m.id} has ${m.fury ?? 0} fury, needs ${n}` }
  if (isBeast(m)) return bundle ? canForce(state, bundle, m.id, n, purpose ? FORCE_PURPOSE[purpose] : undefined) : { code: 'E_CANNOT_FORCE', message: 'forcing needs the data bundle' }
  return null
}
/** DecisionOption.cost for paying `n` in the model's own currency (81 C.3). */
export function costFor(m: ModelState | undefined, n: number): { focus: number; fury?: number; forced?: number } {
  if (m && isWarlock(m)) return { focus: 0, fury: n }
  if (m && isBeast(m)) return { focus: 0, forced: n }
  return { focus: n }
}
export const isRejection = (r: object): r is { rejection: Rejection } => 'rejection' in r

/** R4.1 Maintenance: war-engines lose all focus; casters above ARC drop to ARC (R4.1). */
export function maintenanceFocus(state: GameState, bundle: DataBundle, player: 'A' | 'B'): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  for (const m of Object.values(state.models)) {
    if (m.owner !== player || m.life === 'destroyed' || isFuryModel(m)) continue
    if (isWarEngine(m)) {
      const r = clearFocus(s, m.id, 'maintenanceClear'); s = r.state; events.push(...r.events)
    } else if (isCaster(m)) {
      const arc = modelStat(s, bundle, m.id, 'ARC')
      if (s.models[m.id]!.focus > arc) { const r = setFocus(s, m.id, arc, 'trim'); s = r.state; events.push(...r.events) }
    }
  }
  const fy = maintenanceFury(s, bundle, player) // M9: warlocks trimmed to ARC, beasts keep their fury
  return { state: fy.state, events: [...events, ...fy.events] }
}

/** R4.4 Control: casters refill to current ARC (a crippled or inert model does not matter for casters). */
export function refillCasters(state: GameState, bundle: DataBundle, player: 'A' | 'B'): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  for (const m of Object.values(state.models)) {
    if (m.owner !== player || !isCaster(m) || isFuryModel(m) || m.life !== 'active' || m.offTable) continue
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
