// Shared helpers for raising PendingDecisions from the flow modules (setup, phases, turn flow). Pure.
import type { Action } from './actions'
import { transferPreview } from './damage'
import type { GameEvent } from './events'
import { furyOf, leechRoom, leechSources, thresholdInfo, unmarkedBoxes } from './fury'
import type { DataBundle, DecisionOption, GameState, ModelId, PendingDecision, PlayerId, Rejection } from './types'

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

// ---------- M9 fury decisions (81 C.1) ----------
/** Raise a decision whose options need its own id (`d:<n>`) inside their actions. */
export function raiseWith(state: GameState, spec: Omit<PendingDecision, 'id' | 'options'>, build: (id: string) => DecisionOption[]): { state: GameState; pending: PendingDecision } {
  const seq = state.decisionSeq + 1
  const id = `d:${seq}`
  const pending: PendingDecision = { ...spec, id, options: build(id) }
  return { state: { ...state, decisionSeq: seq, pending }, pending }
}

export interface LeechPlans { max: { from: Record<ModelId, number>; self: number }; maxSelf: { from: Record<ModelId, number>; self: number } | null; none: { from: Record<ModelId, number>; self: number } }
/** The three sample plans (81 C.1): drain the beasts that are likeliest to frenzy first; optionally self-leech up to ARC without taking the last box. */
export function leechPlans(state: GameState, b: DataBundle, warlockId: ModelId): LeechPlans {
  const w = state.models[warlockId]!
  let room = leechRoom(state, b, w)
  const from: Record<ModelId, number> = {}
  const order = leechSources(state, b, w)
    .map((m) => ({ m, p: thresholdInfo(state, b, m.id).pFrenzy }))
    .sort((x, y) => y.p - x.p || x.m.id.localeCompare(y.m.id))
  for (const { m } of order) {
    const n = Math.min(furyOf(m), room)
    if (n > 0) { from[m.id] = n; room -= n }
  }
  const self = Math.min(room, Math.max(0, unmarkedBoxes(w.damage) - 1))
  return { max: { from, self: 0 }, maxSelf: self > 0 ? { from, self } : null, none: { from: {}, self: 0 } }
}
export const leechNeeded = (state: GameState, b: DataBundle, warlockId: ModelId): boolean => {
  const w = state.models[warlockId]!
  return leechRoom(state, b, w) > 0 && (leechSources(state, b, w).length > 0 || unmarkedBoxes(w.damage) > 1)
}
export function raiseLeech(state: GameState, b: DataBundle, warlockId: ModelId): { state: GameState; pending: PendingDecision } {
  const w = state.models[warlockId]!
  const plans = leechPlans(state, b, warlockId)
  const sources = leechSources(state, b, w).map((m) => ({ beastId: m.id, fury: furyOf(m), pFrenzyNow: thresholdInfo(state, b, m.id).pFrenzy }))
  return raiseWith(state, {
    player: w.owner, kind: 'leech', window: 'control.leech', canPass: false,
    context: { modelId: warlockId, data: { room: leechRoom(state, b, w), sources, selfMax: Math.max(0, unmarkedBoxes(w.damage) - 1) } },
  }, (id) => {
    const mk = (optId: string, label: string, plan: { from: Record<ModelId, number>; self: number }): DecisionOption =>
      ({ id: optId, label, action: { type: 'leech', decisionId: id, player: w.owner, warlockId, from: plan.from, self: plan.self } })
    const out = [mk('max', 'Leech (safest)', plans.max)]
    if (plans.maxSelf) out.push(mk('maxSelf', 'Leech, then take fury from yourself', plans.maxSelf))
    out.push(mk('none', 'Leave the fury where it is', plans.none))
    return out
  })
}

export function raiseTransfer(
  state: GameState, b: DataBundle, warlockId: ModelId, points: number, ctx: { attackId?: string; instanceId?: string } = {},
): { state: GameState; pending: PendingDecision } {
  const w = state.models[warlockId]!
  const rows = transferPreview(state, b, warlockId, points).filter((r) => r.eligible)
  return raiseWith({ ...state, window: 'damage.beforeApply' }, {
    player: w.owner, kind: 'transferDamage', window: 'damage.beforeApply', canPass: false,
    context: { modelId: warlockId, attackId: ctx.attackId, data: { points, instanceId: ctx.instanceId, rows } },
  }, (id) => [
    ...rows.map((r): DecisionOption => ({
      id: `to:${r.beastId}`, label: `Move ${r.absorbed} to ${r.beastId}${r.overflow ? `, ${r.overflow} stay` : ''}`, cost: { focus: 0, fury: 1 },
      action: { type: 'transferDamage', decisionId: id, player: w.owner, toId: r.beastId },
    })),
    { id: 'keep', label: `Take ${points}`, action: { type: 'transferDamage', decisionId: id, player: w.owner, toId: null } },
  ])
}

/** FZ7: the owner may take any amount of fury off the beast that just frenzied. */
export function raiseVent(state: GameState, beastId: ModelId): { state: GameState; pending: PendingDecision } {
  const m = state.models[beastId]!
  const f = furyOf(m)
  return raiseWith({ ...state, window: 'activation.end' }, {
    player: m.owner, kind: 'adjustFury', window: 'activation.end', canPass: false, context: { modelId: beastId, data: { fury: f } },
  }, (id) => Array.from({ length: f + 1 }, (_, i): DecisionOption => {
    const k = f - i // fury removed: all first, none last
    return {
      id: k === f ? 'removeAll' : `vent${k}`, label: k === f ? 'Vent all fury' : k === 0 ? 'Keep it all' : `Vent ${k}`,
      action: { type: 'adjustFury', decisionId: id, player: m.owner, modelId: beastId, delta: -k },
    }
  }))
}

export function raiseReave(state: GameState, player: PlayerId, beastId: ModelId, reaverIds: ModelId[], window: 'death.destroyed' | 'death.boxed' = 'death.destroyed'): { state: GameState; pending: PendingDecision } {
  return raiseWith({ ...state, window }, { player, kind: 'reave', window, canPass: false, context: { modelId: beastId } }, (id) => [
    ...reaverIds.map((r): DecisionOption => ({ id: r, label: `Reave with ${r}`, action: { type: 'reave', decisionId: id, player, reaverId: r } })),
    { id: 'none', label: 'Let the fury go', action: { type: 'reave', decisionId: id, player, reaverId: null } },
  ])
}
