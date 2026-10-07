// R4: the round / turn / phase machine. Start of turn -> Maintenance -> Control -> Activation -> end of turn (scoring, victory).
// The reducer calls these; they never run an activation themselves (they raise chooseActivation and take endTurn).
import type { Action, EndTurnAction } from './actions'
import { expireEffects, otherPlayer } from './effects'
import type { GameEvent } from './events'
import { isOnTable } from './geometry'
import { raise, raiseGameOver, reject, type FlowOut, type FlowResult } from './pending'
import { answerControl, controlLegalActions, runControl } from './phases/control'
import { runMaintenance, startOfTurn } from './phases/maintenance'
import { answerAvengingForce, isAvengingDecision, runAvengingForce, settleAfterAttack } from './phases/avenging'
import { handleActivationAction } from './phases/activation'
import { endOfTurnScoring, scenarioDef } from './scenario'
import type { DataBundle, DecisionOption, GameState, ModelId, PlayerId, UnitId } from './types'

// ---------- activation list ----------
/** Models and units of the active player that still have to activate (R4.10). Inert, destroyed and off-table never do. */
export function activatable(state: GameState, player: PlayerId = state.activePlayer): (ModelId | UnitId)[] {
  const out: (ModelId | UnitId)[] = []
  for (const m of Object.values(state.models)) {
    if (m.owner !== player || m.unitId || m.activated || m.inert || !isOnTable(m)) continue
    out.push(m.id)
  }
  for (const u of Object.values(state.units)) {
    if (u.owner !== player || u.activated) continue
    if (u.troopers.some((id) => state.models[id] && isOnTable(state.models[id]!))) out.push(u.id)
  }
  return out.sort()
}

function gameOver(state: GameState, events: GameEvent[]): FlowOut {
  const r = raiseGameOver(state)
  return { state: r.state, events, pending: r.pending }
}

/** Raise chooseActivation (or the endTurn option when everything has activated). */
export function raiseChooseActivation(state: GameState, events: GameEvent[] = []): FlowOut {
  const p = state.activePlayer
  const left = activatable(state, p)
  const r = raise({ ...state, phase: 'activation', window: 'activation.start' }, { player: p, kind: 'chooseActivation', window: 'activation.start', context: {}, canPass: false })
  const id = r.pending.id
  const options: DecisionOption[] = left.length > 0
    ? left.map((x) => ({ id: x, label: `Activate ${x}`, action: { type: 'chooseActivation', decisionId: id, player: p, activate: x } as Action }))
    : [{ id: 'endTurn', label: 'End turn', action: { type: 'endTurn', decisionId: id, player: p } as Action }]
  const pending = { ...r.pending, options }
  return { state: { ...r.state, pending }, events, pending }
}

// ---------- turn start ----------
/** Begin the turn of state.activePlayer: start effects, Maintenance, Control, then the first decision. */
export function beginTurn(state: GameState, bundle: DataBundle, lead: GameEvent[] = []): FlowOut {
  const events: GameEvent[] = [...lead, { type: 'TurnStarted', round: state.round, turn: state.turn, player: state.activePlayer }]
  const st = startOfTurn({ ...state, window: 'turn.start' }); events.push(...st.events)
  const m = runMaintenance(st.state, bundle); events.push(...m.events)
  if (m.ended) return gameOver(m.state, events)
  // out-of-activation Maintenance effects (Avenging Force), then Control
  return runAvengingForce(m.state, bundle, events, (s, ev) => enterControl(s, bundle, ev))
}

/** R4.4-R4.8: run Control up to its first decision, or straight on to the Activation Phase. */
export function enterControl(state: GameState, bundle: DataBundle, lead: GameEvent[] = []): FlowOut {
  const events = [...lead]
  const c = runControl(state, bundle); events.push(...c.events)
  if (c.pending) return { state: c.state, events, pending: c.pending }
  return raiseChooseActivation(c.state, events)
}

/** Decisions raised during the Maintenance Phase (Avenging Force and the attack it makes). */
export const isMaintenanceDecision = (state: GameState): boolean => state.phase === 'maintenance' && state.pending.kind !== 'gameOver'
export function answerMaintenanceDecision(state: GameState, bundle: DataBundle, a: Action): FlowResult {
  const next = (s: GameState, ev: GameEvent[]) => enterControl(s, bundle, ev)
  if (isAvengingDecision(state)) return answerAvengingForce(state, bundle, a, next)
  const r = handleActivationAction(state, bundle, a)
  if (!r) return reject('E_WRONG_DECISION', `${a.type} does not answer a ${state.pending.kind} decision`)
  if ('rejection' in r) return r
  return settleAfterAttack(r.state, bundle, r.events, next)
}

/** After deployment: round 1, the first player's turn (11 R11.5). */
export function startGameplay(state: GameState, bundle: DataBundle, lead: GameEvent[] = []): FlowOut {
  const first = state.firstPlayer ?? 'A'
  const s: GameState = { ...state, round: 1, turn: 1, activePlayer: first, firstPlayer: first }
  return beginTurn(s, bundle, [...lead, { type: 'RoundStarted', round: 1 }])
}

// ---------- control answers ----------
export function isControlDecision(state: GameState): boolean {
  return state.phase === 'control' && (['allocateFocus', 'payUpkeep', 'shake', 'leech', 'adjustFury'].includes(state.pending.kind) || (state.pending.kind === 'placeTroopers' && state.pending.context.data?.code === 'ambush') || (state.pending.kind === 'moveModel' && state.pending.context.data?.code === 'apparition'))
}
/** Apply an allocate / upkeep / shake answer and carry on to the next decision or the Activation Phase. */
export function answerControlDecision(state: GameState, bundle: DataBundle, action: Action): FlowResult {
  const r = answerControl(state, bundle, action)
  if ('rejection' in r) return r
  if (r.pending) return { state: r.state, events: r.events, pending: r.pending }
  return raiseChooseActivation(r.state, r.events)
}

// ---------- end of turn ----------
export function validateEndTurn(state: GameState, a: EndTurnAction): { code: 'E_WRONG_DECISION' | 'E_NOT_AN_OPTION'; message: string } | null {
  if (state.pending.kind !== 'chooseActivation' || state.phase !== 'activation') return { code: 'E_WRONG_DECISION', message: 'not choosing an activation' }
  if (a.player !== state.activePlayer) return { code: 'E_WRONG_DECISION', message: 'not your turn' }
  const left = activatable(state)
  if (left.length > 0) return { code: 'E_NOT_AN_OPTION', message: `${left.length} model(s) or unit(s) must still activate`, }
  return null
}

/** R4.11: score, check victory, then hand the turn over (or end the game after the last turn of round 7). */
export function endTurn(state: GameState, bundle: DataBundle, a: EndTurnAction): FlowResult {
  const bad = validateEndTurn(state, a)
  if (bad) return reject(bad.code, bad.message)
  const def = scenarioDef(bundle, state.scenario.id)
  const events: GameEvent[] = []
  let s = state
  const ex = expireEffects(s, 'turnEnd'); s = ex.state; events.push(...ex.events)
  const sc = endOfTurnScoring(s, bundle); s = sc.state; events.push(...sc.events)
  events.push({ type: 'TurnEnded', round: state.round, turn: state.turn, player: state.activePlayer })
  if (sc.ended) return gameOver(s, events)

  const first = s.firstPlayer ?? 'A'
  if (s.activePlayer === first) {
    s = { ...s, turn: s.turn + 1, activePlayer: otherPlayer(first) }
    return beginTurn(s, bundle, events)
  }
  // the second player just finished: next round
  s = { ...s, window: 'round.end' }
  if (s.round >= def.rounds) throw new Error('round limit should have ended the game in endOfTurnScoring')
  s = { ...s, round: s.round + 1, turn: s.turn + 1, activePlayer: first }
  return beginTurn(s, bundle, [...events, { type: 'RoundStarted', round: s.round }])
}

/** Legal-action sample for the flow-owned decisions (control, chooseActivation/endTurn, gameOver). */
export function flowLegalActions(state: GameState): Action[] {
  if (isControlDecision(state)) return controlLegalActions(state)
  return (state.pending.options ?? []).map((o) => o.action)
}
