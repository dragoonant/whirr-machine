// Game clock store and controller (91 C.2). One zustand store holds the config and both pools; one controller ticks it.
// The clock charges the owner of the open decision (CLK3 done automatically), pauses itself for animations, menus and a hidden tab,
// and when a pool hits zero it steps `clockExpired` through the GameRunner (gameStore.dispatch), the only caller of engine.step.
//
// Calling order for the start screen and Continue (WP5): create or load the game first, THEN call `beginClock(config)` (null = off) or
// `restoreClock(slot)`. A later new game (Play again) refills the pools with the same config by itself; call `beginClock` again to change it.
import { create } from 'zustand'
import type { GameState, PlayerId } from '../../engine/index'
import { audio } from '../audio/audio'
import { showBanner } from '../presentation/announceStore'
import { directorNow } from '../presentation/director'
import { usePresentedStore } from '../presentation/presentedStore'
import { dispatch, SAVE_PREFIX, useGameStore } from '../store/gameStore'
import { getStorage, readJson, writeJson } from '../store/storage'
import {
  addTurnBonus, chargeInfo, clockFromUrl, drain, fullPools, isClockedDecision, SIZE_POINTS, type ChargeInfo, type ClockConfig,
  type ClockInputs, type ClockStartChoices, type Pools,
} from './clockModel'

// ---------- store ----------
export interface ClockToast { id: number; text: string; tone: 'low' | 'critical' }

export interface ClockStoreState {
  /** The running game's clock; null = off. */
  config: ClockConfig | null
  /** Remaining ms per player. */
  pools: Pools
  /** The player whose decision is open and covered by the clock. */
  charged: PlayerId | null
  /** Why the charged pool is not draining (shown on the chip); null = draining. */
  pausedBy: string | null
  idleReason: ChargeInfo['idleReason']
  /** The player paused with the clock's own button. */
  userPaused: boolean
  /** Continue restored this clock: it waits for the first decision to be shown. */
  restoreHold: boolean
  /** The player whose clock ran out (clockExpired accepted). */
  expired: PlayerId | null
  toast: ClockToast | null
}

const OFF_POOLS: Pools = { A: 0, B: 0 }
const INITIAL: ClockStoreState = { config: null, pools: OFF_POOLS, charged: null, pausedBy: null, idleReason: 'off', userPaused: false, restoreHold: false, expired: null, toast: null }
export const useClockStore = create<ClockStoreState>(() => ({ ...INITIAL }))
export const getClock = (): ClockStoreState => useClockStore.getState()

// ---------- persistence ----------
/** Start-screen clock choices live under their own key: `wm.settings` is rewritten whole by the settings store, which would drop a clock block. */
export const CLOCK_SETTINGS_KEY = 'wm.clock.settings'
export const DEFAULT_CLOCK_CHOICES: ClockStartChoices = { mode: 'off', minutes: 30, perTurnSeconds: 0, timeBot: false, allowPause: true }

export function loadClockChoices(): ClockStartChoices {
  const raw = readJson<Partial<ClockStartChoices>>(CLOCK_SETTINGS_KEY)
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CLOCK_CHOICES }
  const mode = raw.mode === 'steamroller' || raw.mode === 'custom' ? raw.mode : 'off'
  return {
    mode,
    minutes: typeof raw.minutes === 'number' ? raw.minutes : DEFAULT_CLOCK_CHOICES.minutes,
    perTurnSeconds: typeof raw.perTurnSeconds === 'number' ? raw.perTurnSeconds : 0,
    timeBot: raw.timeBot === true,
    allowPause: raw.allowPause !== false,
  }
}
export function saveClockChoices(c: ClockStartChoices): void { writeJson(CLOCK_SETTINGS_KEY, c) }

/** `wm.save.<slot>.clock`: remaining time and config, next to the autosave. A save without it plays untimed. */
export const clockSaveKey = (slot: string): string => `${SAVE_PREFIX}${slot}.clock`
interface ClockSave { v: 1; config: ClockConfig; pools: Pools; savedAt: string }

export function saveClock(slot = 'auto'): boolean {
  const { config, pools } = getClock()
  if (!config) { getStorage().removeItem(clockSaveKey(slot)); return false }
  const data: ClockSave = { v: 1, config, pools, savedAt: new Date().toISOString() }
  writeJson(clockSaveKey(slot), data)
  return true
}
export function deleteClockSave(slot: string): void { getStorage().removeItem(clockSaveKey(slot)) }

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
function validSave(x: unknown): x is ClockSave {
  const s = x as ClockSave | null
  const c = s?.config
  return !!s && s.v === 1 && !!c && (c.mode === 'steamroller' || c.mode === 'custom') && isNum(c.poolMs) && c.poolMs > 0 && isNum(c.perTurnMs) && c.perTurnMs >= 0
    && typeof c.timeBot === 'boolean' && typeof c.allowPause === 'boolean' && isNum(s.pools?.A) && isNum(s.pools?.B) && s.pools.A >= 0 && s.pools.B >= 0
}

// ---------- actions ----------
let toastSeq = 0

/** Start (or, with null, stop) the clock for the game that exists now; both pools are full. */
export function beginClock(config: ClockConfig | null): void {
  useClockStore.setState({
    ...INITIAL, config, pools: config ? fullPools(config) : OFF_POOLS, idleReason: config ? 'not started' : 'off',
  })
  lastTickAt = null
  expireTries = 0
  syncGame()
  tickClock()
}

/** Continue: restore the saved clock (paused until the first decision is shown). No saved clock = an untimed game. Returns whether one was restored. */
export function restoreClock(slot = 'auto'): boolean {
  const data = readJson<unknown>(clockSaveKey(slot))
  if (!validSave(data)) { beginClock(null); return false }
  useClockStore.setState({ ...INITIAL, config: data.config, pools: { A: data.pools.A, B: data.pools.B }, idleReason: 'not started', restoreHold: true })
  lastTickAt = null
  expireTries = 0
  syncGame()
  return true
}

/** The in-game Settings action: switch the clock off for the rest of this game (it cannot be switched back on). */
export function turnClockOff(): void { beginClock(null) }

/** The pause button (only when the config allows it). */
export function toggleUserPause(): void {
  const { config, userPaused } = getClock()
  if (!config?.allowPause) return
  tickClock() // charge the time up to the press first
  useClockStore.setState({ userPaused: !userPaused })
  tickClock()
}

export function clearToast(): void { if (getClock().toast) useClockStore.setState({ toast: null }) }

// ---------- reading the world ----------
let tabHidden = false
let blurredSince: number | null = null
const AWAY_MS = 2000

/** The label of an open modal or popover (role="dialog"), else null. The game-over dialog is not one: the clock is already stopped then. */
export function openModalLabel(): string | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector('[role="dialog"]:not([data-clock-ignore])')
  if (!el) return null
  const label = el.getAttribute('aria-label')?.trim().toLowerCase()
  return label && label !== 'game over' ? label : label ? null : 'dialog'
}

export function readInputs(now: number): ClockInputs {
  const g = useGameStore.getState()
  const p = usePresentedStore.getState()
  const away = tabHidden || (blurredSince !== null && now - blurredSince > AWAY_MS)
  const c = getClock()
  return {
    state: g.state, controllers: g.controllers, presentationIdle: p.idle, presentationPaused: p.paused, modal: openModalLabel(),
    tabAway: away, userPaused: c.userPaused, restoreHold: c.restoreHold,
  }
}

// ---------- the tick ----------
let lastTickAt: number | null = null
let expireTries = 0
let nowFn: () => number = () => Date.now()

function warn(player: PlayerId, threshold: number): void {
  const g = useGameStore.getState().state
  const mine = !g || useGameStore.getState().controllers[player] === 'human'
  const who = mine ? 'Your' : `Player ${player}'s`
  const text = `${who} clock: ${threshold >= 120_000 ? `${threshold / 60_000} minutes` : '1 minute'} left`
  useClockStore.setState({ toast: { id: ++toastSeq, text, tone: threshold <= 60_000 ? 'critical' : 'low' } })
  try { audio.play('turn-bell', { volume: 0.6 }) } catch { /* no audio in this environment */ }
}

function fireExpiry(player: PlayerId): void {
  const g = useGameStore.getState()
  const pd = g.state?.pending
  if (!g.state || !pd || pd.kind === 'gameOver') return
  const rej = dispatch({ type: 'clockExpired', decisionId: pd.id, player, timedOut: player }, 'watchdog')
  if (!rej) {
    useClockStore.setState({ expired: player })
    try { showBanner('Out of time', 'game', directorNow(), 2600) } catch { /* presentation not ready */ }
    return
  }
  // a stale decision id retries on the next tick with the fresh one; anything the engine will never accept stops after a few tries
  expireTries++
  if (rej.code === 'E_ALREADY_USED' || rej.code === 'E_GAME_OVER' || expireTries >= 3) useClockStore.setState({ expired: player })
}

/** Advance the clock to `now` (ms). Safe to call at any time; the controller calls it every 100 ms. */
export function tickClock(now: number = nowFn()): void {
  const st = getClock()
  const dt = lastTickAt === null ? 0 : Math.max(0, now - lastTickAt)
  lastTickAt = now
  if (!st.config) return
  let inp = readInputs(now)
  // Continue: the hold ends as soon as the first decision is on screen
  if (st.restoreHold && inp.state && isClockedDecision(inp.state) && inp.presentationIdle) {
    useClockStore.setState({ restoreHold: false })
    inp = { ...inp, restoreHold: false }
  }
  const info = chargeInfo(st.config, inp)
  const patch: Partial<ClockStoreState> = {}
  if (info.charged !== st.charged) patch.charged = info.charged
  if (info.pausedBy !== st.pausedBy) patch.pausedBy = info.pausedBy
  if (info.idleReason !== st.idleReason) patch.idleReason = info.idleReason
  let expired: PlayerId | null = null
  if (info.charged && !info.pausedBy && st.expired === null && dt > 0) {
    const d = drain(st.pools, info.charged, dt)
    patch.pools = d.pools
    for (const t of d.crossed) warn(info.charged, t)
    expired = d.expired
  } else if (info.charged && !info.pausedBy && st.expired === null && st.pools[info.charged] <= 0) {
    expired = info.charged // forced to zero (tests, __clock.set): expire on this tick
  }
  if (Object.keys(patch).length) useClockStore.setState(patch)
  if (expired) fireExpiry(expired)
}

// ---------- game changes: new game, turn bonus, autosave ----------
let lastSetup: unknown = null
let lastTurn = -1
let lastActive: PlayerId | null = null

function timed(p: PlayerId, config: ClockConfig): boolean { return config.timeBot || useGameStore.getState().controllers[p] !== 'bot' }

/** Note the game now on the table without reacting to it (after beginClock or restoreClock). */
function syncGame(): void {
  const state = useGameStore.getState().state
  lastSetup = state?.setup ?? null
  lastTurn = state?.turn ?? -1
  lastActive = state?.activePlayer ?? null
}

function onGame(state: GameState | null): void {
  if (!state) return // a new game passes through null on its way in; keep the last game's identity so the change is seen
  const cfg = getClock().config
  if (state.setup !== lastSetup) {
    // a new game or a load: refill the pools with the current config (restoreClock overrides this right after a load)
    const fresh = lastSetup !== null
    lastSetup = state.setup
    lastTurn = state.turn
    lastActive = state.activePlayer
    if (fresh && cfg) beginClockSilently(cfg)
    return
  }
  if (state.turn !== lastTurn) {
    if (cfg && lastActive && lastTurn >= 1 && state.turn > lastTurn && timed(lastActive, cfg)) {
      useClockStore.setState((s) => ({ pools: addTurnBonus(s.pools, lastActive!, cfg) }))
    }
    lastTurn = state.turn
    lastActive = state.activePlayer
    if (cfg && state.phase !== 'setup') saveClock('auto')
  }
}
function beginClockSilently(cfg: ClockConfig): void {
  useClockStore.setState({ ...INITIAL, config: cfg, pools: fullPools(cfg), idleReason: 'not started' })
  lastTickAt = null
  expireTries = 0
}

// ---------- install ----------
export interface InstallOptions {
  /** Time source for tests. */
  now?: () => number
  /** false: no setInterval; the caller drives `tickClock`. */
  interval?: boolean
  /** Read `?clock=` and `?test=1` from this query string (default: the page's). */
  search?: string
}

export interface ClockTestApi {
  readonly remaining: Pools
  readonly running: boolean
  readonly pausedBy: string | null
  /** Force a pool to `ms` (e2e: make a flag fall). */
  set(player: PlayerId, ms: number): void
}
declare global { interface Window { __clock?: ClockTestApi } }

let uninstall: (() => void) | null = null

/**
 * Start the controller: tick every 100 ms, watch game changes and the tab, apply `?clock=` once, and with `?test=1` expose `window.__clock`.
 * Idempotent while installed; returns the uninstall function. ClockBar calls it on mount.
 */
export function installClock(opts: InstallOptions = {}): () => void {
  if (uninstall) return uninstall
  nowFn = opts.now ?? (() => Date.now())
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '')
  const offs: (() => void)[] = []

  offs.push(useGameStore.subscribe((s) => onGame(s.state)))
  onGame(useGameStore.getState().state)

  if (typeof document !== 'undefined') {
    const onVis = (): void => { tickClock(); tabHidden = document.visibilityState === 'hidden' }
    document.addEventListener('visibilitychange', onVis)
    offs.push(() => document.removeEventListener('visibilitychange', onVis))
  }
  if (typeof window !== 'undefined') {
    const onBlur = (): void => { tickClock(); blurredSince = nowFn() }
    const onFocus = (): void => { tickClock(); blurredSince = null }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    offs.push(() => { window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus) })
  }

  // ?clock= (once, only when the page has not started a clock itself)
  if (!getClock().config) {
    const state = useGameStore.getState().state
    const pts = state ? (state.scenario.table.w >= 48 ? SIZE_POINTS.skirmish : SIZE_POINTS.recon) : SIZE_POINTS.recon
    const fromUrl = clockFromUrl(search, pts)
    if (fromUrl) beginClock(fromUrl)
  }

  if (new URLSearchParams(search).get('test') === '1' && typeof window !== 'undefined') {
    window.__clock = {
      get remaining() { return { ...getClock().pools } },
      get running() { const c = getClock(); return c.charged !== null && c.pausedBy === null && c.config !== null },
      get pausedBy() { return getClock().pausedBy },
      set(player, ms) { useClockStore.setState((s) => ({ pools: { ...s.pools, [player]: Math.max(0, ms) }, expired: null })); tickClock() },
    }
  }

  if (opts.interval !== false && typeof setInterval !== 'undefined') {
    const h = setInterval(() => tickClock(), 100)
    offs.push(() => clearInterval(h))
  }

  lastTickAt = null
  uninstall = () => {
    for (const f of offs) f()
    if (typeof window !== 'undefined') delete window.__clock
    uninstall = null
    nowFn = () => Date.now()
  }
  return uninstall
}

/** Tests: drop the clock entirely (config, pools, controller state). */
export function resetClock(): void {
  if (uninstall) uninstall()
  useClockStore.setState({ ...INITIAL })
  lastTickAt = null
  expireTries = 0
  tabHidden = false
  blurredSince = null
  lastSetup = null
  lastTurn = -1
  lastActive = null
}

