// Protectorate of Menoth (Covenant of the Flame, Feora) rules: every {code} the data names plus the seams for the abilities the
// descriptors cannot say (docs/spec/factions/menoth.md, source-tagged card values).
// Data codes: stokeStripAttack, stokeStripDamage (Prophet of the Covenant), blessingOfTheFirstGift (the feat).
// Seams core calls (all additive, see docs/spec/00-architecture.md section 14):
//  - Illumination: spells.ts asks stokeFreeVictim / useIllumination before paying (once per turn, keyed on men.a.illumination).
//  - The Four Gifts and Sanctified Hull: maintenance.ts calls menothMaintenance; giftBlock / sheafBlocked are asked where a charge, a special
//    attack, a ranged attack, a spell, a focus spend or a force is declared.
//  - Marshal: marshalPassIds (LOS and advancing), Heavy Boiler: runBonus, Gladiator: gladiatorBonus.
//  - Thresher: THRESHER_ID is offered as a star attack by activation.ts; Teleport: menothSpellEffect / teleportSamples.
//  - Lawgiver's Judgement: lawgiverStrips (resistsDamageType and the maintenance fire roll).
//  - Attack plugins: Chain Weapon, Armor-Piercing arrow, Conflagration and Incendiary fire, Debilitating Heat, Heroic Inspiration, Holy Martyrs,
//    Shield Guard, Cleansing Volley.
//  - Skirmish (WP-D-men): Repel (Repulsor Shield) in onResolved, Chain / Decapitation (Light Immolator flail) in adjustPoints and onBoxed.
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import {
  actOf, appliedPassives, atkOf, envOf, isMelee, lookups, meleeReach, noop, ownFlag, prof, rec, resistsDamageType, setAtk, statOf,
  weaponCrippled, weaponsOf, type AtkCtx, type AttackPlugin, type Rec,
} from '../code-hooks'
import { applyDamage, healDamage, resolveDeath } from '../damage'
import { addCondition, applyEffect, hasCondition, removeCondition } from '../effects'
import type { GameEvent } from '../events'
import { baseRadius, dist, isLegalPlacement, isOnTable } from '../geometry'
import { inCtrl, modelDistance, within } from '../measure'
import { movedEvent, push, relocate } from '../movement'
import type { DataBundle, DamageType, EffectInstance, GameState, Id, ModelId, ModelState, PlayerId, Rejection, Vec2 } from '../types'

const bundleOf = (c: HookContext): DataBundle => envOf(c).bundle
const out = (state: GameState, events: GameEvent[] = []): HookResult => ({ state, events })
const keywordsOf = (b: DataBundle, m: ModelState): string[] => (prof(b, m).keywords ?? []) as string[]
const isMenoth = (b: DataBundle, m: ModelState | undefined): boolean => !!m && keywordsOf(b, m).includes('menoth')
const onFire = (state: GameState, m: ModelState): boolean => m.conditions.includes('fire')
const liveOnTable = (m: ModelState | undefined): m is ModelState => !!m && m.life === 'active' && isOnTable(m)
const profileIdIs = (m: ModelState, id: Id): boolean => m.profileId === id
const DEFENDER = 'men.defenders-grunt'

// ---------- Prophet of the Covenant (men.a.stoke-the-pyre) ----------
/**
 * Prophet of the Covenant, attack roll half: strip the fire off the target to BOOST the melee attack roll (one extra die, like a focus boost).
 * A roll is boosted once, so nothing happens when it already is. Policy (RULING): only when the hit is a long shot (DEF - MAT >= 8),
 * otherwise the fire is kept for the damage roll. Marking the roll boosted also stops the core offering a focus boost on top.
 */
const stokeStripAttack = (c: HookContext): HookResult => {
  const b = bundleOf(c)
  const tid = c.targetId
  const tgt = tid ? c.state.models[tid] : undefined
  const a = atkOf(c.state)
  if (!tid || !tgt || !a || !onFire(c.state, tgt) || a.x.boosted || a.x.powerful || a.autoMiss) return out(c.state)
  const need = statOf(c.state, b, tid, 'DEF') - statOf(c.state, b, c.selfId, 'MAT')
  if (need < 8) return out(c.state)
  const r = removeCondition(c.state, tid, 'fire', 'effect')
  const a2 = atkOf(r.state)
  return out(a2 ? setAtk(r.state, { ...a2, x: { ...a2.x, boosted: true } }) : r.state, r.events)
}

/** Prophet of the Covenant, damage roll half: strip the fire off the target to boost the damage roll (not one that is already boosted or cannot be). */
const stokeStripDamage = (c: HookContext): HookResult => {
  const tid = c.targetId
  const tgt = tid ? c.state.models[tid] : undefined
  const a = atkOf(c.state)
  const job = a ? a.x.jobs[a.x.jobIdx] : undefined
  if (!tid || !tgt || !a || !a.x.cur || !job || !onFire(c.state, tgt) || a.x.cur.boost || job.autoBoost || job.unboostable) return out(c.state)
  const r = removeCondition(c.state, tid, 'fire', 'effect')
  const a2 = atkOf(r.state)
  return out(a2?.x.cur ? setAtk(r.state, { ...a2, x: { ...a2.x, cur: { ...a2.x.cur, boost: true } } }) : r.state, r.events)
}

// ---------- Illumination (men.a.illumination) ----------
export const ILLUMINATION_KEY = 'men.a.illumination:oncePerTurn'
/**
 * Illumination: once per turn, in her own activation, the model that has it may put out the fire on one enemy in her CTRL to cast a spell
 * without paying its focus. Returns that enemy, or null (no ability, already used this activation, nothing burning in CTRL).
 */
export function stokeFreeVictim(state: GameState, b: DataBundle, casterId: ModelId): ModelId | null {
  const caster = state.models[casterId]
  if (!caster || !liveOnTable(caster) || !((prof(b, caster).abilities ?? []) as Id[]).includes('men.a.illumination')) return null
  const act = actOf(state)
  if (!act || act.activeId !== casterId || act.limitsUsed.includes(ILLUMINATION_KEY)) return null
  const ctrl = statOf(state, b, casterId, 'CTRL')
  const victim = Object.values(state.models)
    .filter((m) => m.owner !== caster.owner && liveOnTable(m) && onFire(state, m) && inCtrl(caster, m, ctrl))
    .sort((x, y) => x.id.localeCompare(y.id))[0]
  return victim ? victim.id : null
}
/** The free cast is paid for: the enemy's fire goes out and Illumination is spent for this activation. */
export function useIllumination(state: GameState, victimId: ModelId): { state: GameState; events: GameEvent[] } {
  const r = removeCondition(state, victimId, 'fire', 'effect')
  const act = actOf(r.state)
  const s = act && !act.limitsUsed.includes(ILLUMINATION_KEY) ? { ...r.state, activation: { ...act, limitsUsed: [...act.limitsUsed, ILLUMINATION_KEY] } as typeof r.state.activation } : r.state
  return { state: s, events: r.events }
}

// ---------- The Four Gifts of Menoth (men.a.four-gifts) and Sanctified Hull (men.a.sanctified-hull) ----------
export type GiftId = 'flame' | 'law' | 'sheaf' | 'wall'
export const GIFTS: readonly GiftId[] = ['flame', 'law', 'sheaf', 'wall']
const GIFT_SRC = 'men.a.four-gifts'
const TAKEN_SRC = 'men.a.four-gifts.taken'
export const GIFT_NAMES: Record<GiftId, string> = { flame: 'Gift of Flame', law: 'Gift of Law', sheaf: 'Gift of the Sheaf', wall: 'Gift of the Wall' }
type GiftEffect = EffectInstance & { gift?: GiftId; taken?: GiftId[] }
const isWarrior = (b: DataBundle, m: ModelState): boolean => ['leader', 'trooper', 'solo', 'unit'].includes(m.type) && !keywordsOf(b, m).includes('construct')
const isCohort = (m: ModelState): boolean => m.type === 'warEngine' || m.type === 'beast'

/** The Leader whose Gifts a player holds: their live Menoth leader on the table (null for any other army). */
function giftLeader(state: GameState, b: DataBundle, owner: PlayerId): ModelState | null {
  const l = Object.values(state.models).find((m) => m.owner === owner && m.type === 'leader' && liveOnTable(m))
  return l && prof(b, l).faction === 'men' && isMenoth(b, l) ? l : null
}

/** The Gifts already taken this cycle (all four taken: a fresh cycle). */
function takenOf(state: GameState, owner: PlayerId): GiftId[] {
  const t = (state.effects as GiftEffect[]).find((e) => e.sourceId === TAKEN_SRC && e.owner === owner)
  return t?.taken && t.taken.length < GIFTS.length ? t.taken : []
}

/**
 * Which Gift the Leader takes this round (RULING: the engine picks, since Maintenance raises no decisions). Of the Gifts not yet taken this
 * cycle it takes the one that stops the most of what the enemy army can do: Flame by warriors, Law by casters and their spells, the Wall by
 * ranged weapons, the Sheaf by warjacks and warbeasts. Ties go in the card's order.
 */
export function chooseGift(state: GameState, b: DataBundle, owner: PlayerId): GiftId {
  const score: Record<GiftId, number> = { flame: 0, law: 0, sheaf: 0, wall: 0 }
  for (const m of Object.values(state.models)) {
    if (m.owner === owner || !liveOnTable(m)) continue
    if (isWarrior(b, m)) score.flame += m.type === 'trooper' ? 1 : 2
    if (m.type === 'leader') score.law += 2 + ((prof(b, m).spells ?? []) as Id[]).length * 0.5
    if (weaponsOf(b, m).some((w) => !isMelee(w.w))) score.wall += m.type === 'trooper' ? 1 : 1.5
    if (isCohort(m)) score.sheaf += 3
  }
  const taken = takenOf(state, owner)
  const open = GIFTS.filter((g) => !taken.includes(g))
  return open.reduce((best, g) => (score[g] > score[best] ? g : best), open[0]!)
}

/** Maintenance Phase of a Menoth player: the Leader takes a Gift for the round (the previous one has just ended at the start of the turn). */
export function menothMaintenance(state: GameState, b: DataBundle, player: PlayerId): { state: GameState; events: GameEvent[] } {
  const leader = giftLeader(state, b, player)
  if (!leader) return { state, events: [] }
  const gift = chooseGift(state, b, player)
  const events: GameEvent[] = []
  let s = state
  const taken = [...takenOf(s, player), gift]
  const marker = (s.effects as GiftEffect[]).find((e) => e.sourceId === TAKEN_SRC && e.owner === player)
  if (marker) s = { ...s, effects: s.effects.map((e) => (e === marker ? ({ ...marker, taken } as GiftEffect) : e)) }
  else {
    const seq = s.effectSeq + 1
    const m: GiftEffect = { id: `e:${seq}`, sourceId: TAKEN_SRC, name: 'Four Gifts taken', owner: player, casterId: leader.id, targetIds: [], mods: [], duration: 'game', expires: null, taken }
    s = { ...s, effectSeq: seq, effects: [...s.effects, m] }
  }
  s = { ...s, effects: s.effects.filter((e) => !(e.sourceId === GIFT_SRC && e.owner === player)) } // a Gift left over from last round is gone
  const made = applyEffect(s, ({ sourceId: GIFT_SRC, name: GIFT_NAMES[gift], owner: player, casterId: leader.id, targetIds: [leader.id], mods: [], duration: 'round', gift } as unknown) as Parameters<typeof applyEffect>[1])
  events.push(...made.events)
  return { state: made.state, events }
}

/** The Gift a player holds this round, if any. */
export function currentGift(state: GameState, owner: PlayerId): GiftId | null {
  const e = (state.effects as GiftEffect[]).find((x) => x.sourceId === GIFT_SRC && x.owner === owner)
  return e?.gift ?? null
}

/** The Leader's CTRL, plus (Sanctified Hull) everything within 3" of a hull model that stands in that CTRL. */
function giftZone(state: GameState, b: DataBundle, leader: ModelState, cand: ModelState): boolean {
  const ctrl = statOf(state, b, leader.id, 'CTRL')
  if (inCtrl(leader, cand, ctrl)) return true
  for (const h of Object.values(state.models)) {
    if (h.id === leader.id || h.owner !== leader.owner || !liveOnTable(h) || !ownFlag(state, b, h.id, 'sanctifiedHull')) continue
    if (inCtrl(leader, h, ctrl) && within(h, cand, 3)) return true
  }
  return false
}

export type GiftKind = 'charge' | 'special' | 'ranged' | 'spell'
/**
 * Why a Gift forbids this declaration, or null. Flame: enemy warriors cannot charge or special-attack a friendly Faction model in the zone;
 * Law: no enemy spell at one; the Wall: no enemy ranged attack at one. `kinds` lists what the declaration is (a star attack is 'special',
 * a power attack is 'special', a gun is 'ranged', a spell is 'spell').
 */
export function giftBlock(state: GameState, b: DataBundle, attackerId: ModelId, targetId: ModelId, kinds: GiftKind[]): string | null {
  if (!state.effects.length) return null
  const a = state.models[attackerId]
  const t = state.models[targetId]
  if (!a || !t) return null
  for (const e of state.effects as GiftEffect[]) {
    if (e.sourceId !== GIFT_SRC || !e.gift) continue
    const leader = e.casterId ? state.models[e.casterId] : undefined
    if (!liveOnTable(leader) || a.owner === leader.owner || t.owner !== leader.owner || !isMenoth(b, t)) continue
    const hit = (e.gift === 'flame' && isWarrior(b, a) && (kinds.includes('charge') || kinds.includes('special')))
      || (e.gift === 'law' && kinds.includes('spell')) || (e.gift === 'wall' && kinds.includes('ranged'))
    if (hit && giftZone(state, b, leader, t)) return `${GIFT_NAMES[e.gift]} protects ${targetId}`
  }
  return null
}

/** The Gift of the Sheaf: an enemy warjack or warbeast in the zone cannot spend focus or be forced. */
export function sheafBlocked(state: GameState, b: DataBundle, id: ModelId): boolean {
  if (!state.effects.length) return false
  const m = state.models[id]
  if (!m || !isCohort(m)) return false
  for (const e of state.effects as GiftEffect[]) {
    if (e.sourceId !== GIFT_SRC || e.gift !== 'sheaf') continue
    const leader = e.casterId ? state.models[e.casterId] : undefined
    if (liveOnTable(leader) && m.owner !== leader.owner && giftZone(state, b, leader, m)) return true
  }
  return false
}

// ---------- Marshal [Covenant of the Flame] / [Flameguard Defender] ----------
/** Friendly models that never block this model's LOS and that it may advance through (empty without a Marshal ability). */
export function marshalPassIds(state: GameState, b: DataBundle, id: ModelId): ModelId[] {
  const me = state.models[id]
  if (!me) return []
  const covenant = ownFlag(state, b, id, 'marshalCovenant')
  const defenders = ownFlag(state, b, id, 'marshalDefenders')
  if (!covenant && !defenders) return []
  return Object.values(state.models)
    .filter((m) => m.id !== id && m.owner === me.owner && isOnTable(m) && ((covenant && isMenoth(b, m)) || (defenders && profileIdIs(m, DEFENDER))))
    .map((m) => m.id)
}

// ---------- Heavy Boiler, Gladiator ----------
/** Heavy Boiler: the extra inches a run gets (+2 SPD only when it runs). */
export const runBonus = (state: GameState, b: DataBundle, id: ModelId): number => (ownFlag(state, b, id, 'heavyBoiler') ? 2 : 0)
/** Gladiator: +2 on power attack damage rolls and on their collateral damage rolls. */
export const gladiatorBonus = (state: GameState, b: DataBundle, id: ModelId): number => (ownFlag(state, b, id, 'gladiator') ? 2 : 0)

// ---------- Thresher ----------
/** Blazing Star's Thresher: a star attack (activation.ts offers it) that swings at every model, friend or foe, in melee range and LOS at once. */
export const THRESHER_ID = 'men.a.thresher'

// ---------- Lawgiver's Judgement ----------
/** Enemy models in the CTRL of a Feora holding Lawgiver's Judgement lose Resistance: Fire and cannot gain it. */
export function lawgiverStrips(state: GameState, b: DataBundle, id: ModelId): boolean {
  if (!state.effects.length) return false
  const m = state.models[id]
  if (!m || !isOnTable(m)) return false
  for (const e of state.effects) {
    if (e.sourceId !== 'men.s.lawgivers-judgement') continue
    const c = e.casterId ? state.models[e.casterId] : undefined
    if (liveOnTable(c) && c.owner !== m.owner && inCtrl(c, m, statOf(state, b, c.id, 'CTRL'))) return true
  }
  return false
}

// ---------- Feat: Blessing of the First Gift ----------
/** Every enemy model, and every model of an enemy unit with a model, in the caster's CTRL catches fire (unless it resists fire). No damage roll. */
const blessingOfTheFirstGift = (c: HookContext): HookResult => {
  const b = bundleOf(c)
  let state = c.state
  const caster = state.models[c.selfId]
  if (!caster) return noop(c)
  const ctrl = statOf(state, b, caster.id, 'CTRL')
  const events: GameEvent[] = []
  const hit = new Set<ModelId>()
  for (const m of Object.values(state.models)) {
    if (m.owner === caster.owner || !liveOnTable(m) || !inCtrl(caster, m, ctrl)) continue
    hit.add(m.id)
    if (m.unitId) for (const t of state.units[m.unitId]?.troopers ?? []) hit.add(t)
  }
  for (const id of [...hit].sort()) {
    const m = state.models[id]
    if (!liveOnTable(m) || resistsDamageType(state, b, id, ['fire']) || ((prof(b, m).abilities ?? []) as Id[]).includes('core.a.immunity-fire')) continue
    const f = addCondition(state, id, 'fire', 'men.f.blessing-of-the-first-gift')
    state = f.state; events.push(...f.events)
  }
  return out(state, events)
}

export const menothHooks: CodeHookRegistry = {
  conditions: {},
  effects: { stokeStripAttack, stokeStripDamage, blessingOfTheFirstGift },
}

// ---------- Teleport ----------
const TELEPORT_RANGE = 6
/** Teleport lands the whole base within 6" of where she stood (centre to centre): a legal placement on the table. */
export function teleportCheck(state: GameState, casterId: ModelId, to: Vec2 | undefined): Rejection | null {
  const m = state.models[casterId]
  if (!m || !to) return null
  if (!Number.isFinite(to.x) || !Number.isFinite(to.z)) return { code: 'E_BAD_PAYLOAD', message: 'bad point' }
  if (dist(m.pos, to) > TELEPORT_RANGE + 1e-6) return { code: 'E_TOO_FAR', message: `Teleport reaches ${TELEPORT_RANGE}"` }
  const p = isLegalPlacement(state, casterId, to, m.base)
  return p.ok ? null : { code: p.code ?? 'E_PLACEMENT', message: p.message ?? 'cannot be placed there' }
}
/** Legal landing spots to offer: a ring at the full 6" and one at 3", best (farthest from the enemy) first. */
export function teleportSamples(state: GameState, casterId: ModelId): Vec2[] {
  const m = state.models[casterId]
  if (!m) return []
  const foes = Object.values(state.models).filter((x) => x.owner !== m.owner && liveOnTable(x))
  const gap = (p: Vec2): number => (foes.length ? Math.min(...foes.map((f) => dist(p, f.pos) - baseRadius(f.base))) : 0)
  const pts: Vec2[] = []
  for (const [r, n] of [[TELEPORT_RANGE, 12], [3, 6]] as const) {
    for (let i = 0; i < n; i++) {
      const ang = (i * 2 * Math.PI) / n
      const p = { x: m.pos.x + Math.cos(ang) * r, z: m.pos.z + Math.sin(ang) * r }
      if (!teleportCheck(state, casterId, p)) pts.push(p)
    }
  }
  return pts.sort((x, y) => gap(y) - gap(x)).slice(0, 8)
}

/**
 * Spells whose effect the descriptors cannot say (an instant SELF spell runs no plain ops). Returns null for any other spell.
 * Teleport: the point is `a.point`; with none (RULING) she lands on the legal spot farthest from the enemy. Her activation then ends.
 */
export function menothSpellEffect(state: GameState, casterId: ModelId, spellId: Id, point?: Vec2): { state: GameState; events: GameEvent[]; endActivation?: boolean } | null {
  if (spellId !== 'men.s.teleport') return null
  const m = state.models[casterId]
  if (!m || !liveOnTable(m)) return { state, events: [] }
  const to = point ?? teleportSamples(state, casterId)[0]
  if (!to) return { state, events: [], endActivation: true }
  const moved = relocate(state, casterId, to)
  return { state: moved, events: [movedEvent(casterId, 'place', m.pos, to, [to], moved.models[casterId]!.elev)], endActivation: true }
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

const BOW = 'men.w.valeria-bow'
const AP_POW = 8
const HEAT = 'men.s.debilitating-heat'
const GUARD_RANGE = 3
const GUARD_SRC = 'men.a.shield-guard'
const VOLLEY_ID = 'men.a.cleansing-volley'
const VOLLEY_KEY = `${VOLLEY_ID}:oncePerTurn`
const isRangedKind = (k: string): boolean => k === 'ranged' || k === 'aoe'
const isMeleeKind = (k: string): boolean => k === 'melee' || k === 'power'

const REPEL_ID = 'men.a.repel'
const CHAIN_ID = 'men.a.chain'
const weaponHas = (w: Rec | undefined, abilityId: Id): boolean => ((w?.abilities ?? []) as Id[]).includes(abilityId)
/** Does the weapon this attack used carry Chain (Decapitation)? Spells and power attacks never do. */
const usesChain = (b: DataBundle, atk: AtkCtx): boolean => !!atk.weaponId && !atk.spellId && weaponHas(rec(b, atk.weaponId), CHAIN_ID)

/**
 * Repel, both halves, once the attack has resolved (melee weapon attacks only; RULING in docs/needs-rules-check.md):
 *  1. the attacker's own Repel weapon pushes every enemy it hit 1" directly away from the attacker;
 *  2. a hit model carrying an uncrippled Repel weapon pushes the attacker 1" directly away from itself.
 * A model that was destroyed, or is no longer on the table, is not pushed.
 */
function repelResolved(state: GameState, b: DataBundle, atk: AtkCtx): { state: GameState; events: GameEvent[] } {
  if (atk.kind !== 'melee' || !atk.weaponId || atk.spellId) return { state, events: [] }
  const at = state.models[atk.attackerId]
  if (!at) return { state, events: [] }
  const hit = atk.x.rollTargets.filter((t) => atk.x.results[t]?.hit && state.models[t] && state.models[t]!.owner !== at.owner)
  if (!hit.length) return { state, events: [] }
  let s = state
  const events: GameEvent[] = []
  const look = lookups(s, b)
  // 1. the attacker's weapon
  const own = weaponsOf(b, at).find((w) => w.weaponId === atk.weaponId && w.loc === (atk.x.wloc ?? w.loc))
  if (own && weaponHas(own.w, REPEL_ID) && !weaponCrippled(at, own.loc)) {
    for (const t of hit) {
      const tm = s.models[t]
      if (!liveOnTable(tm)) continue
      const r = push(s, t, s.models[at.id]!.pos, 1, look)
      s = r.state; events.push(...r.events)
    }
  }
  // 2. a hit model's Repel weapon pushes the attacker
  for (const t of hit) {
    const tm = s.models[t]
    if (!liveOnTable(tm)) continue
    const shield = weaponsOf(b, tm).some((w) => weaponHas(w.w, REPEL_ID) && !weaponCrippled(tm, w.loc))
    const att = s.models[at.id]
    if (!shield || !liveOnTable(att)) continue
    const r = push(s, att.id, tm.pos, 1, lookups(s, b))
    s = r.state; events.push(...r.events)
  }
  return { state: s, events }
}

export const menothPlugins: AttackPlugin[] = [{
  id: 'men.faction',
  damageFlat(state, b, atk, job) {
    const at = state.models[atk.attackerId]
    const tgt = state.models[job.targetId]
    if (!at || !tgt) return 0
    let flat = 0
    // Chain Weapon: the Buckler / Shield / Shield Wall ARM is ignored, which is the same as that much extra on the roll
    if (atk.weaponId === 'men.w.blazing-star') flat += shieldBonusArm(state, b, tgt.id)
    // Armor-Piercing arrow: the shot is POW 8 instead of the bow's 12 (its ARM is halved by the armorPiercing code)
    if (atk.weaponId === BOW && atk.x.group === 'armor-piercing-arrow') flat += AP_POW - ((rec(b, BOW).pow as number | undefined) ?? AP_POW)
    // Debilitating Heat: friendly Faction melee damage rolls against the weakened model get +2
    if (isMeleeKind(atk.kind) && isMenoth(b, at) && state.effects.some((e) => e.sourceId === HEAT && e.owner === at.owner && e.targetIds.includes(tgt.id))) flat += 2
    return flat
  },
  damageDice(state, b, atk, job) {
    // Heroic Inspiration: a friendly Flameguard Defender fighting in melee an enemy inside Pyrrhus's melee range rolls one more damage die
    const at = state.models[atk.attackerId]
    const tgt = state.models[job.targetId]
    if (!at || !tgt || !isMeleeKind(atk.kind) || !profileIdIs(at, DEFENDER)) return 0
    const near = Object.values(state.models).some((p) => p.owner === at.owner && liveOnTable(p) && ownFlag(state, b, p.id, 'heroicInspiration')
      && modelDistance(p, tgt) <= meleeReach(state, b, p.id) + 1e-6)
    return near ? 1 : 0
  },
  damageTypes(state, _b, atk) {
    // Conflagration and the Incendiary arrow deal fire damage (so Resistance: Fire bites)
    if (atk.spellId === 'men.s.conflagration' || (atk.weaponId === BOW && atk.x.group === 'incendiary-arrow')) return ['fire' as DamageType]
    return []
  },
  beforeHits(state, b, atk) {
    // Shield Guard: a Defender within 3" of a friendly model that a ranged (not spray) attack hit directly takes the hit in its place, once per round.
    // RULING: it steps in for a leader, warjack or solo, never for a Defender trooper (they are the cheap bodies)
    if (!isRangedKind(atk.kind) || !atk.x.results[atk.targetId]?.hit) return null
    const tgt = state.models[atk.targetId]
    const at = state.models[atk.attackerId]
    if (!tgt || !at || at.owner === tgt.owner || !['leader', 'warEngine', 'solo'].includes(tgt.type)) return null
    const guard = Object.values(state.models)
      .filter((g) => g.id !== tgt.id && g.owner === tgt.owner && liveOnTable(g) && ownFlag(state, b, g.id, 'shieldGuard') && !hasCondition(state, g, 'knockedDown')
        && !hasCondition(state, g, 'stationary') && within(g, tgt, GUARD_RANGE) && !state.effects.some((e) => e.sourceId === GUARD_SRC && e.casterId === g.id))
      .sort((x, y) => modelDistance(x, tgt) - modelDistance(y, tgt) || x.id.localeCompare(y.id))[0]
    if (!guard) return null
    const used = applyEffect(state, { sourceId: GUARD_SRC, name: 'Shield Guard', owner: guard.owner, casterId: guard.id, targetIds: [guard.id], mods: [], duration: 'round' })
    const res = { ...atk.x.results }
    res[guard.id] = res[tgt.id]!
    delete res[tgt.id]
    const a2: typeof atk = { ...atk, targetId: guard.id, x: { ...atk.x, results: res, rollTargets: atk.x.rollTargets.map((t) => (t === tgt.id ? guard.id : t)) } }
    return { state: setAtk(used.state, a2), events: used.events }
  },
  onHit(state, b, atk, targetId) {
    const at = state.models[atk.attackerId]
    const tgt = state.models[targetId]
    if (!at || !tgt) return { state, events: [] }
    const act = actOf(state)
    // Cleansing Volley: a direct ranged hit on a burning enemy earns one more shot, once per turn (used when the attack is resolved)
    if (isRangedKind(atk.kind) && targetId === atk.targetId && onFire(state, tgt) && ((prof(b, at).abilities ?? []) as Id[]).includes(VOLLEY_ID)
      && act && act.modelIds.includes(at.id) && !atk.outOfActivation && !act.limitsUsed.includes(VOLLEY_KEY)) {
      return { state: setAtk(state, { ...atk, x: { ...atk.x, flags: { ...atk.x.flags, cleansing: targetId } } }), events: [] }
    }
    // Debilitating Heat: the model hit (and its unit) lose 2 DEF and 2 on their damage rolls for a round
    if (atk.spellId === HEAT) {
      const ids = tgt.unitId ? (state.units[tgt.unitId]?.troopers ?? []).filter((t) => liveOnTable(state.models[t])) : [tgt.id]
      const made = applyEffect(state, ({
        sourceId: HEAT, name: 'Debilitating Heat', owner: at.owner, casterId: at.id, targetIds: ids.length ? ids : [tgt.id],
        mods: [{ stat: 'DEF', value: -2, mode: 'add' }], duration: 'round', rollMods: [{ roll: 'damage', value: -2 }],
      } as unknown) as Parameters<typeof applyEffect>[1])
      return { state: made.state, events: made.events }
    }
    return { state, events: [] }
  },
  adjustPoints(state, b, atk, job, points0) {
    // Chain (Decapitation): the damage beyond the target's ARM is doubled (the points are what is left after ARM)
    const decap = usesChain(b, atk) && points0 > 0
    const points = decap ? points0 * 2 : points0
    const keep: { state: GameState; events: GameEvent[]; points: number } | null = decap ? { state, events: [], points } : null
    // Holy Martyrs: when an enemy attack would disable the model, a friendly Flameguard Defender within 5" is destroyed instead and it heals 1
    const t = state.models[job.targetId]
    const at = state.models[atk.attackerId]
    if (!t || !at || at.owner === t.owner || points <= 0 || !liveOnTable(t) || !ownFlag(state, b, t.id, 'holyMartyrs') || t.damage.track !== 'single') return keep
    if (t.damage.filled + points < Math.max(t.damage.boxes, 1)) return keep
    const d = Object.values(state.models)
      .filter((m) => m.id !== t.id && m.owner === t.owner && liveOnTable(m) && profileIdIs(m, DEFENDER) && within(t, m, 5))
      .sort((x, y) => modelDistance(x, t) - modelDistance(y, t) || x.id.localeCompare(y.id))[0]
    if (!d) return keep
    const look = lookups(state, b)
    const events: GameEvent[] = []
    const ap = applyDamage(state, d.id, Math.max(d.damage.track === 'single' ? d.damage.boxes : 1, 1), { source: 'other', layouts: look.layouts?.(d.id) })
    let s = ap.state
    events.push(...ap.events)
    if (s.models[d.id]!.life === 'disabled') {
      const dd = resolveDeath(s, d.id, { layouts: look.layouts?.(d.id), cause: 'holy-martyrs' })
      s = dd.state; events.push(...dd.events)
    }
    const h = healDamage(s, t.id, 1, look.layouts?.(t.id))
    return { state: h.state, events: [...events, ...h.events], points: 0 }
  },
  onBoxed(_state, b, atk) {
    // Chain (Decapitation): a model this attack disables cannot make a Tough roll
    return usesChain(b, atk) ? { removeFromPlay: false, denyTough: true } : null
  },
  onResolved(state0, b, atk) {
    const rep = repelResolved(state0, b, atk)
    const state = rep.state
    // Cleansing Volley, second half: the fire goes out and the shooter has one more initial shot with the weapon it used
    const flag = atk.x.flags.cleansing as ModelId | undefined
    const at = state.models[atk.attackerId]
    const act = actOf(state)
    if (!flag || !at || !act || !atk.weaponId || act.limitsUsed.includes(VOLLEY_KEY)) return { state, events: rep.events }
    let s = state
    const events: GameEvent[] = [...rep.events]
    const r = removeCondition(s, flag, 'fire', 'effect')
    s = r.state; events.push(...r.events)
    const a2 = actOf(s)!
    const pm = a2.perModel[at.id]
    if (pm) {
      const left = { ...pm.initialAttacksLeft, [atk.weaponId]: (pm.initialAttacksLeft[atk.weaponId] ?? 0) + 1 }
      s = { ...s, activation: { ...a2, limitsUsed: [...a2.limitsUsed, VOLLEY_KEY], perModel: { ...a2.perModel, [at.id]: { ...pm, initialAttacksLeft: left } } } as typeof s.activation }
    }
    void b
    return { state: s, events }
  },
}]
