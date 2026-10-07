// Data access, passive-ability evaluation, stats for attacks, condition/effect interpreter, and the code-hook registry
// (every {code} escape hatch the starter data references). Pure: state in, state out. All data comes in as `bundle`.
import type { GameEvent } from './events'
import type { CodeHookRegistry, ConditionNode, EffectNode, HookContext, HookResult } from './hooks'
import { computeStat } from './dice'
import { effectsOn, hasCondition, type EffectExtras } from './effects'
import { effectDormant, hasCardGrant } from './card-effects'
import { scenarioCover } from './scenario-rules'
import { baseRadius, dist, isOnTable } from './geometry'
import { modelDistance, within } from './measure'
import { insideCoverOf, terrainResistance } from './terrain'
import type { LosOptions } from './los'
import type { GridLayout } from './damage'
import type { HitLookups } from './movement'
import type {
  AttackContext, DamageType, DataBundle, EffectInstance, GameState, Id, ModelId, ModelState, Mod, Stat, StatMod, Vec2,
} from './types'
import { ASPECT_LETTER } from './types'
import { cygnarHooks, cygnarPlugins } from './factions/cygnar'
import { khadorHooks, khadorPlugins } from './factions/khador'
import { trollbloodsHooks, trollbloodsPlugins } from './factions/trollbloods'
import { circleHooks, circlePlugins, deathPoweredArm, scythingTouchArmPenalty, treewalkerDefBonus, warpingWindsBlastResist } from './factions/circle'
import { cryxHooks, cryxPlugins } from './factions/cryx'
import { lawgiverStrips, marshalPassIds, menothHooks, menothPlugins } from './factions/menoth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rec = Record<string, any>
export const rec = (b: DataBundle, id: Id | undefined): Rec => ((id ? b.byId[id] : undefined) ?? {}) as Rec
export const prof = (b: DataBundle, m: Pick<ModelState, 'profileId'>): Rec => rec(b, m.profileId)

// ---------- runtime attack scratch (lives in state.attack.x; JSON-safe) ----------
export interface DmgJob { id: string; targetId: ModelId; kind: 'direct' | 'blast'; pow: number; types: DamageType[]; autoBoost?: boolean; unboostable?: boolean }
export interface AtkX {
  stage: 'start' | 'declOptWait' | 'powerfulWait' | 'boostWait' | 'roll' | 'dmgNext' | 'dmgBoostWait' | 'dmgRoll' | 'pfWait' | 'applyDmg' | 'xferWait' | 'boxWait' | 'resolved' | 'trigWait' | 'moveWait' | 'done'
    // M10 core gaps: roll anyway on an auto-hit, rerolls after the attack roll (rerollNext/Wait) and the damage roll
    // (dmgRerollNext/Wait), the colossal grid pick, and the weapon pick of an attack a trigger makes outside the activation
    | 'rollAnywayWait' | 'rerollNext' | 'rerollWait' | 'dmgRerollNext' | 'dmgRerollWait' | 'gridWait' | 'trigAtkWait'
  weaponId?: Id // weapon or spell record id
  wloc?: string // location letter of the weapon instance used
  group?: string // chosen Attack Type
  specs: Id[] // ability ids active for this attack (attacker-side)
  rollTargets: ModelId[]
  results: Record<ModelId, { hit: boolean; crit: boolean; auto: 'hit' | 'miss' | null; total: number; dice: number[] }>
  boosted: boolean
  powerful: boolean
  noFocus: boolean // out of activation / generated without focus
  atkAdd: number // extra added attack dice
  jobs: DmgJob[]
  jobIdx: number
  cur?: {
    addDice: number; flat: number; boost: boolean; dropLowest: boolean; points?: number; rollId?: string; armorPiercing: boolean; transferred?: boolean
    // the damage roll as rolled, kept while a reroll may still replace it (every die, the total, the flat part, the ARM it faces)
    rolled?: { dice: number[]; total: number; flat: number; arm: number; nDice: number; resist: boolean }
  }
  aoe?: number
  blastPow?: number
  star?: Id // ★Attack ability id
  starFlat: number
  blessed: boolean
  denyTough: boolean
  rfp: boolean
  needColumn: boolean
  destroyed: ModelId[]
  hitModels: ModelId[]
  trig: { ownerId: ModelId; tier: 1 | 2 | 3; abilityId: Id }[]
  trigIdx: number
  moveReq?: MoveReq
  atkMods: Mod[]
  dmgMods: Record<ModelId, number>
  parent?: AtkCtx // attack to resume when a trigger-made attack finishes
  flags: Record<string, unknown>
  chargeAttack: boolean
  basicRanged: boolean
}
export type AtkCtx = AttackContext & { x: AtkX }
export const atkOf = (s: GameState): AtkCtx | null => (s.attack as AtkCtx | null)

// ---------- weapons ----------
export interface WeaponInst { weaponId: Id; loc: string; w: Rec; index: number }
export function weaponsOf(b: DataBundle, m: Pick<ModelState, 'profileId'>): WeaponInst[] {
  const out: WeaponInst[] = []
  for (const e of (prof(b, m).weapons ?? []) as Rec[]) {
    const w = rec(b, e.weapon)
    const n = e.count ?? 1
    for (let i = 0; i < n; i++) out.push({ weaponId: e.weapon, loc: e.location ?? w.location ?? '-', w, index: out.length })
  }
  return out
}
export const isMelee = (w: Rec): boolean => w.type === 'melee'
export const isSpray = (w: Rec): boolean => typeof w.rng === 'string' && /^SP/i.test(w.rng)
export const weaponRange = (w: Rec, bonus = 0): number =>
  (typeof w.rng === 'number' ? w.rng : isSpray(w) ? Number(String(w.rng).slice(2)) : 0) + (w.type === 'melee' || w.rng === undefined ? 0 : bonus)
/** Extra RNG a model's ranged weapons get from live effects (Snipe, Far Strike): the RNG mods on its effects. */
export function rangeBonusOf(state: GameState, id: ModelId): number {
  let n = 0
  for (const e of effectsOn(state, id)) for (const m of e.mods) if (m.stat === 'RNG' && m.mode === 'add') n += m.value
  return n
}
/**
 * Warping Winds, ranged half (Wind Weaver, Sky Shaker): a ranged attack at a model of the same faction as a carrier, on the carrier's side and within 3"
 * of it (the carrier itself included), has 3 less RNG. The carrier is the caster of a live effect named Warping Winds. Faction is read from the profile id
 * prefix because the range check has no bundle (the faction helpers in cygnar.ts and circle.ts want one); every profile id starts with its faction.
 */
const factionPrefix = (m: Pick<ModelState, 'profileId'>): string => m.profileId.split('.')[0]!
export function warpingWindsRangePenalty(state: GameState, targetId: ModelId): number {
  const t = state.models[targetId]
  if (!t || !isOnTable(t)) return 0
  const f = factionPrefix(t)
  return state.effects.some((e) => {
    if (e.name !== 'Warping Winds' || !e.casterId) return false
    const c = state.models[e.casterId]
    return !!c && isOnTable(c) && c.life === 'active' && c.owner === t.owner && factionPrefix(c) === f && modelDistance(c, t) <= 3 + 1e-6
  }) ? 3 : 0
}
/**
 * The attack range of a ranged weapon for this attacker, live RNG effects included (spells never get it). With `targetId` (the target list, the AI's reach
 * test) the Warping Winds penalty of that model comes off; without it, while an attack by this model is being resolved (`state.attack`) the penalty of
 * its target comes off, so the real roll and the preview both see it.
 */
export const weaponRangeFor = (state: GameState, attackerId: ModelId, w: Rec, targetId?: ModelId): number => {
  const spell = w.recordType === 'spell' || w.kind === 'spell'
  const base = weaponRange(w, spell ? 0 : rangeBonusOf(state, attackerId))
  if (spell || w.type === 'melee' || w.rng === undefined) return base
  if (targetId) return Math.max(0, base - warpingWindsRangePenalty(state, targetId))
  const a = state.attack
  if (!a || a.attackerId !== attackerId) return base
  return Math.max(0, base - warpingWindsRangePenalty(state, a.targetId))
}
export const weaponCrippled = (m: ModelState, loc: string): boolean => loc !== '-' && m.crippled.includes(loc)
export const layoutsOf = (b: DataBundle, m: ModelState): GridLayout[] | undefined => {
  const d = prof(b, m).damage
  if (d && d.track === 'dualGrid' && d.grids) return [{ id: 'left', columns: d.grids.left as string[] }, { id: 'right', columns: d.grids.right as string[] }] // M10: a colossal's two grids
  if (d && d.track === 'spiral') return [{ id: 'main', columns: (d.branches as string[]).map((x) => x.toLowerCase()), spiral: true }] // M9: aspects as lowercase letters
  return d && d.track === 'grid' ? [{ id: 'main', columns: d.columns as string[] }] : undefined
}
/** Melee reach of a model (0 when it has no melee weapon or cannot engage). */
export function meleeReach(state: GameState, b: DataBundle, id: ModelId): number {
  const m = state.models[id]
  if (!m || m.inert || hasCondition(state, m, 'knockedDown') || hasCondition(state, m, 'stationary')) return 0
  let r = 0
  for (const wi of weaponsOf(b, m)) if (isMelee(wi.w)) r = Math.max(r, wi.w.rng ?? 1)
  return r
}

// ---------- conditions that need no data ----------
export const alive = (m: ModelState | undefined): m is ModelState => !!m && isOnTable(m)
export const isConstruct = (state: GameState, b: DataBundle, id: ModelId): boolean => hasFlag(state, b, id, 'construct')
export function touching(a: ModelState, c: ModelState): boolean { return modelDistance(a, c) <= 0.01 }

// ---------- scopes, passives, auras ----------
function abilityList(b: DataBundle, m: ModelState): Id[] { return (prof(b, m).abilities ?? []) as Id[] }

/** CTRL for scope tests: profile value plus effect mods only. Never reads auras, so an aura scope cannot recurse into statOf. */
function ctrlForScope(state: GameState, b: DataBundle, src: ModelState): number {
  const base = ((prof(b, src).stats ?? {}) as Record<string, number>).CTRL ?? 0
  return computeStat('CTRL', base, effectsOn(state, src.id).flatMap((e) => e.mods.filter((x) => x.stat === 'CTRL')))
}

function scopeMatch(state: GameState, b: DataBundle, src: ModelState, cand: ModelState, scope: Rec | undefined): boolean {
  const who = scope?.who ?? 'self'
  if (who === 'self') return src.id === cand.id
  if (who === 'unit') return !!src.unitId && src.unitId === cand.unitId
  if (who === 'warEngines') return cand.type === 'warEngine' && cand.owner === src.owner
  if (who === 'battlegroup') return cand.owner === src.owner && (cand.id === src.id || (cand.type === 'beast' && cand.controllerId === src.id && !cand.wild)) // M10 (Admonition)
  if (who === 'friendly' || who === 'warbeasts') {
    if (cand.owner !== src.owner) return false
    // 'warbeasts': the beasts of the carrier's own battlegroup (81 E7)
    if (who === 'warbeasts' && (cand.type !== 'beast' || cand.controllerId !== src.id || cand.wild)) return false
    const r = scope?.range
    if (r !== undefined && r !== null) {
      const lim = r === 'CTRL' ? ctrlForScope(state, b, src) : r === 'melee' ? 1 : (r as number)
      if (!within(src, cand, lim)) return false
    }
    if (scope?.filter && !evalCond(state, b, scope.filter, { selfId: cand.id, srcId: src.id })) return false
    return true
  }
  return false
}

export interface AppliedPassive { ability: Rec; src: ModelState }
/** Passive and aura abilities (and own weapon qualities) that currently apply to model `id`. */
export function appliedPassives(state: GameState, b: DataBundle, id: ModelId, ctx: Partial<CondEnv> = {}): AppliedPassive[] {
  const me = state.models[id]
  if (!me) return []
  const out: AppliedPassive[] = []
  for (const src of Object.values(state.models)) {
    if (!isOnTable(src) || src.owner !== me.owner) continue
    for (const abId of abilityList(b, src)) {
      const ab = rec(b, abId)
      if (ab.trigger !== 'passive') continue
      if (!scopeMatch(state, b, src, me, ab.scope)) continue
      if (ab.when && !evalCond(state, b, ab.when, { ...ctx, selfId: id, srcId: src.id })) continue
      out.push({ ability: ab, src })
    }
  }
  for (const wi of weaponsOf(b, me)) {
    if (weaponCrippled(me, wi.loc) && wi.loc !== '-') continue
    for (const q of (wi.w.qualities ?? []) as Id[]) {
      const ab = rec(b, q)
      if (ab.trigger !== 'passive') continue
      if (ab.when && !evalCond(state, b, ab.when, { ...ctx, selfId: id, srcId: id })) continue
      out.push({ ability: ab, src: me })
    }
  }
  out.push(...enemyAuraPassives(state, b, me, ctx))
  return out
}

// ---------- auras that work on ENEMY models (Skirmish WP-CORE) ----------
// `appliedPassives` only walks the model's own side, so a rule that penalises the enemy near its carrier (Annoyance, Ashen Veil) is synthesised
// here, keyed by the carrier's coreFlag. It answers only when the attack-roll caller names the model as the attacker (`ctx.attackerId`), so
// nothing else (DEF, ARM, LOS) ever sees it. Each rule counts once, however many carriers stand near (no stacking).
export const ANNOYANCE_ID = 'core.a.annoyance'
export const ASHEN_VEIL_ID = 'core.a.ashen-veil'
interface EnemyAura {
  id: string; name: string; flag: string; range: number; value: number
  carrierOk?: (state: GameState, b: DataBundle, src: ModelState) => boolean
  victimOk?: (state: GameState, b: DataBundle, v: ModelState) => boolean
}
const ENEMY_AURAS: EnemyAura[] = [
  { id: ANNOYANCE_ID, name: 'Annoyance', flag: 'annoyance', range: 1, value: -1 },
  {
    id: ASHEN_VEIL_ID, name: 'Ashen Veil', flag: 'ashenVeil', range: 2, value: -2,
    // the veil is the Light Immolator arm's rule: a crippled arm switches it off; fire-resistant models are not troubled by it
    carrierOk: (_state, b, src) => !weaponsOf(b, src).some((w) => w.weaponId === 'men.w.light-immolator-flail' && weaponCrippled(src, w.loc)),
    victimOk: (state, b, v) => !resistsDamageType(state, b, v.id, ['fire']),
  },
]
function enemyAuraPassives(state: GameState, b: DataBundle, me: ModelState, ctx: Partial<CondEnv>): AppliedPassive[] {
  if (ctx.attackerId !== me.id || !isOnTable(me) || !isLivingModel(state, b, me.id)) return []
  const out: AppliedPassive[] = []
  const done = new Set<string>()
  for (const src of Object.values(state.models)) {
    if (src.owner === me.owner || src.life !== 'active' || !isOnTable(src) || src.inert) continue
    for (const a of ENEMY_AURAS) {
      if (done.has(a.id) || !within(src, me, a.range) || !ownFlag(state, b, src.id, a.flag)) continue
      if (a.carrierOk && !a.carrierOk(state, b, src)) continue
      if (a.victimOk && !a.victimOk(state, b, me)) continue
      done.add(a.id)
      out.push({ src, ability: { id: a.id, name: a.name, kind: 'passive', trigger: 'passive', scope: { who: 'self' }, effect: [{ op: 'modRoll', roll: 'attack', value: a.value }] } })
    }
  }
  return out
}

/**
 * Concealment a model carries by itself (Exhaust Fumes, Ashen Veil on a Revenger with its Light Immolator arm working), read by the DEF modifiers
 * for ranged and arcane attacks. Fire resistance does not matter here: the veil shields its carrier from everybody.
 */
export function grantedConcealmentOf(state: GameState, b: DataBundle, id: ModelId): boolean {
  const m = state.models[id]
  if (!m) return false
  if (effectsOn(state, id).some((e) => e.sourceId === 'cry.a.exhaust-fumes')) return true
  if (!ownFlag(state, b, id, 'ashenVeil')) return false
  const veil = ENEMY_AURAS.find((a) => a.id === ASHEN_VEIL_ID)
  return !veil?.carrierOk || veil.carrierOk(state, b, m)
}

/** coreFlag marker -> the core ability that carries the rule (Skirmish WP-CORE): channelling reads `core.a.arc-node`, Cavalry boosts through `core.a.cavalry`. */
const FLAG_CORE_ABILITY: Record<string, Id> = { arcNode: 'core.a.arc-node', cavalry: 'core.a.cavalry' }
/** Ability ids the model has: its own plus any granted by auras. */
export function abilitiesOf(state: GameState, b: DataBundle, id: ModelId): Id[] {
  const me = state.models[id]
  if (!me) return []
  const out = new Set<Id>(abilityList(b, me))
  // abilities an effect granted for a while (Soul Phase, Blood Shadow, Fight to the Last): the effect carries `grants`
  for (const e of effectsOn(state, id)) {
    if (effectDormant(state, b, e, id)) continue // M13 cards: Sturdy, Dig In and Set Defense work only near a scenario element
    for (const g of ((e as EffectInstance & { grants?: Id[] }).grants ?? [])) out.add(g)
  }
  // a faction record that only carries the marker flag (cir.a.cavalry, men.a.arc-node) gets the shared core ability the rule runs through
  for (const a of [...out]) for (const n of (rec(b, a).effect ?? []) as Rec[]) {
    const g = n.code === 'coreFlag' ? FLAG_CORE_ABILITY[n.params?.flag as string] : undefined
    if (g) out.add(g)
  }
  for (const p of appliedPassives(state, b, id)) {
    for (const n of (p.ability.effect ?? []) as EffectNode[]) {
      if ('op' in n && n.op === 'grantAbility' && n.ability) out.add(n.ability)
    }
    if (p.src.id !== me.id && p.ability.scope?.who === 'unit' && p.ability.kind === 'passive') out.add(p.ability.id)
  }
  return [...out]
}
export const hasAb = (state: GameState, b: DataBundle, id: ModelId, abilityId: Id): boolean => abilitiesOf(state, b, id).includes(abilityId)
export function flagsOf(state: GameState, b: DataBundle, id: ModelId): Set<string> {
  const f = new Set<string>()
  for (const a of abilitiesOf(state, b, id)) {
    for (const n of (rec(b, a).effect ?? []) as Rec[]) if (n.code === 'coreFlag' && n.params?.flag) f.add(n.params.flag)
  }
  // Incorporeal is lost until the model's next activation once it makes a melee or ranged attack (cryx.md)
  if (f.has('incorporeal') && effectsOn(state, id).some((e) => e.sourceId === INCORPOREAL_LOST)) f.delete('incorporeal')
  // an effect that forbids Tough (Grievous Wounds) removes it
  if (f.has('tough') && effectsOn(state, id).some((e) => e.forbid?.includes('tough'))) f.delete('tough')
  return f
}
export const INCORPOREAL_LOST = 'core.incorporeal-lost'
/** A coreFlag from the model's own profile abilities or an effect's grants; never reads auras, so scope filters may call it. */
export function ownFlag(state: GameState, b: DataBundle, id: ModelId, flag: string): boolean {
  const m = state.models[id]
  if (!m) return false
  const ids = [...abilityList(b, m), ...effectsOn(state, id).flatMap((e) => (e as EffectInstance & { grants?: Id[] }).grants ?? [])]
  return ids.some((a) => ((rec(b, a).effect ?? []) as Rec[]).some((n) => n.code === 'coreFlag' && n.params?.flag === flag))
}
/** Cheap Incorporeal test (profile abilities plus effect grants; auras never grant it), used inside LOS and damage loops. */
export function isIncorporeal(state: GameState, b: DataBundle, id: ModelId): boolean {
  const m = state.models[id]
  if (!m) return false
  const es = effectsOn(state, id)
  const ids = [...abilityList(b, m), ...es.flatMap((e) => (e as EffectInstance & { grants?: Id[] }).grants ?? [])]
  const has = ids.some((a) => ((rec(b, a).effect ?? []) as Rec[]).some((n) => n.code === 'coreFlag' && n.params?.flag === 'incorporeal'))
  return has && !es.some((e) => e.sourceId === INCORPOREAL_LOST)
}
/** LOS options every call site shares: Incorporeal models never intervene, Treewalker sees through forests. */
export function losOptsFor(state: GameState, b: DataBundle, viewerId: ModelId, extra: LosOptions = {}): LosOptions {
  const v = state.models[viewerId]
  // Precision Strike: friendly models never block this viewer's LOS
  const seeThroughFriends = !!v && effectsOn(state, viewerId).some((e) => (e as EffectInstance & EffectExtras).ignoreFriendly)
  // Marshal [X] (menoth): friendly models of that kind never block the viewer's LOS
  const marshal = v && !seeThroughFriends ? new Set(marshalPassIds(state, b, viewerId)) : null
  return {
    skipModel: (m) => isIncorporeal(state, b, m.id) || hasCardGrant(state, b, m.id, 'core.a.dig-in') || (seeThroughFriends && !!v && m.owner === v.owner) || (!!marshal && marshal.has(m.id)),
    ignoreForest: hasIgnore(state, b, viewerId, 'forest'), ...extra,
  }
}
export const hasFlag = (state: GameState, b: DataBundle, id: ModelId, flag: string): boolean => flagsOf(state, b, id).has(flag)

// ---------- stats ----------
export function condMods(state: GameState, id: ModelId, stat: Stat, atk?: Pick<AttackContext, 'kind'>): StatMod[] {
  const out: StatMod[] = []
  for (const e of effectsOn(state, id)) {
    const cm = (e as EffectInstance & { condMods?: { stat: Stat; value: number; mode?: StatMod['mode']; kinds: string[] }[] }).condMods
    for (const c of cm ?? []) {
      if (c.stat === stat && atk && c.kinds.includes(atk.kind)) out.push({ stat, value: c.value, mode: c.mode ?? 'add' })
    }
  }
  return out
}
/** Stat with effect mods, passive ability mods and the movement-crippled DEF rule. `skipSpells`: Blessed ignores spell bonuses. */
export function statOf(state: GameState, b: DataBundle, id: ModelId, stat: Stat, o: { skipSpells?: boolean; baseOverride?: number; atk?: Pick<AttackContext, 'kind'> } = {}): number {
  const m = state.models[id]
  if (!m) return 0
  let base = o.baseOverride ?? ((prof(b, m).stats ?? {}) as Record<string, number>)[stat] ?? 0
  const mods: StatMod[] = []
  for (const e of effectsOn(state, id)) {
    if (o.skipSpells && /\.s\./.test(e.sourceId)) continue
    mods.push(...e.mods.filter((x) => x.stat === stat))
  }
  mods.push(...condMods(state, id, stat, o.atk))
  for (const p of appliedPassives(state, b, id)) {
    for (const n of (p.ability.effect ?? []) as Rec[]) {
      if (n.op === 'modStat' && n.stat === stat) mods.push({ stat, value: n.value ?? 0, mode: n.mode ?? 'add' })
    }
  }
  // conditions and rule seams the data cannot say (circle.md, cryx.md)
  if (stat === 'DEF' && hasCondition(state, m, 'shadowBind')) mods.push({ stat, value: -3, mode: 'add' })
  if ((stat === 'DEF' || stat === 'MAT') && hasCondition(state, m, 'blind')) mods.push({ stat, value: -4, mode: 'add' })
  if (stat === 'ARM') {
    const dp = deathPoweredArm(state, b, id)
    if (dp) mods.push({ stat, value: dp, mode: 'add' })
    const st = o.skipSpells ? 0 : scythingTouchArmPenalty(state, id)
    if (st) mods.push({ stat, value: st, mode: 'add' })
  }
  if (stat === 'DEF' && o.atk) {
    const tw = treewalkerDefBonus(state, b, id, o.atk.kind)
    if (tw) mods.push({ stat, value: tw, mode: 'add' })
  }
  if (stat === 'DEF' && (m.crippled.includes('M') || m.inert)) mods.push({ stat, value: 5, mode: 'set' })
  if (stat === 'ARM' && m.inert) {
    // inert war-engines lose Shield / Buckler bonuses (R8.9)
    return Math.max(0, base)
  }
  return computeStat(stat, base, mods)
}

/** ARM after Armor-Piercing (halve the base ARM first, then every bonus adds). */
export function armOf(state: GameState, b: DataBundle, id: ModelId, o: { armorPiercing?: boolean; blessed?: boolean } = {}): number {
  const m = state.models[id]
  if (!m) return 0
  if (!o.armorPiercing) return statOf(state, b, id, 'ARM', { skipSpells: o.blessed })
  const baseArm = ((prof(b, m).stats ?? {}) as Record<string, number>).ARM ?? 0
  const full = statOf(state, b, id, 'ARM', { skipSpells: o.blessed })
  return full - baseArm + Math.ceil(baseArm / 2)
}

/** Names of the fixed-target blast-resistance effects the two Warping Winds users still create; the live aura replaces them. */
const WARPING_WINDS_SNAPSHOTS = new Set(['Warping Winds (blast)', 'Warping Winds: Blast Resistance'])
export function resistsDamageType(state: GameState, b: DataBundle, id: ModelId, types: DamageType[]): boolean {
  const me = state.models[id]
  if (!me) return false
  // Lawgiver's Judgement (menoth): enemies in the caster's CTRL lose Resistance: Fire and cannot gain it
  if (types.includes('fire') && lawgiverStrips(state, b, id)) { types = types.filter((t) => t !== 'fire'); if (!types.length) return false }
  if (isOnTable(me) && terrainResistance(state, me.pos, baseRadius(me.base)).some((t) => types.includes(t))) return true
  for (const p of appliedPassives(state, b, id)) {
    for (const n of (p.ability.effect ?? []) as Rec[]) if (n.op === 'grantResistance' && types.includes(n.damageType)) return true
  }
  // Warping Winds (Wind Weaver, Sky Shaker): Faction models of the carrier's side within 3" resist blast, live as the models move
  if (types.includes('blast') && warpingWindsBlastResist(state, b, id)) return true
  if (types.includes('blast') && scenarioCover(state, b, id).resistBlast) return true // M13: Earthworks (Trench Warfare)
  if (types.includes('blast') && hasCardGrant(state, b, id, 'core.a.dig-in')) return true // M13 Duck and Cover: Dig In grants Resistance: Blast
  // resistance an effect carries (Fortification: Resistance: Blast) in its `resist` list; the fixed-target Warping Winds snapshots give way to the live check above
  for (const e of effectsOn(state, id)) {
    if (WARPING_WINDS_SNAPSHOTS.has(e.name)) continue
    if (((e as EffectInstance & { resist?: DamageType[] }).resist ?? []).some((t) => types.includes(t))) return true
  }
  for (const a of abilityList(b, me)) for (const n of (rec(b, a).effect ?? []) as Rec[]) if (n.op === 'grantResistance' && types.includes(n.damageType)) return true
  return false
}

/** True when a passive/aura/effect says this model cannot be knocked down (Shield Wall, Anchor, Superiority). */
export function cannotKnockDown(state: GameState, b: DataBundle, id: ModelId): boolean {
  if (effectsOn(state, id).some((e) => e.forbid?.includes('knockDown'))) return true
  for (const p of appliedPassives(state, b, id)) {
    for (const n of (p.ability.effect ?? []) as Rec[]) if (n.op === 'forbid' && n.what === 'knockDown') return true
  }
  return false
}

export function lookups(state: GameState, b: DataBundle): HitLookups {
  return {
    arm: (id) => armOf(state, b, id),
    layouts: (id) => (state.models[id] ? layoutsOf(b, state.models[id]!) : undefined),
    tough: (id) => hasFlag(state, b, id, 'tough') && !effectsOn(state, id).some((e) => e.forbid?.includes('tough')),
    noKnockdown: (id) => cannotKnockDown(state, b, id),
    immovable: (id) => isIncorporeal(state, b, id),
    sturdy: (id) => hasCardGrant(state, b, id, 'core.a.sturdy'),
    noMundaneDamage: (id) => isIncorporeal(state, b, id),
  }
}

// ---------- clouds (Pall of Ashes etc.) ----------
export function cloudsOver(state: GameState, m: ModelState): typeof state.clouds {
  return state.clouds.filter((c) => dist(c.pos, m.pos) < c.diameter / 2 + baseRadius(m.base) - 1e-9)
}
export function inPallCloud(state: GameState, m: ModelState): boolean {
  return cloudsOver(state, m).some((c) => c.effectId && state.effects.find((e) => e.id === c.effectId)?.sourceId === 'kha.f.pall-of-ashes')
}
export const ignoresGas = (state: GameState, b: DataBundle, id: ModelId): boolean =>
  abilitiesOf(state, b, id).some((a) => (rec(b, a).effect ?? []).some((n: Rec) => n.op === 'ignore' && n.ignore === 'gas'))
export function hasIgnore(state: GameState, b: DataBundle, id: ModelId, what: string, extra: Id[] = []): boolean {
  const ids = [...abilitiesOf(state, b, id), ...extra]
  return ids.some((a) => (rec(b, a).effect ?? []).some((n: Rec) => n.op === 'ignore' && n.ignore === what))
}

// ---------- condition interpreter ----------
export interface CondEnv {
  selfId: ModelId // owner of the rule (or the aura candidate)
  srcId?: ModelId // model carrying an aura
  attackerId?: ModelId
  targetId?: ModelId
  atk?: AtkCtx | null
  job?: Pick<DmgJob, 'kind'>
  act?: { killedByRanged?: boolean; killedAny?: boolean; ran?: boolean } | null
}
const subjectId = (env: CondEnv, s: string | undefined): ModelId | undefined =>
  s === 'target' ? env.targetId : s === 'attacker' ? env.attackerId : env.selfId

export function evalCond(state: GameState, b: DataBundle, node: ConditionNode | undefined, env: CondEnv): boolean {
  if (!node) return true
  const n = node as Rec
  if (n.all) return (n.all as ConditionNode[]).every((c) => evalCond(state, b, c, env))
  if (n.any) return (n.any as ConditionNode[]).some((c) => evalCond(state, b, c, env))
  if (n.not) return !evalCond(state, b, n.not, env)
  if (n.code) {
    const h = CODE_CONDITIONS[n.code]
    if (h) return h(state, b, env, n.params ?? {})
    // a faction's own condition code (registered in its cryxHooks.conditions and so on)
    const fh = codeHooks().conditions[n.code]
    return fh ? fh({ state, point: 'passive', selfId: env.selfId, activePlayer: state.activePlayer, attackerId: env.attackerId, targetId: env.targetId, params: n.params ?? {}, bundle: b } as HookContext, n.params ?? {}) : false
  }
  const sid = subjectId(env, n.subject)
  const sm = sid ? state.models[sid] : undefined
  switch (n.test) {
    case 'hit': return !!env.atk && Object.values(env.atk.x.results).some((r) => r.hit)
    case 'crit': return !!env.atk && Object.values(env.atk.x.results).some((r) => r.crit)
    case 'attackKind': return !!env.atk && (env.atk.kind === n.value || (n.value === 'ranged' && (env.atk.kind === 'aoe' || env.atk.kind === 'spray')) || (n.value === 'melee' && env.atk.kind === 'power'))
    case 'isEnemy': return !!sm && !!state.models[env.selfId] && sm.owner !== state.models[env.selfId]!.owner
    case 'isFriendly': return !!sm && !!state.models[env.selfId] && sm.owner === state.models[env.selfId]!.owner
    case 'modelType': return !!sm && sm.type === n.value
    case 'keyword': return !!sm && (((prof(b, sm).keywords ?? []) as string[]).includes(n.value) || (n.value === 'construct' && ownFlag(state, b, sm.id, 'construct')) || (n.value === 'incorporeal' && isIncorporeal(state, b, sm.id)))
    case 'baseAtLeast': return !!sm && sm.base >= n.value
    case 'baseAtMost': return !!sm && sm.base <= n.value
    case 'hasCondition': return !!sm && hasCondition(state, sm, n.value)
    case 'lifeState': return !!sm && sm.life === n.value
    case 'focusAtLeast': return !!sm && sm.focus >= n.value
    case 'systemCrippled': return !!sm && sm.crippled.includes(n.value)
    case 'withinInches': { const o = state.models[n.of === 'target' ? env.targetId ?? '' : env.srcId ?? env.selfId]; return !!sm && !!o && sm.id !== o.id && within(sm, o, n.dist) }
    case 'b2b': {
      if (!sm) return false
      const against = env.srcId && env.srcId !== sm.id ? [state.models[env.srcId]!] : sm.unitId ? (state.units[sm.unitId]?.troopers ?? []).filter((t) => t !== sm.id).map((t) => state.models[t]!) : []
      return against.some((o) => alive(o) && touching(sm, o))
    }
    case 'concealed': return !!sm && concealedNow(state, sm)
    case 'isPrey': return !!sm && !!env.attackerId && isPreyOf(state, env.attackerId, sm.id)
    case 'charged': return !!env.atk?.chargeAttack
    case 'damageType': return !!env.atk && env.atk.damageQueue.some((d) => d.damageTypes.includes(n.value))
    case 'weaponQuality': return !!env.atk?.weaponId && ((rec(b, env.atk.weaponId).qualities ?? []) as Id[]).some((q) => q.endsWith(`.${n.value}`) || q === n.value)
    case 'weaponLocation': return env.atk?.x.wloc === n.value
    case 'inCtrl': { const c = state.models[env.srcId ?? env.selfId]; return !!c && !!sm && within(c, sm, statOf(state, b, c.id, 'CTRL')) }
    case 'engaged': return false
    case 'living': return !!sm && isLivingModel(state, b, sm.id)
    case 'undead': return !!sm && ((prof(b, sm).keywords ?? []) as string[]).includes('undead')
    case 'hasAbility': return !!sm && abilitiesOf(state, b, sm.id).includes(n.value)
    case 'hasEffect': return !!sm && effectsOn(state, sm.id).some((e) => e.sourceId === n.value || e.name === n.value)
    case 'tokensAtLeast': { const t = sm?.tokens ?? {}; const have = n.token ? (t as Record<string, number>)[n.token] ?? 0 : Object.values(t).reduce((a, v) => a + (v ?? 0), 0); return have >= (n.value ?? 1) }
    case 'furyAtLeast': return !!sm && (sm.fury ?? 0) >= (n.value ?? 1)
    case 'aspectCrippled': return !!sm && sm.crippled.includes(ASPECT_LETTER[n.value as keyof typeof ASPECT_LETTER] ?? '')
    case 'frenzied': return !!sm && !!sm.frenzied
    case 'inBattlegroup': { const w = state.models[env.srcId ?? env.selfId]; return !!sm && !!w && sm.type === 'beast' && sm.controllerId === w.id }
    case 'inLos': return true
    case 'isCharacter': return !!sm && !!prof(b, sm).character
    case 'elevatedOver': return !!sm && !!env.targetId && sm.elev - (state.models[env.targetId]?.elev ?? 0) >= 1
    default: return false
  }
}

/** Living = neither a construct nor undead (RB token rule). */
export function isLivingModel(state: GameState, b: DataBundle, id: ModelId): boolean {
  const m = state.models[id]
  if (!m) return false
  const k = (prof(b, m).keywords ?? []) as string[]
  return !ownFlag(state, b, id, 'construct') && !k.includes('construct') && !k.includes('undead')
}

export function concealedNow(state: GameState, m: ModelState): boolean {
  return state.clouds.some((c) => c.concealment !== false && c.kind !== 'flare' && dist(c.pos, m.pos) + baseRadius(m.base) <= c.diameter / 2 + 1e-6)
    || insideCoverOf(state, m.pos, baseRadius(m.base)) === 'concealment'
}
export function isPreyOf(state: GameState, attackerId: ModelId, targetId: ModelId): boolean {
  const a = state.models[attackerId]
  if (!a?.unitId) return false
  return state.units[a.unitId]?.preyId === targetId
}

const CODE_CONDITIONS: Record<string, (state: GameState, b: DataBundle, env: CondEnv, p: Rec) => boolean> = {
  destroyedEnemyThisActivation: (_s, _b, env) => !!env.act?.killedAny || (!!env.atk && env.atk.x.destroyed.length > 0),
  destroyedEnemyWithBasicRanged: (_s, _b, env) => !!env.atk && env.atk.x.basicRanged && env.atk.x.destroyed.length > 0,
  destroyedEnemyWithRangedThisActivation: (_s, _b, env) => !!env.act?.killedByRanged,
}

/** Names of the code conditions evalCond understands (data `when: {code}`), for the data-coverage test. */
export const knownCodeConditions = (): string[] => Object.keys(CODE_CONDITIONS)

// ---------- code-hook registry (merges core + faction tables) ----------
export const hookEnvKey = '__bundle'
export interface HookEnv extends HookContext { bundle: DataBundle }
export const envOf = (c: HookContext): HookEnv => c as HookEnv
export const noop = (c: HookContext): HookResult => ({ state: c.state, events: [] })

/**
 * Cavalry (core.a.cavalry, reached from the coreFlag `cavalry` through abilitiesOf): the attack roll of the model's charge attack is boosted
 * with no focus spent (RB p112). The damage roll of a charge attack is boosted by the charge rule itself. Runs at attack.declared, after
 * the data's `when: charged` test.
 */
const coreCavalry = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a?.chargeAttack || a.x.boosted) return noop(c)
  return { state: setAtk(c.state, { ...a, x: { ...a.x, boosted: true, flags: { ...a.x.flags, freeBoost: true } } }), events: [] }
}

export const coreHooks: CodeHookRegistry = {
  conditions: {},
  effects: {
    coreFlag: noop,
    coreCavalry,
  },
}

// ---------- attack plugins: per-attack seams for faction rules the descriptors cannot say ----------
export interface AttackPlugin {
  id: string
  /** extra flat damage on a roll */
  damageFlat?(state: GameState, b: DataBundle, atk: AtkCtx, job: DmgJob): number
  /** extra damage dice on a direct damage roll (Heroic Inspiration) */
  damageDice?(state: GameState, b: DataBundle, atk: AtkCtx, job: DmgJob): number
  /** extra damage types the attack's damage carries (Conflagration and the Incendiary arrow are fire) */
  damageTypes?(state: GameState, b: DataBundle, atk: AtkCtx): DamageType[]
  /** the attack roll is final and nothing has been triggered yet: may change who the hits land on (Shield Guard) */
  beforeHits?(state: GameState, b: DataBundle, atk: AtkCtx): { state: GameState; events: GameEvent[] } | null
  /** the damage points of a roll before they are applied: may replace them (Holy Martyrs); null leaves them as they are */
  adjustPoints?(state: GameState, b: DataBundle, atk: AtkCtx, job: DmgJob, points: number): { state: GameState; events: GameEvent[]; points: number } | null
  /** a direct hit landed (before damage) */
  onHit?(state: GameState, b: DataBundle, atk: AtkCtx, targetId: ModelId): { state: GameState; events: GameEvent[] }
  /** after the attack resolved (everything applied) */
  onResolved?(state: GameState, b: DataBundle, atk: AtkCtx): { state: GameState; events: GameEvent[] }
  /** the target was boxed: may demand RFP and a blast */
  onBoxed?(state: GameState, b: DataBundle, atk: AtkCtx, targetId: ModelId, job: DmgJob): { removeFromPlay: boolean; denyTough: boolean; burst?: { pow: number; radius: number; types: DamageType[] } } | null
}
/**
 * Core plugins (Skirmish WP-CORE). Magical weapons: an effect that carries `magicalWeapons` (Guidance) makes the weapon attacks of the model it
 * is on deal magical damage, as Wraithbane does; spells are magical already.
 */
export const corePlugins: AttackPlugin[] = [{
  id: 'core.magical-weapons',
  damageTypes(state, _b, atk) {
    if (!atk.weaponId || atk.spellId) return []
    return effectsOn(state, atk.attackerId).some((e) => (e as EffectInstance & { magicalWeapons?: boolean }).magicalWeapons) ? ['magical'] : []
  },
}]
// Lazy: faction files import helpers from this file, so the tables are built on first use (avoids an import cycle at load).
let pluginCache: AttackPlugin[] | null = null
export const plugins = (): AttackPlugin[] => (pluginCache ??= [...corePlugins, ...cygnarPlugins, ...khadorPlugins, ...trollbloodsPlugins, ...circlePlugins, ...cryxPlugins, ...menothPlugins])
let hookCache: CodeHookRegistry | null = null
export const codeHooks = (): CodeHookRegistry => (hookCache ??= {
  conditions: {
    ...coreHooks.conditions, ...cygnarHooks.conditions, ...khadorHooks.conditions, ...trollbloodsHooks.conditions,
    ...circleHooks.conditions, ...cryxHooks.conditions, ...menothHooks.conditions,
  },
  effects: {
    ...coreHooks.effects, ...cygnarHooks.effects, ...khadorHooks.effects, ...trollbloodsHooks.effects,
    ...circleHooks.effects, ...cryxHooks.effects, ...menothHooks.effects,
  },
})
export function runCodeEffect(state: GameState, b: DataBundle, code: string, ctx: Omit<HookContext, 'state'>, params: Rec = {}): HookResult {
  const h = codeHooks().effects[code]
  if (!h) return { state, events: [] }
  return h({ ...(ctx as HookContext), state, params, ...( { bundle: b } as object) } as HookContext, params)
}

// ---------- small shared helpers ----------
export const dist2 = (a: Vec2, c: Vec2): number => dist(a, c)
export const addMod = (mods: Mod[], source: string, label: string, value: number): Mod[] => (value === 0 ? mods : [...mods, { source, label, value, mode: 'add' }])
export function setModel(s: GameState, m: ModelState): GameState { return { ...s, models: { ...s.models, [m.id]: m } } }
export function setAtk(s: GameState, a: AtkCtx): GameState { return { ...s, attack: a as AttackContext } }

// ---------- activation scratch (lives in state.activation.x; JSON-safe) ----------
export interface MoveReq { modelId: ModelId; dist: number; mode: 'advance' | 'place'; toward?: ModelId; abilityId: Id; endsActivation?: boolean; owner: 'A' | 'B'; optional?: boolean; cost?: { focus: number } }
export interface ActX {
  stage: 'start' | 'movement' | 'move' | 'chargeTarget' | 'chargeMove' | 'slamTarget' | 'slamMove' | 'trampleMove' | 'place' | 'combat' | 'endMove' | 'frenzy' | 'done'
  queue: ModelId[] // troopers still to take their Combat Action
  cur: ModelId | null
  forfeit: ModelId[] // Combat Action forfeited
  failedCharge: boolean
  meleeOnly: ModelId[] // after a charge: initial melee / melee star attack only
  chargeAttackFor: ModelId | null // trooper whose first melee attack vs the charge target is a charge attack
  killedAny: boolean
  killedByRanged: boolean
  mage: Record<string, number> // Mage Storm: hits per target with the chain weapon
  endMoves: ModelId[] // models still to be offered end-of-activation movement
  endMoveDone: boolean
  channelVia: ModelId | null
  moveReq?: MoveReq
  standUpUsed: boolean
  pendingMove?: { kind: 'advance' | 'run' }
  placeAfter?: unknown // unit placement continuation (activation.ts PlaceAfter)
  chargeTo?: ModelId // declared charge target while the charge move is pending
  star?: { modelId: ModelId; abilityId: Id; weaponId: Id }
  powerKind?: import('./types').PowerAttackKind
  slam?: { targetId: ModelId; moved: number } // R7.12: the declared slam target and the inches moved toward it
  endMoved: ModelId[]
  startQueue?: string[] // optional activation.start abilities still to be offered ("<modelId>|<abilityId>")
  extraMelee?: Record<ModelId, number> // Blood Rage: extra melee attacks bought with corpse tokens
  ward?: { cont: unknown; unitForfeit: ModelId[]; queue: { effectId: string; modelId: ModelId }[] } // Admonition wards still to answer after a move
  assault?: ModelId[] // Assault: models with the rule still to be offered their free ranged attack at the charged model (M12 follow-ups)
}
export type ActCtx = import('./types').ActivationContext & { x: ActX }
export const actOf = (s: GameState): ActCtx | null => (s.activation as ActCtx | null)
