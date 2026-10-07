// The command-card hand (91 A): a "Cards" button in the top bar that opens a tray with both hands. Either player may look at
// both hands (CC6); only the human's own cards can be played, and only the options the open decision lists are enabled.
import { useEffect, useMemo, useRef, useState } from 'react'
import { game, queryCards, useControllers, usePresentedState, usePrompt, usePromptLegal } from '../../contract'
import type { PlayerId } from '../../../engine/index'
import '../hud.css'
import './cards.css'
import { buildHand, offerLabel, type CardTile, type HandModel, type PlayOffer } from './cardsView'

const humanSide = (c: Record<PlayerId, 'human' | 'bot'>): PlayerId => (c.A === 'bot' && c.B === 'human' ? 'B' : 'A')

function Tile({ tile, mine, onPlay }: { tile: CardTile; mine: boolean; onPlay(p: PlayOffer): void }) {
  return (
    <li className={`card-tile${tile.played ? ' is-played' : ''}${tile.playable ? ' is-playable' : ''}`} data-testid={`card-${tile.cardId}`} data-playable={tile.playable ? 'true' : 'false'} data-played={tile.played ? 'true' : 'false'}>
      <h4 className="card-name">{tile.name}{tile.cost > 0 && <span className="card-cost">{tile.cost} pt</span>}</h4>
      <p className="card-text">{tile.text}</p>
      {tile.played && <p className="card-state" data-testid={`card-played-${tile.cardId}`}>Played</p>}
      {mine && !tile.played && (
        <div className="card-opts">
          {tile.options.map((o) => {
            const several = o.offers.length > 1
            if (o.offers.length === 0) {
              return <button key={o.id} type="button" className="hud-btn hud-btn-sm card-opt" disabled data-testid={`card-play-${tile.cardId}-${o.id}`} title={o.text || tile.reason}><span className="btn-label">{o.label}</span></button>
            }
            return o.offers.map((p, i) => (
              <button key={p.key} type="button" className="hud-btn hud-btn-sm hud-btn-primary card-opt" disabled={!p.enabled} data-testid={`card-play-${tile.cardId}-${o.id}${several ? `-${i}` : ''}`}
                title={o.text} onClick={() => onPlay(p)}>
                <span className="btn-label">{offerLabel(o, p, several)}</span>
                <span className="btn-note">{p.targetName}</span>
              </button>
            ))
          })}
        </div>
      )}
      {mine && !tile.played && !tile.playable && tile.reason && <p className="card-state card-when">{tile.reason}</p>}
      {!mine && !tile.played && <p className="card-state card-when">{tile.when}</p>}
    </li>
  )
}

function HandRow({ hand, mine, title, onPlay }: { hand: HandModel; mine: boolean; title: string; onPlay(p: PlayOffer): void }) {
  return (
    <section className="hand" data-testid={`hand-${mine ? 'mine' : 'theirs'}`} aria-label={title}>
      <h3 className="hud-h2 hand-title">{title}<span className="hud-dim"> · {hand.tiles.filter((t) => !t.played).length} of {hand.tiles.length} left · {hand.playsLeft} play{hand.playsLeft === 1 ? '' : 's'} left this turn</span></h3>
      <ul className="hand-tiles">{hand.tiles.map((t) => <Tile key={t.cardId} tile={t} mine={mine} onPlay={onPlay} />)}</ul>
    </section>
  )
}

/** "Cards" button for the top bar with the tray under it. Renders nothing when neither player took cards. */
export function CardsButton() {
  const state = usePresentedState()
  const pd = usePrompt()
  const legal = usePromptLegal()
  const controllers = useControllers()
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'mine' | 'theirs'>('mine')
  const box = useRef<HTMLDivElement | null>(null)
  const me = humanSide(controllers)
  const they: PlayerId = me === 'A' ? 'B' : 'A'
  const hands = useMemo(() => {
    if (!state) return null
    const mine = buildHand(state, queryCards(me, state), me, pd, legal, me)
    const theirs = buildHand(state, queryCards(they, state), they, pd, legal, me)
    return { mine, theirs }
  }, [state, pd, legal, me, they])

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const down = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', down)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', down) }
  }, [open])

  if (!hands || (!hands.mine && !hands.theirs)) return null
  const playable = hands.mine?.playable ?? 0
  const left = hands.mine ? hands.mine.tiles.filter((t) => !t.played).length : 0
  const play = (p: PlayOffer) => { if (!game.dispatch(p.action)) setOpen(false) }
  const shown = side === 'mine' && hands.mine ? 'mine' : hands.theirs ? 'theirs' : 'mine'
  return (
    <div className="cards-wrap" ref={box}>
      <button type="button" className={`hud-btn cards-btn${playable > 0 ? ' hud-btn-primary cards-ready' : ''}`} data-testid="cards-button" data-playable={playable} aria-expanded={open}
        title={playable > 0 ? `${playable} command card${playable === 1 ? '' : 's'} can be played now` : "Your command cards and your opponent's"} onClick={() => setOpen((o) => !o)}>
        <span className="btn-label">Cards {left}</span>
        {playable > 0 && <span className="btn-note" data-testid="cards-playable">{playable} to play</span>}
      </button>
      {open && (
        <div className="hud-card cards-tray" data-testid="cards-tray" role="dialog" aria-label="Command cards" data-clock-ignore="">
          <header className="cards-head">
            <h3 className="hud-h">Command cards</h3>
            <div className="cards-seg" role="tablist">
              {hands.mine && <button type="button" role="tab" className={shown === 'mine' ? 'on' : ''} aria-selected={shown === 'mine'} data-testid="cards-tab-mine" onClick={() => setSide('mine')}>Your hand</button>}
              {hands.theirs && <button type="button" role="tab" className={shown === 'theirs' ? 'on' : ''} aria-selected={shown === 'theirs'} data-testid="cards-tab-theirs" onClick={() => setSide('theirs')}>Opponent&apos;s hand</button>}
            </div>
            <button type="button" className="hud-btn hud-btn-sm hud-btn-quiet" data-testid="cards-close" onClick={() => setOpen(false)}>Close</button>
          </header>
          <p className="hud-dim cards-rule">Five cards each, each played once a game, two plays a turn, one card per model or unit a turn. Both hands are open.</p>
          {shown === 'mine' && hands.mine && <HandRow hand={hands.mine} mine title="Your hand" onPlay={play} />}
          {shown === 'theirs' && hands.theirs && <HandRow hand={hands.theirs} mine={false} title="Opponent's hand" onPlay={play} />}
        </div>
      )}
    </div>
  )
}
