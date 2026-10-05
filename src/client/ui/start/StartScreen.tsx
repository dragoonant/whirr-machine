import { useMemo, useState } from 'react'
import { settings, useSettings } from '../../contract'
import { SoundSettings } from '../../audio/SoundSettings'
import { openHelp } from '../help/HelpGuide'
import { BOT_TIERS, buildNewGame, scenarioChoices, sideChoices, SPEED_CHOICES } from './startOptions'
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
  const { speed } = useSettings()
  const [listId, setListId] = useState(sides[0]?.listId ?? '')
  const [scenario, setScenario] = useState(scenarios[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const side = sides.find((s) => s.listId === listId)
  const scn = scenarios.find((s) => s.id === scenario)

  const start = () => {
    // ?seed= gives a repeatable game (tests, bug reports)
    const seed = new URLSearchParams(location.search).get('seed') ?? undefined
    const opts = buildNewGame({ listId, scenario, ...(seed ? { seed } : {}) }, sides)
    if (!opts) { setError('Pick a side first.'); return }
    setError(onStart(opts))
  }

  return (
    <main className="start" data-testid="start-screen">
      <header className="start-title">
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
        </section>

        <section className="start-card">
          <h2>Match</h2>
          <label>Opponent
            <select data-testid="start-opponent" defaultValue={BOT_TIERS[0].id}>
              {BOT_TIERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </label>
          <label>Scenario
            <select data-testid="start-scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {scn?.text && <p className="start-note">{scn.text}</p>}
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
