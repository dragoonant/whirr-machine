// Cygnar (Storm Legion, Hellslinger cadre) code hooks: every {code} the Cygnar data references.
// Data codes: witchMark, blastShot, powerfulAttack, shadowFire, mageStorm, runAndGun, prey, arcaneConflagrationCounter,
// and the Skirmish additions (docs/spec/factions/cygnar.md, Skirmish section): smite, repulsorField, plasmaNimbus, lightningWreath,
// polarityField, windWeaver, cygCriticalArmorPiercing. Electro Leap is an attack plugin. Seams core must still call: warpingWindsRngPenalty,
// polarityFieldBlocks (see the exports at the bottom).
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import { applyEffect, type EffectExtras } from '../effects'
import { abilitiesOf, actOf, alive, atkOf, envOf, hasFlag, isMelee, lookups, noop, prof, rec, resistsDamageType, setAtk, statOf, weaponsOf, type AttackPlugin } from '../code-hooks'
import { applyDamage, resolveDeath, rollDamage } from '../damage'
import { rollNd6 } from '../dice'
import type { GameEvent } from '../events'
import { modelDistance, within } from '../measure'
import { knockDownUnless, push, slideAway } from '../movement'
import type { DamageType, DataBundle, EffectInstance, GameState, Id, ModelId, ModelState } from '../types'

const withEffect = (state: GameState, spec: Parameters<typeof applyEffect>[1]): HookResult => {
  const r = applyEffect(state, spec)
  return { state: r.state, events: r.events }
}

/** Witch Mark (AT): on a direct hit, this activation the caster's spells at that model auto-hit and ignore RNG and LOS (ATK-010). */
const witchMark = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || !c.targetId || !a.x.results[c.targetId]?.hit) return noop(c)
  const me = c.state.models[c.selfId]!
  return withEffect(c.state, {
    sourceId: 'cyg.a.witch-mark', name: 'Witch Mark', owner: me.owner, casterId: c.selfId, targetIds: [c.targetId],
    mods: [], duration: 'activation',
  })
}

/** Blast (AT): this shot becomes AOE 2 with POW 12 direct / 6 blast (data, QS p43-44). Runs at attack.declared. */
const blastShot = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a) return noop(c)
  const x = { ...a.x, aoe: 2, blastPow: 6 }
  return { state: setAtk(c.state, { ...a, kind: 'aoe', powDirect: 12, powBlast: 6, x }), events: [] }
}

/** Shadow Fire (AT): the model hit doesn't block LOS for one turn. (los.ts does not read it yet; the effect is recorded.) */
const shadowFire = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || !c.targetId || !a.x.results[c.targetId]?.hit) return noop(c)
  const me = c.state.models[c.selfId]!
  return withEffect(c.state, {
    sourceId: 'cyg.a.shadow-fire', name: 'Shadow Fire', owner: me.owner, casterId: c.selfId, targetIds: [c.targetId], mods: [], forbid: ['blocksLos'], duration: 'turn',
  })
}

/**
 * Mage Storm (chain): both initial shots with the chain weapon hit the same model. The first hit only counts; the second
 * lets the rest of the ability run (the hazard cloud). Sets x.flags.skipRest while the condition isn't met.
 */
const mageStorm = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  const act = actOf(c.state)
  if (!a || !act || !c.targetId) return noop(c)
  const hit = !!a.x.results[c.targetId]?.hit
  const mage = { ...act.x.mage }
  const key = c.targetId
  if (hit && !a.additional) mage[key] = (mage[key] ?? 0) + 1
  let st: GameState = { ...c.state, activation: { ...act, x: { ...act.x, mage } } as typeof c.state.activation }
  const ready = (mage[key] ?? 0) === 2 && hit
  const a2 = atkOf(st)!
  st = setAtk(st, { ...a2, x: { ...a2.x, flags: { ...a2.x.flags, skipRest: !ready } } })
  return { state: st, events: [] }
}

/** Run & Gun: at the end of the activation, after destroying an enemy with a ranged attack, make a full advance. */
const runAndGun = (c: HookContext): HookResult => {
  const act = actOf(c.state)
  if (!act || !act.x.killedByRanged || act.ran) return noop(c)
  const m = c.state.models[c.selfId]!
  const spd = (rec(envOf(c).bundle, m.profileId).stats?.SPD as number) ?? 6
  const moveReq = { modelId: c.selfId, dist: spd, mode: 'advance' as const, abilityId: 'cyg.a.run-and-gun', owner: m.owner, optional: true }
  return { state: { ...c.state, activation: { ...act, x: { ...act.x, moveReq } } as typeof c.state.activation }, events: [] }
}

/** Granted: Prey. Marker only; the choice is raised by raisePrey() in activation.ts and stored in UnitState.preyId. */
const prey = (c: HookContext): HookResult => ({ state: c.state, events: [] })

/** Feat Arcane Conflagration: one round of stacking pistol damage and the boxed burst (the plugin below reads the effect). */
const arcaneConflagrationCounter = (c: HookContext): HookResult => {
  const me = c.state.models[c.selfId]!
  const r = applyEffect(c.state, {
    sourceId: 'cyg.f.arcane-conflagration', name: 'Arcane Conflagration', owner: me.owner, casterId: c.selfId, targetIds: [c.selfId], mods: [], duration: 'round',
  })
  const eff = { ...r.effect, counter: 0 } as EffectInstance
  return { state: { ...r.state, effects: r.state.effects.map((e) => (e.id === eff.id ? eff : e)) }, events: r.events }
}

// ---------- Skirmish additions: Tempest Assailers, Storm Vanes, Courser (docs/spec/factions/cygnar.md) ----------
const bundleOf = (c: HookContext): DataBundle => envOf(c).bundle
const out = (state: GameState, events: GameEvent[] = []): HookResult => ({ state, events })
const SMITE_STAR = 'cyg.a.smite'
const CAPACITOR_SRC = { wreath: 'cyg.a.lightning-wreath', polarity: 'cyg.a.polarity-field-generator', wind: 'cyg.a.wind-weaver' } as const
const WIND_RANGE = 3
const ELECTRO_LEAP_POW = 10
const resistsElectricity = (state: GameState, b: DataBundle, id: ModelId): boolean => resistsDamageType(state, b, id, ['electricity'])

/**
 * One unboostable electrical damage roll that no attack caused (Electro Leap arcs, Plasma Nimbus): the target's ARM is subtracted,
 * Resistance: Electricity removes a die, and a model the roll disables goes through the usual death step.
 * RULING: an Incorporeal model takes nothing (electrical damage is not magical) | the roll is skipped | see cryx.md Incorporeal.
 */
function electricalRoll(state: GameState, b: DataBundle, id: ModelId, pow: number): HookResult {
  const m = state.models[id]
  if (!alive(m)) return out(state)
  const look = lookups(state, b)
  if (look.noMundaneDamage?.(id)) return out(state)
  const r = rollDamage(state, { pow, armor: look.arm(id), resist: resistsElectricity(state, b, id), ownerId: id })
  const a = applyDamage(r.state, id, r.points, { layouts: look.layouts?.(id), source: 'other', damageTypes: ['electricity' as DamageType] })
  let s = a.state
  const events = [...r.events, ...a.events]
  if (s.models[id]?.life === 'disabled') {
    const d = resolveDeath(s, id, { tough: look.tough?.(id), layouts: look.layouts?.(id), cause: 'other' })
    s = d.state; events.push(...d.events)
  }
  return out(s, events)
}

/**
 * Smite (★Attack, resolved after the attack): the model hit, if it is still standing, is slammed d6" directly away from the attacker
 * (half that when its base is larger than the attacker's) and knocked down; the collateral damage rolls use the weapon's POW.
 * It only runs when the Smite attack was the one chosen (the ★ ability is the attack's `star`), so a basic hammer attack never slams.
 * RULING: half the distance is not rounded (a 3 becomes 1.5") | the card gives no rounding rule.
 */
const smite = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || a.x.star !== SMITE_STAR) return noop(c)
  const tid = c.targetId ?? a.targetId
  const t = c.state.models[tid]
  const at = c.state.models[a.attackerId]
  if (!t || !at || !alive(t) || t.life !== 'active' || !a.x.results[tid]?.hit) return noop(c)
  const b = bundleOf(c)
  const look = lookups(c.state, b)
  if (look.immovable?.(tid)) return noop(c)
  const roll = rollNd6(c.state, 1, 'slamDist')
  const inches = t.base > at.base ? roll.dice[0]! / 2 : roll.dice[0]!
  const pow = (rec(b, a.weaponId).pow as number | undefined) ?? 15
  const r = slideAway(roll.state, tid, at.pos, inches, 'slam', look, pow)
  let s = r.state
  const events = [roll.event, ...r.events]
  if (alive(s.models[tid]) && s.models[tid]!.life === 'active') {
    const kd = knockDownUnless(s, tid, lookups(s, b), SMITE_STAR)
    s = kd.state; events.push(...kd.events)
  }
  return out(s, events)
}

/** Repulsor Field: the enemy that hit this model in melee is pushed 1" directly away from it after the attack. */
const repulsorField = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  const me = c.state.models[c.selfId]
  const at = a ? c.state.models[a.attackerId] : undefined
  if (!a || !me || !at || !alive(me) || !alive(at) || !a.x.results[c.selfId]?.hit) return noop(c)
  const r = push(c.state, at.id, me.pos, 1, lookups(c.state, bundleOf(c)))
  return out(r.state, r.events)
}

/** Plasma Nimbus: the attacker that hit this model in melee suffers an unboostable POW 10 electrical damage roll (the owner opted in). */
const plasmaNimbus = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  const me = c.state.models[c.selfId]
  const at = a ? c.state.models[a.attackerId] : undefined
  if (!a || !me || !at || !alive(me) || !alive(at) || !a.x.results[c.selfId]?.hit) return noop(c)
  return electricalRoll(c.state, bundleOf(c), at.id, 10)
}

/** Critical Armor-Piercing: on a critical hit the damage roll halves the target's base ARM (the flag the Armor-Piercing quality sets). */
const cygCriticalArmorPiercing = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a?.x.cur) return noop(c)
  return out(setAtk(c.state, { ...a, x: { ...a.x, cur: { ...a.x.cur, armorPiercing: true } } }))
}

// ----- Galvanic Capacitor (Storm Vanes): three capacitor effects, each a self ability the unit may use once per activation -----
const capacitorEffect = (
  state: GameState, caster: ModelState, name: string, sourceId: string, targetIds: ModelId[], extra: EffectExtras & { duration: 'turn' | 'round' },
): HookResult => {
  const { duration, ...rest } = extra
  const r = applyEffect(state, { sourceId, name, owner: caster.owner, casterId: caster.id, targetIds, mods: [], duration, ...rest })
  return out(r.state, r.events)
}

/**
 * Lightning Wreath: the Vane picks the friendly model within 3" whose melee weapons will profit most.
 * RULING: the target is auto-picked (models already in melee first, then by MAT, then id) | the special-action flow has no target choice for
 * code abilities | a chosen target is a later core feature.
 */
const lightningWreath = (c: HookContext): HookResult => {
  const b = bundleOf(c)
  const me = c.state.models[c.selfId]
  if (!alive(me)) return noop(c)
  const engaged = (m: ModelState): boolean => Object.values(c.state.models).some((e) => e.owner !== m.owner && alive(e) && e.life === 'active' && within(m, e, 1.5))
  const cands = Object.values(c.state.models)
    .filter((m) => m.id !== me.id && m.owner === me.owner && alive(m) && m.life === 'active' && within(me, m, 3) && weaponsOf(b, m).some((w) => isMelee(w.w)))
    .sort((x, y) => Number(engaged(y)) - Number(engaged(x)) || statOf(c.state, b, y.id, 'MAT') - statOf(c.state, b, x.id, 'MAT') || x.id.localeCompare(y.id))
  const pick = cands[0]
  if (!pick) return noop(c)
  return capacitorEffect(c.state, me, 'Lightning Wreath', CAPACITOR_SRC.wreath, [pick.id], { duration: 'turn', grants: ['cyg.a.electro-leap'] })
}

/** Polarity Field Generator: every model of the Vane's unit is marked for a round; polarityFieldBlocks says whether a charge or slam is barred. */
const polarityField = (c: HookContext): HookResult => {
  const me = c.state.models[c.selfId]
  if (!alive(me)) return noop(c)
  const mates = me.unitId ? (c.state.units[me.unitId]?.troopers ?? []).filter((t) => alive(c.state.models[t])) : [me.id]
  return capacitorEffect(c.state, me, 'Polarity Field', CAPACITOR_SRC.polarity, mates.length ? mates : [me.id], { duration: 'round' })
}

/**
 * Wind Weaver: the Vane gains Warping Winds for a round (the marker the RNG helper reads), and friendly Cygnar models within 3" of it
 * resist blast damage for the round.
 * RULING: the blast resistance is a snapshot of who stood within 3" when the effect was used, not a live aura | effects carry a fixed
 * target list and core reads auras from profiles only | the live version is a core change (see issues).
 */
const windWeaver = (c: HookContext): HookResult => {
  const b = bundleOf(c)
  const me = c.state.models[c.selfId]
  if (!alive(me)) return noop(c)
  const mark = capacitorEffect(c.state, me, 'Warping Winds', CAPACITOR_SRC.wind, [me.id], { duration: 'round' })
  const near = Object.values(c.state.models)
    .filter((m) => m.owner === me.owner && alive(m) && m.life === 'active' && prof(b, m).faction === 'cyg' && within(me, m, WIND_RANGE))
    .map((m) => m.id)
  const blast = capacitorEffect(mark.state, me, 'Warping Winds (blast)', CAPACITOR_SRC.wind, near, { duration: 'round', resist: ['blast'] })
  return out(blast.state, [...mark.events, ...blast.events])
}

/**
 * Warping Winds, ranged half: how many inches of RNG a ranged attack at `targetId` loses (3 when the target is a Cygnar model within 3" of a
 * friendly model that holds Warping Winds, else 0). Core calls this where the attack range is checked (not wired yet, see issues).
 */
export function warpingWindsRngPenalty(state: GameState, b: DataBundle, targetId: ModelId): number {
  const t = state.models[targetId]
  if (!t || !alive(t) || prof(b, t).faction !== 'cyg') return 0
  for (const e of state.effects) {
    if (e.sourceId !== CAPACITOR_SRC.wind || e.name !== 'Warping Winds') continue
    const src = e.casterId ? state.models[e.casterId] : undefined
    if (src && alive(src) && src.owner === t.owner && within(src, t, WIND_RANGE)) return 3
  }
  return 0
}

/**
 * Polarity Field Generator: true when `targetId` carries the field and `chargerId` is a construct (the charge or slam may not target it).
 * Core calls this when it lists charge and slam targets (not wired yet, see issues).
 */
export function polarityFieldBlocks(state: GameState, b: DataBundle, chargerId: ModelId, targetId: ModelId): boolean {
  const field = state.effects.some((e) => e.sourceId === CAPACITOR_SRC.polarity && e.targetIds.includes(targetId))
  return field && hasFlag(state, b, chargerId, 'construct')
}

/**
 * Electro Leap (granted by Lightning Wreath): when a basic melee attack by a model with the rule hits a model directly, lightning arcs to
 * the nearest model within 3" of the one hit, ignoring the attacker and every model with Resistance: Electricity; lightning never arcs from
 * a model with that resistance. The arc is optional on the card.
 * RULING: the arc is taken only when the nearest model is an enemy | a player prompt would need a new decision and arcing into a friend is
 * never wanted | the engine has no seam for the choice.
 */
const electroLeapPlugin: AttackPlugin = {
  id: 'cyg.electro-leap',
  onHit(state, b, atk, targetId) {
    const at = state.models[atk.attackerId]
    const hit = state.models[targetId]
    if (!at || !hit || atk.kind !== 'melee' || atk.x.star || targetId !== atk.targetId || !alive(hit)) return { state, events: [] }
    if (!abilitiesOf(state, b, at.id).includes('cyg.a.electro-leap')) return { state, events: [] }
    if (resistsElectricity(state, b, hit.id)) return { state, events: [] }
    const near = Object.values(state.models)
      .filter((m) => m.id !== at.id && m.id !== hit.id && alive(m) && m.life === 'active' && !resistsElectricity(state, b, m.id) && within(hit, m, 3))
      .sort((x, y) => modelDistance(hit, x) - modelDistance(hit, y) || x.id.localeCompare(y.id))[0]
    if (!near || near.owner === at.owner) return { state, events: [] }
    const r = electricalRoll(state, b, near.id, ELECTRO_LEAP_POW)
    return { state: r.state, events: r.events }
  },
}

export const cygnarHooks: CodeHookRegistry = {
  conditions: {},
  effects: {
    witchMark, blastShot, powerfulAttack: prey, shadowFire, mageStorm, runAndGun, prey, arcaneConflagrationCounter,
    smite, repulsorField, plasmaNimbus, lightningWreath, polarityField, windWeaver, cygCriticalArmorPiercing,
  },
}

// ---------- Arcane Conflagration seam ----------
const PISTOL = 'cyg.w.spellstorm-pistol'
const conflagration = (state: GameState, casterId: ModelId): (EffectInstance & { counter?: number }) | undefined =>
  state.effects.find((e) => e.sourceId === 'cyg.f.arcane-conflagration' && e.targetIds.includes(casterId)) as (EffectInstance & { counter?: number }) | undefined

export const cygnarPlugins: AttackPlugin[] = [{
  id: 'cyg.arcane-conflagration',
  damageFlat(state, _b, atk) {
    if (atk.weaponId !== PISTOL) return 0
    return conflagration(state, atk.attackerId)?.counter ?? 0
  },
  onHit(state, _b, atk, targetId) {
    const e = conflagration(state, atk.attackerId)
    const t = state.models[targetId]
    const me = state.models[atk.attackerId]
    if (!e || atk.weaponId !== PISTOL || atk.kind !== 'ranged' || !t || !me || t.owner === me.owner) return { state, events: [] }
    const next = { ...e, counter: (e.counter ?? 0) + 1 }
    return { state: { ...state, effects: state.effects.map((x) => (x.id === e.id ? next : x)) }, events: [] }
  },
  onBoxed(state, _b, atk) {
    if (atk.weaponId !== PISTOL || !conflagration(state, atk.attackerId)) return null
    return { removeFromPlay: true, denyTough: false, burst: { pow: 10, radius: 1, types: ['magical'] } }
  },
}, electroLeapPlugin]
