// Test hooks (50 §10): `?test=1` exposes window.__game, and URL params give e2e a fast setup.
import { boardFromUrl } from '../board/boards'
import { loadBundle } from '../../data/index'
import { query, type Action, type GameState, type Id, type ModelId, type PendingDecision, type PlayerId, type SaveFile, type Vec2 } from '../../engine/index'
import { skipAll, skipBeat } from '../presentation/director'
import { DEFAULT_SCENARIO, handFor, parseGameSize, sizeFromUrl, type GameSize } from '../ui/start/startOptions'
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
  /** The engine's own move check for a path (read-only), so e2e can tell what the board should accept. */
  moveCheck(modelId: ModelId, path: Vec2[]): ReturnType<typeof query.moveCheck> | null
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
    moveCheck: (id, path) => { const s = useGameStore.getState().state; return s ? query.moveCheck(s, id, path) : null },
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

type ListRec = { id?: string; recordType?: string; faction?: string; level?: string; levels?: string[] }

/** Resolve a list param: a list id, or a faction id meaning that faction's list of the game size (recon unless `?size=` says otherwise). */
export function resolveList(v: string, size: GameSize = 'recon'): Id | null {
  const byId = loadBundle().byId as Record<string, ListRec>
  if (byId[v]?.recordType === 'list') return v
  const hit = Object.values(byId).find((r) => r.recordType === 'list' && r.faction === v && (r.level ?? 'recon') === size)
  return hit?.id ?? null
}

/** The game size a URL asks for: `?size=`, else the size a named scenario is played at (skirmish-only scenario = skirmish), else recon. */
export function sizeFromSetup(search = typeof location !== 'undefined' ? location.search : ''): GameSize {
  const named = sizeFromUrl(search)
  if (named) return named
  const scn = new URLSearchParams(search).get('scenario')
  const levels = scn ? (loadBundle().byId as Record<string, ListRec>)[scn]?.levels : undefined
  if (levels && !levels.includes('recon')) return levels.map(parseGameSize).find((x): x is GameSize => !!x) ?? 'recon'
  return 'recon'
}

/**
 * Fast setup from the URL (50 §10): `?scenario=scn-qs-demo&lists=cyg.l.qs-recon,kha.l.qs-recon&seed=s1&bot=random`
 * plus `&control=human,bot` (A,B; default human,bot), `&cards=on` (command cards for both sides). `lists` also accepts faction ids, which mean the faction's list of
 * the game size: `&size=recon|skirmish` (unknown = recon with one console warning; a skirmish-only scenario implies skirmish).
 * With no `scenario` the size's own scenario is used (Quick Start Demo, Copperline Crossing). Null when the URL names no
 * scenario or lists.
 */
export function setupFromUrl(search = typeof location !== 'undefined' ? location.search : ''): NewGameOptions | null {
  const q = new URLSearchParams(search)
  const scenario = q.get('scenario')
  const lists = q.get('lists')
  if (!scenario && !lists) return null
  const size = sizeFromSetup(search)
  const [a, b] = (lists ?? 'cyg,kha').split(',').map((s) => s.trim())
  const la = resolveList(a ?? 'cyg', size), lb = resolveList(b ?? 'kha', size)
  if (!la || !lb) return null
  const ctl = (q.get('control') ?? 'human,bot').split(',').map((s) => (s.trim() === 'bot' ? 'bot' : 'human')) as Controller[]
  const tier = (q.get('bot') ?? 'random') as BotTier
  return {
    scenario: scenario ?? DEFAULT_SCENARIO[size],
    lists: { A: la, B: lb },
    controllers: { A: ctl[0] ?? 'human', B: ctl[1] ?? 'bot' },
    bot: { tier: ['random', 'easy', 'normal', 'hard'].includes(tier) ? tier : 'random' },
    ...(q.get('seed') ? { seed: q.get('seed')! } : {}),
    ...(boardFromUrl(search) ? { board: boardFromUrl(search)! } : {}),
    // ?cards=on: both sides take the default hand of their list (91 A.4)
    ...(q.get('cards') === 'on' ? { cards: { A: handFor(la), B: handFor(lb) } } : {}),
  }
}
