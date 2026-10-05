// FROZEN client contract (M3). The board, UI and start-screen code import ONLY from here (plus engine types).
// Additive changes only; log them at the bottom of this file.
//
// Rules for callers:
//  - Render from the PRESENTED state (usePresented*), never from the true state: it trails the animations.
//  - Never compute a rules number. Hit/damage targets, odds, LOS, distances, threat and scenario control come from
//    the engine via the query* helpers below, pending.context / pending.options, or event payloads.
//  - Answer decisions only through game.answer / game.answerOption / game.pass / game.dispatch.
//  - Selectors return stable references (no new arrays/objects per call), so they are safe as React hooks.
import { useShallow } from 'zustand/react/shallow'
import {
  describe as engineDescribe, query,
  type Action, type GameState, type Id, type ModelId, type ModelState, type PendingDecision, type PlayerId, type Stat, type Vec2,
} from '../engine/index'
import { useAnnounceStore, type Banner, type NarrationLine } from './presentation/announceStore'
import { ease, pointAlong } from './presentation/beats'
import { directorNow, setPaused, skipAll, skipBeat } from './presentation/director'
import { usePresentedStore, type ActiveBeat, type DamagePop, type FeedEntry, type MoveTween, type ShownRoll } from './presentation/presentedStore'
import { dataName, modelName, narrate, playerName, ROLL_PURPOSE_LABELS, rollLabel, rollVerdict, endWord } from './presentation/labels'
import { startBotDriver } from './bot/botDriver'
import {
  actionFor, clearRejection, deleteSave, dispatch, exportSave, hasSave, importSave, installAutosave, isHumanDecision, legalFor,
  listSaves, loadGame, newGame, saveGame, setController, useGameStore,
  type ActionPayload, type ClientRejection, type Controller, type GameStoreState,
} from './store/gameStore'
import { SPEED_PRESETS, useSettingsStore, type Settings } from './store/settingsStore'
import { installTestHooks, setupFromUrl } from './store/testHooks'
import { ui, useUiStore, type MeasureEnd, type UiMode } from './store/uiStore'

// ---------- types callers need ----------
export type {
  ActiveBeat, ActionPayload, Banner, ClientRejection, Controller, DamagePop, FeedEntry, MeasureEnd, MoveTween, NarrationLine,
  Settings, ShownRoll, UiMode,
}
export type { BotTier, ClientSave, NewGameOptions, SaveSummary } from './store/gameStore'
export type { GameTestApi } from './store/testHooks'
export { SPEED_PRESETS }

// =====================================================================================================
// Presented state (render from these)
// =====================================================================================================
/** Engine state as of the animation cursor; null before a game. */
export const usePresentedState = (): GameState | null => usePresentedStore((s) => s.state)
/** One model as presented (position is its END position while a tween plays: use useTween/tweenPosition). */
export const usePresentedModel = (id: ModelId | null | undefined): ModelState | undefined => usePresentedStore((s) => (id ? s.state?.models[id] : undefined))
/** All models as presented (stable object until something changes). */
export const usePresentedModels = (): Record<ModelId, ModelState> | null => usePresentedStore((s) => s.state?.models ?? null)
/** Every model id in the presented state, any life state (shallow-stable: same array while the id set is unchanged). */
export const useModelIds = (): ModelId[] => usePresentedStore(useShallow((s) => (s.state ? Object.keys(s.state.models) : [])))
/** Active move tween for a model, if any. */
export const useTween = (id: ModelId): MoveTween | undefined => usePresentedStore((s) => s.tweens[id])
/** All active move tweens. */
export const useTweens = (): Record<ModelId, MoveTween> => usePresentedStore((s) => s.tweens)
/** Where a tweening figure is at time `now` (directorNow()); eased along the path. Display only. */
export function tweenPosition(t: MoveTween, now = directorNow()): Vec2 {
  const f = t.durationMs > 0 ? Math.min(1, Math.max(0, (now - t.startedAt) / t.durationMs)) : 1
  return pointAlong(t.points, ease(f))
}
/** Clock the director times beats against (use it for tweens, pops and banner fades). */
export { directorNow }
/** True while any beat plays (canvas should keep invalidating). */
export const useAnimating = (): boolean => usePresentedStore((s) => s.beat !== null || Object.keys(s.tweens).length > 0)
/** True when nothing is queued or playing. */
export const usePresentationIdle = (): boolean => usePresentedStore((s) => s.idle)
/** Presentation paused (menu open). */
export const usePresentationPaused = (): boolean => usePresentedStore((s) => s.paused)
/** The beat playing now (kind, start, duration), or null. */
export const useCurrentBeat = (): ActiveBeat | null => usePresentedStore((s) => s.beat)
/** Last roll shown in the tray (still rolling when useCurrentBeat()?.kind === 'dice'). */
export const useShownRoll = (): ShownRoll | null => usePresentedStore((s) => s.roll)
/** Every roll shown this game, oldest first. */
export const useDiceLog = (): ShownRoll[] => usePresentedStore((s) => s.diceLog)
/** Floating damage/heal/miss pops; drop each after startedAt + durationMs. */
export const useDamagePops = (): DamagePop[] => usePresentedStore((s) => s.pops)
/** Every event shown so far (ring of 500), oldest first. */
export const useEventFeed = (): FeedEntry[] => usePresentedStore((s) => s.feed)
/** Seq of the last event shown. */
export const usePresentedCursor = (): number => usePresentedStore((s) => s.cursor)
/** Bumps on every presented change: frameloop="demand" canvases invalidate on it. */
export const usePresentedRev = (): number => usePresentedStore((s) => s.rev)
/** Big centred banner (round, turn, feat, game over), or null. */
export const useBanner = (): Banner | null => useAnnounceStore((s) => s.banner)
/** Narration log, one line per notable event (ring of 200). */
export const useNarration = (): NarrationLine[] => useAnnounceStore((s) => s.lines)
/** Game result once the presented state reaches the end, else null. */
export const useGameResult = (): GameState['scenario']['result'] | null =>
  usePresentedStore((s) => (s.state?.phase === 'ended' ? s.state.scenario.result ?? null : null))
/** VP as presented. */
export const usePresentedVp = (): Record<PlayerId, number> | null => usePresentedStore((s) => s.state?.scenario.vp ?? null)

// =====================================================================================================
// Decisions (gated on presentation idle: a prompt never refers to an un-shown event)
// =====================================================================================================
const promptOf = (g: GameStoreState, idle: boolean): PendingDecision | null => (idle && !g.fatal && isHumanDecision(g) ? g.pending : null)
/** The open decision when it is a human's to answer AND the presentation is idle; else null. */
export function usePrompt(): PendingDecision | null {
  const idle = usePresentedStore((s) => s.idle)
  return useGameStore((g) => promptOf(g, idle))
}
/** Legal answers for the prompt (engine-validated; empty when there is no prompt). */
export function usePromptLegal(): Action[] {
  const p = usePrompt()
  const state = useGameStore((g) => g.state)
  return p && state ? legalFor(state) : EMPTY
}
const EMPTY: Action[] = []
/** Whose decision is open and who controls that side (for "the bot is thinking"); null with no game / game over. */
export function useWaitingFor(): { player: PlayerId; controller: Controller } | null {
  return useGameStore(useShallow((g) => (g.pending && g.pending.kind !== 'gameOver' ? { player: g.pending.player, controller: g.controllers[g.pending.player] } : null)))
}
/** Last rejection (our words in .text, the engine's in .detail); cleared by the next accepted step. */
export const useRejection = (): ClientRejection | null => useGameStore((g) => g.lastRejection)
/** Engine crashed (bug): show a recovery screen. */
export const useFatal = (): string | null => useGameStore((g) => g.fatal)
/** Who controls each side. */
export const useControllers = (): Record<PlayerId, Controller> => useGameStore((g) => g.controllers)
/** True once a game exists. */
export const useHasGame = (): boolean => useGameStore((g) => g.state !== null)

// =====================================================================================================
// UI state
// =====================================================================================================
/** Selected model or unit id. */
export const useSelectedId = (): Id | null => useUiStore((s) => s.selectedId)
/** Selected model as presented (undefined for a unit id or nothing). */
export function useSelectedModel(): ModelState | undefined {
  const id = useUiStore((s) => s.selectedId)
  return usePresentedStore((s) => (id ? s.state?.models[id] : undefined))
}
/** Hovered model id. */
export const useHoverId = (): ModelId | null => useUiStore((s) => s.hoverId)
/** Current board mode (select/move/target/measure/los). */
export const useUiMode = (): UiMode => useUiStore((s) => s.mode)
/** Ruler endpoints. */
export const useMeasure = (): { from: MeasureEnd | null; to: MeasureEnd | null } => useUiStore(useShallow((s) => ({ from: s.measureFrom, to: s.measureTo })))
/** Threat rings toggle (T). */
export const useShowThreat = (): boolean => useUiStore((s) => s.showThreat)
/** Open side panel id. */
export const usePanel = (): string | null => useUiStore((s) => s.panel)
/** Player settings (speed, graphics, narration, confirmEndTurn). */
export const useSettings = (): Settings => useSettingsStore(useShallow((s) => ({ speed: s.speed, graphics: s.graphics, narration: s.narration, confirmEndTurn: s.confirmEndTurn })))

// =====================================================================================================
// Actions
// =====================================================================================================
export const game = {
  /** Start a game (lists, scenario, controllers, bot, seed). Returns a rejection or null. */
  newGame,
  /** Dispatch a full Action as the human (refused when the decision is the bot's). */
  dispatch: (a: Action): ClientRejection | null => dispatch(a, 'human'),
  /** Dispatch a payload for the open decision; decisionId and player are filled in. */
  answer(payload: ActionPayload): ClientRejection | null {
    const a = actionFor(payload)
    return a ? dispatch(a, 'human') : null
  },
  /** Pick one of pending.options by id. */
  answerOption(optionId: string): ClientRejection | null {
    const opt = useGameStore.getState().pending?.options?.find((o) => o.id === optionId)
    if (!opt) return null
    return dispatch(opt.action, 'human')
  },
  /** Pass the open decision (when pending.canPass). */
  pass: (): ClientRejection | null => game.answer({ type: 'pass' }),
  /** Legal answers for the true open decision (engine-validated, cached). */
  legal: (): Action[] => legalFor(useGameStore.getState().state),
  clearRejection,
  setController,
  /** Save to a localStorage slot (default 'auto'). */
  save: saveGame,
  /** Load a slot (no replay animation). */
  load: loadGame,
  listSaves,
  hasSave,
  deleteSave,
  /** Current game as a JSON-able save (for download). */
  exportSave,
  /** Load a save object (ClientSave or bare engine SaveFile). */
  importSave,
}

export const presentation = {
  /** Skip the beat playing now (wire to any click / pointerdown). */
  skip: skipBeat,
  /** Show everything queued immediately. */
  skipAll,
  setPaused,
  /** Animation speed: 1 normal, 2 fast, 0.5 slow, 0 instant (see SPEED_PRESETS). */
  setSpeed: (speed: number) => useSettingsStore.getState().set({ speed }),
}

export const uiActions = {
  select: ui.select,
  hover: ui.hover,
  setMode: ui.setMode,
  /** M / L keys: toggle the ruler / LOS view. */
  toggleTool: ui.toggleTool,
  setMeasure: ui.setMeasure,
  toggleThreat: ui.toggleThreat,
  openPanel: ui.openPanel,
}

export const settings = {
  set: (patch: Partial<Settings>) => useSettingsStore.getState().set(patch),
}

// =====================================================================================================
// Engine queries (bound to the TRUE state; prompts and tools only run while idle, when true == presented)
// =====================================================================================================
const truth = (): GameState | null => useGameStore.getState().state
/** Edge-to-edge distance (inches) between models / points. NaN with no game. */
export const queryDistance = (a: ModelId | Vec2, b: ModelId | Vec2): number => { const s = truth(); return s ? query.distance(s, a, b) : NaN }
/** LOS verdict, reasons, blockers and DEF flags. */
export const queryLos = (viewer: ModelId, target: ModelId) => { const s = truth(); return s ? query.los(s, viewer, target) : null }
/** Hit/damage numbers for a prospective attack. */
export const queryAttackPreview = (attacker: ModelId, weaponId: Id, target: ModelId, opts?: Parameters<typeof query.attackPreview>[4]) => {
  const s = truth(); return s ? query.attackPreview(s, attacker, weaponId, target, opts) : null
}
/** Threat ring radii for a model. */
export const queryThreat = (id: ModelId) => { const s = truth(); return s ? query.threat(s, id) : null }
/** Scenario control, VP now, kill-box status. */
export const queryControl = () => { const s = truth(); return s ? query.control(s) : null }
/** A resolved stat with its trace. */
export const queryStat = (id: ModelId, stat: Stat) => { const s = truth(); return s ? query.stat(s, id, stat) : null }
/** Would this advance path be legal? (drag preview; call at <= 30 Hz) */
export const queryMoveCheck = (id: ModelId, path: Vec2[]) => { const s = truth(); return s ? query.moveCheck(s, id, path) : null }
/** Engine-formatted title + lines for a decision (numbers from the engine). */
export const describeDecision = (p: PendingDecision) => { const s = truth(); return s ? engineDescribe.decision(s, p) : null }
/** Engine number formatting helpers (percent, mods, attack, roll). */
export { engineDescribe }

// ---------- labels (our words; names from data) ----------
export { dataName, endWord, modelName, narrate, playerName, ROLL_PURPOSE_LABELS, rollLabel, rollVerdict }

// =====================================================================================================
// Boot
// =====================================================================================================
let booted: (() => void) | null = null
export interface BootOptions { testHooks?: boolean; clickToSkip?: boolean; autosave?: boolean; bot?: boolean }

/**
 * Call once from App (idempotent): loads settings, starts the bot driver, autosave at each turn start, makes the
 * board follow human decisions (mode + selection), installs click-to-skip and, with ?test=1, window.__game.
 * Returns a teardown. Use setupFromUrl() to read `?scenario=&lists=&seed=&bot=&control=` for a fast start.
 */
export function bootClient(opts: BootOptions = {}): () => void {
  if (booted) return booted
  useSettingsStore.getState().reload()
  const offs: (() => void)[] = []
  if (opts.bot !== false) { const d = startBotDriver(); offs.push(() => d.stop()) }
  if (opts.autosave !== false) offs.push(installAutosave())
  offs.push(installFollowDecision())
  if (opts.clickToSkip !== false && typeof window !== 'undefined') {
    const onDown = () => { if (!usePresentedStore.getState().idle) skipBeat() }
    window.addEventListener('pointerdown', onDown, { capture: true })
    offs.push(() => window.removeEventListener('pointerdown', onDown, { capture: true }))
  }
  installTestHooks(opts.testHooks === true)
  booted = () => { for (const f of offs) f(); booted = null }
  return booted
}
export { setupFromUrl, installTestHooks }

/** When a human prompt becomes visible, put the board in that decision's mode and select its model. */
function installFollowDecision(): () => void {
  let lastId: string | null = null
  const check = () => {
    const p = promptOf(useGameStore.getState(), usePresentedStore.getState().idle)
    if (!p || p.id === lastId) return
    lastId = p.id
    ui.followDecision(p.kind, p.context.modelId)
  }
  const a = useGameStore.subscribe(check)
  const b = usePresentedStore.subscribe(check)
  return () => { a(); b() }
}

// Additive changes after the M3 freeze:
//   (none yet)
