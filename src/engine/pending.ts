// Shared helpers for raising PendingDecisions from the flow modules (setup, phases, turn flow). Pure.
import type { Action } from './actions'
import type { GameEvent } from './events'
import type { GameState, PendingDecision, Rejection } from './types'

export interface FlowOut { state: GameState; events: GameEvent[]; pending: PendingDecision }
export type FlowResult = FlowOut | { rejection: Rejection }
export const isFlowRejection = (r: FlowResult): r is { rejection: Rejection } => 'rejection' in r

/** Stamp a fresh decision id (d:<n>) and store it as state.pending. */
export function raise(state: GameState, spec: Omit<PendingDecision, 'id'>): { state: GameState; pending: PendingDecision } {
  const seq = state.decisionSeq + 1
  const pending: PendingDecision = { ...spec, id: `d:${seq}` }
  return { state: { ...state, decisionSeq: seq, pending }, pending }
}

export function raiseGameOver(state: GameState): { state: GameState; pending: PendingDecision } {
  const base = { id: '', player: 'A' as const, kind: 'gameOver' as const, window: 'game.end' as const, context: {}, canPass: false }
  const seq = state.decisionSeq + 1
  const id = `d:${seq}`
  const pending: PendingDecision = { ...base, id, options: [{ id: 'ack', label: 'Game over', action: { type: 'ack', decisionId: id, player: 'A' } as Action }] }
  return { state: { ...state, decisionSeq: seq, pending }, pending }
}

export const reject = (code: Rejection['code'], message: string, detail?: Record<string, unknown>): { rejection: Rejection } => ({ rejection: { code, message, detail } })
