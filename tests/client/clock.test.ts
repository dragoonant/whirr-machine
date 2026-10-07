// M13 game clock, client side (91 C.2, CLK-001 to CLK-006, CLK-013, CLK-014): presets, charging, pauses, bot, expiry, saves, per-turn bonus.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickSensible } from '../../src/ai/random'
import { ClockBar, chipOrder } from '../../src/client/clock/ClockBar'
import {
  addTurnBonus, chargeInfo, clockCauseLine, clockConfigFromStart, clockFromUrl, clockTone, crossedWarnings, describeClock, drain, formatClock, fullPools,
  isClockedDecision, snapCustomMinutes, snapPerTurnSeconds, steamrollerMinutes, type ClockConfig, type ClockInputs,
} from '../../src/client/clock/clockModel'
import {
  beginClock, clockSaveKey, getClock, installClock, loadClockChoices, openModalLabel, resetClock, restoreClock, saveClock, saveClockChoices, tickClock, toggleUserPause,
  turnClockOff, useClockStore,
} from '../../src/client/clock/clockStore'
import { useAnnounceStore } from '../../src/client/presentation/announceStore'
import { setDirectorClock, setPaused } from '../../src/client/presentation/director'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import { dispatch, legalFor, newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { getStorage, memoryStorage, setStorage } from '../../src/client/store/storage'
import { ui } from '../../src/client/store/uiStore'
import type { GameState } from '../../src/engine/index'

const QS = { scenario: 'scn-qs-demo', lists: { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' }, controllers: { A: 'human', B: 'human' } as const }
const STEAM = (points = 30): ClockConfig => clockConfigFromStart({ mode: 'steamroller', points })!
const CUSTOM = (o: Partial<Parameters<typeof clockConfigFromStart>[0]> = {}): ClockConfig => clockConfigFromStart({ mode: 'custom', minutes: 30, ...o })!

beforeEach(() => {
  setStorage(memoryStorage())
  setDirectorClock(null)
  useSettingsStore.getState().set({ speed: 0, narration: true })
  setPaused(false)
  resetGameStore()
  resetClock()
  useAnnounceStore.setState({ banner: null, lines: [] })
  ui.reset()
})
afterEach(() => { resetClock(); setDirectorClock(null); setPaused(false); vi.unstubAllGlobals() })

/** Answer every decision with its first option until the open decision is `kind` (human/human game). */
function advanceTo(kind: string, limit = 80): void {
  for (let i = 0; i < limit && useGameStore.getState().pending!.kind !== kind; i++) {
    const g = useGameStore.getState()
    const a = g.pending!.options?.[0]?.action
    if (!a) throw new Error(`no option at ${g.pending!.kind}`)
    const r = dispatch(a, 'test')
    if (r) throw new Error(`rejected ${r.code}`)
  }
  expect(useGameStore.getState().pending!.kind).toBe(kind)
}
/** renderToStaticMarkup reads each store's initial snapshot: copy the live state in first. */
function html0(el: ReturnType<typeof createElement>): string {
  for (const st of [usePresentedStore, useGameStore, useClockStore]) Object.assign(st.getInitialState() as object, st.getState() as object)
  return renderToStaticMarkup(el)
}
const pendingKind = (): string => useGameStore.getState().pending!.kind

const inputs = (state: GameState | null, over: Partial<ClockInputs> = {}): ClockInputs => ({
  state, controllers: { A: 'human', B: 'human' }, presentationIdle: true, presentationPaused: false, modal: null, tabAway: false, userPaused: false, restoreHold: false, ...over,
})

describe('CLK-001 presets and configuration', () => {
  it('CLK-001 Steamroller pools by points: 30 is 20 minutes, 50 is 30, 75 is 50, 100 is 60', () => {
    expect([30, 50, 75, 100].map(steamrollerMinutes)).toEqual([20, 30, 50, 60])
    expect([20, 40, 60, 90, 120].map(steamrollerMinutes)).toEqual([20, 30, 50, 60, 60])
    expect(STEAM(30).poolMs).toBe(20 * 60_000)
    expect(clockConfigFromStart({ mode: 'steamroller', size: 'skirmish' })!.poolMs).toBe(30 * 60_000)
    expect(clockConfigFromStart({ mode: 'steamroller', size: 'recon' })!.poolMs).toBe(20 * 60_000)
  })
  it('CLK-001 Steamroller forbids pausing and per-turn time; Custom snaps to its 5-minute steps and 5-90 range', () => {
    const s = clockConfigFromStart({ mode: 'steamroller', points: 30, allowPause: true, perTurnSeconds: 60 })!
    expect(s).toMatchObject({ mode: 'steamroller', allowPause: false, perTurnMs: 0, timeBot: false })
    expect([1, 7, 12, 33, 90, 200, NaN].map(snapCustomMinutes)).toEqual([5, 5, 10, 35, 90, 90, 30])
    expect([0, 5, 12, 21, 45, 999].map(snapPerTurnSeconds)).toEqual([0, 0, 10, 30, 30, 60])
    const c = CUSTOM({ minutes: 42, perTurnSeconds: 28, timeBot: true })
    expect(c).toMatchObject({ mode: 'custom', poolMs: 40 * 60_000, perTurnMs: 30_000, timeBot: true, allowPause: true })
  })
  it('CLK-002 mode off means no config', () => {
    expect(clockConfigFromStart({ mode: 'off', points: 30 })).toBeNull()
    expect(describeClock(null)).toBe('Clock off')
    expect(describeClock(STEAM())).toContain('20 minutes each')
    expect(describeClock(CUSTOM({ perTurnSeconds: 30 }))).toContain('+30 s per turn')
  })
  it('CLK-002 ?clock= reads steamroller, off or a number of minutes; anything else says nothing', () => {
    expect(clockFromUrl('')).toBeUndefined()
    expect(clockFromUrl('?clock=off')).toBeNull()
    expect(clockFromUrl('?clock=steamroller', 50)!.poolMs).toBe(30 * 60_000)
    expect(clockFromUrl('?clock=20')).toMatchObject({ mode: 'custom', poolMs: 20 * 60_000, timeBot: false })
    expect(clockFromUrl('?clock=banana')).toBeUndefined()
  })
  it('CLK-001 start-screen choices are remembered', () => {
    expect(loadClockChoices()).toMatchObject({ mode: 'off', timeBot: false })
    saveClockChoices({ mode: 'custom', minutes: 45, perTurnSeconds: 10, timeBot: true, allowPause: false })
    expect(loadClockChoices()).toEqual({ mode: 'custom', minutes: 45, perTurnSeconds: 10, timeBot: true, allowPause: false })
    getStorage().setItem('wm.clock.settings', '{"mode":"nonsense","minutes":"x"}')
    expect(loadClockChoices().mode).toBe('off')
  })
})

describe('display', () => {
  it('formats mm:ss, tenths under 10 s, rounding up so zero is only at expiry', () => {
    expect([20 * 60_000, 61_000, 59_001, 10_000, 9_999, 9_001, 4_500, 1, 0].map(formatClock)).toEqual(['20:00', '1:01', '1:00', '0:10', '10.0', '9.1', '4.5', '0.1', '0.0'])
  })
  it('amber under 5:00, red under 1:00, out at zero', () => {
    expect([10 * 60_000, 5 * 60_000, 299_999, 60_000, 59_999, 1, 0].map(clockTone)).toEqual(['ok', 'ok', 'low', 'low', 'critical', 'critical', 'out'])
  })
  it('warnings fire once as a pool crosses 5:00 and 1:00', () => {
    expect(crossedWarnings(301_000, 299_000)).toEqual([300_000])
    expect(crossedWarnings(299_000, 298_000)).toEqual([])
    expect(crossedWarnings(61_000, 59_000)).toEqual([60_000])
    expect(crossedWarnings(301_000, 59_000)).toEqual([300_000, 60_000])
  })
  it('the left chip is the human; the cause line names the leader, the winner and how', () => {
    expect(chipOrder({ A: 'human', B: 'bot' })).toEqual(['A', 'B'])
    expect(chipOrder({ A: 'bot', B: 'human' })).toEqual(['B', 'A'])
    expect(chipOrder({ A: 'human', B: 'human' })).toEqual(['A', 'B'])
    const state = { scenario: { result: { winner: 'B', reason: 'assassination', timeout: 'A' } } } as unknown as GameState
    expect(clockCauseLine(state, (p) => (p === 'A' ? 'Cygnar' : 'Khador'), (p) => (p === 'A' ? 'Caine' : 'Vilkul'))).toBe("Caine's clock ran out; Khador wins by assassination")
    expect(clockCauseLine({ scenario: { result: { winner: 'A', reason: 'scenario', timeout: 'B' } } } as unknown as GameState, (p) => p, (p) => `L${p}`)).toBe("LB's clock ran out; A wins by scenario victory")
    expect(clockCauseLine({ scenario: { result: { winner: 'A', reason: 'assassination' } } } as unknown as GameState, (p) => p, (p) => p)).toBeNull()
  })
})

describe('CLK-003 who is charged', () => {
  it('CLK-003 nobody before normal deployment (turn order, edge) and nobody at game over; the decision owner during deployment', () => {
    expect(newGame({ ...QS, seed: 'clk3' })).toBeNull()
    const cfg = STEAM()
    const kinds: string[] = []
    for (let i = 0; i < 40 && pendingKind() !== 'chooseActivation'; i++) {
      const g = useGameStore.getState()
      const pd = g.pending!
      const info = chargeInfo(cfg, inputs(g.state))
      kinds.push(pd.kind)
      if (pd.kind === 'chooseTurnOrder' || pd.kind === 'chooseEdge') {
        expect(isClockedDecision(g.state)).toBe(false)
        expect(info).toMatchObject({ charged: null, idleReason: 'not started' })
      } else {
        expect(info.charged).toBe(pd.player)
        expect(info.pausedBy).toBeNull()
      }
      dispatch(pd.options![0]!.action, 'test')
    }
    expect(kinds).toEqual(expect.arrayContaining(['deploy', 'advanceDeploy']))
    // newGame settles the roll-off, turn order and edge itself; those decisions are never clocked
    const s0 = useGameStore.getState().state!
    for (const kind of ['chooseTurnOrder', 'chooseEdge'] as const) {
      const early = { ...s0, pending: { ...s0.pending, kind } }
      expect(chargeInfo(cfg, inputs(early))).toMatchObject({ charged: null, idleReason: 'not started' })
    }
    // the activation phase is clocked too
    expect(chargeInfo(cfg, inputs(useGameStore.getState().state))).toMatchObject({ charged: useGameStore.getState().pending!.player })
    // a finished game charges nobody
    const over = { ...useGameStore.getState().state!, phase: 'ended' as const }
    expect(chargeInfo(cfg, inputs(over))).toMatchObject({ charged: null, idleReason: 'game over' })
    expect(chargeInfo(null, inputs(useGameStore.getState().state))).toMatchObject({ charged: null, idleReason: 'off' })
    expect(chargeInfo(cfg, inputs(null)).charged).toBeNull()
  })

  it('CLK-003 flag picks and Defense placement are before the clock', () => {
    newGame({ ...QS, seed: 'clk3b' })
    advanceTo('chooseActivation')
    const s = useGameStore.getState().state!
    const flag = { ...s, pending: { ...s.pending, kind: 'abilityChoice' as const, context: { data: { code: 'flagTerrain' } } } }
    expect(isClockedDecision(flag)).toBe(false)
    expect(isClockedDecision({ ...s, pending: { ...s.pending, kind: 'placeDefense' as never } })).toBe(false)
    expect(isClockedDecision({ ...s, pending: { ...s.pending, kind: 'abilityChoice' as const, context: { data: { code: 'prey' } } } })).toBe(true)
  })

  it('CLK-004 a reaction decision owned by the inactive player charges that player', () => {
    newGame({ ...QS, seed: 'clk4' })
    advanceTo('chooseActivation')
    const s = useGameStore.getState().state!
    const other: 'A' | 'B' = s.activePlayer === 'A' ? 'B' : 'A'
    const reaction = { ...s, pending: { ...s.pending, kind: 'powerField' as const, player: other } }
    expect(chargeInfo(STEAM(), inputs(reaction)).charged).toBe(other)
    expect(chargeInfo(STEAM(), inputs(s)).charged).toBe(s.activePlayer)
  })
})

describe('CLK-005 auto-pause', () => {
  const live = (over: Partial<ClockInputs>) => {
    newGame({ ...QS, seed: 'clk5' })
    advanceTo('chooseActivation')
    return chargeInfo(STEAM(), inputs(useGameStore.getState().state, over))
  }
  it('CLK-005 each pause reason stops the drain and names itself', () => {
    expect(live({}).pausedBy).toBeNull()
    expect(live({ presentationIdle: false }).pausedBy).toBe('animation')
    expect(live({ presentationPaused: true }).pausedBy).toBe('menu open')
    expect(live({ modal: 'settings' }).pausedBy).toBe('settings open')
    expect(live({ tabAway: true }).pausedBy).toBe('tab hidden')
    expect(live({ userPaused: true }).pausedBy).toBe('paused')
    expect(live({ restoreHold: true }).pausedBy).toBe('restored game')
  })

  it('CLK-005 the live clock drains only while idle, and resumes after the animation ends', () => {
    newGame({ ...QS, seed: 'clk5b' })
    advanceTo('chooseActivation')
    const p = useGameStore.getState().pending!.player
    beginClock(STEAM())
    const full = getClock().pools[p]
    tickClock(1_000)
    usePresentedStore.setState({ idle: false })
    tickClock(1_500)
    tickClock(2_000)
    expect(getClock().pools[p]).toBe(full)
    expect(getClock().pausedBy).toBe('animation')
    usePresentedStore.setState({ idle: true })
    tickClock(2_400)
    expect(getClock().pools[p]).toBe(full - 400)
    expect(getClock().pausedBy).toBeNull()
    expect(getClock().charged).toBe(p)
    // the other player's pool never moved
    expect(getClock().pools[p === 'A' ? 'B' : 'A']).toBe(full)
  })

  it('CLK-005 an open dialog pauses the clock (a stubbed DOM stands in for the browser)', () => {
    let label: string | null = 'Settings'
    vi.stubGlobal('document', { querySelector: () => (label === null ? null : { getAttribute: () => label }) })
    expect(openModalLabel()).toBe('settings')
    label = 'Game over'
    expect(openModalLabel()).toBeNull()
    label = null
    expect(openModalLabel()).toBeNull()
    label = 'Settings'
    newGame({ ...QS, seed: 'clk5c' })
    advanceTo('chooseActivation')
    beginClock(STEAM())
    const p = useGameStore.getState().pending!.player
    const full = getClock().pools[p]
    tickClock(1_000); tickClock(2_000)
    expect(getClock()).toMatchObject({ pausedBy: 'settings open' })
    expect(getClock().pools[p]).toBe(full)
    label = null
    tickClock(2_250)
    expect(getClock().pools[p]).toBe(full - 250)
  })

  it('CLK-005 the pause button works only when the config allows it, and hands control back on resume', () => {
    let T = 0
    const off = installClock({ interval: false, now: () => T })
    newGame({ ...QS, seed: 'clk5d' })
    advanceTo('chooseActivation')
    beginClock(STEAM())
    toggleUserPause() // Steamroller forbids pausing
    expect(getClock().userPaused).toBe(false)
    beginClock(CUSTOM())
    const p = useGameStore.getState().pending!.player
    const full = getClock().pools[p]
    T = 1_000; tickClock()
    T = 1_400; toggleUserPause() // the time up to the press is charged
    expect(getClock()).toMatchObject({ userPaused: true, pausedBy: 'paused' })
    expect(getClock().pools[p]).toBe(full - 1_400)
    T = 5_000; tickClock()
    expect(getClock().pools[p]).toBe(full - 1_400)
    toggleUserPause() // resume: the paused 3.6 s are not charged
    T = 5_200; tickClock()
    expect(getClock().pools[p]).toBe(full - 1_600)
    off()
  })

  it('CLK-005 one tick never charges more than a second (a frozen thread is not thinking time)', () => {
    const d = drain(fullPools(CUSTOM()), 'A', 60_000)
    expect(d.pools.A).toBe(CUSTOM().poolMs - 1000)
  })
})

describe('CLK-006 the bot', () => {
  const botGame = (): GameState => {
    newGame({ ...QS, controllers: { A: 'human', B: 'bot' }, seed: 'clk6' })
    advanceTo('chooseActivation')
    return useGameStore.getState().state!
  }
  it('CLK-006 untimed by default: the bot\'s decision charges nobody', () => {
    const s = botGame()
    const asBot = { ...s, pending: { ...s.pending, player: 'B' as const } }
    const info = chargeInfo(STEAM(), inputs(asBot, { controllers: { A: 'human', B: 'bot' } }))
    expect(info).toMatchObject({ charged: null, idleReason: 'untimed' })
  })
  it('CLK-006 "Time the bot" charges its pool by the time it takes', () => {
    const s = botGame()
    const asBot = { ...s, pending: { ...s.pending, player: 'B' as const } }
    const timed = { ...STEAM(), timeBot: true }
    expect(chargeInfo(timed, inputs(asBot, { controllers: { A: 'human', B: 'bot' } })).charged).toBe('B')
  })
  it('CLK-006 the untimed bot\'s chip says so and its pool never drains in a live game', () => {
    newGame({ ...QS, controllers: { A: 'human', B: 'bot' }, seed: 'clk6b' })
    advanceTo('chooseActivation')
    // make it the bot's decision: B moves first in this seed if turn order says so; otherwise force the pending owner
    const g = useGameStore.getState()
    useGameStore.setState({ state: { ...g.state!, pending: { ...g.state!.pending, player: 'B' } }, pending: { ...g.state!.pending, player: 'B' } })
    beginClock(STEAM())
    tickClock(1_000); tickClock(5_000)
    expect(getClock().pools.B).toBe(STEAM().poolMs)
    expect(getClock()).toMatchObject({ charged: null, idleReason: 'untimed' })
    const html = html0(createElement(ClockBar))
    expect(html).toContain('data-testid="clock-chip-B"')
    expect(html).toContain('untimed')
  })
})

describe('CLK-002 off by default', () => {
  it('CLK-002 with no config the bar renders nothing and ticking steps nothing', () => {
    newGame({ ...QS, seed: 'clk2' })
    advanceTo('chooseActivation')
    const before = useGameStore.getState().state
    expect(html0(createElement(ClockBar))).toBe('')
    tickClock(1_000); tickClock(900_000_000)
    expect(useGameStore.getState().state).toBe(before)
    expect(getClock().config).toBeNull()
    expect(before!.log.some((a) => a.type === 'clockExpired')).toBe(false)
  })
  it('CLK-002 turning the clock off mid-game stops it for good', () => {
    newGame({ ...QS, seed: 'clk2b' })
    advanceTo('chooseActivation')
    beginClock(STEAM())
    expect(getClock().config).not.toBeNull()
    turnClockOff()
    expect(getClock().config).toBeNull()
    tickClock(10_000)
    expect(getClock().pools).toEqual({ A: 0, B: 0 })
    expect(useGameStore.getState().state!.phase).not.toBe('ended')
  })
})

describe('CLK-007 expiry through the GameRunner', () => {
  it('CLK-007 a pool that reaches zero steps clockExpired: the game ends, the banner shows, the log records it', () => {
    newGame({ ...QS, seed: 'clk7' })
    advanceTo('deploy')
    const p = useGameStore.getState().pending!.player
    beginClock(CUSTOM({ minutes: 5 }))
    useClockStore.setState({ pools: { A: 5_000, B: 5_000, [p]: 300 } })
    tickClock(10_000) // first tick only sets the time base
    tickClock(10_200)
    expect(getClock().pools[p]).toBe(100)
    expect(useGameStore.getState().state!.phase).not.toBe('ended')
    tickClock(10_500)
    const s = useGameStore.getState().state!
    expect(s.phase).toBe('ended')
    expect(s.scenario.result).toMatchObject({ winner: p === 'A' ? 'B' : 'A', timeout: p })
    expect(s.log.at(-1)).toMatchObject({ type: 'clockExpired', timedOut: p, player: p })
    expect(getClock().expired).toBe(p)
    expect(useAnnounceStore.getState().banner?.text).toBe('Out of time')
    expect(getClock().pools[p]).toBe(0)
    // once the game is over nothing is charged or stepped again
    const logLen = s.log.length
    tickClock(20_000); tickClock(21_000)
    expect(useGameStore.getState().state!.log.length).toBe(logLen)
  })

  it('CLK-007 warnings toast once at 5:00 and once at 1:00', () => {
    newGame({ ...QS, seed: 'clk7b' })
    advanceTo('chooseActivation')
    const p = useGameStore.getState().pending!.player
    beginClock(CUSTOM({ minutes: 30 }))
    useClockStore.setState({ pools: { A: 600_000, B: 600_000, [p]: 300_500 } })
    tickClock(1_000)
    expect(getClock().toast).toBeNull()
    tickClock(1_800)
    expect(getClock().toast?.text).toContain('5 minutes')
    const first = getClock().toast!.id
    tickClock(1_900)
    expect(getClock().toast!.id).toBe(first)
    useClockStore.setState({ pools: { ...getClock().pools, [p]: 60_100 }, toast: null })
    tickClock(2_000)
    tickClock(2_200)
    expect(getClock().toast).toMatchObject({ tone: 'critical' })
    expect(getClock().toast?.text).toContain('1 minute')
  })
})

describe('CLK-013 saves', () => {
  it('CLK-013 the clock saves next to the autosave and Continue restores both pools, paused until a decision is shown', () => {
    newGame({ ...QS, seed: 'clk13' })
    advanceTo('chooseActivation')
    beginClock(CUSTOM({ minutes: 20, perTurnSeconds: 10, timeBot: true }))
    useClockStore.setState({ pools: { A: 600_000, B: 777_000 } })
    expect(saveClock('t1')).toBe(true)
    expect(getStorage().getItem(clockSaveKey('t1'))).toContain('"pools"')
    resetClock()
    expect(getClock().config).toBeNull()
    expect(restoreClock('t1')).toBe(true)
    expect(getClock()).toMatchObject({ pools: { A: 600_000, B: 777_000 }, restoreHold: true })
    expect(getClock().config).toMatchObject({ mode: 'custom', perTurnMs: 10_000, timeBot: true, poolMs: 20 * 60_000 })
    const p = useGameStore.getState().pending!.player
    tickClock(1_000) // the first decision is on screen: the hold lifts, but nothing was drained yet
    expect(getClock().restoreHold).toBe(false)
    expect(getClock().pools[p]).toBe(p === 'A' ? 600_000 : 777_000)
    tickClock(1_300)
    expect(getClock().pools[p]).toBe((p === 'A' ? 600_000 : 777_000) - 300)
  })

  it('CLK-013 a save with no clock key, or a broken one, plays untimed', () => {
    expect(restoreClock('nothing')).toBe(false)
    expect(getClock().config).toBeNull()
    getStorage().setItem(clockSaveKey('bad'), '{"v":1,"config":{"mode":"custom"},"pools":{"A":1,"B":2}}')
    expect(restoreClock('bad')).toBe(false)
    getStorage().setItem(clockSaveKey('neg'), JSON.stringify({ v: 1, config: CUSTOM(), pools: { A: -5, B: 10 } }))
    expect(restoreClock('neg')).toBe(false)
    expect(saveClock('off')).toBe(false) // a game with the clock off leaves no clock key
    expect(getStorage().getItem(clockSaveKey('off'))).toBeNull()
  })

  it('CLK-013 autosaves the clock at the start of each turn', () => {
    const off = installClock({ interval: false, now: () => 0 })
    newGame({ ...QS, seed: 'clk13c' })
    advanceTo('chooseActivation')
    beginClock(CUSTOM({ minutes: 15 }))
    const turn = useGameStore.getState().state!.turn
    // play on until the turn counter moves
    for (let i = 0; i < 3000 && useGameStore.getState().state!.turn === turn; i++) {
      const g = useGameStore.getState()
      dispatch(pickSensible(g.state!, g.pending!, legalFor(g.state!), 'clk13'), 'test')
    }
    expect(useGameStore.getState().state!.turn).toBeGreaterThan(turn)
    expect(getStorage().getItem(clockSaveKey('auto'))).toContain('"config"')
    off()
  })
})

describe('CLK-014 per-turn time', () => {
  it('CLK-014 addTurnBonus adds the Custom seconds and nothing for Steamroller', () => {
    expect(addTurnBonus({ A: 1000, B: 1000 }, 'A', CUSTOM({ perTurnSeconds: 30 }))).toEqual({ A: 31_000, B: 1000 })
    expect(addTurnBonus({ A: 1000, B: 1000 }, 'A', STEAM())).toEqual({ A: 1000, B: 1000 })
  })

  it('CLK-014 +30 s lands in the pool of the player whose turn just ended', () => {
    const off = installClock({ interval: false, now: () => 0 })
    newGame({ ...QS, seed: 'clk14' })
    advanceTo('chooseActivation')
    const cfg = CUSTOM({ minutes: 30, perTurnSeconds: 30 })
    beginClock(cfg)
    const s0 = useGameStore.getState().state!
    const first = s0.activePlayer
    const second = first === 'A' ? 'B' : 'A'
    for (let i = 0; i < 4000 && useGameStore.getState().state!.activePlayer === first; i++) {
      const g = useGameStore.getState()
      dispatch(pickSensible(g.state!, g.pending!, legalFor(g.state!), 'clk14'), 'test')
    }
    expect(useGameStore.getState().state!.activePlayer).toBe(second)
    expect(getClock().pools[first]).toBe(cfg.poolMs + 30_000)
    expect(getClock().pools[second]).toBe(cfg.poolMs)
    off()
  })

  it('CLK-014 a new game with the same config refills the pools', () => {
    const off = installClock({ interval: false, now: () => 0 })
    newGame({ ...QS, seed: 'clk14b' })
    beginClock(CUSTOM({ minutes: 10 }))
    useClockStore.setState({ pools: { A: 1234, B: 5678 } })
    newGame({ ...QS, seed: 'clk14c' })
    expect(getClock().pools).toEqual({ A: 10 * 60_000, B: 10 * 60_000 })
    expect(getClock().config).not.toBeNull()
    off()
  })
})
