// Test hooks (50 §10): `?test=1` exposes window.__game, and URL params give e2e a fast setup.
import { loadBundle } from '../../data/index'
import type { Action, GameState, Id, PendingDecision, PlayerId, SaveFile } from '../../engine/index'
import { skipAll, skipBeat } from '../presentation/director'
import { isPresentationIdle, usePresentedStore } from '../presentation/presentedStore'
import {
  dispatch, exportSave, importSave, legalFor, newGame, useGameStore,
  type BotTier, type ClientRejection, type ClientSave, type Controller, type NewGameOptions,
} from './gameStore'
import { useSettingsStore } from './settingsStore'
import { useUiStore } from './uiStore'

export interface GameTestApi {
  state(): GameState | null
  pending(): PendingDecision | null
  legal(): Action[]
  /** Dispatch as 'test': allowed for either side's decision. Returns the rejection or null. */
  dispatch(action: Action): ClientRejection | null
  presentedIdle(): boolean
  readonly seed: string | null
  load(save: ClientSave | SaveFile): ClientRejection | null
  /** Animation speed: 1 normal, 2 fast, 0 instant. */
  speed(n: number): void
  // additive extras
  newGame(opts: NewGameOptions): ClientRejection | null
  save(): ClientSave | null
  presented(): GameState | null
  skip(): void
  skipAll(): void
  events(): { seq: number; type: string }[]
  rejection(): ClientRejection | null
  ui(): ReturnType<typeof useUiStore.getState>
  controllers(): Record<PlayerId, Controller>
}

export function createTestApi(): GameTestApi {
  return {
    state: () => useGameStore.getState().state,
    pending: () => useGameStore.getState().pending,
    legal: () => legalFor(useGameStore.getState().state),
    dispatch: (a) => dispatch(a, 'test'),
    presentedIdle: () => isPresentationIdle(),
    get seed() { return useGameStore.getState().state?.seed ?? null },
    load: (s) => importSave(s),
    speed: (n) => useSettingsStore.getState().set({ speed: n }),
    newGame: (o) => newGame(o),
    save: () => exportSave('test'),
    presented: () => usePresentedStore.getState().state,
    skip: () => skipBeat(),
    skipAll: () => skipAll(),
    events: () => useGameStore.getState().events.map((e) => ({ seq: e.seq, type: e.event.type })),
    rejection: () => useGameStore.getState().lastRejection,
    ui: () => useUiStore.getState(),
    controllers: () => useGameStore.getState().controllers,
  }
}

declare global {
  interface Window { __game?: GameTestApi }
}

export function isTestMode(search = typeof location !== 'undefined' ? location.search : ''): boolean {
  return new URLSearchParams(search).get('test') === '1'
}

/** Install window.__game when `?test=1` (or `force`). Idempotent. */
export function installTestHooks(force = false): GameTestApi | null {
  if (typeof window === 'undefined') return null
  if (!force && !isTestMode()) return null
  window.__game ??= createTestApi()
  return window.__game
}

/** Resolve a list param: a list id, or a faction id meaning that faction's first list. */
function resolveList(v: string): Id | null {
  const byId = loadBundle().byId as Record<string, { recordType?: string; faction?: string }>
  if (byId[v]?.recordType === 'list') return v
  const hit = Object.values(byId).find((r) => r.recordType === 'list' && r.faction === v) as { id: string } | undefined
  return hit?.id ?? null
}

/**
 * Fast setup from the URL (50 §10): `?scenario=scn-qs-demo&lists=cyg.l.qs-recon,kha.l.qs-recon&seed=s1&bot=random`
 * plus `&control=human,bot` (A,B; default human,bot). `lists` also accepts faction ids. Null when the URL names no
 * scenario or lists.
 */
export function setupFromUrl(search = typeof location !== 'undefined' ? location.search : ''): NewGameOptions | null {
  const q = new URLSearchParams(search)
  const scenario = q.get('scenario')
  const lists = q.get('lists')
  if (!scenario && !lists) return null
  const [a, b] = (lists ?? 'cyg,kha').split(',').map((s) => s.trim())
  const la = resolveList(a ?? 'cyg'), lb = resolveList(b ?? 'kha')
  if (!la || !lb) return null
  const ctl = (q.get('control') ?? 'human,bot').split(',').map((s) => (s.trim() === 'bot' ? 'bot' : 'human')) as Controller[]
  const tier = (q.get('bot') ?? 'random') as BotTier
  return {
    scenario: scenario ?? 'scn-qs-demo',
    lists: { A: la, B: lb },
    controllers: { A: ctl[0] ?? 'human', B: ctl[1] ?? 'bot' },
    bot: { tier: ['random', 'easy', 'normal', 'hard'].includes(tier) ? tier : 'random' },
    ...(q.get('seed') ? { seed: q.get('seed')! } : {}),
  }
}
