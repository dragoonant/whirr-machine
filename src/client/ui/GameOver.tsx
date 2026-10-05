import { useState } from 'react'
import type { GameState, PlayerId } from '../../engine/index'
import { endWord, playerName, useGameResult, usePresentedState, usePresentedVp } from '../contract'
import './hud.css'

export function resultHeadline(state: GameState, result: NonNullable<GameState['scenario']['result']>): string {
  return result.winner ? `${playerName(state, result.winner)} wins` : 'A draw'
}

/** Full-screen result: who won, how, and the VP each side finished on with the scoring history. */
export function GameOver({ onExit }: { onExit?: () => void }) {
  const result = useGameResult()
  const state = usePresentedState()
  const vp = usePresentedVp()
  const [hidden, setHidden] = useState(false)
  if (!result || !state || !vp) return null
  if (hidden) return <button type="button" className="hud-btn hud-over-chip" data-testid="gameover-show" onClick={() => setHidden(false)}>Game over: show result</button>
  const sides: PlayerId[] = ['A', 'B']
  const log = state.scenario.log.filter((l) => l.vp !== 0)
  return (
    <div className="hud-over" data-testid="gameover" role="dialog" aria-modal="true" aria-label="Game over">
      <div className="hud-card over-card">
        <h2 className="over-title" data-testid="gameover-result">{resultHeadline(state, result)}</h2>
        <p className="over-reason" data-testid="gameover-reason">{result.winner ? `Won by ${endWord(result.reason)}.` : `Ended on ${endWord(result.reason)}.`}</p>
        <div className="over-vp">
          {sides.map((p) => (
            <div key={p} className={`vp vp-${p}${result.winner === p ? ' vp-win' : ''}`} data-testid={`gameover-vp-${p}`}>
              <span className="vp-name">{playerName(state, p)}</span>
              <span className="vp-n">{vp[p]} VP</span>
            </div>
          ))}
        </div>
        {log.length > 0 && (
          <ul className="over-log" data-testid="gameover-log">
            {log.map((l, i) => <li key={i}>{`Round ${l.round}: ${playerName(state, l.player)} +${l.vp} (${l.source.replace(/^controls\s+\S+/, 'held an objective')})`}</li>)}
          </ul>
        )}
        <div className="pbtns">
          <button type="button" className="hud-btn" data-testid="gameover-ack" onClick={() => setHidden(true)}>Look at the board</button>
          <button type="button" className="hud-btn hud-btn-primary" data-testid="gameover-exit" onClick={() => (onExit ? onExit() : window.location.reload())}>New game</button>
        </div>
        <p className="hud-dim over-note">Whirr Machine is an unofficial fan project, not affiliated with Steamforged Games.</p>
      </div>
    </div>
  )
}
