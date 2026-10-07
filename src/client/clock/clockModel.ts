// Game clock model (91 C): pure rules for the client clock. No React, no stores, no timers: the store (clockStore.ts) feeds these
// functions the game and UI facts and applies what they return. Everything the clock charges is decided here so tests can run it headlessly.
import type { GameState, PlayerId } from '../../engine/index'

// ---------- configuration ----------
export type ClockMode = 'off' | 'steamroller' | 'custom'
export type ClockGameSize = 'recon' | 'skirmish'

/** What the start screen collects (91 C.2 "Client UX"). */
export interface ClockStartChoices {
  mode: ClockMode
  /** The game's size in points: picks the Steamroller pool. Omitted: `size`, else 30. */
  points?: number
  size?: ClockGameSize
  /** Custom: minutes per player (5 to 90, step 5). */
  minutes?: number
  /** Custom: extra seconds added to a player's pool when their turn ends (0, 10, 30 or 60). */
  perTurnSeconds?: number
  /** Time the bot too (default off: the bot is untimed). */
  timeBot?: boolean
  /** Custom only: let the player pause (default on). Steamroller always forbids it. */
  allowPause?: boolean
}

/** A running game's clock settings. `poolMs` is each player's whole-game pool (CLK1). */
export interface ClockConfig {
  mode: Exclude<ClockMode, 'off'>
  poolMs: number
  perTurnMs: number
  timeBot: boolean
  allowPause: boolean
}

export const SIZE_POINTS: Record<ClockGameSize, number> = { recon: 30, skirmish: 50 }
/** CLK1: Steamroller pool by game points. A size between two rows uses the larger pool. */
export const STEAMROLLER_POOLS: readonly { upTo: number; minutes: number }[] = [
  { upTo: 30, minutes: 20 }, { upTo: 50, minutes: 30 }, { upTo: 75, minutes: 50 }, { upTo: 100, minutes: 60 },
]
export const CUSTOM_MINUTES = { min: 5, max: 90, step: 5 } as const
export const PER_TURN_SECONDS = [0, 10, 30, 60] as const
export const MINUTE_MS = 60_000

export function steamrollerMinutes(points: number): number {
  const row = STEAMROLLER_POOLS.find((r) => points <= r.upTo)
  return (row ?? STEAMROLLER_POOLS[STEAMROLLER_POOLS.length - 1]!).minutes
}

const clampInt = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(n)))
/** A custom minutes value snapped to the 5-minute step and the 5 to 90 range. */
export function snapCustomMinutes(n: number): number {
  if (!Number.isFinite(n)) return 30
  return clampInt(Math.round(n / CUSTOM_MINUTES.step) * CUSTOM_MINUTES.step, CUSTOM_MINUTES.min, CUSTOM_MINUTES.max)
}
/** The nearest allowed per-turn bonus in seconds. */
export function snapPerTurnSeconds(n: number): number {
  if (!Number.isFinite(n)) return 0
  return PER_TURN_SECONDS.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), 0 as number)
}

/** Start-screen choices to a config; null = the clock is off. Exposed to the start screen (WP5). */
export function clockConfigFromStart(c: ClockStartChoices): ClockConfig | null {
  if (c.mode === 'off') return null
  const points = c.points ?? SIZE_POINTS[c.size ?? 'recon']
  if (c.mode === 'steamroller') {
    return { mode: 'steamroller', poolMs: steamrollerMinutes(points) * MINUTE_MS, perTurnMs: 0, timeBot: !!c.timeBot, allowPause: false }
  }
  return {
    mode: 'custom', poolMs: snapCustomMinutes(c.minutes ?? 30) * MINUTE_MS, perTurnMs: snapPerTurnSeconds(c.perTurnSeconds ?? 0) * 1000,
    timeBot: !!c.timeBot, allowPause: c.allowPause ?? true,
  }
}

/** `?clock=steamroller|off|<minutes>`: a config, null for off, undefined when the URL says nothing (or something unreadable). */
export function clockFromUrl(search: string, points = SIZE_POINTS.recon): ClockConfig | null | undefined {
  const raw = new URLSearchParams(search).get('clock')
  if (raw === null) return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'off' || v === '0' || v === '') return null
  if (v === 'steamroller') return clockConfigFromStart({ mode: 'steamroller', points })
  const mins = Number(v)
  // tests ask for short pools, so the URL is looser than the start screen (1 to 180 minutes, fractions allowed)
  if (Number.isFinite(mins) && mins > 0) return { mode: 'custom', poolMs: Math.round(Math.min(180, Math.max(0.05, mins)) * MINUTE_MS), perTurnMs: 0, timeBot: false, allowPause: true }
  return undefined
}

/** One line for Settings (read-only) and the game-over screen: "Steamroller clock: 20 minutes each". */
export function describeClock(c: ClockConfig | null): string {
  if (!c) return 'Clock off'
  const mins = c.poolMs / MINUTE_MS
  const m = Number.isInteger(mins) ? `${mins}` : mins.toFixed(1)
  const base = `${c.mode === 'steamroller' ? 'Steamroller clock' : 'Custom clock'}: ${m} minutes each`
  return `${base}${c.perTurnMs > 0 ? `, +${c.perTurnMs / 1000} s per turn` : ''}${c.timeBot ? ', bot timed' : ', bot untimed'}`
}

// ---------- display ----------
/** mm:ss, or s.t (tenths) under 10 s. Rounds up, so 0:00 is shown only at expiry. */
export function formatClock(ms: number): string {
  const v = Math.max(0, ms)
  if (v < 10_000) return (Math.ceil(v / 100) / 10).toFixed(1)
  const total = Math.ceil(v / 1000)
  const m = Math.floor(total / 60), s = total % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}
export type ClockTone = 'ok' | 'low' | 'critical' | 'out'
/** Amber under 5:00, red under 1:00 (91 C.2). */
export function clockTone(ms: number): ClockTone {
  if (ms <= 0) return 'out'
  if (ms < 60_000) return 'critical'
  if (ms < 5 * 60_000) return 'low'
  return 'ok'
}
/** Warning thresholds for the toasts, in ms, largest first. */
export const WARN_AT_MS = [5 * 60_000, 60_000] as const
/** The thresholds a pool crossed going from `before` to `after` ms. */
export function crossedWarnings(before: number, after: number): number[] {
  return WARN_AT_MS.filter((t) => before >= t && after < t)
}

// ---------- who is charged ----------
export type Controller = 'human' | 'bot'

/** Everything the charge decision reads. The store gathers these from the game, presentation and DOM. */
export interface ClockInputs {
  state: GameState | null
  controllers: Record<PlayerId, Controller>
  /** The presentation director has nothing queued or playing. */
  presentationIdle: boolean
  /** The presentation is paused (menu open). */
  presentationPaused: boolean
  /** A modal or popover is open: its label (e.g. "Settings"), else null. */
  modal: string | null
  /** The tab is hidden, or the window has been unfocused for over 2 s. */
  tabAway: boolean
  /** The player pressed the clock's pause button. */
  userPaused: boolean
  /** Continue restored this clock: it waits until the first decision is shown. */
  restoreHold: boolean
}

/** Phases and decisions CLK2 puts on the clock: normal deployment onward; never turn order, edge, flag picks, Defense placement or game over. */
export function isClockedDecision(state: GameState | null): boolean {
  if (!state || state.phase === 'ended') return false
  const pd = state.pending
  if (pd.kind === 'gameOver' || pd.kind === 'chooseTurnOrder' || pd.kind === 'chooseEdge' || pd.kind === 'rollOff') return false
  if ((pd.kind as string) === 'placeDefense') return false
  if (pd.kind === 'abilityChoice' && pd.context.data?.code === 'flagTerrain') return false
  return state.phase === 'deploy' || state.phase === 'maintenance' || state.phase === 'control' || state.phase === 'activation'
}

export interface ChargeInfo {
  /** The player whose pool the open decision belongs to, when the clock covers it; else null. */
  charged: PlayerId | null
  /** Why the charged pool is not draining right now; null = it is draining. */
  pausedBy: string | null
  /** Why nobody is charged (shown on the chips): 'untimed' bot, 'not started', 'game over'. */
  idleReason: 'untimed' | 'not started' | 'game over' | 'off' | null
}

export function chargeInfo(config: ClockConfig | null, inp: ClockInputs): ChargeInfo {
  if (!config) return { charged: null, pausedBy: null, idleReason: 'off' }
  const s = inp.state
  if (!s || s.phase === 'ended' || s.pending.kind === 'gameOver') return { charged: null, pausedBy: null, idleReason: 'game over' }
  if (!isClockedDecision(s)) return { charged: null, pausedBy: null, idleReason: 'not started' }
  const p = s.pending.player
  if (inp.controllers[p] === 'bot' && !config.timeBot) return { charged: null, pausedBy: null, idleReason: 'untimed' }
  const pausedBy = inp.userPaused ? 'paused'
    : inp.restoreHold ? 'restored game'
      : inp.presentationPaused ? 'menu open'
        : inp.modal ? `${inp.modal} open`
          : inp.tabAway ? 'tab hidden'
            : !inp.presentationIdle ? 'animation'
              : null
  return { charged: p, pausedBy, idleReason: null }
}

// ---------- the pools ----------
export type Pools = Record<PlayerId, number>
export const fullPools = (c: ClockConfig): Pools => ({ A: c.poolMs, B: c.poolMs })
/** Longest wall time one tick may charge: a frozen main thread is not thinking time. */
export const MAX_TICK_MS = 1000

export interface Drain { pools: Pools; crossed: number[]; expired: PlayerId | null }
/** Charge `dtMs` to `player` (capped at MAX_TICK_MS). Reports the warning thresholds crossed and whether the pool hit zero. */
export function drain(pools: Pools, player: PlayerId, dtMs: number): Drain {
  const dt = Math.min(Math.max(0, dtMs), MAX_TICK_MS)
  const before = pools[player]
  const after = Math.max(0, before - dt)
  return { pools: { ...pools, [player]: after }, crossed: crossedWarnings(before, after), expired: after <= 0 ? player : null }
}
/** CLK4 has no increments; the Custom clock adds `perTurnMs` to a player's pool when their turn ends. */
export function addTurnBonus(pools: Pools, player: PlayerId, config: ClockConfig): Pools {
  return config.perTurnMs > 0 ? { ...pools, [player]: pools[player] + config.perTurnMs } : pools
}

// ---------- the end of a timed game ----------
/** "Vilkul's clock ran out; Cygnar wins by assassination": the game-over screen's cause line, or null when the clock did not end the game. */
export function clockCauseLine(state: GameState | null, name: (p: PlayerId) => string, leaderName: (p: PlayerId) => string): string | null {
  const r = state?.scenario.result
  if (!state || !r || r.timeout === undefined) return null
  const loser = r.timeout
  const winner = r.winner ?? (loser === 'A' ? 'B' : 'A')
  const how = r.reason === 'scenario' ? 'wins by scenario victory' : 'wins by assassination'
  return `${leaderName(loser)}'s clock ran out; ${name(winner)} ${how}`
}
