// Client core (50 §2, §10): GameRunner store, presentation director, bot driver, save/load, test hooks.
// Headless: no React, no DOM. Animation speed 0 makes the director drain synchronously.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Action, GameEvent, GameState, RollPurpose } from '../../src/engine/index'
import {
  dispatch, exportSave, importSave, legalFor, listSaves, loadGame, newGame, resetGameStore, saveGame, useGameStore,
  EVENT_LOG_LIMIT,
} from '../../src/client/store/gameStore'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { ui, useUiStore } from '../../src/client/store/uiStore'
import { createBotDriver } from '../../src/client/bot/botDriver'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import { setDirectorClock, setPaused, skipAll, skipBeat, type DirectorClock } from '../../src/client/presentation/director'
import { useAnnounceStore } from '../../src/client/presentation/announceStore'
import { buildBeats, pointAlong, type SeqEvent } from '../../src/client/presentation/beats'
import { ROLL_PURPOSE_LABELS } from '../../src/client/presentation/labels'
import { createTestApi, setupFromUrl } from '../../src/client/store/testHooks'
import { game, tweenPosition } from '../../src/client/contract'

const QS = { scenario: 'scn-qs-demo', lists: { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' } }
const ASH = { scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }

/** Manual clock: timers fire only when advance() passes them. */
function manualClock(): DirectorClock & { advance(ms: number): void; t: number; pending(): number } {
  let t = 0, id = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  return {
    get t() { return t },
    now: () => t,
    setTimeout(fn, ms) { const h = ++id; timers.set(h, { at: t + ms, fn }); return h },
    clearTimeout(h) { timers.delete(h as number) },
    pending: () => timers.size,
    advance(ms) {
      const end = t + ms
      for (;;) {
        let next: [number, { at: number; fn: () => void }] | null = null
        for (const e of timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e
        if (!next) break
        timers.delete(next[0])
        t = next[1].at
        next[1].fn()
      }
      t = end
    },
  }
}

beforeEach(() => {
  setStorage(memoryStorage())
  setDirectorClock(null)
  useSettingsStore.getState().set({ speed: 0, narration: true })
  setPaused(false)
  resetGameStore()
})
afterEach(() => {
  setDirectorClock(null)
  setPaused(false)
})

describe('client store: bot vs bot through the store', () => {
  it('plays a whole game headless; the presented state ends equal to the true state', () => {
    expect(newGame({ ...ASH, controllers: { A: 'bot', B: 'bot' }, seed: 'store-1' })).toBeNull()
    const driver = createBotDriver({ thinkMs: 0 })
    let steps = 0
    for (; steps < 6000; steps++) {
      const g = useGameStore.getState()
      if (g.pending?.kind === 'gameOver') break
      const r = driver.tick()
      expect(r, `tick ${steps} on ${g.pending?.kind}`).toBe('answered')
      expect(useGameStore.getState().fatal).toBeNull()
    }
    const g = useGameStore.getState()
    const p = usePresentedStore.getState()
    expect(g.pending?.kind).toBe('gameOver')
    expect(g.state?.phase).toBe('ended')
    expect(driver.forced).toBe(0)
    // presentation caught up exactly
    expect(p.idle).toBe(true)
    expect(p.state).toBe(g.state)
    expect(p.cursor).toBe(g.eventSeq)
    expect(p.beat).toBeNull()
    expect(Object.keys(p.tweens)).toHaveLength(0)
    // logs
    expect(steps).toBeGreaterThan(50)
    expect(g.events.length).toBe(Math.min(g.eventSeq, EVENT_LOG_LIMIT))
    expect(g.events[g.events.length - 1]!.seq).toBe(g.eventSeq)
    expect(p.diceLog.length).toBeGreaterThan(10)
    expect(p.diceLog.every((r) => r.label.length > 0)).toBe(true)
    expect(p.state?.scenario.result).toBeTruthy()
    const lines = useAnnounceStore.getState().lines
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.some((l) => /wins|draw/i.test(l.text))).toBe(true)
    // the bot does not answer gameOver
    expect(driver.tick()).toBe('notBot')

    // save / load round trip through storage
    expect(saveGame('end', 'finished')).toBe(true)
    const before = JSON.stringify(g.state)
    resetGameStore()
    expect(loadGame('end')).toBeNull()
    expect(JSON.stringify(useGameStore.getState().state)).toBe(before)
    expect(usePresentedStore.getState().state).toBe(useGameStore.getState().state)
    expect(useGameStore.getState().controllers).toEqual({ A: 'bot', B: 'bot' })
    expect(listSaves().map((s) => s.slot)).toContain('end')
  })
})

describe('client store: dispatch and rejections', () => {
  it('rejects with our words and keeps the state', () => {
    newGame({ ...QS, controllers: { A: 'human', B: 'human' }, seed: 'rej-1' })
    const s0 = useGameStore.getState().state!
    const pd = s0.pending
    const rej = dispatch({ type: 'pass', decisionId: 'd:bogus', player: pd.player } as Action)
    expect(rej?.code).toBe('E_WRONG_DECISION')
    expect(rej?.text).toMatch(/current question/)
    expect(useGameStore.getState().lastRejection?.id).toBe(rej?.id)
    expect(useGameStore.getState().state).toBe(s0)
    // an accepted step clears the rejection
    const legal = legalFor(s0)
    expect(dispatch(legal[0]!)).toBeNull()
    expect(useGameStore.getState().lastRejection).toBeNull()
    expect(useGameStore.getState().state).not.toBe(s0)
  })

  it("refuses a human answer to the bot's decision, but the test hook may answer it", () => {
    newGame({ ...QS, controllers: { A: 'bot', B: 'bot' }, seed: 'own-1' })
    const s0 = useGameStore.getState().state!
    const legal = legalFor(s0)
    expect(game.dispatch(legal[0]!)?.code).toBe('E_NOT_YOUR_DECISION')
    expect(useGameStore.getState().state).toBe(s0)
    expect(createTestApi().dispatch(legal[0]!)).toBeNull()
  })

  it('game.answer / answerOption fill decisionId and player', () => {
    newGame({ ...QS, controllers: { A: 'human', B: 'human' }, seed: 'ans-1' })
    const pd = useGameStore.getState().pending!
    if (pd.options?.length) {
      expect(game.answerOption(pd.options[0]!.id)).toBeNull()
    } else {
      const a = legalFor(useGameStore.getState().state)[0]!
      const { decisionId: _d, player: _p, ...payload } = a as Action & Record<string, unknown>
      expect(game.answer(payload as never)).toBeNull()
    }
    expect(useGameStore.getState().pending!.id).not.toBe(pd.id)
  })

  it('a bad setup is refused and leaves no game', () => {
    const rej = newGame({ scenario: 'scn-qs-demo', lists: { A: 'nope', B: 'kha.l.qs-recon' } })
    expect(rej?.code).toBe('E_BAD_SETUP')
    expect(useGameStore.getState().state).toBeNull()
  })

  it('importSave refuses junk and loads a bare engine SaveFile', () => {
    expect(importSave({ hello: 1 })?.code).toBe('E_BAD_PAYLOAD')
    newGame({ ...QS, controllers: { A: 'bot', B: 'bot' }, seed: 'imp-1' })
    const d = createBotDriver({ thinkMs: 0 })
    for (let i = 0; i < 40; i++) d.tick()
    const save = exportSave('x')!
    const json = JSON.stringify(useGameStore.getState().state)
    resetGameStore()
    expect(importSave(save.file)).toBeNull()
    expect(JSON.stringify(useGameStore.getState().state)).toBe(json)
  })
})

describe('presentation director', () => {
  it('holds prompts and the bot until the beats have played; skip and skipAll catch up', () => {
    const clock = manualClock()
    setDirectorClock(clock)
    useSettingsStore.getState().set({ speed: 1 })
    newGame({ ...ASH, controllers: { A: 'bot', B: 'bot' }, seed: 'pres-1' })
    const driver = createBotDriver({ thinkMs: 0, now: () => clock.t })
    // creation events (roll-off dice) are animating
    expect(usePresentedStore.getState().idle).toBe(false)
    expect(driver.tick()).toBe('waiting')
    const beat = usePresentedStore.getState().beat
    expect(beat).not.toBeNull()
    skipBeat()
    expect(usePresentedStore.getState().beat?.id ?? -1).not.toBe(beat!.id)
    clock.advance(60_000)
    expect(usePresentedStore.getState().idle).toBe(true)
    expect(usePresentedStore.getState().state).toBe(useGameStore.getState().state)
    // play on until a move is animating, then check the tween
    let sawTween = false
    for (let i = 0; i < 400 && !sawTween; i++) {
      expect(driver.tick()).toBe('answered')
      for (let k = 0; k < 50 && !usePresentedStore.getState().idle; k++) {
        const tw = Object.values(usePresentedStore.getState().tweens)[0]
        if (tw) {
          sawTween = true
          const truePos = useGameStore.getState().state!.models[tw.modelId]!.pos
          const mid = tweenPosition(tw, tw.startedAt + tw.durationMs / 2)
          expect(Number.isFinite(mid.x) && Number.isFinite(mid.z)).toBe(true)
          const end = tweenPosition(tw, tw.startedAt + tw.durationMs)
          expect(end.x).toBeCloseTo(truePos.x, 5)
          expect(end.z).toBeCloseTo(truePos.z, 5)
          break
        }
        clock.advance(100)
      }
      skipAll()
      expect(usePresentedStore.getState().idle).toBe(true)
      expect(usePresentedStore.getState().state).toBe(useGameStore.getState().state)
    }
    expect(sawTween).toBe(true)
  })

  it('pause blocks the bot; the 5 s watchdog force-answers', () => {
    const clock = manualClock()
    setDirectorClock(clock)
    newGame({ ...QS, controllers: { A: 'bot', B: 'bot' }, seed: 'dog-1' })
    let now = 0
    const driver = createBotDriver({ thinkMs: 0, now: () => now })
    expect(driver.tick()).toBe('answered') // speed 0: idle
    useSettingsStore.getState().set({ speed: 1 })
    setPaused(true)
    const id0 = useGameStore.getState().pending!.id
    // the next answer queues a batch that cannot play while paused
    expect(createTestApi().dispatch(legalFor(useGameStore.getState().state)[0]!)).toBeNull()
    expect(usePresentedStore.getState().idle).toBe(false)
    const id1 = useGameStore.getState().pending!.id
    expect(id1).not.toBe(id0)
    expect(driver.tick()).toBe('waiting')
    now += 4999
    expect(driver.tick()).toBe('waiting')
    now += 2
    expect(driver.tick()).toBe('forced')
    expect(driver.forced).toBe(1)
    expect(useGameStore.getState().pending!.id).not.toBe(id1)
  })

  it('buildBeats: moves tween along their path and land at the end; dice, damage and banners get beats', () => {
    newGame({ ...QS, controllers: { A: 'bot', B: 'bot' }, seed: 'beats-1' })
    const st = useGameStore.getState().state as GameState
    const id = Object.keys(st.models)[0]!
    const from = st.models[id]!.pos
    const to = { x: from.x + 3, z: from.z }
    const evs: GameEvent[] = [
      { type: 'RoundStarted', round: 2 },
      { type: 'ModelMoved', modelId: id, kind: 'advance', from, to, path: [{ x: from.x + 1.5, z: from.z + 1 }, to], distance: 3.6, elevAfter: 0 },
      { type: 'DiceRolled', rollId: 'r:1', purpose: 'attack', dice: [3, 4], kept: [3, 4], total: 14, target: 13 },
      { type: 'DamageApplied', targetId: id, source: 'direct', points: 2, damageTypes: [], boxes: [], crippled: [], overflow: 0 },
      { type: 'FocusChanged', modelId: id, delta: -1, after: 0, reason: 'spend' },
    ]
    const seq: SeqEvent[] = evs.map((event, i) => ({ seq: i + 1, event }))
    const beats = buildBeats(st, seq, { narration: true, playerName: (p) => p, modelName: (m) => m })
    expect(beats.map((b) => b.kind)).toEqual(['banner', 'move', 'dice', 'damage', 'apply'])
    const mv = beats[1]!
    expect(mv.applyAt).toBe('end')
    expect(mv.tweens![0]!.points).toHaveLength(3)
    expect(pointAlong(mv.tweens![0]!.points, 1)).toEqual(to)
    expect(beats[3]!.pops![0]!.text).toBe('-2')
  })
})

describe('labels and URL setup', () => {
  it('every roll purpose has a label', () => {
    const purposes: RollPurpose[] = ['rollOff', 'attack', 'damage', 'column', 'tough', 'continuous', 'slamDist', 'throwDist', 'fall', 'rof', 'd3', 'aoeTie', 'collateral', 'spell', 'maintenance', 'scenario', 'other']
    for (const p of purposes) expect(ROLL_PURPOSE_LABELS[p]).toBeTruthy()
  })

  it('setupFromUrl reads scenario, lists (ids or factions), seed and controllers', () => {
    expect(setupFromUrl('?test=1')).toBeNull()
    const o = setupFromUrl('?scenario=scn-ashwall-divide&lists=kha,cyg.l.qs-recon&seed=s9&control=bot,human&bot=random')!
    expect(o).toEqual({ scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' }, controllers: { A: 'bot', B: 'human' }, bot: { tier: 'random' }, seed: 's9' })
  })

  it('UI mode follows decisions unless a tool is locked', () => {
    expect(useUiStore.getState().mode).toBe('select')
    ui.followDecision('moveModel', 'A:L')
    expect(useUiStore.getState()).toMatchObject({ mode: 'move', selectedId: 'A:L' })
    ui.toggleTool('measure')
    ui.followDecision('chooseAttack')
    expect(useUiStore.getState().mode).toBe('measure')
    ui.toggleTool('measure')
    ui.followDecision('chooseAttack')
    expect(useUiStore.getState().mode).toBe('target')
  })
})
