// AI Web Worker entry (40-ai §10). The engine and data chunk load inside the worker once; the main thread posts the
// state and the legal answers and gets an action back, so a slow decision never blocks rendering.
// Messages: init {tier?} -> ready; decide {id, state, legal, seed, tier, brainKey} -> action {id, action, ms} | error {id, message}.
import type { Action, GameState } from '../engine/index'
import { decideSync, newBrain, type Brain } from './decider'
import type { AiTierId } from './tiers'

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'decide'; id: number; state: GameState; legal: Action[]; seed: string; tier: AiTierId; brainKey: string }
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'action'; id: number; action: Action; ms: number }
  | { type: 'error'; id: number; message: string }

const brains = new Map<string, Brain>()
const scope = self as unknown as { onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null; postMessage(m: WorkerResponse): void }

scope.onmessage = (ev) => {
  const msg = ev.data
  if (msg.type === 'init') { scope.postMessage({ type: 'ready' }); return }
  if (msg.type !== 'decide') return
  const t0 = performance.now()
  try {
    let brain = brains.get(msg.brainKey)
    if (!brain) { if (brains.size > 8) brains.clear(); brain = newBrain(); brains.set(msg.brainKey, brain) }
    if (brain.plans.size > 400) brain.plans.clear()
    const action = decideSync(msg.state, msg.state.pending, msg.legal, { tier: msg.tier, seed: msg.seed, brain })
    scope.postMessage({ type: 'action', id: msg.id, action, ms: performance.now() - t0 })
  } catch (e) {
    scope.postMessage({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) })
  }
}
