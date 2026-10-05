// Avenging Force in the Maintenance Phase (kha.s.avenging-force; 00 §5 out-of-activation movement and attacks).
// When a friendly model of the caster was damaged during the enemy turn, the warjack under the spell advances up to 3"
// and may make one basic attack, outside any activation (no focus can be spent on it).
import type { Action } from '../actions'
import { declareAttack, drive, moverInfo } from './activation'
import { alive, isMelee, weaponsOf } from '../code-hooks'
import type { GameEvent } from '../events'
import { avengingForceReady } from '../factions/khador'
import { angleOf, dist, sub } from '../geometry'
import { resolveAdvance } from '../movement'
import { raise, reject, type FlowOut, type FlowResult } from '../pending'
import type { DataBundle, DecisionOption, EffectInstance, GameState, ModelId, Vec2 } from '../types'

const CODE = 'avengingForce'
const ADVANCE = 3

export const isAvengingDecision = (state: GameState): boolean =>
  state.phase === 'maintenance' && state.pending.context.data?.code === CODE

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
  // disarm every armed copy that cannot act (its warjack is gone), so nothing lingers
  let state: GameState = { ...state0, effects: state0.effects.map((e) => ((e as EffectInstance & { triggered?: boolean }).triggered && (r ? e.id === r.effectId : e.owner === state0.activePlayer) ? ({ ...e, triggered: false } as EffectInstance) : e)) }
  if (!r) return next(state, events)
  events.push({ type: 'WindowOpened', window: 'maintenance.effects', subjectId: r.engineId })
  state = { ...state, window: 'maintenance.effects' }
  return raiseMove(state, b, events, r.engineId)
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

function attackOptions(state: GameState, b: DataBundle, id: ModelId, did: string): DecisionOption[] {
  const m = state.models[id]!
  const out: DecisionOption[] = []
  const seen = new Set<string>()
  for (const w of weaponsOf(b, m)) {
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
