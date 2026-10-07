import { useEffect } from 'react'
import { DiceLog } from '../dice/DiceLog'
import { DiceTray } from '../dice/DiceTray'
import { game, useFatal, useHasGame, usePrompt, useRejection } from '../contract'
import { panelActions, useRailCollapsed, type Rail } from '../store/panelStore'
import './hud.css'
import { ActivationPanel } from './ActivationPanel'
import { EventFeed } from './EventFeed'
import { GameOver } from './GameOver'
import { GridCard } from './GridCard'
import { FrenzyFlash } from './fury/FrenzyFlash'
import { PromptDock } from './Prompt'
import { MoveBar } from './MoveBar'
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

const PANEL_KINDS = new Set(['chooseMovement', 'chooseCombatAction', 'chooseAttack'])

/**
 * One side rail with its collapse tab. The body stays mounted while collapsed (the feed keeps its history) and is only
 * hidden; the tab always shows, and glows when the decision in play is answered from the collapsed activation panel.
 */
function SideRail({ rail, label, hint, children }: { rail: Rail; label: string; hint: string; children: React.ReactNode }) {
  const collapsed = useRailCollapsed(rail)
  const pd = usePrompt()
  const waiting = rail === 'left' && collapsed && !!pd && PANEL_KINDS.has(pd.kind)
  return (
    <div className={`hud-${rail} hud-rail${collapsed ? ' is-collapsed' : ''}`} data-testid={`rail-${rail}`} data-collapsed={collapsed ? 'true' : 'false'}>
      <div className="rail-body" hidden={collapsed}>{children}</div>
      <button
        type="button" className={`rail-tab rail-tab-${rail}${waiting ? ' rail-tab-wait' : ''}`} data-testid={`rail-${rail}-toggle`}
        aria-expanded={!collapsed} aria-label={`${collapsed ? 'Show' : 'Hide'} ${label}`} title={`${collapsed ? 'Show' : 'Hide'} ${label} (${hint})`}
        onClick={() => panelActions.toggle(rail)}
      >
        <span aria-hidden="true">{(rail === 'left') === collapsed ? '▸' : '◂'}</span>
        {collapsed && <span className="rail-tab-label">{waiting ? `${label}: your move` : label}</span>}
      </button>
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
      <SideRail rail="left" label="Actions" hint="[">
        <ActivationPanel />
        <EventFeed />
      </SideRail>
      <SideRail rail="right" label="Card and dice" hint="]">
        <GridCard />
        <DiceLog />
        <DiceTray />
      </SideRail>
      <MoveBar />
      <FrenzyFlash />
      <PromptDock />
      <Toast />
      <GameOver onExit={onExit} />
      <Fatal />
    </div>
  )
}
