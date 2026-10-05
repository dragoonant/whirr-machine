// Small shared pieces of the model cards: stats (resolved by the engine), weapon rows, focus pips, effect chips.
import { useMemo } from 'react'
import type { GameState, ModelState, Stat } from '../../engine/index'
import { modelName, queryStat } from '../contract'
import { dataText, profileOf, weaponRows } from './data'
import { STAT_ORDER, niceName, signed } from './format'

const CONDITION_WORD: Record<string, string> = {
  knockedDown: 'Knocked down', stationary: 'Stationary', disrupted: 'Disrupted', fire: 'On fire', corrosion: 'Corroded', inert: 'Inert',
}

/** Stats as the engine resolves them; a changed value shows gold with the trace on hover. */
export function StatRow({ state, model }: { state: GameState; model: ModelState }) {
  const rows = useMemo(() => {
    const base = profileOf(model)?.stats ?? {}
    return STAT_ORDER.filter((s) => base[s] !== undefined).map((s: Stat) => {
      const tr = queryStat(model.id, s)
      const value = tr?.value ?? base[s]!
      const trace = tr && tr.steps.length ? `${s} ${tr.base}: ${tr.steps.map((x) => `${x.source} ${x.mode === 'set' ? '=' : signed(x.value)}`).join(', ')}` : ''
      return { s, value, changed: value !== (tr?.base ?? base[s]), trace }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, model.id])
  return (
    <div className="stats" data-testid={`card-stats-${model.id}`}>
      {rows.map((r) => (
        <div key={r.s} className={`stat${r.changed ? ' stat-mod' : ''}`} title={r.trace || undefined} data-testid={`act-stat-${r.s}`} data-stat={r.s}>
          <span className="stat-k">{r.s}</span><span className="stat-v">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export function WeaponList({ state, model }: { state: GameState; model: ModelState }) {
  const rows = weaponRows(model, niceName)
  if (!rows.length) return null
  return (
    <ul className="weapons" data-testid={`card-weapons-${model.id}`}>
      {rows.map((w) => {
        const crippled = w.location !== null && model.crippled.includes(w.location)
        return (
          <li key={w.key} className={`weapon${crippled ? ' weapon-crippled' : ''}`} data-testid={`act-weapon-${w.weaponId}`} data-crippled={crippled ? 'true' : 'false'}>
            <span className="weapon-name">{w.count > 1 ? `${w.count}× ` : ''}{w.name}</span>
            <span className="weapon-stats">
              {w.reach}{w.rof !== null ? ` · ROF ${w.rof}` : ''}{w.pow !== null ? ` · POW ${w.pow}` : ''}
            </span>
            {w.location && <span className="weapon-loc">{w.location}{crippled ? ' crippled: one die fewer' : ''}</span>}
            {w.qualities.length > 0 && <span className="weapon-q">{w.qualities.join(', ')}</span>}
          </li>
        )
      })}
    </ul>
  )
}

export function FocusPips({ model }: { model: ModelState }) {
  if (model.type !== 'leader' && model.type !== 'warEngine') return null
  const n = model.focus
  return (
    <span className="focus-pips" data-testid={`card-focus-${model.id}`} data-focus={n} aria-label={`${n} focus`}>
      {Array.from({ length: n }, (_, i) => <span key={i} className="focus-orb" />)}
      <span className="focus-n">{n} focus</span>
    </span>
  )
}

export function Conditions({ state, model }: { state: GameState; model: ModelState }) {
  const fx = state.effects.filter((e) => e.targetIds.includes(model.id))
  if (!model.conditions.length && !fx.length) return null
  return (
    <div className="chips" data-testid={`card-effects-${model.id}`}>
      {model.conditions.map((c) => <span key={c} className="chip chip-bad">{CONDITION_WORD[c] ?? c}</span>)}
      {fx.map((e) => (
        <span key={e.id} className="chip" title={dataText(e.sourceId)}>
          {e.name}{e.upkeep ? ` (upkeep, ${modelName(state, e.upkeep.casterId)})` : ''}
        </span>
      ))}
    </div>
  )
}
