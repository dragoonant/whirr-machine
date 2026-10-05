// Assassination search (40-ai §7): which of our models can reach the enemy Leader this turn, with what damage, and the
// pKill of the whole line (exact sequence DP with the Leader's Power Field reserve and Tough). Run every turn; also
// run from the enemy's side (threat.ts) for the Leader's safety constraint.
import type { GameState, ModelId, ModelState, PlayerId, Vec2 } from '../engine/index'
import { query } from '../engine/index'
import { contactPoint, killChance, planSequence, rangePoint, type Ctx } from './damage'
import type { SeqAttack } from './prob'
import { baseRadius, dist, leaderOf, live, meleeWeapons, modelsOf, other, rangedWeapons } from './world'

export interface LineStep { modelId: ModelId; activationId: string; mode: 'charge' | 'melee' | 'ranged'; from: Vec2; exp: number; attacks: SeqAttack[]; leader: boolean }
export interface AssassinLine { targetId: ModelId; pKill: number; pKillNoLeader: number; steps: LineStep[]; useLeader: boolean }

/** Straight lane from a to b is free of other models' bases (charge lanes; screens block). */
export function laneClear(s: GameState, mover: ModelState, to: Vec2, targetId: ModelId): boolean {
  const a = mover.pos
  const r = baseRadius(mover.base)
  const dx = to.x - a.x, dz = to.z - a.z
  const l2 = dx * dx + dz * dz
  if (l2 < 1e-9) return true
  for (const o of Object.values(s.models)) {
    if (o.id === mover.id || o.id === targetId || !live(o)) continue
    const t = Math.max(0, Math.min(1, ((o.pos.x - a.x) * dx + (o.pos.z - a.z) * dz) / l2))
    const px = a.x + dx * t, pz = a.z + dz * t
    if (Math.hypot(o.pos.x - px, o.pos.z - pz) < r + baseRadius(o.base) - 0.05) return false
  }
  return true
}

/** Activation id of a model: its unit id when it is a trooper. */
const actId = (m: ModelState): string => m.unitId ?? m.id

/** Best single contribution of `m` against `L` this turn (charge, walk into melee, or shoot). */
export function contribution(ctx: Ctx, s: GameState, m: ModelState, L: ModelState, opts: { simpleBoost?: boolean } = {}): LineStep | null {
  if (m.conditions.includes('stationary') || m.inert) return null
  const th = query.threat(s, m.id)
  const d = Math.max(0, dist(m.pos, L.pos) - baseRadius(m.base) - baseRadius(L.base))
  const kd = m.conditions.includes('knockedDown')
  let best: LineStep | null = null
  const consider = (mode: LineStep['mode'], from: Vec2, charge: boolean, focus: number): void => {
    const ps = planSequence(ctx, s, m, L, mode === 'ranged' ? 'ranged' : 'melee', from, { charge, focus, simpleBoost: opts.simpleBoost })
    if (!ps || ps.exp <= 0) return
    if (!best || ps.exp > best.exp) best = { modelId: m.id, activationId: actId(m), mode, from, exp: ps.exp, attacks: ps.attacks, leader: m.type === 'leader' }
  }
  if (meleeWeapons(m).length) {
    if (d <= th.meleeRange + 0.05 && !kd) consider('melee', m.pos, false, m.focus)
    else if (!kd) {
      const to = contactPoint(m, m.pos, L)
      const canCharge = m.type !== 'warEngine' || (m.focus >= 1 && !m.crippled.includes('C'))
      if (canCharge && d <= th.charge - 0.1 && d > 0.05 && laneClear(s, m, to, L.id)) consider('charge', to, true, m.type === 'warEngine' ? m.focus - 1 : m.focus)
      else if (d <= th.advance + th.meleeRange - 0.2 && query.moveCheck(s, m.id, [to]).ok) consider('melee', to, false, m.focus)
    }
  }
  const rws = rangedWeapons(m)
  if (rws.length && !kd) {
    const rng = Math.max(...rws.map((w) => w.rng))
    if (d <= rng - 0.1) consider('ranged', m.pos, false, m.focus)
    else if (d <= th.advance + rng - 0.3) {
      const to = rangePoint(m, m.pos, L, rng)
      const step = dist(to, m.pos)
      if (step <= th.advance && query.moveCheck(s, m.id, [to]).ok) consider('ranged', to, false, m.focus)
    }
  }
  return best
}

/** The best assassination line for `player` against the enemy Leader with the models that have not activated. */
export function findLine(ctx: Ctx, s: GameState, player: PlayerId, opts: { simpleBoost?: boolean; includeActivated?: boolean } = {}): AssassinLine | null {
  const L = leaderOf(s, other(player))
  if (!live(L)) return null
  const unitActivated = (m: ModelState): boolean => (m.unitId ? !!s.units[m.unitId]?.activated : m.activated)
  const steps: LineStep[] = []
  for (const m of modelsOf(s, player)) {
    if (!opts.includeActivated && unitActivated(m)) continue
    if (s.activation && s.activation.modelIds.includes(m.id)) continue // the active model plans for itself
    const c = contribution(ctx, s, m, L, opts)
    if (c) steps.push(c)
  }
  if (!steps.length) return null
  // order: ranged first, then the Leader, then melee (chargers last, after screens are shot)
  const rank = (x: LineStep): number => (x.mode === 'ranged' ? (x.leader ? 1 : 0) : x.leader ? 1 : 2)
  steps.sort((a, b) => rank(a) - rank(b) || b.exp - a.exp)
  const all = steps.flatMap((x) => x.attacks)
  const noL = steps.filter((x) => !x.leader).flatMap((x) => x.attacks)
  const pKill = killChance(L, all)
  const pKillNoLeader = noL.length ? killChance(L, noL) : 0
  return { targetId: L.id, pKill, pKillNoLeader, steps, useLeader: pKill > pKillNoLeader + 0.05 }
}
