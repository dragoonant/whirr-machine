// Player settings (50 §11): animation speed, graphics tier, narration. Persisted in storage under `wm.settings`.
import { create } from 'zustand'
import { readJson, writeJson } from './storage'

/**
 * Animation playback rate. 1 = normal, 2 = twice as fast, 0.5 = half speed.
 * 0 is special: INSTANT, every beat takes no time and batches drain synchronously (tests, "skip all animations").
 */
export type AnimSpeed = number
export const SPEED_PRESETS = { slow: 0.5, normal: 1, fast: 2, instant: 0 } as const
export type SpeedPreset = keyof typeof SPEED_PRESETS

export type GraphicsTier = 'low' | 'high'

/** Game size (90-skirmish): Recon is 30 points on a 36" table, Skirmish 50 points on 48". */
export const GAME_SIZE_IDS = ['recon', 'skirmish'] as const
export type GameSize = (typeof GAME_SIZE_IDS)[number]
export const DEFAULT_GAME_SIZE: GameSize = 'recon'
/** A size id from user input (URL, storage), or null when it is not one of ours. */
export function parseGameSize(v: unknown): GameSize | null {
  return typeof v === 'string' && (GAME_SIZE_IDS as readonly string[]).includes(v) ? (v as GameSize) : null
}

export interface Settings {
  speed: AnimSpeed
  graphics: GraphicsTier
  narration: boolean
  /** Ask before ending a turn with models still able to activate. */
  confirmEndTurn: boolean
  /** Draw the rules footprints of terrain pieces all the time (otherwise only while a model is selected). */
  showZones: boolean
  /** Start-screen Battlefield choice: 'random' or a board id (remembered between visits). */
  battlefield: string
  /** Start-screen Game size (90-skirmish C1), remembered between visits. Optional so callers that build a Settings stay valid; absent = recon. */
  size?: GameSize
}

export const SETTINGS_KEY = 'wm.settings'
export const DEFAULT_SETTINGS: Settings = { speed: 1, graphics: 'high', narration: true, confirmEndTurn: true, showZones: false, battlefield: 'random', size: DEFAULT_GAME_SIZE }

function sanitize(raw: Partial<Settings> | null): Settings {
  const s = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return s
  if (typeof raw.speed === 'number' && Number.isFinite(raw.speed) && raw.speed >= 0 && raw.speed <= 8) s.speed = raw.speed
  if (raw.graphics === 'low' || raw.graphics === 'high') s.graphics = raw.graphics
  if (typeof raw.narration === 'boolean') s.narration = raw.narration
  if (typeof raw.confirmEndTurn === 'boolean') s.confirmEndTurn = raw.confirmEndTurn
  if (typeof raw.showZones === 'boolean') s.showZones = raw.showZones
  if (typeof raw.battlefield === 'string' && raw.battlefield.length < 40) s.battlefield = raw.battlefield
  s.size = parseGameSize(raw.size) ?? DEFAULT_GAME_SIZE
  return s
}

interface SettingsStore extends Settings {
  set(patch: Partial<Settings>): void
  reload(): void
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  set(patch) {
    const next = sanitize({ ...pick(get()), ...patch })
    set(next)
    writeJson(SETTINGS_KEY, next)
  },
  reload() { set(sanitize(readJson<Partial<Settings>>(SETTINGS_KEY))) },
}))

function pick(s: Settings): Settings {
  return { speed: s.speed, graphics: s.graphics, narration: s.narration, confirmEndTurn: s.confirmEndTurn, showZones: s.showZones, battlefield: s.battlefield, size: s.size ?? DEFAULT_GAME_SIZE }
}

export function getSettings(): Settings { return pick(useSettingsStore.getState()) }

/** Scale a base duration (ms at speed 1) by the current speed; 0 at instant speed. */
export function scaled(ms: number, speed = useSettingsStore.getState().speed): number {
  if (speed <= 0) return 0
  return Math.round(ms / speed)
}
