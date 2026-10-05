// State AS OF THE ANIMATION CURSOR (50 §2). Everything on screen renders from here; panels never show a number
// ahead of its animation. The director (director.ts) is the only writer. Arrays are replaced, never mutated, so
// selectors can return them directly.
import { create } from 'zustand'
import type { DiceRolled, GameState, ModelId, Vec2 } from '../../engine/index'
import type { BeatKind, PopSpec, SeqEvent } from './beats'

export interface MoveTween {
  modelId: ModelId
  points: Vec2[] // polyline, first = where the figure starts
  startedAt: number // clock ms (see director clock)
  durationMs: number
}

export interface ActiveBeat { id: number; kind: BeatKind; startedAt: number; durationMs: number; firstSeq: number; lastSeq: number }

export interface ShownRoll { seq: number; event: DiceRolled; label: string; verdict: string | null; startedAt: number; durationMs: number }

export interface DamagePop extends PopSpec { id: number; startedAt: number; durationMs: number }

export interface FeedEntry { seq: number; event: SeqEvent['event'] }

export const FEED_LIMIT = 500
export const DICE_LOG_LIMIT = 400

export interface PresentedState {
  /** Engine state at the animation cursor; null before a game exists. */
  state: GameState | null
  /** Seq of the last event shown. */
  cursor: number
  /** True when nothing is queued or playing. Prompts and the bot wait for this. */
  idle: boolean
  /** Presentation paused (menu open, debugging). The bot watchdog still runs. */
  paused: boolean
  beat: ActiveBeat | null
  tweens: Record<ModelId, MoveTween>
  /** Last roll shown (stays in the tray after its beat ends; `beat?.kind === 'dice'` says it is still rolling). */
  roll: ShownRoll | null
  pops: DamagePop[]
  /** Every roll shown so far this game, oldest first (ring of DICE_LOG_LIMIT). */
  diceLog: ShownRoll[]
  /** Every event shown so far, oldest first (ring of FEED_LIMIT). */
  feed: FeedEntry[]
  /** Bumped on every presented change: canvases can invalidate on it. */
  rev: number
}

export const INITIAL_PRESENTED: PresentedState = {
  state: null, cursor: 0, idle: true, paused: false, beat: null, tweens: {}, roll: null, pops: [], diceLog: [], feed: [], rev: 0,
}

export const usePresentedStore = create<PresentedState>(() => ({ ...INITIAL_PRESENTED }))

export function patchPresented(patch: Partial<PresentedState>): void {
  usePresentedStore.setState((s) => ({ ...patch, rev: s.rev + 1 }))
}

export function isPresentationIdle(): boolean { return usePresentedStore.getState().idle }
