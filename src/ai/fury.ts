// Warlocks, warbeasts and fury (81 §F): the AI's fury economy. A warlock spends its own fury (boosts, spells, upkeeps, heals,
// transfers) and refills by leeching; a beast is forced, which puts fury ON the beast and risks a frenzy at the next
// Control Phase unless the warlock leeches it off first. Everything here reads the engine's public queries only.
import type { Action, GameState, ModelId, ModelState } from '../engine/index'
import { query, validate } from '../engine/index'
import { boxesLeft, boxesTotal, dist, isBeast, isWarlock, live, other, rec, valueOf } from './world'

const stat = (m: ModelState, k: string): number => (((rec(m.profileId)?.stats ?? {}) as Record<string, number>)[k]) ?? 0

/** What a frenzy costs us, in value units: a charge into the closest model, friend or foe (81 F7). */
export function frenzyCost(s: GameState, beast: ModelState): number {
  let ft
  try { ft = query.frenzyTarget(s, beast.id) } catch { return 1 }
  if (!ft.canCharge) return ft.reason === 'noTarget' ? 0.8 : 0.4
  if (!ft.friendly) return 0.1
  const t = s.models[ft.tiedIds[0] ?? '']
  return 2.5 + (t ? 0.3 * valueOf(s, t) : 2) + 0.15 * valueOf(s, beast)
}

/** P(frenzy) if the beast holds `fury` points at its threshold check. */
export function pFrenzyAt(s: GameState, beast: ModelState, fury: number): number {
  const base = beast.fury ?? 0
  try { return query.threshold(s, beast.id, fury - base).pFrenzy } catch { return 0 }
}

/** Beasts of a warlock's battlegroup that are on the table. */
export function battlegroupOf(s: GameState, w: ModelState): ModelState[] {
  return Object.values(s.models).filter((m) => isBeast(m) && m.controllerId === w.id && !m.wild && live(m))
}

/** Fury the warlock is expected to hold after this turn's spending (it spends down to a small reserve). */
function keptFury(w: ModelState): number { return Math.min(w.fury ?? 0, 2) }

/**
 * Expected cost of leaving `k` more fury on a beast after this activation: next turn's leech room is ARC minus what the
 * warlock keeps; fury past it stays on beasts and frenzies with pFrenzy x frenzyCost (81 §F forcing).
 */
export function forcePenalty(s: GameState, beast: ModelState, k: number): number {
  const w = beast.controllerId ? s.models[beast.controllerId] : undefined
  if (!w || !live(w)) return 0.05 * k
  const f = beast.fury ?? 0
  const arc = stat(w, 'ARC')
  const room = Math.max(0, arc - keptFury(w))
  const others = battlegroupOf(s, w).filter((b) => b.id !== beast.id).reduce((a, b) => a + (b.fury ?? 0), 0)
  const before = Math.max(0, others + f - room)
  const after = Math.max(0, others + f + k - room)
  const cost = frenzyCost(s, beast)
  const left = (x: number): number => Math.min(f + k, x)
  const pen = pFrenzyAt(s, beast, left(after)) * cost - pFrenzyAt(s, beast, Math.min(f, before)) * cost
  return Math.max(0, pen) + 0.06 * k
}

/** Fury the warlock keeps back for transfers (the hard Leader-safety constraint's twin of the Power Field reserve). */
export function furyKept(w: ModelState, reserve: number): number { return Math.min(w.fury ?? 0, Math.max(0, reserve)) }

// ---------- leech (C2) ----------
export function leechAction(s: GameState, selfOk: boolean): Action | null {
  const pd = s.pending
  const w = pd.context.modelId ? s.models[pd.context.modelId] : undefined
  if (!w) return null
  const data = (pd.context.data ?? {}) as { room?: number; sources?: { beastId: ModelId; fury: number; pFrenzyNow: number }[]; selfMax?: number }
  let room = data.room ?? 0
  const src = (data.sources ?? []).map((x) => {
    const b = s.models[x.beastId]
    return { ...x, risk: b ? pFrenzyAt(s, b, x.fury) * frenzyCost(s, b) : x.pFrenzyNow }
  }).sort((a, b) => b.risk - a.risk || b.fury - a.fury || a.beastId.localeCompare(b.beastId))
  const from: Record<ModelId, number> = {}
  for (const x of src) {
    if (room <= 0) break
    const n = Math.min(x.fury, room)
    if (n > 0) { from[x.beastId] = n; room -= n }
  }
  // self-leech: only with plenty of boxes, little fury and room left after the beasts gave what they hold
  let self = 0
  if (selfOk && room > 0 && (w.fury ?? 0) + Object.values(from).reduce((a, n) => a + n, 0) < 3) {
    const total = boxesTotal(w), left = boxesLeft(w)
    if (left >= total * 0.85 && (data.selfMax ?? 0) >= 1) self = Math.min(room, 1, data.selfMax ?? 0)
  }
  const a = { type: 'leech', decisionId: pd.id, player: pd.player, warlockId: w.id, from, self } as Action
  return validate(s, a) === null ? a : null
}

// ---------- transfer (F8) ----------
export function transferAction(s: GameState, legal: Action[], easy: boolean): Action {
  const pd = s.pending
  const keep = legal.find((a) => a.type === 'transferDamage' && a.toId === null) ?? legal[0]!
  const w = pd.context.modelId ? s.models[pd.context.modelId] : undefined
  const data = (pd.context.data ?? {}) as { points?: number }
  const points = Number(data.points ?? 0)
  if (!w || points <= 0) return keep
  const rows = query.transferPreview(s, w.id, points).filter((r) => r.eligible)
  if (!rows.length) return keep
  const left = boxesLeft(w), total = boxesTotal(w)
  const lethal = points >= left || left - points <= 3
  let best: Action = keep, bv = -Infinity
  const wv = valueOf(s, w) * 1.6
  for (const r of rows) {
    const act = legal.find((a) => a.type === 'transferDamage' && a.toId === r.beastId)
    const b = s.models[r.beastId]
    if (!act || !b) continue
    const bt = boxesTotal(b)
    const saved = r.absorbed
    const loss = (r.absorbed / bt) * valueOf(s, b) + r.pDisabled * valueOf(s, b) * 0.8 + (r.pCripple.spirit ?? 0) * 1.5 + r.overflow * 0.05
    const gain = (saved / total) * wv + (lethal ? 30 : 0)
    const fury = 0.9 + ((w.fury ?? 0) <= 1 ? 0.8 : 0)
    const v = gain - loss - fury
    if (easy ? lethal || points >= 4 : v > 0) { const score = easy ? -loss + (r.overflow === 0 ? 1 : 0) : v; if (score > bv) { bv = score; best = act } }
  }
  return best
}

// ---------- vent (FZ7) ----------
export function ventAction(s: GameState, legal: Action[], easy: boolean): Action {
  const pd = s.pending
  const b = pd.context.modelId ? s.models[pd.context.modelId] : undefined
  const all = legal.filter((a) => a.type === 'adjustFury') as Extract<Action, { type: 'adjustFury' }>[]
  const removeAll = all.reduce((x, y) => (y.delta < x.delta ? y : x), all[0]!)
  if (!b || easy) return removeAll ?? legal[0]!
  const w = b.controllerId ? s.models[b.controllerId] : undefined
  const f = b.fury ?? 0
  if (!w || !live(w) || f <= 0) return removeAll ?? legal[0]!
  const others = battlegroupOf(s, w).filter((x) => x.id !== b.id).reduce((a, x) => a + (x.fury ?? 0), 0)
  const room = Math.max(0, stat(w, 'ARC') - keptFury(w)) - others
  // keep what the warlock will leech next turn anyway, if it stays under a 20% frenzy risk
  let keepN = 0
  for (let k = 1; k <= Math.min(f, room); k++) if (pFrenzyAt(s, b, k) <= 0.2) keepN = k
  const a = all.find((x) => x.delta === -(f - keepN))
  return a ?? removeAll ?? legal[0]!
}

// ---------- wrap-up at the end of an activation (shed, rile) ----------
/**
 * One fury move at the end of a plan. Warlock: shed fury so next turn's leech has room for what its beasts hold.
 * Beast: rile fury onto itself when the warlock's leech room would otherwise go unfilled and the risk is small (F5.7).
 * Returns null when nothing is worth doing, so the caller can go on.
 */
export function furyWrapUp(s: GameState, m: ModelState, reserve: number, easy: boolean): Action | null {
  if (easy) return null
  const pd = s.pending
  const mk = (id: ModelId, delta: number): Action | null => {
    const a = { type: 'adjustFury', decisionId: pd.id, player: pd.player, modelId: id, delta } as Action
    return validate(s, a) === null ? a : null
  }
  if (isWarlock(m)) {
    const bg = battlegroupOf(s, m)
    const held = bg.reduce((a, b) => a + (b.fury ?? 0), 0)
    const f = m.fury ?? 0
    const arc = stat(m, 'ARC')
    const kept = Math.max(0, reserve)
    if (held <= 0 || f <= kept) return null
    // risky fury beasts hold now vs the room we would have: shed enough to fit it, never below the transfer reserve
    const risky = bg.reduce((a, b) => a + ((b.fury ?? 0) > 0 && pFrenzyAt(s, b, b.fury ?? 0) >= 0.15 ? (b.fury ?? 0) : 0), 0)
    const need = Math.min(held, Math.max(risky, held - Math.max(0, arc - f)))
    const shed = Math.min(f - kept, Math.max(0, need - Math.max(0, arc - f)))
    return shed > 0 ? mk(m.id, -shed) : null
  }
  if (isBeast(m)) {
    const w = m.controllerId ? s.models[m.controllerId] : undefined
    if (!w || !live(w)) return null
    const fi = query.fury(s, m.id)
    if (!fi.forceable || fi.room <= 0) return null
    const bg = battlegroupOf(s, w)
    const held = bg.reduce((a, b) => a + (b.fury ?? 0), 0)
    const room = stat(w, 'ARC') - Math.min(w.fury ?? 0, 2) - held
    if (room <= 0) return null
    // only when the whole pile will be leeched, and the beast sits in CTRL so it can be drained
    const k = Math.min(fi.room, room, 2)
    if (k <= 0 || pFrenzyAt(s, m, (m.fury ?? 0) + k) >= 0.15 || (m.fury ?? 0) + k > 1) return null
    return mk(m.id, k)
  }
  return null
}

// ---------- spending checks ----------
/**
 * Can this model pay `k` for a boost, extra attack or spell right now, and what does it cost on top (value units)?
 * Focus models and warlocks pay from a pool above their reserve; a beast is forced and pays the frenzy risk.
 */
export function spendCost(s: GameState, m: ModelState, k: number, reserve: number): { ok: boolean; pen: number } {
  if (isBeast(m)) {
    let fi
    try { fi = query.fury(s, m.id) } catch { return { ok: false, pen: 0 } }
    if (!fi.forceable || fi.room < k) return { ok: false, pen: 0 }
    return { ok: true, pen: forcePenalty(s, m, k) }
  }
  if (isWarlock(m)) return { ok: (m.fury ?? 0) - k >= reserve, pen: 0.12 * k }
  return { ok: m.focus - k >= reserve, pen: 0 }
}

export { dist, other }
