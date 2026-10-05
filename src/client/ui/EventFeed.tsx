import { useEffect, useMemo, useRef } from 'react'
import { useEventFeed, usePresentedState } from '../contract'
import './hud.css'
import { buildFeed, expectedDamageFor } from './feedView'

/** Rolling log of what just happened, with attack breakdowns (dice, boosts, crits, target number, expected vs actual damage). */
export function EventFeed() {
  const feed = useEventFeed()
  const state = usePresentedState()
  const expected = useRef(new Map<number, number>())
  const lines = useMemo(() => {
    const map = expected.current
    const last = feed[feed.length - 1]?.seq ?? 0
    if (map.size > 0 && last < Math.max(...map.keys())) map.clear() // a new game restarted the numbering
    for (const { seq, event } of feed) {
      if (event.type !== 'AttackDeclared' || map.has(seq)) continue
      const e = expectedDamageFor(state, event)
      if (e !== null) map.set(seq, e)
    }
    return buildFeed(state, feed, map).slice(-120)
  }, [state, feed])
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
