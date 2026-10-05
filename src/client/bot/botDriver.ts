// Bot driver (50 §2, 40 §8): answers bot-owned decisions through gameStore.dispatch, only while the presentation
// is idle, so the bot never acts over an animation the player has not seen. A watchdog force-answers (first legal
// action) when a bot decision has made no progress for WATCHDOG_MS, whatever the presentation is doing.
// Tiers (40 §8): 'random' is the sensible random bot; 'easy' and 'normal' are the utility AI (src/ai/decider.ts), run in
// a Web Worker when the browser has one (so a slow decision never blocks a frame) and on the main thread otherwise.
import { decideSync, newBrain, type Brain } from '../../ai/decider'
import { pickSensible } from '../../ai/random'
import type { AiTierId } from '../../ai/tiers'
import type { Action, GameState, PendingDecision } from '../../engine/index'
import { isPresentationIdle, usePresentedStore } from '../presentation/presentedStore'
import { skipAll } from '../presentation/director'
import { dispatch, isBotDecision, legalFor, useGameStore, type BotTier } from '../store/gameStore'
import { scaled, useSettingsStore } from '../store/settingsStore'
import { createAiWorkerClient, type AiWorkerClient } from './aiWorkerClient'

export const WATCHDOG_MS = 5000
/** Pause before the bot answers at speed 1, so a human can follow along (scaled by speed; 0 when instant). */
export const BOT_THINK_MS = 300

/** Tiers the utility AI plays ('hard' is M9+: it plays as normal until then). */
export const AI_TIERS: readonly BotTier[] = ['easy', 'normal', 'hard']
export const isAiTier = (t: BotTier): boolean => AI_TIERS.includes(t)
const aiTier = (t: BotTier): AiTierId => (t === 'easy' ? 'easy' : 'normal')
const brainKey = (seed: string, pending: PendingDecision, tier: BotTier): string => `${seed}:${pending.player}:${aiTier(tier)}`

// one brain per (seed, seat, tier) on the main thread; plans are recomputed on a miss, so this is only a cache
const brains = new Map<string, Brain>()
function brainFor(key: string): Brain {
  let b = brains.get(key)
  if (!b) { if (brains.size > 8) brains.clear(); b = newBrain(); brains.set(key, b) }
  if (b.plans.size > 400) b.plans.clear()
  return b
}

/** Pick an answer for a bot decision (synchronous: the sim, tests and the no-worker fallback). */
export function chooseBotAction(state: GameState, pending: PendingDecision, legal: Action[], seed: string, tier: BotTier = 'random'): Action {
  try {
    // the AI can also answer a deployment the engine has no suggestion for (empty legal list)
    if (isAiTier(tier) || !legal.length) {
      return decideSync(state, pending, legal, { tier: aiTier(isAiTier(tier) ? tier : 'normal'), seed: `${seed}:${pending.player}`, brain: brainFor(brainKey(seed, pending, tier)) })
    }
    return pickSensible(state, pending, legal, `${seed}:${pending.player}`)
  } catch {
    return legal[0]!
  }
}

export interface BotDriverOptions {
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (h: unknown) => void
  watchdogMs?: number
  thinkMs?: number
  /** AI worker for the easy/normal tiers; null = always decide on the main thread. Default: a worker when available. */
  worker?: AiWorkerClient | null
}

export interface BotDriver {
  /** Answer one bot decision if allowed right now. Returns what happened. */
  tick(): 'answered' | 'forced' | 'waiting' | 'notBot'
  /** Subscribe to the stores and keep answering until stop(). */
  start(): void
  stop(): void
  readonly running: boolean
  /** Count of watchdog force-answers since creation. */
  readonly forced: number
}

export function createBotDriver(opts: BotDriverOptions = {}): BotDriver {
  const now = opts.now ?? (() => Date.now())
  const setT = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
  const clearT = opts.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const watchdogMs = opts.watchdogMs ?? WATCHDOG_MS
  const thinkMs = opts.thinkMs ?? BOT_THINK_MS

  let seenDecision: string | null = null
  let since = now()
  let forced = 0
  let running = false
  let unsubs: (() => void)[] = []
  let tickTimer: unknown = null
  let dogTimer: unknown = null
  let worker: AiWorkerClient | null | undefined = opts.worker
  let inflight: string | null = null // decision id the worker is thinking about

  function noteDecision(): void {
    const id = useGameStore.getState().pending?.id ?? null
    if (id !== seenDecision) { seenDecision = id; since = now() }
  }

  /** Ask the worker; the answer is dispatched when it comes back, if the same decision is still open. */
  function answerAsync(): boolean {
    const s = useGameStore.getState()
    if (!s.state || !s.pending || !worker) return false
    const pending = s.pending
    if (inflight === pending.id) return true
    inflight = pending.id
    const legal = legalFor(s.state)
    const tier = s.bot.tier
    void worker.decide(s.state, legal, `${s.bot.seed}:${pending.player}`, aiTier(tier), brainKey(s.bot.seed, pending, tier)).then((a) => {
      if (inflight === pending.id) inflight = null
      const cur = useGameStore.getState()
      if (!running || !cur.state || cur.pending?.id !== pending.id || !isBotDecision(cur)) return
      const pick = a ?? chooseBotAction(cur.state, pending, legal, cur.bot.seed, 'random')
      let rej = dispatch(pick, 'bot')
      if (rej && legal[0] && pick !== legal[0]) rej = dispatch(legal[0], 'watchdog')
    })
    return true
  }

  function answer(force: boolean): boolean {
    const s = useGameStore.getState()
    if (!s.state || !s.pending) return false
    const legal = legalFor(s.state)
    if (!force && isAiTier(s.bot.tier)) {
      if (worker === undefined) worker = createAiWorkerClient()
      if (worker) return answerAsync()
    }
    if (!legal.length) {
      // a deployment with no engine suggestion: the AI builds one
      const pick = chooseBotAction(s.state, s.pending, legal, s.bot.seed, s.bot.tier)
      return !!pick && !dispatch(pick, force ? 'watchdog' : 'bot')
    }
    const pick = force ? legal[0]! : chooseBotAction(s.state, s.pending, legal, s.bot.seed, s.bot.tier)
    let rej = dispatch(pick, force ? 'watchdog' : 'bot')
    if (rej && pick !== legal[0]) rej = dispatch(legal[0]!, 'watchdog')
    return !rej
  }

  function tick(): 'answered' | 'forced' | 'waiting' | 'notBot' {
    noteDecision()
    const s = useGameStore.getState()
    if (s.fatal || !isBotDecision(s)) return 'notBot'
    if (inflight === s.pending?.id && now() - since < watchdogMs) return 'waiting'
    if (isPresentationIdle()) {
      const ok = answer(false)
      return ok && inflight !== s.pending?.id ? 'answered' : 'waiting'
    }
    if (now() - since >= watchdogMs) {
      forced++
      skipAll()
      return answer(true) ? 'forced' : 'waiting'
    }
    return 'waiting'
  }

  function schedule(): void {
    if (!running || tickTimer !== null) return
    const s = useGameStore.getState()
    if (!isBotDecision(s) || !isPresentationIdle()) return
    if (inflight !== null && inflight === s.pending?.id) return // the worker's answer re-schedules through the store
    tickTimer = setT(() => { tickTimer = null; if (running) { tick(); schedule() } }, scaled(thinkMs, useSettingsStore.getState().speed))
  }

  function armWatchdog(): void {
    if (dogTimer !== null) clearT(dogTimer)
    dogTimer = null
    if (!running) return
    noteDecision()
    if (!isBotDecision()) return
    const left = Math.max(0, since + watchdogMs - now())
    dogTimer = setT(() => { dogTimer = null; if (running) { tick(); schedule(); armWatchdog() } }, left + 1)
  }

  return {
    tick,
    start() {
      if (running) return
      running = true
      noteDecision()
      unsubs = [
        useGameStore.subscribe((s, prev) => { if (s.pending !== prev.pending || s.controllers !== prev.controllers) { schedule(); armWatchdog() } }),
        usePresentedStore.subscribe((s, prev) => { if (s.idle !== prev.idle && s.idle) schedule() }),
      ]
      schedule()
      armWatchdog()
    },
    stop() {
      running = false
      inflight = null
      for (const u of unsubs) u()
      unsubs = []
      if (tickTimer !== null) clearT(tickTimer)
      if (dogTimer !== null) clearT(dogTimer)
      tickTimer = null
      dogTimer = null
    },
    get running() { return running },
    get forced() { return forced },
  }
}

let appDriver: BotDriver | null = null
/** The app's single driver (started by bootClient). */
export function startBotDriver(): BotDriver {
  appDriver ??= createBotDriver()
  appDriver.start()
  return appDriver
}
export function stopBotDriver(): void { appDriver?.stop() }
