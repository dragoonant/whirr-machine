// The two clock chips for the top bar (91 C.2 "Client UX"): left = the human, right = the opponent, with an optional pause button between.
// TopBar (WP5) mounts <ClockBar />; it renders nothing while the clock is off. Mounting also starts the clock controller.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { PlayerId } from '../../engine/index'
import { SIDE_COLOURS } from '../board/layout'
import { playerName } from '../presentation/labels'
import { usePresentedStore } from '../presentation/presentedStore'
import { useGameStore } from '../store/gameStore'
import { clearToast, installClock, toggleUserPause, useClockStore } from './clockStore'
import { clockTone, formatClock } from './clockModel'
import './clock.css'

const RING_R = 9
const RING_C = 2 * Math.PI * RING_R
const PAUSE_GLYPH = '❚❚'
const PLAY_GLYPH = '▶'

/** Left chip = the human's side (A when both or neither are human). */
export function chipOrder(controllers: Record<PlayerId, 'human' | 'bot'>): [PlayerId, PlayerId] {
  return controllers.A === 'bot' && controllers.B === 'human' ? ['B', 'A'] : ['A', 'B']
}

const shortName = (name: string): string => name.replace(/\s*\([AB]\)$/, '')

function Chip({ player }: { player: PlayerId }) {
  const config = useClockStore((s) => s.config)!
  const ms = useClockStore((s) => s.pools[player])
  const charged = useClockStore((s) => s.charged)
  const pausedBy = useClockStore((s) => s.pausedBy)
  const expired = useClockStore((s) => s.expired)
  const bot = useGameStore((s) => s.controllers[player] === 'bot')
  const state = usePresentedStore((s) => s.state)
  const untimed = bot && !config.timeBot
  const mine = charged === player
  const running = mine && pausedBy === null && expired === null
  const paused = mine && pausedBy !== null
  const tone = untimed ? 'ok' : clockTone(ms)
  const frac = Math.max(0, Math.min(1, ms / config.poolMs))
  const name = shortName(playerName(state, player))
  const status = untimed ? 'untimed' : running ? 'running' : paused ? `paused: ${pausedBy}` : 'waiting'
  return (
    <div
      className={`clock-chip clock-tone-${tone}${running ? ' clock-chip-running' : ''}${untimed ? ' clock-chip-untimed' : ''}${paused ? ' clock-chip-paused' : ''}`}
      style={{ ['--clock-side' as string]: SIDE_COLOURS[player].ring }}
      data-testid={`clock-chip-${player}`} data-running={running ? 'true' : 'false'} data-tone={tone} data-status={status}
      title={untimed ? `${name}: the bot is untimed` : paused ? `Paused: ${pausedBy}` : `${name}: ${status}`}
    >
      <svg className="clock-ring" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <circle className="clock-ring-track" cx="12" cy="12" r={RING_R} />
        <circle className="clock-ring-fill" cx="12" cy="12" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - frac)} transform="rotate(-90 12 12)" />
      </svg>
      <span className="clock-name">{name}</span>
      <span className="clock-time" data-testid={`clock-time-${player}`}>{formatClock(ms)}</span>
      {untimed && <span className="clock-note">untimed</span>}
      {paused && <span className="clock-glyph" aria-label={`Paused: ${pausedBy}`}>{PAUSE_GLYPH}</span>}
    </div>
  )
}

/** The paused board: dimmed, and it swallows every click until the player resumes. Not a role="dialog", so it does not count as a modal. */
function Veil() {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="clock-veil" data-clock-ignore="" data-testid="clock-veil">
      <div className="clock-veil-card">
        <b>Clock paused</b>
        <span>The board is hidden while the clock is stopped.</span>
        <button type="button" className="clock-veil-btn" data-testid="clock-resume" onClick={toggleUserPause}>Resume</button>
      </div>
    </div>,
    document.body,
  )
}

export function ClockBar() {
  const config = useClockStore((s) => s.config)
  const controllers = useGameStore((s) => s.controllers)
  const userPaused = useClockStore((s) => s.userPaused)
  const toast = useClockStore((s) => s.toast)
  useEffect(() => installClock(), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 4500)
    return () => clearTimeout(t)
  }, [toast?.id])
  if (!config) return null
  const [left, right] = chipOrder(controllers)
  return (
    <div className="clock-bar" data-testid="clock-bar" role="group" aria-label="Game clock">
      <Chip player={left} />
      {config.allowPause && (
        <button type="button" className="hud-btn hud-btn-sq clock-pause" data-testid="clock-pause" aria-pressed={userPaused} title={userPaused ? 'Resume the clock' : 'Pause the clock'} onClick={toggleUserPause}>
          {userPaused ? PLAY_GLYPH : PAUSE_GLYPH}
        </button>
      )}
      <Chip player={right} />
      {toast && <div className={`clock-toast clock-toast-${toast.tone}`} data-testid="clock-toast" role="status" onClick={clearToast}>{toast.text}</div>}
      {userPaused && <Veil />}
    </div>
  )
}

export default ClockBar
