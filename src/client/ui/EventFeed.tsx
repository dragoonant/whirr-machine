import { useEffect, useMemo, useRef } from 'react'
import { useEventFeed, usePresentedState } from '../contract'
import './hud.css'
import { buildFeed } from './feedView'

/** Rolling log of what just happened, with attack breakdowns (what was needed, the odds, the damage maths). */
export function EventFeed() {
  const feed = useEventFeed()
  const state = usePresentedState()
  const lines = useMemo(() => buildFeed(state, feed).slice(-120), [state, feed])
  const end = useRef<HTMLLIElement | null>(null)
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }) }, [lines.length])
  return (
    <section className="hud-card feed" data-testid="feed" aria-label="Event feed">
      <h3 className="hud-h">What happened</h3>
      <ol className="feed-list">
        {lines.length === 0 && <li className="hud-dim">Nothing yet.</li>}
        {lines.map((l) => (
          <li key={l.seq + l.text} className={`feed-row feed-${l.tone}`} data-testid={`feed-row-${l.seq}`}>
            <span className="feed-text">{l.text}</span>
            {l.detail.length > 0 && <ul className="feed-detail">{l.detail.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>
    </section>
  )
}
