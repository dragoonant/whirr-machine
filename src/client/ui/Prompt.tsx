import { useEffect, useMemo } from 'react'
import { game, uiActions, usePresentedState, usePrompt, usePromptLegal, useWaitingFor } from '../contract'
import './hud.css'
import { AllocateForm, BoardForm, ShakeForm, UpkeepForm } from './PromptForms'
import { buildPromptView, isLegal, optionTestId, type PromptView } from './promptView'

const typing = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

/** Bottom-centre decision dock: says who, what and the exact odds, then offers the legal answers. Enter = default, Esc = pass. */
export function PromptDock() {
  const pd = usePrompt()
  const legal = usePromptLegal()
  const state = usePresentedState()
  const waiting = useWaitingFor()
  const view: PromptView | null = useMemo(() => (pd && state ? buildPromptView(state, pd, legal) : null), [pd, state, legal])

  useEffect(() => {
    if (!view || !pd) return
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'Enter' && view.defaultId) {
        const o = view.options.find((x) => x.id === view.defaultId)
        if (o && isLegal(legal, o.action)) { e.preventDefault(); game.dispatch(o.action) }
      } else if (e.key === 'Escape' && view.canPass) { e.preventDefault(); game.pass() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, pd, legal])

  if (!pd || !state || !view) {
    if (waiting && waiting.controller === 'bot') {
      return <div className="hud-dock hud-dock-wait" data-testid="prompt-waiting" role="status">Opponent is deciding…</div>
    }
    return null
  }
  if (pd.kind === 'gameOver') return null
  const hasButtons = view.options.length > 0
  return (
    <section className={`hud-dock hud-card prompt prompt-${view.form}`} data-testid={view.testid} data-decision={pd.id} aria-live="polite">
      <h2 className="prompt-title" data-testid="prompt-title">{view.title}</h2>
      {view.lines.map((l, i) => <p key={i} className="prompt-line">{l}</p>)}
      {view.form === 'upkeep' && <UpkeepForm key={pd.id} state={state} pd={pd} />}
      {view.form === 'shake' && <ShakeForm key={pd.id} state={state} pd={pd} />}
      {view.form === 'allocate' && <AllocateForm key={pd.id} state={state} pd={pd} view={view} />}
      {view.form === 'board' && <BoardForm key={pd.id} state={state} pd={pd} />}
      {view.form === 'panel' && <p className="prompt-line">Pick from the activation panel on the left (it lists every legal choice).</p>}
      {hasButtons && view.form === 'buttons' && (
        <div className="pbtns pbtns-wrap">
          {view.options.map((o) => (
            <button
              key={o.id} type="button" disabled={!isLegal(legal, o.action)}
              className={`hud-btn ${o.tone === 'primary' ? 'hud-btn-primary' : o.tone === 'decline' ? 'hud-btn-quiet' : ''}${o.id === view.defaultId ? ' hud-btn-default' : ''}`}
              data-testid={optionTestId(view.kind, o)}
              onClick={() => game.dispatch(o.action)}
              onMouseEnter={() => o.hoverId && uiActions.hover(o.hoverId)} onMouseLeave={() => o.hoverId && uiActions.hover(null)}
              onFocus={() => o.hoverId && uiActions.hover(o.hoverId)} onBlur={() => o.hoverId && uiActions.hover(null)}
            >
              <span className="btn-label">{o.label}</span>
              {o.cost && <span className="btn-cost">{o.cost}</span>}
              {o.note && <span className="btn-note">{o.note}</span>}
            </button>
          ))}
        </div>
      )}
      {view.canPass && (
        <div className="pbtns">
          <button type="button" className="hud-btn hud-btn-quiet" data-testid="prompt-pass" onClick={() => game.pass()}>{view.passLabel} <kbd>Esc</kbd></button>
        </div>
      )}
      {view.defaultId && <div className="hud-dim prompt-hint">Enter picks the highlighted answer.</div>}
    </section>
  )
}
