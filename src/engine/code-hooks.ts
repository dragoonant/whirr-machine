// Data access, passive-ability evaluation, stats for attacks, condition/effect interpreter, and the code-hook registry
// (every {code} escape hatch the starter data references). Pure: state in, state out. All data comes in as `bundle`.
import type { GameEvent } from './events'
import type { CodeHookRegistry, ConditionNode, EffectNode, HookContext, HookResult } from './hooks'
import { computeStat } from './dice'
import { effectsOn, hasCondition } from './effects'
import { baseRadius, dist, isOnTable } from './geometry'
import { modelDistance, within } from './measure'
import { insideCoverOf, terrainResistance } from './terrain'
import type { GridLayout } from './damage'
import type { HitLookups } from './movement'
import type {
  AttackContext, DamageType, DataBundle, EffectInstance, GameState, Id, ModelId, ModelState, Mod, Stat, StatMod, Vec2,
} from './types'
import { cygnarHooks, cygnarPlugins } from './factions/cygnar'
import { khadorHooks, khadorPlugins } from './factions/khador'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rec = Record<string, any>
export const rec = (b: DataBundle, id: Id | undefined): Rec => ((id ? b.byId[id] : undefined) ?? {}) as Rec
export const prof = (b: DataBundle, m: Pick<ModelState, 'profileId'>): Rec => rec(b, m.profileId)

// ---------- runtime attack scratch (lives in state.attack.x; JSON-safe) ----------
export interface DmgJob { id: string; targetId: ModelId; kind: 'direct' | 'blast'; pow: number; types: DamageType[]; autoBoost?: boolean; unboostable?: boolean }
export interface AtkX {
  stage: 'start' | 'powerfulWait' | 'boostWait' | 'roll' | 'dmgNext' | 'dmgBoostWait' | 'dmgRoll' | 'pfWait' | 'applyDmg' | 'boxWait' | 'resolved' | 'trigWait' | 'moveWait' | 'done'
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
  cur?: { addDice: number; flat: number; boost: boolean; dropLowest: boolean; points?: number; rollId?: string; armorPiercing: boolean }
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
export const weaponRange = (w: Rec): number => (typeof w.rng === 'number' ? w.rng : isSpray(w) ? Number(String(w.rng).slice(2)) : 0)
export const weaponCrippled = (m: ModelState, loc: string): boolean => loc !== '-' && m.crippled.includes(loc)
export const layoutsOf = (b: DataBundle, m: ModelState): GridLayout[] | undefined => {
  const d = prof(b, m).damage
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

function scopeMatch(state: GameState, b: DataBundle, src: ModelState, cand: ModelState, scope: Rec | undefined): boolean {
  const who = scope?.who ?? 'self'
  if (who === 'self') return src.id === cand.id
  if (who === 'unit') return !!src.unitId && src.unitId === cand.unitId
  if (who === 'warEngines') return cand.type === 'warEngine' && cand.owner === src.owner
  if (who === 'friendly') {
    if (cand.owner !== src.owner) return false
    const r = scope?.range
    if (r !== undefined && r !== null) {
      const lim = r === 'CTRL' ? statOf(state, b, src.id, 'CTRL') : (r as number)
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
  return out
}

/** Ability ids the model has: its own plus any granted by auras. */
export function abilitiesOf(state: GameState, b: DataBundle, id: ModelId): Id[] {
  const me = state.models[id]
  if (!me) return []
  const out = new Set<Id>(abilityList(b, me))
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
  return f
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

export function resistsDamageType(state: GameState, b: DataBundle, id: ModelId, types: DamageType[]): boolean {
  const me = state.models[id]
  if (!me) return false
  if (isOnTable(me) && terrainResistance(state, me.pos, baseRadius(me.base)).some((t) => types.includes(t))) return true
  for (const p of appliedPassives(state, b, id)) {
    for (const n of (p.ability.effect ?? []) as Rec[]) if (n.op === 'grantResistance' && types.includes(n.damageType)) return true
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
    tough: (id) => hasFlag(state, b, id, 'tough'),
    noKnockdown: (id) => cannotKnockDown(state, b, id),
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
  if (n.code) { const h = CODE_CONDITIONS[n.code]; return h ? h(state, b, env, n.params ?? {}) : false }
  const sid = subjectId(env, n.subject)
  const sm = sid ? state.models[sid] : undefined
  switch (n.test) {
    case 'hit': return !!env.atk && Object.values(env.atk.x.results).some((r) => r.hit)
    case 'crit': return !!env.atk && Object.values(env.atk.x.results).some((r) => r.crit)
    case 'attackKind': return !!env.atk && (env.atk.kind === n.value || (n.value === 'ranged' && (env.atk.kind === 'aoe' || env.atk.kind === 'spray')) || (n.value === 'melee' && env.atk.kind === 'power'))
    case 'isEnemy': return !!sm && !!state.models[env.selfId] && sm.owner !== state.models[env.selfId]!.owner
    case 'isFriendly': return !!sm && !!state.models[env.selfId] && sm.owner === state.models[env.selfId]!.owner
    case 'modelType': return !!sm && sm.type === n.value
    case 'keyword': return !!sm && ((prof(b, sm).keywords ?? []) as string[]).includes(n.value) || (!!sm && n.value === 'construct' && hasFlag(state, b, sm.id, 'construct'))
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
    case 'inLos': return true
    case 'isCharacter': return !!sm && !!prof(b, sm).character
    case 'elevatedOver': return !!sm && !!env.targetId && sm.elev - (state.models[env.targetId]?.elev ?? 0) >= 1
    default: return false
  }
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

export const coreHooks: CodeHookRegistry = {
  conditions: {},
  effects: {
    coreFlag: noop,
  },
}

// ---------- attack plugins: per-attack seams for faction rules the descriptors cannot say ----------
export interface AttackPlugin {
  id: string
  /** extra flat damage on a roll */
  damageFlat?(state: GameState, b: DataBundle, atk: AtkCtx, job: DmgJob): number
  /** a direct hit landed (before damage) */
  onHit?(state: GameState, b: DataBundle, atk: AtkCtx, targetId: ModelId): { state: GameState; events: GameEvent[] }
  /** after the attack resolved (everything applied) */
  onResolved?(state: GameState, b: DataBundle, atk: AtkCtx): { state: GameState; events: GameEvent[] }
  /** the target was boxed: may demand RFP and a blast */
  onBoxed?(state: GameState, b: DataBundle, atk: AtkCtx, targetId: ModelId, job: DmgJob): { removeFromPlay: boolean; denyTough: boolean; burst?: { pow: number; radius: number; types: DamageType[] } } | null
}
// Lazy: faction files import helpers from this file, so the tables are built on first use (avoids an import cycle at load).
let pluginCache: AttackPlugin[] | null = null
export const plugins = (): AttackPlugin[] => (pluginCache ??= [...cygnarPlugins, ...khadorPlugins])
let hookCache: CodeHookRegistry | null = null
export const codeHooks = (): CodeHookRegistry => (hookCache ??= {
  conditions: { ...coreHooks.conditions, ...cygnarHooks.conditions, ...khadorHooks.conditions },
  effects: { ...coreHooks.effects, ...cygnarHooks.effects, ...khadorHooks.effects },
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
export interface MoveReq { modelId: ModelId; dist: number; mode: 'advance' | 'place'; toward?: ModelId; abilityId: Id; endsActivation?: boolean; owner: 'A' | 'B'; optional?: boolean }
export interface ActX {
  stage: 'start' | 'movement' | 'move' | 'chargeTarget' | 'chargeMove' | 'slamTarget' | 'slamMove' | 'trampleMove' | 'place' | 'combat' | 'endMove' | 'done'
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
}
export type ActCtx = import('./types').ActivationContext & { x: ActX }
export const actOf = (s: GameState): ActCtx | null => (s.activation as ActCtx | null)
