import { useMemo } from 'react'
import { useCurrentBeat, useDiceLog, useEventFeed, usePresentedState, useShownRoll, type ShownRoll } from '../contract'
import '../ui/hud.css'
import { viewRoll, type RollView } from './diceView'
import { useTrayStore } from './trayStore'

/** One roll as dice faces, modifiers, total against its target and a result word. */
export function RollCard({ view, rolling, compact }: { view: RollView; rolling?: boolean; compact?: boolean }) {
  return (
    <div className={`tray-roll tray-${view.verdict.tone}${compact ? ' tray-compact' : ''}${rolling ? ' tray-rolling' : ''}`} data-testid={`tray-roll-${view.rollId}`} data-purpose={view.purpose}>
      <div className="tray-roll-head">
        <span className="tray-label">{view.label}</span>
        {view.boosted && <span className="tray-boost" data-testid={`tray-boost-${view.rollId}`}>boosted</span>}
      </div>
      <div className="tray-dice" aria-label={`dice ${view.dice.map((d) => d.value).join(' ')}`}>
        {view.dice.map((d, i) => (
          <span key={i} className={`tray-die${d.kept ? '' : ' tray-die-dropped'}`} data-value={d.value}>{rolling ? '?' : d.value}</span>
        ))}
        {view.mods.map((m, i) => <span key={`m${i}`} className="tray-mod">{m}</span>)}
      </div>
      {!rolling && (
        <div className="tray-result">
          <span className="tray-total" data-testid={`tray-total-${view.rollId}`}>{view.total}</span>
          {view.target !== null && <span className="tray-target" data-testid={`tray-target-${view.rollId}`}>vs {view.targetWord} {view.target}</span>}
          <span className="tray-verdict" data-testid={`tray-verdict-${view.rollId}`}>{view.verdict.word}</span>
        </div>
      )}
      {!compact && !rolling && (view.added.length > 0 || view.removed.length > 0 || view.rerolls.length > 0) && (
        <ul className="tray-notes">
          {view.added.map((t) => <li key={t}>{t}</li>)}
          {view.removed.map((t) => <li key={t}>{t}</li>)}
          {view.rerolls.map((r, i) => <li key={i}>Re-roll ({r.source}): {r.before.join(' ')} → {r.after.join(' ')}</li>)}
        </ul>
      )}
    </div>
  )
}

/** Right rail, under the dice log: the latest (or pinned) roll large, the two before it small. */
export function DiceTray() {
  const state = usePresentedState()
  const last = useShownRoll()
  const log = useDiceLog()
  const feed = useEventFeed()
  const beat = useCurrentBeat()
  const pinned = useTrayStore((s) => s.pinned)
  const shown: ShownRoll | null = useMemo(() => (pinned ? log.find((r) => r.event.rollId === pinned) ?? last : last), [pinned, log, last])
  const main = useMemo(() => (shown ? viewRoll(shown, state, feed) : null), [shown, state, feed])
  const before = useMemo(() => {
    if (!shown) return []
    const i = log.findIndex((r) => r.seq === shown.seq)
    const prev = i < 0 ? log.slice(-3, -1) : log.slice(Math.max(0, i - 2), i)
    return prev.map((r) => viewRoll(r, state, feed)).reverse()
  }, [shown, log, state, feed])
  const rolling = !!beat && beat.kind === 'dice' && !pinned
  return (
    <section className="hud-card tray" data-testid="tray" aria-label="Dice tray">
      <h3 className="hud-h">Dice tray{pinned ? <span className="tray-pin"> (pinned)</span> : null}</h3>
      {main ? <RollCard view={main} rolling={rolling} /> : <p className="hud-dim" data-testid="tray-empty">No dice rolled yet.</p>}
      {before.length > 0 && <div className="tray-before">{before.map((v) => <RollCard key={v.rollId} view={v} compact />)}</div>}
    </section>
  )
}
