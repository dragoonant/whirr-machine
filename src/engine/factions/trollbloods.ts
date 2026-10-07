// Trollbloods (United Kriels, Gunnbjorn) code hooks: every {code} this faction's data references (docs/spec/factions/trollbloods.md).
// Data codes: luck, criticalDevastation, guidedFire, guidedFireDie, rockWall, sentry, grantCover, regenerate, runAndGun (cygnar's).
// Snacking is an attack plugin (it needs the boxed-model seam); Resourceful, Sentry and the RNG buffs are read through the
// exported helpers at the bottom (see the CORE notes in the issues list of the faction package).
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import { alive, atkOf, hasFlag, lookups, noop, prof, setAtk, type AtkCtx, type AttackPlugin } from '../code-hooks'
import { applyEffect } from '../effects'
import { hasDouble, rerollDice, rollD3, rollNd6, sum } from '../dice'
import { dist, baseRadius } from '../geometry'
import { healDamage } from '../damage'
import { inCtrl } from '../measure'
import { knockDownUnless, slideAway } from '../movement'
import { distToShape, worldShape } from '../terrain'
import type { DataBundle, EffectInstance, GameState, ModelId, ModelState, StatMod, TerrainInstance } from '../types'
import { statOf } from '../code-hooks'
import type { GameEvent } from '../events'

const bundleOf = (c: HookContext): DataBundle => (c as HookContext & { bundle: DataBundle }).bundle
const patchFlags = (c: HookContext, flags: Record<string, unknown>): GameState => {
  const a = atkOf(c.state)!
  return setAtk(c.state, { ...a, x: { ...a.x, flags: { ...a.x.flags, ...flags } } })
}
const isRangedKind = (k: string): boolean => k === 'ranged' || k === 'aoe' || k === 'spray'

// ---------- Luck (Braylen's Heavy Pistols): one reroll of a missed attack roll ----------
/**
 * Luck, run at attack.miss for each model the roll missed. Rerolls all the dice once (R1.12), re-evaluates the hit with
 * the target number the attack was declared with and updates the stored result, so damage jobs (built after the hit/miss
 * pass) see the new outcome. Hit and crit triggers of the rerolled roll do not fire (the pistols have none).
 * TODO(core, trl.a.luck): the engine's own `reroll` decision (RerollAction) is not raised by starter content; this hook
 * rerolls automatically because a miss can only be improved by the reroll.
 */
const luck = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || !c.targetId) return noop(c)
  const res = a.x.results[c.targetId]
  const used = (a.x.flags.luckUsed as string[] | undefined) ?? []
  if (!res || res.hit || res.auto || res.dice.length === 0 || used.includes(c.targetId)) return noop(c)
  const flat = res.total - sum(res.dice)
  const rr = rerollDice(c.state, `r:${c.state.rollSeq}`, res.dice, 'trl.a.luck', flat)
  const n = rr.dice.length
  const all1 = rr.dice.every((d) => d === 1)
  const all6 = n > 1 && rr.dice.every((d) => d === 6)
  const hit = !all1 && (all6 || rr.total >= a.hitTarget)
  const crit = hit && hasDouble(rr.dice)
  const results = { ...a.x.results, [c.targetId]: { ...res, hit, crit, total: rr.total, dice: rr.dice } }
  const primary = c.targetId === a.targetId
  const next: AtkCtx = {
    ...a,
    ...(primary ? { hit, crit, dieValues: rr.dice } : {}),
    x: { ...a.x, results, hitModels: hit ? [...a.x.hitModels, c.targetId] : a.x.hitModels, flags: { ...a.x.flags, luckUsed: [...used, c.targetId] } },
  }
  // a second AttackResolved supersedes the first one in the log (same attack and roll, new outcome)
  const again: GameEvent = { type: 'AttackResolved', attackId: a.attackId, rollId: rr.event.rollId, hit, crit, auto: null }
  return { state: setAtk(rr.state, next), events: [rr.event, again] }
}

// ---------- Critical Devastation (Gunnbjorn's Bazooka) ----------
/**
 * On a critical hit: one d6 for the whole attack, then every model hit (direct hits, farthest from the attacker first) is
 * thrown that many inches directly away from the attacker and knocked down. The blast stays POW 8 (the Bazooka's own blast).
 * RULING: collateral damage from the throw uses the core throw collateral for the thrown model's base, not a flat POW 8
 * (the core slide helper owns that roll).
 */
const criticalDevastation = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || a.x.flags.cdDone) return noop(c)
  const b = bundleOf(c)
  const events: GameEvent[] = []
  let state = c.state
  const roll = rollNd6(state, 1, 'throwDist')
  state = roll.state; events.push(roll.event)
  const inches = roll.dice[0]!
  const from = state.models[a.attackerId]!.pos
  const victims = a.x.rollTargets
    .filter((t) => a.x.results[t]?.hit && alive(state.models[t]))
    .sort((p, q) => dist(from, state.models[q]!.pos) - dist(from, state.models[p]!.pos))
  const look = lookups(state, b)
  for (const t of victims) {
    if (!alive(state.models[t])) continue
    const r = slideAway(state, t, from, inches, 'throw', look)
    state = r.state; events.push(...r.events)
    if (alive(state.models[t])) {
      const kd = knockDownUnless(state, t, look, 'trl.a.critical-devastation')
      state = kd.state; events.push(...kd.events)
    }
  }
  const a2 = atkOf(state)!
  state = setAtk(state, { ...a2, x: { ...a2.x, flags: { ...a2.x.flags, cdDone: true } } })
  return { state, events }
}

// ---------- spells ----------
const battlegroupInCtrl = (state: GameState, b: DataBundle, casterId: ModelId): ModelId[] => {
  const caster = state.models[casterId]
  if (!caster) return []
  const ctrl = statOf(state, b, casterId, 'CTRL')
  return Object.values(state.models)
    .filter((m) => m.owner === caster.owner && m.controllerId === casterId && alive(m) && !m.inert && inCtrl(caster, m, ctrl))
    .map((m) => m.id)
}

/** Guided Fire: an effect on the battlegroup models inside CTRL for this turn; the extra die comes from guidedFireDie. */
const guidedFire = (c: HookContext): HookResult => {
  const caster = c.state.models[c.selfId]
  if (!caster) return noop(c)
  const ids = battlegroupInCtrl(c.state, bundleOf(c), c.selfId)
  if (!ids.length) return noop(c)
  const r = applyEffect(c.state, { sourceId: 'trl.s.guided-fire', name: 'Guided Fire', owner: caster.owner, casterId: c.selfId, targetIds: ids, mods: [], duration: 'turn' })
  return { state: r.state, events: r.events }
}

/** Attack-roll side of Guided Fire (a weapon ability at attack.beforeRoll): one extra die on ranged attacks. */
const guidedFireDie = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || !isRangedKind(a.kind)) return noop(c)
  const covered = c.state.effects.some((e) => e.sourceId === 'trl.s.guided-fire' && e.targetIds.includes(a.attackerId))
  if (!covered) return noop(c)
  return { state: setAtk(c.state, { ...a, x: { ...a.x, atkAdd: a.x.atkAdd + 1 } }), events: [] }
}

const WALL = { w: 4, d: 1 }
/**
 * Rock Wall: adds a 4" x 1" obstacle (the low-wall piece, so the cover and obstacle rules and the board reskin apply) inside
 * the caster's CTRL. Uses the cast point when the engine passes one, else sits in front of the caster toward the nearest
 * enemy, pushed out until it is clear of every base. `pruneRockWalls` removes it when the upkeep ends or a big base touches it.
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
  const fits = (pos: { x: number; z: number }): boolean => {
    const t: TerrainInstance = { id: 'probe', pieceId: 'terrain.low-wall', rulesType: 'obstacle', pos, rot, footprint: { rect: WALL }, height: 0.75, props: {} }
    const sh = worldShape(t)
    if (dist(caster.pos, pos) + WALL.w / 2 > ctrl + baseRadius(caster.base)) return false
    return Object.values(c.state.models).every((m) => !alive(m) || distToShape(m.pos, sh) - baseRadius(m.base) > 0.01)
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
/** Regeneration [d3]: heals d3 on the carrier (the forced cost and once-per-activation limit are the data's `cost` and `limit`). */
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
 * Fortification: friendly models inside the caster's CTRL get cover (+4 DEF against ranged and arcane attacks, R6) and cannot
 * be knocked down this round, and resist blast damage (resistsDamageType reads the effect's resist list).
 */
const grantCover = (c: HookContext): HookResult => {
  const caster = c.state.models[c.selfId]
  if (!caster) return noop(c)
  const b = bundleOf(c)
  const ctrl = statOf(c.state, b, c.selfId, 'CTRL')
  const ids = Object.values(c.state.models).filter((m) => m.owner === caster.owner && alive(m) && !m.inert && inCtrl(caster, m, ctrl)).map((m) => m.id)
  // +4 DEF against ranged and arcane attacks (cover), no knockdown, and Resistance: Blast, all carried by the one effect
  const r = applyEffect(c.state, {
    sourceId: 'trl.f.fortification', name: 'Fortification (cover)', owner: caster.owner, casterId: c.selfId, targetIds: ids, mods: [], forbid: ['knockDown'], duration: 'round',
    condMods: [{ stat: 'DEF', value: 4, kinds: ['ranged', 'aoe', 'spray', 'arcane'] }], resist: ['blast'],
  })
  return { state: r.state, events: r.events }
}

export const trollbloodsHooks: CodeHookRegistry = {
  conditions: {},
  effects: { luck, criticalDevastation, guidedFire, guidedFireDie, rockWall, sentry, regenerate, grantCover },
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
}]

// ---------- seams read by other modules (control.ts upkeep, avenging.ts Sentry, code-hooks.ts range, housekeeping.ts walls) ----------
/** Resourceful: true when `casterId` keeps its upkeep on `targetId` for free (own battlegroup models; the caster itself too). */
export function resourcefulFree(state: GameState, b: DataBundle, casterId: ModelId, targetId: ModelId): boolean {
  if (!hasFlag(state, b, casterId, 'resourceful')) return false
  const t = state.models[targetId]
  return !!t && (targetId === casterId || t.controllerId === casterId)
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
