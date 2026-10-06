import { useMemo, useState } from 'react'
import { settings, useSettings } from '../../contract'
import { boardFromUrl, boardFor } from '../../board/boards'
import { SoundSettings } from '../../audio/SoundSettings'
import { TitleArt } from './TitleArt'
import { openHelp } from '../help/HelpGuide'
import { usePaint, usePaintStore, PAINT_PRESETS } from '../../figures/paintStore'
import { BOT_TIERS, battlefieldChoices, buildNewGame, type BotTierChoice, scenarioChoices, sideChoices, SPEED_CHOICES } from './startOptions'
import './start.css'

export interface StartScreenProps {
  /** Called with a rejection text when the game could not be built, else null after a successful start. */
  onStart(opts: NonNullable<ReturnType<typeof buildNewGame>>): string | null
  /** Resume the game in memory or the autosave; returns a rejection text or null. Omitted = no Continue button. */
  onContinue?(): string | null
  /** Label for the Continue button (e.g. "Continue game"), or null to hide it. */
  continueLabel?: string | null
}

export function StartScreen({ onStart, onContinue, continueLabel }: StartScreenProps) {
  const sides = useMemo(sideChoices, [])
  const scenarios = useMemo(scenarioChoices, [])
  const { speed, battlefield } = useSettings()
  const boards = useMemo(battlefieldChoices, [])
  const board = boardFor(battlefield)?.id ?? 'random'
  const [listId, setListId] = useState(sides[0]?.listId ?? '')
  const [scenario, setScenario] = useState(scenarios[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [tier, setTier] = useState<BotTierChoice>(BOT_TIERS[0].id)
  const side = sides.find((s) => s.listId === listId)
  const scn = scenarios.find((s) => s.id === scenario)
  const faction = side?.factionId ?? ''
  const paint = usePaint(faction, 'A')
  const setPaint = (v: { primary?: string; secondary?: string }) => usePaintStore.getState().setFaction(faction, v)
  const presetId = PAINT_PRESETS.find((pr) => pr.primary === paint?.primary && pr.secondary === paint?.secondary)?.id ?? (paint ? 'custom' : 'stock')

  const start = () => {
    // ?seed= gives a repeatable game (tests, bug reports)
    const seed = new URLSearchParams(location.search).get('seed') ?? undefined
    const urlBoard = boardFromUrl() // ?board= beats the selector
    const opts = buildNewGame({ listId, scenario, tier, board: urlBoard ?? board, ...(seed ? { seed } : {}) }, sides)
    if (!opts) { setError('Pick a side first.'); return }
    setError(onStart(opts))
  }

  return (
    <main className="start" data-testid="start-screen">
      <header className="start-title">
        <TitleArt />
        <h1 data-testid="title">Whirr Machine</h1>
        <p>An unofficial fan project, not affiliated with Steamforged Games.</p>
      </header>

      <div className="start-grid">
        <section className="start-card">
          <h2>Your side</h2>
          <div className="start-choices">
            {sides.map((s) => (
              <button key={s.listId} type="button" data-testid={`setup-faction-${s.factionId}`} className={s.listId === listId ? 'on' : ''}
                aria-pressed={s.listId === listId} onClick={() => setListId(s.listId)}>{s.factionName}</button>
            ))}
          </div>
          {side && (
            <ul className="start-models" data-testid="start-models">
              {side.models.map((m) => (
                <li key={m.profileId}><strong>{m.name}</strong><span>{m.role}{m.count > 1 ? `, ${m.count} models` : ''}</span></li>
              ))}
            </ul>
          )}
          {side && <p className="start-note">{side.listName}, {side.points} points.</p>}
          {side && (
            <div className="start-paint" data-testid="start-paint">
              <span>Paint</span>
              <input type="color" aria-label="Main colour" data-testid="start-paint-primary" value={paint?.primary ?? '#444444'} onChange={(e) => setPaint({ ...paint, primary: e.target.value })} />
              <input type="color" aria-label="Trim colour" data-testid="start-paint-secondary" value={paint?.secondary ?? '#888888'} onChange={(e) => setPaint({ ...paint, secondary: e.target.value })} />
              <select aria-label="Paint preset" data-testid="start-paint-preset" value={presetId} onChange={(e) => {
                const pr = PAINT_PRESETS.find((x) => x.id === e.target.value)
                if (pr) setPaint({ primary: pr.primary, secondary: pr.secondary }); else if (e.target.value === 'stock') setPaint({})
              }}>
                <option value="stock">Stock</option>
                {presetId === 'custom' && <option value="custom">Custom</option>}
                {PAINT_PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
              </select>
            </div>
          )}
        </section>

        <section className="start-card">
          <h2>Match</h2>
          <label>Opponent
            <select data-testid="start-opponent" defaultValue={BOT_TIERS[0].id} onChange={(e) => setTier(e.target.value as BotTierChoice)}>
              {BOT_TIERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </label>
          <p className="start-note" data-testid="start-opponent-note">{BOT_TIERS.find((b) => b.id === tier)?.note}</p>
          <label>Scenario
            <select data-testid="start-scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {scn?.text && <p className="start-note">{scn.text}</p>}
          <label>Battlefield
            <select data-testid="start-battlefield" value={board} onChange={(e) => settings.set({ battlefield: e.target.value })}>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <div className="start-label">Animation speed</div>
          <div className="start-choices small">
            {SPEED_CHOICES.map((s) => (
              <button key={s.id} type="button" data-testid={`start-speed-${s.id}`} className={s.value === speed ? 'on' : ''}
                aria-pressed={s.value === speed} onClick={() => settings.set({ speed: s.value })}>{s.label}</button>
            ))}
          </div>
        </section>
        <SoundSettings />
      </div>

      {error && <p className="start-error" role="alert">{error}</p>}
      <div className="start-actions">
        <button type="button" className="start-go" data-testid="start-button" disabled={!side || !scn} onClick={start}>Start</button>
        {onContinue && continueLabel && <button type="button" className="start-help" data-testid="start-continue" onClick={() => setError(onContinue())}>{continueLabel}</button>}
        <button type="button" className="start-help" data-testid="start-howto" onClick={() => openHelp()}>How to Play</button>
      </div>
      <footer className="start-foot">All names and text are used in a fan-made, non-commercial way. No official art is included.</footer>
    </main>
  )
}
