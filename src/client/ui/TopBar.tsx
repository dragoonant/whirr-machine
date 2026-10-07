import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, PlayerId } from '../../engine/index'
import {
  dataName, game, playerName, queryControl, useBanner, useBoardName, useControllers, usePresentationIdle, usePresentedState, usePresentedVp, usePrompt, usePromptLegal, useSettings,
} from '../contract'
import { ClockBar } from '../clock'
import { CardsButton } from './cards/HandTray'
import { elementInfos } from './cards/scenarioView'

import './hud.css'
import './cards/cards.css'
import { PHASE_WORD, windowWord } from './format'
import { isLegal } from './promptView'
import { PaintButton } from './PaintPanel'
import { SettingsButton } from './SettingsPopover'

type Control = NonNullable<ReturnType<typeof queryControl>>

/** Scenario control from the engine; held while an animation plays so it never runs ahead of the board. */
function useControl(state: GameState | null, idle: boolean): Control | null {
  const last = useRef<Control | null>(null)
  return useMemo(() => {
    if (!state) { last.current = null; return null }
    if (idle || !last.current) last.current = queryControl()
    return last.current
  }, [state, idle])
}

export function controlLabel(state: GameState, c: { controller: PlayerId | null; contested: boolean }): string {
  if (c.contested) return 'Contested'
  return c.controller ? `Held by ${playerName(state, c.controller)}` : 'Open'
}

function Banner() {
  const b = useBanner()
  if (!b) return null
  return (
    <div key={b.id} className={`hud-banner hud-banner-${b.kind}`} data-testid="hud-banner" role="status" style={{ animationDuration: `${Math.max(400, b.durationMs)}ms` }}>
      {b.text}
    </div>
  )
}

/** End turn / End activation, always in the same place; end turn asks twice when the setting says so. */
function EndButtons() {
  const pd = usePrompt()
  const legal = usePromptLegal()
  const { confirmEndTurn } = useSettings()
  const [armed, setArmed] = useState(false)
  useEffect(() => { setArmed(false) }, [pd?.id])
  if (!pd) return null
  const opts = pd.options ?? []
  const endTurn = opts.find((o) => o.action.type === 'endTurn')
  const endAtk = opts.find((o) => o.action.type === 'endAttacks')
  const skip = !endAtk ? opts.find((o) => o.action.type === 'chooseCombatAction' && o.action.choice === 'forfeit') : undefined
  return (
    <div className="hud-end">
      {(endAtk || skip) && (() => { const o = (endAtk ?? skip)!; return (
        <button type="button" className="hud-btn" data-testid="hud-end-activation" disabled={!isLegal(legal, o.action)} onClick={() => game.dispatch(o.action)}>
          {endAtk ? 'End activation' : 'Skip combat'}
        </button>) })()}
      {endTurn && (
        <button
          type="button" className={`hud-btn hud-btn-primary${armed ? ' hud-btn-armed' : ''}`} data-testid="hud-end-turn" disabled={!isLegal(legal, endTurn.action)}
          onClick={() => { if (confirmEndTurn && !armed) setArmed(true); else game.dispatch(endTurn.action) }}
        >
          {armed ? 'Really end turn?' : 'End turn'}
        </button>
      )}
    </div>
  )
}

/** The chips for the scenario elements: who holds each one (engine verdict), with tokens and the Kill Box depth where the scenario has them. */
function ElementChips({ state, control }: { state: GameState; control: Control | null }) {
  const controllers = useControllers()
  const human: PlayerId = controllers.A === 'bot' && controllers.B === 'human' ? 'B' : 'A'
  const infos = useMemo(() => elementInfos(state, human), [state, human])
  const els = control?.elements ?? {}
  const rows = infos.filter((i) => !i.removed && els[i.id])
  if (rows.length === 0 && control?.killBoxDepth === undefined) return null
  return (
    <div className="top-elements hud-card" data-testid="hud-control" title={dataName(state.scenario.id)}>
      {rows.map((i) => {
        const c = els[i.id]!
        return (
          <span key={i.id} className={`chip ctl ${c.contested ? 'ctl-contested' : c.controller ? `ctl-${c.controller}` : ''}`} data-testid={`hud-control-${i.id}`} data-controller={c.controller ?? ''} data-contested={c.contested ? 'true' : 'false'} data-tokens={i.tokens ?? ''}
            title={`${i.label}: ${controlLabel(state, c)}. ${c.reason}`}>
            <span className="ctl-dot" aria-hidden="true" />
            {i.short}
            {i.tokens !== null && <span className="ctl-tokens" data-testid={`hud-tokens-${i.id}`}>{i.tokens}</span>}
          </span>
        )
      })}
      {control?.killBoxDepth !== undefined && control.killBoxActive && <span className="chip" data-testid="hud-killbox-depth" title="How deep the Kill Box is this turn, for both players">{`Kill Box ${control.killBoxDepth}"`}</span>}
    </div>
  )
}

export function TopBar() {
  const state = usePresentedState()
  const vp = usePresentedVp()
  const idle = usePresentationIdle()
  const control = useControl(state, idle)
  const boardName = useBoardName()
  if (!state) return null
  const ended = state.phase === 'ended'
  const sides: PlayerId[] = ['A', 'B']
  return (
    <>
      <Banner />
      <header className="hud-top hud-card" data-testid="hud-topbar">
        <div className="top-turn" data-testid="hud-turn">
          <span className="top-round" data-testid="hud-round">{state.round > 0 ? `Round ${state.round}` : 'Pre-game'}</span>
          {state.turn > 0 && !ended && <span className="top-sub" data-testid="hud-turn-n">Turn {state.turn}</span>}
          <span className={`top-active side-${state.activePlayer}`} data-testid="hud-active">{ended ? 'Game over' : `${playerName(state, state.activePlayer)}'s turn`}</span>
        </div>
        <div className="top-board hud-dim" data-testid="hud-board" title="Battlefield">{boardName}</div>
        <div className="top-phase" data-testid="hud-phase" data-phase={state.phase} data-window={state.window}>
          <b>{PHASE_WORD[state.phase]}</b>
          {!ended && <span className="hud-dim"> {windowWord(state.window)}</span>}
        </div>
        <div className="top-vp" data-testid="hud-vp" aria-label="Victory points">
          {sides.map((p) => {
            const now = control?.vpNow[p]
            const have = vp?.[p] ?? 0
            return (
              <div key={p} className={`vp vp-${p}${state.activePlayer === p && !ended ? ' vp-active' : ''}`} data-testid={`hud-vp-${p}`}>
                <span className="vp-name">{playerName(state, p)}</span>
                <span className="vp-n" data-testid={`hud-vp-n-${p}`}>{have}</span>
                {now !== undefined && now !== have && <span className="vp-now" title="VP if the scenario were scored right now" data-testid={`hud-vp-now-${p}`}>{`→ ${now}`}</span>}
                {control?.killBoxActive && control.killBox[p] && <span className="chip chip-bad" data-testid={`hud-killbox-${p}`} title="This leader is in its kill box">kill box</span>}
              </div>
            )
          })}
        </div>
        <ClockBar />
        <div className="top-tools">
          <EndButtons />
          <CardsButton />
          <PaintButton />
          <SettingsButton />
        </div>
      </header>
      <ElementChips state={state} control={control} />
    </>
  )
}
