// Threat (40-ai §5, §6): what the other side could do to one of our models standing at a point during its next turn.
// Reach numbers come from query.threat; the probability layer (attack profiles from query.attackPreview with the
// attacker moved into reach) is ours. Used for threat exposure in move scoring and for the Leader's hard safety check.
import type { GameState, ModelState, PlayerId, Vec2 } from '../engine/index'
import { query } from '../engine/index'
import { contactPoint, killChance, planSequence, rangePoint, type Ctx } from './damage'
import { expected, type SeqAttack } from './prob'
import { baseRadius, dist, enemiesOf, hasAbility, leaderOf, meleeWeapons, rangedWeapons, rec, valueOf, boxesTotal, threatView, withPos } from './world'

export interface ThreatReport { exp: number; pKill: number; seqs: SeqAttack[]; attackers: number }

const statOf = (id: string, k: string): number => {
  const st = (rec(id)?.stats ?? {}) as Record<string, number>
  return st[k] ?? 0
}

/** Focus an enemy model can expect to have on its next turn. */
export function nextTurnFocus(s: GameState, e: ModelState): number {
  if (e.type === 'leader') return statOf(e.profileId, 'ARC') || e.focus
  if (e.type === 'beast' && e.fury !== undefined) {
    // a forced beast: its warlock leeches it down at Control, then it may take a boost, an extra attack and a charge (FURY caps it)
    const w = e.controllerId ? s.models[e.controllerId] : undefined
    if (!w || w.life !== 'active' || e.wild || e.crippled.includes('s')) return 0
    const ctrl = statOf(w.profileId, 'CTRL') || 12
    const room = statOf(e.profileId, 'FURY')
    return dist(w.pos, e.pos) <= ctrl + 6 ? Math.min(room, 3) : 0
  }
  if (e.type === 'warEngine') {
    if (e.crippled.includes('C')) return 0
    const c = e.controllerId ? s.models[e.controllerId] : undefined
    if (!c || c.life !== 'active') return 0
    const ctrl = statOf(c.profileId, 'CTRL') || 12
    const inCtrl = dist(c.pos, e.pos) <= ctrl + 6 // the caster may move first
    return inCtrl ? 3 : Math.min(3, e.focus + 1)
  }
  return 0
}

export interface ThreatOpts {
  /** our Leader keeps this much focus for Power Field during the enemy turn */
  pfReserve?: number
  /** ignore enemies whose ids are listed (e.g. ones we plan to kill first) */
  ignore?: Set<string>
  /** cheap mode: expected damage only, no pKill */
  cheap?: boolean
}

/** Everything the enemies of `me` could do to it at `pos` next turn. */
export function threatAt(ctx: Ctx, s0: GameState, me: ModelState, pos: Vec2, opts: ThreatOpts = {}): ThreatReport {
  const sv = threatView(s0, me.owner)
  const s = dist(pos, me.pos) < 1e-6 ? sv : withPos(sv, me.id, pos)
  const hypo = `${me.id}@${pos.x.toFixed(2)},${pos.z.toFixed(2)}`
  const target = s.models[me.id]!
  const seqs: SeqAttack[] = []
  let exp = 0, attackers = 0
  for (const e of enemiesOf(s, me.owner)) {
    if (opts.ignore?.has(e.id)) continue
    if (e.inert) continue
    const th = query.threat(s, e.id)
    const d = Math.max(0, dist(e.pos, pos) - baseRadius(e.base) - baseRadius(me.base))
    const focus = nextTurnFocus(s, e)
    let best = null as { exp: number; attacks: SeqAttack[] } | null
    let meleeAt: Vec2 | null = null, meleeSeq: { exp: number; attacks: SeqAttack[] } | null = null
    // melee: charge reach (war-engines need a focus to charge), or plain advance reach
    if (meleeWeapons(e).length) {
      const canCharge = e.type !== 'warEngine' || focus >= 1
      const reach = canCharge ? th.charge : th.advance + th.meleeRange
      if (d <= reach + 0.25) {
        const from = contactPoint(e, e.pos, target, pos)
        const f = canCharge && e.type === 'warEngine' ? focus - 1 : focus
        const ps = planSequence(ctx, s, e, target, 'melee', from, { charge: canCharge && d > 0.5, focus: f, hypo })
        if (ps && (!best || ps.exp > best.exp)) best = { exp: ps.exp, attacks: ps.attacks }
        if (ps) { meleeAt = from; meleeSeq = { exp: ps.exp, attacks: ps.attacks } }
      }
    }
    // ranged: SPD + RNG
    const rws = rangedWeapons(e)
    if (rws.length && th.ranged !== null) {
      // Warping Winds: a shot at a protected model loses 3 RNG
      const maxRng = Math.max(0, Math.max(...rws.map((w) => w.rng)) - query.rangePenalty(s, me.id))
      if (d <= th.advance + maxRng + 0.25) {
        const step = Math.min(th.advance, Math.max(0, d - maxRng + 0.5))
        const dd = dist(e.pos, pos)
        const from = dd > 1e-6 ? { x: e.pos.x + ((pos.x - e.pos.x) / dd) * step, z: e.pos.z + ((pos.z - e.pos.z) / dd) * step } : e.pos
        // the straight approach first; if a model or wall blocks the line, the enemy steps sideways or closer
        const ux = dd > 1e-6 ? (pos.x - e.pos.x) / dd : 1, uz = dd > 1e-6 ? (pos.z - e.pos.z) / dd : 0
        const spare = Math.max(0, th.advance - step)
        const tries: Vec2[] = [rangePoint(e, from, target, maxRng, pos)]
        for (const k of [1, -1, 2, -2]) {
          const side = Math.min(spare, 1.6 * Math.abs(k)) * Math.sign(k)
          if (Math.abs(side) < 0.2) continue
          tries.push(rangePoint(e, { x: from.x - uz * side, z: from.z + ux * side }, target, maxRng, pos))
        }
        if (spare > 0.5) tries.push(rangePoint(e, { x: from.x + ux * spare, z: from.z + uz * spare }, target, maxRng, pos))
        for (const at of tries) {
          const ps = planSequence(ctx, s, e, target, 'ranged', at, { focus, hypo })
          if (ps && (!best || ps.exp > best.exp)) best = { exp: ps.exp, attacks: ps.attacks }
          if (ps) break
        }
      }
    }
    // Dual Attack: melee and ranged attacks in one Combat Action (from base contact)
    if (meleeAt && meleeSeq && rws.length && hasAbility(e, 'core.a.dual-attack')) {
      const ps = planSequence(ctx, s, e, target, 'ranged', meleeAt, { focus: 0, hypo })
      if (ps && meleeSeq.exp + ps.exp > (best?.exp ?? 0)) best = { exp: meleeSeq.exp + ps.exp, attacks: [...meleeSeq.attacks, ...ps.attacks] }
    }
    if (best && best.exp > 0) { exp += best.exp; seqs.push(...best.attacks); attackers++ }
  }
  const pKill = opts.cheap || !seqs.length ? 0 : killChance(target, seqs, opts.pfReserve)
  return { exp, pKill, seqs, attackers }
}

/** Threat exposure in value units: expected damage as a fraction of the model, plus pKill x value (40 §2 wT term). */
export function exposureValue(s: GameState, me: ModelState, t: ThreatReport): number {
  const v = valueOf(s, me)
  return (Math.min(t.exp, boxesTotal(me)) / boxesTotal(me)) * v * 0.6 + t.pKill * v * 0.6
}

/** leaderRisk: P(our Leader dies next enemy turn) at `pos`, keeping `reserve` focus for Power Field. */
export function leaderRisk(ctx: Ctx, s: GameState, player: PlayerId, pos: Vec2, reserve: number): number {
  const L = leaderOf(s, player)
  if (!L || L.life !== 'active') return 0
  return threatAt(ctx, s, L, pos, { pfReserve: reserve }).pKill
}

export { expected }
