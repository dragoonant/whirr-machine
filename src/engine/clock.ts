// M13 (91 C.2): the game clock's engine side. The clock itself (time, pausing, the chips) is client code (src/client/clock/*);
// the engine only resolves the expiry, so a replay or a load reproduces it from the action log with no clock running.
//   resolveClockExpired   the `clockExpired` action (CLK5 own turn, CLK6 the opponent's turn)
//   clockOutDefault       the default answer for a decision a clocked-out player owes
//   settleClockOut        answers such decisions on the spot (step() calls it after every flow result while a player is clocked out)
//   clockOutAtTurnEnd     the end-of-turn verdict for a player who ran out on the opponent's turn (turnflow.ts calls it)
import type { Action, ClockExpiredAction } from './actions'
import { otherPlayer } from './effects'
import type { GameEvent } from './events'
import { handleActivationAction } from './phases/activation'
import { raiseGameOver, reject, type FlowOut, type FlowResult } from './pending'
import { afterDeaths, computeControl, scenarioDef, scoringActive } from './scenario'
import { answerSetup, isSetupDecision } from './setup'
import { answerControlDecision, answerMaintenanceDecision, endTurn, isControlDecision, isMaintenanceDecision } from './turnflow'
import { scoreOpponentAlone } from './scenario-rules'
import type { DataBundle, GameEndReason, GameState, Id, PlayerId } from './types'

type RawRecord = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------- ending the game ----------
function gameOverOut(state: GameState, events: GameEvent[]): FlowOut {
  const r = raiseGameOver(state)
  return { state: r.state, events, pending: r.pending }
}

/** Same shape as scenario.ts `endGame`, plus `result.timeout` (91 B.2): the player whose clock ran out. */
function endByClock(state: GameState, events: GameEvent[], winner: PlayerId, reason: GameEndReason, timedOut: PlayerId): FlowOut {
  const next: GameState = {
    ...state, phase: 'ended', window: 'game.end', activation: null, attack: null,
    scenario: { ...state.scenario, result: { winner, reason, timeout: timedOut } },
  }
  return gameOverOut(next, [...events, { type: 'GameEnded', winner, reason, vp: { ...state.scenario.vp } }])
}

/** CLK5: the timed-out player's Leader is destroyed (cause `timeout`), then the normal assassination ending runs (V1.1). */
function destroyLeaderAndEnd(state: GameState, b: DataBundle, events: GameEvent[], timedOut: PlayerId): FlowOut {
  const winner = otherPlayer(timedOut)
  const leaderId = state.players[timedOut].leaderId
  const leader = state.models[leaderId]
  let s = state
  const ev = [...events]
  if (leader && leader.life !== 'destroyed') {
    ev.push({ type: 'LifeStateChanged', modelId: leaderId, from: leader.life, to: 'destroyed', cause: 'timeout' })
    ev.push({ type: 'ModelRemoved', modelId: leaderId, reason: 'destroyed' })
    // deathHandled: no soul or other death-window reward for a model the clock destroyed
    s = { ...s, models: { ...s.models, [leaderId]: { ...leader, life: 'destroyed', deathHandled: true } } }
  }
  const d = afterDeaths(s, b)
  ev.push(...d.events)
  if (d.ended && d.state.scenario.result?.reason === 'assassination' && d.state.scenario.result.winner === winner) {
    const done: GameState = { ...d.state, scenario: { ...d.state.scenario, result: { ...d.state.scenario.result, timeout: timedOut } } }
    return gameOverOut(done, ev)
  }
  // afterDeaths could not call it an assassination (the opponent's Leader is gone too): the clock still decides
  return endByClock(d.state, ev.filter((e) => e.type !== 'GameEnded'), winner, 'assassination', timedOut)
}

// ---------- scoring the opponent alone (CLK5) ----------
const usesRulesVocabulary = (b: DataBundle, scenarioId: Id): boolean => {
  const rules = ((b.byId[scenarioId] ?? {}) as RawRecord).scoring?.rules
  return Array.isArray(rules) && rules.length > 0
}

/**
 * The opponent scores at once with the scenario's normal rules, alone: no Kill Box, no lead-by-3, nothing for the timed-out player.
 * Scenarios with a `scoring.rules` list go through WP3's `scoreOpponentAlone`; the plain per-element `vp.control` scenarios (QS, Skirmish)
 * are scored here from `computeControl`, so they never depend on the Steamroller scoring machine.
 */
function scoreAlone(state: GameState, b: DataBundle, scorer: PlayerId): { state: GameState; events: GameEvent[] } {
  if (usesRulesVocabulary(b, state.scenario.id)) return scoreOpponentAlone(state, b, scorer)
  const def = scenarioDef(b, state.scenario.id)
  const control = computeControl(state, def)
  const events: GameEvent[] = [{ type: 'ControlChecked', elements: control }]
  const sources = def.elements.flatMap((el) => (control[el.id]?.controller === scorer && el.vp.control > 0 ? [{ elementId: el.id, reason: `controls ${el.id}`, vp: el.vp.control }] : []))
  const delta = sources.reduce((a, g) => a + g.vp, 0)
  let scenario = { ...state.scenario, elements: control }
  if (delta > 0) {
    const vp = { ...scenario.vp, [scorer]: scenario.vp[scorer] + delta }
    scenario = { ...scenario, vp, log: [...scenario.log, ...sources.map((g) => ({ round: state.round, turn: state.turn, player: scorer, vp: g.vp, source: g.reason }))] }
    events.push({ type: 'ScenarioScored', player: scorer, delta, vp: { ...vp }, sources })
  }
  return { state: { ...state, scenario }, events }
}

const inPlay = (s: GameState): boolean => s.phase === 'maintenance' || s.phase === 'control' || s.phase === 'activation'

// ---------- the expiry ----------
/**
 * Apply `clockExpired` (91 C.2, SR CLK5 and CLK6). Accepted at any open decision but gameOver, whoever owns it; `a.decisionId` must match.
 * - timed-out player is the active player, or is deploying: emit `ClockExpired`, score the opponent alone when scoring is active this turn
 *   (normal scenario rules, no Kill Box, no lead-by-3); more VP than the timed-out player = `scenario` win, else the timed-out Leader is
 *   destroyed (`LifeStateChanged` → `ModelRemoved`, cause `timeout`) and the opponent wins by `assassination`. Sets `ScenarioState.result.timeout`.
 * - otherwise: set `ScenarioState.clockOut`; the end of the active player's turn runs `clockOutAtTurnEnd`. A decision the player owns right now
 *   is answered at once with its default (RULING: decisions owed by a timed-out player).
 */
export function resolveClockExpired(state: GameState, b: DataBundle, a: ClockExpiredAction): FlowResult {
  const timedOut = a.timedOut
  if (timedOut !== 'A' && timedOut !== 'B') return reject('E_BAD_PAYLOAD', `clockExpired needs timedOut A or B, got ${String(timedOut)}`)
  if (state.scenario.clockOut === timedOut) return reject('E_ALREADY_USED', `player ${timedOut}'s clock already ran out`)
  const opponent = otherPlayer(timedOut)
  const events: GameEvent[] = [{ type: 'ClockExpired', player: timedOut, active: state.activePlayer }]

  const ownTurn = timedOut === state.activePlayer || state.phase === 'setup' || state.phase === 'deploy'
  if (!ownTurn) {
    const marked: GameState = { ...state, scenario: { ...state.scenario, clockOut: timedOut } }
    return settleClockOut({ state: marked, events, pending: marked.pending }, b)
  }

  let s = state
  // CLK5: the opponent may at once score scenario elements, but only on a turn that would score
  if (inPlay(s) && scoringActive(s, scenarioDef(b, s.scenario.id))) {
    const sc = scoreAlone(s, b, opponent)
    s = sc.state
    events.push(...sc.events)
  }
  if (s.scenario.vp[opponent] > s.scenario.vp[timedOut]) return endByClock(s, events, opponent, 'scenario', timedOut)
  return destroyLeaderAndEnd(s, b, events, timedOut)
}

/** True while a player's clock has run out on the opponent's turn: every decision they own is then answered by `clockOutDefault` (RULING: decisions owed by a timed-out player). */
export function isClockedOut(state: GameState, player?: PlayerId): boolean {
  const c = state.scenario.clockOut
  return c !== undefined && (player === undefined || c === player)
}

// ---------- defaults for a clocked-out player ----------
/** The refusal of each reaction decision: no boost, no reroll, no spend, keep the damage, no reaver, no change to fury. */
function isRefusal(a: Action): boolean {
  switch (a.type) {
    case 'boostAttack': case 'boostDamage': return !a.boost
    case 'reroll': return !a.reroll
    case 'rollAnyway': return a.roll
    case 'powerField': return a.spend === 0
    case 'transferDamage': return a.toId === null
    case 'reave': return a.reaverId === null
    case 'adjustFury': return a.delta === 0
    case 'pass': return true
    default: return false
  }
}
const REFUSAL_IDS = ['pass', 'skip', 'none', 'keep', 'no', 'decline', 'stay', 'noBoost', 'hold']

/**
 * The default answer (pass, no, keep, no reroll, the first listed placement) to an open decision owned by the clocked-out player, or null
 * when the decision is not theirs, the game is over, or nothing sensible exists. The caller emits `DecisionAutoResolved`.
 */
export function clockOutDefault(state: GameState, b: DataBundle): Action | null {
  void b
  const pd = state.pending
  const out = state.scenario.clockOut
  if (out === undefined || pd.kind === 'gameOver' || state.phase === 'ended' || pd.player !== out) return null
  const options = pd.options ?? []
  const refusal = options.find((o) => isRefusal(o.action))
  if (refusal) return refusal.action
  if (pd.canPass) return { type: 'pass', decisionId: pd.id, player: pd.player }
  const named = options.find((o) => REFUSAL_IDS.includes(o.id))
  if (named) return named.action
  return options[0]?.action ?? null
}

const sameAction = (x: Action, y: Action): boolean => JSON.stringify(x) === JSON.stringify(y)

/** The reducer's own routing (index.ts `dispatch`) minus the actions that never answer for a clocked-out player. */
function applyDefault(state: GameState, b: DataBundle, a: Action): FlowResult {
  if (isSetupDecision(state)) return answerSetup(state, b, a)
  if (isControlDecision(state)) return answerControlDecision(state, b, a)
  if (isMaintenanceDecision(state)) return answerMaintenanceDecision(state, b, a)
  if (state.pending.kind === 'chooseActivation' && a.type === 'endTurn') return endTurn(state, b, a)
  const r = handleActivationAction(state, b, a)
  return r ?? reject('E_WRONG_DECISION', `${a.type} does not answer a ${state.pending.kind} decision`)
}

/**
 * While a player is clocked out, answer every decision they own with its default (emitting `DecisionAutoResolved`) until the open decision is
 * someone else's, the game ends, or no default exists. Pure; the answers are not logged (a replay of the log reaches the same state because
 * `step` calls this after each action). Returns the input untouched when nobody is clocked out.
 */
export function settleClockOut(result: FlowOut, b: DataBundle): FlowOut {
  let { state, events } = result
  // the clocked-out player's own turn is never played for them: that case ended the game at the expiry
  for (let i = 0; i < 200 && isClockedOut(state) && state.activePlayer !== state.scenario.clockOut && state.pending.kind !== 'gameOver' && state.phase !== 'ended'; i++) {
    const a = clockOutDefault(state, b)
    if (!a) break
    const pd = state.pending
    const r = applyDefault(state, b, a)
    if ('rejection' in r) break
    const opt = (pd.options ?? []).find((o) => sameAction(o.action, a))
    events = [...events, { type: 'DecisionAutoResolved', kind: pd.kind, optionId: opt?.id ?? a.type }, ...r.events]
    state = r.state
  }
  return state === result.state ? result : { state, events, pending: state.pending }
}

// ---------- the end of the turn ----------
/**
 * End of the active player's turn, after normal scoring and the lead-by-3 check, with `ScenarioState.clockOut` set and the game not ended:
 * active VP above the clocked-out player's = `scenario` win, else the clocked-out Leader is destroyed and the opponent wins by `assassination`.
 * Returns null when `clockOut` is unset, the game has already ended, or the clocked-out player is the active one (the own-turn case ended the game
 * at the expiry). Callers (turnflow.ts, WP3) check `isClockedOut` first.
 */
export function clockOutAtTurnEnd(state: GameState, b: DataBundle): FlowResult | null {
  const out = state.scenario.clockOut
  if (out === undefined || state.phase === 'ended' || state.pending.kind === 'gameOver') return null
  const active = state.activePlayer
  if (out === active) return null
  if (state.scenario.vp[active] > state.scenario.vp[out]) return endByClock(state, [], active, 'scenario', out)
  return destroyLeaderAndEnd(state, b, [], out)
}
