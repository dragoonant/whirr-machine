// Prompt bodies that need more than buttons: upkeep, shake and focus allocation (Control Phase).
import { useState } from 'react'
import { autoPlace, cancelStaged, commitStaged, defaultStraightPath, PLACEMENT_KINDS, placementIds } from '../interaction/controller'
import { interactionActions, useInteractionStore } from '../interaction/store'
import type { EffectId, GameState, ModelId, PendingDecision, StoredConditionId, Vec2 } from '../../engine/index'
import { game, modelName, uiActions } from '../contract'
import './hud.css'
import { niceName, typeWord } from './format'
import type { OptionView, PromptView } from './promptView'

const CONDITION_WORD: Record<string, string> = { knockedDown: 'knocked down', stationary: 'held in place' }

export function UpkeepForm({ state, pd }: { state: GameState; pd: PendingDecision }) {
  const ids = (pd.context.effectIds ?? []) as EffectId[]
  const rows = ids.flatMap((id) => { const e = state.effects.find((x) => x.id === id); return e ? [e] : [] })
  const [keep, setKeep] = useState<Record<EffectId, boolean>>(() => Object.fromEntries(ids.map((i) => [i, true])))
  const spent: Record<ModelId, number> = {}
  for (const e of rows) if (keep[e.id] && e.upkeep) spent[e.upkeep.casterId] = (spent[e.upkeep.casterId] ?? 0) + 1
  return (
    <div className="pform" data-testid="upkeep-form">
      <ul className="prow-list">
        {rows.map((e) => {
          const caster = e.upkeep?.casterId
          const have = caster ? state.models[caster]?.focus ?? 0 : 0
          return (
            <li key={e.id}>
              <label className="prow">
                <input type="checkbox" data-testid={`upkeep-keep-${e.id}`} checked={!!keep[e.id]} onChange={(ev) => setKeep((k) => ({ ...k, [e.id]: ev.target.checked }))} />
                <span><b>{e.name}</b> on {e.targetIds.map((t) => modelName(state, t)).join(', ')}</span>
                <span className="hud-dim">1 focus from {caster ? modelName(state, caster) : '?'} ({have} on hand)</span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="hud-dim">{Object.entries(spent).map(([c, n]) => `${modelName(state, c)}: ${n} focus kept for upkeep, ${Math.max(0, (state.models[c]?.focus ?? 0) - n)} left`).join('; ')}</div>
      <div className="pbtns">
        <button type="button" className="hud-btn hud-btn-primary" data-testid="upkeep-confirm" onClick={() => game.answer({ type: 'payUpkeep', keep: rows.filter((e) => keep[e.id]).map((e) => e.id) })}>Confirm upkeep</button>
      </div>
    </div>
  )
}

interface ShakeOpt { modelId: ModelId; condition?: StoredConditionId; effectId?: string }

export function ShakeForm({ state, pd }: { state: GameState; pd: PendingDecision }) {
  const opts = (pd.context.data?.options ?? []) as ShakeOpt[]
  const [on, setOn] = useState<Record<number, boolean>>({})
  const picked = opts.filter((_, i) => on[i])
  return (
    <div className="pform" data-testid="shake-form">
      <ul className="prow-list">
        {opts.map((o, i) => {
          const eff = o.effectId ? state.effects.find((e) => e.id === o.effectId)?.name : undefined
          const what = eff ?? (o.condition ? CONDITION_WORD[o.condition] ?? o.condition : '?')
          return (
            <li key={i}>
              <label className="prow">
                <input type="checkbox" data-testid={`shake-pick-${i}`} checked={!!on[i]} onChange={(ev) => setOn((s) => ({ ...s, [i]: ev.target.checked }))} />
                <span><b>{modelName(state, o.modelId)}</b>: shake off {what}</span>
                <span className="hud-dim">{state.models[o.modelId]?.focus ?? 0} focus on hand</span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="pbtns">
        <button type="button" className="hud-btn hud-btn-primary" data-testid="shake-confirm" disabled={!picked.length}
          onClick={() => game.answer({ type: 'shake', shake: picked.map((o) => ({ modelId: o.modelId, ...(o.condition ? { condition: o.condition } : {}), ...(o.effectId ? { effectId: o.effectId } : {}) })) })}>
          Shake off ({picked.length})
        </button>
      </div>
    </div>
  )
}

interface AllocTarget { casterId: ModelId; modelId: ModelId; focus: number }

/** Control Phase: spread each caster's focus over the war engines in its control range. */
export function AllocateForm({ state, pd, view }: { state: GameState; pd: PendingDecision; view: PromptView }) {
  const targets = (pd.context.data?.targets ?? []) as AllocTarget[]
  const [alloc, setAlloc] = useState<Record<ModelId, number>>({})
  const fill = view.options.find((o) => o.id === 'default')
  const casters = [...new Set(targets.map((t) => t.casterId))]
  const used = (c: ModelId) => targets.filter((t) => t.casterId === c).reduce((a, t) => a + (alloc[t.modelId] ?? 0), 0)
  const pool = (c: ModelId) => state.models[c]?.focus ?? 0
  const bump = (t: AllocTarget, d: number) => setAlloc((a) => {
    const next = Math.max(0, (a[t.modelId] ?? 0) + d)
    if (d > 0 && used(t.casterId) >= pool(t.casterId)) return a
    return { ...a, [t.modelId]: next }
  })
  const confirm = () => game.answer({ type: 'allocateFocus', allocation: Object.fromEntries(Object.entries(alloc).filter(([, n]) => n > 0)) })
  const run = (o: OptionView | undefined) => { if (o) game.dispatch(o.action) }
  return (
    <div className="pform" data-testid="focus-form">
      {casters.map((c) => (
        <div key={c} className="focus-caster" data-testid={`focus-caster-${c}`}>
          <div className="focus-caster-head"><b>{modelName(state, c)}</b> <span className="hud-dim">{pool(c) - used(c)} of {pool(c)} focus to give</span></div>
          <ul className="prow-list">
            {targets.filter((t) => t.casterId === c).map((t) => (
              <li key={t.modelId} className="prow focus-target" data-testid={`focus-target-${t.modelId}`}
                onMouseEnter={() => uiActions.hover(t.modelId)} onMouseLeave={() => uiActions.hover(null)}>
                <span><b>{modelName(state, t.modelId)}</b> <span className="hud-dim">{typeWord(state.models[t.modelId]?.type)}, {t.focus} focus now</span></span>
                <span className="stepper">
                  <button type="button" className="hud-btn hud-btn-sq" data-testid={`focus-minus-${t.modelId}`} aria-label={`less focus for ${modelName(state, t.modelId)}`} onClick={() => bump(t, -1)} disabled={!(alloc[t.modelId] ?? 0)}>{'−'}</button>
                  <span className="stepper-n" data-testid={`focus-amount-${t.modelId}`}>{alloc[t.modelId] ?? 0}</span>
                  <button type="button" className="hud-btn hud-btn-sq" data-testid={`focus-plus-${t.modelId}`} aria-label={`more focus for ${modelName(state, t.modelId)}`} onClick={() => bump(t, 1)} disabled={used(c) >= pool(c)}>+</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="pbtns">
        {fill && <button type="button" className="hud-btn" data-testid="focus-fill" onClick={() => run(fill)}>Top up each war-engine to 3</button>}
        <button type="button" className="hud-btn hud-btn-primary" data-testid="focus-confirm" onClick={confirm}>Confirm allocation</button>
      </div>
    </div>
  )
}

/**
 * Board decisions (deploy, advance deploy, trooper placement, moves): say exactly what to click, and offer the
 * engine's own ready-made answers (auto-place, charge straight in, suggested spots) plus Confirm / Clear.
 */
export function BoardForm({ state, pd }: { state: GameState; pd: PendingDecision }) {
  const placements = useInteractionStore((s) => s.placements)
  const staged = useInteractionStore((s) => s.staged)
  const opts = pd.options ?? []
  if (PLACEMENT_KINDS.has(pd.kind)) {
    const ids = placementIds(pd)
    const placed = ids.filter((id) => placements[id]).length
    const next = ids.find((id) => !placements[id])
    const auto = opts.find((o) => o.id === 'auto')
    return (
      <div className="pform" data-testid="board-form">
        <p className="prompt-line">
          {next
            ? <>Click the table {pd.kind === 'placeTroopers' ? 'near the unit leader' : 'inside your highlighted zone'} to place <b>{modelName(state, next)}</b> ({placed} of {ids.length} placed).</>
            : <>All {ids.length} placed. Confirm, or click again to move the selected one.</>}
          {auto ? ' Or let the game place them for you.' : ''}
        </p>
        <div className="pbtns pbtns-wrap">
          {auto && <button type="button" className={`hud-btn${placed ? '' : ' hud-btn-primary'}`} data-testid="board-auto" onClick={() => autoPlace()}>{auto.label}</button>}
          <button type="button" className={`hud-btn${next ? '' : ' hud-btn-primary'}`} data-testid="board-confirm" disabled={!!next} onClick={() => commitStaged()}>Confirm placement <kbd>Enter</kbd></button>
          <button type="button" className="hud-btn hud-btn-quiet" data-testid="board-reset" disabled={!placed} onClick={() => cancelStaged()}>Reset</button>
        </div>
      </div>
    )
  }
  if (pd.kind === 'moveModel') {
    const c = pd.constraints
    const who = modelName(state, c?.modelId ?? pd.context.modelId)
    const straight = defaultStraightPath(pd)
    const full = opts.find((o) => o.id === 'full')
    const stay = opts.find((o) => o.id === 'mv0' || o.id === 'tm0' || o.id === 'stay')
    const spots = opts.filter((o) => o !== stay && o !== full).slice(0, 3)
    const max = c && Number.isFinite(c.maxDist) ? `${c.maxDist.toFixed(1)}"` : null
    return (
      <div className="pform" data-testid="board-form">
        <p className="prompt-line">
          {straight
            ? <>{who} charges in a straight line. Confirm to rush the target.</>
            : <>Click the table where {who} should stop{max ? ` (up to ${max}, the dashed ring)` : ''}. Green path = allowed, red = not. Click the end point again or press Confirm.</>}
        </p>
        <div className="pbtns pbtns-wrap">
          {full && <button type="button" className="hud-btn hud-btn-primary" data-testid="board-full" onClick={() => game.dispatch(full.action)}>{full.label}</button>}
          {!straight && <button type="button" className={`hud-btn${staged.length ? ' hud-btn-primary' : ''}`} data-testid="board-confirm" disabled={!staged.length} onClick={() => commitStaged()}>Confirm move <kbd>Enter</kbd></button>}
          {!straight && spots.map((o, i) => (
            <button key={o.id} type="button" className="hud-btn" data-testid={`board-spot-${i}`}
              onClick={() => { const p = (o.action as { path?: Vec2[] }).path; if (p) interactionActions.setStaged(p) }}>{`Suggested spot ${i + 1}`}</button>
          ))}
          {stay && <button type="button" className="hud-btn hud-btn-quiet" data-testid="board-stay" onClick={() => game.dispatch(stay.action)}>Stay put</button>}
          {!straight && staged.length > 0 && <button type="button" className="hud-btn hud-btn-quiet" data-testid="board-reset" onClick={() => cancelStaged()}>Clear <kbd>Esc</kbd></button>}
        </div>
      </div>
    )
  }
  return null
}
