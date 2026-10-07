// Frenzy beat overlay (81 G): a red flash, the beast and its target named, the target ringed on the board while the beat
// plays (the board draws a hover ring), and a warning when the target is a friend. The camera cut and the charge line are
// board work; this is the HUD half. Reads the Frenzied event of the playing beat from the feed.
import { useEffect, useMemo } from 'react'
import { modelName, uiActions, useCurrentBeat, useEventFeed, usePresentedState } from '../../contract'
import './fury.css'

export function FrenzyFlash() {
  const beat = useCurrentBeat()
  const feed = useEventFeed()
  const state = usePresentedState()
  const fz = useMemo(() => {
    if (!beat || beat.kind !== 'frenzy') return null
    for (let i = feed.length - 1; i >= 0; i--) {
      const e = feed[i]!
      if (e.seq < beat.firstSeq) break
      if (e.seq <= beat.lastSeq && e.event.type === 'Frenzied') return e.event
    }
    return null
  }, [beat, feed])
  const beastId = fz?.beastId
  const targetId = fz?.targetId ?? null
  const beatId = beat?.id
  useEffect(() => {
    if (!beastId) return
    uiActions.select(beastId)
    if (targetId) uiActions.hover(targetId)
    return () => { if (targetId) uiActions.hover(null) }
  }, [beatId, beastId, targetId])
  if (!fz || !state) return null
  const friendly = !!targetId && state.models[targetId]?.owner === state.models[fz.beastId]?.owner
  const why = fz.reason === 'noTarget' ? 'nothing in sight to hit' : fz.reason === 'cannotCharge' ? 'it cannot charge' : fz.reason === 'cannotActivate' ? 'it cannot act right now' : ''
  return (
    <div className="frenzy-flash" data-testid="frenzy-flash" data-friendly={friendly ? 'true' : 'false'} role="status" style={{ animationDuration: `${beat?.durationMs ?? 1000}ms` }}>
      <div className={`frenzy-card${friendly ? ' frenzy-friendly' : ''}`}>
        <b data-testid="frenzy-beast">{modelName(state, fz.beastId)}</b> loses its temper
        {targetId ? <>: the closest model is <b data-testid="frenzy-target">{modelName(state, targetId)}</b>{friendly ? ', one of yours' : ''}.</> : <>, but {why}.</>}
        {fz.tiedIds.length > 1 && <div className="hud-dim">Tied for closest, picked at random.</div>}
      </div>
    </div>
  )
}
