// M9 (81 F7): a frenzy activation, steps FZ1-FZ6, resolved start to finish with no decisions (the target is the closest model,
// the charge is straight, the attack is the best melee weapon with a free boost). FZ7, the vent decision, is raised by control.ts.
import { rollAttack } from '../attack'
import { hasLos } from '../los'
import {
  armOf, hasFlag, isMelee, layoutsOf, statOf, weaponCrippled, weaponsOf, type WeaponInst,
} from '../code-hooks'
import { rollNd6 } from '../dice'
import { applyDamage, resolveDeath, rollDamage } from '../damage'
import { effectsOn, hasCondition, removeCondition, removeEffect } from '../effects'
import type { GameEvent } from '../events'
import { EPS, edgeDistance, isOnTable, norm, sub, sweepFrom } from '../geometry'
import { onBeastLeavesPlay, markWildBeasts } from '../fury'
import { modelDistance } from '../measure'
import { movedEvent, relocate } from '../movement'
import { afterDeaths } from '../scenario'
import type { DataBundle, GameState, ModelId, ModelState, StoredConditionId } from '../types'

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
 * Run FZ1-FZ6 for a beast that just failed its threshold check. Returns the state with the beast activated and `frenzied`
 * false again; control.ts then raises the vent decision (FZ7).
 */
export function runFrenzy(state0: GameState, b: DataBundle, beastId: ModelId): { state: GameState; events: GameEvent[]; ended?: boolean } {
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
    events.push(
      { type: 'ChargeDeclared', modelId: beastId, targetId },
      movedEvent(beastId, 'charge', m.pos, sw.end, [sw.end], s.models[beastId]!.elev, sw.stoppedBy.id),
      { type: 'ChargeResolved', modelId: beastId, targetId, distance: sw.travelled, success, chargeAttack },
    )
  }
  // FZ5: one attack, only after a successful charge or when the target already stood in range
  const beast = s.models[beastId]!
  const target = targetId ? s.models[targetId] : undefined
  const canAttack = !!target && (t.canCharge ? success : !!frenzyWeapon(s, b, beast, target))
  const weapon = canAttack && target ? frenzyWeapon(s, b, beast, target) : undefined
  if (weapon && target) {
    const attackId = `a:${s.attackSeq + 1}`
    s = { ...s, attackSeq: s.attackSeq + 1 }
    events.push({ type: 'AttackDeclared', attackId, attackerId: beastId, originId: beastId, weaponId: weapon.weaponId, targetId: target.id, kind: 'melee', additional: false })
    const auto = target.wild || target.inert || hasCondition(s, target, 'knockedDown') || hasCondition(s, target, 'stationary')
    const def = target.wild ? 5 : statOf(s, b, target.id, 'DEF')
    const ar = rollAttack(s, { stat: statOf(s, b, beastId, 'MAT'), target: def, dice: { boost: true }, autoHit: auto, ownerId: beastId })
    s = ar.state; events.push(...ar.events)
    events.push({ type: 'RollBoosted', attackId, roll: 'attack', modelId: beastId, source: 'frenzy' })
    events.push({ type: 'AttackResolved', attackId, rollId: ar.rollId, hit: ar.hit, crit: ar.crit, auto: ar.auto })
    if (ar.hit) {
      const arm = armOf(s, b, target.id)
      const dr = rollDamage(s, { pow: (weapon.w.pow as number) ?? 0, armor: arm, dice: { boost: chargeAttack }, ownerId: target.id })
      s = dr.state; events.push(...dr.events)
      if (chargeAttack) events.push({ type: 'RollBoosted', attackId, instanceId: `${attackId}.1`, roll: 'damage', modelId: beastId, source: 'frenzy' })
      const layouts = layoutsOf(b, target)
      const ap = applyDamage(s, target.id, dr.points, { layouts, attackId, instanceId: `${attackId}.1`, source: 'direct' })
      s = ap.state; events.push(...ap.events)
      if (s.models[target.id]!.life === 'disabled') {
        const d = resolveDeath(s, target.id, { tough: hasFlag(s, b, target.id, 'tough'), layouts, cause: attackId })
        s = d.state; events.push(...d.events)
        if (d.outcome !== 'alive') {
          // F7.3: a friendly beast killed by a frenzy attack is not reaved
          if (s.models[target.id]!.type === 'beast') { const r = onBeastLeavesPlay(s, b, target.id, { friendlyAttack: target.owner === beast.owner }); s = r.state; events.push(...r.events) }
          if (s.models[target.id]!.type === 'leader') { const w = markWildBeasts(s, target.id); s = w.state; events.push(...w.events) }
          const end = afterDeaths(s, b); s = end.state; events.push(...end.events)
          if (end.ended) return { state: s, events, ended: true }
        }
      }
    }
    events.push({ type: 'AttackFinished', attackId })
  }
  // FZ6
  s = setModel(s, { ...s.models[beastId]!, frenzied: false })
  events.push({ type: 'ActivationEnded', activeId: beastId, reason: 'frenzy' })
  return { state: s, events }
}
