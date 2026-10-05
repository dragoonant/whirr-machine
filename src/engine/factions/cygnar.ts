// Cygnar (Storm Legion, Hellslinger cadre) code hooks: every {code} the Cygnar data references.
// Data codes: witchMark, blastShot, powerfulAttack, shadowFire, mageStorm, runAndGun, prey, arcaneConflagrationCounter.
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import { applyEffect } from '../effects'
import { actOf, atkOf, envOf, noop, rec, setAtk, type AttackPlugin } from '../code-hooks'
import type { EffectInstance, GameState, ModelId } from '../types'

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

export const cygnarHooks: CodeHookRegistry = {
  conditions: {},
  effects: { witchMark, blastShot, powerfulAttack: prey, shadowFire, mageStorm, runAndGun, prey, arcaneConflagrationCounter },
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
}]
