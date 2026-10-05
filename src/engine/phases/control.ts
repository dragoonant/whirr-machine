// R4.4-R4.8: Control Phase. Refill and power up are automatic; allocate, upkeep and shake are decisions
// (each raised only when a real choice exists). Pure.
import type { Action, AllocateFocusAction, PayUpkeepAction, ShakeAction } from '../actions'
import { effectsOn, isCaster, isWarEngine, modelStat, removeCondition, removeEffect } from '../effects'
import type { GameEvent } from '../events'
import {
  canHoldFocus, focusCap, gainFocus, isRejection, refillCasters, spendFocus, transferFocus, WAR_ENGINE_FOCUS_CAP,
} from '../focus'
import { within } from '../measure'
import { raise } from '../pending'
import type {
  DataBundle, DecisionOption, EffectInstance, GameState, ModelId, ModelState, PendingDecision, Rejection, StoredConditionId,
} from '../types'

export type ControlStage = 'start' | 'upkeep' | 'shake' | 'done'
export interface ControlOut { state: GameState; events: GameEvent[]; pending: PendingDecision | null }
type P = 'A' | 'B'

// ---------- queries ----------
const casters = (s: GameState, p: P): ModelState[] => Object.values(s.models).filter((m) => m.owner === p && isCaster(m) && m.life === 'active' && !m.offTable)
/** War-engines of this caster inside its CTRL. */
export function cohortsInCtrl(s: GameState, b: DataBundle, caster: ModelState): ModelState[] {
  const ctrl = modelStat(s, b, caster.id, 'CTRL')
  return Object.values(s.models).filter((w) => isWarEngine(w) && w.controllerId === caster.id && w.life === 'active' && !w.offTable && within(caster, w, ctrl))
}
const allocTargets = (s: GameState, b: DataBundle, p: P): { caster: ModelState; to: ModelState }[] =>
  casters(s, p).flatMap((c) => (c.focus > 0 ? cohortsInCtrl(s, b, c).filter((w) => canHoldFocus(s, w) && w.focus < focusCap(w)).map((to) => ({ caster: c, to })) : []))
const upkeepEffects = (s: GameState, p: P): EffectInstance[] =>
  s.effects.filter((e) => e.upkeep && s.models[e.upkeep.casterId]?.owner === p && s.models[e.upkeep.casterId]!.life === 'active')
export interface ShakeOption { modelId: ModelId; condition?: StoredConditionId; effectId?: string }
/** R4.8: what each caster or war-engine with at least 1 focus could shake off. */
export function shakeOptions(s: GameState, p: P): ShakeOption[] {
  const out: ShakeOption[] = []
  for (const m of Object.values(s.models)) {
    if (m.owner !== p || m.life !== 'active' || m.offTable || m.inert || m.focus < 1 || !(isCaster(m) || isWarEngine(m))) continue
    for (const c of ['knockedDown', 'stationary'] as StoredConditionId[]) {
      if (m.conditions.includes(c)) out.push({ modelId: m.id, condition: c })
      else { const e = effectsOn(s, m.id).find((x) => x.conditions?.includes(c)); if (e) out.push({ modelId: m.id, condition: c, effectId: e.id }) }
    }
    for (const e of effectsOn(s, m.id)) if (e.shakeable && !e.conditions?.some((c) => c === 'knockedDown' || c === 'stationary')) out.push({ modelId: m.id, effectId: e.id })
  }
  return out
}

// ---------- the stage machine ----------
/** Greedy default allocation: top each cohort up to the cap, in id order, while the caster has focus. */
export function defaultAllocation(s: GameState, b: DataBundle, p: P): Record<ModelId, number> {
  const left = new Map<ModelId, number>()
  const alloc: Record<ModelId, number> = {}
  for (const t of allocTargets(s, b, p).sort((x, y) => x.to.id.localeCompare(y.to.id))) {
    const have = left.get(t.caster.id) ?? t.caster.focus
    const give = Math.min(have, WAR_ENGINE_FOCUS_CAP - t.to.focus)
    if (give > 0) { alloc[t.to.id] = give; left.set(t.caster.id, have - give) }
  }
  return alloc
}

function withOptions(r: { state: GameState; pending: PendingDecision }, options: DecisionOption[]): { state: GameState; pending: PendingDecision } {
  const pending = { ...r.pending, options }
  return { state: { ...r.state, pending }, pending }
}

function raiseAllocate(s: GameState, b: DataBundle, p: P): { state: GameState; pending: PendingDecision } {
  const targets = allocTargets(s, b, p).map((t) => ({ casterId: t.caster.id, modelId: t.to.id, focus: t.to.focus }))
  const r = raise(s, { player: p, kind: 'allocateFocus', window: 'control.allocate', context: { data: { targets } }, canPass: true })
  const id = r.pending.id
  return withOptions(r, [
    { id: 'default', label: 'Fill cohorts to 3', action: { type: 'allocateFocus', decisionId: id, player: p, allocation: defaultAllocation(s, b, p) } },
    { id: 'none', label: 'Keep all focus', action: { type: 'allocateFocus', decisionId: id, player: p, allocation: {} } },
  ])
}

function raiseUpkeep(s: GameState, p: P): { state: GameState; pending: PendingDecision } {
  const ups = upkeepEffects(s, p)
  const r = raise(s, { player: p, kind: 'payUpkeep', window: 'control.upkeep', context: { effectIds: ups.map((e) => e.id) }, canPass: true })
  const id = r.pending.id
  const budget = new Map<ModelId, number>()
  const keepable: string[] = []
  for (const e of ups) {
    const c = e.upkeep!.casterId
    const left = budget.get(c) ?? s.models[c]!.focus
    if (left > 0) { keepable.push(e.id); budget.set(c, left - 1) }
  }
  return withOptions(r, [
    { id: 'keep', label: 'Keep what you can afford', cost: { focus: keepable.length }, action: { type: 'payUpkeep', decisionId: id, player: p, keep: keepable } },
    { id: 'drop', label: 'Drop every upkeep', action: { type: 'payUpkeep', decisionId: id, player: p, keep: [] } },
  ])
}

function raiseShake(s: GameState, p: P): { state: GameState; pending: PendingDecision } {
  const opts = shakeOptions(s, p)
  const r = raise(s, { player: p, kind: 'shake', window: 'control.shake', context: { data: { options: opts } }, canPass: true })
  const id = r.pending.id
  const seen = new Set<ModelId>()
  const first = opts.filter((o) => (seen.has(o.modelId) ? false : (seen.add(o.modelId), true)))
  return withOptions(r, [
    { id: 'shakeAll', label: 'Shake everything possible', cost: { focus: first.length }, action: { type: 'shake', decisionId: id, player: p, shake: first } },
    { id: 'none', label: 'Do not shake', action: { type: 'shake', decisionId: id, player: p, shake: [] } },
  ])
}

/** Run Control from the start (refill, power up, then the first decision that needs an answer). */
export function runControl(state: GameState, b: DataBundle): ControlOut {
  let s: GameState = { ...state, phase: 'control', window: 'control.refill' }
  const events: GameEvent[] = [{ type: 'PhaseChanged', phase: 'control', window: 'control.refill' }]
  const p = s.activePlayer
  const r = refillCasters(s, b, p); s = r.state; events.push(...r.events)
  // R4.5 power up: each cohort with an uncrippled cortex inside its caster's CTRL gains 1 focus
  s = { ...s, window: 'control.powerUp' }
  events.push({ type: 'WindowOpened', window: 'control.powerUp' })
  for (const c of casters(s, p)) {
    for (const w of cohortsInCtrl(s, b, c)) {
      const g = gainFocus(s, w.id, 1, 'powerUp', c.id); s = g.state; events.push(...g.events)
    }
  }
  return continueControl(s, b, 'start', events)
}

/** Raise the next control decision at or after `from`; pending null = Control is finished. */
export function continueControl(state: GameState, b: DataBundle, from: ControlStage, events: GameEvent[] = []): ControlOut {
  let s = state
  const p = s.activePlayer
  if (from === 'start') {
    s = { ...s, window: 'control.allocate' }
    events.push({ type: 'WindowOpened', window: 'control.allocate' })
    if (allocTargets(s, b, p).length > 0) {
      const r = raiseAllocate(s, b, p)
      return { state: r.state, events, pending: r.pending }
    }
    from = 'upkeep'
  }
  if (from === 'upkeep') {
    s = { ...s, window: 'control.upkeep' }
    events.push({ type: 'WindowOpened', window: 'control.upkeep' })
    const ups = upkeepEffects(s, p)
    // a caster with no focus cannot keep anything: drop without asking
    if (ups.some((e) => s.models[e.upkeep!.casterId]!.focus > 0)) {
      const r = raiseUpkeep(s, p)
      return { state: r.state, events, pending: r.pending }
    }
    for (const e of ups) { const r = removeEffect(s, e.id, 'upkeepDropped'); s = r.state; events.push(...r.events) }
    if (ups.length) events.push({ type: 'DecisionAutoResolved', kind: 'payUpkeep', optionId: 'drop' })
    from = 'shake'
  }
  if (from === 'shake') {
    s = { ...s, window: 'control.shake' }
    events.push({ type: 'WindowOpened', window: 'control.shake' })
    if (shakeOptions(s, p).length > 0) {
      const r = raiseShake(s, p)
      return { state: r.state, events, pending: r.pending }
    }
  }
  return { state: s, events, pending: null }
}

// ---------- validation and application of the answers ----------
function validateAllocate(s: GameState, b: DataBundle, a: AllocateFocusAction): Rejection | null {
  const spent = new Map<ModelId, number>()
  for (const [id, n] of Object.entries(a.allocation)) {
    if (!Number.isInteger(n) || n < 0) return { code: 'E_BAD_PAYLOAD', message: 'allocation must be whole numbers >= 0' }
    if (n === 0) continue
    const w = s.models[id]
    if (!w || !isWarEngine(w) || w.owner !== a.player || w.life !== 'active' || !w.controllerId) return { code: 'E_TARGET_INVALID', message: `${id} cannot receive focus` }
    const c = s.models[w.controllerId]
    if (!c || c.life !== 'active' || !isCaster(c)) return { code: 'E_TARGET_INVALID', message: `${id} has no caster` }
    if (!canHoldFocus(s, w)) return { code: 'E_CRIPPLED', message: `${id} cannot hold focus` }
    if (!within(c, w, modelStat(s, b, c.id, 'CTRL'))) return { code: 'E_OUT_OF_CTRL', message: `${id} is outside CTRL` }
    if (w.focus + n > WAR_ENGINE_FOCUS_CAP) return { code: 'E_FOCUS_CAP', message: `${id} would exceed ${WAR_ENGINE_FOCUS_CAP} focus` }
    const total = (spent.get(c.id) ?? 0) + n
    if (total > c.focus) return { code: 'E_INSUFFICIENT_FOCUS', message: `${c.id} has ${c.focus} focus` }
    spent.set(c.id, total)
  }
  return null
}
function validateUpkeep(s: GameState, a: PayUpkeepAction): Rejection | null {
  const ups = new Map(upkeepEffects(s, a.player).map((e) => [e.id, e]))
  const spent = new Map<ModelId, number>()
  for (const id of new Set(a.keep)) {
    const e = ups.get(id)
    if (!e) return { code: 'E_NOT_AN_OPTION', message: `${id} is not an upkeep you can keep` }
    const c = e.upkeep!.casterId
    const n = (spent.get(c) ?? 0) + 1
    if (n > s.models[c]!.focus) return { code: 'E_INSUFFICIENT_FOCUS', message: `${c} cannot pay ${n} upkeeps` }
    spent.set(c, n)
  }
  return null
}
function validateShake(s: GameState, a: ShakeAction): Rejection | null {
  const opts = shakeOptions(s, a.player)
  const seen = new Set<ModelId>()
  for (const x of a.shake) {
    if (seen.has(x.modelId)) return { code: 'E_ALREADY_USED', message: `${x.modelId} may shake only once` }
    seen.add(x.modelId)
    if (!opts.some((o) => o.modelId === x.modelId && (x.condition ? o.condition === x.condition : true) && (x.effectId ? o.effectId === x.effectId : true))) {
      const m = s.models[x.modelId]
      if (m && m.focus < 1) return { code: 'E_INSUFFICIENT_FOCUS', message: `${x.modelId} has no focus` }
      return { code: 'E_NOT_AN_OPTION', message: `${x.modelId} has nothing to shake` }
    }
  }
  return null
}

export function validateControlAnswer(s: GameState, b: DataBundle, a: Action): Rejection | null {
  switch (a.type) {
    case 'allocateFocus': return s.pending.kind === 'allocateFocus' ? validateAllocate(s, b, a) : { code: 'E_WRONG_DECISION', message: 'not allocating' }
    case 'payUpkeep': return s.pending.kind === 'payUpkeep' ? validateUpkeep(s, a) : { code: 'E_WRONG_DECISION', message: 'not paying upkeep' }
    case 'shake': return s.pending.kind === 'shake' ? validateShake(s, a) : { code: 'E_WRONG_DECISION', message: 'not shaking' }
    case 'pass': return s.pending.canPass ? null : { code: 'E_NOT_AN_OPTION', message: 'cannot pass' }
    default: return { code: 'E_WRONG_DECISION', message: `${a.type} does not answer a control decision` }
  }
}

/** Apply an answer to the open control decision; returns the next decision (null = Control finished). */
export function answerControl(state: GameState, b: DataBundle, a: Action): ControlOut | { rejection: Rejection } {
  const bad = validateControlAnswer(state, b, a)
  if (bad) return { rejection: bad }
  let s = state
  const events: GameEvent[] = []
  const kind = state.pending.kind
  if (kind === 'allocateFocus') {
    if (a.type === 'allocateFocus') {
      for (const [id, n] of Object.entries(a.allocation)) {
        if (n <= 0) continue
        const t = transferFocus(s, s.models[id]!.controllerId!, id, n, 'allocate'); s = t.state; events.push(...t.events)
      }
    }
    return continueControl(s, b, 'upkeep', events)
  }
  if (kind === 'payUpkeep') {
    const keep = new Set(a.type === 'payUpkeep' ? a.keep : [])
    for (const e of upkeepEffects(s, state.pending.player)) {
      if (keep.has(e.id)) {
        const c = e.upkeep!.casterId
        const sp = spendFocus(s, c, 1, 'upkeep')
        if (isRejection(sp)) return { rejection: sp.rejection }
        s = sp.state; events.push(...sp.events, { type: 'UpkeepPaid', effectId: e.id, casterId: c })
      } else { const r = removeEffect(s, e.id, 'upkeepDropped'); s = r.state; events.push(...r.events) }
    }
    return continueControl(s, b, 'shake', events)
  }
  if (a.type === 'shake') {
    for (const x of a.shake) {
      const sp = spendFocus(s, x.modelId, 1, 'shake')
      if (isRejection(sp)) return { rejection: sp.rejection }
      s = sp.state; events.push(...sp.events)
      const m = s.models[x.modelId]!
      if (x.condition && m.conditions.includes(x.condition)) { const r = removeCondition(s, x.modelId, x.condition, 'shake'); s = r.state; events.push(...r.events) }
      else {
        const eid = x.effectId ?? effectsOn(s, x.modelId).find((e) => x.condition && e.conditions?.includes(x.condition))?.id
        if (eid) { const r = removeEffect(s, eid, 'shaken'); s = r.state; events.push(...r.events) }
      }
    }
  }
  return continueControl(s, b, 'done', events)
}

/** Sample of legal answers to the open control decision (never empty). */
export function controlLegalActions(state: GameState): Action[] {
  const out: Action[] = (state.pending.options ?? []).map((o) => o.action)
  if (state.pending.canPass) out.push({ type: 'pass', decisionId: state.pending.id, player: state.pending.player })
  return out
}
