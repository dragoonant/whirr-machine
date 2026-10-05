// Focus knapsack (40-ai §4): a multiple-choice knapsack over the caster's integer focus. Groups: each war-engine's
// allocation (value = its best attack plan this turn with that much focus), upkeeps to keep, spells, the caster's own
// attacks, and the Power Field reserve (value = the drop in leaderRisk). DP over groups x focus; ties keep focus.
import type { GameState, ModelId, ModelState, PlayerId } from '../engine/index'
import { query } from '../engine/index'
import { killChance, planSequence, type Ctx } from './damage'
import { threatAt } from './threat'
import { baseRadius, boxesTotal, dist, enemiesOf, leaderOf, live, meleeWeapons, rangedWeapons, valueOf } from './world'
import { contactPoint, rangePoint } from './damage'

export interface Group { id: string; options: { cost: number; value: number; tag: string }[] }

/** Multiple-choice knapsack: best total value with total cost <= budget; returns the chosen option tag per group. */
export function knapsack(groups: Group[], budget: number): { value: number; pick: Record<string, string>; cost: number } {
  const B = Math.max(0, Math.floor(budget))
  let best: { value: number; pick: Record<string, string>; cost: number }[] = Array.from({ length: B + 1 }, () => ({ value: 0, pick: {}, cost: 0 }))
  for (const g of groups) {
    const next = Array.from({ length: B + 1 }, () => ({ value: -Infinity, pick: {} as Record<string, string>, cost: 0 }))
    for (let b = 0; b <= B; b++) {
      for (const o of g.options) {
        if (o.cost > b) continue
        const prev = best[b - o.cost]!
        if (prev.value === -Infinity) continue
        const v = prev.value + o.value
        // ties keep focus (lower cost wins)
        if (v > next[b]!.value + 1e-9 || (Math.abs(v - next[b]!.value) <= 1e-9 && prev.cost + o.cost < next[b]!.cost)) {
          next[b] = { value: v, pick: { ...prev.pick, [g.id]: o.tag }, cost: prev.cost + o.cost }
        }
      }
    }
    best = next
  }
  let out = best[0]!
  for (const x of best) if (x.value > out.value + 1e-9 || (Math.abs(x.value - out.value) <= 1e-9 && x.cost < out.cost)) out = x
  return out
}

/** Attack value of a model this turn with `focus` (best target it can reach: charge, walk-in melee, or shoot). */
export function attackValueWithFocus(ctx: Ctx, s: GameState, m: ModelState, focus: number, simpleBoost = false): number {
  const th = query.threat(s, m.id)
  let best = 0
  for (const t of enemiesOf(s, m.owner)) {
    const d = Math.max(0, dist(m.pos, t.pos) - baseRadius(m.base) - baseRadius(t.base))
    const v = valueOf(s, t), bt = boxesTotal(t)
    const score = (seq: ReturnType<typeof planSequence>): number => (seq ? (Math.min(seq.exp, bt) / bt) * v + killChance(t, seq.attacks) * v * 0.5 : 0)
    if (meleeWeapons(m).length) {
      const canCharge = m.type !== 'warEngine' || focus >= 1
      if (d <= th.meleeRange) best = Math.max(best, score(planSequence(ctx, s, m, t, 'melee', m.pos, { focus, simpleBoost })))
      else if (canCharge && d <= th.charge) best = Math.max(best, score(planSequence(ctx, s, m, t, 'melee', contactPoint(m, m.pos, t), { charge: true, focus: m.type === 'warEngine' ? focus - 1 : focus, simpleBoost })))
    }
    const rws = rangedWeapons(m)
    if (rws.length) {
      const rng = Math.max(...rws.map((w) => w.rng))
      if (d <= th.advance + rng) {
        const to = rangePoint(m, m.pos, t, rng)
        best = Math.max(best, score(planSequence(ctx, s, m, t, 'ranged', to, { focus, simpleBoost })))
      }
    }
  }
  return best
}

/** Value units lost with the Leader (the game): a focus kept for Power Field is worth its risk drop times this. */
export const LEADER_LOSS = 120

/**
 * Power Field reserve: at least enough to bring leaderRisk to tau (the hard part), then one more focus at a time while
 * the drop in risk is worth more than a marginal attack (0.6 value units).
 */
export function smartReserve(L: ModelState, seqs: import('./prob').SeqAttack[], tau: number, minReserve = 0, marginal = true): { reserve: number; risk: number } {
  let r = Math.min(minReserve, L.focus)
  if (!seqs.length) return { reserve: r, risk: 0 }
  while (r < L.focus) {
    const cur = killChance(L, seqs, r)
    if (cur > tau) { r++; continue }
    if (!marginal) break
    const nxt = killChance(L, seqs, r + 1)
    if ((cur - nxt) * LEADER_LOSS >= 0.6) { r++; continue }
    break
  }
  return { reserve: r, risk: killChance(L, seqs, r) }
}

/** Power Field reserve for our Leader at its position (or `at`). */
export function reserveNeeded(ctx: Ctx, s: GameState, player: PlayerId, tau: number, minReserve = 0, at?: { x: number; z: number }, marginal = true): { reserve: number; risk: number } {
  const L = leaderOf(s, player)
  if (!live(L)) return { reserve: 0, risk: 0 }
  const rep = threatAt(ctx, s, L, at ?? L.pos)
  return smartReserve(L, rep.seqs, tau, minReserve, marginal)
}

/** Allocation for an allocateFocus decision (normal tier). */
export function allocate(ctx: Ctx, s: GameState, player: PlayerId, tau: number, minReserve: number,
  targets: { casterId: ModelId; modelId: ModelId; focus: number }[], extras: { upkeepValue: number; upkeeps: number; spellValue: (f: number) => number }): Record<ModelId, number> {
  const out: Record<ModelId, number> = {}
  const byCaster = new Map<ModelId, typeof targets>()
  for (const t of targets) byCaster.set(t.casterId, [...(byCaster.get(t.casterId) ?? []), t])
  for (const [cid, ts] of byCaster) {
    const c = s.models[cid]
    if (!c || c.owner !== player) continue
    const F = c.focus
    const groups: Group[] = []
    for (const t of ts) {
      const w = s.models[t.modelId]
      if (!w || !live(w)) continue
      const room = Math.max(0, 3 - w.focus)
      const base = attackValueWithFocus(ctx, s, w, w.focus)
      const opts = [{ cost: 0, value: 0, tag: '0' }]
      for (let k = 1; k <= Math.min(room, F); k++) opts.push({ cost: k, value: attackValueWithFocus(ctx, s, w, w.focus + k) - base + (k === 1 && w.focus === 0 ? 0.3 : 0), tag: String(k) })
      groups.push({ id: t.modelId, options: opts })
    }
    // caster: upkeeps, spells and own attacks, and the reserve (leader risk at its spot)
    if (extras.upkeeps > 0) {
      const o = [{ cost: 0, value: 0, tag: '0' }]
      for (let k = 1; k <= extras.upkeeps; k++) o.push({ cost: k, value: k * extras.upkeepValue, tag: String(k) })
      groups.push({ id: '__upkeep', options: o })
    }
    const own = [{ cost: 0, value: 0, tag: '0' }]
    const base = attackValueWithFocus(ctx, s, c, 0)
    for (let k = 1; k <= F; k++) own.push({ cost: k, value: Math.max(attackValueWithFocus(ctx, s, c, k) - base, extras.spellValue(k)), tag: String(k) })
    groups.push({ id: '__caster', options: own })
    if (c.type === 'leader') {
      const rep = threatAt(ctx, s, c, c.pos)
      const risk = (r: number): number => (rep.seqs.length ? killChance(c, rep.seqs, r) : 0)
      const r0 = risk(0)
      const res = [{ cost: 0, value: minReserve > 0 ? -999 : 0, tag: '0' }]
      for (let r = 1; r <= F; r++) {
        const rr = risk(r)
        const pen = rr > tau ? 30 : 0
        res.push({ cost: r, value: (r0 - rr) * 45 - pen + (r < minReserve ? -999 : 0), tag: String(r) })
      }
      if (r0 > tau) res[0]!.value -= 30
      groups.push({ id: '__reserve', options: res })
    }
    const k = knapsack(groups, F)
    for (const t of ts) {
      const n = Number(k.pick[t.modelId] ?? 0)
      if (n > 0) out[t.modelId] = n
    }
  }
  return out
}
