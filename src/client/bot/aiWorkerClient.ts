// Main-thread side of the AI worker (40-ai §10): one module worker, one request in flight per decision, a 2 s timeout.
// Returns null (caller falls back) when workers are unavailable (tests, old browsers) or the worker fails or times out.
import type { Action, GameState } from '../../engine/index'
import type { AiTierId } from '../../ai/tiers'
import type { WorkerRequest, WorkerResponse } from '../../ai/worker'

export const AI_TIMEOUT_MS = 2000

export interface AiWorkerClient {
  decide(state: GameState, legal: Action[], seed: string, tier: AiTierId, brainKey: string): Promise<Action | null>
  dispose(): void
}

export function createAiWorkerClient(timeoutMs = AI_TIMEOUT_MS): AiWorkerClient | null {
  if (typeof Worker === 'undefined') return null
  let worker: Worker
  try {
    worker = new Worker(new URL('../../ai/worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
  let seq = 0
  let broken = false
  const waiting = new Map<number, (a: Action | null) => void>()
  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const m = ev.data
    if (m.type === 'ready') return
    const done = waiting.get(m.id)
    if (!done) return
    waiting.delete(m.id)
    if (m.type === 'action') done(m.action)
    else { console.warn('[ai worker]', m.message); done(null) }
  }
  worker.onerror = (e) => {
    console.warn('[ai worker] failed; using the main thread', e.message)
    broken = true
    for (const done of waiting.values()) done(null)
    waiting.clear()
  }
  worker.postMessage({ type: 'init' } satisfies WorkerRequest)
  return {
    decide(state, legal, seed, tier, brainKey) {
      if (broken) return Promise.resolve(null)
      const id = ++seq
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (waiting.delete(id)) { console.warn(`[ai worker] decision ${state.pending.id} timed out after ${timeoutMs} ms`); resolve(null) }
        }, timeoutMs)
        waiting.set(id, (a) => { clearTimeout(timer); resolve(a) })
        try {
          worker.postMessage({ type: 'decide', id, state, legal, seed, tier, brainKey } satisfies WorkerRequest)
        } catch {
          waiting.delete(id); clearTimeout(timer); resolve(null)
        }
      })
    },
    dispose() { worker.terminate(); broken = true; for (const d of waiting.values()) d(null); waiting.clear() },
  }
}
