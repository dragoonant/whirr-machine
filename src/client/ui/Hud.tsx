import { useEffect } from 'react'
import { DiceLog } from '../dice/DiceLog'
import { DiceTray } from '../dice/DiceTray'
import { game, useFatal, useHasGame, useRejection } from '../contract'
import './hud.css'
import { ActivationPanel } from './ActivationPanel'
import { EventFeed } from './EventFeed'
import { GameOver } from './GameOver'
import { GridCard } from './GridCard'
import { PromptDock } from './Prompt'
import { TopBar } from './TopBar'

/** A refused answer, in our words, for a few seconds (the engine's own text is the tooltip). */
function Toast() {
  const r = useRejection()
  useEffect(() => {
    if (!r) return
    const t = setTimeout(() => game.clearRejection(), 5000)
    return () => clearTimeout(t)
  }, [r?.id])
  if (!r) return null
  return (
    <div className="hud-toast" data-testid="hud-toast" role="alert" title={r.detail} onClick={() => game.clearRejection()}>
      {r.text}
    </div>
  )
}

function Fatal() {
  const f = useFatal()
  if (!f) return null
  return (
    <div className="hud-over" data-testid="hud-fatal" role="alertdialog">
      <div className="hud-card over-card">
        <h2 className="over-title">The game hit a snag</h2>
        <p>Something went wrong inside the rules engine. Load a save or start a new game.</p>
        <pre className="hud-dim fatal-detail">{f}</pre>
        <div className="pbtns"><button type="button" className="hud-btn hud-btn-primary" onClick={() => window.location.reload()}>Reload</button></div>
      </div>
    </div>
  )
}

/**
 * The in-game overlay: banner and VP on top, activation panel left, card / dice log / dice tray right, prompts bottom,
 * result on game end. Pointer events pass through the gaps to the board.
 */
export function Hud({ onExit }: { onExit?: () => void }) {
  const has = useHasGame()
  if (!has) return null
  return (
    <div className="hud" data-testid="hud">
      <TopBar />
      <div className="hud-left">
        <ActivationPanel />
        <EventFeed />
      </div>
      <div className="hud-right">
        <GridCard />
        <DiceLog />
        <DiceTray />
      </div>
      <PromptDock />
      <Toast />
      <GameOver onExit={onExit} />
      <Fatal />
    </div>
  )
}
