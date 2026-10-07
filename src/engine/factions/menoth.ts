// Protectorate of Menoth (Covenant of the Flame, Feora) code hooks: every {code} this faction's data references (docs/spec/factions/menoth.md).
// Data codes: stokeStripAttack, stokeStripDamage, inciteAttack, stokeRefund, fireStep, hexHammer, blessingOfTheFirstGift, battlePlan.
// Plugins (per-attack seams, no data code): Impenetrable Shield, Chain Weapon, Incite damage, Stir the Blood, Convection.
//
// Core now drives (M9 CORE pass): Set Defense (activation atkModsFor / power slam), Combined Melee Attack (combinedAttack option), Fight to the
// Last (effect grants Tough), Precision Strike (effect ignoreFriendly), Hex Hammer (castSpell calls it at spell.declare), Convection (offered at
// enemies by anytimeOptions), Stoke the Pyre free cast (spells.ts calls stokeFreeVictim before paying).
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import {
  actOf, appliedPassives, atkOf, envOf, hasFlag, isConstruct, isMelee, lookups, noop, prof, rec, resistsDamageType, setAtk, statOf,
  touching, weaponsOf, type AttackPlugin, type Rec,
} from '../code-hooks'
import { applyDamage, resolveDeath } from '../damage'
import { rollD3, rollNd6 } from '../dice'
import { addCondition, applyEffect, immuneToContinuous, removeCondition, removeEffect } from '../effects'
import type { GameEvent } from '../events'
import { gainFocus } from '../focus'
import { baseRadius, dist, isOnTable, validateAdvancePath } from '../geometry'
import { inCtrl, modelDistance, within } from '../measure'
import { movedEvent, relocate } from '../movement'
import type { DataBundle, DamageType, EffectInstance, GameState, Id, ModelId, ModelState } from '../types'

const bundleOf = (c: HookContext): DataBundle => envOf(c).bundle
const out = (state: GameState, events: GameEvent[] = []): HookResult => ({ state, events })
const keywordsOf = (b: DataBundle, m: ModelState): string[] => (prof(b, m).keywords ?? []) as string[]
const isMenoth = (b: DataBundle, m: ModelState | undefined): boolean => !!m && keywordsOf(b, m).includes('menoth')
const onFire = (state: GameState, m: ModelState): boolean => m.conditions.includes('fire')
const liveOnTable = (m: ModelState | undefined): m is ModelState => !!m && m.life === 'active' && isOnTable(m)

/** Stop the rest of the running ability's effect list (runAbility reads and clears this flag after each code effect). */
const skipRest = (state: GameState): GameState => {
  const a = atkOf(state)
  return a ? setAtk(state, { ...a, x: { ...a.x, flags: { ...a.x.flags, skipRest: true } } }) : state
}

/** A fire damage roll outside an attack (Fire Step, the feat): Resistance: Fire removes one die. */
function fireDamage(state0: GameState, b: DataBundle, id: ModelId, pow: number): { state: GameState; events: GameEvent[] } {
  let state = state0
  const look = lookups(state, b)
  const arm = look.arm(id)
  const resist = resistsDamageType(state, b, id, ['fire'])
  const r = rollNd6(state, resist ? 1 : 2, 'damage', { ownerId: id, target: arm, flat: pow })
  const pts = Math.max(0, r.total - arm)
  const ap = applyDamage(r.state, id, pts, { source: 'other', layouts: look.layouts?.(id), damageTypes: ['fire'] })
  state = ap.state
  const events: GameEvent[] = [r.event, ...ap.events]
  if (state.models[id]!.life === 'disabled') {
    const d = resolveDeath(state, id, { tough: look.tough?.(id), layouts: look.layouts?.(id), cause: 'fire' })
    state = d.state; events.push(...d.events)
  }
  return { state, events }
}

// ---------- Stoke the Pyre ----------
/**
 * Stoke the Pyre, attack roll half: strip the fire off the target to boost the melee attack roll. Policy (RULING): only when the
 * hit is a long shot (DEF - MAT >= 8), otherwise the fire is kept for the damage roll. The data's addDie follows this code unless skipped.
 */
const stokeStripAttack = (c: HookContext): HookResult => {
  const b = bundleOf(c)
  const tid = c.targetId
  const tgt = tid ? c.state.models[tid] : undefined
  if (!tid || !tgt || !onFire(c.state, tgt)) return out(skipRest(c.state))
  const need = statOf(c.state, b, tid, 'DEF') - statOf(c.state, b, c.selfId, 'MAT')
  if (need < 8) return out(skipRest(c.state))
  const r = removeCondition(c.state, tid, 'fire', 'effect')
  return out(r.state, r.events)
}

/** Stoke the Pyre, damage roll half: strip the fire off the target; the data's addDie adds the die. */
const stokeStripDamage = (c: HookContext): HookResult => {
  const tid = c.targetId
  const tgt = tid ? c.state.models[tid] : undefined
  if (!tid || !tgt || !onFire(c.state, tgt)) return out(skipRest(c.state))
  const r = removeCondition(c.state, tid, 'fire', 'effect')
  return out(r.state, r.events)
}

/**
 * Stoke the Pyre, free spell half (Feora): after a spell is cast, one enemy Fire in her CTRL is stripped and the spell's focus is
 * refunded (the same net cost as casting for 0; a true 0-focus cast needs a core hook, so Feora must be able to pay first).
 */
/** Nothing to do after the cast: castSpell asks stokeFreeVictim first and casts for 0 (a true free cast, no refund). */
const stokeRefund = (c: HookContext): HookResult => noop(c)

/** Stoke the Pyre, free spell: the enemy on Fire in the caster's CTRL whose fire is stripped to cast a spell for 0 focus, or null. */
export function stokeFreeVictim(state: GameState, b: DataBundle, casterId: ModelId): ModelId | null {
  const caster = state.models[casterId]
  if (!caster || !liveOnTable(caster) || !((prof(b, caster).abilities ?? []) as Id[]).includes('men.a.stoke-the-pyre')) return null
  const ctrl = statOf(state, b, casterId, 'CTRL')
  const victim = Object.values(state.models)
    .filter((m) => m.owner !== caster.owner && liveOnTable(m) && onFire(state, m) && inCtrl(caster, m, ctrl))
    .sort((x, y) => x.id.localeCompare(y.id))[0]
  return victim ? victim.id : null
}

// ---------- Incite ----------
/** Incite, attack half (granted to friendly Menoth models by Feora): +2 to the attack roll against an enemy within 10" of the caster. */
const inciteAttack = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  const me = c.state.models[c.selfId]
  const tgt = a ? c.state.models[a.targetId] : undefined
  if (!a || !me || !tgt) return noop(c)
  const eff = inciteFor(c.state, me.owner)
  const caster = eff?.casterId ? c.state.models[eff.casterId] : undefined
  if (!eff || !liveOnTable(caster) || !within(caster, tgt, 10)) return noop(c)
  const mods = [...a.x.atkMods, { source: 'men.s.incite', label: 'Incite', value: 2, mode: 'add' as const }]
  return out(setAtk(c.state, { ...a, x: { ...a.x, atkMods: mods } }))
}
const inciteFor = (state: GameState, owner: ModelState['owner']): EffectInstance | undefined =>
  state.effects.find((e) => e.sourceId === 'men.s.incite' && e.owner === owner)

// ---------- Fire Step ----------
/** Fire Step: enemies within 2" take a POW 13 fire damage roll, then the caster is placed within 2" (RULING: auto-placed away from the nearest enemy). Once per activation. */
const fireStep = (c: HookContext): HookResult => {
  const b = bundleOf(c)
  let state = c.state
  const act = actOf(state)
  const caster = state.models[c.selfId]
  if (!act || !caster) return noop(c)
  if (act.spellsCast.filter((s) => s === 'men.s.fire-step').length > 1) return noop(c)
  const events: GameEvent[] = []
  const victims = Object.values(state.models)
    .filter((m) => m.owner !== caster.owner && liveOnTable(m) && within(caster, m, 2))
    .sort((x, y) => x.id.localeCompare(y.id))
  for (const v of victims) {
    const r = fireDamage(state, b, v.id, 13)
    state = r.state; events.push(...r.events)
  }
  const me = state.models[caster.id]!
  if (!victims.length || !liveOnTable(me)) return out(state, events)
  const foes = Object.values(state.models).filter((m) => m.owner !== me.owner && liveOnTable(m))
  const gap = (p: { x: number; z: number }): number => Math.min(...foes.map((f) => dist(p, f.pos) - baseRadius(f.base)))
  let best: { x: number; z: number } | null = null
  let bestGap = gap(me.pos)
  for (let i = 0; i < 16; i++) {
    const ang = (i * Math.PI) / 8
    const p = { x: me.pos.x + Math.cos(ang) * 2, z: me.pos.z + Math.sin(ang) * 2 }
    if (!validateAdvancePath(state, me.id, [p], 2).ok) continue
    const g = gap(p)
    if (g > bestGap + 1e-9) { best = p; bestGap = g }
  }
  if (best) {
    const from = me.pos
    state = relocate(state, me.id, best)
    events.push(movedEvent(me.id, 'place', from, best, [best], state.models[me.id]!.elev))
  }
  return out(state, events)
}

// ---------- Hex Hammer ----------
/**
 * Hex Hammer. Called at cast time it does nothing (the spell effect on Feora is the marker). Called by core with point 'spell.declare'
 * and selfId = an enemy model declaring a spell: if it stands in the CTRL of a Hex Hammer caster, it takes d3 damage first; the
 * caller cancels the spell when that model is no longer active afterwards.
 */
const hexHammer = (c: HookContext): HookResult => {
  if (c.point !== 'spell.declare') return noop(c)
  const b = bundleOf(c)
  let state = c.state
  const events: GameEvent[] = []
  const decl = state.models[c.selfId]
  if (!decl) return noop(c)
  for (const e of state.effects.filter((x) => x.sourceId === 'men.s.hex-hammer')) {
    const hex = e.casterId ? state.models[e.casterId] : undefined
    const d = state.models[decl.id]!
    if (!liveOnTable(hex) || !liveOnTable(d) || hex.owner === d.owner) continue
    if (!inCtrl(hex, d, statOf(state, b, hex.id, 'CTRL'))) continue
    const roll = rollD3(state)
    state = roll.state; events.push(roll.event)
    const look = lookups(state, b)
    const ap = applyDamage(state, d.id, roll.value, { source: 'other', layouts: look.layouts?.(d.id), damageTypes: [] })
    state = ap.state; events.push(...ap.events)
    if (state.models[d.id]!.life === 'disabled') {
      const dd = resolveDeath(state, d.id, { tough: look.tough?.(d.id), layouts: look.layouts?.(d.id), cause: 'hex-hammer' })
      state = dd.state; events.push(...dd.events)
    }
  }
  return out(state, events)
}

// ---------- Feat: Blessing of the First Gift ----------
/** Every enemy model in the caster's CTRL takes a POW 12 fire damage roll and then catches fire (unless it resists fire). */
const blessingOfTheFirstGift = (c: HookContext): HookResult => {
  const b = bundleOf(c)
  let state = c.state
  const caster = state.models[c.selfId]
  if (!caster) return noop(c)
  const ctrl = statOf(state, b, caster.id, 'CTRL')
  const events: GameEvent[] = []
  const victims = Object.values(state.models)
    .filter((m) => m.owner !== caster.owner && liveOnTable(m) && inCtrl(caster, m, ctrl))
    .sort((x, y) => x.id.localeCompare(y.id))
  for (const v of victims) {
    const r = fireDamage(state, b, v.id, 12)
    state = r.state; events.push(...r.events)
    const now = state.models[v.id]!
    if (liveOnTable(now) && !immuneToContinuous(b, now, 'fire')) {
      const f = addCondition(state, v.id, 'fire', 'men.f.blessing-of-the-first-gift')
      state = f.state; events.push(...f.events)
    }
  }
  return out(state, events)
}

// ---------- Pyrrhus: Battle Plan ----------
/**
 * Battle Plan, run at the end of Pyrrhus's activation (core has no any-time ability choice yet). RULING: the plan is picked by rule of
 * thumb: the first friendly Menoth group within 5" that has not activated yet: Stir the Blood when it can melee, Precision Strike for
 * shooters with friends in the way, else Fight to the Last. The effect is recorded on the chosen models (it grants Tough, or lets them
 * see and pass through friends, through the effect's extra fields).
 */
const battlePlan = (c: HookContext): HookResult => {
  const b = bundleOf(c)
  const me = c.state.models[c.selfId]
  const act = actOf(c.state)
  if (!me || !act || !liveOnTable(me)) return noop(c)
  const near = Object.values(c.state.models)
    .filter((m) => m.id !== me.id && m.owner === me.owner && liveOnTable(m) && !m.inert && isMenoth(b, m) && within(me, m, 5))
    .sort((x, y) => Number(x.activated) - Number(y.activated) || x.id.localeCompare(y.id))
  const pick = near.find((m) => !m.activated)
  if (!pick) return noop(c)
  const group = pick.unitId
    ? Object.values(c.state.models).filter((m) => m.unitId === pick.unitId && liveOnTable(m)).map((m) => m.id)
    : [pick.id]
  const melee = weaponsOf(b, pick).some((w) => isMelee(w.w))
  const ranged = weaponsOf(b, pick).some((w) => !isMelee(w.w))
  // RULING: melee troops get Stir the Blood; shooters get Precision Strike when friends are in the way, else Fight to the Last
  const friendsInWay = group.length > 1 || Object.values(c.state.models).some((m) => m.owner === me.owner && m.id !== pick.id && !group.includes(m.id) && liveOnTable(m) && within(m, pick, 6))
  const plan = melee
    ? { id: 'men.a.stir-the-blood', name: 'Stir the Blood', duration: 'turn' as const, extra: {} }
    : ranged && friendsInWay
      ? { id: 'men.a.precision-strike', name: 'Precision Strike', duration: 'turn' as const, extra: { ignoreFriendly: true } }
      : { id: 'men.a.fight-to-the-last', name: 'Fight to the Last', duration: 'round' as const, extra: { grants: ['core.a.tough'] } }
  const made = applyEffect(c.state, { sourceId: plan.id, name: plan.name, owner: me.owner, casterId: me.id, targetIds: group, mods: [], duration: plan.duration, ...plan.extra })
  return out(made.state, made.events)
}

export const menothHooks: CodeHookRegistry = {
  conditions: {},
  effects: { stokeStripAttack, stokeStripDamage, inciteAttack, stokeRefund, fireStep, hexHammer, blessingOfTheFirstGift, battlePlan },
}

// ---------- attack plugins ----------
const SHIELD_BONUS_IDS = new Set<Id>(['core.q.buckler', 'core.q.shield', 'kha.a.shield-wall', 'men.a.shield-wall'])
/** The ARM a target gets from a Buckler, a Shield or Shield Wall right now (what Chain Weapon ignores). */
export function shieldBonusArm(state: GameState, b: DataBundle, targetId: ModelId): number {
  const t = state.models[targetId]
  if (!t || t.inert) return 0
  let sum = 0
  for (const p of appliedPassives(state, b, targetId)) {
    if (!SHIELD_BONUS_IDS.has(p.ability.id)) continue
    for (const n of (p.ability.effect ?? []) as Rec[]) if (n.op === 'modStat' && n.stat === 'ARM') sum += n.value ?? 0
  }
  return sum
}

/** Impenetrable Shield: the model is touching a friendly Flameguard model, so non-magical melee and ranged attacks do no damage to it. */
export function shieldedByFlameguard(state: GameState, b: DataBundle, targetId: ModelId): boolean {
  const t = state.models[targetId]
  if (!t || !hasFlag(state, b, targetId, 'impenetrableShield')) return false
  return Object.values(state.models).some((o) => o.id !== t.id && o.owner === t.owner && liveOnTable(o) && keywordsOf(b, o).includes('flameguard') && touching(t, o))
}

const stirOn = (state: GameState, id: ModelId): EffectInstance | undefined =>
  state.effects.find((e) => e.sourceId === 'men.a.stir-the-blood' && e.targetIds.includes(id))
const isMeleeKind = (k: string): boolean => k === 'melee' || k === 'power'

const LIVING_BLOCK = new Set(['undead', 'construct'])
const isLiving = (state: GameState, b: DataBundle, id: ModelId): boolean => {
  const m = state.models[id]
  return !!m && m.type !== 'warEngine' && !isConstruct(state, b, id) && !keywordsOf(b, m).some((k) => LIVING_BLOCK.has(k))
}

export const menothPlugins: AttackPlugin[] = [{
  id: 'men.faction',
  damageFlat(state, b, atk, job) {
    const at = state.models[atk.attackerId]
    const tgt = state.models[job.targetId]
    if (!at || !tgt) return 0
    // Impenetrable Shield: no damage at all from non-magical melee or ranged attacks
    if (atk.kind !== 'arcane' && !job.types.includes('magical' as DamageType) && shieldedByFlameguard(state, b, tgt.id)) return -999
    let flat = 0
    // Chain Weapon: the Buckler / Shield / Shield Wall ARM is ignored, which is the same as that much extra on the roll
    if (atk.weaponId === 'men.w.blazing-star') flat += shieldBonusArm(state, b, tgt.id)
    // Incite: +2 on damage rolls against enemies within 10" of its caster
    const inc = isMenoth(b, at) ? inciteFor(state, at.owner) : undefined
    const caster = inc?.casterId ? state.models[inc.casterId] : undefined
    if (inc && liveOnTable(caster) && within(caster, tgt, 10)) flat += 2
    // Stir the Blood: +2 on the next melee damage roll this turn
    if (isMeleeKind(atk.kind) && stirOn(state, at.id)) flat += 2
    return flat
  },
  onResolved(state, b, atk) {
    let s = state
    const events: GameEvent[] = []
    const at = s.models[atk.attackerId]
    if (!at) return { state, events }
    // Stir the Blood is spent by the melee attack that made a damage roll
    if (isMeleeKind(atk.kind) && atk.x.jobs.some((j) => j.kind === 'direct' && j.targetId)) {
      const e = stirOn(s, at.id)
      if (e) {
        const rest = e.targetIds.filter((t) => t !== at.id)
        if (rest.length) s = { ...s, effects: s.effects.map((x) => (x.id === e.id ? { ...x, targetIds: rest } : x)) }
        else { const r = removeEffect(s, e.id, 'replaced'); s = r.state; events.push(...r.events) }
      }
    }
    // Convection: a living enemy destroyed by the spell gives a warjack in the caster's CTRL a focus
    if (atk.spellId === 'men.s.convection' && atk.x.destroyed.some((id) => isLiving(s, b, id) && s.models[id]!.owner !== at.owner)) {
      const ctrl = statOf(s, b, at.id, 'CTRL')
      const jack = Object.values(s.models)
        .filter((m) => m.owner === at.owner && m.type === 'warEngine' && liveOnTable(m) && !m.inert && modelDistance(at, m) <= ctrl + 1e-6 && m.focus < 3)
        .sort((x, y) => x.id.localeCompare(y.id))[0]
      if (jack) { const g = gainFocus(s, jack.id, 1, 'gain', at.id); s = g.state; events.push(...g.events) }
    }
    return { state: s, events }
  },
}]

