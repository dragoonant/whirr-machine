// Trollbloods (United Kriels, Gunnbjorn) code hooks: every {code} this faction's data references (docs/spec/factions/trollbloods.md).
// Data codes: luck, criticalDevastation, guidedFire, guidedFireDie, rockWall, sentry, grantCover, regenerate, runAndGun (cygnar's).
// Snacking is an attack plugin (it needs the boxed-model seam); Resourceful, Sentry and the RNG buffs are read through the
// exported helpers at the bottom (see the CORE notes in the issues list of the faction package).
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import { actOf, alive, atkOf, hasFlag, lookups, noop, prof, setAtk, touching, type AtkCtx, type AttackPlugin } from '../code-hooks'
import { applyEffect, effectsOn, removeEffect, type EffectExtras } from '../effects'
import { hasDouble, rerollDice, rollD3, rollNd6, sum } from '../dice'
import { dist, baseRadius } from '../geometry'
import { applyDamage, healDamage, resolveDeath } from '../damage'
import { inCtrl, modelDistance, within } from '../measure'
import { knockDownUnless, push, slideAway } from '../movement'
import { distToShape, worldShape, type WorldShape } from '../terrain'
import { blastSet } from '../phases/activation'
import type { DataBundle, EffectInstance, GameState, ModelId, ModelState, StatMod, TerrainInstance, Vec2 } from '../types'
import { statOf } from '../code-hooks'
import type { GameEvent } from '../events'

const bundleOf = (c: HookContext): DataBundle => (c as HookContext & { bundle: DataBundle }).bundle
const isRangedKind = (k: string): boolean => k === 'ranged' || k === 'aoe' || k === 'spray'

// ---------- Luck (Braylen's Heavy Pistols): one reroll of a missed attack roll ----------
/**
 * Luck, run at attack.miss for each model the roll missed. Rerolls all the dice once (R1.12), re-evaluates the hit with
 * the target number the attack was declared with and updates the stored result, so damage jobs (built after the hit/miss
 * pass) see the new outcome. Hit and crit triggers of the rerolled roll do not fire (the pistols have none).
 * The engine's own `reroll` decision (RerollAction, M10) serves rerolls that are a choice; Luck stays automatic here because it is free
 * and a miss can only be improved by the reroll.
 */
const luck = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || !c.targetId) return noop(c)
  const used = (a.x.flags.luckUsed as string[] | undefined) ?? []
  if (used.includes(c.targetId)) return noop(c)
  const r = rerollMiss(c.state, a, c.targetId, 'trl.a.luck')
  if (!r) return noop(c)
  const next: AtkCtx = {
    ...r.next,
    x: { ...r.next.x, hitModels: r.hit ? [...r.next.x.hitModels, c.targetId] : r.next.x.hitModels, flags: { ...r.next.x.flags, luckUsed: [...used, c.targetId] } },
  }
  return { state: setAtk(r.state, next), events: r.events }
}

/**
 * Reroll one missed attack roll (R1.12): all the dice again, re-checked against the target number the roll was made with, the stored result
 * and the attack's own hit/crit fields updated. Shared by Luck (a weapon ability) and Lucky Shot (an animus). Null when the roll did not miss.
 */
function rerollMiss(state: GameState, a: AtkCtx, tid: ModelId, sourceId: string): { state: GameState; events: GameEvent[]; next: AtkCtx; hit: boolean } | null {
  const res = a.x.results[tid]
  if (!res || res.hit || res.auto || res.dice.length === 0) return null
  const flat = res.total - sum(res.dice)
  const rr = rerollDice(state, `r:${state.rollSeq}`, res.dice, sourceId, flat)
  const n = rr.dice.length
  const tn = (a.x.flags.rollTn as Record<ModelId, number> | undefined)?.[tid] ?? a.hitTarget
  const all1 = rr.dice.every((d) => d === 1)
  const all6 = n > 1 && rr.dice.every((d) => d === 6)
  const hit = !all1 && (all6 || rr.total >= tn)
  const crit = hit && hasDouble(rr.dice)
  const results = { ...a.x.results, [tid]: { ...res, hit, crit, total: rr.total, dice: rr.dice } }
  const primary = tid === a.targetId
  const next: AtkCtx = { ...a, ...(primary ? { hit, crit, dieValues: rr.dice } : {}), x: { ...a.x, results } }
  // a second AttackResolved supersedes the first one in the log (same attack and roll, new outcome)
  const again: GameEvent = { type: 'AttackResolved', attackId: a.attackId, rollId: rr.event.rollId, hit, crit, auto: null }
  return { state: rr.state, events: [rr.event, again], next, hit }
}

// ---------- Critical Devastation (Gunnbjorn's Bazooka) ----------
/**
 * On a critical hit: one d6 for the whole attack. The blast is fixed first (R7.9, around the direct target where it stands), then
 * every model hit (the direct target and each model the blast reaches, farthest from the attacker first) is thrown that many
 * inches directly away from the attacker and knocked down. The fixed blast set is kept on the attack (flag `fixedBlast`), so each
 * blast model still takes its POW 8 blast roll after the throw.
 * RULING: collateral damage from a Critical Devastation throw is POW 8 (the card's number), not the core 12/14 | the throw passes
 * 8 to slideAway as the collateral POW | the card names POW 8 for collateral.
 */
const CD_POW = 8
const criticalDevastation = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || a.x.flags.cdDone) return noop(c)
  const b = bundleOf(c)
  const events: GameEvent[] = []
  let state = c.state
  const tg = state.models[a.targetId]
  const direct = a.x.rollTargets.filter((t) => a.x.results[t]?.hit)
  // fix the blast before anything moves
  let blast: ModelId[] = []
  if (a.kind === 'aoe' && tg && (a.x.aoe ?? 0) > 0 && tg.base <= 80 && a.x.results[a.targetId]?.hit) {
    const bs = blastSet(state, b, a, a.x.aoe!)
    state = bs.state; events.push(...bs.events)
    blast = bs.ids
  }
  const roll = rollNd6(state, 1, 'throwDist')
  state = roll.state; events.push(roll.event)
  const inches = roll.dice[0]!
  const from = state.models[a.attackerId]!.pos
  const victims = [...new Set([...direct, ...blast])]
    .filter((t) => alive(state.models[t]))
    .sort((p, q) => dist(from, state.models[q]!.pos) - dist(from, state.models[p]!.pos))
  const look = lookups(state, b)
  for (const t of victims) {
    if (!alive(state.models[t])) continue
    const r = slideAway(state, t, from, inches, 'throw', look, CD_POW)
    state = r.state; events.push(...r.events)
    if (alive(state.models[t])) {
      const kd = knockDownUnless(state, t, look, 'trl.a.critical-devastation')
      state = kd.state; events.push(...kd.events)
    }
  }
  const a2 = atkOf(state)!
  state = setAtk(state, { ...a2, x: { ...a2.x, flags: { ...a2.x.flags, cdDone: true, ...(a.kind === 'aoe' ? { fixedBlast: blast } : {}) } } })
  return { state, events }
}

// ---------- spells ----------
/**
 * Guided Fire: a turn effect carried by the caster. Who it covers is decided when the attack is rolled (guidedFireDie), not
 * here: Gunnbjorn and the warbeasts of his battlegroup that are inside his CTRL at that moment.
 */
const guidedFire = (c: HookContext): HookResult => {
  const caster = c.state.models[c.selfId]
  if (!caster) return noop(c)
  const r = applyEffect(c.state, { sourceId: 'trl.s.guided-fire', name: 'Guided Fire', owner: caster.owner, casterId: c.selfId, targetIds: [c.selfId], mods: [], duration: 'turn' })
  return { state: r.state, events: r.events }
}

/**
 * Attack-roll side of Guided Fire (a weapon ability at attack.beforeRoll): the ranged attack roll is boosted for free (no focus
 * or fury, and no boost offer follows) when the attacker is the caster or a model of his battlegroup and is inside his CTRL now.
 */
const guidedFireDie = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || !isRangedKind(a.kind) || a.x.boosted) return noop(c)
  const at = c.state.models[a.attackerId]
  if (!at) return noop(c)
  const b = bundleOf(c)
  const covered = c.state.effects.some((e) => {
    if (e.sourceId !== 'trl.s.guided-fire' || !e.casterId) return false
    const caster = c.state.models[e.casterId]
    if (!alive(caster)) return false
    if (e.casterId === at.id) return true
    return prof(b, at).type === 'beast' && at.controllerId === e.casterId && inCtrl(caster, at, statOf(c.state, b, caster.id, 'CTRL')) // warbeasts only (a solo names its Leader too since M12)
  })
  if (!covered) return noop(c)
  return { state: setAtk(c.state, { ...a, x: { ...a.x, boosted: true, flags: { ...a.x.flags, freeBoost: true } } }), events: [] }
}

const WALL = { w: 4, d: 0.75 }
const segsCross = (p: Vec2, q: Vec2, r: Vec2, s: Vec2): boolean => {
  const o = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
  return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0
}
/** True when two terrain footprints overlap or sit within a hair of each other. */
export function shapesClash(a: WorldShape, b: WorldShape): boolean {
  if (a.kind === 'circle') return distToShape(a.c, b) < a.r + 0.01
  if (b.kind === 'circle') return distToShape(b.c, a) < b.r + 0.01
  if (a.pts.some((p) => distToShape(p, b) < 0.01) || b.pts.some((p) => distToShape(p, a) < 0.01)) return true
  for (let i = 0; i < a.pts.length; i++) {
    for (let j = 0; j < b.pts.length; j++) {
      if (segsCross(a.pts[i]!, a.pts[(i + 1) % a.pts.length]!, b.pts[j]!, b.pts[(j + 1) % b.pts.length]!)) return true
    }
  }
  return false
}
/**
 * Rock Wall: adds a 4" x 3/4" obstacle (the low-wall piece, so the cover and obstacle rules and the board reskin apply) inside
 * the caster's CTRL, clear of every base and of every other terrain piece (obstacles and obstructions included). Uses the cast
 * point when the engine passes one, else sits in front of the caster toward the nearest enemy, pushed out until it is clear.
 * `pruneRockWalls` removes it when the upkeep ends or a big base touches it.
 */
const rockWall = (c: HookContext): HookResult => {
  const caster = c.state.models[c.selfId]
  if (!caster) return noop(c)
  const b = bundleOf(c)
  const enemies = Object.values(c.state.models).filter((m) => m.owner !== caster.owner && alive(m))
  const near = enemies.sort((p, q) => dist(caster.pos, p.pos) - dist(caster.pos, q.pos))[0]
  let dx = near ? near.pos.x - caster.pos.x : 0
  let dz = near ? near.pos.z - caster.pos.z : 1
  const len = Math.hypot(dx, dz) || 1
  dx /= len; dz /= len
  const ctrl = statOf(c.state, b, c.selfId, 'CTRL')
  const rot = Math.atan2(-dx, -dz)
  // this caster's own earlier wall is replaced by the new one, so it does not count as an obstruction
  const others = c.state.terrain.filter((t) => !(t.props.rockWall && t.props.casterId === c.selfId)).map(worldShape)
  const fits = (pos: { x: number; z: number }): boolean => {
    const t: TerrainInstance = { id: 'probe', pieceId: 'terrain.low-wall', rulesType: 'obstacle', pos, rot, footprint: { rect: WALL }, height: 0.75, props: {} }
    const sh = worldShape(t)
    if (dist(caster.pos, pos) + WALL.w / 2 > ctrl + baseRadius(caster.base)) return false
    if (!Object.values(c.state.models).every((m) => !alive(m) || distToShape(m.pos, sh) - baseRadius(m.base) > 0.01)) return false
    return others.every((o) => !shapesClash(sh, o))
  }
  let pos = c.pointTarget
  if (!pos || !fits(pos)) {
    pos = undefined
    for (let step = baseRadius(caster.base) + 3; step <= ctrl; step += 0.5) {
      const p = { x: caster.pos.x + dx * step, z: caster.pos.z + dz * step }
      if (fits(p)) { pos = p; break }
    }
  }
  if (!pos) return noop(c)
  const seq = c.state.terrain.filter((t) => t.props.rockWall).length + 1
  const wall: TerrainInstance = {
    id: `rockwall:${c.selfId}:${seq}`, pieceId: 'terrain.low-wall', rulesType: 'obstacle', pos, rot,
    footprint: { rect: WALL }, height: 0.75, props: { rockWall: true, casterId: c.selfId, spellId: 'trl.s.rock-wall' },
  }
  // one wall per caster: a new casting replaces the old one
  const kept = c.state.terrain.filter((t) => !(t.props.rockWall && t.props.casterId === c.selfId))
  return { state: { ...c.state, terrain: [...kept, wall] }, events: [] }
}

/** Sentry: the upkeep effect the spell engine creates is the whole state; `sentryReady` reads it for the Maintenance Phase. */
const sentry = (c: HookContext): HookResult => noop(c)

// ---------- Regeneration ----------
/** Regeneration [d3]: heals d3 on the carrier (a special action: core pays the forced cost and enforces once per activation and not after running). */
const regenerate = (c: HookContext): HookResult => {
  const m = c.state.models[c.selfId]
  if (!m || !alive(m)) return noop(c)
  const d = rollD3(c.state)
  const look = lookups(d.state, bundleOf(c))
  const h = healDamage(d.state, m.id, d.value, look.layouts?.(m.id))
  return { state: h.state, events: [d.event, ...h.events] }
}

// ---------- Feat: Fortification ----------
/**
 * Fortification: friendly models inside the caster's CTRL count as in cover (+4 DEF against ranged and arcane attacks, read
 * through `hasGrantedCover` by the attack pipeline, so it never stacks with terrain cover or concealment, does not apply to
 * spray and loses to ignore-cover), cannot be knocked down this round and resist blast damage. The knockdown and blast parts
 * are fixed on the models inside CTRL when the feat is used; the cover follows CTRL while the round lasts.
 */
const grantCover = (c: HookContext): HookResult => {
  const caster = c.state.models[c.selfId]
  if (!caster) return noop(c)
  const b = bundleOf(c)
  const ctrl = statOf(c.state, b, c.selfId, 'CTRL')
  const ids = Object.values(c.state.models).filter((m) => m.owner === caster.owner && alive(m) && !m.inert && inCtrl(caster, m, ctrl)).map((m) => m.id)
  const r = applyEffect(c.state, {
    sourceId: 'trl.f.fortification', name: 'Fortification (cover)', owner: caster.owner, casterId: c.selfId, targetIds: ids, mods: [], forbid: ['knockDown'], duration: 'round',
    grantedCover: true, resist: ['blast'],
  })
  return { state: r.state, events: r.events }
}

/** True while a live Fortification of the model's own side covers it: the caster is on the table and the model is inside its CTRL now. */
export function hasGrantedCover(state: GameState, b: DataBundle, id: ModelId): boolean {
  const m = state.models[id]
  if (!alive(m)) return false
  return state.effects.some((e) => {
    if (!(e as EffectInstance & EffectExtras).grantedCover || !e.casterId) return false
    const caster = state.models[e.casterId]
    return alive(caster) && caster.owner === m.owner && inCtrl(caster, m, statOf(state, b, caster.id, 'CTRL'))
  })
}

// ---------- Skirmish additions (docs/spec/factions/trollbloods.md, Skirmish section) ----------
const eps = 1e-6
const BULLDOZE = 'trl.a.bulldoze'
/**
 * Bulldoze (movement.end): after a Normal Movement that was not a charge, every enemy model the mover touches is shoved up to 2" directly away
 * (R5.15 push: no damage, stops on contact), once per model per turn. A turn-long marker effect on the shoved model keeps the count.
 * RULING: Bulldoze runs when the move ends, not at any point along the path; a charge keeps its target in reach.
 */
const bulldoze = (c: HookContext): HookResult => {
  const me = c.state.models[c.selfId]
  if (!alive(me) || actOf(c.state)?.charge?.success) return noop(c)
  const look = lookups(c.state, bundleOf(c))
  let state = c.state
  const events: GameEvent[] = []
  const victims = Object.values(state.models)
    .filter((t) => t.owner !== me.owner && alive(t) && t.life === 'active' && touching(me, t) && !state.effects.some((e) => e.sourceId === BULLDOZE && e.targetIds.includes(t.id)))
    .sort((p, q) => p.id.localeCompare(q.id))
  for (const t of victims) {
    const m = applyEffect(state, { sourceId: BULLDOZE, name: 'Bulldozed', owner: me.owner, casterId: me.id, targetIds: [t.id], mods: [], duration: 'turn' })
    state = m.state; events.push(...m.events)
    const r = push(state, t.id, me.pos, 2, look)
    state = r.state; events.push(...r.events)
  }
  return { state, events }
}

/** Lucky Shot: the spell machinery creates the turn effect on the target (sourceId trl.s.lucky-shot); the reroll itself is the plugin below. */
const luckyShot = (c: HookContext): HookResult => noop(c)

/**
 * Guidance (the Runebearer's star action): the friendly model within 6" the player names (core's targeted special action) gains Eyeless Sight for a turn;
 * called without a name the hook picks: the Leader if it is in range, else the nearest warbeast or war-engine, else the nearest other model.
 * Its second half (the target's weapons deal magical damage) is recorded on the effect (`magicalWeapons`) and read by the core magical-weapons plugin.
 */
const guidance = (c: HookContext): HookResult => {
  const me = c.state.models[c.selfId]
  if (!alive(me)) return noop(c)
  const rank = (m: ModelState): number => (m.type === 'leader' ? 0 : m.type === 'beast' || m.type === 'warEngine' ? 1 : 2)
  const cands = Object.values(c.state.models).filter((m) => m.id !== me.id && m.owner === me.owner && alive(m) && m.life === 'active' && !m.inert && within(me, m, 6))
  const t = cands.find((m) => m.id === c.targetId) // the player's choice (a targeted special action)
    ?? cands.sort((p, q) => rank(p) - rank(q) || modelDistance(me, p) - modelDistance(me, q) || p.id.localeCompare(q.id))[0]
  if (!t) return noop(c)
  const r = applyEffect(c.state, { sourceId: 'trl.a.guidance', name: 'Guidance', owner: me.owner, casterId: me.id, targetIds: [t.id], mods: [], grants: ['trl.a.eyeless-sight'], duration: 'turn', magicalWeapons: true } as Parameters<typeof applyEffect>[1])
  return { state: r.state, events: r.events }
}

const HARMONY = 'trl.a.harmonious-exaltation'
/** Harmonious Exaltation (star action): marks the Leader within 5" so its next spell this turn costs 1 less (read through harmoniousDiscount). */
const harmoniousExaltation = (c: HookContext): HookResult => {
  const me = c.state.models[c.selfId]
  if (!alive(me)) return noop(c)
  const leader = c.state.models[c.state.players[me.owner].leaderId]
  if (!alive(leader) || !within(me, leader, 5)) return noop(c)
  const r = applyEffect(c.state, { sourceId: HARMONY, name: 'Harmonious Exaltation', owner: me.owner, casterId: me.id, targetIds: [leader.id], mods: [], duration: 'turn' })
  return { state: r.state, events: r.events }
}

export const trollbloodsHooks: CodeHookRegistry = {
  // wholeUnit: a scope marker read by spells.ts (Snipe covers the target's whole unit); true wherever it is evaluated as a plain condition
  conditions: { wholeUnit: () => true },
  effects: { luck, criticalDevastation, guidedFire, guidedFireDie, rockWall, sentry, grantCover, regenerate, bulldoze, luckyShot, guidance, harmoniousExaltation },
}

// ---------- Snacking (plugin) ----------
const isLiving = (b: DataBundle, m: ModelState): boolean => {
  const kw = (prof(b, m).keywords ?? []) as string[]
  return !kw.includes('construct') && !kw.includes('undead') && !kw.includes('warjack')
}
const snackingApplies = (state: GameState, b: DataBundle, atk: AtkCtx, targetId: ModelId): boolean => {
  const t = state.models[targetId]
  return (atk.kind === 'melee' || atk.kind === 'power') && hasFlag(state, b, atk.attackerId, 'snacking') && !!t && t.owner !== state.models[atk.attackerId]?.owner && isLiving(b, t)
}

// ---------- Bond [Gunnbjorn], Lucky Shot, Take Up (plugin) ----------
const isGunnbjorn = (m: ModelState | undefined): m is ModelState => !!m && m.profileId === 'trl.gunnbjorn'
/** Dozer & Smigg are bonded while they stand in their own Gunnbjorn's battlegroup (never under enemy control) inside his CTRL. */
export function bondedToGunnbjorn(state: GameState, b: DataBundle, id: ModelId): boolean {
  const m = state.models[id]
  if (!m || !alive(m) || m.wild || !hasFlag(state, b, id, 'bondGunnbjorn') || !m.controllerId) return false
  const g = state.models[m.controllerId]
  return isGunnbjorn(g) && alive(g) && g.owner === m.owner && inCtrl(g, m, statOf(state, b, g.id, 'CTRL'))
}

const LUCKY = 'trl.s.lucky-shot'
const luckyShotEffect = (state: GameState, id: ModelId): string | undefined => effectsOn(state, id).find((e) => e.sourceId === LUCKY)?.id

const takeUpGrunt = (state: GameState, t: ModelState): ModelState | undefined =>
  Object.values(state.models)
    .filter((m) => m.id !== t.id && m.unitId && m.unitId === t.unitId && m.owner === t.owner && alive(m) && m.life === 'active' && m.profileId === 'trl.stone-scribe' && within(t, m, 1))
    .sort((x, y) => modelDistance(x, t) - modelDistance(y, t) || x.id.localeCompare(y.id))[0]

export const trollbloodsPlugins: AttackPlugin[] = [{
  id: 'trl.snacking',
  onBoxed(state, b, atk, targetId) {
    return snackingApplies(state, b, atk, targetId) ? { removeFromPlay: true, denyTough: false } : null
  },
  onResolved(state, b, atk) {
    // every boxed (not destroyed) model of a snacking melee attack was removed from play: heal d3 per model
    const me = state.models[atk.attackerId]
    if (!me || !alive(me)) return { state, events: [] }
    const eaten = atk.x.destroyed.filter((id) => state.models[id]?.life === 'boxed' && snackingApplies(state, b, atk, id))
    let s = state
    const events: GameEvent[] = []
    for (let i = 0; i < eaten.length; i++) {
      const d = rollD3(s)
      const look = lookups(d.state, b)
      const h = healDamage(d.state, me.id, d.value, look.layouts?.(me.id))
      s = h.state; events.push(d.event, ...h.events)
    }
    return { state: s, events }
  },
}, {
  id: 'trl.skirmish-riders',
  /**
   * Before the hit and miss triggers: (1) Lucky Shot rerolls the first missed ranged attack roll of the model it is on (the effect is then used up);
   * (2) Bond [Gunnbjorn] makes a bonded model's direct ranged damage roll boosted for free (the pipeline's autoBoost, as for a charge attack),
   * so no paid boost is offered on top of it.
   */
  beforeHits(state, b, atk) {
    if (atk.spellId || !isRangedKind(atk.kind)) return null
    let s = state
    const events: GameEvent[] = []
    let a = atk
    const lucky = luckyShotEffect(s, a.attackerId)
    if (lucky) {
      const tid = a.x.rollTargets.find((t) => { const r = a.x.results[t]; return !!r && !r.hit && !r.auto && r.dice.length > 0 })
      if (tid) {
        const r = rerollMiss(s, a, tid, LUCKY)
        if (r) {
          const rm = removeEffect(r.state, lucky, 'other')
          s = setAtk(rm.state, r.next); events.push(...r.events, ...rm.events); a = r.next
        }
      }
    }
    if (!a.x.powerful && bondedToGunnbjorn(s, b, a.attackerId) && a.x.rollTargets.some((t) => a.x.results[t]?.hit)) {
      s = setAtk(s, { ...a, x: { ...a.x, powerful: true } })
    }
    return s === state ? null : { state: s, events }
  },
  adjustPoints(state, b, _atk, job, points) {
    // Take Up: a hit that would destroy the Stone Bearer destroys a Stone Scribe of the unit within 1" instead; the Bearer takes nothing
    const t = state.models[job.targetId]
    if (!t || points <= 0 || !alive(t) || t.life !== 'active' || !hasFlag(state, b, t.id, 'takeUp') || t.damage.track !== 'single') return null
    if (t.damage.filled + points < Math.max(t.damage.boxes, 1)) return null
    const g = takeUpGrunt(state, t)
    if (!g) return null
    const look = lookups(state, b)
    const ap = applyDamage(state, g.id, Math.max(g.damage.track === 'single' ? g.damage.boxes : 1, 1), { source: 'other', layouts: look.layouts?.(g.id) })
    let s = ap.state
    const events: GameEvent[] = [...ap.events]
    if (s.models[g.id]!.life === 'disabled') {
      const dd = resolveDeath(s, g.id, { layouts: look.layouts?.(g.id), cause: 'take-up' })
      s = dd.state; events.push(...dd.events)
    }
    return { state: s, events, points: 0 }
  },
}]

// ---------- seams read by other modules (control.ts upkeep, avenging.ts Sentry, code-hooks.ts range, housekeeping.ts walls) ----------
/** Resourceful: true when `casterId` keeps its upkeep on `targetId` for free (own battlegroup models; the caster itself too). */
export function resourcefulFree(state: GameState, b: DataBundle, casterId: ModelId, targetId: ModelId): boolean {
  if (!hasFlag(state, b, casterId, 'resourceful')) return false
  const t = state.models[targetId]
  return !!t && (targetId === casterId || (prof(b, t).type === 'beast' && t.controllerId === casterId)) // the battlegroup is the warbeasts (a solo names its Leader too since M12)
}

/** Sentry (Rapid Fire): upkeep effects whose targets owe one basic ranged attack in the Maintenance Phase. */
export function sentryReady(state: GameState): { effectId: string; modelId: ModelId; casterId: ModelId }[] {
  return state.effects
    .filter((e) => e.sourceId === 'trl.s.sentry' && e.targetIds[0] && alive(state.models[e.targetIds[0]!]))
    .map((e) => ({ effectId: e.id, modelId: e.targetIds[0]!, casterId: e.casterId! }))
}

/** Snipe and Far Strike: the extra RNG of a model's ranged weapons from live effects (0 when none). */
export function rangeBonus(state: GameState, id: ModelId): number {
  let n = 0
  for (const e of state.effects) {
    if ((e.sourceId !== 'trl.s.snipe' && e.sourceId !== 'trl.s.far-strike') || !e.targetIds.includes(id)) continue
    n += sum((e.mods as StatMod[]).filter((m) => m.stat === 'RNG').map((m) => m.value))
  }
  return n
}

/** Rock Wall upkeep: drop walls whose caster no longer maintains the spell or that an 80/120 mm base touches. */
export function pruneRockWalls(state: GameState): GameState {
  const keep = state.terrain.filter((t) => {
    if (!t.props.rockWall) return true
    const upheld = state.effects.some((e) => e.sourceId === 'trl.s.rock-wall' && e.casterId === t.props.casterId)
    const sh = worldShape(t)
    const crushed = Object.values(state.models).some((m) => alive(m) && m.base >= 80 && distToShape(m.pos, sh) - baseRadius(m.base) <= 0.01)
    return upheld && !crushed
  })
  return keep.length === state.terrain.length ? state : { ...state, terrain: keep }
}

// ---------- seams read by other modules (Skirmish) ----------
/**
 * Serenity (control.ts, start of the Control Phase, before leeching): each living Stone Bearer of `player` removes 1 fury from the most
 * furious friendly warbeast within 1". Pure; returns the events. Call it from runControl right after the casters refill.
 */
export function serenityStep(state: GameState, b: DataBundle, player: ModelState['owner']): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  const bearers = Object.values(state.models).filter((m) => m.owner === player && alive(m) && m.life === 'active' && hasFlag(state, b, m.id, 'serenity')).sort((x, y) => x.id.localeCompare(y.id))
  for (const bearer of bearers) {
    const beast = Object.values(s.models)
      .filter((m) => m.owner === player && m.type === 'beast' && alive(m) && (m.fury ?? 0) > 0 && modelDistance(bearer, m) <= 1 + eps)
      .sort((x, y) => (y.fury ?? 0) - (x.fury ?? 0) || x.id.localeCompare(y.id))[0]
    if (!beast) continue
    const after = (beast.fury ?? 0) - 1
    s = { ...s, models: { ...s.models, [beast.id]: { ...beast, fury: after } } }
    events.push({ type: 'FuryChanged', modelId: beast.id, delta: -1, after, reason: 'shed', fromId: bearer.id })
  }
  return { state: s, events }
}

/** Harmonious Exaltation: 1 off the COST of a spell `casterId` casts this turn while the marker is on it (0 when none). Call `useHarmoniousExaltation` once the cast is paid. */
export function harmoniousDiscount(state: GameState, casterId: ModelId): number {
  return effectsOn(state, casterId).some((e) => e.sourceId === HARMONY) ? 1 : 0
}
export function useHarmoniousExaltation(state: GameState, casterId: ModelId): { state: GameState; events: GameEvent[] } {
  const e = effectsOn(state, casterId).find((x) => x.sourceId === HARMONY)
  return e ? removeEffect(state, e.id, 'other') : { state, events: [] }
}
