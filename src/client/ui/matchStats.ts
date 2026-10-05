// Running match totals for the end screen. Counted from the presented event stream as it arrives (the feed is a ring of
// 500, too short to total a long game afterwards). Damage numbers are the engine's DamageApplied.points.
import type { PlayerId } from '../../engine/index'
import { usePresentedStore } from '../presentation/presentedStore'

export interface MatchStats {
  /** Damage points each side has dealt (the target's owner is the other side). */
  dealt: Record<PlayerId, number>
  /** Models each side has lost. */
  lost: Record<PlayerId, number>
}

const fresh = (): MatchStats => ({ dealt: { A: 0, B: 0 }, lost: { A: 0, B: 0 } })
let stats: MatchStats = fresh()
let lastSeq = 0
let counted = new Set<string>() // a model counts as lost once, whether it was boxed or destroyed
let seed = ''

export function getMatchStats(): MatchStats { return stats }
export function resetMatchStats(): void { stats = fresh(); lastSeq = 0; seed = ''; counted = new Set() }

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

function sync(): void {
  const { feed, state } = usePresentedStore.getState()
  if (!state) return
  const last = feed[feed.length - 1]?.seq ?? 0
  if (state.seed !== seed || last < lastSeq) { resetMatchStats(); seed = state.seed }
  let next: MatchStats | null = null
  for (const { seq, event: ev } of feed) {
    if (seq <= lastSeq) continue
    if (ev.type === 'DamageApplied' && ev.points > 0) {
      const owner = state.models[ev.targetId]?.owner
      if (owner) { next ??= { dealt: { ...stats.dealt }, lost: { ...stats.lost } }; next.dealt[other(owner)] += ev.points }
    } else if (ev.type === 'LifeStateChanged' && (ev.to === 'destroyed' || ev.to === 'boxed') && !counted.has(ev.modelId)) {
      counted.add(ev.modelId)
      const owner = state.models[ev.modelId]?.owner
      if (owner) { next ??= { dealt: { ...stats.dealt }, lost: { ...stats.lost } }; next.lost[owner] += 1 }
    }
  }
  if (next) stats = next
  lastSeq = Math.max(lastSeq, last)
}

let installed = false
/** Start counting (idempotent). Called when the end-screen module loads. */
export function installMatchStats(): void {
  if (installed) return
  installed = true
  usePresentedStore.subscribe(sync)
}
