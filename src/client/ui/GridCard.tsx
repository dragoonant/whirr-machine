import { useMemo } from 'react'
import type { ModelState } from '../../engine/index'
import { modelName, useEventFeed, useHoverId, usePresentedState, useSelectedId } from '../contract'
import './hud.css'
import { dataText, profileOf } from './data'
import { niceName, typeWord } from './format'
import { cardDamage, lastDamageKey, systemsOf, type BoxView } from './gridView'
import { Conditions, FocusPips, StatRow, WeaponList } from './ModelBits'

const LIFE_WORD: Record<ModelState['life'], string> = { active: '', disabled: 'Down', boxed: 'Destroyed', destroyed: 'Destroyed' }

function Box({ id, grid, c, i, b, flash }: { id: string; grid: string; c: number; i: number; b: BoxView; flash: boolean }) {
  return (
    <span
      className={`box${b.filled ? ' box-filled' : ''}${b.system ? ' box-sys' : ''}${b.crippled ? ' box-crippled' : ''}${flash ? ' box-flash' : ''}`}
      data-testid={`card-box-${c}-${i}${grid === 'main' ? '' : `-${grid}`}`}
      data-filled={b.filled ? 'true' : 'false'}
      data-system={b.system ?? ''}
      data-model={id}
    >{b.system ?? ''}</span>
  )
}

/** Damage card for one model: stats, weapons, boxes (single row or six-column grid), systems, abilities, effects. */
export function GridCardFor({ model }: { model: ModelState }) {
  const state = usePresentedState()!
  const feed = useEventFeed()
  const cd = useMemo(() => cardDamage(model), [model])
  const systems = useMemo(() => systemsOf(model), [model])
  const flash = useMemo(() => lastDamageKey(state, feed, model.id), [state, feed, model.id])
  const p = profileOf(model)
  const abilities = p?.abilities ?? []
  const life = LIFE_WORD[model.life]
  return (
    <section className="hud-card card" data-testid={`card-${model.id}`} data-life={model.life}>
      <header className="card-head">
        <h3 className="hud-h card-name">{modelName(state, model.id)}</h3>
        <span className="hud-dim">{typeWord(model.type)}{life ? ` — ${life}` : ''}</span>
        <FocusPips model={model} />
      </header>
      <StatRow state={state} model={model} />
      <div className="card-damage" data-testid={`card-grid-${model.id}`} data-track={cd.track}>
        {cd.track === 'single' ? (
          <div className="boxrow" aria-label={`${cd.filled} of ${cd.total} boxes filled`}>
            {cd.boxes.map((b, i) => <Box key={i} id={model.id} grid="main" c={0} i={i} b={b} flash={flash?.keys.has(`main:0:${i}`) ?? false} />)}
          </div>
        ) : (
          cd.grids.map((g) => (
            <div key={g.id} className="grid6" aria-label={`damage grid ${g.id}`}>
              {g.columns.map((col, c) => (
                <div key={c} className="gcol" data-col={col.n}>
                  {col.boxes.map((b, i) => <Box key={`${flash?.seq ?? 0}:${i}`} id={model.id} grid={g.id} c={c} i={i} b={b} flash={flash?.keys.has(`${g.id}:${c}:${i}`) ?? false} />)}
                  <span className="gcol-n">{col.n}</span>
                </div>
              ))}
            </div>
          ))
        )}
        <div className="hud-dim card-count">{cd.filled}/{cd.total} boxes</div>
      </div>
      {systems.length > 0 && (
        <ul className="systems" data-testid={`card-systems-${model.id}`}>
          {systems.map((s) => (
            <li key={s.letter} className={s.crippled ? 'sys-crippled' : ''} data-testid={`card-system-${model.id}-${s.letter}`} data-crippled={s.crippled ? 'true' : 'false'}>
              <b>{s.letter}</b> {s.name}{s.crippled ? ` — crippled. ${s.effect}` : ''}
            </li>
          ))}
        </ul>
      )}
      <WeaponList state={state} model={model} />
      <Conditions state={state} model={model} />
      {abilities.length > 0 && (
        <details className="abilities" data-testid={`card-abilities-${model.id}`}>
          <summary>Abilities ({abilities.length})</summary>
          <ul>{abilities.map((a) => <li key={a}><b>{niceName(a)}</b> {dataText(a)}</li>)}</ul>
        </details>
      )}
    </section>
  )
}

/** Right-rail card: the hovered model, else the selected one (a unit id shows its first trooper). */
export function GridCard() {
  const state = usePresentedState()
  const hover = useHoverId()
  const sel = useSelectedId()
  if (!state) return null
  const id = hover ?? sel
  if (!id) return <section className="hud-card card" data-testid="card-empty"><p className="hud-dim">Select a model to see its card.</p></section>
  const m = state.models[id] ?? state.models[state.units[id]?.troopers[0] ?? '']
  if (!m) return null
  return <GridCardFor model={m} />
}
