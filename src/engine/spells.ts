// R8 spells, upkeep registration, channelling, heal, feats. Any-time actions of a caster in its own activation.
// Pure: (state, bundle, action) -> {state, events} | {rejection}. Offensive spells hand an `offensive` request back to
// activation.ts, which runs them through the normal attack pipeline as an arcane attack.
import type { Action, CastSpellAction, ChannelAction, HealAction, UseFeatAction } from './actions'
import { runCodeEffect, actOf, layoutsOf, prof, rec, statOf, type Rec } from './code-hooks'
import { healDamage } from './damage'
import { applyEffect, expiryFor, hasCondition, removeEffect } from './effects'
import type { GameEvent } from './events'
import { spendFocus, isRejection } from './focus'
import { baseRadius, dist, fromAngle, angleOf, sub } from './geometry'
import { hasLos } from './los'
import { inCtrl, modelDistance } from './measure'
import { rollD3 } from './dice'
import type {
  Cloud, DataBundle, DecisionOption, EffectDuration, EffectInstance, GameState, Id, ModelId, ModelState, Rejection, StatMod, Vec2,
} from './types'

export type SpellOut = { state: GameState; events: GameEvent[]; offensive?: { casterId: ModelId; spellId: Id; targetId: ModelId } }
export type SpellResult = SpellOut | { rejection: Rejection }
const rej = (code: Rejection['code'], message: string): { rejection: Rejection } => ({ rejection: { code, message } })
const setModel = (s: GameState, m: ModelState): GameState => ({ ...s, models: { ...s.models, [m.id]: m } })

/** Common gate for any-time actions: own activation, nothing in flight, not after running, caster able to act (R4.10). */
export function anytimeGate(state: GameState, casterId: ModelId): Rejection | null {
  const act = actOf(state)
  const m = state.models[casterId]
  if (!m || m.life !== 'active') return { code: 'E_TARGET_INVALID', message: 'no such caster' }
  if (!act || act.activeId !== casterId) return { code: 'E_WRONG_DECISION', message: 'casters act only in their own activation' }
  if (state.attack) return { code: 'E_WRONG_DECISION', message: 'not in the middle of an attack' }
  if (act.ran) return { code: 'E_WRONG_DECISION', message: 'not after running' }
  if (hasCondition(state, m, 'knockedDown')) return { code: 'E_KNOCKED_DOWN', message: 'knocked down' }
  if (hasCondition(state, m, 'stationary')) return { code: 'E_STATIONARY', message: 'stationary' }
  return null
}

const DURATION: Record<string, EffectDuration> = { RND: 'round', UP: 'upkeep', TURN: 'turn', '—': 'instant', '-': 'instant' }
const isOffensive = (sp: Rec): boolean => !!sp.offensive

/** Targets a spell would affect. Area spells (CTRL scope) have no explicit target. */
function affected(state: GameState, b: DataBundle, casterId: ModelId, sp: Rec, targetId: ModelId | undefined): { ids: ModelId[]; code?: Rejection } {
  const caster = state.models[casterId]!
  const who = sp.scope?.who
  if (who === 'friendly' && sp.scope?.range === 'CTRL') {
    const ctrl = statOf(state, b, casterId, 'CTRL')
    const ids = Object.values(state.models).filter((m) => m.owner === caster.owner && m.life === 'active' && !m.offTable && !m.inert && inCtrl(caster, m, ctrl)).map((m) => m.id)
    return { ids }
  }
  if (sp.rng === 'SELF') return { ids: [casterId] }
  const t = targetId ? state.models[targetId] : undefined
  if (!t || t.life !== 'active' || t.offTable) return { ids: [], code: { code: 'E_TARGET_INVALID', message: 'spell needs a target' } }
  if (who === 'warEngines' && !(t.type === 'warEngine' && t.owner === caster.owner)) return { ids: [], code: { code: 'E_TARGET_INVALID', message: 'target must be a war-engine of the battlegroup' } }
  if (who === 'friendly' && t.owner !== caster.owner) return { ids: [], code: { code: 'E_TARGET_INVALID', message: 'friendly target only' } }
  return { ids: [t.id] }
}

export function castSpell(state: GameState, b: DataBundle, a: CastSpellAction): SpellResult {
  const gate = anytimeGate(state, a.casterId)
  if (gate) return { rejection: gate }
  const caster = state.models[a.casterId]!
  const known = (prof(b, caster).spells ?? []) as Id[]
  if (!known.includes(a.spellId)) return rej('E_NOT_AN_OPTION', 'the caster does not know that spell')
  const sp = rec(b, a.spellId)
  const act = actOf(state)!
  const cost = sp.cost as number
  if (caster.focus < cost) return rej('E_INSUFFICIENT_FOCUS', `needs ${cost} focus`)
  const via = act.x.channelVia
  const originId = via ?? a.casterId
  const witch = a.targetId ? state.effects.some((e) => e.sourceId === 'cyg.a.witch-mark' && e.targetIds.includes(a.targetId!) && e.casterId === a.casterId) : false
  const tgt = affected(state, b, a.casterId, sp, a.targetId)
  if (tgt.code) return { rejection: tgt.code }
  if (a.targetId && sp.rng !== 'CTRL' && sp.rng !== 'SELF' && !witch && !hasLos(state, originId, a.targetId)) return rej('E_NO_LOS', 'no line of sight to the target')
  if (via && sp.rng === 'SELF') return rej('E_TARGET_INVALID', 'a SELF spell cannot be channelled')

  const pay = spendFocus(state, a.casterId, cost, 'spell')
  if (isRejection(pay)) return pay
  let s = pay.state
  const events: GameEvent[] = [...pay.events]
  const point: Vec2 | undefined = a.point
  events.push({ type: 'SpellCast', casterId: a.casterId, spellId: a.spellId, originId, targetId: a.targetId, point, cost })
  s = { ...s, activation: { ...act, spellsCast: [...act.spellsCast, a.spellId], x: { ...act.x, channelVia: null } } as typeof s.activation }

  if (isOffensive(sp)) {
    if (!a.targetId) return rej('E_TARGET_INVALID', 'offensive spells need a target')
    return { state: s, events, offensive: { casterId: a.casterId, spellId: a.spellId, targetId: a.targetId } }
  }

  // out of range: a non-offensive spell is still cast (cost paid) and does nothing (R8.5)
  const rng = typeof sp.rng === 'number' ? sp.rng : sp.rng === 'CTRL' ? statOf(s, b, a.casterId, 'CTRL') : 0
  if (a.targetId && typeof sp.rng === 'number' && modelDistance(s.models[originId]!, s.models[a.targetId]!) > rng + 1e-6 && !witch) return { state: s, events }

  const dur = DURATION[sp.dur as string] ?? 'instant'
  if (dur === 'instant' || !tgt.ids.length) return { state: s, events }
  const mods: StatMod[] = []
  const condMods: { stat: StatMod['stat']; value: number; mode?: StatMod['mode']; kinds: string[] }[] = []
  const forbid: string[] = []
  const when = sp.when as Rec | undefined
  for (const n of (sp.effect ?? []) as Rec[]) {
    if (n.op === 'modStat') {
      if (when?.test === 'attackKind') condMods.push({ stat: n.stat, value: n.value, mode: n.mode, kinds: ['ranged', 'aoe', 'spray', 'arcane'] })
      else mods.push({ stat: n.stat, value: n.value, mode: n.mode ?? 'add' })
    } else if (n.op === 'forbid') forbid.push(n.what)
  }
  // an upkeep spell: one friendly upkeep per target; recasting the same spell ends the old casting (R8.6)
  if (dur === 'upkeep') {
    for (const e of s.effects.filter((x) => x.sourceId === a.spellId && x.casterId === a.casterId)) { const r = removeEffect(s, e.id, 'replaced'); s = r.state; events.push(...r.events) }
    for (const t of tgt.ids) {
      const old = s.upkeeps[t]?.friendly
      if (old) { const r = removeEffect(s, old, 'replaced'); s = r.state; events.push(...r.events) }
    }
  }
  const made = applyEffect(s, {
    sourceId: a.spellId, name: sp.name, owner: caster.owner, casterId: a.casterId, targetIds: tgt.ids, mods, forbid: forbid.length ? forbid : undefined,
    duration: dur, upkeep: dur === 'upkeep' ? { casterId: a.casterId } : undefined,
    ...(condMods.length ? ({ condMods } as object) : {}),
  } as Parameters<typeof applyEffect>[1])
  s = made.state; events.push(...made.events)
  const eff = s.effects.find((e) => e.id === made.effect.id)
  if (eff && condMods.length) s = { ...s, effects: s.effects.map((e) => (e.id === eff.id ? ({ ...e, condMods } as EffectInstance) : e)) }
  if (dur === 'upkeep') {
    const up = { ...s.upkeeps }
    for (const t of tgt.ids) up[t] = { ...up[t], friendly: made.effect.id }
    s = { ...s, upkeeps: up }
  }
  for (const n of (sp.effect ?? []) as Rec[]) {
    if (n.code) { const r = runCodeEffect(s, b, n.code, { point: 'spell.cast', selfId: a.casterId, activePlayer: s.activePlayer, targetId: tgt.ids[0] }, n.params ?? {}); s = r.state; events.push(...r.events) }
  }
  return { state: s, events }
}

// ---------- feats ----------
function placeClouds(state: GameState, b: DataBundle, caster: ModelState, count: number, diameter: number, choices: Vec2[] | undefined, effectId: string, expires: Cloud['expires']): { clouds: Cloud[]; events: GameEvent[] } {
  const ctrl = statOf(state, b, caster.id, 'CTRL')
  const r = diameter / 2
  const enemies = Object.values(state.models).filter((m) => m.owner !== caster.owner && m.life === 'active' && !m.offTable)
  const near = enemies.sort((x, y) => dist(x.pos, caster.pos) - dist(y.pos, caster.pos))[0]
  const toward0 = near ? angleOf(sub(near.pos, caster.pos)) : 0
  const clouds: Cloud[] = []
  const events: GameEvent[] = []
  for (let i = 0; i < count; i++) {
    let pos = choices?.[i]
    if (!pos) {
      const spread = (i - (count - 1) / 2) * 0.6
      const reach = Math.max(0, Math.min(ctrl - r - 0.01 + baseRadius(caster.base), 6 + (i % 2) * 2))
      pos = { x: caster.pos.x + fromAngle(toward0 + spread, reach).x, z: caster.pos.z + fromAngle(toward0 + spread, reach).z }
    }
    const id = `cl:${state.effectSeq}.${i + 1}`
    clouds.push({ id, pos, diameter, owner: caster.owner, effectId, kind: 'cloud', expires })
    events.push({ type: 'CloudCreated', cloudId: id, pos, diameter, owner: caster.owner })
  }
  return { clouds, events }
}

export function useFeat(state: GameState, b: DataBundle, a: UseFeatAction): SpellResult {
  const gate = anytimeGate(state, a.casterId)
  if (gate) return { rejection: gate }
  const caster = state.models[a.casterId]!
  if (prof(b, caster).feat !== a.featId) return rej('E_NOT_AN_OPTION', 'not this caster\'s feat')
  if (caster.featUsed) return rej('E_ALREADY_USED', 'the feat is used once per game')
  const feat = rec(b, a.featId)
  const act = actOf(state)!
  let s = setModel(state, { ...caster, featUsed: true })
  const events: GameEvent[] = [{ type: 'FeatUsed', casterId: a.casterId, featId: a.featId }]
  const dur: EffectDuration = feat.duration === 'round' ? 'round' : feat.duration === 'turn' ? 'turn' : 'round'
  const made = applyEffect(s, { sourceId: a.featId, name: feat.name, owner: caster.owner, casterId: a.casterId, targetIds: [a.casterId], mods: [], duration: dur })
  s = made.state; events.push(...made.events)
  const effId = made.effect.id
  for (const n of (feat.effect ?? []) as Rec[]) {
    if (n.op === 'cloud') {
      let count = 1
      if (typeof n.count === 'number') count = n.count
      else if (typeof n.count === 'string') {
        const m = /^d3\+(\d+)$/.exec(n.count)
        if (m) { const d = rollD3(s); s = d.state; events.push(d.event); count = d.value + Number(m[1]) }
      }
      const exp = made.effect.expires ?? expiryFor(s, 'round')
      const pts = (a.choices?.points as Vec2[] | undefined)
      const cl = placeClouds(s, b, caster, count, (n.aoe as number) ?? 3, pts, effId, exp)
      s = { ...s, clouds: [...s.clouds, ...cl.clouds] }; events.push(...cl.events)
    } else if (n.code) {
      const r = runCodeEffect(s, b, n.code, { point: 'feat.used', selfId: a.casterId, activePlayer: s.activePlayer }, n.params ?? {})
      s = r.state; events.push(...r.events)
    }
  }
  s = { ...s, activation: { ...actOf(s)!, featUsed: true, x: act.x } as typeof s.activation }
  return { state: s, events }
}

export function heal(state: GameState, b: DataBundle, a: HealAction): SpellResult {
  const gate = anytimeGate(state, a.casterId)
  if (gate) return { rejection: gate }
  const m = state.models[a.casterId]!
  if (m.type !== 'leader') return rej('E_NOT_AN_OPTION', 'only casters heal')
  const filled = m.damage.track === 'single' ? m.damage.filled : m.damage.grids.reduce((n, g) => n + g.cols.flat().filter(Boolean).length, 0)
  if (a.points < 1 || a.points > filled) return rej('E_BAD_PAYLOAD', 'nothing to heal')
  const pay = spendFocus(state, a.casterId, a.points, 'heal')
  if (isRejection(pay)) return pay
  const h = healDamage(pay.state, a.casterId, a.points, layoutsOf(b, m))
  const act = actOf(h.state)!
  const s = { ...h.state, activation: { ...act, healed: act.healed + a.points } as typeof h.state.activation }
  return { state: s, events: [...pay.events, ...h.events] }
}

export function channel(state: GameState, b: DataBundle, a: ChannelAction, casterId: ModelId): SpellResult {
  const gate = anytimeGate(state, casterId)
  if (gate) return { rejection: gate }
  const act = actOf(state)!
  if (a.via === null) return { state: { ...state, activation: { ...act, x: { ...act.x, channelVia: null } } as typeof state.activation }, events: [] }
  const node = state.models[a.via]
  const caster = state.models[casterId]!
  const isNode = !!node && node.owner === caster.owner && ((prof(b, node).abilities ?? []) as Id[]).includes('core.a.arc-node')
  if (!node || !isNode) return rej('E_TARGET_INVALID', 'only an Arc Node can channel')
  if (!inCtrl(caster, node, statOf(state, b, casterId, 'CTRL'))) return rej('E_OUT_OF_CTRL', 'the node is outside CTRL')
  if (hasCondition(state, node, 'knockedDown') || hasCondition(state, node, 'stationary')) return rej('E_TARGET_INVALID', 'the node cannot channel')
  return { state: { ...state, activation: { ...act, x: { ...act.x, channelVia: a.via } } as typeof state.activation }, events: [] }
}

/** Any-time options a caster can take now (used to widen chooseMovement / chooseCombatAction / chooseAttack). */
export function anytimeOptions(state: GameState, b: DataBundle, casterId: ModelId, decisionId: string): DecisionOption[] {
  const m = state.models[casterId]
  if (!m || m.type !== 'leader' || anytimeGate(state, casterId)) return []
  const out: DecisionOption[] = []
  const player = m.owner
  for (const spId of (prof(b, m).spells ?? []) as Id[]) {
    const sp = rec(b, spId)
    if (m.focus < sp.cost) continue
    const mk = (targetId?: ModelId) => {
      const action: CastSpellAction = { type: 'castSpell', decisionId, player, casterId, spellId: spId, ...(targetId ? { targetId } : {}) }
      if (!('rejection' in castSpell(state, b, action))) out.push({ id: `cast:${spId}${targetId ? ':' + targetId : ''}`, label: `Cast ${sp.name}`, action, cost: { focus: sp.cost } })
    }
    if (sp.scope?.who === 'friendly' && sp.scope?.range === 'CTRL') mk()
    else if (sp.rng === 'SELF') mk()
    else for (const t of Object.values(state.models)) if (t.life === 'active' && !t.offTable && t.owner === m.owner && t.type === 'warEngine') mk(t.id)
  }
  const featId = prof(b, m).feat as Id | undefined
  if (featId && !m.featUsed) {
    const action: UseFeatAction = { type: 'useFeat', decisionId, player, casterId, featId }
    if (!('rejection' in useFeat(state, b, action))) out.push({ id: `feat:${featId}`, label: `Use feat ${rec(b, featId).name}`, action })
  }
  return out
}

export const isAnytimeAction = (a: Action): a is CastSpellAction | UseFeatAction | HealAction | ChannelAction =>
  a.type === 'castSpell' || a.type === 'useFeat' || a.type === 'heal' || a.type === 'channel'

