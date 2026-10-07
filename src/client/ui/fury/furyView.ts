// Fury view models (81 section G). Pure: every number comes from query.* (fury, battlegroup, threshold, spiral,
// transferPreview, leechPreview, frenzyTarget), pending.context or events. The only arithmetic here is formatting and
// "who is over a display threshold". Queries run on the state passed in (the presented state for cards, the true
// state for prompts, which only open while the presentation is idle).
import {
  query, ASPECT_LETTER,
  type Aspect, type BattlegroupInfo, type FuryBlock, type FuryInfo, type GameState, type LeechPlan, type LeechPreview, type ModelId,
  type PendingDecision, type SpiralView, type TransferPreviewRow,
} from '../../../engine/index'
import { modelName } from '../../contract'
import { pct, typeWord } from '../format'

/** Frenzy chance above which the badge turns red (81 G). */
export const FRENZY_HOT = 0.3

function safe<T>(f: () => T): T | null {
  try { return f() } catch { return null }
}

export const ASPECTS: readonly Aspect[] = ['mind', 'body', 'spirit']
export const ASPECT_WORD: Record<Aspect, string> = { mind: 'Mind', body: 'Body', spirit: 'Spirit' }
/** What a crippled aspect does, in our words. */
export const ASPECT_EFFECT: Record<Aspect, string> = {
  mind: 'One die fewer on attack rolls; no power attacks or special attacks.',
  body: 'One die fewer on damage rolls.',
  spirit: 'The warbeast cannot be forced.',
}
export const aspectLetter = (a: Aspect): string => ASPECT_LETTER[a].toUpperCase()

const BLOCK_WORD: Record<FuryBlock, string> = {
  wild: 'Wild: it has lost its warlock',
  frenzied: 'Frenzying right now',
  spirit: 'Spirit crippled',
  outOfCtrl: 'Outside its warlock’s control range',
  cap: 'Already holding all the fury it can',
  noController: 'No warlock in charge of it',
}
export const blockWord = (b: FuryBlock | undefined): string => (b ? BLOCK_WORD[b] : '')

/** "Warlock" / "Warbeast" for fury models, the usual word for everything else. */
export const kindWord = (m: { type: string; fury?: number }): string => (m.fury === undefined ? typeWord(m.type) : m.type === 'beast' ? 'Warbeast' : 'Warlock')

export type FuryTone = 'ok' | 'warn' | 'hot'
export interface FuryBadge {
  id: ModelId
  kind: 'warlock' | 'beast'
  fury: number
  cap: number
  capStat: 'ARC' | 'FURY'
  /** One entry per pip: true = filled. Length = max(cap, fury), at most 12 for drawing. */
  pips: boolean[]
  forceable: boolean
  block?: FuryBlock
  blockText: string
  inCtrl?: boolean
  wild: boolean
  /** Beasts only: threshold and the frenzy chance at the next check (null for constructs and wild beasts). */
  thr: number | null
  pFrenzy: number | null
  construct: boolean
  tone: FuryTone
  /** "Fury 2/6 (ARC)" */
  label: string
}

const MAX_PIPS = 12

/** Badge for a fury model (warlock or beast); null for anything else. */
export function furyBadge(state: GameState, id: ModelId): FuryBadge | null {
  const m = state.models[id]
  if (!m || m.fury === undefined) return null
  const info: FuryInfo | null = safe(() => query.fury(state, id))
  if (!info || !info.kind) return null
  const wild = !!m.wild
  let thr: number | null = null
  let p: number | null = null
  let construct = false
  if (info.kind === 'beast') {
    const t = safe(() => query.threshold(state, id))
    if (t) { thr = t.thr; construct = t.construct; p = construct || wild ? null : t.pFrenzy }
  }
  const tone: FuryTone = p !== null && p > FRENZY_HOT ? 'hot' : p !== null && p > 0 ? 'warn' : 'ok'
  const n = Math.min(MAX_PIPS, Math.max(info.cap, info.fury))
  return {
    id, kind: info.kind, fury: info.fury, cap: info.cap, capStat: info.capStat,
    pips: Array.from({ length: n }, (_, i) => i < info.fury), forceable: info.forceable, ...(info.block ? { block: info.block } : {}),
    blockText: blockWord(info.block), ...(info.inCtrl !== undefined ? { inCtrl: info.inCtrl } : {}), wild, thr, pFrenzy: p, construct, tone,
    label: `Fury ${info.fury}/${info.cap} (${info.capStat})`,
  }
}

export interface BeastRow {
  id: ModelId
  name: string
  fury: number
  cap: number
  inCtrl: boolean
  forceable: boolean
  blockText: string
  pFrenzy: number
  tone: FuryTone
}
export interface BattlegroupView { ctrl: number; leechRoom: number; spiritBond: number; rows: BeastRow[] }

/** The strip under a warlock: its beasts with fury bars, in-control dot and the reason one cannot be forced. */
export function battlegroupView(state: GameState, warlockId: ModelId): BattlegroupView | null {
  const bg: BattlegroupInfo | null = safe(() => query.battlegroup(state, warlockId))
  if (!bg || !bg.beasts.length) return null
  return {
    ctrl: bg.ctrl, leechRoom: bg.leechRoom, spiritBond: bg.spiritBond,
    rows: bg.beasts.map((b) => ({
      id: b.modelId, name: modelName(state, b.modelId), fury: b.fury, cap: b.cap, inCtrl: !!b.inCtrl, forceable: b.forceable,
      blockText: blockWord(b.block), pFrenzy: b.pFrenzyNow, tone: b.pFrenzyNow > FRENZY_HOT ? 'hot' : b.pFrenzyNow > 0 ? 'warn' : 'ok',
    })),
  }
}

/** Where the model stands on its fury, in a sentence (cards, tooltips). */
export function furySentence(b: FuryBadge): string {
  if (b.kind === 'warlock') return `Holds ${b.fury} of ${b.cap} fury.`
  const parts = [`Holds ${b.fury} of ${b.cap} fury.`]
  if (b.wild) parts.push('Wild: no fury, no orders.')
  else if (b.pFrenzy !== null) parts.push(b.pFrenzy > 0 ? `Frenzy chance at the next check: ${pct(b.pFrenzy)}.` : 'Safe at the next check.')
  else if (b.construct) parts.push('A construct: it never frenzies.')
  if (!b.forceable && b.blockText && !b.wild) parts.push(`Cannot be forced: ${b.blockText.toLowerCase()}.`)
  return parts.join(' ')
}

// ---------- spiral ----------
export interface SpiralBoxView { branch: number; i: number; aspect: Aspect | null; filled: boolean; flash: boolean }
export interface SpiralModel {
  branches: { branch: number; boxes: SpiralBoxView[] }[]
  unmarked: number
  filled: number
  total: number
  aspects: { aspect: Aspect; total: number; filled: number; crippled: boolean; effect: string }[]
}

/** The life spiral as the card draws it. `flash` holds box keys "main:<branch-1>:<i>" from the last DamageApplied. */
export function spiralModel(state: GameState, id: ModelId, flash?: ReadonlySet<string>): SpiralModel | null {
  const sv: SpiralView | null = safe(() => query.spiral(state, id))
  if (!sv) return null
  let filled = 0
  let total = 0
  const branches = sv.branches.map((b) => ({
    branch: b.branch,
    boxes: b.boxes.map((x, i) => {
      total++
      if (x.filled) filled++
      return { branch: b.branch, i, aspect: x.aspect, filled: x.filled, flash: flash?.has(`main:${b.branch - 1}:${i}`) ?? false }
    }),
  }))
  return {
    branches, unmarked: sv.unmarked, filled, total,
    aspects: ASPECTS.map((a) => ({ aspect: a, ...sv.aspects[a], effect: ASPECT_EFFECT[a] })),
  }
}

// ---------- button costs ----------
/** "+1 fury on Bomber" / "1 fury" / "2 focus" for a decision option cost. */
export function costWords(cost: { focus: number; fury?: number; forced?: number } | undefined, beastName?: string): string | undefined {
  if (!cost) return undefined
  const parts: string[] = []
  if (cost.focus) parts.push(`${cost.focus} focus`)
  if (cost.fury) parts.push(`${cost.fury} fury`)
  if (cost.forced) parts.push(`+${cost.forced} fury on ${beastName ?? 'the beast'}`)
  return parts.length ? parts.join(', ') : undefined
}

/**
 * Who pays and what is left, for a boost prompt: "1 focus, 4 left", "1 fury, 2 left" (warlock) or
 * "forces +1 fury on Bomber, holds 2/4" (warbeast). Counts come from the state and the engine's option cost.
 */
export function payWords(state: GameState, modelId: ModelId | undefined, cost: { focus: number; fury?: number; forced?: number } | undefined): string {
  const m = modelId ? state.models[modelId] : undefined
  if (cost?.forced && modelId) {
    const b = furyBadge(state, modelId)
    return `forces +${cost.forced} fury on ${modelName(state, modelId)}${b ? `, holds ${b.fury}/${b.cap}` : ''}`
  }
  if (m?.fury !== undefined && cost?.fury) return `${cost.fury} fury, ${Math.max(0, m.fury - cost.fury)} left`
  const n = cost?.focus ?? 1
  return `${n} focus, ${Math.max(0, (m?.focus ?? 0) - n)} left`
}

/** True when the cost makes a beast gain fury (shown red). */
export const isForcedCost = (cost: { forced?: number } | undefined): boolean => !!cost?.forced

// ---------- leech ----------
export interface LeechSource { beastId: ModelId; name: string; fury: number; pFrenzyNow: number }
export interface LeechModel { warlockId: ModelId; room: number; selfMax: number; sources: LeechSource[]; warlockFury: number; warlockCap: number }

/** Leech decision context (pending.context.data: room, sources, selfMax) as a view model. */
export function leechModel(state: GameState, pd: PendingDecision): LeechModel | null {
  const id = pd.context.modelId
  const d = pd.context.data as { room?: number; selfMax?: number; sources?: { beastId: ModelId; fury: number; pFrenzyNow: number }[] } | undefined
  if (!id || !d) return null
  const b = furyBadge(state, id)
  return {
    warlockId: id, room: d.room ?? 0, selfMax: d.selfMax ?? 0, warlockFury: b?.fury ?? state.models[id]?.fury ?? 0, warlockCap: b?.cap ?? 0,
    sources: (d.sources ?? []).map((s) => ({ ...s, name: modelName(state, s.beastId) })),
  }
}

export const planTotal = (plan: LeechPlan): number => Object.values(plan.from).reduce((a, n) => a + n, 0) + plan.self

/** Engine odds for a leech plan; null when the engine refuses the preview. */
export function leechPreviewFor(state: GameState, warlockId: ModelId, plan: LeechPlan): LeechPreview | null {
  return safe(() => query.leechPreview(state, warlockId, plan))
}

// ---------- transfer ----------
export interface TransferCandidate {
  optionId: string
  beastId: ModelId
  name: string
  absorbed: number
  overflow: number
  fury: number
  cap: number
  unmarked: number
  pDisabled: number
  /** Aspects with a non-zero chance of being crippled by this transfer. */
  cripple: { aspect: Aspect; p: number }[]
}
export interface TransferModel { warlockId: ModelId; points: number; warlockBoxesLeft: number; warlockFury: number; candidates: TransferCandidate[] }

/** Transfer decision (context.data.rows come from query.transferPreview) as a view model. */
export function transferModel(state: GameState, pd: PendingDecision, boxesLeft: (id: ModelId) => number): TransferModel | null {
  const w = pd.context.modelId
  const d = pd.context.data as { points?: number; rows?: TransferPreviewRow[] } | undefined
  if (!w || !d || d.points === undefined) return null
  const rows = d.rows ?? safe(() => query.transferPreview(state, w, d.points!)) ?? []
  const candidates: TransferCandidate[] = rows.filter((r) => r.eligible).map((r) => ({
    optionId: `to:${r.beastId}`, beastId: r.beastId, name: modelName(state, r.beastId), absorbed: r.absorbed, overflow: r.overflow, fury: r.fury, cap: r.cap,
    unmarked: r.unmarked, pDisabled: r.pDisabled,
    cripple: ASPECTS.map((a) => ({ aspect: a, p: r.pCripple[a] ?? 0 })).filter((x) => x.p > 0),
  }))
  return { warlockId: w, points: d.points, warlockBoxesLeft: boxesLeft(w), warlockFury: state.models[w]?.fury ?? 0, candidates }
}

// ---------- vent ----------
/** Frenzy-over prompt: frenzy chance at the next check for each amount vented (query.threshold with negative extra fury). */
export function ventOdds(state: GameState, beastId: ModelId, vent: number): number | null {
  const t = safe(() => query.threshold(state, beastId, -vent))
  return t ? (t.construct ? null : t.pFrenzy) : null
}

/** Prediction for the frenzy line: who the beast will go for (query.frenzyTarget). */
export function frenzyPrediction(state: GameState, beastId: ModelId): { names: string[]; friendly: boolean; canCharge: boolean; distance: number } | null {
  const f = safe(() => query.frenzyTarget(state, beastId))
  if (!f) return null
  return { names: f.tiedIds.map((t) => modelName(state, t)), friendly: f.friendly, canCharge: f.canCharge, distance: f.distance }
}
