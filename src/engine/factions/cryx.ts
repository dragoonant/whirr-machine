// Cryx (Necrofactorium, Nekane) code hooks and attack plugins: every {code} this faction's data references (docs/spec/factions/cryx.md).
// Soul tokens live in ModelState.tokens; events TokenGained / TokenSpent. Data-only rules (Dodge, Wraithbinder, Volume Fire,
// Critical Corrosion, Banish, Wraithbinder...) need no code here. Core drives the rest: start-of-activation offers, special actions, LOS, movement and damage rules (core-m9 tests).
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import { applyEffect, removeEffect } from '../effects'
import { applyDamage, healDamage } from '../damage'
import { rollD3 } from '../dice'
import { gainFocus, spendFocus, isRejection } from '../focus'
import { dist, isLegalPlacement, isOnTable } from '../geometry'
import { relocate } from '../movement'
import { raise } from '../pending'
import { modelDistance, within } from '../measure'
import {
  abilitiesOf, atkOf, envOf, hasFlag, layoutsOf, noop, prof, rec, setAtk, type AtkCtx, type AttackPlugin,
} from '../code-hooks'
import type { DataBundle, DecisionOption, GameState, Id, ModelId, ModelState, PendingDecision, Rejection, TokenKind, Vec2 } from '../types'
import type { Action } from '../actions'
import type { GameEvent } from '../events'

export const SOUL_CAP = 3
export const SOUL_RANGE = 10
export const MORTAL_FEAR_RANGE = 8
export const SOUL_CANNON = 'cry.w.soul-cannon'
const COLLECTOR = 'cry.a.soul-taker-collector'
const MORTAL_FEAR = 'cry.a.mortal-fear'

// ---------- tokens ----------
export const tokensOf = (m: ModelState | undefined, kind: TokenKind): number => m?.tokens?.[kind] ?? 0
const put = (s: GameState, m: ModelState): GameState => ({ ...s, models: { ...s.models, [m.id]: m } })

export function gainToken(state: GameState, id: ModelId, kind: TokenKind, count = 1, fromId?: ModelId): { state: GameState; events: GameEvent[] } {
  const m = state.models[id]
  if (!m || count <= 0) return { state, events: [] }
  const after = tokensOf(m, kind) + count
  const ev: GameEvent = { type: 'TokenGained', modelId: id, token: kind, count, after, ...(fromId ? { fromId } : {}) } as GameEvent
  return { state: put(state, { ...m, tokens: { ...m.tokens, [kind]: after } }), events: [ev] }
}
export function spendToken(state: GameState, id: ModelId, kind: TokenKind, count = 1, sourceId?: Id): { state: GameState; events: GameEvent[] } | null {
  const m = state.models[id]
  if (!m || tokensOf(m, kind) < count) return null
  const after = tokensOf(m, kind) - count
  const ev: GameEvent = { type: 'TokenSpent', modelId: id, token: kind, count, after, ...(sourceId ? { sourceId } : {}) } as GameEvent
  return { state: put(state, { ...m, tokens: { ...m.tokens, [kind]: after } }), events: [ev] }
}

// ---------- classification ----------
const keywords = (b: DataBundle, m: ModelState): string[] => (prof(b, m).keywords ?? []) as string[]
/** Living = neither a construct nor undead (RB p97 token rule; docs/spec/factions/cryx.md). */
export function isLiving(state: GameState, b: DataBundle, id: ModelId): boolean {
  const m = state.models[id]
  if (!m) return false
  const k = keywords(b, m)
  return !hasFlag(state, b, id, 'construct') && !k.includes('construct') && !k.includes('undead')
}
export const isSoulTaker = (state: GameState, b: DataBundle, id: ModelId): boolean => abilitiesOf(state, b, id).includes(COLLECTOR)
const takersOf = (state: GameState, b: DataBundle, owner: ModelState['owner']): ModelState[] =>
  Object.values(state.models).filter((m) => m.owner === owner && isOnTable(m) && m.life === 'active' && isSoulTaker(state, b, m.id) && tokensOf(m, 'soul') < SOUL_CAP)

/**
 * Soul Taker: a living enemy of the Taker died. The nearest eligible Taker within 10" with room gains a soul (RB p97).
 * `anywhere` (Devour Soul): any friendly Taker with room, preferring `prefer`.
 */
export function awardSoul(state: GameState, b: DataBundle, deadId: ModelId, opt: { owner?: ModelState['owner']; anywhere?: boolean; prefer?: ModelId } = {}): { state: GameState; events: GameEvent[]; takerId?: ModelId } {
  const dead = state.models[deadId]
  if (!dead || !isLiving(state, b, deadId)) return { state, events: [] }
  const owners = opt.owner ? [opt.owner] : (['A', 'B'] as const).filter((o) => o !== dead.owner)
  let pool = owners.flatMap((o) => takersOf(state, b, o)).filter((t) => t.owner !== dead.owner)
  if (!opt.anywhere) pool = pool.filter((t) => modelDistance(t, dead) <= SOUL_RANGE + 1e-6)
  if (!pool.length) return { state, events: [] }
  const pref = opt.prefer ? pool.find((t) => t.id === opt.prefer) : undefined
  const taker = pref ?? pool.sort((x, y) => modelDistance(x, dead) - modelDistance(y, dead))[0]!
  const g = gainToken(state, taker.id, 'soul', 1, deadId)
  return { state: g.state, events: g.events, takerId: taker.id }
}

// ---------- attack scratch helpers ----------
const patchX = (c: HookContext, patch: Record<string, unknown>): HookResult => {
  const a = atkOf(c.state)
  if (!a) return noop(c)
  return { state: setAtk(c.state, { ...a, x: { ...a.x, ...patch } }), events: [] }
}

// ---------- code hooks ----------
/** Blessed (Rune Thrower): the attack ignores spell and animus bonuses to ARM and DEF. */
const cryBlessed = (c: HookContext): HookResult => patchX(c, { blessed: true })

/** Shadow Fire (Soul Cannon): the model hit stops blocking LOS for a turn (los.ts reads forbid 'blocksLos'). */
const cryShadowFire = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || !c.targetId || !a.x.results[c.targetId]?.hit) return noop(c)
  const me = c.state.models[c.selfId]!
  const r = applyEffect(c.state, { sourceId: 'cry.a.shadow-fire', name: 'Shadow Fire', owner: me.owner, casterId: c.selfId, targetIds: [c.targetId], mods: [], forbid: ['blocksLos'], duration: 'turn' })
  return { state: r.state, events: r.events }
}

/**
 * Wraith Shot: a Soul Cannon attack by a model holding a soul spends it for a free boost to the attack roll and (via
 * wraithShotDamage) the damage roll. RULING: runs automatically while a soul is held (no prompt at attack.declared).
 * Core offers it as a choice (declOpt prompt) and, when the target is out of sight, forces it; measure() reads the `wraithShot` flag to ignore
 * cover and concealment.
 */
const wraithShot = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a || a.weaponId !== SOUL_CANNON || a.x.flags.wraithShot) return noop(c)
  const sp = spendToken(c.state, c.selfId, 'soul', 1, 'cry.a.wraith-shot')
  if (!sp) return noop(c)
  const r = patchX({ ...c, state: sp.state }, { boosted: true, flags: { ...a.x.flags, wraithShot: true } })
  return { state: r.state, events: sp.events }
}
const wraithShotDamage = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a?.x.flags.wraithShot || !a.x.cur) return noop(c)
  return patchX(c, { cur: { ...a.x.cur, boost: true } })
}

/** Soul Taker: Collector (death.destroyed). `targetId` is the dead model. Also driven by the attack plugin below. */
const soulTaker = (c: HookContext): HookResult => {
  if (!c.targetId) return noop(c)
  const taker = c.state.models[c.selfId]
  if (!taker) return noop(c)
  const r = awardSoul(c.state, envOf(c).bundle, c.targetId, { owner: taker.owner, prefer: c.selfId })
  return { state: r.state, events: r.events }
}
/** Devour Soul (death.destroyed): the weapon's owner picks the Taker (we pick the weapon holder), no range limit. */
const devourSoul = (c: HookContext): HookResult => {
  if (!c.targetId) return noop(c)
  const taker = c.state.models[c.selfId]
  if (!taker) return noop(c)
  const r = awardSoul(c.state, envOf(c).bundle, c.targetId, { owner: taker.owner, anywhere: true, prefer: c.selfId })
  return { state: r.state, events: r.events }
}

/** Shadow Gate (attack.resolved, after the player accepts): spend a corpse (else soul) token, then place within 2". Once per turn. */
const shadowGate = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  const me = c.state.models[c.selfId]
  if (!a || !me || a.attackerId !== c.selfId || a.x.moveReq) return noop(c)
  if (c.state.effects.some((e) => e.sourceId === 'cry.a.shadow-gate' && e.targetIds.includes(c.selfId))) return noop(c)
  const kind: TokenKind | null = tokensOf(me, 'corpse') > 0 ? 'corpse' : tokensOf(me, 'soul') > 0 ? 'soul' : null
  if (!kind) return noop(c)
  const sp = spendToken(c.state, c.selfId, kind, 1, 'cry.a.shadow-gate')!
  const used = applyEffect(sp.state, { sourceId: 'cry.a.shadow-gate', name: 'Shadow Gate used', owner: me.owner, casterId: c.selfId, targetIds: [c.selfId], mods: [], duration: 'turn' })
  const a2 = atkOf(used.state)!
  const moveReq = { modelId: c.selfId, dist: 2, mode: 'place' as const, abilityId: 'cry.a.shadow-gate', owner: me.owner, optional: true }
  return { state: setAtk(used.state, { ...a2, x: { ...a2.x, moveReq } } as AtkCtx), events: [...sp.events, ...used.events] }
}

/** Soul Generator (activation.start): turn soul tokens into focus, up to the focus cap (offered by beginActivation's start queue). */
const soulGenerator = (c: HookContext): HookResult => {
  const m = c.state.models[c.selfId]
  if (!m) return noop(c)
  const have = tokensOf(m, 'soul')
  if (have < 1) return noop(c)
  const g = gainFocus(c.state, c.selfId, have, 'gain')
  if (g.gained < 1) return noop(c)
  const sp = spendToken(g.state, c.selfId, 'soul', g.gained, 'cry.a.soul-generator')!
  return { state: sp.state, events: [...g.events, ...sp.events] }
}

/**
 * Grappling Hook (activation.end): offer a place move of 5" through the end-of-activation move request; core pays the 1 focus when
 * the move is taken (the request carries the cost), so declining it costs nothing.
 */
const grapplingHook = (c: HookContext): HookResult => {
  const m = c.state.models[c.selfId]
  const act = c.state.activation as (typeof c.state.activation & { x: Record<string, unknown> }) | null
  if (!m || !act || m.focus < 1 || m.crippled.includes('C')) return noop(c)
  // the focus is paid by core when the move is taken (the request carries the cost); declining it costs nothing
  const moveReq = { modelId: c.selfId, dist: 5, mode: 'place' as const, abilityId: 'cry.a.grappling-hook', owner: m.owner, optional: true, cost: { focus: 1 } }
  return { state: { ...c.state, activation: { ...act, x: { ...act.x, moveReq } } as typeof c.state.activation }, events: [] }
}

/**
 * Vital Magic (spell.expire): keeps each upkeep spell in params.effectIds by taking d3 damage per spell kept.
 * Core's spells.forceExpire does the same for a forced expiry (Banishing Ward); this hook is the older direct form.
 */
const vitalMagic = (c: HookContext): HookResult => {
  const ids = (c.params?.effectIds as string[] | undefined) ?? []
  const me = c.state.models[c.selfId]
  if (!me || !ids.length) return noop(c)
  let state = c.state
  const events: GameEvent[] = []
  for (const id of ids) {
    if (!state.effects.some((e) => e.id === id && e.casterId === c.selfId)) continue
    const d = rollD3(state)
    state = d.state; events.push(d.event)
    const ap = applyDamage(state, c.selfId, d.value, { source: 'direct', layouts: layoutsOf(envOf(c).bundle, state.models[c.selfId]!) })
    state = ap.state; events.push(...ap.events)
  }
  return { state, events }
}

/** Repair [d3+3] (star Action on a friendly construct in 1"); core offers it from the model's combat choices. */
const repair = (c: HookContext): HookResult => {
  const src = c.state.models[c.selfId]
  const t = c.targetId ? c.state.models[c.targetId] : undefined
  const b = envOf(c).bundle
  if (!src || !t || t.owner !== src.owner || !isOnTable(t) || !within(src, t, 1) || !hasFlag(c.state, b, t.id, 'construct')) return noop(c)
  const flat = Number(c.params?.flat ?? 3)
  const d = rollD3(c.state)
  const h = healDamage(d.state, t.id, d.value + flat, layoutsOf(b, t))
  return { state: h.state, events: [d.event, ...h.events] }
}

/** Exhaust Fumes (movement.end after an advance): friendly models within 3" gain a round-long marker; defFor reads it as granted concealment. */
const exhaustFumes = (c: HookContext): HookResult => {
  const me = c.state.models[c.selfId]
  if (!me) return noop(c)
  const ids = Object.values(c.state.models).filter((m) => m.id !== me.id && m.owner === me.owner && isOnTable(m) && within(me, m, 3)).map((m) => m.id)
  if (!ids.length) return noop(c)
  const r = applyEffect(c.state, { sourceId: 'cry.a.exhaust-fumes', name: 'Exhaust Fumes', owner: me.owner, casterId: me.id, targetIds: ids, mods: [], duration: 'round' })
  return { state: r.state, events: r.events }
}

/** Feat Wrath of Lyliss: useFeat already creates the round effect; castSpell and the boost steps pay with damage while it lasts (see wrathActive). */
const wrathOfLyliss = (c: HookContext): HookResult => noop(c)
/** True while Nekane's Wrath of Lyliss effect is on her (for the core spell and boost payment code). */
export const wrathActive = (state: GameState, casterId: ModelId): boolean =>
  state.effects.some((e) => e.sourceId === 'cry.f.wrath-of-lyliss' && e.targetIds.includes(casterId))

/**
 * Crippling Grasp (offensive spell hit): -2 SPD, DEF and ARM and -2 on melee damage rolls for as long as the upkeep is kept.
 * RULING: the unit version is not built; one enemy model per cast, and a re-cast on a new target moves the effect.
 */
const cryCripplingGrasp = (c: HookContext): HookResult => {
  const caster = c.state.models[c.selfId]
  const t = c.targetId ? c.state.models[c.targetId] : undefined
  if (!caster || !t || t.owner === caster.owner || !isOnTable(t)) return noop(c)
  let s = c.state
  const events: GameEvent[] = []
  for (const e of s.effects.filter((x) => x.sourceId === 'cry.s.crippling-grasp' && x.casterId === caster.id)) { const r = removeEffect(s, e.id, 'replaced'); s = r.state; events.push(...r.events) }
  const made = applyEffect(s, {
    sourceId: 'cry.s.crippling-grasp', name: 'Crippling Grasp', owner: caster.owner, casterId: caster.id, targetIds: [t.id],
    mods: [{ stat: 'SPD', value: -2, mode: 'add' }, { stat: 'DEF', value: -2, mode: 'add' }, { stat: 'ARM', value: -2, mode: 'add' }],
    rollMods: [{ roll: 'damage', value: -2, kinds: ['melee', 'power'] }], duration: 'upkeep', upkeep: { casterId: caster.id },
  })
  s = made.state; events.push(...made.events)
  s = { ...s, upkeeps: { ...s.upkeeps, [t.id]: { ...s.upkeeps[t.id], enemy: made.effect.id } } }
  return { state: s, events }
}

export const cryxHooks: CodeHookRegistry = {
  conditions: {},
  effects: {
    cryBlessed, cryShadowFire, wraithShot, wraithShotDamage, soulTaker, devourSoul, shadowGate, soulGenerator, grapplingHook,
    vitalMagic, repair, exhaustFumes, wrathOfLyliss, cryCripplingGrasp,
  },
}

// ---------- attack plugins ----------
/** Mortal Fear: a living model that attacks a side with a Fury within 8" takes -2 on its damage rolls (same-name effects do not stack). */
const mortalFear = (state: GameState, b: DataBundle, attackerId: ModelId): number => {
  const at = state.models[attackerId]
  if (!at || !isLiving(state, b, attackerId)) return 0
  const near = Object.values(state.models).some((f) => f.owner !== at.owner && isOnTable(f) && f.life === 'active'
    && ((prof(b, f).abilities ?? []) as Id[]).includes(MORTAL_FEAR) && modelDistance(f, at) <= MORTAL_FEAR_RANGE + 1e-6)
  return near ? -2 : 0
}

export const cryxPlugins: AttackPlugin[] = [{
  id: 'cry.souls-and-fear',
  damageFlat(state, b, atk) {
    return mortalFear(state, b, atk.attackerId)
  },
  onResolved(state, b, atk) {
    let st = state
    const events: GameEvent[] = []
    const devour = atk.weaponId === SOUL_CANNON && ((rec(b, SOUL_CANNON).abilities ?? []) as Id[]).includes('cry.a.devour-soul')
    for (const id of atk.x.destroyed) {
      const dead = st.models[id]
      const killer = st.models[atk.attackerId]
      if (!dead || !killer || dead.owner === killer.owner) continue // no souls from friendly deaths
      const r = devour && isSoulTaker(st, b, atk.attackerId)
        ? awardSoul(st, b, id, { owner: killer.owner, anywhere: true, prefer: atk.attackerId })
        : awardSoul(st, b, id)
      st = r.state; events.push(...r.events)
    }
    return { state: st, events }
  },
}]

// ---------- Apparition (Mirage): a Control Phase place move of up to 2" ----------
const APPARITION = 'cry.a.apparition'
export const APPARITION_RANGE = 2
const APPARITION_USED = 'cry.a.apparition-used'
/** Models of the player that carry Apparition (from a Mirage grant) and have not used or declined it this turn. */
export function apparitionQueue(state: GameState, b: DataBundle, player: ModelState['owner']): ModelId[] {
  return Object.values(state.models)
    .filter((m) => m.owner === player && isOnTable(m) && m.life === 'active'
      && abilitiesOf(state, b, m.id).includes(APPARITION)
      && !state.effects.some((e) => e.sourceId === APPARITION_USED && e.targetIds.includes(m.id)))
    .map((m) => m.id).sort()
}

/** Raise the place decision for the next Apparition model, or null when none is left. */
export function raiseApparition(state: GameState, b: DataBundle, player: ModelState['owner']): { state: GameState; pending: PendingDecision } | null {
  const id = apparitionQueue(state, b, player)[0]
  if (!id) return null
  const m = state.models[id]!
  const s0: GameState = { ...state, window: 'control.upkeep' }
  const did = `d:${s0.decisionSeq + 1}`
  const samples: Vec2[] = [m.pos]
  for (let i = 0; i < 8; i++) {
    for (const f of [1, 0.5]) {
      const p = { x: m.pos.x + Math.cos((i * Math.PI) / 4) * APPARITION_RANGE * f, z: m.pos.z + Math.sin((i * Math.PI) / 4) * APPARITION_RANGE * f }
      if (isLegalPlacement(s0, id, p, m.base).ok) samples.push(p)
    }
  }
  const options: DecisionOption[] = samples.map((p, i) => ({ id: `ap${i}`, label: `Place at ${p.x.toFixed(1)},${p.z.toFixed(1)}`, action: { type: 'moveModel', decisionId: did, player, modelId: id, path: [p] } as Action }))
  return raise(s0, {
    player, kind: 'moveModel', window: 'control.upkeep',
    context: { modelId: id, data: { code: 'apparition' } }, constraints: { modelId: id, from: m.pos, maxDist: APPARITION_RANGE }, options, canPass: true,
  })
}
export function validateApparition(state: GameState, a: Action): Rejection | null {
  if (a.type === 'pass') return null
  if (a.type !== 'moveModel') return { code: 'E_WRONG_DECISION', message: `${a.type} does not answer an Apparition decision` }
  const id = state.pending.context.modelId
  if (a.modelId !== id) return { code: 'E_TARGET_INVALID', message: `${id} is the model that is placed` }
  const m = state.models[id!]!
  const end = a.path[a.path.length - 1] ?? m.pos
  if (dist(m.pos, end) > APPARITION_RANGE + 1e-6) return { code: 'E_TOO_FAR', message: `place within ${APPARITION_RANGE}"` }
  const c = isLegalPlacement(state, m.id, end, m.base)
  return c.ok ? null : { code: c.code ?? 'E_PLACEMENT', message: c.message ?? 'illegal placement' }
}
export function applyApparition(state: GameState, a: Action): { state: GameState; events: GameEvent[] } {
  const id = state.pending.context.modelId!
  const m = state.models[id]!
  let s = state
  const events: GameEvent[] = []
  if (a.type === 'moveModel') {
    const end = a.path[a.path.length - 1] ?? m.pos
    if (dist(m.pos, end) > 1e-9) {
      s = relocate(s, id, end)
      events.push({ type: 'ModelMoved', modelId: id, kind: 'place', from: m.pos, to: end, path: [end], distance: dist(m.pos, end), elevAfter: s.models[id]!.elev } as GameEvent)
    }
  }
  const used = applyEffect(s, { sourceId: APPARITION_USED, name: 'Apparition used', owner: m.owner, casterId: id, targetIds: [id], mods: [], duration: 'turn' })
  return { state: used.state, events: [...events, ...used.events] }
}
