// Circle Orboros (Devourer's Host, Tanith) code hooks: every {code} this faction's data references (docs/spec/factions/circle.md).
// Hook names are prefixed `cir` because the registry is one flat namespace shared by every faction.
// Data codes: cirWraithbane, cirWraithbaneWeapons, cirControlledWarping, cirWarpGhostly, cirRegeneration, cirBloodRage,
// cirMeatForTheBeast, cirDeathFeast, cirDeathPowered, cirRapidHealing, cirTreewalkerDef, cirCriticalConsume, cirShifter,
// cirBloodReaper, cirGrievousWounds, cirRitesOfTheWurm, cirVitalMagic, cirAdmonition, cirAffliction, cirRift,
// cirScythingTouch, cirVeilOfMists. Skirmish (WP-D-cir) adds cirUnyielding, cirChainLightning, cirHuntersGrace, cirSkyShaker, cirDopplerBark.
// Plain helpers at the bottom (circleSpellCost, scythingTouchArmPenalty, ...) are the seams core calls (spells.ts, code-hooks.ts statOf,
// activation.ts); the data `verify` strings say where.
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import { applyDamage, healDamage, resolveDeath, type GridLayout } from '../damage'
import { rollD3, rollNd6 } from '../dice'
import { applyEffect, effectsOn, removeEffect } from '../effects'
import type { GameEvent } from '../events'
import { baseRadius, dist, fromAngle, angleOf, sub, isLegalPlacement, isOnTable } from '../geometry'
import { inCtrl, modelDistance } from '../measure'
import { movedEvent, relocate } from '../movement'
import { circleInsideShape, effectiveType, terrainPieces } from '../terrain'
import { abilitiesOf, actOf, armOf, atkOf, envOf, hasFlag, isLivingModel, lookups, noop, prof, resistsDamageType, setAtk, setModel, statOf, type AtkCtx, type AttackPlugin } from '../code-hooks'
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

/** Controlled Warping: apply the warp picked at activation.start (params.choice, from the abilityChoice); a frenzied model must take strength. No pick, no warp. */
const controlledWarping = (c: HookContext, params: Record<string, unknown> = {}): HookResult => {
  const m = c.state.models[c.selfId]
  if (!m) return noop(c)
  const wanted = (params.choice ?? c.params?.choice) as Warp | undefined
  const choice: Warp | null = m.frenzied ? 'strength' : wanted === 'ghostly' || wanted === 'spellWard' || wanted === 'strength' ? wanted : null
  return choice ? setWarp(c.state, c.selfId, choice) : noop(c)
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
/** The warp a model is under: the one picked at its activation this round; null before it has picked (there is no default). */
export function activeWarp(state: GameState, b: DataBundle, id: ModelId): Warp | null {
  if (!has(state, b, id, 'cir.a.controlled-warping')) return null
  const e = effectsOn(state, id).find((x) => (WARP_IDS as readonly string[]).includes(x.sourceId))
  if (!e) return null
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

/** Rapid Healing: after an enemy attack that damaged this model (applyJob logs it in flags.damagedIds), heal d3. A hit that dealt 0 does not count. */
const rapidHealing = (c: HookContext): HookResult => {
  const b = envOf(c).bundle
  const m = c.state.models[c.selfId]
  const a = atkOf(c.state)
  if (!m || !isOnTable(m) || markedBoxes(m) === 0) return noop(c)
  if (!a || !((a.x.flags.damagedIds as string[] | undefined) ?? []).includes(m.id)) return noop(c)
  const d = rollD3Value(c.state)
  const h = healPoints(d.state, b, m.id, d.value)
  return { state: h.state, events: [...d.events, ...h.events] }
}

/**
 * Affliction (spell hit): the model hit gets the upkeep effect -2 DEF; afflictionFloor() reads it in the damage roll. The card allows a
 * model or a unit: when the model hit belongs to a unit the effect lands on every on-table model of that unit (one effect, one upkeep);
 * any other model gets it alone. One casting per caster (a new hit moves it), and the effect is registered as the targets' enemy upkeep
 * so the Control Phase asks the caster to pay for it once.
 */
const affliction = (c: HookContext): HookResult => {
  const caster = c.state.models[c.selfId]
  const t = c.targetId ? c.state.models[c.targetId] : undefined
  if (!caster || !t || t.owner === caster.owner || !isOnTable(t)) return noop(c)
  let s = c.state
  const events: GameEvent[] = []
  for (const e of s.effects.filter((x) => x.sourceId === 'cir.s.affliction' && x.casterId === caster.id)) { const r = removeEffect(s, e.id, 'replaced'); s = r.state; events.push(...r.events) }
  const ids = t.unitId
    ? Object.values(s.models).filter((m) => m.unitId === t.unitId && m.owner === t.owner && isOnTable(m) && m.life === 'active').map((m) => m.id)
    : [t.id]
  if (!ids.includes(t.id)) ids.push(t.id)
  const made = applyEffect(s, {
    sourceId: 'cir.s.affliction', name: 'Affliction', owner: caster.owner, casterId: caster.id, targetIds: ids,
    mods: [{ stat: 'DEF', value: -2, mode: 'add' }], duration: 'upkeep', upkeep: { casterId: caster.id },
  })
  s = made.state; events.push(...made.events)
  const ups = { ...s.upkeeps }
  for (const id of ids) ups[id] = { ...ups[id], enemy: made.effect.id }
  return { state: { ...s, upkeeps: ups }, events }
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

// ---------- Skirmish additions (WP-D-cir): Wolf Riders, Ravager Shaman, Wild Argus ----------
const keywordsOf = (b: DataBundle, m: ModelState): string[] => (prof(b, m).keywords ?? []) as string[]
const nearAlive = (state: GameState, me: ModelState, m: ModelState, d: number): boolean => isOnTable(m) && m.life === 'active' && modelDistance(me, m) <= d + 1e-6

/** Doppler Bark (animus): living and undead enemy models within 2" of the caster drop to base DEF 5 and cannot run, charge, slam or trample for a round. */
const dopplerBark = (c: HookContext): HookResult => {
  const b = envOf(c).bundle
  const me = c.state.models[c.selfId]
  if (!me || !isOnTable(me)) return noop(c)
  const ids = Object.values(c.state.models)
    .filter((m) => m.owner !== me.owner && nearAlive(c.state, me, m, 2) && (isLivingModel(c.state, b, m.id) || keywordsOf(b, m).includes('undead')))
    .map((m) => m.id)
  if (!ids.length) return noop(c)
  const r = applyEffect(c.state, {
    sourceId: 'cir.s.doppler-bark', name: 'Doppler Bark', owner: me.owner, casterId: me.id, targetIds: ids,
    mods: [{ stat: 'DEF', value: 5, mode: 'set' }], forbid: ['run', 'charge', 'slam', 'trample'], duration: 'round',
  })
  return { state: r.state, events: r.events }
}

/** Hunter's Grace (action): Tharn models of the user's side within 5" (itself included) cannot be knocked down for a round. Fixed when used. */
const huntersGrace = (c: HookContext): HookResult => {
  const b = envOf(c).bundle
  const me = c.state.models[c.selfId]
  if (!me || !isOnTable(me)) return noop(c)
  const ids = Object.values(c.state.models).filter((m) => m.owner === me.owner && nearAlive(c.state, me, m, 5) && keywordsOf(b, m).includes('tharn')).map((m) => m.id)
  if (!ids.length) return noop(c)
  const r = applyEffect(c.state, { sourceId: 'cir.a.hunters-grace', name: "Hunter's Grace", owner: me.owner, casterId: me.id, targetIds: ids, mods: [], forbid: ['knockDown'], duration: 'round' })
  return { state: r.state, events: r.events }
}

/**
 * Sky Shaker (action): the user gains Warping Winds for a round. That one effect is all there is: the -3 RNG (weaponRangeFor, warpingWindsRngPenalty) and the
 * Resistance: Blast of the Faction models of its side within 3" (resistsDamageType, warpingWindsBlastResist) read it live as the models move.
 */
const skyShaker = (c: HookContext): HookResult => {
  const b = envOf(c).bundle
  const me = c.state.models[c.selfId]
  if (!me || !isOnTable(me)) return noop(c)
  void b
  const w = applyEffect(c.state, { sourceId: 'cir.a.sky-shaker', name: 'Warping Winds', owner: me.owner, casterId: me.id, targetIds: [me.id], mods: [], duration: 'round' })
  return { state: w.state, events: w.events }
}

export const circleHooks: CodeHookRegistry = {
  conditions: {},
  effects: {
    cirWraithbane: marker, cirWraithbaneWeapons: wraithbaneWeapons, cirControlledWarping: controlledWarping, cirWarpGhostly: marker,
    cirRegeneration: regeneration, cirBloodRage: bloodRage, cirMeatForTheBeast: meatForTheBeast, cirDeathFeast: deathFeast,
    cirDeathPowered: marker, cirRapidHealing: rapidHealing, cirTreewalkerDef: marker, cirCriticalConsume: criticalConsume,
    cirShifter: shifter, cirBloodReaper: bloodReaper, cirGrievousWounds: grievousWounds, cirRitesOfTheWurm: ritesOfTheWurm,
    cirVitalMagic: vitalMagic, cirAdmonition: marker, cirAffliction: affliction, cirRift: rift, cirScythingTouch: marker,
    cirVeilOfMists: veilOfMists, cirUnyielding: marker, cirChainLightning: marker, cirHuntersGrace: huntersGrace, cirSkyShaker: skyShaker,
    cirDopplerBark: dopplerBark,
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

/** Flat melee damage: Death-Powered (+1 per token) and Warp: Strength (+2, only once Strength is the picked warp). */
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

/**
 * Unyielding (Wolf Riders): +2 ARM against melee damage rolls, done as 2 fewer points on a melee or power-attack roll (the same number once
 * ARM is taken off). Affliction's one-point floor is applied again afterwards.
 */
const unyielding: AttackPlugin = {
  id: 'cir.unyielding',
  adjustPoints(state, b, atk, job, points) {
    if ((atk.kind !== 'melee' && atk.kind !== 'power') || !has(state, b, job.targetId, 'cir.a.unyielding')) return null
    const next = afflictionFloor(state, job.targetId, Math.max(0, points - 2), job.kind === 'direct')
    return next === points ? null : { state, events: [], points: next }
  },
}

/** The nearest model (base edge to base edge) within 3" of `from` that the lightning has not touched; ties go to the lower id. */
function nextArc(state: GameState, from: ModelState, used: Set<ModelId>): ModelState | undefined {
  return Object.values(state.models)
    .filter((m) => !used.has(m.id) && m.life === 'active' && isOnTable(m) && modelDistance(from, m) <= 3 + 1e-6)
    .sort((x, y) => modelDistance(from, x) - modelDistance(from, y) || (x.id < y.id ? -1 : 1))[0]
}
/**
 * Chain Lightning (Ravager Shaman): once the star attack has hit and everything is applied, the lightning arcs from the model hit to d3 more
 * models, each the nearest one not yet touched within 3" of the last (the Shaman is skipped, friends are not). Each arc is a POW 10
 * electrical damage roll that is not an attack: 2d6 + 10 against ARM, one die fewer when the model resists electricity.
 */
const chainLightning: AttackPlugin = {
  id: 'cir.chain-lightning',
  onResolved(state, b, atk) {
    const origin = state.models[atk.targetId]
    if (atk.x.star !== 'cir.a.chain-lightning' || !origin || !atk.x.results[atk.targetId]?.hit) return { state, events: [] }
    const d = rollD3(state)
    let s = d.state
    const events: GameEvent[] = [d.event]
    const used = new Set<ModelId>([atk.attackerId, origin.id])
    const arcs: ModelId[] = []
    let last = origin
    for (let i = 0; i < d.value; i++) {
      const n = nextArc(s, last, used)
      if (!n) break
      used.add(n.id); arcs.push(n.id); last = n
    }
    for (const id of arcs) {
      const look = lookups(s, b)
      const arm = armOf(s, b, id)
      const dice = resistsDamageType(s, b, id, ['electricity']) ? 1 : 2
      const r = rollNd6(s, dice, 'damage', { ownerId: id, target: arm, flat: 10 })
      s = r.state; events.push(r.event)
      const ap = applyDamage(s, id, Math.max(0, r.total - arm), { source: 'other', layouts: look.layouts?.(id), damageTypes: ['electricity', 'magical'], attackId: atk.attackId })
      s = ap.state; events.push(...ap.events)
      if (s.models[id]!.life === 'disabled') {
        const dd = resolveDeath(s, id, { tough: look.tough?.(id), layouts: look.layouts?.(id), cause: atk.attackId })
        s = dd.state; events.push(...dd.events)
      }
    }
    return { state: s, events }
  },
}

export const circlePlugins: AttackPlugin[] = [bodySnatcher, meleeBonuses, unyielding, chainLightning]

/** Unyielding as ARM for the preview and the boost odds (the roll itself takes the same 2 off the points in the plugin above): 2 against melee and power attacks. */
export const unyieldingArm = (state: GameState, b: DataBundle, targetId: ModelId, kind: string): number =>
  (kind === 'melee' || kind === 'power') && has(state, b, targetId, 'cir.a.unyielding') ? 2 : 0

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

/**
 * Annoyance (Wolf Riders): -1 on the attack rolls of living enemy models within 1" of a model with it (a seam for core's attack-roll
 * mods: it never stacks). Returns 0 or -1.
 */
export function annoyancePenalty(state: GameState, b: DataBundle, attackerId: ModelId): number {
  const a = state.models[attackerId]
  if (!a || !isOnTable(a) || !isLivingModel(state, b, attackerId)) return 0
  return Object.values(state.models).some((m) => m.owner !== a.owner && m.life === 'active' && isOnTable(m) && hasFlag(state, b, m.id, 'annoyance') && modelDistance(m, a) <= 1 + 1e-6) ? -1 : 0
}

/** Models carrying Warping Winds right now (Sky Shaker): the ones whose effect is live. */
export const warpingWindsCarriers = (state: GameState): ModelState[] =>
  state.effects.filter((e) => e.name === 'Warping Winds' && e.casterId).map((e) => state.models[e.casterId!]).filter((m): m is ModelState => !!m && isOnTable(m) && m.life === 'active')
/** Warping Winds, ranged half: a ranged attack at a Faction model of the carrier's side within 3" of it has -3 RNG (a seam for the range check). Returns 0 or -3. */
export function warpingWindsRngPenalty(state: GameState, b: DataBundle, targetId: ModelId): number {
  const t = state.models[targetId]
  if (!t || !isOnTable(t)) return 0
  return warpingWindsCarriers(state).some((w) => w.owner === t.owner && prof(b, w).faction === prof(b, t).faction && modelDistance(w, t) <= 3 + 1e-6) ? -3 : 0
}
/** Warping Winds, blast half: Faction models of the carrier's side within 3" resist blast damage (a seam for resistsDamageType, live as the models move). */
export const warpingWindsBlastResist = (state: GameState, b: DataBundle, targetId: ModelId): boolean => {
  const t = state.models[targetId]
  return !!t && warpingWindsCarriers(state).some((w) => w.owner === t.owner && prof(b, w).faction === prof(b, t).faction && modelDistance(w, t) <= 3 + 1e-6)
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
