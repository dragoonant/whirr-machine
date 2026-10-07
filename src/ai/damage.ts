// Per-attack and per-sequence damage (40-ai §3): numbers come from query.attackPreview (hit target, dice, ARM, expected
// damage), read back into closed-form distributions from prob.ts so sequences, boosts, Power Field and Tough can be
// combined exactly. Caches live on a per-decision Ctx so a state is never reused across decisions.
import type { GameState, ModelId, ModelState, Vec2 } from '../engine/index'
import { query } from '../engine/index'
import { damageDist, expected, invertDamageOffset, pHit, pKillSequence, type Dist, type SeqAttack } from './prob'
import { baseRadius, boxesLeft, dist, hasAbility, meleeWeapons, rangedWeapons, type WeaponInfo } from './world'

export interface AttackProfile {
  weapon: WeaponInfo
  need: number // dice sum needed to hit
  dice: number // attack dice (unboosted)
  p: number // P(hit) unboosted
  pB: number // P(hit) with a boosted attack roll
  k: number // damage dice before any boost
  x: number // POW - ARM offset on the damage roll
  onHit: Dist // damage points on a hit (unboosted, or boosted when charge)
  onHitB: Dist // boosted damage
  autoBoostDamage: boolean // charge attack: damage boosted for free
  exp: number // preview expected damage (single attack)
}

/** Per-decision memo. */
export interface Ctx { s: GameState; memo: Map<string, AttackProfile | null>; seqMemo: Map<string, number> }
let worldState: GameState | null = null
export const newCtx = (s: GameState): Ctx => { worldState = s; return { s, memo: new Map(), seqMemo: new Map() } }

/**
 * Transfer model for a warlock (81 F8): each fury it holds moves one damage instance to a battlegroup beast that has room
 * (fury below its FURY) and boxes to take it. Like Power Field, but the reduction is the beast's unmarked boxes, not 5.
 */
const transferMemo = new WeakMap<GameState, Map<string, { n: number; absorb: number }>>()
export function transferModel(t: ModelState): { n: number; absorb: number } {
  const s = worldState
  if (!s || t.type !== 'leader' || t.fury === undefined) return { n: 0, absorb: 0 }
  let m = transferMemo.get(s)
  if (!m) { m = new Map(); transferMemo.set(s, m) }
  const hit = m.get(t.id)
  if (hit) return hit
  let n = 0, absorb = 0
  for (const b of Object.values(s.models)) {
    if (b.type !== 'beast' || b.controllerId !== t.id || b.wild || b.offTable || b.life !== 'active') continue
    let fi
    try { fi = query.fury(s, b.id) } catch { continue }
    if (!fi.inCtrl || fi.fury >= fi.cap) continue
    n++
    absorb = Math.max(absorb, boxesLeft(b))
  }
  const out = { n, absorb }
  m.set(t.id, out)
  return out
}

const round1 = (v: number): number => Math.round(v * 4) / 4

/** Attack profile for `attacker` with `weapon` at `target`, optionally from another spot or as a charge attack. */
export function profileOf(ctx: Ctx, s: GameState, attacker: ModelState, weapon: WeaponInfo, target: ModelState, opts: { fromPos?: Vec2; charge?: boolean; hypo?: string } = {}): AttackProfile | null {
  const fp = opts.fromPos
  const key = `${opts.hypo ?? ''}|${attacker.id}|${weapon.id}|${target.id}|${fp ? `${round1(fp.x)},${round1(fp.z)}` : '-'}|${opts.charge ? 1 : 0}|${s === ctx.s ? 0 : 1}`
  if (ctx.memo.has(key)) return ctx.memo.get(key)!
  let pv
  try {
    pv = query.attackPreview(s, attacker.id, weapon.id, target.id, { ...(fp ? { fromPos: fp } : {}), chargeAttack: !!opts.charge })
  } catch { pv = null }
  if (!pv || pv.legal) { ctx.memo.set(key, null); return null }
  let p = pv.pHit
  let need = 99
  if (pv.autoHit) need = -99
  else if (pv.autoMiss || pv.dice <= 0) need = 99
  else {
    // read the needed sum back from the engine's pHit (exact: same distribution)
    let best = 99, err = Infinity
    for (let n = -6; n <= 40; n++) { const e = Math.abs(pHit(pv.dice, n) - pv.pHit); if (e < err - 1e-12) { err = e; best = n } }
    need = best
  }
  const dice = Math.max(0, pv.dice)
  const pB = pv.autoHit ? 1 : pv.autoMiss ? 0 : pHit(dice + 1, need)
  const auto = !!opts.charge
  const k = Math.max(1, pv.damageDice - (auto ? 1 : 0))
  const guess = weapon.pow - pv.damageTarget
  const x = weapon.aoe ? guess : invertDamageOffset(pv.damageDice, Math.max(1e-9, p), pv.expectedDamage, guess)
  const onHitPlain = damageDist(k, x)
  const onHitB = damageDist(k + 1, x)
  if (pv.autoHit) p = 1
  const prof: AttackProfile = { weapon, need, dice, p, pB, k, x, onHit: auto ? onHitB : onHitPlain, onHitB, autoBoostDamage: auto, exp: pv.expectedDamage }
  ctx.memo.set(key, prof)
  return prof
}

/** A point at base contact with `target` on the line from `from` (melee attacks from there). */
export function contactPoint(attacker: ModelState, from: Vec2, target: ModelState, at: Vec2 = target.pos, gap = 0.4): Vec2 {
  const d = dist(from, at)
  const r = baseRadius(attacker.base) + baseRadius(target.base) + gap
  if (d < 1e-6) return { x: at.x + r, z: at.z }
  return { x: at.x + ((from.x - at.x) / d) * r, z: at.z + ((from.z - at.z) / d) * r }
}
/** A point where `attacker` would be within `rng` of the target, as close to `from` as possible. */
export function rangePoint(attacker: ModelState, from: Vec2, target: ModelState, rng: number, at: Vec2 = target.pos): Vec2 {
  const d = dist(from, at)
  const reach = rng + baseRadius(attacker.base) + baseRadius(target.base) - 0.25
  if (d <= reach) return from
  return { x: at.x + ((from.x - at.x) / d) * reach, z: at.z + ((from.z - at.z) / d) * reach }
}

export interface PlannedSeq { attacks: SeqAttack[]; focusUsed: number; exp: number; weaponIds: string[] }

/**
 * The attacks a model would make on one target with `mode`, spending up to `focus` greedily on the best marginal
 * expected damage: boost hit, boost damage, or an additional attack (melee: 1 focus; ranged: Reload). Easy tier passes
 * `simpleBoost` (boost only when pHit < 60%, no additional attacks).
 */
export function planSequence(ctx: Ctx, s: GameState, a: ModelState, t: ModelState, mode: 'melee' | 'ranged', from: Vec2,
  opts: { charge?: boolean; focus?: number; simpleBoost?: boolean; hypo?: string; canFocus?: boolean } = {}): PlannedSeq | null {
  const ws = mode === 'melee' ? meleeWeapons(a) : rangedWeapons(a)
  const items: { prof: AttackProfile; boostHit: boolean; boostDmg: boolean; extra: boolean }[] = []
  let chargeUsed = false
  for (const w of ws) {
    const fromPos = mode === 'melee' ? contactPoint(a, from, t) : rangePoint(a, from, t, w.rng)
    if (mode === 'ranged' && dist(fromPos, from) > 1e-6) continue // out of range from here
    const charge = !!opts.charge && !chargeUsed && mode === 'melee'
    const prof = profileOf(ctx, s, a, w, t, { fromPos, charge, hypo: opts.hypo })
    if (!prof) continue
    if (charge) chargeUsed = true
    for (let i = 0; i < Math.max(1, w.rof); i++) {
      const pr = i === 0 || !charge ? prof : (profileOf(ctx, s, a, w, t, { fromPos, charge: false, hypo: opts.hypo }) ?? prof)
      items.push({ prof: pr, boostHit: false, boostDmg: pr.autoBoostDamage, extra: false })
    }
  }
  if (!items.length) return null
  const canFocus = opts.canFocus ?? (a.type === 'warEngine' || a.type === 'leader' || a.type === 'beast')
  let focus = canFocus ? Math.max(0, opts.focus ?? (a.type === 'beast' ? 0 : a.focus)) : 0
  let used = 0
  const ev = (it: { prof: AttackProfile; boostHit: boolean; boostDmg: boolean }): number =>
    (it.boostHit ? it.prof.pB : it.prof.p) * expected(it.boostDmg ? it.prof.onHitB : (it.prof.autoBoostDamage ? it.prof.onHitB : damageDist(it.prof.k, it.prof.x)))
  if (opts.simpleBoost) {
    for (const it of items) if (focus > 0 && it.prof.p < 0.6 && it.prof.p > 0) { it.boostHit = true; focus--; used++ }
  } else {
    const reloads = new Map<string, number>()
    let guard = 0
    while (focus > 0 && guard++ < 12) {
      let best = 0, act: (() => void) | null = null
      for (const it of items) {
        if (!it.boostHit && it.prof.p < 1) {
          const g = ev({ ...it, boostHit: true }) - ev(it)
          if (g > best) { best = g; act = () => { it.boostHit = true } }
        }
        if (!it.boostDmg) {
          const g = ev({ ...it, boostDmg: true }) - ev(it)
          if (g > best) { best = g; act = () => { it.boostDmg = true } }
        }
        // Powerful Attack: one focus boosts both the attack and the damage roll
        if (it.prof.weapon.powerful && !it.boostHit && !it.boostDmg) {
          const g = ev({ ...it, boostHit: true, boostDmg: true }) - ev(it)
          if (g > best) { best = g; act = () => { it.boostHit = true; it.boostDmg = true } }
        }
      }
      // additional attack with the best weapon of the mode
      const bestItem = items.slice().sort((x, y) => ev({ ...y, boostHit: false, boostDmg: false }) - ev({ ...x, boostHit: false, boostDmg: false }))[0]!
      const w = bestItem.prof.weapon
      const allowExtra = mode === 'melee' || (w.reload > (reloads.get(w.id) ?? 0))
      if (allowExtra) {
        const base = profileOf(ctx, s, a, w, t, { fromPos: mode === 'melee' ? contactPoint(a, from, t) : from, charge: false, hypo: opts.hypo }) ?? bestItem.prof
        const g = ev({ prof: base, boostHit: false, boostDmg: false }) - 0.05
        if (g > best) { best = g; act = () => { items.push({ prof: base, boostHit: false, boostDmg: false, extra: true }); if (mode === 'ranged') reloads.set(w.id, (reloads.get(w.id) ?? 0) + 1) } }
      }
      if (!act || best < 0.15) break
      act(); focus--; used++
    }
  }
  const attacks: SeqAttack[] = items.map((it) => ({
    p: it.boostHit ? it.prof.pB : it.prof.p,
    onHit: it.boostDmg || it.prof.autoBoostDamage ? it.prof.onHitB : damageDist(it.prof.k, it.prof.x),
    melee: mode === 'melee',
  }))
  return { attacks, focusUsed: used, exp: attacks.reduce((x, y) => x + y.p * expected(y.onHit), 0), weaponIds: items.map((i) => i.prof.weapon.id) }
}

/** pKill of a target from a set of sequences (its Power Field reserve and Tough applied). */
export function killChance(t: ModelState, seqs: SeqAttack[], pfOverride?: number): number {
  if (t.type === 'leader' && t.fury !== undefined) {
    const tm = transferModel(t)
    const pfw = tm.n > 0 ? Math.min(8, pfOverride ?? t.fury) : 0
    return pKillSequence(seqs, boxesLeft(t), pfw, hasAbility(t, 'core.a.tough'), Math.max(1, tm.absorb))
  }
  const pf = hasAbility(t, 'core.a.power-field') && !t.crippled.includes('C') ? (pfOverride ?? t.focus) : 0
  return pKillSequence(seqs, boxesLeft(t), Math.min(8, pf), hasAbility(t, 'core.a.tough'))
}

export type { SeqAttack, ModelId }
