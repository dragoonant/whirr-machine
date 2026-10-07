import { useMemo, useState } from 'react'
import { settings, useSettings } from '../../contract'
import { useSettingsStore } from '../../store/settingsStore'
import { boardFromUrl, boardFor } from '../../board/boards'
import { SoundSettings } from '../../audio/SoundSettings'
import { TitleArt } from './TitleArt'
import { openHelp } from '../help/HelpGuide'
import { usePaint, usePaintStore, PAINT_PRESETS } from '../../figures/paintStore'
import {
  beginClock, clockConfigFromStart, CUSTOM_MINUTES, describeClock, loadClockChoices, PER_TURN_SECONDS, saveClockChoices, type ClockMode, type ClockStartChoices,
} from '../../clock'
import {
  BOT_TIERS, battlefieldChoices, buildNewGame, cardPool, cardsDefault, DEFAULT_GAME_SIZE, defaultHand, defaultScenarioId, GAME_SIZES, HAND_LIMIT,
  type BotTierChoice, type GameSize, parseGameSize, scenarioOptions, sideChoices, sizeFromUrl, SPEED_CHOICES,
} from './startOptions'
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
  // Game size: a click wins, then `?size=` in the URL, then the remembered choice, then recon.
  const storedSize = useSettingsStore((s) => s.size)
  const urlSize = useMemo(() => sizeFromUrl(), [])
  const [picked, setPicked] = useState<GameSize | null>(null)
  const size: GameSize = picked ?? urlSize ?? parseGameSize(storedSize) ?? DEFAULT_GAME_SIZE
  const sizeInfo = GAME_SIZES.find((g) => g.id === size) ?? GAME_SIZES[0]!
  const sides = useMemo(() => sideChoices(size), [size])
  const scenarios = useMemo(() => scenarioOptions(size), [size])
  const { speed, battlefield } = useSettings()
  const boards = useMemo(battlefieldChoices, [])
  const board = boardFor(battlefield)?.id ?? 'random'
  // the army is remembered by faction, so changing the size keeps your side (its list of that size)
  const [factionPick, setFactionPick] = useState('')
  const [scenarioPick, setScenarioPick] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [opponent, setOpponent] = useState<string>('random')
  const [tier, setTier] = useState<BotTierChoice>(BOT_TIERS[0].id)
  // command cards (91 A.4): null = follow the default for the size and scenario
  const [cardsPick, setCardsPick] = useState<boolean | null>(null)
  const [handPick, setHandPick] = useState<Record<string, string[]>>({})
  // the game clock (91 C.2): remembered between visits under its own key
  const [clock, setClockState] = useState<ClockStartChoices>(() => loadClockChoices())
  const setClock = (patch: Partial<ClockStartChoices>) => setClockState((c) => { const next = { ...c, ...patch }; saveClockChoices(next); return next })
  const side = sides.find((s) => s.factionId === factionPick) ?? sides[0]
  const listId = side?.listId ?? ''
  const scenario = scenarios.find((s) => s.id === scenarioPick[size])?.id ?? defaultScenarioId(size, scenarios)
  const scn = scenarios.find((s) => s.id === scenario)
  const faction = side?.factionId ?? ''
  const cardsOn = scenario === 'scn-qs-demo' ? false : (cardsPick ?? cardsDefault(size, scenario))
  const pool = useMemo(() => (listId ? cardPool(listId) : []), [listId])
  const hand = handPick[listId] ?? defaultHand(listId)
  const clockConfig = clockConfigFromStart({ ...clock, size })
  const chooseSize = (v: string) => {
    const next = parseGameSize(v)
    if (!next) return
    setPicked(next); setError(null)
    settings.set({ size: next })
  }
  const paint = usePaint(faction, 'A')
  const setPaint = (v: { primary?: string; secondary?: string }) => usePaintStore.getState().setFaction(faction, v)
  const presetId = PAINT_PRESETS.find((pr) => pr.primary === paint?.primary && pr.secondary === paint?.secondary)?.id ?? (paint ? 'custom' : 'stock')

  const start = () => {
    // ?seed= gives a repeatable game (tests, bug reports)
    const seed = new URLSearchParams(location.search).get('seed') ?? undefined
    const urlBoard = boardFromUrl() // ?board= beats the selector
    const opts = buildNewGame({ listId, opponentListId: sides.find((s) => s.factionId === opponent)?.listId ?? 'random', scenario, tier, board: urlBoard ?? board, cards: cardsOn, ...(cardsOn && pool.length > HAND_LIMIT ? { hand } : {}), ...(seed ? { seed } : {}) }, sides)
    if (!opts) { setError('Pick a side first.'); return }
    const err = onStart(opts)
    setError(err)
    // the clock starts with the game it was chosen for (null = off)
    if (!err) beginClock(clockConfig)
  }

  return (
    <main className="start" data-testid="start-screen">
      <header className="start-title">
        <TitleArt />
        <h1 data-testid="title">Whirr Machine</h1>
        <p>An unofficial fan project, not affiliated with Steamforged Games.</p>
      </header>

      <div className="start-grid">
        <section className="start-card start-size" data-testid="start-size-card">
          <h2>Game size</h2>
          <select aria-label="Game size" data-testid="start-size" value={size} onChange={(e) => chooseSize(e.target.value)}>
            {GAME_SIZES.map((g) => <option key={g.id} value={g.id}>{`${g.label}: ${g.points} points, ${g.table} inch table`}</option>)}
          </select>
          <p className="start-note" data-testid="start-size-note">{sizeInfo.note}</p>
        </section>
        <section className="start-card">
          <h2>Your side</h2>
          <div className="start-choices">
            {sides.map((s) => (
              <button key={s.listId} type="button" data-testid={`setup-faction-${s.factionId}`} className={s.listId === listId ? 'on' : ''}
                aria-pressed={s.listId === listId} onClick={() => setFactionPick(s.factionId)}>{s.factionName}</button>
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
        <div className="start-rules" data-testid="start-rules">
          <div className="start-rule" data-testid="start-cards">
            <span className="start-rule-name">Command cards</span>
            <div className="start-choices small">
              {([true, false] as const).map((on) => (
                <button key={String(on)} type="button" data-testid={`start-cards-${on ? 'on' : 'off'}`} className={cardsOn === on ? 'on' : ''} aria-pressed={cardsOn === on}
                  disabled={scenario === 'scn-qs-demo' && on} onClick={() => setCardsPick(on)}>{on ? 'On' : 'Off'}</button>
              ))}
            </div>
            <span className="start-note" data-testid="start-cards-note">
              {scenario === 'scn-qs-demo' ? 'Off for the demo' : cardsOn ? '5 cards, 2 plays a turn' : 'No cards'}
            </span>
          </div>
          {cardsOn && pool.length > HAND_LIMIT && (
            <div className="start-hand" data-testid="start-hand">
              <span className="start-rule-name">Your five</span>
              {pool.map((c) => (
                <label key={c.id} title={c.text}>
                  <input type="checkbox" data-testid={`start-hand-${c.id}`} checked={hand.includes(c.id)}
                    disabled={!hand.includes(c.id) && hand.length >= HAND_LIMIT}
                    onChange={(e) => setHandPick((m) => ({ ...m, [listId]: e.target.checked ? [...hand, c.id] : hand.filter((x) => x !== c.id) }))} /> {c.name}
                </label>
              ))}
            </div>
          )}
          <div className="start-rule" data-testid="start-clock">
            <span className="start-rule-name">Clock</span>
            <div className="start-choices small">
              {([['off', 'Off'], ['steamroller', 'Steamroller'], ['custom', 'Custom']] as [ClockMode, string][]).map(([m, label]) => (
                <button key={m} type="button" data-testid={`start-clock-${m}`} className={clock.mode === m ? 'on' : ''} aria-pressed={clock.mode === m} onClick={() => setClock({ mode: m })}>{label}</button>
              ))}
            </div>
            {clock.mode === 'custom' && (
              <>
                <label className="start-inline">Minutes
                  <select data-testid="start-clock-minutes" value={clock.minutes ?? 30} onChange={(e) => setClock({ minutes: Number(e.target.value) })}>
                    {Array.from({ length: (CUSTOM_MINUTES.max - CUSTOM_MINUTES.min) / CUSTOM_MINUTES.step + 1 }, (_, i) => CUSTOM_MINUTES.min + i * CUSTOM_MINUTES.step).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="start-inline">+ s a turn
                  <select data-testid="start-clock-turn" value={clock.perTurnSeconds ?? 0} onChange={(e) => setClock({ perTurnSeconds: Number(e.target.value) })}>
                    {PER_TURN_SECONDS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="start-inline start-check"><input type="checkbox" data-testid="start-clock-pause" checked={clock.allowPause !== false} onChange={(e) => setClock({ allowPause: e.target.checked })} /> Pause</label>
              </>
            )}
            {clock.mode !== 'off' && <label className="start-inline start-check"><input type="checkbox" data-testid="start-clock-timebot" checked={!!clock.timeBot} onChange={(e) => setClock({ timeBot: e.target.checked })} /> Time the bot</label>}
            {clock.mode === 'steamroller' && <span className="start-note" data-testid="start-clock-note">{describeClock(clockConfig)}</span>}
          </div>
        </div>
        </section>

        <section className="start-card">
          <h2>Match</h2>
          <label>Opponent
            <select data-testid="start-opponent" defaultValue={BOT_TIERS[0].id} onChange={(e) => setTier(e.target.value as BotTierChoice)}>
              {BOT_TIERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </label>
          <label>Opponent army
            <select data-testid="start-opponent-army" value={opponent} onChange={(e) => setOpponent(e.target.value)}>
              <option value="random">Random army</option>
              {sides.map((s) => <option key={s.listId} value={s.factionId}>{s.factionName}: {s.listName}</option>)}
            </select>
          </label>
          <p className="start-note" data-testid="start-opponent-note">{BOT_TIERS.find((b) => b.id === tier)?.note}</p>
          <label>Scenario
            <select data-testid="start-scenario" value={scenario} onChange={(e) => setScenarioPick((m) => ({ ...m, [size]: e.target.value }))}>
              {scenarios.some((s) => s.group === 'other') && scenarios.some((s) => s.group === 'steamroller') ? (
                <>
                  <optgroup label="Training and Skirmish">{scenarios.filter((s) => s.group === 'other').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
                  <optgroup label="Steamroller 2026">{scenarios.filter((s) => s.group === 'steamroller').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
                </>
              ) : scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
