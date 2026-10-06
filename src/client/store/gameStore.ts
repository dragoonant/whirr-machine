// GameRunner (50 §1-2): the true engine state and THE ONLY CALLER OF engine.step in the client.
// Every answer (human click, bot, test hook) goes through dispatch(); events are numbered, kept in a ring buffer,
// and handed to the presentation director as one batch per step.
import { create } from 'zustand'
import { loadBundle } from '../../data/index'
import {
  EngineInvariantError, createGame, legalActions, load as engineLoad, save as engineSave, step,
  type Action, type GameEvent, type GameSetup, type GameState, type Id, type PendingDecision, type PlayerId,
  type Rejection, type RejectionCode, type SaveFile,
} from '../../engine/index'
import { enqueueBatch, resetPresentation } from '../presentation/director'
import type { SeqEvent } from '../presentation/beats'
import { boardForLoad, pickBattlefield } from '../board/boardPick'
import { setBoardId, getBoardId } from '../board/boardStore'
import { getStorage, readJson, writeJson } from './storage'
import { ui } from './uiStore'

// ---------- setup options ----------
export type Controller = 'human' | 'bot'
/** Bot tiers. Only 'random' (the sensible random bot, src/ai/random.ts) exists today; others fall back to it. */
export type BotTier = 'random' | 'easy' | 'normal' | 'hard'

export interface NewGameOptions {
  scenario: Id // e.g. 'scn-qs-demo', 'scn-ashwall-divide'
  lists: Record<PlayerId, Id> // e.g. { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' }
  controllers?: Record<PlayerId, Controller> // default: A human, B bot
  bot?: { tier?: BotTier; seed?: string }
  seed?: string // engine seed; random when omitted
  names?: Partial<Record<PlayerId, string>>
  layout?: Id
  /** Battlefield: a board id ('board.bog') or short name, or 'random' / omitted to pick from the seed (70 section E). */
  board?: Id | 'random'
}

export interface BotConfig { tier: BotTier; seed: string }

export interface ClientRejection {
  code: RejectionCode | 'E_CLIENT'
  /** Player-facing text, our words. */
  text: string
  /** The engine's own message (for the log / tooltips). */
  detail: string
  action: Action | null
  at: number
  id: number
}

export type DispatchSource = 'human' | 'bot' | 'test' | 'watchdog'

export const EVENT_LOG_LIMIT = 2000

export interface GameStoreState {
  /** True engine state (NOT what the screen shows: render from the presented store). */
  state: GameState | null
  pending: PendingDecision | null
  controllers: Record<PlayerId, Controller>
  bot: BotConfig
  /** Ring buffer of the last EVENT_LOG_LIMIT events with their seq numbers. */
  events: SeqEvent[]
  /** Seq of the newest event (0 before any). */
  eventSeq: number
  lastRejection: ClientRejection | null
  /** Set when the engine threw (an engine bug); the game stops accepting answers until a new game or load. */
  fatal: string | null
  /** Increments on every accepted step and on new game / load. */
  version: number
}

const INITIAL: GameStoreState = {
  state: null, pending: null, controllers: { A: 'human', B: 'bot' }, bot: { tier: 'random', seed: 'bot' },
  events: [], eventSeq: 0, lastRejection: null, fatal: null, version: 0,
}

export const useGameStore = create<GameStoreState>(() => ({ ...INITIAL }))

// ---------- legal actions, cached per state object ----------
const legalCache = new WeakMap<GameState, Action[]>()
/** Legal answers to the state's open decision (cached; the engine validates every one). */
export function legalFor(state: GameState | null): Action[] {
  if (!state) return []
  const hit = legalCache.get(state)
  if (hit) return hit
  let out: Action[] = []
  try { out = legalActions(state) } catch { out = [] }
  legalCache.set(state, out)
  return out
}

// ---------- rejection text (our words) ----------
const REJECTION_TEXT: Record<RejectionCode, string> = {
  E_WRONG_DECISION: 'That does not answer the current question.',
  E_NOT_YOUR_DECISION: 'It is not your decision to make.',
  E_NOT_AN_OPTION: 'That choice is not available right now.',
  E_BAD_PAYLOAD: 'That move could not be read.',
  E_BAD_SETUP: 'The game could not be set up with those choices.',
  E_DATA_VERSION: 'This save was made with different game data and cannot be loaded.',
  E_GAME_OVER: 'The game is over.',
  E_INSUFFICIENT_FOCUS: 'Not enough focus.',
  E_FOCUS_CAP: 'That model cannot hold any more focus.',
  E_CRIPPLED: 'That system is crippled.',
  E_OUT_OF_RANGE: 'Out of range.',
  E_NO_LOS: 'No line of sight.',
  E_OUT_OF_CTRL: 'Outside the control range.',
  E_ENGAGED: 'That model is engaged.',
  E_KNOCKED_DOWN: 'That model is knocked down.',
  E_STATIONARY: 'That model cannot move.',
  E_ALREADY_ACTIVATED: 'That has already activated this turn.',
  E_ALREADY_USED: 'That has already been used.',
  E_TARGET_INVALID: 'Not a valid target.',
  E_BASE_OVERLAP: 'Bases would overlap there.',
  E_PATH_BLOCKED: 'The path is blocked.',
  E_TOO_FAR: 'Too far.',
  E_NOT_STRAIGHT: 'This move must be in a straight line.',
  E_OUT_OF_ZONE: 'Outside the allowed area.',
  E_PLACEMENT: 'It cannot be placed there.',
  E_UPKEEP_LIMIT: 'Too many upkeep effects.',
  E_POWER_ATTACK: 'That power attack is not possible.',
  E_NO_DUAL_ATTACK: 'This model cannot make both kinds of attack.',
}
export function rejectionText(code: RejectionCode | 'E_CLIENT'): string {
  return code === 'E_CLIENT' ? 'That is not possible right now.' : REJECTION_TEXT[code] ?? 'That is not allowed.'
}

let rejectionSeq = 0
function reject(code: ClientRejection['code'], detail: string, action: Action | null, text?: string): ClientRejection {
  const r: ClientRejection = { code, text: text ?? rejectionText(code), detail, action, at: Date.now(), id: ++rejectionSeq }
  useGameStore.setState({ lastRejection: r })
  return r
}

// ---------- internals ----------
function randomSeed(): string { return Math.random().toString(36).slice(2, 10) }

function pushEvents(events: readonly GameEvent[]): { seqEvents: SeqEvent[]; first: number; last: number } {
  const s = useGameStore.getState()
  let seq = s.eventSeq
  const seqEvents = events.map((event) => ({ seq: ++seq, event }))
  return { seqEvents, first: s.eventSeq + 1, last: seq }
}

function commitStep(before: GameState, after: GameState, events: readonly GameEvent[], extra: Partial<GameStoreState> = {}): void {
  const { seqEvents, first, last } = pushEvents(events)
  const s = useGameStore.getState()
  useGameStore.setState({
    ...extra,
    state: after,
    pending: after.pending,
    events: seqEvents.length ? [...s.events, ...seqEvents].slice(-EVENT_LOG_LIMIT) : s.events,
    eventSeq: last,
    version: s.version + 1,
  })
  if (seqEvents.length) enqueueBatch({ firstSeq: first, lastSeq: last, before, after, events: seqEvents })
  else enqueueBatch({ firstSeq: first, lastSeq: s.eventSeq, before, after, events: [] })
}

function startFrom(state: GameState, events: readonly GameEvent[], controllers: Record<PlayerId, Controller>, bot: BotConfig, animate: boolean): void {
  useGameStore.setState({ ...INITIAL, controllers, bot, version: useGameStore.getState().version + 1 })
  ui.reset()
  if (animate) {
    resetPresentation(state, 0)
    commitStep(state, state, events)
  } else {
    const { seqEvents, last } = pushEvents(events)
    useGameStore.setState({ state, pending: state.pending, events: seqEvents.slice(-EVENT_LOG_LIMIT), eventSeq: last })
    resetPresentation(state, last)
  }
}

// ---------- public actions ----------
/** Start a new game. Returns the rejection when the engine refuses the setup (the old game stays). */
export function newGame(opts: NewGameOptions): ClientRejection | null {
  const setup: GameSetup = { scenario: opts.scenario, lists: { ...opts.lists }, ...(opts.layout ? { layout: opts.layout } : {}), ...(opts.names ? { names: opts.names } : {}) }
  const seed = opts.seed ?? randomSeed()
  const pick = pickBattlefield({ seed, scenario: opts.scenario, board: opts.board })
  const build = (layout?: Id) => {
    try { return createGame(layout ? { ...setup, layout } : setup, seed, loadBundle()) } catch (e) { return e instanceof Error ? e : new Error(String(e)) }
  }
  let r = build(opts.layout ? undefined : pick.layout)
  // a battlefield layout the engine will not take must never stop the game: retry on the scenario's own terrain
  if (!opts.layout && pick.layout && (r instanceof Error || r.rejection)) r = build()
  if (r instanceof Error) return reject('E_BAD_SETUP', r.message, null)
  if (r.rejection) return reject(r.rejection.code, r.rejection.message, null)
  const controllers = { A: 'human', B: 'bot', ...(opts.controllers ?? {}) } as Record<PlayerId, Controller>
  const bot: BotConfig = { tier: opts.bot?.tier ?? 'random', seed: opts.bot?.seed ?? seed }
  setBoardId(pick.board)
  startFrom(r.state, r.events, controllers, bot, true)
  return null
}

/**
 * Answer the open decision. `source` 'human' is refused (client-side) when the decision belongs to a bot.
 * Returns null when accepted, else the rejection (also stored in lastRejection).
 */
export function dispatch(action: Action, source: DispatchSource = 'human'): ClientRejection | null {
  const s = useGameStore.getState()
  if (!s.state) return reject('E_CLIENT', 'no game', action, 'Start a game first.')
  if (s.fatal) return reject('E_CLIENT', s.fatal, action, 'The game hit an internal error; load a save or start again.')
  const pd = s.state.pending
  if (source === 'human' && s.controllers[pd.player] !== 'human') return reject('E_NOT_YOUR_DECISION', `decision ${pd.id} belongs to the bot (${pd.player})`, action)
  let r
  try {
    r = step(s.state, action)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (e instanceof EngineInvariantError) useGameStore.setState({ fatal: msg })
    return reject('E_CLIENT', msg, action, 'The game hit an internal error.')
  }
  if (r.rejection) return reject(r.rejection.code, r.rejection.message, action)
  if (r.state === s.state && !r.events.length) return null // gameOver ack: nothing changes
  commitStep(s.state, r.state, r.events, s.lastRejection ? { lastRejection: null } : {})
  return null
}

/** Build an action for the open decision from its payload (decisionId and player filled in). */
export type ActionPayload = Action extends infer A ? (A extends Action ? Omit<A, 'decisionId' | 'player'> : never) : never
export function actionFor(payload: ActionPayload): Action | null {
  const pd = useGameStore.getState().state?.pending
  if (!pd) return null
  return { ...payload, decisionId: pd.id, player: pd.player } as Action
}

export function clearRejection(): void { if (useGameStore.getState().lastRejection) useGameStore.setState({ lastRejection: null }) }

export function setController(player: PlayerId, c: Controller): void {
  useGameStore.setState((s) => ({ controllers: { ...s.controllers, [player]: c } }))
}

export function isHumanDecision(s: GameStoreState = useGameStore.getState()): boolean {
  return !!s.pending && s.pending.kind !== 'gameOver' && s.controllers[s.pending.player] === 'human'
}
export function isBotDecision(s: GameStoreState = useGameStore.getState()): boolean {
  return !!s.pending && s.pending.kind !== 'gameOver' && s.controllers[s.pending.player] === 'bot'
}

// ---------- save / load (localStorage via storage.ts) ----------
export const SAVE_PREFIX = 'wm.save.'
export const AUTOSAVE_SLOT = 'auto'

/** What we store: the engine SaveFile plus who controls each side. */
export interface ClientSave { kind: 'whirr-save'; v: 1; file: SaveFile; controllers: Record<PlayerId, Controller>; bot: BotConfig; board?: Id }
export interface SaveSummary { slot: string; label: string; savedAt: string; scenario: Id; round: number | null; actions: number }

export function exportSave(label = ''): ClientSave | null {
  const s = useGameStore.getState()
  if (!s.state) return null
  return { kind: 'whirr-save', v: 1, file: engineSave(s.state, label), controllers: s.controllers, bot: s.bot, board: getBoardId() }
}

export function saveGame(slot = AUTOSAVE_SLOT, label = ''): boolean {
  const data = exportSave(label)
  if (!data) return false
  writeJson(SAVE_PREFIX + slot, { ...data, round: useGameStore.getState().state?.round ?? null })
  return true
}

const isClientSave = (x: unknown): x is ClientSave => !!x && typeof x === 'object' && (x as ClientSave).kind === 'whirr-save'
const isSaveFile = (x: unknown): x is SaveFile => !!x && typeof x === 'object' && Array.isArray((x as SaveFile).actions) && !!(x as SaveFile).setup

/** Load a ClientSave or a bare engine SaveFile (controllers then stay as they are). No replay animation. */
export function importSave(data: unknown): ClientRejection | null {
  const file = isClientSave(data) ? data.file : isSaveFile(data) ? data : null
  if (!file) return reject('E_BAD_PAYLOAD', 'not a save file', null)
  let r
  try { r = engineLoad(file, loadBundle()) } catch (e) { return reject('E_CLIENT', e instanceof Error ? e.message : String(e), null, 'That save could not be loaded.') }
  if (r.rejection) return reject(r.rejection.code, r.rejection.message, null)
  const cur = useGameStore.getState()
  const controllers = isClientSave(data) ? data.controllers : cur.controllers
  const bot = isClientSave(data) ? data.bot : { ...cur.bot, seed: file.seed }
  setBoardId(boardForLoad(isClientSave(data) ? data.board : undefined, r.state.setup.layout, file.seed))
  startFrom(r.state, [], controllers, bot, false)
  return null
}

export function loadGame(slot = AUTOSAVE_SLOT): ClientRejection | null {
  const data = readJson<unknown>(SAVE_PREFIX + slot)
  if (!data) return reject('E_CLIENT', `no save in slot ${slot}`, null, 'No saved game there.')
  return importSave(data)
}

export function hasSave(slot = AUTOSAVE_SLOT): boolean { return getStorage().getItem(SAVE_PREFIX + slot) !== null }
export function deleteSave(slot: string): void { getStorage().removeItem(SAVE_PREFIX + slot) }

export function listSaves(): SaveSummary[] {
  const out: SaveSummary[] = []
  for (const k of getStorage().keys()) {
    if (!k.startsWith(SAVE_PREFIX)) continue
    const d = readJson<ClientSave & { round?: number | null }>(k)
    if (!d || !isClientSave(d)) continue
    out.push({ slot: k.slice(SAVE_PREFIX.length), label: d.file.meta.label, savedAt: d.file.meta.savedAt, scenario: d.file.setup.scenario, round: d.round ?? null, actions: d.file.actions.length })
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

/** Autosave at the start of every turn (installed by bootClient). Returns an unsubscribe. */
export function installAutosave(slot = AUTOSAVE_SLOT): () => void {
  let lastTurn = -1
  return useGameStore.subscribe((s) => {
    const st = s.state
    if (!st || st.turn === lastTurn) return
    lastTurn = st.turn
    if (st.phase !== 'setup') saveGame(slot, 'Autosave')
  })
}

/** Tests: forget the current game entirely. */
export function resetGameStore(): void {
  useGameStore.setState({ ...INITIAL })
  resetPresentation(null, 0)
  ui.reset()
}
