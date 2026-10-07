// Circle Orboros (Devourer's Host, Tanith) code hooks: every {code} this faction's data references (docs/spec/factions/circle.md).
// Hook names are prefixed `cir` because the registry is one flat namespace shared by every faction.
// Data codes: cirWraithbane, cirWraithbaneWeapons, cirControlledWarping, cirWarpGhostly, cirRegeneration, cirBloodRage,
// cirMeatForTheBeast, cirDeathFeast, cirDeathPowered, cirRapidHealing, cirTreewalkerDef, cirCriticalConsume, cirShifter,
// cirBloodReaper, cirGrievousWounds, cirRitesOfTheWurm, cirVitalMagic, cirAdmonition, cirAffliction, cirRift,
// cirScythingTouch, cirVeilOfMists.
// Plain helpers at the bottom (circleSpellCost, scythingTouchArmPenalty, ...) are the seams core calls (spells.ts, code-hooks.ts statOf,
// activation.ts); the data `verify` strings say where.
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import { applyDamage, healDamage, type GridLayout } from '../damage'
import { rollD3 } from '../dice'
import { applyEffect, effectsOn, removeEffect } from '../effects'
import type { GameEvent } from '../events'
import { baseRadius, dist, fromAngle, angleOf, sub, isLegalPlacement, isOnTable } from '../geometry'
import { inCtrl, modelDistance } from '../measure'
import { movedEvent, relocate } from '../movement'
import { circleInsideShape, effectiveType, terrainPieces } from '../terrain'
import { abilitiesOf, actOf, atkOf, envOf, hasFlag, noop, prof, setAtk, setModel, statOf, type AtkCtx, type AttackPlugin } from '../code-hooks'
import { force } from '../fury'
import type { DataBundle, EffectInstance, GameState, Id, ModelId, ModelState } from '../types'

export const CORPSE_CAP = 3
const WARP_IDS = ['cir.a.warp-ghostly', 'cir.a.warp-spell-ward', 'cir.a.warp-strength'] as const
type Warp = 'ghostly' | 'spellWard' | 'strength'
const WARP_SOURCE: Record<Warp, string> = { ghostly: WARP_IDS[0], spellWard: WARP_IDS[1], strength: WARP_IDS[2] }
const WARP_NAME: Record<Warp, string> = { ghostly: 'Warp: Ghostly', spellWard: 'Warp: Spell Ward', strength: 'Warp: Strength' }

// ---------- small helpers ----------
const corpses = (m: ModelState | undefined): number => m?.tokens?.corpse ?? 0
const has = (state: GameState, b: DataBundle, id: ModelId, abilityId: Id): boolean => abilitiesOf(state, b, id).includes(abilityId)
const rollD3Value = (state: GameState): { state: GameState; events: GameEvent[]; value: number } => {
  const r = rollD3(state)
  return { state: r.state, events: [r.event], value: r.value }
}

/** Damage layout of a model for healing: spirals use lowercase aspect letters (81 B.2); single tracks have none. */
export function layoutFor(b: DataBundle, m: ModelState): GridLayout[] | undefined {
  const d = prof(b, m).damage as { track: string; columns?: string[]; branches?: string[] } | undefined
  if (d?.track === 'spiral' && d.branches) return [{ id: 'main', columns: d.branches.map((x) => x.toLowerCase()), spiral: true }]
  if (d?.track === 'grid' && d.columns) return [{ id: 'main', columns: d.columns }]
  return undefined
}
export function markedBoxes(m: ModelState): number {
  if (m.damage.track === 'single') return m.damage.filled
  return m.damage.grids.reduce((a, g) => a + g.cols.reduce((c, col) => c + col.filter(Boolean).length, 0), 0)
}

function addCorpse(state: GameState, id: ModelId, n: number, fromId?: ModelId): { state: GameState; events: GameEvent[]; gained: number } {
  const m = state.models[id]
  if (!m) return { state, events: [], gained: 0 }
  const have = corpses(m)
  const gained = Math.max(0, Math.min(CORPSE_CAP - have, n))
  if (gained === 0) return { state, events: [], gained: 0 }
  const after = have + gained
  return { state: setModel(state, { ...m, tokens: { ...m.tokens, corpse: after } }), events: [{ type: 'TokenGained', modelId: id, token: 'corpse', count: gained, after, fromId }], gained }
}
function spendCorpse(state: GameState, id: ModelId, n: number, sourceId?: Id): { state: GameState; events: GameEvent[]; spent: number } {
  const m = state.models[id]
  const have = corpses(m)
  const spent = Math.min(have, Math.max(0, n))
  if (!m || spent === 0) return { state, events: [], spent: 0 }
  const after = have - spent
  return { state: setModel(state, { ...m, tokens: { ...m.tokens, corpse: after } }), events: [{ type: 'TokenSpent', modelId: id, token: 'corpse', count: spent, after, sourceId }], spent }
}
function healPoints(state: GameState, b: DataBundle, id: ModelId, n: number): { state: GameState; events: GameEvent[]; healed: number } {
  const m = state.models[id]
  if (!m || n <= 0 || noHealing(state, id)) return { state, events: [], healed: 0 }
  const before = markedBoxes(m)
  if (before === 0) return { state, events: [], healed: 0 }
  const r = healDamage(state, id, Math.min(n, before), layoutFor(b, m))
  return { state: r.state, events: r.events, healed: r.boxes.length }
}

/** Grievous Wounds: an active effect that forbids healing on the model (healDamage and rollTough read it too). */
export const noHealing = (state: GameState, id: ModelId): boolean => effectsOn(state, id).some((e) => e.forbid?.includes('heal'))

// ---------- hooks ----------
/** Wraithbane Weapons (rider on every Circle model): while the animus is on the attacker, its attack is Blessed. */
const wraithbaneWeapons = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || a.attackerId !== c.selfId) return noop(c)
  if (!effectsOn(c.state, c.selfId).some((e) => e.sourceId === 'cir.s.wraithbane')) return noop(c)
  return { state: setAtk(c.state, { ...a, x: { ...a.x, blessed: true } }), events: [] }
}
/** Wraithbane's second half: weapons of the model it is on deal magical damage (read by the attack pipeline). */
export const wraithbaneOn = (state: GameState, attackerId: ModelId): boolean => effectsOn(state, attackerId).some((e) => e.sourceId === 'cir.s.wraithbane')

/** Wraithbane itself: the spell machinery creates the named effect; nothing else to do. */
const marker = (c: HookContext): HookResult => noop(c)

/** Controlled Warping: pick one warp for the round (params.choice; a frenzied model must take strength). Default: strength. */
const controlledWarping = (c: HookContext, params: Record<string, unknown> = {}): HookResult => {
  const m = c.state.models[c.selfId]
  if (!m) return noop(c)
  const wanted = (params.choice ?? c.params?.choice) as Warp | undefined
  const choice: Warp = m.frenzied ? 'strength' : wanted === 'ghostly' || wanted === 'spellWard' || wanted === 'strength' ? wanted : 'strength'
  return setWarp(c.state, c.selfId, choice)
}
export function setWarp(state: GameState, id: ModelId, choice: Warp): HookResult {
  const m = state.models[id]
  if (!m) return { state, events: [] }
  let s = state
  const events: GameEvent[] = []
  for (const e of effectsOn(s, id).filter((x) => (WARP_IDS as readonly string[]).includes(x.sourceId))) {
    const r = removeEffect(s, e.id, 'replaced'); s = r.state; events.push(...r.events)
  }
  const made = applyEffect(s, {
    sourceId: WARP_SOURCE[choice], name: WARP_NAME[choice], owner: m.owner, casterId: id, targetIds: [id], mods: [],
    ...(choice === 'spellWard' ? { forbid: ['beTargetedBySpell'] } : {}), duration: 'round',
  })
  return { state: made.state, events: [...events, ...made.events] }
}
/** The warp a model is under: an explicit pick, or Strength by default while it has Controlled Warping. */
export function activeWarp(state: GameState, b: DataBundle, id: ModelId): Warp | null {
  if (!has(state, b, id, 'cir.a.controlled-warping')) return null
  const e = effectsOn(state, id).find((x) => (WARP_IDS as readonly string[]).includes(x.sourceId))
  if (!e) return 'strength'
  return e.sourceId === WARP_IDS[0] ? 'ghostly' : e.sourceId === WARP_IDS[1] ? 'spellWard' : 'strength'
}

/** Regeneration [d3]: force 1 fury, heal d3, once per activation, not after running. */
const regeneration = (c: HookContext): HookResult => {
  const b = envOf(c).bundle
  const m = c.state.models[c.selfId]
  const act = actOf(c.state)
  const limit = 'cir.a.regeneration:oncePerActivation'
  if (!m || act?.ran || act?.limitsUsed.includes(limit) || markedBoxes(m) === 0 || noHealing(c.state, m.id)) return noop(c)
  const f = force(c.state, b, m.id, 1, 'ability')
  if ('rejection' in f) return noop(c)
  let s = f.state
  const events = [...f.events]
  const d = rollD3Value(s); s = d.state; events.push(...d.events)
  const h = healPoints(s, b, m.id, d.value); s = h.state; events.push(...h.events)
  const act2 = actOf(s)
  if (act2) s = { ...s, activation: { ...act2, limitsUsed: [...act2.limitsUsed, limit] } as typeof s.activation }
  return { state: s, events }
}

/** Blood Rage: spend corpse tokens for extra melee attacks (params.count, default all). Recorded in the activation scratch. */
const bloodRage = (c: HookContext): HookResult => {
  const m = c.state.models[c.selfId]
  const act = actOf(c.state)
  if (!m || !act) return noop(c)
  const want = typeof c.params?.count === 'number' ? (c.params.count as number) : corpses(m)
  const sp = spendCorpse(c.state, m.id, want, 'cir.a.blood-rage')
  if (!sp.spent) return noop(c)
  const x = act.x as unknown as Record<string, unknown>
  const prev = ((x.extraMelee as Record<string, number> | undefined) ?? {})
  const next = { ...act, x: { ...act.x, extraMelee: { ...prev, [m.id]: (prev[m.id] ?? 0) + sp.spent } } }
  return { state: { ...sp.state, activation: next as unknown as typeof sp.state.activation }, events: sp.events }
}

/**
 * Meat for the Beast: spend one corpse token to boost a roll. The windows are mandatory, so the choice is automatic:
 * the attack roll only when holding the cap (a full pile is wasted otherwise), the damage roll on any direct hit.
 */
const meatForTheBeast = (c: HookContext, params: Record<string, unknown> = {}): HookResult => {
  const roll = (params.roll ?? c.params?.roll) as 'attack' | 'damage' | undefined
  const m = c.state.models[c.selfId]
  const a = atkOf(c.state)
  if (!m || !a || corpses(m) < 1 || a.attackerId !== m.id) return noop(c)
  if (roll === 'attack') {
    if (a.x.boosted || corpses(m) < CORPSE_CAP) return noop(c)
    const sp = spendCorpse(c.state, m.id, 1, 'cir.a.meat-for-the-beast')
    const a2 = atkOf(sp.state)!
    return { state: setAtk(sp.state, { ...a2, x: { ...a2.x, boosted: true } }), events: sp.events }
  }
  if (!a.x.cur || a.x.cur.boost) return noop(c)
  const job = a.x.jobs[a.x.jobIdx]
  if (job && job.kind !== 'direct') return noop(c)
  const sp = spendCorpse(c.state, m.id, 1, 'cir.a.meat-for-the-beast')
  const a2 = atkOf(sp.state)!
  return { state: setAtk(sp.state, { ...a2, x: { ...a2.x, cur: { ...a2.x.cur!, boost: true } } }), events: sp.events }
}

/** Death Feast: at activation start spend tokens, d3 healed each, while the model is damaged. */
const deathFeast = (c: HookContext): HookResult => {
  const b = envOf(c).bundle
  let s = c.state
  const events: GameEvent[] = []
  while (corpses(s.models[c.selfId]) > 0 && markedBoxes(s.models[c.selfId]!) > 0 && !noHealing(s, c.selfId)) {
    const sp = spendCorpse(s, c.selfId, 1, 'cir.a.death-feast'); s = sp.state; events.push(...sp.events)
    const d = rollD3Value(s); s = d.state; events.push(...d.events)
    const h = healPoints(s, b, c.selfId, d.value); s = h.state; events.push(...h.events)
  }
  return { state: s, events }
}

/** Rapid Healing: after an enemy attack that damaged this model, heal d3 (a hit that left damage marked counts as damaged). */
const rapidHealing = (c: HookContext): HookResult => {
  const b = envOf(c).bundle
  const m = c.state.models[c.selfId]
  if (!m || !isOnTable(m) || markedBoxes(m) === 0) return noop(c)
  const d = rollD3Value(c.state)
  const h = healPoints(d.state, b, m.id, d.value)
  return { state: h.state, events: [...d.events, ...h.events] }
}

/** Critical Consume (attack.crit; the data `when` limits it to small bases that are not Leaders): remove the target from play. */
const criticalConsume = (c: HookContext): HookResult => {
  const t = c.targetId ? c.state.models[c.targetId] : undefined
  if (!t || t.life !== 'active' || t.offTable) return noop(c)
  const s = setModel(c.state, { ...t, life: 'boxed' })
  return {
    state: s,
    events: [
      { type: 'LifeStateChanged', modelId: t.id, from: 'active', to: 'boxed', cause: 'cir.a.critical-consume' },
      { type: 'ModelRemoved', modelId: t.id, reason: 'removedFromPlay' },
    ],
  }
}

/** Shifter (attack.resolved, on a hit): place the attacker base to base with the model hit, nearest legal spot. */
const shifter = (c: HookContext): HookResult => {
  const me = c.state.models[c.selfId]
  const tid = c.targetId ?? atkOf(c.state)?.targetId
  const t = tid ? c.state.models[tid] : undefined
  if (!me || !t || !isOnTable(me) || !isOnTable(t) || me.id === t.id) return noop(c)
  if (modelDistance(me, t) <= 0.01) return noop(c)
  const R = baseRadius(me.base) + baseRadius(t.base) + 0.001
  const home = angleOf(sub(me.pos, t.pos))
  for (let i = 0; i < 24; i++) {
    const off = Math.ceil(i / 2) * (Math.PI / 12) * (i % 2 === 0 ? 1 : -1)
    const v = fromAngle(home + off, R)
    const pos = { x: t.pos.x + v.x, z: t.pos.z + v.z }
    if (!isLegalPlacement(c.state, me.id, pos, me.base).ok) continue
    const s = relocate(c.state, me.id, pos)
    return { state: s, events: [movedEvent(me.id, 'place', me.pos, pos, [pos], s.models[me.id]!.elev, 'cir.a.shifter')] }
  }
  return noop(c)
}

/** Grievous Wounds (attack.hit): the model hit cannot be healed for a round. (The Tough denial is the `forbid tough` op.) */
const grievousWounds = (c: HookContext): HookResult => {
  const t = c.targetId ? c.state.models[c.targetId] : undefined
  const me = c.state.models[c.selfId]
  if (!t || !me) return noop(c)
  const r = applyEffect(c.state, { sourceId: 'cir.a.grievous-wounds', name: 'Grievous Wounds', owner: me.owner, casterId: me.id, targetIds: [t.id], mods: [], forbid: ['heal', 'tough'], duration: 'round' })
  return { state: r.state, events: r.events }
}

/**
 * Rift (spell hit): the 3 inch area round the model hit becomes rough ground until the round ends. A temporary rough terrain piece
 * (props.tempRound; housekeeping removes it once the round has passed).
 */
const rift = (c: HookContext): HookResult => {
  const t = c.targetId ? c.state.models[c.targetId] : undefined
  if (!t) return noop(c)
  const n = c.state.terrain.filter((x) => x.props.rift).length + 1
  const piece = { id: `rift:${c.state.round}.${n}`, pieceId: 'terrain.rift', rulesType: 'rough' as const, pos: { ...t.pos }, rot: 0, footprint: { circle: { r: 1.5 } }, height: 0.1, props: { rift: true, tempRound: c.state.round } }
  return { state: { ...c.state, terrain: [...c.state.terrain, piece] }, events: [] }
}

/** Blood Reaper: marker; the multi-target melee attack needs core support (rollTargets already allows several). */
const bloodReaper = (c: HookContext): HookResult => marker(c)

/** Rites of the Wurm: the feat's turn-long effect is made by useFeat; the cost rule and channelers are the helpers below. */
const ritesOfTheWurm = (c: HookContext): HookResult => marker(c)

/** Vital Magic: marker for the optional trigger; use vitalMagicOffer / vitalMagicKeep from the fury upkeep step. */
const vitalMagic = (c: HookContext): HookResult => marker(c)

/** Veil of Mists: place the 3 inch cloud toward the nearest enemy inside CTRL, tied to the spell's effect so it ends with it. */
const veilOfMists = (c: HookContext): HookResult => {
  const b = envOf(c).bundle
  const me = c.state.models[c.selfId]
  if (!me) return noop(c)
  const eff = c.state.effects.find((e) => e.sourceId === 'cir.s.veil-of-mists' && e.casterId === me.id)
  if (!eff) return noop(c)
  const ctrl = statOf(c.state, b, me.id, 'CTRL')
  const enemies = Object.values(c.state.models).filter((m) => m.owner !== me.owner && isOnTable(m)).sort((x, y) => dist(x.pos, me.pos) - dist(y.pos, me.pos))
  const toward = enemies[0] ? angleOf(sub(enemies[0].pos, me.pos)) : 0
  const reach = Math.max(0, Math.min(ctrl - 1.5 + baseRadius(me.base), 6))
  const v = fromAngle(toward, reach)
  const pos = { x: me.pos.x + v.x, z: me.pos.z + v.z }
  const id = `cl:${c.state.effectSeq + c.state.clouds.length + 1}`
  // blocks LOS for everyone but the caster's side, which sees through it (friendlyTransparent, read by los.ts)
  const cloud = { id, pos, diameter: 3, owner: me.owner, effectId: eff.id, kind: 'cloud' as const, blocksLos: true, friendlyTransparent: true } as GameState['clouds'][number]
  return { state: { ...c.state, effectSeq: c.state.effectSeq + 1, clouds: [...c.state.clouds, cloud] }, events: [{ type: 'CloudCreated', cloudId: id, pos, diameter: 3, owner: me.owner }] }
}

export const circleHooks: CodeHookRegistry = {
  conditions: {},
  effects: {
    cirWraithbane: marker, cirWraithbaneWeapons: wraithbaneWeapons, cirControlledWarping: controlledWarping, cirWarpGhostly: marker,
    cirRegeneration: regeneration, cirBloodRage: bloodRage, cirMeatForTheBeast: meatForTheBeast, cirDeathFeast: deathFeast,
    cirDeathPowered: marker, cirRapidHealing: rapidHealing, cirTreewalkerDef: marker, cirCriticalConsume: criticalConsume,
    cirShifter: shifter, cirBloodReaper: bloodReaper, cirGrievousWounds: grievousWounds, cirRitesOfTheWurm: ritesOfTheWurm,
    cirVitalMagic: vitalMagic, cirAdmonition: marker, cirAffliction: marker, cirRift: rift, cirScythingTouch: marker,
    cirVeilOfMists: veilOfMists,
  },
}

// ---------- attack plugins ----------
/** Body Snatcher: a melee kill by a holder of the ability takes the victim's corpse token (cap 3). */
const bodySnatcher: AttackPlugin = {
  id: 'cir.body-snatcher',
  onResolved(state, b, atk) {
    const me = state.models[atk.attackerId]
    if (!me || (atk.kind !== 'melee' && atk.kind !== 'power') || !has(state, b, me.id, 'cir.a.body-snatcher')) return { state, events: [] }
    let s = state
    const events: GameEvent[] = []
    for (const id of atk.x.destroyed) {
      const t = s.models[id]
      if (!t || t.owner === me.owner || t.type === 'warEngine' || t.type === 'battleEngine' || t.type === 'structure' || hasFlag(s, b, id, 'construct')) continue
      const r = addCorpse(s, me.id, 1, id); s = r.state; events.push(...r.events)
    }
    return { state: s, events }
  },
}

/** Flat melee damage: Death-Powered (+1 per token) and Warp: Strength (+2; the default warp of a Pureblood). */
const meleeBonuses: AttackPlugin = {
  id: 'cir.melee-bonuses',
  damageFlat(state, b, atk: AtkCtx) {
    if (atk.kind !== 'melee' && atk.kind !== 'power') return 0
    const me = state.models[atk.attackerId]
    if (!me) return 0
    let n = 0
    if (has(state, b, me.id, 'cir.a.death-powered')) n += corpses(me)
    if (activeWarp(state, b, me.id) === 'strength') n += 2
    return n
  },
}

export const circlePlugins: AttackPlugin[] = [bodySnatcher, meleeBonuses]

// ---------- seams for core (pure, tested; called from core) ----------
/** Death-Powered ARM bonus: +1 per corpse token. statOf should add it. */
export const deathPoweredArm = (state: GameState, b: DataBundle, id: ModelId): number =>
  has(state, b, id, 'cir.a.death-powered') ? corpses(state.models[id]) : 0

/** Treewalker DEF bonus: +2 against melee while completely inside a forest. defFor should add it. */
export function treewalkerDefBonus(state: GameState, b: DataBundle, id: ModelId, attackKind: string): number {
  const m = state.models[id]
  if (!m || (attackKind !== 'melee' && attackKind !== 'power') || !has(state, b, id, 'cir.a.treewalker')) return 0
  const r = baseRadius(m.base)
  return terrainPieces(state).some((p) => effectiveType(p.t) === 'forest' && circleInsideShape(m.pos, r, p.shape)) ? 2 : 0
}

/** Scything Touch: enemies within 2" of a model carrying the shroud get -2 ARM (returns 0 or -2; the shroud never stacks). */
export function scythingTouchArmPenalty(state: GameState, id: ModelId): number {
  const me = state.models[id]
  if (!me || !isOnTable(me)) return 0
  for (const e of state.effects) {
    if (e.sourceId !== 'cir.s.scything-touch' || e.owner === me.owner) continue
    for (const tid of e.targetIds) {
      const carrier = state.models[tid]
      if (carrier && isOnTable(carrier) && modelDistance(carrier, me) <= 2 + 1e-6) return -2
    }
  }
  return 0
}

/** Affliction: a direct-hit damage roll that fails to beat ARM still deals 1 when the target is afflicted. */
export function afflictionFloor(state: GameState, targetId: ModelId, points: number, direct: boolean): number {
  if (!direct || points > 0) return points
  return effectsOn(state, targetId).some((e) => e.sourceId === 'cir.s.affliction') ? 1 : points
}

/** Admonition: wards on friendly models within 6" of an enemy that just ended a move (or was placed). The ward then ends. */
export function admonitionReady(state: GameState, movedEnemyId: ModelId): { effectId: string; modelId: ModelId }[] {
  const mover = state.models[movedEnemyId]
  if (!mover || !isOnTable(mover)) return []
  const out: { effectId: string; modelId: ModelId }[] = []
  for (const e of state.effects) {
    if (e.sourceId !== 'cir.s.admonition' || e.owner === mover.owner) continue
    for (const tid of e.targetIds) {
      const w = state.models[tid]
      if (w && isOnTable(w) && w.life === 'active' && modelDistance(w, mover) <= 6 + 1e-6) out.push({ effectId: e.id, modelId: tid })
    }
  }
  return out
}

const featOn = (state: GameState, casterId: ModelId): boolean => effectsOn(state, casterId).some((e) => e.sourceId === 'cir.f.rites-of-the-wurm')
const controllerOfBeast = (state: GameState, m: ModelState): ModelState | undefined => (m.controllerId ? state.models[m.controllerId] : undefined)

/** Rites of the Wurm: beasts of her battlegroup in her CTRL can channel her spells while the feat lasts. */
export function ritesChannelers(state: GameState, b: DataBundle, casterId: ModelId): ModelId[] {
  const w = state.models[casterId]
  if (!w || !featOn(state, casterId)) return []
  const ctrl = statOf(state, b, casterId, 'CTRL')
  return Object.values(state.models).filter((m) => m.type === 'beast' && m.controllerId === casterId && !m.wild && isOnTable(m) && inCtrl(w, m, ctrl)).map((m) => m.id)
}

/**
 * Spell cost under Rites of the Wurm: her own spells cost 1 less (never below 1); an animus cast by one of her beasts in her
 * CTRL costs 1 less (never below 0). `casterId` is the model paying. Returns the base cost when the feat is off.
 */
export function circleSpellCost(state: GameState, b: DataBundle, casterId: ModelId, spellId: Id, base: number): number {
  const caster = state.models[casterId]
  if (!caster) return base
  const isAnimus = !!(b.byId[spellId] as { animus?: boolean } | undefined)?.animus
  if (caster.type === 'leader' && featOn(state, casterId)) return Math.max(1, base - 1)
  if (caster.type === 'beast' && isAnimus) {
    const w = controllerOfBeast(state, caster)
    if (w && featOn(state, w.id) && inCtrl(w, caster, statOf(state, b, w.id, 'CTRL'))) return Math.max(0, base - 1)
  }
  return base
}
/** A warlock casting a beast's animus under Rites pays 1 less too (never below 0). */
export function circleAnimusCostForWarlock(state: GameState, b: DataBundle, warlockId: ModelId, base: number): number {
  void b
  return featOn(state, warlockId) ? Math.max(1, base - 1) : base
}

/** Tanith's and Nekane's Vital Magic are the same rule. */
const hasVitalMagic = (state: GameState, b: DataBundle, id: ModelId): boolean => has(state, b, id, 'cir.a.vital-magic') || has(state, b, id, 'cry.a.vital-magic')

/** Vital Magic: which upkeep effects the warlock may keep when a forced expiry would end them. */
export function vitalMagicOffer(state: GameState, b: DataBundle, casterId: ModelId, expiring: string[]): string[] {
  if (!hasVitalMagic(state, b, casterId)) return []
  return expiring.filter((id) => state.effects.some((e: EffectInstance) => e.id === id && e.casterId === casterId))
}
/** Keep one expiring upkeep: the caster takes d3 damage (not transferable). Returns whether it survived the damage. */
export function vitalMagicKeep(state: GameState, b: DataBundle, casterId: ModelId): { state: GameState; events: GameEvent[]; points: number } {
  const m = state.models[casterId]
  if (!m || !hasVitalMagic(state, b, casterId)) return { state, events: [], points: 0 }
  const d = rollD3Value(state)
  const ap = applyDamage(d.state, casterId, d.value, { layouts: layoutFor(b, m), source: 'other' })
  return { state: ap.state, events: [...d.events, ...ap.events], points: d.value }
}
