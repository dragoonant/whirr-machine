// Out-of-activation Maintenance effects: Avenging Force (kha.s.avenging-force) and Sentry's Rapid Fire (trl.s.sentry); 00 §5 out-of-activation movement and attacks.
// When a friendly model of the caster was damaged during the enemy turn, the warjack under the spell advances up to 3"
// and may make one basic attack, outside any activation (no focus can be spent on it).
import type { Action } from '../actions'
import { declareAttack, drive, moverInfo } from './activation'
import { abilitiesOf, alive, evalCond, isMelee, rec, weaponsOf, type Rec } from '../code-hooks'
import { hasCondition } from '../effects'
import type { GameEvent } from '../events'
import { avengingForceReady } from '../factions/khador'
import { sentryReady } from '../factions/trollbloods'
import { angleOf, dist, sub } from '../geometry'
import { resolveAdvance } from '../movement'
import { raise, reject, type FlowOut, type FlowResult } from '../pending'
import type { DataBundle, DecisionOption, EffectInstance, GameState, ModelId, Vec2 } from '../types'

const CODE = 'avengingForce'
const ADVANCE = 3

const SENTRY = 'sentry'
const MAINT = 'maintenanceAttack'
export const isAvengingDecision = (state: GameState): boolean =>
  state.phase === 'maintenance' && (state.pending.context.data?.code === CODE || state.pending.context.data?.code === SENTRY || state.pending.context.data?.code === MAINT)

/** The armed Avenging Force effects whose warjack can act now. */
function ready(state: GameState): { effectId: string; engineId: ModelId }[] {
  return avengingForceReady(state).filter((r) => {
    const m = state.models[r.engineId]
    return alive(m) && m!.owner === state.activePlayer && !m!.inert && m!.life === 'active'
  })
}

/**
 * Run after Maintenance: resolve the next armed Avenging Force, or call `next` (the Control Phase) when none is left.
 * Each trigger is consumed as it starts, so it resolves once.
 */
export function runAvengingForce(state0: GameState, b: DataBundle, events: GameEvent[], next: (s: GameState, ev: GameEvent[]) => FlowOut): FlowOut {
  const r = ready(state0)[0]
  if (!r && !state0.effects.some((e) => (e as EffectInstance & { triggered?: boolean }).triggered)) return runSentry(state0, b, events, next)
  // disarm every armed copy that cannot act (its warjack is gone), so nothing lingers
  let state: GameState = { ...state0, effects: state0.effects.map((e) => ((e as EffectInstance & { triggered?: boolean }).triggered && (r ? e.id === r.effectId : e.owner === state0.activePlayer) ? ({ ...e, triggered: false } as EffectInstance) : e)) }
  if (!r) return runSentry(state, b, events, next)
  events.push({ type: 'WindowOpened', window: 'maintenance.effects', subjectId: r.engineId })
  state = { ...state, window: 'maintenance.effects' }
  return raiseMove(state, b, events, r.engineId)
}

// ---------- Sentry: Rapid Fire ----------
/** Sentry effects whose model owes its basic ranged attack this Maintenance Phase (not yet taken this turn). */
function sentryDue(state: GameState): { effectId: string; modelId: ModelId }[] {
  return sentryReady(state).filter((r) => {
    const m = state.models[r.modelId]
    const e = state.effects.find((x) => x.id === r.effectId) as (EffectInstance & { sentryTurn?: number }) | undefined
    return alive(m) && m!.owner === state.activePlayer && !m!.inert && m!.life === 'active' && !!e && e.sentryTurn !== state.turn
  })
}

/** After Avenging Force: the next Sentry model takes its one basic ranged attack (a decision it may pass), then the Control Phase. */
function runSentry(state0: GameState, b: DataBundle, events: GameEvent[], next: (s: GameState, ev: GameEvent[]) => FlowOut): FlowOut {
  let state = state0
  for (const r of sentryDue(state)) {
    // one attack per Sentry per turn: mark it, then offer the shots the model can make
    state = { ...state, effects: state.effects.map((e) => (e.id === r.effectId ? ({ ...e, sentryTurn: state.turn } as EffectInstance) : e)) }
    const m = state.models[r.modelId]!
    const did = `d:${state.decisionSeq + 1}`
    const options = attackOptions(state, b, r.modelId, did, true)
    if (!options.length) continue
    events.push({ type: 'WindowOpened', window: 'maintenance.effects', subjectId: r.modelId })
    state = { ...state, window: 'maintenance.effects' }
    const p = raise(state, {
      player: m.owner, kind: 'chooseAttack', window: 'maintenance.effects', context: { modelId: r.modelId, data: { code: SENTRY, step: 'attack' } },
      options: [...options, { id: 'skip', label: 'Hold fire', action: { type: 'pass', decisionId: did, player: m.owner } as Action }], canPass: true,
    })
    return { state: p.state, events, pending: p.pending }
  }
  return runMaintenanceAttacks(state, b, events, next)
}

// ---------- generic Maintenance attacks (M10): any model ability with trigger maintenance.effects and a makeAttack op ----------
interface MaintDue { modelId: ModelId; abilityId: string; filter: string }
const maintKey = (state: GameState, modelId: ModelId, abilityId: string): string => `${state.turn}:${modelId}|${abilityId}`

/** Maintenance attacks the active player's models owe this turn and have not been offered yet (one offer per model and ability per turn). */
function maintDue(state: GameState, b: DataBundle): MaintDue[] {
  const done = state.maintAttackDone ?? []
  const out: MaintDue[] = []
  for (const m of Object.values(state.models).sort((x, y) => x.id.localeCompare(y.id))) {
    if (m.owner !== state.activePlayer || !alive(m) || m.inert || m.life !== 'active') continue
    if (hasCondition(state, m, 'knockedDown') || hasCondition(state, m, 'stationary')) continue
    for (const abId of abilitiesOf(state, b, m.id)) {
      const ab = rec(b, abId)
      const node = ((ab.effect ?? []) as Rec[]).find((n) => n.op === 'makeAttack')
      if (ab.trigger !== 'maintenance.effects' || !node || done.includes(maintKey(state, m.id, abId))) continue
      if (!evalCond(state, b, ab.when, { selfId: m.id })) continue
      out.push({ modelId: m.id, abilityId: abId, filter: String(node.weaponFilter ?? 'any') })
    }
  }
  return out
}

/** After Avenging Force and Sentry: each due Maintenance attack is offered to its owner as a chooseAttack (pass to hold fire), then the Control Phase. */
function runMaintenanceAttacks(state0: GameState, b: DataBundle, events: GameEvent[], next: (s: GameState, ev: GameEvent[]) => FlowOut): FlowOut {
  let state = state0
  for (const r of maintDue(state, b)) {
    const key = maintKey(state, r.modelId, r.abilityId)
    const prefix = `${state.turn}:`
    state = { ...state, maintAttackDone: [...(state.maintAttackDone ?? []).filter((k) => k.startsWith(prefix)), key] }
    const m = state.models[r.modelId]!
    const did = `d:${state.decisionSeq + 1}`
    const options = attackOptions(state, b, r.modelId, did, r.filter)
    if (!options.length) continue
    events.push({ type: 'WindowOpened', window: 'maintenance.effects', subjectId: r.modelId })
    state = { ...state, window: 'maintenance.effects' }
    const p = raise(state, {
      player: m.owner, kind: 'chooseAttack', window: 'maintenance.effects', context: { modelId: r.modelId, data: { code: MAINT, abilityId: r.abilityId, step: 'attack' } },
      options: [...options, { id: 'skip', label: 'Hold fire', action: { type: 'pass', decisionId: did, player: m.owner } as Action }], canPass: true,
    })
    return { state: p.state, events, pending: p.pending }
  }
  return next(state, events)
}

function moveSamples(state: GameState, b: DataBundle, id: ModelId): Vec2[] {
  const m = state.models[id]!
  const info = { ...moverInfo(state, b, id), spd: ADVANCE }
  const foes = Object.values(state.models).filter((o) => o.owner !== m.owner && alive(o)).sort((x, y) => dist(x.pos, m.pos) - dist(y.pos, m.pos))
  const dirs: number[] = foes[0] ? [angleOf(sub(foes[0].pos, m.pos))] : []
  for (let i = 0; i < 8; i++) dirs.push((i * Math.PI) / 4)
  const out: Vec2[] = [m.pos]
  for (const ang of dirs) {
    for (const f of [1, 0.5]) {
      const p = { x: m.pos.x + Math.cos(ang) * ADVANCE * f, z: m.pos.z + Math.sin(ang) * ADVANCE * f }
      if (resolveAdvance(state, { modelId: id, waypoints: [p], kind: 'advance', info }).ok) out.push(p)
      if (out.length >= 12) return out
    }
  }
  return out
}

function raiseMove(state: GameState, b: DataBundle, events: GameEvent[], id: ModelId): FlowOut {
  const m = state.models[id]!
  const did = `d:${state.decisionSeq + 1}`
  const options: DecisionOption[] = moveSamples(state, b, id).map((p, i) => ({
    id: i === 0 ? 'stay' : `mv${i}`, label: i === 0 ? 'Stay put' : `Advance to ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`,
    action: { type: 'moveModel', decisionId: did, player: m.owner, modelId: id, path: [p] } as Action,
  }))
  const r = raise(state, {
    player: m.owner, kind: 'moveModel', window: 'maintenance.effects', context: { modelId: id, data: { code: CODE, step: 'move' } },
    constraints: { modelId: id, from: m.pos, maxDist: ADVANCE }, options, canPass: false,
  })
  return { state: r.state, events, pending: r.pending }
}

function attackOptions(state: GameState, b: DataBundle, id: ModelId, did: string, filter: boolean | string = false): DecisionOption[] {
  const m = state.models[id]!
  const out: DecisionOption[] = []
  const seen = new Set<string>()
  for (const w of weaponsOf(b, m)) {
    // filter: true or 'ranged' = shots only (Sentry), 'melee' = blows only, a weapon id = that weapon, anything else = every weapon
    if ((filter === true || filter === 'ranged') && isMelee(w.w)) continue
    if (filter === 'melee' && !isMelee(w.w)) continue
    if (typeof filter === 'string' && !['any', 'ranged', 'melee', 'same'].includes(filter) && filter !== w.weaponId) continue
    if (seen.has(w.weaponId)) continue
    seen.add(w.weaponId)
    for (const t of Object.values(state.models)) {
      if (t.owner === m.owner || !alive(t)) continue
      const dec = declareAttack(state, b, { attackerId: id, targetId: t.id, weaponId: w.weaponId, additional: false, noFocus: true, chargeAttack: false, basic: true })
      if ('rejection' in dec) continue
      out.push({
        id: `atk:${w.weaponId}:${t.id}`, label: `${isMelee(w.w) ? 'Strike' : 'Shoot'} ${t.id} with ${String(w.w.name ?? w.weaponId)}`,
        action: { type: 'chooseAttack', decisionId: did, player: m.owner, modelId: id, weaponId: w.weaponId, targetId: t.id, additional: false } as Action,
        odds: { pHit: (dec.state.attack?.pHit ?? 0) },
      })
    }
  }
  return out
}

function raiseAttack(state: GameState, b: DataBundle, events: GameEvent[], id: ModelId, next: (s: GameState, ev: GameEvent[]) => FlowOut): FlowOut {
  const m = state.models[id]
  if (!alive(m)) return runAvengingForce(state, b, events, next)
  const did = `d:${state.decisionSeq + 1}`
  const options = attackOptions(state, b, id, did)
  if (!options.length) {
    events.push({ type: 'DecisionAutoResolved', kind: 'chooseAttack', optionId: 'none' })
    return runAvengingForce(state, b, events, next)
  }
  const r = raise(state, {
    player: m!.owner, kind: 'chooseAttack', window: 'maintenance.effects', context: { modelId: id, data: { code: CODE, step: 'attack' } },
    options, canPass: true,
  })
  return { state: r.state, events, pending: r.pending }
}

/** Answer an Avenging Force move or attack choice. */
export function answerAvengingForce(state: GameState, b: DataBundle, a: Action, next: (s: GameState, ev: GameEvent[]) => FlowOut): FlowResult {
  const pd = state.pending
  const id = pd.context.modelId!
  if (pd.kind === 'moveModel') {
    if (a.type !== 'moveModel') return reject('E_WRONG_DECISION', `${a.type} does not answer the Avenging Force move`)
    if (a.modelId !== id) return reject('E_TARGET_INVALID', `the model that advances is ${id}`)
    const m = state.models[id]!
    const path = a.path?.length ? a.path : [m.pos]
    let s = state
    const events: GameEvent[] = []
    if (!path.every((p) => dist(p, m.pos) < 1e-9)) {
      const res = resolveAdvance(state, { modelId: id, waypoints: path, kind: 'advance', info: { ...moverInfo(state, b, id), spd: ADVANCE } })
      if (!res.ok) return reject(res.code, res.message)
      s = res.state
      events.push(...res.events.filter((e) => e.type !== 'CombatActionForfeited')) // not Normal Movement: nothing to forfeit
    }
    return raiseAttack(s, b, events, id, next)
  }
  if (pd.kind === 'chooseAttack') {
    if (a.type === 'pass') return runAvengingForce(state, b, [], next)
    if (a.type !== 'chooseAttack') return reject('E_WRONG_DECISION', `${a.type} does not answer the Avenging Force attack`)
    if (a.modelId !== id) return reject('E_TARGET_INVALID', `the model that attacks is ${id}`)
    const dec = declareAttack(state, b, { attackerId: id, targetId: a.targetId, weaponId: a.weaponId, additional: false, noFocus: true, chargeAttack: false, basic: true })
    if ('rejection' in dec) return dec
    const out = drive(dec.state, b, [...dec.events])
    return settleAfterAttack(out.state, b, out.events, next)
  }
  return reject('E_WRONG_DECISION', 'not an Avenging Force decision')
}

/** After any answer during a maintenance attack: once the attack is over, carry on with Maintenance. */
export function settleAfterAttack(state: GameState, b: DataBundle, events: GameEvent[], next: (s: GameState, ev: GameEvent[]) => FlowOut): FlowOut {
  if (state.phase === 'ended') return { state, events, pending: state.pending }
  if (state.attack) return { state, events, pending: state.pending }
  return runAvengingForce(state, b, events, next)
}
