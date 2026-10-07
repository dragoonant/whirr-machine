import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameState, ModelState } from '../../engine/index'
import { game, modelName, uiActions, usePresentedState, usePrompt, usePromptLegal, useSelectedId } from '../contract'
import './hud.css'
import { groupActions, type ActionGroups, type Button } from './activationView'
import { niceName } from './format'
import { StatRow, WeaponList, Conditions } from './ModelBits'
import { BattlegroupStrip, ResourcePips } from './fury/FuryPips'
import { kindWord } from './fury/furyView'

/** Hover delay before a button's explanation pops up. */
const TIP_DELAY_MS = 300

/** Explains what a button does after the pointer rests on it; fixed-positioned so the panel's scroll never clips it. */
function useDelayedTip(tip: string | undefined) {
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const clear = () => { window.clearTimeout(timer.current); setAt(null) }
  const arm = () => {
    if (!tip) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect()
      if (r) setAt({ x: Math.min(r.right + 8, window.innerWidth - 300), y: r.top })
    }, TIP_DELAY_MS)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // an overlay (guide, menu) can cover the button without a mouseleave: any click, key or scroll hides the tip
  useEffect(() => {
    if (!at) return
    const hide = () => setAt(null)
    window.addEventListener('pointerdown', hide, true); window.addEventListener('keydown', hide, true); window.addEventListener('wheel', hide, true)
    return () => { window.removeEventListener('pointerdown', hide, true); window.removeEventListener('keydown', hide, true); window.removeEventListener('wheel', hide, true) }
  }, [at])
  const el = tip && at
    ? createPortal(<div className="btn-tip" role="tooltip" data-testid="btn-tip" style={{ left: at.x, top: at.y }}>{tip}</div>, document.body)
    : null
  return { ref, arm, clear, el }
}

function Btn({ b }: { b: Button }) {
  const t = useDelayedTip(b.tip)
  return (
    <>
      <button
        ref={t.ref} type="button" className={`hud-btn ${b.tone === 'primary' ? 'hud-btn-primary' : b.tone === 'decline' ? 'hud-btn-quiet' : ''}`}
        data-testid={b.testid} disabled={!b.enabled} onClick={() => { t.clear(); game.dispatch(b.action) }}
        onMouseEnter={() => { t.arm(); if (b.hoverId) uiActions.hover(b.hoverId) }} onMouseLeave={() => { t.clear(); if (b.hoverId) uiActions.hover(null) }}
        onFocus={() => b.hoverId && uiActions.hover(b.hoverId)} onBlur={() => { t.clear(); if (b.hoverId) uiActions.hover(null) }}
      >
        <span className="btn-label">{b.label}</span>
        {b.cost && <span className={`btn-cost${b.forced ? ' btn-forced' : ''}`}>{b.cost}</span>}
        {b.note && <span className="btn-note">{b.note}</span>}
      </button>
      {t.el}
    </>
  )
}

function Section({ title, testid, children }: { title: string; testid: string; children: React.ReactNode }) {
  return <section className="act-sec" data-testid={testid}><h4 className="hud-h2">{title}</h4>{children}</section>
}

function Actions({ g }: { g: ActionGroups }) {
  return (
    <>
      {g.movement.length > 0 && <Section title="Normal Movement" testid="act-movement"><div className="pbtns pbtns-wrap">{g.movement.map((b) => <Btn key={b.id} b={b} />)}</div></Section>}
      {g.combat.length > 0 && <Section title="Combat Action" testid="act-combat"><div className="pbtns pbtns-wrap">{g.combat.map((b) => <Btn key={b.id} b={b} />)}</div></Section>}
      {(g.attacks.length > 0 || g.endAttacks) && (
        <Section title="Attacks" testid="act-attacks">
          {g.attacks.length === 0 && <p className="hud-dim" data-testid="act-no-targets">No enemy is in range and line of sight for another attack. End the activation.</p>}
          <ul className="attack-list">
            {g.attacks.map((a) => (
              <li key={a.id}>
                <Btn b={a} />
                {a.detail.length > 0 && <div className="hud-dim attack-detail">{a.detail.join(' · ')}</div>}
              </li>
            ))}
          </ul>
          {g.endAttacks && <div className="pbtns"><Btn b={g.endAttacks} /></div>}
        </Section>
      )}
    </>
  )
}

/** Warlock and warbeast options: rile, shed, heal, take control, animi. Costs in fury; a forced cost is fury the beast gains. */
function FuryActions({ g }: { g: ActionGroups }) {
  if (!g.fury.length && !g.forceNote) return null
  return (
    <Section title="Fury and warbeasts" testid="act-fury">
      {g.forceNote && <p className="hud-dim" data-testid="act-force-note">{g.forceNote}</p>}
      <div className="pbtns pbtns-wrap">{g.fury.map((b) => <Btn key={b.id} b={b} />)}</div>
    </Section>
  )
}

function Spells({ g }: { g: ActionGroups }) {
  if (!g.spells.length && !g.feat && !g.featSpent) return null
  return (
    <Section title="Spells and feat" testid="act-spells">
      {g.spells.map((s) => (
        <div key={s.spellId} className={`spell${s.casts.length ? '' : ' spell-off'}`} data-testid={`act-spell-${s.spellId}`}>
          <div className="spell-head"><b>{s.name}</b> <span className="spell-cost">{s.cost} {s.unit}</span>{s.reach && <span className="hud-dim">{` · range ${s.reach}`}</span>}</div>
          {s.text && <p className="spell-text">{s.text}</p>}
          <div className="pbtns pbtns-wrap">{s.casts.map((c) => <Btn key={c.id} b={{ ...c, cost: c.cost ?? `${s.cost} ${s.unit}` }} />)}</div>
        </div>
      ))}
      {g.feat && <div className="pbtns"><Btn b={g.feat} /></div>}
      {!g.feat && g.featSpent && <p className="hud-dim" data-testid="act-feat-spent">Feat already used this game.</p>}
    </Section>
  )
}

function Body({ state, model, g }: { state: GameState; model: ModelState; g: ActionGroups }) {
  return (
    <>
      <header className="card-head">
        <h3 className="hud-h card-name">{modelName(state, model.id)}</h3>
        <span className="hud-dim">{kindWord(model)}{model.activated ? ' — activated' : ''}{model.life !== 'active' ? ` — ${model.life}` : ''}</span>
        <ResourcePips state={state} model={model} />
      </header>
      <StatRow state={state} model={model} />
      <BattlegroupStrip state={state} model={model} />
      <Conditions state={state} model={model} />
      <Actions g={g} />
      <FuryActions g={g} />
      <Spells g={g} />
      <Section title="Weapons" testid="act-weapons"><WeaponList state={state} model={model} /></Section>
    </>
  )
}

/** Left rail: the selected model's stats, weapons and every legal choice the open decision offers it. */
export function ActivationPanel() {
  const state = usePresentedState()
  const pd = usePrompt()
  const legal = usePromptLegal()
  const sel = useSelectedId()
  const subjectId = useMemo(() => (state && sel ? (state.models[sel] ? sel : state.units[sel]?.troopers[0]) : undefined), [state, sel])
  const g = useMemo(() => (state ? groupActions(state, pd, legal, subjectId) : null), [state, pd, legal, subjectId])
  if (!state) return null
  const model = subjectId ? state.models[subjectId] : undefined
  const deciding = pd?.context.modelId
  const boardKind = !!pd && ['deploy', 'advanceDeploy', 'placeTroopers', 'allocateFocus', 'abilityChoice'].includes(pd.kind)
  const elsewhere = deciding && deciding !== subjectId && !boardKind ? state.models[deciding] : undefined
  return (
    <aside className="hud-card act" data-testid="act-panel" aria-label="Activation panel">
      {elsewhere && (
        <button type="button" className="hud-btn hud-btn-primary act-jump" data-testid="act-jump" onClick={() => uiActions.select(elsewhere.id)}>
          Decision is for {modelName(state, elsewhere.id)}: select
        </button>
      )}
      {model && g ? <Body state={state} model={model} g={g} /> : <p className="hud-dim" data-testid="act-empty">Click a model to see its stats and actions.</p>}
      {g?.endTurn && <div className="pbtns"><Btn b={g.endTurn} /></div>}
    </aside>
  )
}
