// Fury pips for cards, the battlegroup strip and the board label (81 G). Numbers come from query.fury / query.threshold /
// query.battlegroup through furyView.ts; nothing here decides a rule.
import type { GameState, ModelId, ModelState } from '../../../engine/index'
import { uiActions } from '../../contract'
import { usePresentedStore } from '../../presentation/presentedStore'
import { pct } from '../format'
import { FocusPips } from '../ModelBits'
import './fury.css'
import { battlegroupView, furyBadge, furySentence, type FuryBadge } from './furyView'

/** A small flame; filled = lit, else a dim outline. Drawn with CSS variables, so it themes with the HUD. */
export function Flame({ lit }: { lit: boolean }) {
  return (
    <svg className={`flame${lit ? ' flame-lit' : ''}`} viewBox="0 0 10 13" width="10" height="13" aria-hidden="true">
      <path d="M5 0.5C5.6 3 8.6 4.6 8.6 8.2A3.6 3.6 0 0 1 1.4 8.2C1.4 6.6 2.2 5.7 2.9 4.9C3 6 3.6 6.5 4 6.6C3.7 4.4 4.2 2.2 5 0.5Z" />
    </svg>
  )
}

/** Flame pips plus the numbers: "3/6 fury (ARC)"; beasts add THR and the next-check frenzy chance. */
export function FuryPips({ state, model, compact }: { state: GameState; model: ModelState; compact?: boolean }) {
  const b = furyBadge(state, model.id)
  if (!b) return null
  return (
    <span className={`fury-pips fury-${b.kind}${b.wild ? ' fury-wild' : ''}`} data-testid={`card-fury-${model.id}`} data-fury={b.fury} data-cap={b.cap} data-kind={b.kind} aria-label={furySentence(b)} title={furySentence(b)}>
      <span className="fury-flames">{b.pips.map((lit, i) => <Flame key={i} lit={lit} />)}</span>
      <span className="fury-n">{b.fury}/{b.cap} {b.capStat === 'ARC' ? 'fury (ARC)' : 'fury'}</span>
      {!compact && b.kind === 'beast' && !b.wild && b.thr !== null && <span className="fury-thr" data-testid={`card-thr-${model.id}`}>THR {b.thr}</span>}
      {!compact && b.pFrenzy !== null && (
        <span className={`fury-frenzy fury-${b.tone}`} data-testid={`card-frenzy-${model.id}`} data-p={b.pFrenzy} data-tone={b.tone}>
          frenzy {pct(b.pFrenzy)}
        </span>
      )}
      {b.wild && <span className="chip chip-bad fury-tag" data-testid={`card-wild-${model.id}`}>wild</span>}
      {!compact && b.kind === 'beast' && !b.wild && !b.forceable && b.blockText && <span className="fury-block hud-dim" data-testid={`card-block-${model.id}`}>can't force: {b.blockText.toLowerCase()}</span>}
    </span>
  )
}

/** Card/panel header resource: fury pips for fury models, focus pips for everything else. */
export function ResourcePips({ state, model }: { state: GameState; model: ModelState }) {
  return model.fury !== undefined ? <FuryPips state={state} model={model} /> : <FocusPips model={model} />
}

/** Under a warlock's portrait: its beasts with fury bars, an in-control dot and the reason one cannot be forced. */
export function BattlegroupStrip({ state, model }: { state: GameState; model: ModelState }) {
  if (model.fury === undefined || model.type !== 'leader') return null
  const v = battlegroupView(state, model.id)
  if (!v) return null
  return (
    <div className="bgstrip" data-testid={`card-battlegroup-${model.id}`}>
      <div className="bg-head hud-dim">Battlegroup · control range {v.ctrl}&quot;{v.leechRoom > 0 ? ` · can leech ${v.leechRoom}` : ''}{v.spiritBond > 0 ? ` · spirit bond ${v.spiritBond}` : ''}</div>
      <ul className="bg-list">
        {v.rows.map((r) => (
          <li key={r.id} className={`bg-row bg-${r.tone}`} data-testid={`bg-row-${r.id}`} data-fury={r.fury} data-in-ctrl={r.inCtrl ? 'true' : 'false'}
            onMouseEnter={() => uiActions.hover(r.id)} onMouseLeave={() => uiActions.hover(null)}>
            <span className={`bg-dot${r.inCtrl ? ' bg-dot-on' : ''}`} title={r.inCtrl ? 'In control range' : 'Outside control range'} />
            <button type="button" className="bg-name" onClick={() => uiActions.select(r.id)}>{r.name}</button>
            <span className="bg-bar" aria-label={`${r.fury} of ${r.cap} fury`}>
              {Array.from({ length: r.cap }, (_, i) => <span key={i} className={`bg-seg${i < r.fury ? ' bg-seg-on' : ''}`} />)}
            </span>
            <span className="bg-n">{r.fury}/{r.cap}</span>
            {r.pFrenzy > 0 && <span className={`fury-frenzy fury-${r.tone}`}>frenzy {pct(r.pFrenzy)}</span>}
            {!r.forceable && r.blockText && <span className="bg-block hud-dim" data-testid={`bg-block-${r.id}`}>can't force: {r.blockText.toLowerCase()}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The board label for one figure (mount it in an <Html> over the model): it subscribes to a short key, so a figure only
 * re-renders when its own fury, frenzy chance or wildness changes. Renders nothing for non-fury models and empty beasts.
 */
export function FuryBoardTag({ id }: { id: ModelId }) {
  const key = usePresentedStore((s) => {
    const b = s.state && s.state.models[id]?.fury !== undefined ? furyBadge(s.state, id) : null
    return b ? `${b.kind}|${b.fury}|${b.tone}|${b.wild ? 1 : 0}|${b.pFrenzy ?? ''}` : ''
  })
  if (!key) return null
  const [kind, fury, tone, wild, p] = key.split('|')
  if (fury === '0' && wild !== '1') return null
  return (
    <span className={`fury-label fury-${tone}${wild === '1' ? ' fury-wild' : ''}`} data-testid={`fury-label-${id}`} data-fury={fury}>
      {wild === '1' ? 'wild' : <><Flame lit />{fury}{kind === 'beast' && p && Number(p) > 0 ? ` · ${pct(Number(p))}` : ''}</>}
    </span>
  )
}

/** Tiny label over a figure on the board (pure version of FuryBoardTag, for cards and tests): lit flames and, for beasts, the frenzy chance when it is worth a warning. */
export function FuryBoardLabel({ state, model }: { state: GameState; model: ModelState }) {
  const b: FuryBadge | null = model.fury !== undefined ? furyBadge(state, model.id) : null
  if (!b || (b.fury === 0 && !b.wild)) return null
  return (
    <span className={`fury-label fury-${b.tone}${b.wild ? ' fury-wild' : ''}`} data-testid={`fury-label-${model.id}`} data-fury={b.fury}>
      {b.wild ? 'wild' : <><svg className="flame flame-lit" viewBox="0 0 10 13" width="9" height="11" aria-hidden="true"><path d="M5 0.5C5.6 3 8.6 4.6 8.6 8.2A3.6 3.6 0 0 1 1.4 8.2C1.4 6.6 2.2 5.7 2.9 4.9C3 6 3.6 6.5 4 6.6C3.7 4.4 4.2 2.2 5 0.5Z" /></svg>{b.fury}{b.kind === 'beast' && b.pFrenzy !== null && b.pFrenzy > 0 ? ` · ${pct(b.pFrenzy)}` : ''}</>}
    </span>
  )
}
