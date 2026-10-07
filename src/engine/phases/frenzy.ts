// M9 (81 F7): a frenzy activation, steps FZ1-FZ6. The target is the closest model, the charge is straight, and the attack is the best melee
// weapon with a free boost, run through the real attack pipeline (activation.ts declareAttack/drive) so Power Field, Transfer, triggers and
// crippled-aspect dice all apply. The attack may stop for a decision (transfer, Power Field, a trigger window); the answer resumes the
// pipeline and `finishFrenzyActivation` (called from finishAttack) does FZ6 and hands back to Control (FZ7, the vent decision).
import { hasLos } from '../los'
import {
  hasFlag, isMelee, statOf, weaponCrippled, weaponsOf, type ActCtx, type WeaponInst,
} from '../code-hooks'
import { rollNd6 } from '../dice'
import { effectsOn, expireEffects, removeCondition, removeEffect } from '../effects'
import type { GameEvent } from '../events'
import { EPS, edgeDistance, isOnTable, norm, sub, sweepFrom } from '../geometry'
import { modelDistance } from '../measure'
import { movedEvent, relocate } from '../movement'
import { raiseGameOver, raiseVent, type FlowOut } from '../pending'
import { afterDeaths } from '../scenario'
import { raiseChooseActivation } from '../turnflow'
import type { DataBundle, GameState, ModelId, ModelState, StoredConditionId } from '../types'
import { continueControl } from './control'
import { declareAttack, drive, emptyPm } from './activation'

export interface FrenzyTarget { tiedIds: ModelId[]; distance: number; friendly: boolean; canCharge: boolean; reason?: 'noTarget' | 'cannotCharge' | 'cannotActivate' }

/** FZ3 prediction (query.frenzyTarget): the closest model in LOS, friend or foe, any type. */
export function frenzyTarget(state: GameState, b: DataBundle, beastId: ModelId): FrenzyTarget {
  const m = state.models[beastId]
  if (!m || m.life !== 'active' || m.offTable) return { tiedIds: [], distance: 0, friendly: false, canCharge: false, reason: 'cannotActivate' }
  let best = Infinity
  let tied: ModelId[] = []
  for (const o of Object.values(state.models)) {
    if (o.id === beastId || !isOnTable(o)) continue
    if (!hasLos(state, beastId, o.id)) continue
    const d = modelDistance(m, o)
    if (d < best - EPS) { best = d; tied = [o.id] } else if (Math.abs(d - best) <= EPS) tied.push(o.id)
  }
  if (!tied.length) return { tiedIds: [], distance: 0, friendly: false, canCharge: false, reason: 'noTarget' }
  tied.sort()
  const noCharge = m.base >= 120 || effectsOn(state, beastId).some((e) => e.forbid?.includes('charge')) || hasFlag(state, b, beastId, 'noCharge')
  return { tiedIds: tied, distance: best, friendly: tied.length === 1 && state.models[tied[0]!]!.owner === m.owner, canCharge: !noCharge, reason: noCharge ? 'cannotCharge' : undefined }
}

/** FZ5: the melee weapon with the highest POW that reaches the target; ties go to the first in profile order (RULING F7.a). */
export function frenzyWeapon(state: GameState, b: DataBundle, beast: ModelState, target: ModelState): WeaponInst | undefined {
  let best: WeaponInst | undefined
  for (const w of weaponsOf(b, beast)) {
    if (!isMelee(w.w) || weaponCrippled(beast, w.loc)) continue
    if (edgeDistance(beast.pos, beast.base, target.pos, target.base) > ((w.w.rng as number | undefined) ?? 1) + EPS) continue
    if (!best || (w.w.pow ?? 0) > (best.w.pow ?? 0)) best = w
  }
  return best
}

const setModel = (s: GameState, m: ModelState): GameState => ({ ...s, models: { ...s.models, [m.id]: m } })

/**
 * Run FZ1-FZ6 for a beast that just failed its threshold check. Without an attack it returns the state with the beast activated and
 * `frenzied` false again; control.ts then raises the vent decision (FZ7). With an attack the pipeline takes over: `out` is the flow
 * result (a decision inside the attack, or the vent / next decision once the attack is over) and control.ts returns it as is.
 */
export function runFrenzy(state0: GameState, b: DataBundle, beastId: ModelId): { state: GameState; events: GameEvent[]; ended?: boolean; out?: FlowOut } {
  let s = state0
  const events: GameEvent[] = []
  const beast0 = s.models[beastId]!
  // RULING F7.c: a beast that cannot activate skips FZ1-FZ6
  if (beast0.life !== 'active' || beast0.offTable || beast0.activated) {
    events.push({ type: 'Frenzied', beastId, targetId: null, tiedIds: [], reason: 'cannotActivate' })
    return { state: s, events }
  }
  // FZ1
  s = setModel(s, { ...beast0, frenzied: true, activated: true })
  events.push({ type: 'ActivationStarted', activeId: beastId, modelIds: [beastId] })
  // FZ2: shake knockdown, stationary and every shakeable effect, free of charge
  for (const c of ['knockedDown', 'stationary'] as StoredConditionId[]) {
    const r = removeCondition(s, beastId, c, 'frenzy'); s = r.state; events.push(...r.events)
  }
  for (const e of effectsOn(s, beastId)) {
    if (e.shakeable || e.conditions?.some((c) => c === 'knockedDown' || c === 'stationary')) { const r = removeEffect(s, e.id, 'shaken'); s = r.state; events.push(...r.events) }
  }
  // FZ3: target
  const t = frenzyTarget(s, b, beastId)
  let targetId: ModelId | null = null
  let tieRollId: string | undefined
  if (t.tiedIds.length === 1) targetId = t.tiedIds[0]!
  else if (t.tiedIds.length > 1) {
    // one seeded d6 roll-off among the tied models; a tie for the top rolls again among the leaders
    let pool = t.tiedIds
    for (let guard = 0; guard < 20 && pool.length > 1; guard++) {
      const r = rollNd6(s, pool.length, 'frenzyTie', { ownerId: beastId })
      s = r.state; events.push(r.event)
      tieRollId ??= r.event.rollId
      const top = Math.max(...r.dice)
      pool = pool.filter((_, i) => r.dice[i] === top)
    }
    targetId = pool[0]!
  }
  events.push({ type: 'Frenzied', beastId, targetId, tiedIds: t.tiedIds, tieRollId, reason: !targetId ? 'noTarget' : !t.canCharge ? 'cannotCharge' : undefined })
  let chargeAttack = false
  let success = false
  let travelled = 0
  if (targetId && t.canCharge) {
    // FZ4: charge with no force, even if engaged; straight at the target up to SPD+3"
    const m = s.models[beastId]!
    const tg = s.models[targetId]!
    const pathfinder = hasFlag(s, b, beastId, 'pathfinder')
    const spd = statOf(s, b, beastId, 'SPD')
    const dir = norm(sub(tg.pos, m.pos))
    const run = (max: number) => sweepFrom(s, m, m.pos, dir, max, { obstacles: pathfinder ? 'ignore' : 'stop' })
    let sw = run(spd + 3)
    if (sw.roughEntered && !pathfinder) sw = run(Math.max(1, spd + 3 - 2))
    success = edgeDistance(sw.end, m.base, tg.pos, tg.base) <= 1 + EPS
    s = relocate(s, beastId, sw.end)
    chargeAttack = success && sw.travelled >= 3 - EPS
    travelled = sw.travelled
    events.push(
      { type: 'ChargeDeclared', modelId: beastId, targetId },
      movedEvent(beastId, 'charge', m.pos, sw.end, [sw.end], s.models[beastId]!.elev, sw.stoppedBy.id),
      { type: 'ChargeResolved', modelId: beastId, targetId, distance: sw.travelled, success, chargeAttack },
    )
  }
  // FZ5: one attack through the pipeline, only after a successful charge. A beast that cannot charge loses its activation (p107, FZ3),
  // and so does one whose charge falls short.
  const beast = s.models[beastId]!
  const target = targetId ? s.models[targetId] : undefined
  const weapon = target && t.canCharge && success ? frenzyWeapon(s, b, beast, target) : undefined
  if (weapon && target) {
    const a: ActCtx = {
      activeId: beastId, modelIds: [beastId], movedModelId: null, movement: null, moved: travelled, aimed: false, ran: false,
      charge: { targetId: target.id, distance: travelled, success: true }, perModel: { [beastId]: emptyPm() }, spellsCast: [], featUsed: false, healed: 0, limitsUsed: [],
      frenzy: { beastId, targetId: target.id, tiedIds: t.tiedIds },
      x: {
        stage: 'frenzy', queue: [], cur: beastId, forfeit: [], failedCharge: false, meleeOnly: [beastId], chargeAttackFor: chargeAttack ? beastId : null, killedAny: false, killedByRanged: false,
        mage: {}, endMoves: [], endMoveDone: true, channelVia: null, standUpUsed: true, endMoved: [],
      },
    }
    const dec = declareAttack({ ...s, activation: a as GameState['activation'], attack: null, thresholdQueue: s.thresholdQueue }, b, {
      attackerId: beastId, targetId: target.id, weaponId: weapon.weaponId, additional: false, noFocus: true, chargeAttack, basic: true, flags: { frenzy: true },
    })
    if (!('rejection' in dec)) {
      const out = drive(dec.state, b, [...events, ...dec.events])
      return { state: out.state, events: out.events, out, ended: out.state.phase === 'ended' }
    }
  }
  // FZ6 (no attack was made)
  s = setModel(s, { ...s.models[beastId]!, frenzied: false })
  events.push({ type: 'ActivationEnded', activeId: beastId, reason: 'frenzy' })
  return { state: s, events }
}

/**
 * FZ6 and FZ7 after the frenzy attack has fully resolved (all triggers included): end the activation, then the vent decision, or on to
 * the next threshold check. Called by activation.ts finishAttack, in the same step as the last answer (or the same call that started it).
 */
export function finishFrenzyActivation(state0: GameState, b: DataBundle, events: GameEvent[]): FlowOut {
  let s = state0
  const beastId = (s.activation as ActCtx).frenzy!.beastId
  const ex = expireEffects(s, 'activation'); s = ex.state; events.push(...ex.events)
  const bm = s.models[beastId]
  if (bm) s = setModel(s, { ...bm, frenzied: false })
  events.push({ type: 'ActivationEnded', activeId: beastId, reason: 'frenzy' })
  s = { ...s, activation: null, attack: null }
  const end = afterDeaths(s, b); s = end.state; events.push(...end.events)
  if (end.ended || s.phase === 'ended') { const g = raiseGameOver(s); return { state: g.state, events, pending: g.pending } }
  const after = s.models[beastId]!
  if ((after.fury ?? 0) > 0 && after.life === 'active') { const v = raiseVent(s, beastId); return { state: v.state, events, pending: v.pending } }
  events.push({ type: 'FrenzyEnded', beastId, vented: 0 })
  const c = continueControl(s, b, 'threshold', events)
  if (c.pending) return { state: c.state, events: c.events, pending: c.pending }
  return raiseChooseActivation(c.state, c.events)
}
