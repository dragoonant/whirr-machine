// R4.10 Activation: Normal Movement -> Combat Action -> end-of-activation movement, plus the whole attack pipeline
// (R7.18: declare, measure, boost, roll, hit triggers, damage jobs, Power Field, death, after-resolution triggers),
// AOE (closest-N blast), spray, additional attacks, spells/feats as any-time actions, optional trigger windows.
//
// Integration (src/engine/index.ts): while state.phase === 'activation', call handleActivationAction(state, bundle, action)
// for every action except endTurn (turnflow.ts owns chooseActivation's endTurn). It returns the same shape as turnflow
// (FlowResult). activationLegalActions(state, bundle) answers legalActions for the kinds in ACTIVATION_KINDS.
import type {
  Action, ChooseAttackAction, ChooseCombatActionAction, ChooseMovementAction, ChargeTargetAction, MoveModelAction,
} from '../actions'
import { hitProbabilityBoost, rollAttack } from '../attack'
import {
  abilitiesOf, actOf, alive, armOf, atkOf, appliedPassives, cannotKnockDown, cloudsOver, codeHooks, evalCond, hasAb, hasFlag,
  hasIgnore, ignoresGas, inPallCloud, isConstruct, layoutsOf, lookups, meleeReach, plugins, prof, rec, resistsDamageType,
  setAtk, setModel, statOf, weaponCrippled, weaponRange, weaponsOf, isMelee, isSpray, runCodeEffect,
  type AtkCtx, type AtkX, type ActCtx, type ActX, type CondEnv, type DmgJob, type Rec, type WeaponInst,
} from '../code-hooks'
import { applyDamage, damageDistribution, expectedDamage, pKill, resolveDeath } from '../damage'
import { diceCount, rollD3, rollNd6, rollMaybeZero } from '../dice'
import { addCondition, applyEffect, expireEffects, hasCondition, removeCondition, removeEffect } from '../effects'
import type { GameEvent } from '../events'
import { baseRadius, dist, angleOf, isLegalPlacement, isOnTable, norm, placeWithin, segPointDist, sub, sweepFrom, validateAdvancePath } from '../geometry'
import { gainFocus, isRejection, spendFocus } from '../focus'
import { defModifiers, engagedWith, hasLos, losReport } from '../los'
import { modelDistance, within } from '../measure'
import {
  addKnockdown, engagedBy, movementOptions, push as pushModel, placeUnit, relocate, resolveAdvance, resolveCharge, resolveChargeTo,
  resolveTrampleMove, slideAway, type MoverInfo,
} from '../movement'
import { raise, reject, type FlowOut, type FlowResult } from '../pending'
import { resolvePowerAttack, resolveTrampleAttacks } from '../power-attacks'
import { afterDeaths } from '../scenario'
import { anytimeOptions, castSpell, channel, heal, isAnytimeAction, useFeat } from '../spells'
import { raiseChooseActivation } from '../turnflow'
import type {
  AttackContext, DamageInstance, DamageType, DataBundle, DecisionKind, DecisionOption, GameState, Id, Mod, ModelActivation,
  ModelId, ModelState, MovementOption, PendingDecision, PlayerId, Rejection, UnitId, Vec2,
} from '../types'
import { noteDamaged as khadorNoteDamaged } from '../factions/khador'

export type Out = FlowOut
export type Result = FlowResult
type B = DataBundle

export const ACTIVATION_KINDS: ReadonlySet<DecisionKind> = new Set<DecisionKind>([
  'chooseMovement', 'moveModel', 'chargeTarget', 'placeTroopers', 'chooseCombatAction', 'chooseAttack', 'boostAttack', 'boostDamage',
  'powerField', 'chooseBoxes', 'triggerWindow', 'abilityChoice',
])
export const isActivationDecision = (s: GameState): boolean =>
  s.phase === 'activation' && (ACTIVATION_KINDS.has(s.pending.kind) || s.pending.kind === 'chooseActivation')

// ---------- small helpers ----------
const ok = (state: GameState, events: GameEvent[]): Out => ({ state, events, pending: state.pending })
const nextId = (s: GameState): string => `d:${s.decisionSeq + 1}`
const act = (s: GameState): ActCtx => {
  const a = actOf(s)
  if (!a) throw new Error('activation: no activation in progress')
  return a
}
const setAct = (s: GameState, a: ActCtx): GameState => ({ ...s, activation: a as typeof s.activation })
const patchX = (s: GameState, p: Partial<ActX>): GameState => { const a = act(s); return setAct(s, { ...a, x: { ...a.x, ...p } }) }
const patchAtk = (s: GameState, p: Partial<AtkX>): GameState => { const a = atkOf(s)!; return setAtk(s, { ...a, x: { ...a.x, ...p } }) }
const ownerOf = (s: GameState, id: ModelId): PlayerId => s.models[id]!.owner
const enemiesOf = (s: GameState, p: PlayerId): ModelState[] => Object.values(s.models).filter((m) => m.owner !== p && isOnTable(m))
const pm = (s: GameState, id: ModelId): ModelActivation => act(s).perModel[id]!
const setPm = (s: GameState, id: ModelId, p: Partial<ModelActivation>): GameState => {
  const a = act(s)
  return setAct(s, { ...a, perModel: { ...a.perModel, [id]: { ...a.perModel[id]!, ...p } } })
}
const kd = (s: GameState, m: ModelState): boolean => hasCondition(s, m, 'knockedDown')
const stat = (s: GameState, m: ModelState): boolean => hasCondition(s, m, 'stationary')

/** Remove clouds whose round has passed (Pall of Ashes lasts until the start of its caster's next turn). */
export function purgeClouds(state: GameState): GameState {
  const gone = state.clouds.filter((c) => c.expires && c.expires.turn <= state.turn && c.expires.player === state.activePlayer && !!(c.expires.round))
  if (!gone.length) return state
  return { ...state, clouds: state.clouds.filter((c) => !gone.includes(c)) }
}

// ---------- mover info ----------
export function moverInfo(state: GameState, b: B, id: ModelId): MoverInfo {
  const m = state.models[id]!
  const wi = weaponsOf(b, m).filter((w) => isMelee(w.w))
  const pall = state.effects.some((e) => e.sourceId === 'kha.f.pall-of-ashes' && e.owner === m.owner) && inPallCloud(state, m)
  return {
    spd: statOf(state, b, id, 'SPD'),
    warEngine: m.type === 'warEngine',
    hasMelee: wi.length > 0,
    meleeRange: wi.reduce((r, w) => Math.max(r, (w.w.rng as number) ?? 1), 1),
    pathfinder: hasFlag(state, b, id, 'pathfinder') || pall,
    unstoppable: hasFlag(state, b, id, 'unstoppable'),
    slam: hasFlag(state, b, id, 'slamPower'),
    trample: hasFlag(state, b, id, 'trample'),
    rangeOf: (x) => meleeReach(state, b, x),
  }
}
/** R7.12: slam range is 1" (2" for a 120 mm base). */
export const slamRange = (m: ModelState): number => (m.base === 120 ? 2 : 1)
/** Damage from power attacks arms Avenging Force like any other damage (khador.noteDamaged). */
function noteDamage(state: GameState, events: GameEvent[]): GameState {
  let s = state
  for (const e of events) if (e.type === 'DamageApplied' && (e as { points?: number }).points! > 0) s = khadorNoteDamaged(s, (e as { targetId: ModelId }).targetId)
  return s
}

// ---------- activation start ----------
function activeModelIds(state: GameState, activeId: ModelId | UnitId): ModelId[] {
  const u = state.units[activeId]
  if (u) return [...u.troopers, ...u.attachments].filter((id) => state.models[id] && isOnTable(state.models[id]!))
  return [activeId]
}
const emptyPm = (): ModelActivation => ({
  combat: null, combatForfeited: false, initialAttacksLeft: {}, attacksMade: 0, additionalAttacks: 0, powerAttackMade: false,
  rangedMade: false, meleeMade: false, chargeAttackUsed: false,
})

export function beginActivation(state0: GameState, b: B, activeId: ModelId | UnitId, lead: GameEvent[] = []): Result {
  let state = purgeClouds(state0)
  const u = state.units[activeId]
  const m = state.models[activeId]
  if (!u && !m) return reject('E_TARGET_INVALID', `nothing to activate: ${activeId}`)
  if ((u ? u.activated : m!.activated)) return reject('E_ALREADY_ACTIVATED', `${activeId} already activated`)
  if ((u ? u.owner : m!.owner) !== state.activePlayer) return reject('E_TARGET_INVALID', 'not your model')
  if (m && (m.inert || !isOnTable(m))) return reject('E_TARGET_INVALID', 'cannot activate')
  if (m && m.unitId) return reject('E_TARGET_INVALID', `${activeId} activates with its unit ${m.unitId}`)
  const ids = activeModelIds(state, activeId)
  const x: ActX = {
    stage: 'start', queue: [], cur: null, forfeit: [], failedCharge: false, meleeOnly: [], chargeAttackFor: null, killedAny: false, killedByRanged: false,
    mage: {}, endMoves: [], endMoveDone: false, channelVia: null, standUpUsed: false, endMoved: [],
  }
  const perModel: Record<ModelId, ModelActivation> = {}
  for (const id of ids) perModel[id] = emptyPm()
  const a: ActCtx = {
    activeId, modelIds: ids, movedModelId: null, movement: null, moved: 0, aimed: false, ran: false, charge: null, perModel,
    spellsCast: [], featUsed: false, healed: 0, limitsUsed: [], x,
  }
  state = { ...state, phase: 'activation', window: 'activation.start', activation: a as typeof state.activation, attack: null }
  const events: GameEvent[] = [...lead, { type: 'ActivationStarted', activeId, modelIds: ids }]
  // activation.start triggers (Accumulator): any of the model's rules that fire at activation start
  for (const id of ids) {
    for (const abId of abilitiesOf(state, b, id)) {
      const ab = rec(b, abId)
      if (ab.trigger !== 'activation.start') continue
      for (const n of (ab.effect ?? []) as Rec[]) {
        if (n.op === 'gainFocus') {
          const near = Object.values(state.models).some((o) => o.id !== id && o.owner === ownerOf(state, id) && isOnTable(o) && evalCond(state, b, ab.when, { selfId: o.id, srcId: id }) && within(o, state.models[id]!, 3))
          if (near) { const g = gainFocus(state, id, n.value ?? 1, 'gain'); state = g.state; events.push(...g.events) }
        }
      }
    }
  }
  return raiseMovement(state, b, events)
}

/** Close the activation: expire per-activation effects, then hand the turn back to turnflow. */
export function finishActivation(state0: GameState, b: B, events: GameEvent[], reason: 'normal' | 'ran' | 'failedCharge' | 'forfeit' | 'failedSlam' = 'normal'): Out {
  let state = state0
  const a = act(state)
  // hazards at the end of activation (R9.8): the models of the activation standing in a hazard cloud
  for (const id of a.modelIds) {
    const m = state.models[id]
    if (!m || !isOnTable(m)) continue
    for (const c of cloudsOver(state, m)) {
      if (c.hazard?.on.includes('endActivation') && c.owner !== m.owner) {
        const d = plainHazard(state, b, id, c.hazard.pow, c.hazard.damageType ? [c.hazard.damageType] : [])
        state = d.state; events.push(...d.events)
      }
    }
  }
  for (const id of a.modelIds) if (state.models[id]) state = setModel(state, { ...state.models[id]!, activated: true })
  const u = state.units[a.activeId]
  if (u) state = { ...state, units: { ...state.units, [u.id]: { ...u, activated: true } } }
  const ex = expireEffects(state, 'activation'); state = ex.state; events.push(...ex.events)
  events.push({ type: 'ActivationEnded', activeId: a.activeId, reason })
  state = { ...state, activation: null, attack: null }
  const end = afterDeaths(state, b)
  state = end.state; events.push(...end.events)
  if (end.ended || state.phase === 'ended') {
    return { state, events, pending: state.pending }
  }
  return raiseChooseActivation(state, events)
}

function plainHazard(state: GameState, b: B, id: ModelId, pow: number, types: DamageType[]): { state: GameState; events: GameEvent[] } {
  const look = lookups(state, b)
  const r = rollNd6(state, 2, 'damage', { ownerId: id, target: look.arm(id), flat: pow })
  const pts = Math.max(0, r.total - look.arm(id))
  const ap = applyDamage(r.state, id, pts, { source: 'other', layouts: look.layouts?.(id), damageTypes: types })
  let s = ap.state
  const events: GameEvent[] = [r.event, ...ap.events]
  if (s.models[id]!.life === 'disabled') {
    const d = resolveDeath(s, id, { tough: look.tough?.(id), layouts: look.layouts?.(id), cause: 'hazard' })
    s = d.state; events.push(...d.events)
  }
  return { state: s, events }
}

// ---------- Normal Movement ----------
function leadOf(state: GameState): ModelId {
  const a = act(state)
  return a.movedModelId ?? a.modelIds.find((id) => alive(state.models[id])) ?? a.modelIds[0]!
}

function movementOptionList(state: GameState, b: B, lead: ModelId, decisionId: string): DecisionOption[] {
  const m = state.models[lead]!
  const a = act(state)
  const info = moverInfo(state, b, lead)
  const opts = movementOptions(state, lead, info, { combatForfeited: a.perModel[lead]?.combatForfeited })
  const out: DecisionOption[] = []
  const player = m.owner
  const seeEnemy = enemiesOf(state, player).some((e) => hasLos(state, lead, e.id))
  for (const o of opts) {
    if (!o.allowed) continue
    // slam and trample (R7.12, R7.14) are offered to single models (no starter unit has them); a slam needs an enemy in LOS
    if ((o.option === 'slam' || o.option === 'trample') && a.modelIds.length !== 1) continue
    if ((o.option === 'charge' || o.option === 'slam') && !seeEnemy) continue
    out.push({ id: o.option, label: o.option, action: { type: 'chooseMovement', decisionId, player, option: o.option, modelId: lead }, ...(o.focusCost ? { cost: { focus: o.focusCost } } : {}) })
  }
  if (kd(state, m)) {
    out.push({ id: 'standUp', label: 'Stand up (forfeit movement)', action: { type: 'chooseMovement', decisionId, player, option: 'standUp', modelId: lead } })
    if (!m.crippled.includes('M')) out.push({ id: 'advance', label: 'Stand up and advance (forfeit Combat Action)', action: { type: 'chooseMovement', decisionId, player, option: 'advance', modelId: lead } })
  }
  return out
}

function raiseMovement(state0: GameState, b: B, events: GameEvent[]): Out {
  let state = patchX(state0, { stage: 'movement' })
  state = { ...state, window: 'movement.choose' }
  const a = act(state)
  const lead = a.modelIds.find((id) => alive(state.models[id]))
  if (!lead) return finishActivation(state, b, events, 'forfeit')
  const id = nextId(state)
  const options = [...movementOptionList(state, b, lead, id), ...(a.modelIds.length === 1 ? anytimeOptions(state, b, lead, id) : [])]
  const r = raise(state, { player: ownerOf(state, lead), kind: 'chooseMovement', window: 'movement.choose', context: { modelId: lead, unitId: state.units[a.activeId]?.id }, options, canPass: false })
  return ok(r.state, events)
}

function startCombatFrom(state0: GameState, b: B, events: GameEvent[]): Out {
  let state = patchX(state0, { stage: 'combat' })
  const a = act(state)
  if (a.ran) return finishActivation(state, b, events, 'ran')
  if (a.x.failedCharge) return finishActivation(state, b, events, 'failedCharge')
  state = patchX(state, { queue: a.modelIds.filter((id) => alive(state.models[id]) && !a.x.forfeit.includes(id)), cur: null })
  return nextCombat(state, b, events)
}

function mover(state: GameState, b: B, a: ChooseMovementAction | MoveModelAction | ChargeTargetAction): FlowResult | { lead: ModelId } {
  const ac = act(state)
  const lead = ('modelId' in a && a.modelId) ? a.modelId : leadOf(state)
  if (!ac.modelIds.includes(lead) || !alive(state.models[lead])) return reject('E_TARGET_INVALID', 'that model is not part of this activation')
  void b
  return { lead }
}

function chooseMovementAnswer(state0: GameState, b: B, a: ChooseMovementAction): Result {
  let state = state0
  const ac = act(state)
  const mv = mover(state, b, a)
  if (!('lead' in mv)) return mv
  const lead = mv.lead
  const m = state.models[lead]!
  const events: GameEvent[] = []
  const info = moverInfo(state, b, lead)
  events.push({ type: 'MovementChosen', modelId: lead, option: a.option, maxDist: a.option === 'run' ? info.spd + 5 : a.option === 'charge' || a.option === 'slam' || a.option === 'trample' ? info.spd + 3 : a.option === 'advance' ? info.spd : 0 })
  if (a.option === 'forfeit') {
    state = setAct(state, { ...act(state), movement: 'forfeit' })
    return startCombatFrom(state, b, events)
  }
  if (a.option === 'aim') {
    state = setAct(state, { ...act(state), movement: 'aim', aimed: true })
    return startCombatFrom(state, b, events)
  }
  if (a.option === 'standUp') {
    if (!kd(state, m)) return reject('E_NOT_AN_OPTION', 'not knocked down')
    const r = removeCondition(state, lead, 'knockedDown', 'standUp'); state = r.state; events.push(...r.events)
    state = setAct(state, { ...act(state), movement: 'standUp' })
    return startCombatFrom(patchX(state, { standUpUsed: true }), b, events)
  }
  if ((a.option === 'slam' || a.option === 'trample') && ac.modelIds.length !== 1) return reject('E_NOT_AN_OPTION', `${a.option} is only offered to a model activating on its own`)
  // standing up and advancing forfeits the Combat Action
  let standing = false
  if (kd(state, m)) {
    if (a.option !== 'advance') return reject('E_KNOCKED_DOWN', 'a knocked-down model may only stand up or advance')
    if (m.crippled.includes('M')) return reject('E_CRIPPLED', 'movement crippled')
    const r = removeCondition(state, lead, 'knockedDown', 'standUp'); state = r.state; events.push(...r.events)
    standing = true
  } else {
    const opts = movementOptions(state, lead, info, { combatForfeited: ac.perModel[lead]?.combatForfeited })
    const o = opts.find((x) => x.option === a.option)
    if (!o || !o.allowed) {
      const reason = o?.reason ?? 'not allowed'
      const code: Rejection['code'] = /engaged/.test(reason) ? 'E_ENGAGED' : /knocked/.test(reason) ? 'E_KNOCKED_DOWN' : /stationary/.test(reason) ? 'E_STATIONARY' : /focus/.test(reason) ? 'E_INSUFFICIENT_FOCUS' : /crippled/.test(reason) ? 'E_CRIPPLED' : 'E_NOT_AN_OPTION'
      return reject(code, `${a.option}: ${reason}`)
    }
    if (o.focusCost > 0) {
      const f = spendFocus(state, lead, o.focusCost, a.option === 'run' ? 'run' : a.option === 'charge' ? 'charge' : 'powerAttack')
      if (isRejection(f)) return reject(f.rejection.code, f.rejection.message)
      state = f.state; events.push(...f.events)
    }
  }
  if (standing) state = setPm(state, lead, { combatForfeited: true })
  if (a.option === 'charge') {
    const id = nextId(state)
    const opts: DecisionOption[] = enemiesOf(state, m.owner).filter((e) => hasLos(state, lead, e.id))
      .map((e) => ({ id: e.id, label: `Charge ${e.id}`, action: { type: 'chargeTarget', decisionId: id, player: m.owner, targetId: e.id } as Action }))
    if (!opts.length) return reject('E_TARGET_INVALID', 'no enemy in line of sight to charge')
    state = setAct(patchX(state, { stage: 'chargeTarget' }), { ...act(patchX(state, { stage: 'chargeTarget' })), movement: 'charge', movedModelId: lead })
    const r = raise({ ...state, window: 'movement.charge' }, { player: m.owner, kind: 'chargeTarget', window: 'movement.charge', context: { modelId: lead }, options: opts, canPass: false })
    return ok(r.state, events)
  }
  if (a.option === 'slam') {
    // R7.12: declare a target that is in LOS now (the start of Normal Movement)
    const id = nextId(state)
    const opts: DecisionOption[] = enemiesOf(state, m.owner).filter((e) => hasLos(state, lead, e.id))
      .map((e) => ({ id: e.id, label: `Slam ${e.id}`, action: { type: 'chargeTarget', decisionId: id, player: m.owner, targetId: e.id } as Action }))
    if (!opts.length) return reject('E_TARGET_INVALID', 'no enemy in line of sight to slam')
    state = setAct(patchX(state, { stage: 'slamTarget' }), { ...act(patchX(state, { stage: 'slamTarget' })), movement: 'slam', movedModelId: lead })
    const r = raise({ ...state, window: 'movement.charge' }, { player: m.owner, kind: 'chargeTarget', window: 'movement.charge', context: { modelId: lead, data: { mode: 'slam' } }, options: opts, canPass: false })
    return ok(r.state, events)
  }
  if (a.option === 'trample') {
    // R7.14: declare the direction at the start of Normal Movement, then advance up to SPD+3" in a straight line
    state = setAct(patchX(state, { stage: 'trampleMove' }), { ...act(patchX(state, { stage: 'trampleMove' })), movement: 'trample', movedModelId: lead })
    const id = nextId(state)
    const options: DecisionOption[] = trampleSamples(state, b, lead).map((p, i) => ({
      id: `tr${i}`, label: i === 0 ? 'Trample 0" (stay put)' : `Trample to ${p.x.toFixed(1)},${p.z.toFixed(1)}`,
      action: { type: 'moveModel', decisionId: id, player: m.owner, modelId: lead, path: [p] } as Action,
    }))
    const r = raise({ ...state, window: 'movement.move' }, {
      player: m.owner, kind: 'moveModel', window: 'movement.move', context: { modelId: lead, data: { mode: 'trample' } },
      constraints: { modelId: lead, from: m.pos, maxDist: info.spd + 3, straightLine: true }, options, canPass: false,
    })
    return ok(r.state, events)
  }
  const kind = a.option === 'run' ? 'run' : 'advance'
  const maxDist = kind === 'run' ? info.spd + 5 : info.spd
  state = setAct(patchX(state, { stage: 'move', pendingMove: { kind } }), { ...act(patchX(state, { stage: 'move', pendingMove: { kind } })), movement: a.option, movedModelId: lead })
  const id = nextId(state)
  const samples = moveSamples(state, b, lead, kind, maxDist)
  const options: DecisionOption[] = samples.map((p, i) => ({ id: `mv${i}`, label: `Move to ${p.x.toFixed(1)},${p.z.toFixed(1)}`, action: { type: 'moveModel', decisionId: id, player: m.owner, modelId: lead, path: [p] } as Action }))
  const r = raise({ ...state, window: 'movement.move' }, {
    player: m.owner, kind: 'moveModel', window: 'movement.move', context: { modelId: lead, unitId: state.units[ac.activeId]?.id },
    constraints: { modelId: lead, from: m.pos, maxDist }, options, canPass: false,
  })
  return ok(r.state, events)
}

/** A few validated end points: staying put, straight toward the nearest enemy, and eight compass moves. */
function moveSamples(state: GameState, b: B, lead: ModelId, kind: 'advance' | 'run', maxDist: number): Vec2[] {
  const m = state.models[lead]!
  const info = moverInfo(state, b, lead)
  const cand: Vec2[] = [m.pos]
  const foe = enemiesOf(state, m.owner).sort((x, y) => dist(x.pos, m.pos) - dist(y.pos, m.pos))[0]
  const tryDirs: number[] = foe ? [angleOf(sub(foe.pos, m.pos))] : []
  for (let i = 0; i < 8; i++) tryDirs.push((i * Math.PI) / 4)
  for (const ang of tryDirs) for (const f of [1, 0.6, 0.3]) cand.push({ x: m.pos.x + Math.cos(ang) * maxDist * f, z: m.pos.z + Math.sin(ang) * maxDist * f })
  const good: Vec2[] = []
  for (const p of cand) {
    const r = resolveAdvance(state, { modelId: lead, waypoints: [p], kind, info })
    if (r.ok) good.push(p)
    if (good.length >= 10) break
  }
  if (!good.length) good.push(m.pos)
  return good
}

function moveAnswer(state0: GameState, b: B, a: MoveModelAction): Result {
  let state = state0
  const pd = state.pending
  if (pd.context.data?.trigger) return triggerMoveAnswer(state, b, a)
  const ac = act(state)
  if (ac.x.stage === 'chargeMove') return chargeMoveAnswer(state, b, a)
  if (ac.x.stage === 'slamMove') return slamMoveAnswer(state, b, a)
  if (ac.x.stage === 'trampleMove') return trampleMoveAnswer(state, b, a)
  const pend = ac.x.pendingMove
  if (!pend || ac.x.stage !== 'move') return reject('E_WRONG_DECISION', 'not moving')
  const lead = pd.constraints?.modelId ?? leadOf(state)
  if (a.modelId !== lead) return reject('E_TARGET_INVALID', `the model that moves is ${lead}`)
  const info = moverInfo(state, b, lead)
  const path = a.path.length ? a.path : [state.models[lead]!.pos]
  const u = state.units[ac.activeId]
  // a zero-length move is always legal (the model may be moved 0", R5.0), even from a spot that is not a legal end point
  const zero = path.every((p) => dist(p, state.models[lead]!.pos) < 1e-9)
  const engagedBefore = u ? unitEngagement(state, u.id, info) : {}
  const res: ReturnType<typeof resolveAdvance> = zero
    ? { ok: true, state, events: [], forfeitCombat: pend.kind === 'run', endsActivation: pend.kind === 'run' }
    : resolveAdvance(state, { modelId: lead, waypoints: path, kind: pend.kind, info })
  if (!res.ok) return reject(res.code, res.message)
  const cont: PlaceAfter = { kind: 'move', leadId: lead, from: state0.models[lead]!.pos, engagedBefore, run: pend.kind === 'run', forfeitCombat: res.forfeitCombat }
  if (u && othersToPlace(res.state, u.id, lead).length > 0) return raisePlaceTroopers(res.state, b, [...res.events], cont)
  return afterPlacement(res.state, b, [...res.events], cont, [])
}

// ---------- unit placement (R5.8): the moved trooper's unit-mates are placed within 2" of it, with LOS to it ----------
interface PlaceAfter {
  kind: 'move' | 'charge'
  leadId: ModelId
  from: Vec2
  engagedBefore: Record<ModelId, ModelId[]>
  run?: boolean
  forfeitCombat?: boolean
  charge?: { targetId: ModelId; success: boolean; distance: number; chargeAttack: boolean }
  unplaceable?: ModelId[]
}
const PLACE_DIST = 2
function unitEngagement(state: GameState, unitId: UnitId, info: MoverInfo): Record<ModelId, ModelId[]> {
  const out: Record<ModelId, ModelId[]> = {}
  for (const t of state.units[unitId]!.troopers) if (alive(state.models[t])) out[t] = engagedBy(state, t, info.rangeOf)
  return out
}
const othersToPlace = (state: GameState, unitId: UnitId, leadId: ModelId): ModelId[] =>
  state.units[unitId]!.troopers.filter((t) => t !== leadId && state.models[t]?.life === 'active' && isOnTable(state.models[t]!))

function raisePlaceTroopers(state0: GameState, b: B, events: GameEvent[], cont: PlaceAfter): Out {
  const ac = act(state0)
  const u = state0.units[ac.activeId]!
  const others = othersToPlace(state0, u.id, cont.leadId)
  const sug = placeWithin(state0, cont.leadId, others, { dist: PLACE_DIST, completely: false, visible: (p) => hasLosFromAnchor(state0, cont.leadId, p) })
  let state = patchX(state0, { stage: 'place', placeAfter: { ...cont, unplaceable: sug.failed } })
  state = { ...state, window: 'movement.place' }
  const did = nextId(state)
  const player = ownerOf(state, cont.leadId)
  const placements = Object.entries(sug.placed).map(([modelId, pos]) => ({ modelId, pos }))
  const options: DecisionOption[] = [{ id: 'auto', label: 'Place the unit around the moved trooper', action: { type: 'placeTroopers', decisionId: did, player, placements } as Action }]
  const r = raise(state, {
    player, kind: 'placeTroopers', window: 'movement.place', context: { modelId: cont.leadId, unitId: u.id, data: { modelIds: others, unplaceable: sug.failed } },
    constraints: { modelId: others[0] ?? cont.leadId, from: state.models[cont.leadId]!.pos, maxDist: PLACE_DIST, placeWithin: { anchorId: cont.leadId, dist: PLACE_DIST, completely: false, los: true } },
    options, canPass: false,
  })
  return ok(r.state, events)
}

function placeTroopersAnswer(state0: GameState, b: B, a: import('../actions').PlaceTroopersAction): Result {
  const ac = act(state0)
  const cont = ac.x.placeAfter as PlaceAfter | undefined
  if (ac.x.stage !== 'place' || !cont) return reject('E_WRONG_DECISION', 'no troopers to place')
  const u = state0.units[ac.activeId]!
  const others = othersToPlace(state0, u.id, cont.leadId)
  const anchor = state0.models[cont.leadId]!
  const seen = new Set<ModelId>()
  const extra: { pos: Vec2; r: number }[] = [{ pos: anchor.pos, r: baseRadius(anchor.base) }]
  const placed: Record<ModelId, Vec2> = {}
  for (const p of a.placements ?? []) {
    if (!others.includes(p.modelId)) return reject('E_TARGET_INVALID', `${p.modelId} is not a trooper to place`)
    if (seen.has(p.modelId)) return reject('E_BAD_PAYLOAD', `${p.modelId} is placed twice`)
    seen.add(p.modelId)
    if (!p.pos || !Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.z)) return reject('E_BAD_PAYLOAD', 'bad position')
    const m = state0.models[p.modelId]!
    const gap = dist(p.pos, anchor.pos) - baseRadius(m.base) - baseRadius(anchor.base)
    if (gap > PLACE_DIST + 1e-6) return reject('E_TOO_FAR', `${p.modelId} must be within ${PLACE_DIST}" of ${cont.leadId}`)
    const legal = isLegalPlacement(state0, p.modelId, p.pos, m.base, { ignoreIds: others, extra })
    if (!legal.ok) return reject(legal.code ?? 'E_PLACEMENT', legal.message ?? 'illegal placement')
    if (!hasLosFromAnchor(state0, cont.leadId, p.pos)) return reject('E_NO_LOS', `${p.modelId} must be placed in line of sight of ${cont.leadId}`)
    extra.push({ pos: p.pos, r: baseRadius(m.base) })
    placed[p.modelId] = p.pos
  }
  // only troopers that cannot be placed anywhere may be left out (they are destroyed)
  const missing = others.filter((t) => !seen.has(t))
  const unplaceable = new Set(cont.unplaceable ?? [])
  const bad = missing.find((t) => !unplaceable.has(t))
  if (bad) return reject('E_BAD_PAYLOAD', `place every trooper (${bad} is missing)`)
  const info = moverInfo(state0, b, cont.leadId)
  const p = placeUnit(state0, u.id, cont.leadId, { engagedBefore: cont.engagedBefore, charge: cont.kind === 'charge', unstoppable: info.unstoppable, rangeOf: info.rangeOf, placed })
  return afterPlacement(p.state, b, p.events, cont, p.forfeit)
}

/** The rest of the Normal Movement once the moved model (and its unit) stand in their final spots. */
function afterPlacement(state0: GameState, b: B, events: GameEvent[], cont: PlaceAfter, unitForfeit: ModelId[]): Out {
  let state = patchX(state0, { placeAfter: undefined, pendingMove: undefined })
  const ac = act(state)
  const forfeit = new Set<ModelId>([...ac.x.forfeit, ...unitForfeit])
  if (cont.kind === 'move') {
    const to = state.models[cont.leadId]!.pos
    if (cont.forfeitCombat) forfeit.add(cont.leadId)
    if (cont.run) for (const id of ac.modelIds) forfeit.add(id)
    state = patchX(state, { forfeit: [...forfeit] })
    state = setAct(state, { ...act(state), moved: dist(cont.from, to), ran: !!cont.run })
    state = { ...state, window: 'movement.end' }
    if (cont.run) return finishActivation(state, b, events, 'ran')
    return startCombatFrom(state, b, events)
  }
  const c = cont.charge!
  state = setAct(state, { ...act(state), charge: { targetId: c.targetId, distance: c.distance, success: c.success }, moved: c.distance })
  state = patchX(state, { forfeit: [...forfeit] })
  if (!c.success) {
    state = patchX(state, { failedCharge: true })
    return finishActivation({ ...state, window: 'movement.end' }, b, events, 'failedCharge')
  }
  // R5.3: the charger (and in a unit, every trooper) must make melee attacks or forfeit
  state = patchX(state, { meleeOnly: act(state).modelIds, chargeAttackFor: c.chargeAttack ? cont.leadId : null })
  return startCombatFrom({ ...state, window: 'movement.end' }, b, events)
}

function hasLosFromAnchor(state: GameState, anchorId: ModelId, pos: Vec2): boolean {
  // a placed trooper must see the moved trooper (R5.8): test with a probe at the end point
  const anchor = state.models[anchorId]
  if (!anchor) return true
  const probe: ModelState = { ...anchor, id: '__probe', pos }
  const s: GameState = { ...state, models: { ...state.models, __probe: probe } }
  return hasLos(s, '__probe', anchorId)
}

function chargeTargetAnswer(state0: GameState, b: B, a: ChargeTargetAction): Result {
  const state = state0
  if (act(state).x.stage === 'slamTarget') return slamTargetAnswer(state, b, a)
  const lead = state.pending.context.modelId ?? leadOf(state)
  const t = state.models[a.targetId]
  const m = state.models[lead]!
  if (!t || !isOnTable(t) || t.owner === m.owner) return reject('E_TARGET_INVALID', 'charge an enemy model')
  if (!hasLos(state, lead, a.targetId)) return reject('E_NO_LOS', 'no line of sight to the charge target')
  const info = moverInfo(state, b, lead)
  // the default answer: straight at the target until contact (or SPD+3")
  const full = resolveCharge(state, { modelId: lead, targetId: a.targetId, info })
  if (!full.ok) return reject(full.code, full.message)
  return raiseChargeMove(state, b, [], lead, a.targetId, full.state.models[lead]!.pos)
}

/** R5.2: after the target is declared, the charger moves in a straight line (moveModel with straightLine + toward). */
function raiseChargeMove(state0: GameState, b: B, events: GameEvent[], lead: ModelId, targetId: ModelId, fullEnd: Vec2): Out {
  const m = state0.models[lead]!
  const info = moverInfo(state0, b, lead)
  let state = patchX(state0, { stage: 'chargeMove', chargeTo: targetId })
  state = { ...state, window: 'movement.charge' }
  const did = nextId(state)
  const options: DecisionOption[] = [{ id: 'full', label: 'Charge straight in', action: { type: 'moveModel', decisionId: did, player: m.owner, modelId: lead, path: [fullEnd] } as Action }]
  const r = raise(state, {
    player: m.owner, kind: 'moveModel', window: 'movement.charge', context: { modelId: lead, targetId, unitId: state.units[act(state).activeId]?.id },
    constraints: { modelId: lead, from: m.pos, maxDist: info.spd + 3, straightLine: true, toward: targetId, mustEndInRange: { targetId, range: info.meleeRange ?? 1 } },
    options, canPass: false,
  })
  return ok(r.state, events)
}

function chargeMoveAnswer(state0: GameState, b: B, a: MoveModelAction): Result {
  const state = state0
  const ac = act(state)
  const targetId = ac.x.chargeTo
  const lead = state.pending.constraints?.modelId ?? leadOf(state)
  if (!targetId) return reject('E_WRONG_DECISION', 'no charge in progress')
  if (a.modelId !== lead) return reject('E_TARGET_INVALID', `the charging model is ${lead}`)
  const m = state.models[lead]!
  const to = a.path?.length ? a.path[a.path.length - 1]! : m.pos
  if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.z)) return reject('E_BAD_PAYLOAD', 'bad end point')
  const info = moverInfo(state, b, lead)
  const u = state.units[ac.activeId]
  const engagedBefore = u ? unitEngagement(state, u.id, info) : {}
  const r = resolveChargeTo(state, { modelId: lead, targetId, info, to })
  if (!r.ok) return reject(r.code, r.message)
  const s1 = patchX(r.state, { chargeTo: undefined })
  const cont: PlaceAfter = {
    kind: 'charge', leadId: lead, from: m.pos, engagedBefore,
    charge: { targetId, success: r.success, distance: r.distance, chargeAttack: r.chargeAttack },
  }
  if (u && othersToPlace(s1, u.id, lead).length > 0) return raisePlaceTroopers(s1, b, [...r.events], cont)
  return afterPlacement(s1, b, [...r.events], cont, [])
}

// ---------- slam and trample (R7.12, R7.14): power attacks that use Normal Movement and the Combat Action ----------
const STRAIGHT_TOL = 0.02 // inches off the line toward the slam target's centre that still count as "directly toward"

/** Trample end points: staying put, then as far as each line goes toward the nearest enemies and in eight compass directions. */
function trampleSamples(state: GameState, b: B, lead: ModelId): Vec2[] {
  const m = state.models[lead]!
  const info = moverInfo(state, b, lead)
  const out: Vec2[] = [m.pos]
  const dirs: Vec2[] = enemiesOf(state, m.owner).sort((x, y) => dist(x.pos, m.pos) - dist(y.pos, m.pos)).slice(0, 4).map((e) => sub(e.pos, m.pos))
  for (let i = 0; i < 8; i++) dirs.push({ x: Math.cos((i * Math.PI) / 4), z: Math.sin((i * Math.PI) / 4) })
  for (const d of dirs) {
    if (Math.hypot(d.x, d.z) < 1e-9) continue
    const full = resolveTrampleMove(state, { modelId: lead, dir: d, info })
    if (full.ok && full.distance > 1e-6) { out.push(full.state.models[lead]!.pos); if (out.length >= 10) break; continue }
    // the full line ends overlapping a base: try shorter moves along it
    for (const f of [0.75, 0.5, 0.25]) {
      const r = resolveTrampleMove(state, { modelId: lead, dir: d, info, dist: (info.spd + 3) * f })
      if (r.ok && r.distance > 1e-6) { out.push(r.state.models[lead]!.pos); break }
    }
    if (out.length >= 10) break
  }
  return out
}

function slamTargetAnswer(state: GameState, b: B, a: ChargeTargetAction): Result {
  const lead = state.pending.context.modelId ?? leadOf(state)
  const t = state.models[a.targetId]
  const m = state.models[lead]!
  if (!t || !isOnTable(t) || t.owner === m.owner) return reject('E_TARGET_INVALID', 'slam an enemy model')
  if (!hasLos(state, lead, a.targetId)) return reject('E_NO_LOS', 'the slam target must be in line of sight at the start of Normal Movement')
  const info = moverInfo(state, b, lead)
  const range = slamRange(m)
  // the default answer: straight at the target's centre until contact, the slam range, or SPD+3"
  const full = resolveCharge(state, { modelId: lead, targetId: a.targetId, info, kind: 'slam', range })
  if (!full.ok) return reject(full.code, full.message)
  const s1 = patchX({ ...state, window: 'movement.charge' }, { stage: 'slamMove', slam: { targetId: a.targetId, moved: 0 } })
  const did = nextId(s1)
  const options: DecisionOption[] = [{ id: 'full', label: 'Slam straight in', action: { type: 'moveModel', decisionId: did, player: m.owner, modelId: lead, path: [full.state.models[lead]!.pos] } as Action }]
  const r = raise(s1, {
    player: m.owner, kind: 'moveModel', window: 'movement.charge', context: { modelId: lead, targetId: a.targetId, data: { mode: 'slam' } },
    constraints: { modelId: lead, from: m.pos, maxDist: info.spd + 3, straightLine: true, toward: a.targetId, mustEndInRange: { targetId: a.targetId, range } },
    options, canPass: false,
  })
  return ok(r.state, [{ type: 'CombatActionChosen', modelId: lead, choice: 'powerAttack', powerAttack: 'slam' }])
}

function slamMoveAnswer(state0: GameState, b: B, a: MoveModelAction): Result {
  let state = state0
  const ac = act(state)
  const sl = ac.x.slam
  const lead = state.pending.constraints?.modelId ?? leadOf(state)
  if (!sl) return reject('E_WRONG_DECISION', 'no slam in progress')
  if (a.modelId !== lead) return reject('E_TARGET_INVALID', `the slamming model is ${lead}`)
  const m = state.models[lead]!
  const t = state.models[sl.targetId]!
  const to = a.path?.length ? a.path[a.path.length - 1]! : m.pos
  if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.z)) return reject('E_BAD_PAYLOAD', 'bad end point')
  // R7.12: the slam advances directly toward the target (its centre), unlike a charge's free choice of line
  if (dist(m.pos, to) > 1e-6) {
    const along = sub(t.pos, m.pos)
    const L = Math.hypot(along.x, along.z)
    const v = sub(to, m.pos)
    const off = L < 1e-9 ? 0 : Math.abs(v.x * along.z - v.z * along.x) / L
    if (off > STRAIGHT_TOL || v.x * along.x + v.z * along.z <= 0) return reject('E_NOT_STRAIGHT', 'a slam moves directly toward its target')
  }
  const info = moverInfo(state, b, lead)
  const r = resolveChargeTo(state, { modelId: lead, targetId: sl.targetId, info, to, kind: 'slam', range: slamRange(m) })
  if (!r.ok) return reject(r.code, r.message)
  const events = r.events.filter((e) => e.type !== 'ChargeDeclared')
  state = setAct(r.state, { ...act(r.state), movement: 'slam', moved: r.distance })
  state = { ...state, window: 'movement.end' }
  if (!r.success) {
    // R7.12: the target is not in slam range: the slam fails and the activation ends
    return finishActivation(patchX(state, { slam: undefined }), b, events, 'failedSlam')
  }
  state = patchX(state, { stage: 'combat', queue: [], cur: lead, powerKind: 'slam', slam: { targetId: sl.targetId, moved: r.distance } })
  state = setPm(state, lead, { combat: 'powerAttack' })
  return raiseChooseAttack(state, b, events)
}

function trampleMoveAnswer(state0: GameState, b: B, a: MoveModelAction): Result {
  let state = state0
  const lead = state.pending.constraints?.modelId ?? leadOf(state)
  if (a.modelId !== lead) return reject('E_TARGET_INVALID', `the trampling model is ${lead}`)
  const m = state.models[lead]!
  const to = a.path?.length ? a.path[a.path.length - 1]! : m.pos
  if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.z)) return reject('E_BAD_PAYLOAD', 'bad end point')
  // every waypoint must sit on the one straight line
  const v = sub(to, m.pos)
  const L = Math.hypot(v.x, v.z)
  for (const p of (a.path ?? []).slice(0, -1)) {
    const w = sub(p, m.pos)
    if (L > 1e-9 && (Math.abs(w.x * v.z - w.z * v.x) / L > STRAIGHT_TOL || w.x * v.x + w.z * v.z < 0)) return reject('E_NOT_STRAIGHT', 'a trample moves in a straight line')
  }
  const info = moverInfo(state, b, lead)
  const events: GameEvent[] = [{ type: 'CombatActionChosen', modelId: lead, choice: 'powerAttack', powerAttack: 'trample' }]
  let trampled: ModelId[] = []
  if (L > 1e-6) {
    const r = resolveTrampleMove(state, { modelId: lead, dir: v, info, dist: L })
    if (!r.ok) return reject(r.code, r.message)
    state = r.state; events.push(...r.events); trampled = r.trampled
  }
  state = setAct(state, { ...act(state), movement: 'trample', moved: L })
  state = patchX({ ...state, window: 'movement.end' }, { stage: 'combat', queue: [], cur: lead, powerKind: 'trample' })
  state = setPm(state, lead, { combat: 'powerAttack', powerAttackMade: true })
  // one melee attack roll against each small enemy model moved through; hits take power-attack damage (R7.14)
  const s0 = state
  const mover = s0.models[lead]!
  const seq = s0.attackSeq
  const ta = resolveTrampleAttacks(s0, {
    attackerId: lead, move: { ok: true, state: s0, events: [], forfeitCombat: false, endsActivation: false, distance: L, trampled, sweep: undefined as never },
    mat: statOf(s0, b, lead, 'MAT'),
    def: (id) => defFor(s0, b, null, mover, s0.models[id]!, 'melee').def,
    autoHit: (id) => defFor(s0, b, null, mover, s0.models[id]!, 'melee').autoHit,
    look: lookups(s0, b), attackId: (n) => `a:${seq + 1 + n}`,
  })
  const declared = ta.events.filter((e) => e.type === 'AttackDeclared').length
  state = { ...ta.state, attackSeq: seq + declared }
  events.push(...ta.events)
  state = noteDamage(state, ta.events)
  state = sweepDead(state)
  if (ta.events.some((e) => e.type === 'ModelRemoved')) state = patchX(state, { killedAny: true })
  const end = afterDeaths(state, b)
  state = end.state; events.push(...end.events)
  if (end.ended || state.phase === 'ended') return { state, events, pending: state.pending }
  return raiseChooseAttack(state, b, events)
}

// ---------- Combat Action ----------
const ATK_POINTS = new Set(['attack.declared', 'attack.beforeRoll', 'attack.hit', 'attack.crit', 'attack.miss', 'attack.resolved', 'damage.beforeRoll', 'damage.beforeApply', 'death.boxed'])

function nextCombat(state0: GameState, b: B, events: GameEvent[]): Out {
  let state = state0
  const queue = [...act(state).x.queue]
  let cur: ModelId | undefined
  while (queue.length) {
    const id = queue.shift()!
    if (!alive(state.models[id])) continue
    if (act(state).x.forfeit.includes(id)) continue
    cur = id
    break
  }
  state = patchX(state, { queue, cur: cur ?? null })
  if (!cur) return endOfCombat(state, b, events)
  return raiseCombatChoice(state, b, events)
}

interface CombatChoiceInfo { choice: ChooseCombatActionAction['choice']; abilityId?: Id; powerAttack?: ChooseCombatActionAction['powerAttack']; label: string }

function starWeapon(state: GameState, b: B, id: ModelId, abilityId: Id): WeaponInst | undefined {
  const m = state.models[id]!
  return weaponsOf(b, m).find((w) => ((w.w.abilities ?? []) as Id[]).includes(abilityId) && !weaponCrippled(m, w.loc))
}
const canSpendFocus = (state: GameState, id: ModelId): boolean => {
  const m = state.models[id]
  return !!m && m.focus >= 1 && (m.type === 'leader' || m.type === 'warEngine') && !m.crippled.includes('C') && !hasCondition(state, m, 'disrupted') && !m.inert
}

function combatChoices(state: GameState, b: B, id: ModelId): CombatChoiceInfo[] {
  const m = state.models[id]!
  const a = act(state)
  const out: CombatChoiceInfo[] = []
  const ws = weaponsOf(b, m)
  const melee = ws.filter((w) => isMelee(w.w))
  const ranged = ws.filter((w) => !isMelee(w.w))
  const meleeOnly = a.x.meleeOnly.includes(id)
  if (kd(state, m)) out.push({ choice: 'standUp', label: 'Stand up (forfeits the Combat Action)' })
  else if (!stat(state, m) && !m.inert) {
    if (!meleeOnly || enemiesOf(state, m.owner).some((e) => melee.some((w) => within(m, e, w.w.rng ?? 1)))) {
      if (melee.length) out.push({ choice: 'melee', label: 'Melee attacks' })
      if (ranged.length && !meleeOnly) out.push({ choice: 'ranged', label: 'Ranged attacks' })
      if (melee.length && ranged.length && !meleeOnly && hasFlag(state, b, id, 'dualAttack')) out.push({ choice: 'dual', label: 'Dual Attack' })
      const starIds = [...new Set([...abilitiesOf(state, b, id), ...ws.flatMap((w) => (w.w.abilities ?? []) as Id[])])]
      for (const abId of starIds) {
        const ab = rec(b, abId)
        if (ab.kind !== 'specialAttack' || ab.trigger !== 'combat.choose') continue
        const w = starWeapon(state, b, id, abId)
        if (!w || (meleeOnly && !isMelee(w.w))) continue
        out.push({ choice: 'specialAttack', abilityId: abId, label: ab.name })
      }
      if (!a.charge && !a.x.meleeOnly.includes(id) && (m.type !== 'warEngine' || canSpendFocus(state, id))) {
        if (hasFlag(state, b, id, 'headbutt') && melee.some((w) => !weaponCrippled(m, w.loc) || true)) out.push({ choice: 'powerAttack', powerAttack: 'headbutt', label: 'Headbutt' })
        if (melee.some((w) => ((w.w.qualities ?? []) as Id[]).includes('core.q.throw') && !weaponCrippled(m, w.loc))) out.push({ choice: 'powerAttack', powerAttack: 'throw', label: 'Throw' })
      }
    }
  }
  out.push({ choice: 'forfeit', label: 'Forfeit the Combat Action' })
  return out
}

function raiseCombatChoice(state0: GameState, b: B, events: GameEvent[]): Out {
  const state = { ...state0, window: 'combat.choose' as const }
  const id = act(state).x.cur!
  const m = state.models[id]!
  const did = nextId(state)
  const choices = combatChoices(state, b, id)
  if (choices.length === 1 && choices[0]!.choice === 'forfeit' && !anytimeOptions(state, b, id, did).length) {
    events.push({ type: 'DecisionAutoResolved', kind: 'chooseCombatAction', optionId: 'forfeit' }, { type: 'CombatActionForfeited', modelId: id, reason: 'choice' })
    return nextCombat(patchX(setPm(state, id, { combat: 'forfeit', combatForfeited: true }), { cur: null }), b, events)
  }
  const options: DecisionOption[] = choices.map((c, i) => ({
    id: `${c.choice}${c.abilityId ? ':' + c.abilityId : ''}${c.powerAttack ? ':' + c.powerAttack : ''}${i}`, label: c.label,
    action: { type: 'chooseCombatAction', decisionId: did, player: m.owner, modelId: id, choice: c.choice, ...(c.abilityId ? { abilityId: c.abilityId } : {}), ...(c.powerAttack ? { powerAttack: c.powerAttack } : {}) } as Action,
    ...(c.choice === 'powerAttack' && m.type === 'warEngine' ? { cost: { focus: 1 } } : {}),
  }))
  options.push(...anytimeOptions(state, b, id, did))
  const r = raise(state, { player: m.owner, kind: 'chooseCombatAction', window: 'combat.choose', context: { modelId: id, unitId: state.units[act(state).activeId]?.id }, options, canPass: false })
  return ok(r.state, events)
}

function rofFor(state: GameState, w: Rec, ownerId: ModelId): { state: GameState; events: GameEvent[]; n: number } {
  const rof = w.rof ?? 1
  if (typeof rof === 'number') return { state, events: [], n: rof }
  const mt = /^(\d*)d(3|6)(?:\+(\d+))?$/.exec(String(rof))
  if (!mt) return { state, events: [], n: 1 }
  const count = mt[1] ? Number(mt[1]) : 1
  const r = rollNd6(state, count, 'rof', { ownerId })
  const per = (d: number) => (mt[2] === '3' ? Math.ceil(d / 2) : d)
  const n = r.dice.reduce((s, d) => s + per(d), 0) + (mt[3] ? Number(mt[3]) : 0)
  return { state: r.state, events: [r.event], n }
}

function combatAnswer(state0: GameState, b: B, a: ChooseCombatActionAction): Result {
  let state = state0
  const cur = act(state).x.cur
  if (a.modelId !== cur || !cur) return reject('E_TARGET_INVALID', `${cur} is the model choosing`)
  const m = state.models[cur]!
  const list = combatChoices(state, b, cur)
  const match = list.find((c) => c.choice === a.choice && (c.abilityId ?? null) === (a.abilityId ?? null) && (c.powerAttack ?? null) === (a.powerAttack ?? null))
  if (!match) {
    if (a.choice === 'dual') return reject('E_NO_DUAL_ATTACK', 'this model has no Dual Attack')
    if (a.choice === 'powerAttack') return reject('E_POWER_ATTACK', 'power attack not available')
    if (kd(state, m)) return reject('E_KNOCKED_DOWN', 'knocked down: stand up or forfeit')
    if (stat(state, m)) return reject('E_STATIONARY', 'stationary')
    return reject('E_NOT_AN_OPTION', `${a.choice} is not available now`)
  }
  const events: GameEvent[] = [{ type: 'CombatActionChosen', modelId: cur, choice: a.choice, abilityId: a.abilityId, powerAttack: a.powerAttack }]
  if (a.choice === 'forfeit' || a.choice === 'standUp') {
    if (a.choice === 'standUp') { const r = removeCondition(state, cur, 'knockedDown', 'standUp'); state = r.state; events.push(...r.events) }
    events.push({ type: 'CombatActionForfeited', modelId: cur, reason: a.choice === 'standUp' ? 'standUp' : 'choice' })
    state = setPm(state, cur, { combat: a.choice, combatForfeited: true })
    return nextCombat(state, b, events)
  }
  const left: Record<Id, number> = {}
  const ws = weaponsOf(b, m)
  const wantMelee = a.choice === 'melee' || a.choice === 'dual'
  const wantRanged = a.choice === 'ranged' || a.choice === 'dual'
  if (wantMelee) for (const w of ws) if (isMelee(w.w)) left[w.weaponId] = (left[w.weaponId] ?? 0) + 1
  if (wantRanged) {
    const done = new Set<Id>()
    for (const w of ws) {
      if (isMelee(w.w)) continue
      if (!done.has(w.weaponId)) { done.add(w.weaponId); const r = rofFor(state, w.w, cur); state = r.state; events.push(...r.events); left[w.weaponId] = 0; (left as Record<Id, number>)['rof:' + w.weaponId] = r.n }
      left[w.weaponId] = (left[w.weaponId] ?? 0) + ((left as Record<Id, number>)['rof:' + w.weaponId] ?? 1)
    }
    for (const k of Object.keys(left)) if (k.startsWith('rof:')) delete left[k]
  }
  if (a.choice === 'specialAttack') {
    const w = starWeapon(state, b, cur, a.abilityId!)!
    left[w.weaponId] = 1
    state = patchX(state, { star: { modelId: cur, abilityId: a.abilityId!, weaponId: w.weaponId } })
    // Targeting Flare is a point-less placement attack in this build: handled as the ability's own flag below
  }
  if (a.choice === 'powerAttack') state = patchX(state, { powerKind: a.powerAttack })
  state = setPm(state, cur, { combat: a.choice, initialAttacksLeft: left })
  return raiseChooseAttack(state, b, events)
}

// ---------- choosing attacks ----------
function attackGroups(b: B, w: Rec): string[] {
  if (NO_AT.has(w.id)) return []
  const groups: string[] = []
  for (const abId of (w.abilities ?? []) as Id[]) {
    const ab = rec(b, abId)
    if (ab.kind !== 'specialAttack' || ab.trigger === 'combat.choose' || NON_AT.has(abId)) continue
    const g = groupOf(abId)
    if (!groups.includes(g)) groups.push(g)
  }
  return groups.length > 1 || (groups.length === 1 && AT_SINGLE.has(w.id)) ? groups : []
}
const NON_AT = new Set<Id>(['cyg.a.powerful-attack', 'cyg.a.mage-storm'])
const NO_AT = new Set<Id>(['kha.w.jack-buster', 'kha.w.slug-cannon', 'kha.w.ripper-shield', 'kha.w.assault-cannon'])
const AT_SINGLE = new Set<Id>()
const groupOf = (abilityId: Id): string => abilityId.replace(/^.*\./, '').replace(/-(crit|large|small)$/, '')
const abilityGroup = groupOf

function canSee(state: GameState, b: B, attackerId: ModelId, target: ModelId, w: WeaponInst): boolean {
  const at = state.models[attackerId]!
  const spray = isSpray(w.w)
  const opts = { ignoreClouds: hasIgnore(state, b, attackerId, 'clouds'), ignoreModels: spray || hasIgnoreWeapon(w.w, b, 'interveningModels') || hasIgnore(state, b, attackerId, 'interveningModels') }
  void at
  return losReport(state, attackerId, target, opts).visible
}
function hasIgnoreWeapon(w: Rec, b: B, what: string): boolean {
  return ((w.abilities ?? []) as Id[]).some((a) => (rec(b, a).effect ?? []).some((n: Rec) => n.op === 'ignore' && n.ignore === what))
}

function candidateTargets(state: GameState, b: B, attackerId: ModelId, w: WeaponInst): ModelId[] {
  const at = state.models[attackerId]!
  const out: ModelId[] = []
  const engagers = engagedBy(state, attackerId, (x) => meleeReach(state, b, x))
  for (const t of enemiesOf(state, at.owner)) {
    if (isMelee(w.w)) {
      if (!within(at, t, w.w.rng ?? 1)) continue
    } else {
      const reach = isSpray(w.w) ? weaponRange(w.w) : weaponRange(w.w)
      if (modelDistance(at, t) > reach + 1e-6) continue
      if (engagers.length && !engagers.includes(t.id) && !hasFlag(state, b, attackerId, 'gunfighter')) continue
    }
    if (!canSee(state, b, attackerId, t.id, w)) continue
    out.push(t.id)
  }
  return out
}

/** R5.3: the charger's first melee attack goes at the charge target when it can reach it. */
function chargeLock(state: GameState, id: ModelId, w: WeaponInst): ModelId | null {
  const a = act(state)
  if (!isMelee(w.w) || !a.charge?.success || a.movedModelId !== id || a.perModel[id]!.meleeMade) return null
  const ct = state.models[a.charge.targetId]
  const m = state.models[id]!
  return ct && isOnTable(ct) && within(m, ct, w.w.rng ?? 1) ? a.charge.targetId : null
}

function attackOptionList(state: GameState, b: B, id: ModelId, did: string): DecisionOption[] {
  const m = state.models[id]!
  if (!alive(m) || kd(state, m) || stat(state, m)) return []
  const a = act(state)
  const pmx = a.perModel[id]!
  const out: DecisionOption[] = []
  const ws = weaponsOf(b, m)
  const seen = new Set<Id>()
  const star = a.x.star?.modelId === id ? a.x.star : undefined
  const initialLeft = Object.values(pmx.initialAttacksLeft).reduce((n, v) => n + v, 0)
  const mk = (w: WeaponInst, t: ModelId, additional: boolean, group?: string) => out.push({
    id: `atk:${w.weaponId}:${t}${additional ? ':add' : ''}${group ? ':' + group : ''}`, label: `${w.w.name} at ${t}${additional ? ' (additional)' : ''}`,
    action: { type: 'chooseAttack', decisionId: did, player: m.owner, modelId: id, weaponId: w.weaponId, targetId: t, additional, ...(group ? { attackType: group } : {}) } as Action,
    ...(additional ? { cost: { focus: 1 } } : {}),
  })
  for (const w of ws) {
    if (seen.has(w.weaponId)) continue
    seen.add(w.weaponId)
    if ((pmx.initialAttacksLeft[w.weaponId] ?? 0) <= 0) continue
    if (star && star.weaponId !== w.weaponId) continue
    const groups = attackGroups(b, w.w)
    const lock = chargeLock(state, id, w)
    for (const t of candidateTargets(state, b, id, w)) {
      if (lock && t !== lock) continue
      if (groups.length) for (const g of groups) mk(w, t, false, g)
      else mk(w, t, false)
    }
  }
  // additional attacks (R7.2): after the initial attacks, melee for 1 focus, Reload for ranged
  const mayAdd = initialLeft === 0 && !a.x.meleeOnly.includes('__none') && (pmx.combat !== 'forfeit') && canSpendFocus(state, id)
  if (mayAdd && !(pmx.combat === 'specialAttack' && false)) {
    const seenA = new Set<Id>()
    for (const w of ws) {
      if (seenA.has(w.weaponId)) continue
      seenA.add(w.weaponId)
      const reloadInf = ((w.w.abilities ?? []) as Id[]).includes('core.a.reload-inf')
      const reload1 = ((w.w.abilities ?? []) as Id[]).includes('core.a.reload-1')
      const used = a.limitsUsed.filter((x) => x === `reload:${w.weaponId}`).length
      if (isMelee(w.w)) {
        if (star && a.x.star && !isMelee(rec(b, a.x.star.weaponId))) { /* a star attack never grants more star attacks; melee additional still ok */ }
      } else if (!(reloadInf || (reload1 && used < 1)) || a.x.meleeOnly.includes(id) || pmx.powerAttackMade) continue
      const groups = attackGroups(b, w.w)
      for (const t of candidateTargets(state, b, id, w)) {
        if (groups.length) for (const g of groups) mk(w, t, true, g)
        else mk(w, t, true)
      }
    }
  }
  return out
}

function raiseChooseAttack(state0: GameState, b: B, events: GameEvent[]): Out {
  let state: GameState = { ...state0, window: 'combat.chooseAttack', attack: null }
  const a = act(state)
  const id = a.x.cur!
  const m = state.models[id]!
  const did = nextId(state)
  const pmx = a.perModel[id]!
  if (pmx.combat === 'powerAttack' && !pmx.powerAttackMade && a.x.powerKind) {
    const kind = a.x.powerKind
    const opts: DecisionOption[] = []
    if (kind === 'slam') {
      // R7.12: the slam attack goes at the declared target (focus was paid when the slam was declared)
      const t = a.x.slam ? state.models[a.x.slam.targetId] : undefined
      if (t && alive(t) && within(m, t, slamRange(m)) && losReport(state, id, t.id).visible) {
        opts.push({ id: `pa:slam:${t.id}`, label: `Slam ${t.id}`, action: { type: 'powerAttack', decisionId: did, player: m.owner, modelId: id, kind, targetId: t.id } as Action })
      }
    } else {
      for (const t of enemiesOf(state, m.owner)) {
        const wpn = weaponsOf(b, m).find((w) => isMelee(w.w) && (kind !== 'throw' || ((w.w.qualities ?? []) as Id[]).includes('core.q.throw')))
        if (!wpn) continue
        const rng = kind === 'headbutt' ? (m.base === 120 ? 2 : 1) : (wpn.w.rng ?? 1)
        if (!within(m, t, rng) || !losReport(state, id, t.id).visible) continue
        if (t.base > m.base) continue
        opts.push({ id: `pa:${kind}:${t.id}`, label: `${kind} ${t.id}`, action: { type: 'powerAttack', decisionId: did, player: m.owner, modelId: id, kind, targetId: t.id, weaponId: wpn.weaponId } as Action, ...(m.type === 'warEngine' ? { cost: { focus: 1 } } : {}) })
      }
    }
    // a slam that reached its target must be made (neither part of it may be forfeited); otherwise the attacks may end
    if (kind !== 'slam' || !opts.length) opts.push({ id: 'endAttacks', label: 'End attacks', action: { type: 'endAttacks', decisionId: did, player: m.owner, modelId: id } as Action })
    const r = raise(state, { player: m.owner, kind: 'chooseAttack', window: 'combat.chooseAttack', context: { modelId: id }, options: opts, canPass: false })
    return ok(r.state, events)
  }
  const options = attackOptionList(state, b, id, did)
  const any = anytimeOptions(state, b, id, did)
  if (!options.length && !any.length) {
    // forced single option: end the attacks (00 section 2 rule 2)
    events.push({ type: 'DecisionAutoResolved', kind: 'chooseAttack', optionId: 'endAttacks' })
    return endAttacksFor(state, b, id, events)
  }
  options.push({ id: 'endAttacks', label: 'End attacks', action: { type: 'endAttacks', decisionId: did, player: m.owner, modelId: id } as Action })
  options.push(...any)
  const r = raise(state, { player: m.owner, kind: 'chooseAttack', window: 'combat.chooseAttack', context: { modelId: id }, options, canPass: false })
  state = r.state
  return ok(state, events)
}

function endAttacksFor(state0: GameState, b: B, id: ModelId, events: GameEvent[]): Out {
  let state = state0
  void id
  state = patchX(state, { cur: null })
  return nextCombat(state, b, events)
}

function chooseAttackAnswer(state0: GameState, b: B, a: ChooseAttackAction): Result {
  let state = state0
  const ac = act(state)
  const cur = ac.x.cur
  if (!cur || a.modelId !== cur) return reject('E_TARGET_INVALID', `${cur} is the model attacking`)
  const m = state.models[cur]!
  const pmx = ac.perModel[cur]!
  const ws = weaponsOf(b, m)
  const inst = ws.find((w) => w.weaponId === a.weaponId && !weaponCrippled(m, w.loc)) ?? ws.find((w) => w.weaponId === a.weaponId)
  if (!inst) return reject('E_NOT_AN_OPTION', 'the model has no such weapon')
  const left = pmx.initialAttacksLeft[a.weaponId]
  const melee = isMelee(inst.w)
  const initialLeftTotal = Object.values(pmx.initialAttacksLeft).reduce((n, v) => n + v, 0)
  if (pmx.combat === 'forfeit' || pmx.combat === null) return reject('E_NOT_AN_OPTION', 'no attacks this Combat Action')
  if (pmx.powerAttackMade && !melee) return reject('E_POWER_ATTACK', 'no ranged attacks after a power attack')
  if (ac.x.meleeOnly.includes(cur) && !melee) return reject('E_NOT_AN_OPTION', 'after a charge only melee attacks are allowed')
  if (a.additional) {
    // initial attacks need not all be made (QS p47: Vilkul skips her knife); buying an additional attack gives up the rest
    if (initialLeftTotal > 0 && pmx.attacksMade === 0) return reject('E_NOT_AN_OPTION', 'additional attacks come after the initial attacks')
    if (!melee) {
      const reloadInf = ((inst.w.abilities ?? []) as Id[]).includes('core.a.reload-inf')
      const reload1 = ((inst.w.abilities ?? []) as Id[]).includes('core.a.reload-1')
      const used = ac.limitsUsed.filter((x) => x === `reload:${a.weaponId}`).length
      if (!(reloadInf || (reload1 && used < 1))) return reject('E_ALREADY_USED', 'no Reload left for that weapon')
    }
    if (m.focus < 1) return reject('E_INSUFFICIENT_FOCUS', 'an additional attack costs 1 focus')
    if (!canSpendFocus(state, cur)) return reject('E_CRIPPLED', 'this model cannot spend focus')
  } else {
    if (left === undefined && pmx.combat !== 'dual') return reject(melee === (pmx.combat === 'ranged') ? 'E_NO_DUAL_ATTACK' : 'E_NOT_AN_OPTION', 'that weapon is not part of the chosen Combat Action')
    if (!left || left <= 0) return reject('E_NOT_AN_OPTION', 'no initial attacks left with that weapon')
  }
  const star = ac.x.star?.modelId === cur ? ac.x.star : undefined
  if (star && !a.additional && star.weaponId !== a.weaponId) return reject('E_NOT_AN_OPTION', 'a star attack uses its own weapon')
  if (star && !a.additional && ((rec(b, star.abilityId).effect ?? []) as Rec[]).some((n) => n.op === 'cloud')) return flareAnswer(state, b, a, star.abilityId, inst)
  // the first melee attack after a charge targets the charge target when it can (R5.3)
  let chargeAttack = false
  const lock = chargeLock(state, cur, inst)
  if (lock && a.targetId !== lock) return reject('E_TARGET_INVALID', 'the first attack after a charge must target the charge target')
  if (isChargeAttack(state, b, cur, a.weaponId, a.targetId)) chargeAttack = true
  const dec = declareAttack(state, b, {
    attackerId: cur, targetId: a.targetId, weaponId: a.weaponId, additional: a.additional, attackType: a.attackType, star: star?.abilityId,
    noFocus: false, chargeAttack, basic: !star,
  })
  if ('rejection' in dec) return dec
  state = dec.state
  const events = [...dec.events]
  if (a.additional) {
    const f = spendFocus(state, cur, 1, 'additionalAttack')
    if (isRejection(f)) return reject(f.rejection.code, f.rejection.message)
    state = f.state; events.push(...f.events)
    if (!melee) state = { ...state, activation: { ...act(state), limitsUsed: [...act(state).limitsUsed, `reload:${a.weaponId}`] } as typeof state.activation }
    const zeroed = Object.fromEntries(Object.keys(pmx.initialAttacksLeft).map((k) => [k, 0]))
    state = setPm(state, cur, { additionalAttacks: act(state).perModel[cur]!.additionalAttacks + 1, initialAttacksLeft: zeroed })
  } else {
    state = setPm(state, cur, { initialAttacksLeft: { ...pmx.initialAttacksLeft, [a.weaponId]: (left ?? 1) - 1 } })
  }
  const p2 = act(state).perModel[cur]!
  state = setPm(state, cur, { attacksMade: p2.attacksMade + 1, ...(melee ? { meleeMade: true } : { rangedMade: true }), ...(chargeAttack ? { chargeAttackUsed: true } : {}) })
  return drive(state, b, events)
}

function powerAttackAnswer(state0: GameState, b: B, a: import('../actions').PowerAttackAction): Result {
  let state = state0
  const ac = act(state)
  const cur = ac.x.cur
  if (!cur || a.modelId !== cur) return reject('E_TARGET_INVALID', `${cur} is the model attacking`)
  const m = state.models[cur]!
  const pmx = ac.perModel[cur]!
  if (pmx.combat !== 'powerAttack' || pmx.powerAttackMade || ac.x.powerKind !== a.kind) return reject('E_POWER_ATTACK', 'no power attack available')
  const t = state.models[a.targetId]
  if (!t || !isOnTable(t) || t.owner === m.owner) return reject('E_TARGET_INVALID', 'power attacks target enemies')
  if (!losReport(state, cur, a.targetId).visible) return reject('E_NO_LOS', 'no line of sight')
  if (a.kind === 'trample') return reject('E_POWER_ATTACK', 'a trample attacks as part of its move')
  const slam = a.kind === 'slam' ? ac.x.slam : undefined
  if (a.kind === 'slam' && (!slam || slam.targetId !== a.targetId)) return reject('E_TARGET_INVALID', 'the slam attack goes at the declared slam target')
  const wpn = weaponsOf(b, m).find((w) => w.weaponId === a.weaponId && isMelee(w.w)) ?? weaponsOf(b, m).find((w) => isMelee(w.w))
  if (a.kind === 'throw' && !wpn) return reject('E_POWER_ATTACK', 'no melee weapon')
  if (a.kind === 'throw' && !((wpn!.w.qualities ?? []) as Id[]).includes('core.q.throw')) return reject('E_POWER_ATTACK', 'that weapon cannot throw')
  if (a.kind === 'throw' && weaponCrippled(m, wpn!.loc)) return reject('E_CRIPPLED', 'the throwing weapon is crippled')
  const rng = a.kind === 'headbutt' || a.kind === 'slam' ? slamRange(m) : (wpn!.w.rng ?? 1)
  const df = defFor(state, b, null, m, t, 'melee', { ignoreTIM: false })
  const attackId = `a:${state.attackSeq + 1}`
  const r = resolvePowerAttack(state, {
    kind: a.kind, attackerId: cur, targetId: a.targetId, mat: statOf(state, b, cur, 'MAT'), def: df.def, autoHit: df.autoHit, look: lookups(state, b),
    // a slam's focus was paid when it was declared at the start of Normal Movement
    warEngine: m.type === 'warEngine' && a.kind !== 'slam', range: rng, attackId, movedDistance: slam?.moved,
  })
  if (!r.ok) return reject((r.code ?? 'E_POWER_ATTACK') as Rejection['code'], r.message ?? 'power attack failed')
  state = { ...r.state, attackSeq: state.attackSeq + 1 }
  const events = [...r.events]
  state = noteDamage(state, events)
  state = setPm(state, cur, { powerAttackMade: true })
  state = sweepDead(state)
  const killedAny = events.some((e) => e.type === 'ModelRemoved')
  if (killedAny) state = patchX(state, { killedAny: true })
  const end = afterDeaths(state, b)
  state = end.state; events.push(...end.events)
  if (end.ended || state.phase === 'ended') return { state, events, pending: state.pending }
  return raiseChooseAttack(state, b, events)
}

function sweepDead(state: GameState): GameState {
  let s = state
  for (const u of Object.values(state.units)) {
    const keep = u.troopers.filter((id) => state.models[id] && state.models[id]!.life !== 'destroyed' && !(state.models[id]!.life === 'boxed'))
    if (keep.length !== u.troopers.length) s = { ...s, units: { ...s.units, [u.id]: { ...u, troopers: keep } } }
  }
  return s
}

function endOfCombat(state0: GameState, b: B, events: GameEvent[]): Out {
  let state = patchX(state0, { stage: 'endMove', cur: null })
  state = { ...state, window: 'activation.end', attack: null }
  const a = act(state)
  const entries: string[] = []
  for (const id of a.modelIds) {
    if (!alive(state.models[id]) || kd(state, state.models[id]!) || stat(state, state.models[id]!)) continue
    for (const abId of abilitiesOf(state, b, id)) {
      const ab = rec(b, abId)
      if (ab.trigger !== 'activation.end') continue
      entries.push(`${id}|${abId}`)
    }
  }
  state = patchX(state, { endMoves: entries })
  return nextEndMove(state, b, events)
}

function nextEndMove(state0: GameState, b: B, events: GameEvent[]): Out {
  let state = state0
  const a0 = act(state)
  const queue = [...a0.x.endMoves]
  while (queue.length) {
    const entry = queue.shift()!
    const [id, abId] = entry.split('|') as [ModelId, Id]
    const a = act(state)
    if (a.x.endMoved.includes(id) || !alive(state.models[id])) continue
    const ab = rec(b, abId)
    let req: { dist: number; mode: 'advance' | 'place'; abilityId: Id; toward?: ModelId } | null = null
    for (const n of (ab.effect ?? []) as Rec[]) {
      if (n.op === 'advance' && typeof n.dist === 'number') req = { dist: n.dist, mode: 'advance', abilityId: abId }
      if (n.code) {
        const r = runCodeEffect(state, b, n.code, { point: 'activation.end', selfId: id, activePlayer: state.activePlayer })
        const mr = actOf(r.state)?.x.moveReq
        if (mr) { req = { dist: mr.dist, mode: mr.mode, abilityId: abId }; state = patchX(r.state, { moveReq: undefined }) }
      }
    }
    if (!req) continue
    state = patchX(state, { endMoves: queue })
    return raiseTriggerMove(state, b, events, { ctx: 'end', modelId: id, dist: req.dist, mode: req.mode, abilityId: abId, ownerOnly: true })
  }
  state = patchX(state, { endMoves: [] })
  return finishActivation(state, b, events, 'normal')
}

// ---------- triggered movement (Reposition, Evasive, Run & Gun, Banish, Gatecrasher) ----------
interface TriggerMoveSpec { ctx: 'end' | 'attack'; modelId: ModelId; dist: number; mode: 'advance' | 'place'; abilityId: Id; ownerOnly?: boolean; endsActivation?: boolean; player?: PlayerId; optional?: boolean }

function raiseTriggerMove(state0: GameState, b: B, events: GameEvent[], t: TriggerMoveSpec): Out {
  const state = state0
  const m = state.models[t.modelId]!
  const player = t.player ?? m.owner
  const did = nextId(state)
  const samples = [m.pos, ...triggerSamples(state, b, t)]
  const options: DecisionOption[] = samples.map((p, i) => ({ id: `tm${i}`, label: `Move to ${p.x.toFixed(1)},${p.z.toFixed(1)}`, action: { type: 'moveModel', decisionId: did, player, modelId: t.modelId, path: [p] } as Action }))
  const r = raise({ ...state, window: t.ctx === 'end' ? 'activation.end' : 'attack.resolved' }, {
    player, kind: 'moveModel', window: t.ctx === 'end' ? 'activation.end' : 'attack.resolved',
    context: { modelId: t.modelId, data: { trigger: t } }, constraints: { modelId: t.modelId, from: m.pos, maxDist: t.dist }, options, canPass: true,
  })
  return ok(r.state, events)
}

function triggerSamples(state: GameState, b: B, t: TriggerMoveSpec): Vec2[] {
  const m = state.models[t.modelId]!
  const out: Vec2[] = []
  const foe = enemiesOf(state, m.owner).sort((x, y) => dist(x.pos, m.pos) - dist(y.pos, m.pos))[0]
  const dirs: number[] = foe ? [angleOf(sub(foe.pos, m.pos)), angleOf(sub(m.pos, foe.pos))] : []
  for (let i = 0; i < 8; i++) dirs.push((i * Math.PI) / 4)
  for (const ang of dirs) {
    for (const f of [1, 0.5]) {
      const p = { x: m.pos.x + Math.cos(ang) * t.dist * f, z: m.pos.z + Math.sin(ang) * t.dist * f }
      if (checkTriggerMove(state, b, t, m.id, [p]).ok) out.push(p)
      if (out.length >= 8) return out
    }
  }
  return out
}

function checkTriggerMove(state: GameState, b: B, t: TriggerMoveSpec, id: ModelId, path: Vec2[]): { ok: true; end: Vec2 } | { ok: false; code: Rejection['code']; message: string } {
  const m = state.models[id]!
  const end = path[path.length - 1] ?? m.pos
  if (t.mode === 'place') {
    if (dist(m.pos, end) > t.dist + 1e-6) return { ok: false, code: 'E_TOO_FAR', message: `place within ${t.dist}"` }
    const c = isLegalPlacement(state, id, end, m.base)
    return c.ok ? { ok: true, end } : { ok: false, code: c.code ?? 'E_PLACEMENT', message: c.message ?? 'illegal placement' }
  }
  const chk = validateAdvancePath(state, id, path, t.dist, { pathfinder: moverInfo(state, b, id).pathfinder })
  return chk.ok ? { ok: true, end } : { ok: false, code: chk.code ?? 'E_PATH_BLOCKED', message: chk.message ?? 'blocked' }
}

function triggerMoveAnswer(state0: GameState, b: B, a: MoveModelAction): Result {
  let state = state0
  const t = state.pending.context.data!.trigger as TriggerMoveSpec
  if (a.modelId !== t.modelId) return reject('E_TARGET_INVALID', `${t.modelId} is the model that moves`)
  const path = a.path.length ? a.path : [state.models[t.modelId]!.pos]
  const zeroMove = path.every((p) => dist(p, state.models[t.modelId]!.pos) < 1e-9)
  const chk = zeroMove ? { ok: true as const, end: state.models[t.modelId]!.pos } : checkTriggerMove(state, b, t, t.modelId, path)
  if (!chk.ok) return reject(chk.code, chk.message)
  const m = state.models[t.modelId]!
  const events: GameEvent[] = []
  if (dist(m.pos, chk.end) > 1e-9) {
    state = relocate(state, t.modelId, chk.end)
    events.push({ type: 'ModelMoved', modelId: t.modelId, kind: t.mode === 'place' ? 'place' : t.ctx === 'end' ? (t.abilityId.includes('reposition') ? 'reposition' : 'advance') : 'advance', from: m.pos, to: chk.end, path, distance: dist(m.pos, chk.end), elevAfter: state.models[t.modelId]!.elev })
  }
  return afterTriggerMove(state, b, events, t, true)
}

function afterTriggerMove(state0: GameState, b: B, events: GameEvent[], t: TriggerMoveSpec, moved: boolean): Out {
  let state = state0
  if (t.ctx === 'end') {
    if (moved) state = patchX(state, { endMoved: [...act(state).x.endMoved, t.modelId] })
    return nextEndMove(state, b, events)
  }
  // inside an attack: carry on with the trigger list
  state = patchAtk(state, { stage: 'trigWait', moveReq: undefined })
  if (moved && t.endsActivation && actOf(state)) {
    state = patchX(state, { queue: [], cur: null, forfeit: act(state).modelIds })
    state = patchAtk(state, { flags: { ...atkOf(state)!.x.flags, endActivation: true } })
  }
  return drive(state, b, events)
}

// ---------- DEF / stealth ----------
function stealthy(state: GameState, b: B, id: ModelId): boolean { return abilitiesOf(state, b, id).includes('core.a.stealth') }
const flareOver = (state: GameState, m: ModelState): boolean => state.clouds.some((c) => c.kind === 'flare' && dist(c.pos, m.pos) < c.diameter / 2 + baseRadius(m.base))
function pallPenalty(state: GameState, b: B, m: ModelState): boolean {
  if (isConstruct(state, b, m.id) || ignoresGas(state, b, m.id)) return false
  return cloudsOver(state, m).some((c) => {
    const e = c.effectId ? state.effects.find((x) => x.id === c.effectId) : undefined
    return !!e && e.sourceId === 'kha.f.pall-of-ashes' && e.owner !== m.owner
  })
}

interface DefInfo { def: number; mods: Mod[]; autoHit: boolean; concealment: boolean }
function defFor(
  state: GameState, b: B, atk: AtkCtx | null, attacker: ModelState, target: ModelState, kind: 'melee' | 'ranged' | 'arcane' | 'spray',
  o: { ignoreTIM: boolean | 'attacker'; blessed?: boolean } = { ignoreTIM: false },
): DefInfo {
  const downed = kd(state, target) || stat(state, target)
  const rawBase = statOf(state, b, target.id, 'DEF', { skipSpells: o.blessed, atk: { kind: atk?.kind ?? kind } })
  const base = (target.crippled.includes('M') || target.inert) ? Math.min(rawBase, 5) : rawBase
  const r = defModifiers(state, target.id, {
    kind, baseDef: base, originId: atk?.originId ?? attacker.id, melee: { reach: (m) => meleeReach(state, b, m.id) },
    ignoreTargetInMelee: o.ignoreTIM, ignoreCloudConcealment: hasIgnore(state, b, attacker.id, 'clouds'), ignoreAllConcealment: hasIgnore(state, b, attacker.id, 'concealment'),
  })
  let def = r.def
  if (downed) def += statOf(state, b, target.id, 'DEF', { baseOverride: 5, skipSpells: o.blessed, atk: { kind: atk?.kind ?? kind } }) - 5
  const mods = [...r.mods]
  if (pallPenalty(state, b, target)) { def -= 2; mods.push({ source: 'cyg.f.pall', label: 'In a cloud: -2 DEF', value: -2, mode: 'add' }) }
  return { def, mods, autoHit: r.autoHitMelee, concealment: r.concealment }
}

const attackStatName = (kind: AttackContext['kind']): 'MAT' | 'RAT' | 'AAT' => (kind === 'melee' || kind === 'power' ? 'MAT' : kind === 'arcane' ? 'AAT' : 'RAT')

/** attack-roll modifiers that depend on the attacker and the model it rolls against */
function atkModsFor(state: GameState, b: B, atk: AtkCtx, targetId: ModelId): Mod[] {
  const at = state.models[atk.attackerId]!
  const mods: Mod[] = [...atk.x.atkMods]
  if (atk.kind !== 'melee') {
    const a = actOf(state)
    if (a?.aimed && a.modelIds.includes(at.id) && !engagedBy(state, at.id, (x) => meleeReach(state, b, x)).length && atk.kind !== 'arcane') mods.push({ source: 'aim', label: 'Aim', value: 2, mode: 'add' })
  }
  for (const p of appliedPassives(state, b, at.id, { attackerId: at.id, targetId })) {
    for (const n of (p.ability.effect ?? []) as Rec[]) if (n.op === 'modRoll' && (n.roll === 'attack' || n.roll === 'any')) mods.push({ source: p.ability.id, label: p.ability.name, value: n.value, mode: 'add' })
  }
  if (!isConstruct(state, b, at.id) && !ignoresGas(state, b, at.id) && cloudsOver(state, at).some((c) => {
    const e = c.effectId ? state.effects.find((x) => x.id === c.effectId) : undefined
    return !!e && e.sourceId === 'kha.f.pall-of-ashes' && e.owner !== at.owner
  })) mods.push({ source: 'kha.f.pall-of-ashes', label: 'Attacking from a cloud: -2', value: -2, mode: 'add' })
  return mods
}

// ---------- declare ----------
interface DeclParams {
  attackerId: ModelId; targetId: ModelId; weaponId?: Id; spellId?: Id; additional: boolean; attackType?: string; star?: Id
  noFocus: boolean; chargeAttack: boolean; generatedBy?: string; basic?: boolean; parent?: AtkCtx; forceKind?: AttackContext['kind']
}
type DeclOut = { state: GameState; events: GameEvent[] } | { rejection: Rejection }

function specIds(state: GameState, b: B, attackerId: ModelId, w: Rec, groups: string[], chosen: string | undefined, star: Id | undefined): Id[] {
  const out: Id[] = []
  for (const abId of abilitiesOf(state, b, attackerId)) {
    const ab = rec(b, abId)
    if (ATK_POINTS.has(ab.trigger) && ab.kind !== 'passive') out.push(abId)
  }
  for (const q of (w.qualities ?? []) as Id[]) out.push(q)
  for (const abId of (w.abilities ?? []) as Id[]) {
    const ab = rec(b, abId)
    if (ab.kind === 'specialAttack' && ab.trigger !== 'combat.choose' && !NON_AT.has(abId)) {
      if (!groups.length || groupOf(abId) === chosen) out.push(abId)
    } else out.push(abId)
  }
  if (star) out.push(star)
  return out
}

export function declareAttack(state0: GameState, b: B, p: DeclParams): DeclOut {
  let state = state0
  const at = state.models[p.attackerId]
  const tg = state.models[p.targetId]
  if (!at || !alive(at)) return { rejection: { code: 'E_TARGET_INVALID', message: 'the attacker is not on the table' } }
  if (kd(state, at)) return { rejection: { code: 'E_KNOCKED_DOWN', message: 'knocked-down models cannot attack' } }
  if (stat(state, at)) return { rejection: { code: 'E_STATIONARY', message: 'stationary models cannot attack' } }
  if (at.inert) return { rejection: { code: 'E_TARGET_INVALID', message: 'inert models cannot attack' } }
  if (!tg || !alive(tg) || tg.owner === at.owner) return { rejection: { code: 'E_TARGET_INVALID', message: 'attack an enemy model on the table' } }
  let inst: WeaponInst | undefined
  let w: Rec
  let kind: AttackContext['kind']
  const spell = p.spellId ? rec(b, p.spellId) : undefined
  if (spell) { w = spell; kind = 'arcane' } else {
    const ws = weaponsOf(b, at)
    inst = ws.find((x) => x.weaponId === p.weaponId && !weaponCrippled(at, x.loc)) ?? ws.find((x) => x.weaponId === p.weaponId)
    if (!inst) return { rejection: { code: 'E_NOT_AN_OPTION', message: 'no such weapon' } }
    w = inst.w
    kind = p.forceKind ?? (isMelee(w) ? 'melee' : isSpray(w) ? 'spray' : (w.aoe ?? 0) > 0 ? 'aoe' : 'ranged')
  }
  const origin = (actOf(state)?.x.channelVia && spell) ? actOf(state)!.x.channelVia! : at.id
  const originM = state.models[origin]!
  const witch = !!spell && state.effects.some((e) => e.sourceId === 'cyg.a.witch-mark' && e.targetIds.includes(tg.id) && e.casterId === at.id)
  const groups = spell ? [] : attackGroups(b, w)
  if (p.attackType && groups.length && !groups.includes(p.attackType)) return { rejection: { code: 'E_NOT_AN_OPTION', message: `unknown attack type ${p.attackType}` } }
  const chosen = groups.length ? (p.attackType ?? groups[0]) : undefined
  // legality: LOS and melee range at declaration (R7.3), engagement limits for ranged attacks (R7.7)
  if (kind === 'melee') {
    if (!within(at, tg, w.rng ?? 1)) return { rejection: { code: 'E_OUT_OF_RANGE', message: `melee range is ${w.rng ?? 1}"` } }
    if (!losReport(state, at.id, tg.id).visible) return { rejection: { code: 'E_NO_LOS', message: 'no line of sight' } }
  } else if (!witch) {
    const vis = losReport(state, origin, tg.id, {
      ignoreClouds: hasIgnore(state, b, at.id, 'clouds'),
      ignoreModels: kind === 'spray' || hasIgnore(state, b, at.id, 'interveningModels') || (!!inst && hasIgnoreWeapon(inst.w, b, 'interveningModels')),
    })
    if (!vis.visible) return { rejection: { code: 'E_NO_LOS', message: vis.why } }
    if (kind !== 'arcane') {
      const engagers = engagedBy(state, at.id, (x) => meleeReach(state, b, x))
      if (engagers.length && !engagers.includes(tg.id) && !hasFlag(state, b, at.id, 'gunfighter')) return { rejection: { code: 'E_ENGAGED', message: 'an engaged model may shoot only the models engaging it' } }
    }
  }
  const star = p.star
  let starFlat = 0
  if (star) for (const n of (rec(b, star).effect ?? []) as Rec[]) if (n.op === 'modRoll' && n.roll === 'damage') starFlat += n.value ?? 0
  const specs = specIds(state, b, at.id, w, groups, chosen, star)
  const attackId = `a:${state.attackSeq + 1}`
  const a0 = actOf(state)
  const x: AtkX = {
    stage: 'start', weaponId: spell ? spell.id : p.weaponId, wloc: inst?.loc, group: chosen, specs, rollTargets: [tg.id], results: {}, boosted: false, powerful: false,
    noFocus: p.noFocus, atkAdd: 0, jobs: [], jobIdx: 0, aoe: (w.aoe ?? 0) > 0 ? w.aoe : undefined, blastPow: w.blastPow, star, starFlat, blessed: false, denyTough: false, rfp: false,
    needColumn: false, destroyed: [], hitModels: [], trig: [], trigIdx: 0, atkMods: [], dmgMods: {}, parent: p.parent, flags: {}, chargeAttack: p.chargeAttack,
    basicRanged: !!p.basic && kind === 'ranged',
  }
  const outOfAct = !a0 || !a0.modelIds.includes(at.id) || !!p.generatedBy
  const ctx: AtkCtx = {
    attackId, attackerId: at.id, weaponId: spell ? undefined : p.weaponId, spellId: p.spellId, originId: origin, targetId: tg.id, kind, additional: p.additional,
    chargeAttack: p.chargeAttack, dice: 2, mods: [], hitTarget: 0, pHit: 0, pHitBoosted: 0, boosted: false, powDirect: w.pow ?? 0, powBlast: w.blastPow,
    losVerdict: { visible: true, reasons: ['clear'], blockers: [], inRange: true, distance: modelDistance(originM, tg) }, damageQueue: [], step: 'attack.declared',
    generatedBy: p.generatedBy, outOfActivation: outOfAct, x,
  }
  state = { ...state, attackSeq: state.attackSeq + 1, attack: ctx as AttackContext, window: 'attack.declared' }
  const events: GameEvent[] = [{ type: 'AttackDeclared', attackId, attackerId: at.id, originId: origin, weaponId: p.weaponId, spellId: p.spellId, targetId: tg.id, kind, additional: p.additional }]
  const decl = runSpecs(state, b, 'attack.declared')
  state = decl.state; events.push(...decl.events)
  const m = measure(state, b)
  return { state: m.state, events: [...events, ...m.events] }
}

// ---------- measure (A1 steps 2-5) ----------
function measure(state0: GameState, b: B): { state: GameState; events: GameEvent[] } {
  let state = state0
  const atk = atkOf(state)!
  const at = state.models[atk.attackerId]!
  const origin = state.models[atk.originId]!
  const tg = state.models[atk.targetId]!
  const spell = atk.spellId ? rec(b, atk.spellId) : undefined
  const w = spell ?? rec(b, atk.weaponId!)
  const inst = spell ? undefined : weaponsOf(b, at).find((x) => x.weaponId === atk.weaponId && x.loc === atk.x.wloc) ?? weaponsOf(b, at).find((x) => x.weaponId === atk.weaponId)
  const witch = !!spell && state.effects.some((e) => e.sourceId === 'cyg.a.witch-mark' && e.targetIds.includes(tg.id) && e.casterId === at.id)
  const dst = modelDistance(origin, tg)
  const range = atk.kind === 'melee' || atk.kind === 'power' ? (w.rng ?? 1) : weaponRange(w)
  const outOfRange = !witch && atk.kind !== 'melee' && atk.kind !== 'spray' && dst > range + 1e-6
  let autoMiss = outOfRange
  const sneaky = (atk.kind === 'ranged' || atk.kind === 'aoe' || atk.kind === 'arcane') && stealthy(state, b, tg.id) && !hasIgnore(state, b, at.id, 'stealth') && !flareOver(state, tg) && dst > 5 + 1e-6 && !witch
  if (sneaky) autoMiss = true
  const pistol = !!inst && ((inst.w.qualities ?? []) as Id[]).includes('core.q.pistol')
  const ignoreTIM = atk.x.specs.some((id) => (rec(b, id).effect ?? []).some((n: Rec) => n.op === 'ignore' && n.ignore === 'targetInMelee')) || hasIgnore(state, b, at.id, 'targetInMelee')
    ? true : pistol ? ('attacker' as const) : false
  const dk = atk.kind === 'melee' || atk.kind === 'power' ? 'melee' : atk.kind === 'arcane' ? 'arcane' : atk.kind === 'spray' ? 'spray' : 'ranged'
  const df = defFor(state, b, atk, at, tg, dk, { ignoreTIM, blessed: atk.x.blessed })
  const autoHit = witch || df.autoHit
  // dice: base 2, a crippled weapon location removes one (R3.6)
  let added = atk.x.atkAdd
  const removed = inst && weaponCrippled(at, inst.loc) ? 1 : 0
  // attack-roll modifiers from abilities at attack.beforeRoll
  state = setAtk(state, { ...atk, x: { ...atk.x, atkMods: [], atkAdd: 0 } })
  const pre = runSpecs(state, b, 'attack.beforeRoll')
  state = pre.state
  const a2 = atkOf(state)!
  added = a2.x.atkAdd
  const mods = atkModsFor(state, b, a2, tg.id)
  const dice = diceCount({ base: 2, added, removed })
  const statv = statOf(state, b, at.id, attackStatName(atk.kind), { atk: { kind: atk.kind } })
  const [p0, p1] = hitProbabilityBoost({ stat: statv, mods, dice: { base: 2, added, removed }, target: df.def, autoHit, autoMiss })
  // spray: the rolling models are every model the line crosses
  let rollTargets = [tg.id]
  if (atk.kind === 'spray') rollTargets = sprayTargets(state, b, a2, w)
  const next: AtkCtx = {
    ...a2, dice, mods, hitTarget: df.def, pHit: p0.pHit, pHitBoosted: p1.pHit, autoHit, autoMiss,
    losVerdict: { visible: true, reasons: ['clear'], blockers: [], inRange: !outOfRange, distance: dst }, step: 'attack.beforeRoll',
    x: { ...a2.x, rollTargets, flags: { ...a2.x.flags, outOfRange, stealthMiss: sneaky } },
  }
  state = setAtk(state, next)
  return { state, events: [...pre.events, { type: 'AttackMeasured', attackId: atk.attackId, los: next.losVerdict, hitTarget: df.def, mods, dice, autoHit: !!autoHit, autoMiss, pHit: p0.pHit, pHitBoosted: p1.pHit }] }
}

/** R7.15: a line `X"` long from the attacker's edge through the target's centre; every model it crosses (not fully behind terrain) rolls. */
function sprayTargets(state: GameState, b: B, atk: AtkCtx, w: Rec): ModelId[] {
  const at = state.models[atk.attackerId]!
  const tg = state.models[atk.targetId]!
  const len = weaponRange(w)
  const dir = norm(sub(tg.pos, at.pos))
  const start = { x: at.pos.x + dir.x * baseRadius(at.base), z: at.pos.z + dir.z * baseRadius(at.base) }
  const end = { x: start.x + dir.x * len, z: start.z + dir.z * len }
  const out: ModelId[] = []
  for (const m of Object.values(state.models)) {
    if (m.id === at.id || !isOnTable(m)) continue
    const sp = segPointDist(start, end, m.pos)
    if (sp.d > baseRadius(m.base) + 1e-9) continue
    if (m.id !== tg.id && !losReport(state, at.id, m.id, { ignoreClouds: true, ignoreModels: true }).visible) continue
    out.push(m.id)
  }
  if (!out.includes(tg.id) && dist(at.pos, tg.pos) - baseRadius(at.base) - baseRadius(tg.base) <= len) out.push(tg.id)
  return out.sort((x, y) => dist(at.pos, state.models[x]!.pos) - dist(at.pos, state.models[y]!.pos))
}

// ---------- the ability runner (descriptor ops + code hooks) ----------
const DIRECT_ONLY = new Set<Id>(['core.a.brutal-damage'])

function d3or(state: GameState, v: number | string | undefined, ownerId: ModelId): { state: GameState; events: GameEvent[]; n: number } {
  if (typeof v === 'number') return { state, events: [], n: v }
  if (v === 'd3') { const r = rollD3(state); return { state: r.state, events: [r.event], n: r.value } }
  if (v === 'd6') { const r = rollNd6(state, 1, 'd3', { ownerId }); return { state: r.state, events: [r.event], n: r.dice[0]! } }
  return { state, events: [], n: 0 }
}

function actInfo(state: GameState): CondEnv['act'] {
  const a = actOf(state)
  return a ? { killedAny: a.x.killedAny, killedByRanged: a.x.killedByRanged, ran: a.ran } : null
}

function runAbility(state0: GameState, b: B, abId: Id, ownerId: ModelId, targetId: ModelId | undefined, job?: DmgJob): { state: GameState; events: GameEvent[] } {
  let state = state0
  const ab = rec(b, abId)
  const atk = atkOf(state)
  if (job && job.kind !== 'direct' && DIRECT_ONLY.has(abId)) return { state, events: [] }
  const env: CondEnv = { selfId: ownerId, attackerId: atk?.attackerId, targetId, atk, job, act: actInfo(state) }
  if (!evalCond(state, b, ab.when, env)) return { state, events: [] }
  const events: GameEvent[] = []
  const subjectId = ab.scope?.who === 'target' ? targetId : ownerId
  const owner = state.models[ownerId]?.owner ?? state.activePlayer
  const look = lookups(state, b)
  for (const n of (ab.effect ?? []) as Rec[]) {
    if (n.code) {
      const res = runCodeEffect(state, b, n.code, { point: ab.trigger, selfId: ownerId, activePlayer: state.activePlayer, targetId, attackId: atk?.attackId, weaponId: atk?.weaponId }, n.params ?? {})
      state = res.state; events.push(...res.events)
      const a2 = atkOf(state)
      if (a2?.x.flags.skipRest) { state = setAtk(state, { ...a2, x: { ...a2.x, flags: { ...a2.x.flags, skipRest: false } } }); break }
      continue
    }
    const subj = subjectId ? state.models[subjectId] : undefined
    const a = atkOf(state)
    switch (n.op) {
      case 'addDie':
        if (n.roll === 'attack' && a) state = patchAtk(state, { atkAdd: a.x.atkAdd + 1 })
        else if (a?.x.cur) state = patchAtk(state, { cur: { ...a.x.cur, addDice: a.x.cur.addDice + 1 } })
        break
      case 'modRoll':
        if (!a) break
        if (a.x.cur && (n.roll === 'damage' || n.roll === 'any')) state = patchAtk(state, { cur: { ...a.x.cur, flat: a.x.cur.flat + (n.value ?? 0) } })
        else if (n.roll === 'attack' || (n.roll === 'any' && !a.x.cur)) state = patchAtk(state, { atkMods: [...a.x.atkMods, { source: abId, label: ab.name, value: n.value ?? 0, mode: 'add' }] })
        break
      case 'discardLowest':
        if (a?.x.cur) state = patchAtk(state, { cur: { ...a.x.cur, dropLowest: true } })
        break
      case 'knockDown':
        if (subj && alive(subj) && !cannotKnockDown(state, b, subj.id)) { const r = addKnockdown(state, subj.id, abId); state = r.state; events.push(...r.events) }
        break
      case 'push': {
        if (!subj || !alive(subj) || !a) break
        const v = d3or(state, n.dist, ownerId); state = v.state; events.push(...v.events)
        const from = state.models[a.attackerId]!.pos
        const r = pushModel(state, subj.id, from, v.n, look); state = r.state; events.push(...r.events)
        break
      }
      case 'slam': {
        if (!subj || !alive(subj) || !a) break
        const v = d3or(state, n.dist, ownerId); state = v.state; events.push(...v.events)
        const r = slideAway(state, subj.id, state.models[a.attackerId]!.pos, v.n, 'slam', look); state = r.state; events.push(...r.events)
        if (!cannotKnockDown(state, b, subj.id)) { const k = addKnockdown(state, subj.id, abId); state = k.state; events.push(...k.events) }
        break
      }
      case 'applyCondition':
        if (subj && alive(subj) && n.condition) {
          if ((n.condition === 'fire' || n.condition === 'corrosion') && resistsDamageType(state, b, subj.id, [n.condition])) break
          const r = addCondition(state, subj.id, n.condition, abId); state = r.state; events.push(...r.events)
        }
        break
      case 'gainFocus': if (subj) { const r = gainFocus(state, subj.id, n.value ?? 1, 'gain'); state = r.state; events.push(...r.events) } break
      case 'forbid': if (n.what === 'tough' && a) state = patchAtk(state, { denyTough: true }); break
      case 'removeFromPlay': if (a) state = patchAtk(state, { rfp: true }); break
      case 'cloud': {
        if (!a) break
        if (ab.trigger === 'death.boxed') { state = patchAtk(state, { flags: { ...a.x.flags, boxedOps: [...((a.x.flags.boxedOps as Rec[] | undefined) ?? []), n] } }); break }
        const at = state.models[targetId ?? a.targetId]
        if (!at) break
        const c = makeCloud(state, at.pos, n, owner)
        state = c.state; events.push(...c.events)
        break
      }
      case 'advance': {
        if (!subj || !a) break
        const dst = typeof n.dist === 'number' ? n.dist : 0
        if (n.direction === 'toward') {
          // Beat Back follow-up: the ability's owner advances toward the model the effect moved
          const mover = state.models[ownerId]
          if (!mover || !alive(mover) || mover.id === subj.id) break
          const r = advanceToward(state, mover.id, subj.pos, dst); state = r.state; events.push(...r.events)
        } else state = patchAtk(state, { moveReq: { modelId: subj.id, dist: dst, mode: 'advance', abilityId: abId, owner: state.models[ownerId]?.owner ?? owner, optional: !!ab.optional } })
        break
      }
      case 'place': {
        if (!subj || !a) break
        state = patchAtk(state, { moveReq: { modelId: subj.id, dist: typeof n.dist === 'number' ? n.dist : 0, mode: 'place', abilityId: abId, owner, optional: !!ab.optional } })
        break
      }
      case 'endActivation': {
        const a3 = atkOf(state)
        if (!a3) break
        if (a3.x.moveReq) state = patchAtk(state, { moveReq: { ...a3.x.moveReq, endsActivation: true } })
        else state = patchAtk(state, { flags: { ...a3.x.flags, endActivation: true } })
        break
      }
      case 'makeAttack':
        if (a) state = patchAtk(state, { flags: { ...a.x.flags, makeAttack: { ownerId, target: n.target ?? 'target', weaponFilter: n.weaponFilter ?? 'any', basic: !!n.basic, abilityId: abId } } })
        break
      default: break
    }
  }
  return { state, events }
}

function advanceToward(state: GameState, id: ModelId, toward: Vec2, maxDist: number): { state: GameState; events: GameEvent[] } {
  const m = state.models[id]!
  const d = norm(sub(toward, m.pos))
  const r = dist(m.pos, toward)
  const step = Math.min(maxDist, Math.max(0, r))
  // stop at first contact using the geometry sweep
  const sw = sweepStraightSafe(state, id, d, step)
  const end = sw
  if (dist(end, m.pos) < 1e-9) return { state, events: [] }
  const s = relocate(state, id, end)
  return { state: s, events: [{ type: 'ModelMoved', modelId: id, kind: 'advance', from: m.pos, to: end, path: [end], distance: dist(m.pos, end), elevAfter: s.models[id]!.elev }] }
}
function sweepStraightSafe(state: GameState, id: ModelId, d: Vec2, step: number): Vec2 {
  const m = state.models[id]!
  return sweepFrom(state, m, m.pos, d, step, { passThrough: 'none', obstacles: 'stop' }).end
}

function makeCloud(state: GameState, pos: Vec2, n: Rec, owner: PlayerId): { state: GameState; events: GameEvent[] } {
  const id = `cl:${state.effectSeq + state.clouds.length + 1}`
  const kind = (n.area ?? 'cloud') as 'cloud' | 'hazard' | 'flare'
  const exp = { round: state.round + 1, turn: state.turn + 2, player: state.activePlayer }
  const cloud = { id, pos, diameter: (n.aoe as number) ?? 3, owner, kind, ...(n.hazard ? { hazard: n.hazard } : {}), ...(n.blocksLos === false ? { blocksLos: false } : {}), expires: exp }
  return { state: { ...state, effectSeq: state.effectSeq + 1, clouds: [...state.clouds, cloud] }, events: [{ type: 'CloudCreated', cloudId: id, pos, diameter: cloud.diameter, owner }] }
}

function runSpecs(state0: GameState, b: B, point: string, targetId?: ModelId, job?: DmgJob): { state: GameState; events: GameEvent[] } {
  let state = state0
  const events: GameEvent[] = []
  const atk = atkOf(state)
  if (!atk) return { state, events }
  for (const abId of atk.x.specs) {
    const ab = rec(b, abId)
    if (ab.trigger !== point) continue
    const r = runAbility(state, b, abId, atk.attackerId, targetId ?? atk.targetId, job)
    state = r.state; events.push(...r.events)
  }
  return { state, events }
}

// ---------- the pipeline driver ----------
function canSpendAttackFocus(state: GameState, b: B, atk: AtkCtx): boolean {
  if (atk.x.noFocus || atk.outOfActivation) return false
  const a = actOf(state)
  if (!a || !a.modelIds.includes(atk.attackerId)) return false
  void b
  return canSpendFocus(state, atk.attackerId)
}

function fin(state: GameState, events: GameEvent[]): Out { return ok(state, events) }

export function drive(state0: GameState, b: B, events: GameEvent[]): Out {
  let state = state0
  for (let guard = 0; guard < 400; guard++) {
    const atk = atkOf(state)
    if (!atk) return fin(state, events)
    const at = state.models[atk.attackerId]!
    switch (atk.x.stage) {
      case 'start': {
        const hasPowerful = atk.x.specs.includes('cyg.a.powerful-attack') || ((atk.weaponId && ((rec(b, atk.weaponId).abilities ?? []) as Id[]).includes('cyg.a.powerful-attack')) ?? false)
        if (hasPowerful && canSpendAttackFocus(state, b, atk) && !atk.autoMiss) {
          const did = nextId(state)
          const options: DecisionOption[] = [
            { id: 'powerful', label: 'Powerful Attack: 1 focus boosts the attack and damage rolls', action: { type: 'abilityChoice', decisionId: did, player: at.owner, optionId: 'powerful' } as Action, cost: { focus: 1 }, odds: { pHit: atk.pHitBoosted } },
            { id: 'no', label: 'No', action: { type: 'abilityChoice', decisionId: did, player: at.owner, optionId: 'no' } as Action },
          ]
          state = patchAtk(state, { stage: 'powerfulWait' })
          const r = raise({ ...state, window: 'attack.beforeRoll' }, { player: at.owner, kind: 'abilityChoice', window: 'attack.beforeRoll', context: { modelId: at.id, targetId: atk.targetId, attackId: atk.attackId, data: { code: 'powerfulAttack' }, odds: { pHit: atk.pHit, pHitBoosted: atk.pHitBoosted } }, options, canPass: false })
          return fin(r.state, events)
        }
        state = patchAtk(state, { stage: 'boostWait' })
        continue
      }
      case 'boostWait': {
        // raise the boost decision unless nothing could change (no focus, auto result)
        if (!atk.x.boosted && !atk.autoMiss && canSpendAttackFocus(state, b, atk)) {
          const did = nextId(state)
          const options: DecisionOption[] = [
            { id: 'no', label: `No boost (${Math.round(atk.pHit * 100)}%)`, action: { type: 'boostAttack', decisionId: did, player: at.owner, boost: false } as Action, odds: { pHit: atk.pHit } },
            { id: 'boost', label: `Boost for 1 focus (${Math.round(atk.pHitBoosted * 100)}%)`, action: { type: 'boostAttack', decisionId: did, player: at.owner, boost: true } as Action, cost: { focus: 1 }, odds: { pHit: atk.pHitBoosted } },
          ]
          const r = raise({ ...state, window: 'attack.beforeRoll' }, { player: at.owner, kind: 'boostAttack', window: 'attack.beforeRoll', context: { modelId: at.id, targetId: atk.targetId, attackId: atk.attackId, odds: { pHit: atk.pHit, pHitBoosted: atk.pHitBoosted } }, options, canPass: false })
          return fin(r.state, events)
        }
        state = patchAtk(state, { stage: 'roll' })
        continue
      }
      case 'roll': {
        const r = rollStep(state, b)
        state = r.state; events.push(...r.events)
        continue
      }
      case 'dmgNext': {
        const r = nextJob(state, b)
        state = r.state; events.push(...r.events)
        if (r.wait) return fin(state, events)
        continue
      }
      case 'dmgRoll': {
        const r = damageRoll(state, b)
        state = r.state; events.push(...r.events)
        if (r.wait) return fin(state, events)
        continue
      }
      case 'applyDmg': {
        const r = applyJob(state, b)
        state = r.state; events.push(...r.events)
        if (r.wait) return fin(state, events)
        if (state.phase === 'ended') return fin(state, events)
        continue
      }
      case 'resolved': {
        const r = resolveAttack(state, b)
        state = r.state; events.push(...r.events)
        if (state.phase === 'ended') return fin({ ...state, ...endedPending(state) }, events)
        continue
      }
      case 'trigWait': {
        const r = triggerLoop(state, b)
        state = r.state; events.push(...r.events)
        if (r.wait) return fin(r.state, events)
        continue
      }
      case 'done': return finishAttack(state, b, events)
      default: return fin(state, events) // waiting stages are advanced by their answers
    }
  }
  throw new Error('activation: attack driver did not settle')
}
function endedPending(state: GameState): { pending: PendingDecision } { return { pending: state.pending } }

// ---------- rolls ----------
function rollStep(state0: GameState, b: B): { state: GameState; events: GameEvent[] } {
  let state = state0
  const events: GameEvent[] = []
  const atk = atkOf(state)!
  const at = state.models[atk.attackerId]!
  const spell = atk.spellId ? rec(b, atk.spellId) : undefined
  const w = spell ?? rec(b, atk.weaponId!)
  const inst = spell ? undefined : weaponsOf(b, at).find((x) => x.weaponId === atk.weaponId && x.loc === atk.x.wloc)
  const removed = inst && weaponCrippled(at, inst.loc) ? 1 : 0
  const boost = atk.x.boosted || atk.x.powerful
  if (boost) events.push({ type: 'RollBoosted', attackId: atk.attackId, roll: 'attack', modelId: at.id, source: atk.x.powerful ? 'effect' : 'focus' })
  const results: AtkX['results'] = {}
  const dk = atk.kind === 'melee' || atk.kind === 'power' ? 'melee' : atk.kind === 'arcane' ? 'arcane' : atk.kind === 'spray' ? 'spray' : 'ranged'
  for (const tid of atk.x.rollTargets) {
    const t = state.models[tid]
    if (!t) continue
    let hitTarget = atk.hitTarget
    let autoHit = atk.autoHit
    let autoMiss = atk.autoMiss
    if (atk.kind === 'spray') {
      const df = defFor(state, b, atk, at, t, dk, { ignoreTIM: false })
      hitTarget = df.def; autoHit = df.autoHit; autoMiss = false
    }
    const mods = atkModsFor(state, b, atk, tid)
    const stv = statOf(state, b, at.id, attackStatName(atk.kind), { atk: { kind: atk.kind } })
    const r = rollAttack(state, { stat: stv, mods, dice: { base: 2, added: atk.x.atkAdd, removed, boost }, target: hitTarget, autoHit, autoMiss, ownerId: at.id })
    state = r.state; events.push(...r.events)
    results[tid] = { hit: r.hit, crit: r.crit, auto: r.auto, total: r.total, dice: r.dice }
    events.push({ type: 'AttackResolved', attackId: atk.attackId, rollId: r.rollId, hit: r.hit, crit: r.crit, auto: r.auto })
  }
  void w
  state = patchAtk(state, { results, stage: 'dmgNext', boosted: boost })
  { const pr = results[atk.targetId]; if (pr) state = setAtk(state, { ...atkOf(state)!, hit: pr.hit, crit: pr.crit, dieValues: pr.dice, boosted: boost }) }
  // hit / crit / miss triggers (A1 step 8), per rolling model
  for (const tid of atk.x.rollTargets) {
    const res = results[tid]
    if (!res) continue
    if (res.hit) {
      for (const p of plugins()) if (p.onHit) { const r = p.onHit(state, b, atkOf(state)!, tid); state = r.state; events.push(...r.events) }
      const h = runSpecs(state, b, 'attack.hit', tid); state = h.state; events.push(...h.events)
      if (res.crit) { const c = runSpecs(state, b, 'attack.crit', tid); state = c.state; events.push(...c.events) }
      state = patchAtk(state, { hitModels: [...atkOf(state)!.x.hitModels, tid] })
    } else { const mm = runSpecs(state, b, 'attack.miss', tid); state = mm.state; events.push(...mm.events) }
  }
  // damage jobs
  const j = buildJobs(state, b)
  state = j.state; events.push(...j.events)
  state = patchAtk(state, { jobs: j.jobs, jobIdx: 0 })
  return { state, events }
}

function buildJobs(state0: GameState, b: B): { state: GameState; events: GameEvent[]; jobs: DmgJob[] } {
  let state = state0
  const events: GameEvent[] = []
  const atk = atkOf(state)!
  const at = state.models[atk.attackerId]!
  const spell = atk.spellId ? rec(b, atk.spellId) : undefined
  const w = spell ?? rec(b, atk.weaponId!)
  const types: DamageType[] = [...((w.damageTypes ?? []) as DamageType[])]
  const magical = ((w.qualities ?? []) as Id[]).includes('core.q.magical') || !!spell
  if (magical && !types.includes('magical')) types.push('magical')
  const jobs: DmgJob[] = []
  let n = 0
  const jid = () => `${atk.attackId}.${++n}`
  const first = atk.x.rollTargets.find((t) => atk.x.results[t]?.hit)
  if (atk.kind === 'aoe') {
    const N = atk.x.aoe ?? 0
    const tid = atk.targetId
    const res = atk.x.results[tid]
    const tg = state.models[tid]
    const blastPow = atk.powBlast ?? atk.x.blastPow ?? 0
    const blastTypes: DamageType[] = ['blast', ...types.filter((t) => t !== 'blast')]
    const pow = atk.powDirect
    if (N > 0 && tg) {
      if (res?.hit) {
        jobs.push({ id: jid(), targetId: tid, kind: 'direct', pow, types: [...types], autoBoost: atk.x.chargeAttack || atk.x.powerful })
        if (tg.base <= 80) {
          const bs = blastSet(state, b, atk, N)
          state = bs.state; events.push(...bs.events)
          for (const id of bs.ids) jobs.push({ id: jid(), targetId: id, kind: 'blast', pow: blastPow, types: blastTypes, unboostable: true })
        }
      } else if (!atk.x.flags.outOfRange) {
        jobs.push({ id: jid(), targetId: tid, kind: 'blast', pow: blastPow, types: blastTypes, unboostable: true })
      }
    }
  } else {
    for (const tid of atk.x.rollTargets) {
      if (!atk.x.results[tid]?.hit) continue
      jobs.push({ id: jid(), targetId: tid, kind: 'direct', pow: atk.powDirect, types: [...types], autoBoost: (tid === first) && (atk.x.chargeAttack || atk.x.powerful) })
    }
  }
  void at
  return { state, events, jobs }
}

/** R7.9: the N closest other models within N" of the target's base take blast damage; ties are broken at random (seeded). */
function blastSet(state0: GameState, b: B, atk: AtkCtx, N: number): { state: GameState; events: GameEvent[]; ids: ModelId[] } {
  let state = state0
  const events: GameEvent[] = []
  const tg = state.models[atk.targetId]!
  const cands = Object.values(state.models)
    .filter((m) => m.id !== tg.id && m.id !== atk.attackerId && isOnTable(m) && within(m, tg, N))
    .map((m) => ({ id: m.id, d: modelDistance(m, tg) }))
    .sort((x, y) => (Math.abs(x.d - y.d) > 1e-6 ? x.d - y.d : x.id.localeCompare(y.id))) // equal gaps: a stable id order
  if (cands.length <= N) return { state, events, ids: cands.map((c) => c.id) }
  const cut = cands[N - 1]!.d
  const sure = cands.filter((c) => c.d < cut - 1e-6)
  const tied = cands.filter((c) => Math.abs(c.d - cut) <= 1e-6)
  const need = N - sure.length
  let pick = tied.map((c) => c.id)
  if (tied.length > need) {
    const rolled = tied.map((c) => {
      const r = rollNd6(state, 1, 'aoeTie', { ownerId: c.id }); state = r.state; events.push(r.event)
      return { id: c.id, v: r.dice[0]! }
    }).sort((x, y) => y.v - x.v || x.id.localeCompare(y.id))
    pick = rolled.slice(0, need).map((r) => r.id)
  }
  const ids = [...sure.map((c) => c.id), ...pick]
  events.push({ type: 'BlastTargetsFixed', attackId: atk.attackId, centreId: tg.id, targetIds: ids })
  void b
  return { state, events, ids }
}

// ---------- damage jobs ----------
/** damage.beforeRoll for one damage job (A1 08A): additional dice, flat bonuses, discard-lowest and Armor-Piercing land in atk.x.cur. */
function prepareJob(state0: GameState, b: B, job: DmgJob): { state: GameState; events: GameEvent[] } {
  let state = state0
  const atk = atkOf(state)!
  state = patchAtk(state, { cur: { addDice: 0, flat: 0, boost: false, dropLowest: false, armorPiercing: false }, flags: { ...atk.x.flags, column: undefined } })
  const r = runSpecs(state, b, 'damage.beforeRoll', job.targetId, job)
  state = r.state
  const a = atkOf(state)!
  let flat = a.x.cur!.flat
  if (job.kind === 'direct') {
    flat += a.x.starFlat
    for (const p of appliedPassives(state, b, a.attackerId, { attackerId: a.attackerId, targetId: job.targetId })) {
      for (const n of (p.ability.effect ?? []) as Rec[]) if (n.op === 'modRoll' && (n.roll === 'damage' || n.roll === 'any')) flat += n.value
    }
    for (const p of plugins()) if (p.damageFlat) flat += p.damageFlat(state, b, a, job)
  }
  state = patchAtk(state, { cur: { ...a.x.cur!, flat } })
  return { state, events: r.events }
}

/** The damage types an attack's damage rolls carry (weapon types, plus Magical for magical weapons and spells). */
function attackDamageTypes(b: B, atk: AtkCtx): DamageType[] {
  const spell = atk.spellId ? rec(b, atk.spellId) : undefined
  const w = spell ?? rec(b, atk.weaponId!)
  const types: DamageType[] = [...((w.damageTypes ?? []) as DamageType[])]
  const magical = ((w.qualities ?? []) as Id[]).includes('core.q.magical') || !!spell
  if (magical && !types.includes('magical')) types.push('magical')
  return types
}

/** Everything one damage roll of the declared attack would use, for query.attackPreview (no dice are rolled). */
export interface DamagePreview { pow: number; armor: number; added: number; removed: number; resist: boolean; flat: number; dropLowest: boolean; unboostable: boolean }
export function previewDamage(state0: GameState, b: B, kind: 'direct' | 'blast'): DamagePreview {
  const atk = atkOf(state0)!
  const at = state0.models[atk.attackerId]!
  const types = attackDamageTypes(b, atk)
  const blastTypes: DamageType[] = ['blast', ...types.filter((t) => t !== 'blast')]
  const job: DmgJob = kind === 'direct'
    ? { id: 'preview', targetId: atk.targetId, kind, pow: atk.powDirect, types }
    : { id: 'preview', targetId: atk.targetId, kind, pow: atk.powBlast ?? atk.x.blastPow ?? 0, types: blastTypes, unboostable: true }
  const { state } = prepareJob(state0, b, job)
  const a = atkOf(state)!
  const cur = a.x.cur!
  const inst = atk.spellId ? undefined : weaponsOf(b, at).find((x) => x.weaponId === atk.weaponId && x.loc === atk.x.wloc)
  return {
    pow: job.pow, armor: armOf(state, b, job.targetId, { armorPiercing: cur.armorPiercing, blessed: a.x.blessed }), added: cur.addDice,
    removed: inst && weaponCrippled(at, inst.loc) ? 1 : 0, resist: resistsDamageType(state, b, job.targetId, job.types), flat: cur.flat,
    dropLowest: cur.dropLowest, unboostable: !!job.unboostable,
  }
}

/** R5.3/R7.17: the attack is the charge attack (its damage roll is boosted for free). The same test the attack itself runs. */
export function isChargeAttack(state: GameState, b: B, attackerId: ModelId, weaponId: Id, targetId: ModelId): boolean {
  const ac = actOf(state)
  const m = state.models[attackerId]
  if (!ac || !m || !ac.charge?.success || ac.x.chargeAttackFor !== attackerId) return false
  const w = weaponsOf(b, m).find((x) => x.weaponId === weaponId)
  return !!w && isMelee(w.w) && !ac.perModel[attackerId]?.meleeMade && targetId === ac.charge.targetId
}

/** The ★Attack the attacker's Combat Action is using, if any (its damage bonus applies to the attack). */
export function activeStar(state: GameState, attackerId: ModelId): Id | undefined {
  const ac = actOf(state)
  return ac?.x.star?.modelId === attackerId ? ac.x.star.abilityId : undefined
}

function nextJob(state0: GameState, b: B): { state: GameState; events: GameEvent[]; wait: boolean } {
  let state = state0
  const events: GameEvent[] = []
  const atk = atkOf(state)!
  if (atk.x.jobIdx >= atk.x.jobs.length) { state = patchAtk(state, { stage: 'resolved', cur: undefined }); return { state, events, wait: false } }
  const job = atk.x.jobs[atk.x.jobIdx]!
  const tgt = state.models[job.targetId]
  if (!tgt || tgt.life === 'destroyed') { state = patchAtk(state, { jobIdx: atk.x.jobIdx + 1 }); return { state, events, wait: false } }
  const pj = prepareJob(state, b, job)
  state = pj.state; events.push(...pj.events)
  let a = atkOf(state)!
  const flat = a.x.cur!.flat
  if (job.autoBoost) {
    state = patchAtk(state, { cur: { ...a.x.cur!, boost: true }, stage: 'dmgRoll' })
    events.push({ type: 'RollBoosted', attackId: a.attackId, instanceId: job.id, roll: 'damage', modelId: a.attackerId, source: a.x.powerful ? 'effect' : 'charge' })
    return { state, events, wait: false }
  }
  if (!job.unboostable && canSpendAttackFocus(state, b, a)) {
    const did = nextId(state)
    const at = state.models[a.attackerId]!
    const t = state.models[job.targetId]!
    const dd = (boost: boolean) => damageDistribution({ pow: job.pow, armor: armOf(state, b, job.targetId, { armorPiercing: a.x.cur!.armorPiercing, blessed: a.x.blessed }), dice: { added: a.x.cur!.addDice, boost }, resist: resistsDamageType(state, b, job.targetId, job.types), flat })
    const boxes = t.damage.track === 'single' ? Math.max(1, t.damage.boxes - t.damage.filled) : 30
    const d0 = dd(false), d1 = dd(true)
    const options: DecisionOption[] = [
      { id: 'no', label: 'No boost', action: { type: 'boostDamage', decisionId: did, player: at.owner, boost: false, instanceId: job.id } as Action, odds: { expectedDamage: expectedDamage(d0), pKill: pKill(d0, boxes) } },
      { id: 'boost', label: 'Boost damage for 1 focus', action: { type: 'boostDamage', decisionId: did, player: at.owner, boost: true, instanceId: job.id } as Action, cost: { focus: 1 }, odds: { expectedDamage: expectedDamage(d1), pKill: pKill(d1, boxes) } },
    ]
    state = patchAtk(state, { stage: 'dmgBoostWait' })
    const r2 = raise({ ...state, window: 'damage.beforeRoll' }, { player: at.owner, kind: 'boostDamage', window: 'damage.beforeRoll', context: { modelId: at.id, targetId: job.targetId, attackId: a.attackId, odds: { expectedDamage: expectedDamage(d0) } }, options, canPass: false })
    return { state: r2.state, events, wait: true }
  }
  state = patchAtk(state, { stage: 'dmgRoll' })
  return { state, events, wait: false }
}

function damageRoll(state0: GameState, b: B): { state: GameState; events: GameEvent[]; wait: boolean } {
  let state = state0
  const events: GameEvent[] = []
  const atk = atkOf(state)!
  const job = atk.x.jobs[atk.x.jobIdx]!
  const cur = atk.x.cur!
  const at = state.models[atk.attackerId]!
  const spell = atk.spellId ? rec(b, atk.spellId) : undefined
  const inst = spell ? undefined : weaponsOf(b, at).find((x) => x.weaponId === atk.weaponId && x.loc === atk.x.wloc)
  const removed = inst && weaponCrippled(at, inst.loc) ? 1 : 0
  const resist = resistsDamageType(state, b, job.targetId, job.types)
  const arm = armOf(state, b, job.targetId, { armorPiercing: cur.armorPiercing, blessed: atk.x.blessed })
  const nDice = diceCount({ base: 2, added: cur.addDice, removed: removed + (resist ? 1 : 0), boost: cur.boost })
  const roll = nDice >= 1 ? rollNd6(state, nDice, 'damage', { ownerId: job.targetId, target: arm, flat: job.pow + cur.flat, dropLowest: cur.dropLowest ? 1 : 0, boosted: cur.boost })
    : rollMaybeZero(state, 0, 'damage', { ownerId: job.targetId, target: arm, flat: job.pow + cur.flat })
  state = roll.state; events.push(roll.event)
  const points = Math.max(0, roll.total - arm)
  const inst2: DamageInstance = { id: job.id, targetId: job.targetId, kind: job.kind, pow: job.pow, dice: nDice, boosted: cur.boost, damageTypes: job.types, mods: [], arm, rollId: roll.event.rollId, total: roll.total }
  events.push({ type: 'DamageRolled', instance: inst2, rollId: roll.event.rollId, arm, points })
  state = patchAtk(state, { cur: { ...cur, points, rollId: roll.event.rollId } })
  // Power Field: the damaged model may spend 1 of its own focus to cut this instance by 5 (R7.18 step 12)
  const t = state.models[job.targetId]!
  if (points > 0 && hasAb(state, b, t.id, 'core.a.power-field') && t.focus >= 1 && alive(t) && !t.crippled.includes('C')) {
    const did = nextId(state)
    const options: DecisionOption[] = [
      { id: 'no', label: `Take ${points} damage`, action: { type: 'powerField', decisionId: did, player: t.owner, spend: 0, instanceId: job.id } as Action },
      { id: 'spend', label: `Power Field: 1 focus, take ${Math.max(0, points - 5)}`, action: { type: 'powerField', decisionId: did, player: t.owner, spend: 1, instanceId: job.id } as Action, cost: { focus: 1 } },
    ]
    state = patchAtk(state, { stage: 'pfWait' })
    const r = raise({ ...state, window: 'damage.beforeApply' }, { player: t.owner, kind: 'powerField', window: 'damage.beforeApply', context: { modelId: t.id, attackId: atk.attackId, data: { points } }, options, canPass: false })
    return { state: r.state, events, wait: true }
  }
  state = patchAtk(state, { stage: 'applyDmg' })
  return { state, events, wait: false }
}

function applyJob(state0: GameState, b: B): { state: GameState; events: GameEvent[]; wait: boolean } {
  let state = state0
  const events: GameEvent[] = []
  let atk = atkOf(state)!
  const job = atk.x.jobs[atk.x.jobIdx]!
  const cur = atk.x.cur!
  const points = cur.points ?? 0
  const tgt = state.models[job.targetId]!
  // damage.beforeApply hooks (Marksman picks the column)
  if (points > 0 && atk.x.flags.column === undefined && !atk.x.flags.beforeApplyDone) {
    state = patchAtk(state, { needColumn: false, flags: { ...atk.x.flags, beforeApplyDone: true } })
    if (job.kind === 'direct') { const r = runSpecs(state, b, 'damage.beforeApply', job.targetId, job); state = r.state; events.push(...r.events) }
    atk = atkOf(state)!
    if (atk.x.needColumn && tgt.damage.track === 'grid') {
      const did = nextId(state)
      const at = state.models[atk.attackerId]!
      const grid = tgt.damage.grids[0]!
      const options: DecisionOption[] = grid.cols.map((c, i) => ({ c, i })).filter(({ c }) => c.includes(false)).map(({ i }) => ({
        id: `col${i + 1}`, label: `Column ${i + 1}`, action: { type: 'chooseBoxes', decisionId: did, player: at.owner, column: i + 1 } as Action,
      }))
      state = patchAtk(state, { stage: 'boxWait' })
      const r = raise({ ...state, window: 'damage.beforeApply' }, { player: at.owner, kind: 'chooseBoxes', window: 'damage.beforeApply', context: { modelId: tgt.id, attackId: atk.attackId }, options, canPass: false })
      return { state: r.state, events, wait: true }
    }
  }
  atk = atkOf(state)!
  const look = lookups(state, b)
  const column = atk.x.flags.column as number | undefined
  const ap = applyDamage(state, job.targetId, points, {
    layouts: look.layouts?.(job.targetId), attackId: atk.attackId, instanceId: job.id, source: job.kind === 'direct' ? 'direct' : 'blast', damageTypes: job.types, column,
  })
  state = ap.state; events.push(...ap.events)
  if (points > 0) state = khadorNoteDamaged(state, job.targetId)
  // death (R3.9): Tough, boxed triggers, destroyed
  if (state.models[job.targetId]!.life === 'disabled') {
    const d = settleDeath(state, b, job)
    state = d.state; events.push(...d.events)
  }
  atk = atkOf(state)!
  state = patchAtk(state, { jobIdx: atk.x.jobIdx + 1, stage: 'dmgNext', cur: undefined })
  return { state, events, wait: false }
}

function settleDeath(state0: GameState, b: B, job: DmgJob): { state: GameState; events: GameEvent[] } {
  let state = state0
  const events: GameEvent[] = []
  let atk = atkOf(state)!
  const tid = job.targetId
  // boxed triggers (Head Shot, Take Down, Eruption of Ash, Arcane Conflagration) decide Tough denial and RFP before the death steps
  state = patchAtk(state, { denyTough: false, rfp: false, flags: { ...atk.x.flags, boxedOps: [] } })
  const r = runSpecs(state, b, 'death.boxed', tid, job)
  state = r.state; events.push(...r.events)
  atk = atkOf(state)!
  let denyTough = atk.x.denyTough
  let rfp = atk.x.rfp
  let burst: { pow: number; radius: number; types: DamageType[] } | undefined
  for (const p of plugins()) {
    if (!p.onBoxed) continue
    const o = p.onBoxed(state, b, atk, tid, job)
    if (!o) continue
    rfp = rfp || o.removeFromPlay; denyTough = denyTough || o.denyTough
    burst = o.burst ?? burst
  }
  const look = lookups(state, b)
  const pos = state.models[tid]!.pos
  const d = resolveDeath(state, tid, { tough: look.tough?.(tid), denyTough, removeFromPlay: rfp, layouts: look.layouts?.(tid), cause: atk.attackId })
  state = d.state; events.push(...d.events)
  if (d.outcome === 'alive') return { state, events }
  // boxed effects that need the model's spot: Eruption's hazard cloud, Conflagration's burst
  atk = atkOf(state)!
  const owner = state.models[atk.attackerId]?.owner ?? state.activePlayer
  for (const n of (atk.x.flags.boxedOps as Rec[] | undefined) ?? []) {
    if (n.op === 'cloud') { const c = makeCloud(state, pos, n, owner); state = c.state; events.push(...c.events) }
  }
  if (burst) {
    const near = Object.values(state.models).filter((m) => m.id !== tid && isOnTable(m) && dist(m.pos, pos) - baseRadius(m.base) <= burst!.radius + baseRadius(state.models[tid]!.base) + 1e-6)
    for (const m of near) {
      const arm = armOf(state, b, m.id)
      const rr = rollNd6(state, 2, 'damage', { ownerId: m.id, target: arm, flat: burst.pow })
      state = rr.state; events.push(rr.event)
      const pts = Math.max(0, rr.total - arm)
      const ap = applyDamage(state, m.id, pts, { source: 'blast', layouts: look.layouts?.(m.id), damageTypes: burst.types, attackId: atk.attackId })
      state = ap.state; events.push(...ap.events)
      if (state.models[m.id]!.life === 'disabled') { const dd = resolveDeath(state, m.id, { tough: look.tough?.(m.id), layouts: look.layouts?.(m.id), cause: atk.attackId }); state = dd.state; events.push(...dd.events) }
    }
  }
  state = patchAtk(state, { destroyed: [...atk.x.destroyed, tid] })
  return { state, events }
}

// ---------- after the attack resolved (A1 steps 11-13) ----------
function resolveAttack(state0: GameState, b: B): { state: GameState; events: GameEvent[] } {
  let state = state0
  const events: GameEvent[] = []
  let atk = atkOf(state)!
  for (const p of plugins()) if (p.onResolved) { const r = p.onResolved(state, b, atk); state = r.state; events.push(...r.events) }
  state = sweepDead(state)
  const end = afterDeaths(state, b)
  state = end.state; events.push(...end.events)
  if (end.ended || state.phase === 'ended') return { state, events }
  atk = atkOf(state)!
  // record kills for the activation (Run & Gun, Gatecrasher)
  const a = actOf(state)
  if (a && atk.x.destroyed.length && a.modelIds.includes(atk.attackerId)) {
    const ranged = atk.kind === 'ranged' || atk.kind === 'aoe' || atk.kind === 'spray'
    state = patchX(state, { killedAny: true, killedByRanged: act(state).x.killedByRanged || ranged })
  }
  atk = atkOf(state)!
  // collect the triggers in A1's three tiers
  const attackerOwner = state.models[atk.attackerId]!.owner
  const list: AtkX['trig'] = []
  const consider = (ownerId: ModelId, abId: Id, targetId: ModelId) => {
    const ab = rec(b, abId)
    if (ab.trigger !== 'attack.resolved') return
    const env: CondEnv = { selfId: ownerId, attackerId: atk.attackerId, targetId, atk, act: actInfo(state) }
    if (!evalCond(state, b, ab.when, env)) return
    // a knocked-down or stationary model cannot advance, so its own "may advance" triggers (Evasive) never open
    const selfMove = ab.scope?.who !== 'target' && (ab.effect ?? []).some((n: Rec) => n.op === 'advance')
    const owner = state.models[ownerId]
    if (selfMove && owner && (kd(state, owner) || stat(state, owner))) return
    const makes = (ab.effect ?? []).some((n: Rec) => n.op === 'makeAttack')
    const mine = state.models[ownerId]?.owner === attackerOwner
    const tier: 1 | 2 | 3 = !mine ? 2 : makes ? 3 : 1
    list.push({ ownerId, tier, abilityId: abId })
  }
  const seen = new Set<string>()
  for (const abId of atk.x.specs) if (!seen.has(abId)) { seen.add(abId); consider(atk.attackerId, abId, atk.targetId) }
  for (const tid of atk.x.rollTargets) {
    if (!alive(state.models[tid])) continue
    for (const abId of abilitiesOf(state, b, tid)) consider(tid, abId, tid)
  }
  list.sort((x, y) => x.tier - y.tier)
  state = patchAtk(state, { trig: list, trigIdx: 0, stage: 'trigWait', flags: { ...atk.x.flags, take: undefined, asked: undefined } })
  return { state, events }
}

function triggerLoop(state0: GameState, b: B): { state: GameState; events: GameEvent[]; wait: boolean } {
  let state = state0
  const events: GameEvent[] = []
  for (let guard = 0; guard < 50; guard++) {
    const atk = atkOf(state)!
    const t = atk.x.trig[atk.x.trigIdx]
    if (!t) { state = patchAtk(state, { stage: 'done' }); return { state, events, wait: false } }
    const ab = rec(b, t.abilityId)
    const owner = state.models[t.ownerId]
    const targetId = t.ownerId === atk.attackerId ? atk.targetId : t.ownerId
    const env: CondEnv = { selfId: t.ownerId, attackerId: atk.attackerId, targetId, atk, act: actInfo(state) }
    const next = (): void => { state = patchAtk(state, { trigIdx: atkOf(state)!.x.trigIdx + 1, flags: { ...atkOf(state)!.x.flags, take: undefined, asked: undefined } }) }
    if (!owner || !alive(owner) || !evalCond(state, b, ab.when, env)) { next(); continue }
    if (ab.optional && atk.x.flags.take === undefined) {
      const did = nextId(state)
      const options: DecisionOption[] = [{ id: 'take', label: `Use ${ab.name}`, action: { type: 'triggerWindow', decisionId: did, player: owner.owner, triggerId: t.abilityId } as Action }]
      state = patchAtk(state, { flags: { ...atk.x.flags, asked: atk.x.trigIdx } })
      const r = raise({ ...state, window: 'attack.resolved' }, { player: owner.owner, kind: 'triggerWindow', window: 'attack.resolved', context: { modelId: t.ownerId, attackId: atk.attackId, data: { triggerId: t.abilityId, tier: t.tier } }, options, canPass: true })
      return { state: r.state, events, wait: true }
    }
    if (ab.optional && atk.x.flags.take === false) { next(); continue }
    const r = runAbility(state, b, t.abilityId, t.ownerId, targetId)
    state = r.state; events.push(...r.events)
    events.push({ type: 'TriggerResolved', sourceId: t.abilityId, ownerId: t.ownerId, window: 'attack.resolved', skipped: false })
    const a2 = atkOf(state)!
    const req = a2.x.moveReq
    const mk = a2.x.flags.makeAttack as { ownerId: ModelId; target: string; weaponFilter: string; basic: boolean; abilityId: Id } | undefined
    next()
    if (req) {
      state = patchAtk(state, { stage: 'moveWait', moveReq: undefined })
      const spec: TriggerMoveSpec = { ctx: 'attack', modelId: req.modelId, dist: req.dist, mode: req.mode, abilityId: req.abilityId, endsActivation: req.endsActivation, player: req.owner, optional: false }
      const o = raiseTriggerMove(state, b, [], spec)
      return { state: o.state, events, wait: true }
    }
    if (mk) {
      state = patchAtk(state, { flags: { ...atkOf(state)!.x.flags, makeAttack: undefined } })
      const nested = startTriggeredAttack(state, b, mk)
      if (nested) { state = nested.state; events.push(...nested.events); return { state, events, wait: nested.wait } }
    }
  }
  return { state, events, wait: false }
}

/** A trigger that makes an attack (Reciprocate, Critical Shred): pick a legal basic weapon and run the pipeline nested. */
function startTriggeredAttack(state0: GameState, b: B, mk: { ownerId: ModelId; target: string; weaponFilter: string; basic: boolean; abilityId: Id }): { state: GameState; events: GameEvent[]; wait: boolean } | null {
  const parent = atkOf(state0)!
  const owner = state0.models[mk.ownerId]
  if (!owner || !alive(owner)) return null
  const targetId = mk.target === 'attacker' ? parent.attackerId : parent.targetId
  const tm = state0.models[targetId]
  if (!tm || !alive(tm)) return null
  const ws = weaponsOf(b, owner)
  const cand = ws.filter((w) => mk.weaponFilter === 'same' ? w.weaponId === parent.weaponId : mk.weaponFilter === 'ranged' ? !isMelee(w.w) : mk.weaponFilter === 'melee' ? isMelee(w.w) : true)
  for (const w of cand) {
    const kind = isMelee(w.w) ? 'melee' : undefined
    void kind
    const paused = { ...state0, attack: null } as GameState
    const dec = declareAttack(paused, b, { attackerId: owner.id, targetId, weaponId: w.weaponId, additional: false, noFocus: true, chargeAttack: false, generatedBy: parent.attackId, basic: true, parent })
    if ('rejection' in dec) continue
    // an out-of-range ranged shot is pointless: skip weapons that cannot reach
    const nested = atkOf(dec.state)!
    if (nested.autoMiss && nested.x.flags.outOfRange) continue
    const o = drive(dec.state, b, [])
    return { state: o.state, events: [...dec.events, ...o.events], wait: true }
  }
  return null
}

// ---------- finishing ----------
function finishAttack(state0: GameState, b: B, events: GameEvent[]): Out {
  let state = state0
  const atk = atkOf(state)!
  events.push({ type: 'AttackFinished', attackId: atk.attackId })
  if (atk.x.parent) {
    // resume the attack that made this one (A1: it is still resolving its triggers)
    const parent = atk.x.parent
    const merged: AtkCtx = { ...parent, x: { ...parent.x, destroyed: [...new Set([...parent.x.destroyed, ...atk.x.destroyed])], flags: { ...parent.x.flags, endActivation: parent.x.flags.endActivation || atk.x.flags.endActivation } } }
    state = { ...state, attack: merged as AttackContext }
    return drive(state, b, events)
  }
  const endAct = !!atk.x.flags.endActivation
  state = { ...state, attack: null }
  if (!actOf(state)) return fin(state, events)
  if (endAct) {
    state = patchX(state, { queue: [], cur: null })
    return finishActivation(state, b, events, 'normal')
  }
  return resumeAfterAttack(state, b, events)
}

/** Raise whatever decision the activation was on before the attack (or any-time action) began. */
function resumeAfterAttack(state0: GameState, b: B, events: GameEvent[]): Out {
  let state = state0
  // a prey that was destroyed gets replaced (Granted: Prey)
  for (const u of Object.values(state.units)) {
    if (u.preyId && !alive(state.models[u.preyId]) && u.troopers.some((t) => alive(state.models[t])) && hasPrey(state, b, u.id)) {
      const did = nextId(state)
      const owner = state.models[u.troopers[0]!]!.owner
      const options: DecisionOption[] = enemiesOf(state, owner).map((e) => ({ id: e.id, label: `Prey: ${e.id}`, action: { type: 'abilityChoice', decisionId: did, player: owner, optionId: e.id, data: { unitId: u.id } } as Action }))
      if (options.length) {
        const r = raise(state, { player: owner, kind: 'abilityChoice', window: 'attack.resolved', context: { unitId: u.id, data: { code: 'prey', unitId: u.id } }, options, canPass: false })
        return ok(r.state, events)
      }
    }
  }
  return reraise(state, b, events)
}
const hasPrey = (state: GameState, b: B, unitId: UnitId): boolean => state.units[unitId]!.troopers.some((t) => abilitiesOf(state, b, t).includes('cyg.a.prey'))

/** Raise the activation's current decision again. */
export function reraise(state: GameState, b: B, events: GameEvent[]): Out {
  const a = actOf(state)
  if (!a) return ok(state, events)
  if (a.x.stage === 'movement') return raiseMovement(state, b, events)
  if (a.x.stage === 'combat' || a.x.stage === 'endMove') {
    const cur = a.x.cur
    if (!cur || !alive(state.models[cur])) return nextCombat(state, b, events)
    if (a.perModel[cur]!.combat === null) return raiseCombatChoice(state, b, events)
    return raiseChooseAttack(state, b, events)
  }
  return ok(state, events)
}

/** Raise the prey choice for a unit after deployment (Granted: Prey). Returns null when the unit has no Prey rule or no enemy. */
export function raisePrey(state: GameState, b: B, unitId: UnitId): Out | null {
  const u = state.units[unitId]
  if (!u || !hasPrey(state, b, unitId)) return null
  const owner = state.models[u.troopers[0]!]!.owner
  const did = nextId(state)
  const options: DecisionOption[] = enemiesOf(state, owner).map((e) => ({ id: e.id, label: `Prey: ${e.id}`, action: { type: 'abilityChoice', decisionId: did, player: owner, optionId: e.id, data: { unitId } } as Action }))
  if (!options.length) return null
  const r = raise(state, { player: owner, kind: 'abilityChoice', window: 'activation.start', context: { unitId, data: { code: 'prey', unitId } }, options, canPass: false })
  return ok(r.state, [])
}

// ---------- decision answers inside the attack ----------
function needAtk(state: GameState, stages: AtkX['stage'][]): AtkCtx | Result {
  const atk = atkOf(state)
  if (!atk || !stages.includes(atk.x.stage)) return reject('E_WRONG_DECISION', 'no matching attack in progress')
  return atk
}
const isAtk = (x: AtkCtx | Result): x is AtkCtx => 'attackId' in x

function boostAttackAnswer(state0: GameState, b: B, a: import('../actions').BoostAttackAction): Result {
  let state = state0
  const atk = needAtk(state, ['boostWait'])
  if (!isAtk(atk)) return atk
  const events: GameEvent[] = []
  if (a.boost) {
    if (!canSpendAttackFocus(state, b, atk)) return reject('E_INSUFFICIENT_FOCUS', 'cannot pay for a boost')
    const f = spendFocus(state, atk.attackerId, 1, 'boostAttack')
    if (isRejection(f)) return reject(f.rejection.code, f.rejection.message)
    state = f.state; events.push(...f.events)
    state = patchAtk(state, { boosted: true })
    state = setAtk(state, { ...atkOf(state)!, boosted: true })
  }
  state = patchAtk(state, { stage: 'roll' })
  return drive(state, b, events)
}

function boostDamageAnswer(state0: GameState, b: B, a: import('../actions').BoostDamageAction): Result {
  let state = state0
  const atk = needAtk(state, ['dmgBoostWait'])
  if (!isAtk(atk)) return atk
  const events: GameEvent[] = []
  if (a.boost) {
    if (!canSpendAttackFocus(state, b, atk)) return reject('E_INSUFFICIENT_FOCUS', 'cannot pay for a boost')
    const f = spendFocus(state, atk.attackerId, 1, 'boostDamage')
    if (isRejection(f)) return reject(f.rejection.code, f.rejection.message)
    state = f.state; events.push(...f.events)
    events.push({ type: 'RollBoosted', attackId: atk.attackId, instanceId: atk.x.jobs[atk.x.jobIdx]?.id, roll: 'damage', modelId: atk.attackerId, source: 'focus' })
    state = patchAtk(state, { cur: { ...atk.x.cur!, boost: true } })
  }
  state = patchAtk(state, { stage: 'dmgRoll' })
  return drive(state, b, events)
}

function powerFieldAnswer(state0: GameState, b: B, a: import('../actions').PowerFieldAction): Result {
  let state = state0
  const atk = needAtk(state, ['pfWait'])
  if (!isAtk(atk)) return atk
  const job = atk.x.jobs[atk.x.jobIdx]!
  const events: GameEvent[] = []
  if (a.spend === 1) {
    const t = state.models[job.targetId]!
    const f = spendFocus(state, t.id, 1, 'powerField')
    if (isRejection(f)) return reject(f.rejection.code, f.rejection.message)
    state = f.state; events.push(...f.events)
    const before = atk.x.cur!.points ?? 0
    const after = Math.max(0, before - 5)
    events.push({ type: 'PowerFieldUsed', modelId: t.id, instanceId: job.id, reduced: before - after, after })
    state = patchAtk(state, { cur: { ...atk.x.cur!, points: after } })
  }
  state = patchAtk(state, { stage: 'applyDmg' })
  return drive(state, b, events)
}

function chooseBoxesAnswer(state0: GameState, b: B, a: import('../actions').ChooseBoxesAction): Result {
  let state = state0
  const atk = needAtk(state, ['boxWait'])
  if (!isAtk(atk)) return atk
  const job = atk.x.jobs[atk.x.jobIdx]!
  const t = state.models[job.targetId]!
  const col = a.column
  if (!col || col < 1 || col > 6 || t.damage.track !== 'grid' || !t.damage.grids[0]!.cols[col - 1]?.includes(false)) return reject('E_NOT_AN_OPTION', 'pick a column that still has an empty box')
  state = patchAtk(state, { stage: 'applyDmg', flags: { ...atk.x.flags, column: col } })
  return drive(state, b, [])
}

function triggerWindowAnswer(state0: GameState, b: B, take: boolean, triggerId?: string): Result {
  let state = state0
  const atk = needAtk(state, ['trigWait'])
  if (!isAtk(atk)) return atk
  const t = atk.x.trig[atk.x.trigIdx]
  if (!t || atk.x.flags.asked !== atk.x.trigIdx) return reject('E_WRONG_DECISION', 'no trigger is waiting')
  if (take && triggerId !== t.abilityId) return reject('E_NOT_AN_OPTION', `the waiting trigger is ${t.abilityId}`)
  state = patchAtk(state, { flags: { ...atk.x.flags, take, asked: undefined } })
  return drive(state, b, [])
}

function abilityChoiceAnswer(state0: GameState, b: B, a: import('../actions').AbilityChoiceAction): Result {
  let state = state0
  const code = state.pending.context.data?.code
  if (code === 'powerfulAttack') {
    const atk = needAtk(state, ['powerfulWait'])
    if (!isAtk(atk)) return atk
    const events: GameEvent[] = []
    if (a.optionId === 'powerful') {
      if (!canSpendAttackFocus(state, b, atk)) return reject('E_INSUFFICIENT_FOCUS', 'no focus for Powerful Attack')
      const f = spendFocus(state, atk.attackerId, 1, 'boostAttack')
      if (isRejection(f)) return reject(f.rejection.code, f.rejection.message)
      state = f.state; events.push(...f.events)
      state = patchAtk(state, { powerful: true, boosted: true, stage: 'roll' })
    } else if (a.optionId === 'no') state = patchAtk(state, { stage: 'boostWait' })
    else return reject('E_NOT_AN_OPTION', 'choose powerful or no')
    return drive(state, b, events)
  }
  if (code === 'prey') {
    const unitId = state.pending.context.data!.unitId as UnitId
    const u = state.units[unitId]
    if (!u || !state.models[a.optionId] || state.models[a.optionId]!.owner === ownerOf(state, u.troopers[0]!)) return reject('E_TARGET_INVALID', 'the prey must be an enemy model')
    state = { ...state, units: { ...state.units, [unitId]: { ...u, preyId: a.optionId } } }
    if (actOf(state)) return resumeAfterAttack(state, b, [])
    return ok(state, [])
  }
  return reject('E_NOT_AN_OPTION', 'unknown ability choice')
}

// ---------- any-time actions (spells, feat, heal, channel) ----------
function anytimeAnswer(state0: GameState, b: B, a: Action): Result {
  const state = state0
  const casterId = ('casterId' in a ? a.casterId : state.pending.context.modelId) as ModelId
  let r
  if (a.type === 'castSpell') r = castSpell(state, b, a)
  else if (a.type === 'useFeat') r = useFeat(state, b, a)
  else if (a.type === 'heal') r = heal(state, b, a)
  else if (a.type === 'channel') r = channel(state, b, a, casterId)
  else return reject('E_WRONG_DECISION', 'not an any-time action')
  if ('rejection' in r) return r
  if ('offensive' in r && r.offensive) {
    const o = r.offensive
    const dec = declareAttack(r.state, b, { attackerId: o.casterId, targetId: o.targetId, spellId: o.spellId, additional: false, noFocus: false, chargeAttack: false })
    if ('rejection' in dec) return dec
    return drive(dec.state, b, [...r.events, ...dec.events])
  }
  return reraise(r.state, b, r.events)
}

// ---------- Targeting Flare: a star attack that places a flare instead of rolling ----------
function flareAnswer(state0: GameState, b: B, a: ChooseAttackAction, abilityId: Id, inst: WeaponInst): Result {
  let state = state0
  const ac = act(state)
  const m = state.models[a.modelId]!
  const t = state.models[a.targetId]
  if (!t || !isOnTable(t)) return reject('E_TARGET_INVALID', 'pick a model to centre the flare on')
  if (modelDistance(m, t) > weaponRange(inst.w) + 1e-6) return reject('E_OUT_OF_RANGE', 'the flare must be placed within the weapon range')
  if (!losReport(state, m.id, t.id, { ignoreModels: true }).visible) return reject('E_NO_LOS', 'no line of sight to the flare spot')
  const node = ((rec(b, abilityId).effect ?? []) as Rec[]).find((n) => n.op === 'cloud')!
  const c = makeCloud(state, t.pos, { ...node, aoe: node.aoe ?? 3 }, m.owner)
  state = c.state
  const pmx = ac.perModel[m.id]!
  state = setPm(state, m.id, { initialAttacksLeft: { ...pmx.initialAttacksLeft, [inst.weaponId]: 0 }, attacksMade: pmx.attacksMade + 1 })
  return raiseChooseAttack(state, b, c.events)
}

// ---------- dispatcher ----------
const ANYTIME_KINDS = new Set<DecisionKind>(['chooseMovement', 'chooseCombatAction', 'chooseAttack'])

/**
 * Apply an action to a decision this module owns. Returns null when the action belongs to another module
 * (endTurn, control-phase answers, setup). The caller has already checked nothing; we check id and player here.
 */
export function handleActivationAction(state: GameState, b: B, a: Action): Result | null {
  const pd = state.pending
  if (!ACTIVATION_KINDS.has(pd.kind) && pd.kind !== 'chooseActivation') return null
  if (a.type === 'endTurn') return null
  if (a.decisionId !== pd.id) return reject('E_WRONG_DECISION', `expected an answer to ${pd.id}`)
  if (a.player !== pd.player) return reject('E_NOT_YOUR_DECISION', `the decision belongs to player ${pd.player}`)
  if (pd.kind === 'chooseActivation') return a.type === 'chooseActivation' ? beginActivation(state, b, a.activate) : reject('E_WRONG_DECISION', 'choose a model or unit to activate')
  if (isAnytimeAction(a)) {
    if (!ANYTIME_KINDS.has(pd.kind)) return reject('E_WRONG_DECISION', 'spells, feats and healing are not allowed in the middle of an attack or move')
    return anytimeAnswer(state, b, a)
  }
  if (a.type === 'pass') {
    if (!pd.canPass) return reject('E_NOT_AN_OPTION', 'this decision cannot be passed')
    if (pd.kind === 'triggerWindow') return triggerWindowAnswer(state, b, false)
    if (pd.kind === 'moveModel' && pd.context.data?.trigger) return afterTriggerMove(state, b, [], pd.context.data.trigger as TriggerMoveSpec, false)
    return reject('E_NOT_AN_OPTION', 'nothing to pass')
  }
  const wrong = (): Result => reject('E_WRONG_DECISION', `${a.type} does not answer a ${pd.kind} decision`)
  switch (pd.kind) {
    case 'chooseMovement': return a.type === 'chooseMovement' ? chooseMovementAnswer(state, b, a) : wrong()
    case 'moveModel': return a.type === 'moveModel' ? moveAnswer(state, b, a) : wrong()
    case 'chargeTarget': return a.type === 'chargeTarget' ? chargeTargetAnswer(state, b, a) : wrong()
    case 'placeTroopers': return a.type === 'placeTroopers' ? placeTroopersAnswer(state, b, a) : wrong()
    case 'chooseCombatAction': return a.type === 'chooseCombatAction' ? combatAnswer(state, b, a) : wrong()
    case 'chooseAttack':
      if (a.type === 'chooseAttack') return chooseAttackAnswer(state, b, a)
      if (a.type === 'powerAttack') return powerAttackAnswer(state, b, a)
      if (a.type === 'endAttacks') {
        if (a.modelId !== act(state).x.cur) return reject('E_TARGET_INVALID', 'not the model attacking')
        return endAttacksFor(state, b, a.modelId, [])
      }
      return wrong()
    case 'boostAttack': return a.type === 'boostAttack' ? boostAttackAnswer(state, b, a) : wrong()
    case 'boostDamage': return a.type === 'boostDamage' ? boostDamageAnswer(state, b, a) : wrong()
    case 'powerField': return a.type === 'powerField' ? powerFieldAnswer(state, b, a) : wrong()
    case 'chooseBoxes': return a.type === 'chooseBoxes' ? chooseBoxesAnswer(state, b, a) : wrong()
    case 'triggerWindow': return a.type === 'triggerWindow' ? triggerWindowAnswer(state, b, true, a.triggerId) : wrong()
    case 'abilityChoice': return a.type === 'abilityChoice' ? abilityChoiceAnswer(state, b, a) : wrong()
    default: return null
  }
}

/** legalActions for the decisions this module raises: every offered option, plus pass when allowed. Never empty. */
export function activationLegalActions(state: GameState): Action[] {
  const pd = state.pending
  const out: Action[] = (pd.options ?? []).map((o) => o.action)
  if (pd.canPass) out.push({ type: 'pass', decisionId: pd.id, player: pd.player } as Action)
  return out
}

/** Exactly the checks handleActivationAction runs, without keeping the result. */
export function validateActivationAction(state: GameState, b: B, a: Action): Rejection | null {
  const r = handleActivationAction(state, b, a)
  return r && 'rejection' in r ? r.rejection : null
}
