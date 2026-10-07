// Prompt bodies for the fury decisions (81 C.1 and G): leech, transfer damage, vent after a frenzy.
// Buttons answer with the engine's own options; the leech steppers build a plan the engine validates and previews.
import { useMemo, useState } from 'react'
import type { GameState, LeechPlan, ModelId, PendingDecision } from '../../../engine/index'
import { game, uiActions } from '../../contract'
import { boxesLeft, pct } from '../format'
import './fury.css'
import { Flame } from './FuryPips'
import { ASPECT_WORD, leechModel, leechPreviewFor, planTotal, transferModel, ventOdds } from './furyView'

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/** Control Phase, step 2: take fury off beasts (and, if you dare, off yourself) up to the warlock's ARC. */
export function LeechForm({ state, pd }: { state: GameState; pd: PendingDecision }) {
  const lm = useMemo(() => leechModel(state, pd), [state, pd])
  const start = useMemo<LeechPlan>(() => {
    const o = pd.options?.find((x) => x.id === 'max')?.action
    return o && o.type === 'leech' ? { from: { ...o.from }, self: o.self } : { from: {}, self: 0 }
  }, [pd])
  const [plan, setPlan] = useState<LeechPlan>(start)
  if (!lm) return null
  const used = planTotal(plan)
  const left = Math.max(0, lm.room - used)
  const setBeast = (id: ModelId, n: number) => setPlan((p) => ({ ...p, from: { ...p.from, [id]: n } }))
  const clean = (): LeechPlan => ({ from: Object.fromEntries(Object.entries(plan.from).filter(([, n]) => n > 0)), self: plan.self })
  const pv = leechPreviewFor(state, lm.warlockId, clean())
  return (
    <div className="pform leech" data-testid="leech-form">
      <p className="prompt-line hud-dim" data-testid="leech-room">
        Holds {lm.warlockFury}{lm.warlockCap ? ` of ${lm.warlockCap}` : ''} fury; room to take {lm.room} more.
      </p>
      <ul className="prow-list">
        {lm.sources.map((s) => {
          const n = plan.from[s.beastId] ?? 0
          return (
            <li key={s.beastId} className="prow leech-row" data-testid={`leech-row-${s.beastId}`} onMouseEnter={() => uiActions.hover(s.beastId)} onMouseLeave={() => uiActions.hover(null)}>
              <span className="leech-name"><b>{s.name}</b> <span className="hud-dim">holds {s.fury}</span></span>
              <span className="stepper">
                <button type="button" className="hud-btn hud-btn-sq" aria-label={`Take less from ${s.name}`} data-testid={`leech-minus-${s.beastId}`} disabled={n <= 0} onClick={() => setBeast(s.beastId, n - 1)}>−</button>
                <span className="stepper-n" data-testid={`leech-n-${s.beastId}`}>{n}</span>
                <button type="button" className="hud-btn hud-btn-sq" aria-label={`Take more from ${s.name}`} data-testid={`leech-plus-${s.beastId}`} disabled={n >= s.fury || left <= 0} onClick={() => setBeast(s.beastId, n + 1)}>+</button>
              </span>
              <span className={`fury-frenzy ${(pv?.pFrenzyAfter[s.beastId] ?? s.pFrenzyNow) > 0.3 ? 'fury-hot' : (pv?.pFrenzyAfter[s.beastId] ?? s.pFrenzyNow) > 0 ? 'fury-warn' : 'fury-ok'}`} data-testid={`leech-frenzy-${s.beastId}`}>
                frenzy after: {pct(pv?.pFrenzyAfter[s.beastId] ?? s.pFrenzyNow)}
              </span>
            </li>
          )
        })}
        {lm.selfMax > 0 && (
          <li className="prow leech-row leech-self" data-testid="leech-row-self">
            <span className="leech-name"><b>Yourself</b> <span className="hud-dim">1 damage per fury</span></span>
            <span className="stepper">
              <button type="button" className="hud-btn hud-btn-sq" aria-label="Take less from yourself" data-testid="leech-minus-self" disabled={plan.self <= 0} onClick={() => setPlan((p) => ({ ...p, self: p.self - 1 }))}>−</button>
              <span className="stepper-n" data-testid="leech-n-self">{plan.self}</span>
              <button type="button" className="hud-btn hud-btn-sq" aria-label="Take more from yourself" data-testid="leech-plus-self" disabled={plan.self >= lm.selfMax || left <= 0} onClick={() => setPlan((p) => ({ ...p, self: p.self + 1 }))}>+</button>
            </span>
            {plan.self > 0 && <span className="leech-warn" data-testid="leech-self-warning">
              {pv ? `${pv.selfDamage} damage to you that cannot be moved to a warbeast.` : 'Costs you damage that cannot be moved to a warbeast.'}
            </span>}
          </li>
        )}
      </ul>
      <div className="leech-sum" data-testid="leech-sum">
        <span className="fury-flames">{Array.from({ length: Math.max(lm.warlockCap, pv?.after ?? lm.warlockFury) }, (_, i) => <Flame key={i} lit={i < (pv?.after ?? lm.warlockFury)} />)}</span>
        <span>{pv ? `You gain ${pv.gained}, ending at ${pv.after}.` : `Taking ${used}.`}</span>
      </div>
      <div className="pbtns">
        <button type="button" className="hud-btn hud-btn-primary" data-testid="leech-confirm"
          onClick={() => game.answer({ type: 'leech', warlockId: lm.warlockId, from: clean().from, self: plan.self })}>Leech this plan</button>
        {(pd.options ?? []).map((o) => (
          <button key={o.id} type="button" className={`hud-btn${o.id === 'max' ? ' hud-btn-default' : ' hud-btn-quiet'}`} data-testid={`leech-option-${o.id}`} onClick={() => game.dispatch(o.action)}>
            <span className="btn-label">{o.label}</span>
          </button>
        ))}
      </div>
      <div className="hud-dim prompt-hint" data-testid="leech-total">{sum(Object.values(plan.from)) + plan.self} of {lm.room} possible</div>
    </div>
  )
}

/** A hit would land on a warlock holding fury: one card per beast that could take it, with the engine's odds. */
export function TransferForm({ state, pd }: { state: GameState; pd: PendingDecision }) {
  const tm = useMemo(() => transferModel(state, pd, (id) => boxesLeft(state, id)), [state, pd])
  if (!tm) return null
  const keep = pd.options?.find((o) => o.id === 'keep')
  return (
    <div className="pform transfer" data-testid="transfer-form">
      <p className="prompt-line" data-testid="transfer-summary">
        {tm.points} damage is about to land. You have {tm.warlockBoxesLeft} boxes left and {tm.warlockFury} fury; a transfer costs 1 fury.
      </p>
      <div className="xfer-cards">
        {tm.candidates.map((c) => {
          const opt = pd.options?.find((o) => o.id === c.optionId)
          return (
            <button key={c.beastId} type="button" className="hud-btn xfer-card" data-testid={`transfer-to-${c.beastId}`} disabled={!opt}
              onClick={() => opt && game.dispatch(opt.action)} onMouseEnter={() => uiActions.hover(c.beastId)} onMouseLeave={() => uiActions.hover(null)}>
              <span className="btn-label">{c.name}</span>
              <span className="xfer-line" data-testid={`transfer-split-${c.beastId}`}>takes {c.absorbed}{c.overflow > 0 ? `, ${c.overflow} still hit you` : ''}</span>
              <span className="btn-note">fury {c.fury}/{c.cap} · {c.unmarked} boxes free</span>
              {c.pDisabled > 0 && <span className="xfer-risk fury-hot">{pct(c.pDisabled)} to go down</span>}
              {c.cripple.length > 0 && <span className="xfer-risk fury-warn">{c.cripple.map((x) => `${ASPECT_WORD[x.aspect]} crippled ${pct(x.p)}`).join(' · ')}</span>}
              <span className="btn-cost">1 fury</span>
            </button>
          )
        })}
        {keep && (
          <button type="button" className="hud-btn hud-btn-quiet xfer-card" data-testid="transfer-keep" onClick={() => game.dispatch(keep.action)}>
            <span className="btn-label">Keep it</span>
            <span className="btn-note">take all {tm.points} yourself</span>
          </button>
        )}
      </div>
    </div>
  )
}

/** After a frenzy: how much fury does the beast keep? Each answer shows the frenzy chance at its next check. */
export function VentForm({ state, pd }: { state: GameState; pd: PendingDecision }) {
  const beastId = pd.context.modelId
  if (!beastId) return null
  const have = state.models[beastId]?.fury ?? 0
  return (
    <div className="pform vent" data-testid="vent-form">
      <p className="prompt-line hud-dim">It holds {have} fury. Venting it now lowers the chance of another frenzy, but leaves less for your warlock to leech.</p>
      <div className="pbtns pbtns-wrap">
        {(pd.options ?? []).map((o) => {
          const k = o.action.type === 'adjustFury' ? -o.action.delta : 0
          const p = ventOdds(state, beastId, k)
          return (
            <button key={o.id} type="button" className={`hud-btn${k === have ? ' hud-btn-primary' : ''}`} data-testid={`vent-${k}`} onClick={() => game.dispatch(o.action)}>
              <span className="btn-label">{o.label}</span>
              <span className="btn-note">keeps {have - k}{p !== null ? ` · next check ${pct(p)}` : ''}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
