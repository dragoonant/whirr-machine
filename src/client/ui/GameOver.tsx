import { useEffect, useState } from 'react'
import type { GameState, PlayerId } from '../../engine/index'
import { endWord, game, modelName, useBoardName, playerName, useGameResult, usePresentedState, usePresentedVp } from '../contract'
import { clockCauseLine } from '../clock'
import { boardFor, boardFromUrl } from '../board/boards'
import { getSettings } from '../store/settingsStore'
import { useGameStore } from '../store/gameStore'
import './hud.css'
import { scoreSourceWords } from './cards/eventLines'
import { getMatchStats, installMatchStats } from './matchStats'

installMatchStats()

type Result = NonNullable<GameState['scenario']['result']>

export function resultHeadline(state: GameState, result: Result): string {
  return result.winner ? `${playerName(state, result.winner)} wins` : 'A draw'
}

/** One sentence on why the game ended. */
export function causeText(result: Result): string {
  switch (result.reason) {
    case 'assassination': return result.winner ? 'The enemy warcaster was destroyed.' : 'Both warcasters fell.'
    case 'scenario': return 'A side reached the scenario victory total.'
    case 'roundLimit': return 'The round limit was reached, so victory points decided it.'
    case 'tiebreakPresence': return 'Victory points were level at the round limit, so board presence broke the tie.'
    case 'draw': return 'Nothing separated the sides.'
    case 'concession': return 'A side conceded.'
    default: return endWord(result.reason)
  }
}

export interface RoundVp { round: number; A: number; B: number; notes: string[] }

/** VP gained each round, from the engine's scoring log. */
export function vpByRound(state: GameState): RoundVp[] {
  const rows = new Map<number, RoundVp>()
  for (const l of state.scenario.log) {
    if (l.vp === 0) continue
    const r = rows.get(l.round) ?? { round: l.round, A: 0, B: 0, notes: [] }
    r[l.player] += l.vp
    r.notes.push(`${playerName(state, l.player)} +${l.vp}: ${scoreSourceWords(state, l.source)}`)
    rows.set(l.round, r)
  }
  return [...rows.values()].sort((a, b) => a.round - b.round)
}

/** Start the same match again with a fresh seed (same lists, scenario, controllers and bot strength). */
export function playAgain(state: GameState): string | null {
  const g = useGameStore.getState()
  const rej = game.newGame({ scenario: state.setup.scenario, lists: { ...state.setup.lists }, controllers: { ...g.controllers }, bot: { tier: g.bot.tier }, board: boardFromUrl() ?? (boardFor(getSettings().battlefield)?.id ?? 'random'), ...(state.setup.cards ? { cards: state.setup.cards } : {}) })
  return rej ? rej.text : null
}

/** Full-screen result: who won and why, VP by round, damage dealt, then Play again / Menu. */
export function GameOver({ onExit }: { onExit?: () => void }) {
  const result = useGameResult()
  const state = usePresentedState()
  const vp = usePresentedVp()
  const boardName = useBoardName()
  const [hidden, setHidden] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const over = !!result
  useEffect(() => { if (!over) { setHidden(false); setErr(null) } }, [over])
  if (!result || !state || !vp) return null
  if (hidden) return <button type="button" className="hud-btn hud-over-chip" data-testid="gameover-show" onClick={() => setHidden(false)}>Game over: show result</button>
  const sides: PlayerId[] = ['A', 'B']
  const rounds = vpByRound(state)
  const stats = getMatchStats()
  const leaderOf = (p: PlayerId): string => { const l = Object.values(state.models).find((m) => m.owner === p && m.type === 'leader'); return l ? modelName(state, l.id) : playerName(state, p) }
  const clockLine = clockCauseLine(state, (p) => playerName(state, p), leaderOf)
  return (
    <div className="hud-over" data-testid="gameover" role="dialog" aria-modal="true" aria-label="Game over">
      <div className="hud-card over-card">
        <h2 className="over-title" data-testid="gameover-result">{resultHeadline(state, result)}</h2>
        <p className="over-reason" data-testid="gameover-reason">{result.winner ? `Won by ${endWord(result.reason)}.` : `Ended on ${endWord(result.reason)}.`}</p>
        <p className="over-cause hud-dim" data-testid="gameover-cause">{causeText(result)}</p>
        {clockLine && <p className="over-cause" data-testid="gameover-clock">{clockLine}</p>}
        <p className="over-cause hud-dim" data-testid="gameover-board">Battlefield: {boardName}</p>
        <div className="over-vp">
          {sides.map((p) => (
            <div key={p} className={`vp vp-${p}${result.winner === p ? ' vp-win' : ''}`} data-testid={`gameover-vp-${p}`}>
              <span className="vp-name">{playerName(state, p)}</span>
              <span className="vp-n">{vp[p]} VP</span>
            </div>
          ))}
        </div>
        {rounds.length > 0 && (
          <table className="over-table" data-testid="gameover-log">
            <caption>Victory points by round</caption>
            <thead><tr><th>Round</th>{sides.map((p) => <th key={p} className={`side-${p}`}>{playerName(state, p)}</th>)}</tr></thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.round} data-testid={`gameover-round-${r.round}`} title={r.notes.join('; ')}>
                  <td>{r.round}</td><td>{r.A > 0 ? `+${r.A}` : '-'}</td><td>{r.B > 0 ? `+${r.B}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <table className="over-table" data-testid="gameover-damage">
          <caption>Damage dealt</caption>
          <thead><tr><th /> {sides.map((p) => <th key={p} className={`side-${p}`}>{playerName(state, p)}</th>)}</tr></thead>
          <tbody>
            <tr><td>Damage points</td><td data-testid="gameover-dealt-A">{stats.dealt.A}</td><td data-testid="gameover-dealt-B">{stats.dealt.B}</td></tr>
            <tr><td>Models lost</td><td data-testid="gameover-lost-A">{stats.lost.A}</td><td data-testid="gameover-lost-B">{stats.lost.B}</td></tr>
          </tbody>
        </table>
        {err && <p className="start-error" role="alert">{err}</p>}
        <div className="pbtns">
          <button type="button" className="hud-btn" data-testid="gameover-ack" onClick={() => setHidden(true)}>Look at the board</button>
          <button type="button" className="hud-btn" data-testid="gameover-menu" onClick={() => (onExit ? onExit() : window.location.reload())}>Menu</button>
          <button type="button" className="hud-btn hud-btn-primary" data-testid="gameover-again" onClick={() => setErr(playAgain(state))}>Play again</button>
        </div>
        <p className="hud-dim over-note">Whirr Machine is an unofficial fan project, not affiliated with Steamforged Games.</p>
      </div>
    </div>
  )
}
