// R4.4-R4.8 and M9 81 F3: Control Phase. Refill and power up are automatic; leech (fury), allocate, upkeep, threshold and shake
// are decisions or steps (each raised only when a real choice exists). Pure.
import type { Action, AdjustFuryAction, AllocateFocusAction, LeechAction, PayUpkeepAction, ShakeAction } from '../actions'
import { applyDamage, layoutsFor, resolveDeath } from '../damage'
import { effectsOn, isCaster, isWarEngine, modelStat, profileOf, removeCondition, removeEffect } from '../effects'
import type { GameEvent } from '../events'
import {
  canHoldFocus, focusCap, gainFocus, isRejection, pay, refillCasters, spendFocus, transferFocus, WAR_ENGINE_FOCUS_CAP,
} from '../focus'
import {
  applySpiritBond, forceGate, isBeast, isFuryModel, isFuryRejection, isWarlock, leechFury, markWildBeasts, setFury, spendFury, thresholdEligible,
  thresholdInfo, validateLeech,
} from '../fury'
import { rollNd6 } from '../dice'
import { within } from '../measure'
import { leechNeeded, raise, raiseGameOver, raiseLeech, raiseVent } from '../pending'
import { afterDeaths } from '../scenario'
import { runFrenzy } from './frenzy'
import { resourcefulFree } from '../factions/trollbloods'
import { applyAmbush, raiseAmbush, validateAmbush } from '../ambush'
import { applyApparition, raiseApparition, validateApparition } from '../factions/cryx'
import type {
  DataBundle, DecisionOption, EffectInstance, GameState, ModelId, ModelState, PendingDecision, Rejection, StoredConditionId,
} from '../types'

export type ControlStage = 'leech' | 'powerUp' | 'start' | 'upkeep' | 'threshold' | 'shake' | 'apparition' | 'ambush' | 'done'
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
/** What a model can pay in Control for upkeep: fury for a warlock, nothing for a beast (F6.3), focus otherwise. */
const upkeepBudget = (m: ModelState): number => (isWarlock(m) ? m.fury ?? 0 : isBeast(m) ? 0 : m.focus)
export interface ShakeOption { modelId: ModelId; condition?: StoredConditionId; effectId?: string }
/** Can this model pay for a shake: focus models 1 focus, a warlock 1 fury, a beast the forceable gate (needs the bundle). */
function canShake(s: GameState, m: ModelState, b?: DataBundle): boolean {
  if (isWarlock(m)) return (m.fury ?? 0) >= 1
  if (isBeast(m)) return !!b && !forceGate(s, b, m.id, 1, 'shake')
  return m.focus >= 1 && (isCaster(m) || isWarEngine(m))
}
/** R4.8, F6.4, F6.5: what each model that can pay could shake off. Beasts are only listed when the bundle is given. */
export function shakeOptions(s: GameState, p: P, b?: DataBundle): ShakeOption[] {
  const out: ShakeOption[] = []
  for (const m of Object.values(s.models)) {
    if (m.owner !== p || m.life !== 'active' || m.offTable || m.inert || !canShake(s, m, b)) continue
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

/** Resourceful (Trollbloods): keeping an upkeep on the caster or one of its own beasts costs nothing. */
const upkeepFree = (s: GameState, b: DataBundle, e: EffectInstance): boolean => !!e.targetIds[0] && e.targetIds.every((t) => resourcefulFree(s, b, e.upkeep!.casterId, t))

function raiseUpkeep(s: GameState, b: DataBundle, p: P): { state: GameState; pending: PendingDecision } {
  const ups = upkeepEffects(s, p)
  const r = raise(s, { player: p, kind: 'payUpkeep', window: 'control.upkeep', context: { effectIds: ups.map((e) => e.id) }, canPass: true })
  const id = r.pending.id
  const budget = new Map<ModelId, number>()
  const keepable: string[] = []
  let furyCost = 0
  for (const e of ups) {
    const c = e.upkeep!.casterId
    if (upkeepFree(s, b, e)) { keepable.push(e.id); continue }
    const left = budget.get(c) ?? upkeepBudget(s.models[c]!)
    if (left > 0) { keepable.push(e.id); budget.set(c, left - 1); if (isWarlock(s.models[c]!)) furyCost++ }
  }
  return withOptions(r, [
    { id: 'keep', label: 'Keep what you can afford', cost: { focus: keepable.length - furyCost, ...(furyCost ? { fury: furyCost } : {}) }, action: { type: 'payUpkeep', decisionId: id, player: p, keep: keepable } },
    { id: 'drop', label: 'Drop every upkeep', action: { type: 'payUpkeep', decisionId: id, player: p, keep: [] } },
  ])
}

function raiseShake(s: GameState, b: DataBundle, p: P): { state: GameState; pending: PendingDecision } {
  const opts = shakeOptions(s, p, b)
  const r = raise(s, { player: p, kind: 'shake', window: 'control.shake', context: { data: { options: opts } }, canPass: true })
  const id = r.pending.id
  const seen = new Set<ModelId>()
  const first = opts.filter((o) => (seen.has(o.modelId) ? false : (seen.add(o.modelId), true)))
  const fx = first.filter((o) => isWarlock(s.models[o.modelId]!)).length
  const fo = first.filter((o) => isBeast(s.models[o.modelId]!)).length
  return withOptions(r, [
    { id: 'shakeAll', label: 'Shake everything possible', cost: { focus: first.length - fx - fo, ...(fx ? { fury: fx } : {}), ...(fo ? { forced: fo } : {}) }, action: { type: 'shake', decisionId: id, player: p, shake: first } },
    { id: 'none', label: 'Do not shake', action: { type: 'shake', decisionId: id, player: p, shake: [] } },
  ])
}

/** Run Control from the start: C1 refill, then C2 leech (a decision per warlock that has a choice), C3 power up, C4... */
export function runControl(state: GameState, b: DataBundle): ControlOut {
  let s: GameState = { ...state, phase: 'control', window: 'control.refill' }
  const events: GameEvent[] = [{ type: 'PhaseChanged', phase: 'control', window: 'control.refill' }]
  const p = s.activePlayer
  const r = refillCasters(s, b, p); s = r.state; events.push(...r.events)
  return continueControl(s, b, 'leech', events)
}

const warlocksOf = (s: GameState, p: P): ModelState[] => casters(s, p).filter(isWarlock).sort((a, c) => a.id.localeCompare(c.id))
const withoutQueue = (s: GameState): GameState => { const { thresholdQueue: _q, ...rest } = s; return rest as GameState }

/** After a warlock's C2 is settled: Spirit Bond (auto, F4.6) and the summary event. */
function settleLeech(state: GameState, b: DataBundle, warlockId: ModelId, sources: { modelId: ModelId; points: number }[], selfPoints: number): { state: GameState; events: GameEvent[] } {
  const bond = applySpiritBond(state, b, warlockId)
  const events = [...bond.events]
  if (sources.length || selfPoints || bond.points) {
    events.push({ type: 'FuryLeeched', warlockId, sources, selfPoints, spiritBond: bond.points, after: bond.state.models[warlockId]!.fury ?? 0 })
  }
  return { state: bond.state, events }
}

/** A warlock gone (self-leech killed it): beasts go wild, upkeeps end, and the game may be over. */
function afterWarlockDeath(state: GameState, b: DataBundle, warlockId: ModelId): { state: GameState; events: GameEvent[]; ended: boolean } {
  const w = markWildBeasts(state, warlockId)
  const a = afterDeaths(w.state, b)
  return { state: a.state, events: [...w.events, ...a.events], ended: a.ended }
}

/** Raise the next control decision at or after `from`; pending null = Control is finished. `cursor` = the last warlock whose leech is done. */
export function continueControl(state: GameState, b: DataBundle, from: ControlStage, events: GameEvent[] = [], cursor?: ModelId): ControlOut {
  let s = state
  const p = s.activePlayer
  if (from === 'leech') {
    if (cursor === undefined) { s = { ...s, window: 'control.leech' }; events.push({ type: 'WindowOpened', window: 'control.leech' }) }
    for (const w of warlocksOf(s, p).filter((x) => cursor === undefined || x.id.localeCompare(cursor) > 0)) {
      if (leechNeeded(s, b, w.id)) {
        const r = raiseLeech(s, b, w.id)
        return { state: r.state, events, pending: r.pending }
      }
      const t = settleLeech(s, b, w.id, [], 0); s = t.state; events.push(...t.events)
    }
    from = 'powerUp'
  }
  if (from === 'powerUp') {
    // R4.5 power up: each cohort with an uncrippled cortex inside its caster's CTRL gains 1 focus
    s = { ...s, window: 'control.powerUp' }
    events.push({ type: 'WindowOpened', window: 'control.powerUp' })
    for (const c of casters(s, p)) {
      for (const w of cohortsInCtrl(s, b, c)) {
        const g = gainFocus(s, w.id, 1, 'powerUp', c.id); s = g.state; events.push(...g.events)
      }
    }
    from = 'start'
  }
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
    // a caster with nothing to pay with cannot keep anything: drop without asking
    if (ups.some((e) => upkeepFree(s, b, e) || upkeepBudget(s.models[e.upkeep!.casterId]!) > 0)) {
      const r = raiseUpkeep(s, b, p)
      return { state: r.state, events, pending: r.pending }
    }
    for (const e of ups) { const r = removeEffect(s, e.id, 'upkeepDropped'); s = r.state; events.push(...r.events) }
    if (ups.length) events.push({ type: 'DecisionAutoResolved', kind: 'payUpkeep', optionId: 'drop' })
    from = 'threshold'
  }
  if (from === 'threshold') {
    if (s.thresholdQueue === undefined) {
      s = { ...s, window: 'control.threshold' }
      events.push({ type: 'WindowOpened', window: 'control.threshold' })
      s = { ...s, thresholdQueue: Object.values(s.models).filter((m) => m.owner === p && thresholdEligible(b, m)).map((m) => m.id).sort() }
    }
    let queue = s.thresholdQueue ?? []
    while (queue.length > 0) {
      const id = queue[0]!
      queue = queue.slice(1)
      const m = s.models[id]
      if (!m || !thresholdEligible(b, m)) continue
      const info = thresholdInfo(s, b, id)
      const r = rollNd6(s, 2, 'threshold', { ownerId: id, target: info.thr + 1 - info.fury })
      s = r.state; events.push(r.event)
      const total = r.total + info.fury
      const frenzied = total > info.thr
      events.push({ type: 'ThresholdChecked', beastId: id, rollId: r.event.rollId, fury: info.fury, thr: info.thr, total, frenzied })
      if (!frenzied) continue
      s = { ...s, thresholdQueue: queue }
      const fz = runFrenzy(s, b, id)
      // the frenzy attack ran through the attack pipeline: whatever it left (a decision inside the attack, the vent, the next beast, the
      // Activation Phase) is the flow's answer, and finishFrenzyActivation carries on with the rest of Control
      if (fz.out) return { state: fz.out.state, events: [...events, ...fz.out.events], pending: fz.out.pending }
      s = fz.state; events.push(...fz.events)
      if (fz.ended || s.phase === 'ended') { const g = raiseGameOver(s); return { state: g.state, events, pending: g.pending } }
      const bm = s.models[id]!
      if ((bm.fury ?? 0) > 0 && bm.life === 'active') { const v = raiseVent(s, id); return { state: v.state, events, pending: v.pending } }
      events.push({ type: 'FrenzyEnded', beastId: id, vented: 0 })
    }
    s = withoutQueue(s)
    from = 'shake'
  }
  if (from === 'shake') {
    s = { ...s, window: 'control.shake' }
    events.push({ type: 'WindowOpened', window: 'control.shake' })
    if (shakeOptions(s, p, b).length > 0) {
      const r = raiseShake(s, b, p)
      return { state: r.state, events, pending: r.pending }
    }
    from = 'apparition'
  }
  if (from === 'apparition') {
    // Mirage's Apparition: a granted model may be placed within 2" (one decision per model)
    const r = raiseApparition(s, b, p)
    if (r) return { state: r.state, events, pending: r.pending }
    from = 'ambush'
  }
  if (from === 'ambush') {
    // C8 (R4.9): Ambush models may enter at the end of their controller's Control Phase, from round 2
    const r = raiseAmbush(s, b, p)
    if (r) return { state: r.state, events, pending: r.pending }
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
function validateUpkeep(s: GameState, b: DataBundle, a: PayUpkeepAction): Rejection | null {
  const ups = new Map(upkeepEffects(s, a.player).map((e) => [e.id, e]))
  const spent = new Map<ModelId, number>()
  for (const id of new Set(a.keep)) {
    const e = ups.get(id)
    if (!e) return { code: 'E_NOT_AN_OPTION', message: `${id} is not an upkeep you can keep` }
    if (upkeepFree(s, b, e)) continue
    const c = e.upkeep!.casterId
    const n = (spent.get(c) ?? 0) + 1
    const cm = s.models[c]!
    if (n > upkeepBudget(cm)) return { code: isWarlock(cm) || isBeast(cm) ? 'E_INSUFFICIENT_FURY' : 'E_INSUFFICIENT_FOCUS', message: `${c} cannot pay ${n} upkeeps` }
    spent.set(c, n)
  }
  return null
}
function validateShake(s: GameState, b: DataBundle, a: ShakeAction): Rejection | null {
  const opts = shakeOptions(s, a.player, b)
  const seen = new Set<ModelId>()
  for (const x of a.shake) {
    if (seen.has(x.modelId)) return { code: 'E_ALREADY_USED', message: `${x.modelId} may shake only once` }
    seen.add(x.modelId)
    if (!opts.some((o) => o.modelId === x.modelId && (x.condition ? o.condition === x.condition : true) && (x.effectId ? o.effectId === x.effectId : true))) {
      const m = s.models[x.modelId]
      if (m && isWarlock(m) && (m.fury ?? 0) < 1) return { code: 'E_INSUFFICIENT_FURY', message: `${x.modelId} has no fury` }
      if (m && isBeast(m)) { const g = forceGate(s, b, m.id, 1, 'shake'); if (g) return g.rejection }
      if (m && !isFuryModel(m) && m.focus < 1) return { code: 'E_INSUFFICIENT_FOCUS', message: `${x.modelId} has no focus` }
      return { code: 'E_NOT_AN_OPTION', message: `${x.modelId} has nothing to shake` }
    }
  }
  return null
}
function validateLeechAnswer(s: GameState, b: DataBundle, a: LeechAction): Rejection | null {
  if (a.warlockId !== s.pending.context.modelId) return { code: 'E_NOT_AN_OPTION', message: `the open leech is for ${s.pending.context.modelId}` }
  return validateLeech(s, b, a)
}
function validateVent(s: GameState, a: AdjustFuryAction): Rejection | null {
  const m = s.models[a.modelId]
  if (a.modelId !== s.pending.context.modelId || !m) return { code: 'E_NOT_AN_OPTION', message: `the open decision is for ${s.pending.context.modelId}` }
  if (!Number.isInteger(a.delta) || a.delta > 0) return { code: 'E_NOT_AN_OPTION', message: 'a frenzied beast can only lose fury here' }
  if (-a.delta > (m.fury ?? 0)) return { code: 'E_INSUFFICIENT_FURY', message: `${m.id} holds ${m.fury ?? 0} fury` }
  return null
}

export function validateControlAnswer(s: GameState, b: DataBundle, a: Action): Rejection | null {
  switch (a.type) {
    case 'allocateFocus': return s.pending.kind === 'allocateFocus' ? validateAllocate(s, b, a) : { code: 'E_WRONG_DECISION', message: 'not allocating' }
    case 'payUpkeep': return s.pending.kind === 'payUpkeep' ? validateUpkeep(s, b, a) : { code: 'E_WRONG_DECISION', message: 'not paying upkeep' }
    case 'shake': return s.pending.kind === 'shake' ? validateShake(s, b, a) : { code: 'E_WRONG_DECISION', message: 'not shaking' }
    case 'leech': return s.pending.kind === 'leech' ? validateLeechAnswer(s, b, a) : { code: 'E_WRONG_DECISION', message: 'not leeching' }
    case 'adjustFury': return s.pending.kind === 'adjustFury' ? validateVent(s, a) : { code: 'E_WRONG_DECISION', message: 'not venting fury' }
    case 'placeTroopers': return s.pending.kind === 'placeTroopers' && s.pending.context.data?.code === 'ambush' ? validateAmbush(s, b, a) : { code: 'E_WRONG_DECISION', message: 'not placing ambushers' }
    case 'moveModel': return s.pending.kind === 'moveModel' && s.pending.context.data?.code === 'apparition' ? validateApparition(s, a) : { code: 'E_WRONG_DECISION', message: 'not placing a model' }
    case 'pass': return s.pending.kind === 'moveModel' && s.pending.context.data?.code === 'apparition' ? validateApparition(s, a) : s.pending.canPass ? null : { code: 'E_NOT_AN_OPTION', message: 'cannot pass' }
    default: return { code: 'E_WRONG_DECISION', message: `${a.type} does not answer a control decision` }
  }
}

/** C2: move the fury, apply the self-leech damage (never transferable), run the death windows if it disabled the warlock, then Spirit Bond. */
function answerLeech(state: GameState, b: DataBundle, a: LeechAction): ControlOut {
  const lf = leechFury(state, a)
  let s = lf.state
  const events: GameEvent[] = [...lf.events]
  if (a.self > 0) {
    const w = s.models[a.warlockId]!
    const layouts = layoutsFor(profileOf(b, w))
    const ap = applyDamage(s, a.warlockId, a.self, { layouts, source: 'other' })
    s = ap.state; events.push(...ap.events)
    if (s.models[a.warlockId]!.life === 'disabled') {
      const tough = (profileOf(b, w).abilities as string[] | undefined)?.includes('core.a.tough') ?? false
      const d = resolveDeath(s, a.warlockId, { tough, layouts, cause: 'leech' })
      s = d.state; events.push(...d.events)
      if (d.outcome !== 'alive') {
        const g = afterWarlockDeath(s, b, a.warlockId); s = g.state; events.push(...g.events)
        if (g.ended || s.phase === 'ended') { const o = raiseGameOver(s); return { state: o.state, events, pending: o.pending } }
      }
    }
  }
  const t = settleLeech(s, b, a.warlockId, lf.sources, a.self); s = t.state; events.push(...t.events)
  return continueControl(s, b, 'leech', events, a.warlockId)
}

/** Apply an answer to the open control decision; returns the next decision (null = Control finished). */
export function answerControl(state: GameState, b: DataBundle, a: Action): ControlOut | { rejection: Rejection } {
  const bad = validateControlAnswer(state, b, a)
  if (bad) return { rejection: bad }
  let s = state
  const events: GameEvent[] = []
  const kind = state.pending.kind
  if (kind === 'leech' && a.type === 'leech') return answerLeech(state, b, a)
  if (kind === 'moveModel') {
    const r = applyApparition(s, a)
    return continueControl(r.state, b, 'apparition', r.events)
  }
  if (kind === 'placeTroopers') {
    // the arrivals come in, or the player passes (they wait for a later Control Phase)
    const r = a.type === 'placeTroopers' ? applyAmbush(s, a) : { state: s, events: [] as GameEvent[] }
    return continueControl(r.state, b, 'done', [...events, ...r.events])
  }
  if (kind === 'adjustFury' && a.type === 'adjustFury') {
    // FZ7: vent, then the next threshold check
    const m = s.models[a.modelId]!
    if (a.delta < 0) { const r = setFury(s, a.modelId, (m.fury ?? 0) + a.delta, 'vent'); s = r.state; events.push(...r.events) }
    events.push({ type: 'FrenzyEnded', beastId: a.modelId, vented: -a.delta })
    return continueControl(s, b, 'threshold', events)
  }
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
      if (keep.has(e.id) && upkeepFree(s, b, e)) { events.push({ type: 'UpkeepPaid', effectId: e.id, casterId: e.upkeep!.casterId }); continue }
      if (keep.has(e.id)) {
        const c = e.upkeep!.casterId
        const cm = s.models[c]!
        const sp = isWarlock(cm) ? spendFury(s, c, 1, 'upkeep') : spendFocus(s, c, 1, 'upkeep')
        if (isRejection(sp) || isFuryRejection(sp)) return { rejection: (sp as { rejection: Rejection }).rejection }
        s = sp.state; events.push(...sp.events, { type: 'UpkeepPaid', effectId: e.id, casterId: c })
      } else { const r = removeEffect(s, e.id, 'upkeepDropped'); s = r.state; events.push(...r.events) }
    }
    return continueControl(s, b, 'threshold', events)
  }
  if (a.type === 'shake') {
    for (const x of a.shake) {
      const sp = pay(s, b, x.modelId, 1, 'shake')
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
  return continueControl(s, b, 'apparition', events)
}

/** Sample of legal answers to the open control decision (never empty). */
export function controlLegalActions(state: GameState): Action[] {
  const out: Action[] = (state.pending.options ?? []).map((o) => o.action)
  if (state.pending.canPass) out.push({ type: 'pass', decisionId: state.pending.id, player: state.pending.player })
  return out
}
