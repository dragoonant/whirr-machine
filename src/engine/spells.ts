// R8 spells, upkeep registration, channelling, heal, feats. Any-time actions of a caster in its own activation.
// Pure: (state, bundle, action) -> {state, events} | {rejection}. Offensive spells hand an `offensive` request back to
// activation.ts, which runs them through the normal attack pipeline as an arcane attack.
import type { Action, AdjustFuryAction, CastSpellAction, ChannelAction, HealAction, TakeControlAction, UseFeatAction } from './actions'
import { runCodeEffect, actOf, layoutsOf, losOptsFor, meleeReach, prof, rec, statOf, hasAb, type Rec } from './code-hooks'
import { applyDamage, healDamage } from './damage'
import { applyEffect, expiryFor, hasCondition, removeCondition, removeEffect, type EffectExtras } from './effects'
import type { GameEvent } from './events'
import { spendFocus, isRejection, payBlock, costFor } from './focus'
import { battlegroupOf, inCtrlOf, isBeast, isConstructBeast, isFuryModel, isWarlock, unmarkedBoxes } from './fury'
import * as fury from './fury'
import { baseRadius, dist, fromAngle, angleOf, sub } from './geometry'
import { losReport } from './los'
import { inCtrl, modelDistance } from './measure'
import { engagedBy } from './movement'
import { rollD3 } from './dice'
import { circleAnimusCostForWarlock, circleSpellCost, ritesChannelers, vitalMagicKeep, vitalMagicOffer } from './factions/circle'
import { wrathActive } from './factions/cryx'
import { giftBlock, menothSpellEffect, stokeFreeVictim, teleportCheck, teleportSamples, useIllumination } from './factions/menoth'
import type {
  Cloud, DataBundle, DecisionOption, EffectDuration, GameState, Id, ModelId, ModelState, Rejection, StatMod, Vec2,
} from './types'

export type SpellOut = { state: GameState; events: GameEvent[]; endActivation?: boolean; offensive?: { casterId: ModelId; spellId: Id; targetId: ModelId; via?: ModelId | null } }
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

/** Targets a spell would affect. Area spells (CTRL scope) have no explicit target; point spells (Rock Wall) sit on the caster. */
function affected(state: GameState, b: DataBundle, casterId: ModelId, sp: Rec, targetId: ModelId | undefined): { ids: ModelId[]; code?: Rejection } {
  const caster = state.models[casterId]!
  const who = sp.scope?.who
  if (who === 'friendly' && sp.scope?.range === 'CTRL' && sp.rng === 'CTRL') {
    const ctrl = statOf(state, b, casterId, 'CTRL')
    const ids = Object.values(state.models).filter((m) => m.owner === caster.owner && m.life === 'active' && !m.offTable && !m.inert && inCtrl(caster, m, ctrl)).map((m) => m.id)
    return { ids }
  }
  if (who === 'point') return { ids: [] }
  if (sp.rng === 'SELF') return { ids: [casterId] }
  const t = targetId ? state.models[targetId] : undefined
  if (!t || t.life !== 'active' || t.offTable) return { ids: [], code: { code: 'E_TARGET_INVALID', message: 'spell needs a target' } }
  if (who === 'warEngines' && !(t.type === 'warEngine' && t.owner === caster.owner)) return { ids: [], code: { code: 'E_TARGET_INVALID', message: 'target must be a war-engine of the battlegroup' } }
  if (who === 'warbeasts' && !(isBeast(t) && t.owner === caster.owner && t.controllerId === caster.id && !t.wild)) return { ids: [], code: { code: 'E_TARGET_INVALID', message: 'target must be a warbeast of the battlegroup' } }
  if (who === 'battlegroup' && !(t.id === caster.id || (isBeast(t) && t.owner === caster.owner && t.controllerId === caster.id && !t.wild))) return { ids: [], code: { code: 'E_TARGET_INVALID', message: 'target must be in the battlegroup (the caster counts)' } }
  if (who === 'friendly' && !sp.offensive && t.owner !== caster.owner) return { ids: [], code: { code: 'E_TARGET_INVALID', message: 'friendly target only' } }
  if (who === 'enemy' && t.owner === caster.owner) return { ids: [], code: { code: 'E_TARGET_INVALID', message: 'enemy target only' } }
  // a spell for "a model or unit" (scope.filter {code:'wholeUnit'}, Snipe) covers every living model of the target's unit; one effect, so one upkeep
  if ((sp.scope?.filter as { code?: string } | undefined)?.code === 'wholeUnit' && t.unitId) {
    return { ids: Object.values(state.models).filter((m) => m.unitId === t.unitId && m.life === 'active' && !m.offTable).map((m) => m.id) }
  }
  return { ids: [t.id] }
}

/** Banishing Ward and Warp: Spell Ward: a model an effect shields cannot be the target of a spell (cryx.md, circle.md). */
function spellWarded(state: GameState, casterOwner: ModelState['owner'], targetId: ModelId): boolean {
  return state.effects.some((e) => e.targetIds.includes(targetId) && (e.forbid?.includes('beTargetedBySpell') || (e.forbid?.includes('beTargeted') && e.owner !== casterOwner)))
}

// ---------- Vital Magic and forced expiry ----------
/**
 * An upkeep spell or animus is about to be ended by an effect (Banishing Ward), not by its caster dropping it: the spell.expire
 * window. A caster with Vital Magic keeps each spell by taking d3 damage for it (RULING: automatic, only while it has more than 6
 * boxes left, so it never boxes itself); everything else ends.
 */
export function forceExpire(state: GameState, b: DataBundle, effectIds: string[], reason: 'replaced' | 'other' = 'other'): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  for (const id of effectIds) {
    const e = s.effects.find((x) => x.id === id)
    if (!e) continue
    const cid = e.casterId
    const c = cid ? s.models[cid] : undefined
    if (c && cid && c.life === 'active' && unmarkedBoxes(c.damage) > 6 && vitalMagicOffer(s, b, cid, [id]).includes(id)) {
      const k = vitalMagicKeep(s, b, cid)
      s = k.state; events.push(...k.events)
      continue
    }
    const r = removeEffect(s, id, reason); s = r.state; events.push(...r.events)
  }
  return { state: s, events }
}

/** Spell COST for this caster: Rites of the Wurm discounts, Stoke the Pyre makes it free, Wrath pays it with damage. */
function castCost(state: GameState, b: DataBundle, caster: ModelState, sp: Rec, a: CastSpellAction): { cost: number; stoke?: ModelId; wrath: boolean } {
  const base = sp.cost as number
  let cost = base
  if (a.animusOf) cost = circleAnimusCostForWarlock(state, b, caster.id, base)
  else cost = circleSpellCost(state, b, caster.id, a.spellId, base)
  let stoke: ModelId | undefined
  if (cost > 0 && !isFuryModel(caster)) {
    const v = stokeFreeVictim(state, b, caster.id)
    if (v) { stoke = v; cost = 0 }
  }
  const act = actOf(state)
  let wrath = false
  if (cost > 0 && !isFuryModel(caster) && wrathActive(state, caster.id) && !act?.limitsUsed.includes(`wrath:${a.spellId}`) && unmarkedBoxes(caster.damage) > 6) {
    // paying 1 damage instead of the focus: when the focus is short, or a dear spell while the caster has plenty of boxes
    if (caster.focus < cost || (cost >= 2 && unmarkedBoxes(caster.damage) >= 10)) wrath = true
  }
  return { cost, stoke, wrath }
}

export function castSpell(state: GameState, b: DataBundle, a: CastSpellAction): SpellResult {
  const gate = anytimeGate(state, a.casterId)
  if (gate) return { rejection: gate }
  const caster = state.models[a.casterId]!
  const known = (prof(b, caster).spells ?? []) as Id[]
  // M9 F12: a warlock casts the animus of a battlegroup beast in CTRL as its own spell; a beast casts only its own animus (forced)
  const lender = a.animusOf ? state.models[a.animusOf] : undefined
  if (a.animusOf) {
    if (!isWarlock(caster)) return rej('E_NOT_AN_OPTION', 'only a warlock casts another model\'s animus')
    if (!lender || !isBeast(lender) || lender.controllerId !== caster.id || lender.wild || lender.life !== 'active' || lender.offTable) return rej('E_TARGET_INVALID', 'not a beast of this battlegroup')
    if (!inCtrlOf(state, b, caster, lender)) return rej('E_OUT_OF_CTRL', 'the beast is outside CTRL')
    if (prof(b, lender).animus !== a.spellId) return rej('E_NOT_AN_OPTION', 'that is not the beast\'s animus')
  } else if (isBeast(caster)) {
    if (prof(b, caster).animus !== a.spellId) return rej('E_NOT_AN_OPTION', 'a beast casts only its own animus')
  } else if (!known.includes(a.spellId)) return rej('E_NOT_AN_OPTION', 'the caster does not know that spell')
  const sp = rec(b, a.spellId)
  const act = actOf(state)!
  if (a.spellId === 'men.s.teleport') { const tp = teleportCheck(state, a.casterId, a.point); if (tp) return { rejection: tp } } // menoth: the landing point
  const cc = castCost(state, b, caster, sp, a)
  const cost = cc.cost
  if (!isFuryModel(caster) && !cc.wrath && caster.focus < cost) return rej('E_INSUFFICIENT_FOCUS', `needs ${cost} focus`)
  if (isFuryModel(caster)) { const pb = payBlock(state, b, caster, cost, 'spell'); if (pb) return { rejection: pb } }
  const via = act.x.channelVia
  const originId = via ?? a.casterId
  const witch = a.targetId ? state.effects.some((e) => e.sourceId === 'cyg.a.witch-mark' && e.targetIds.includes(a.targetId!) && e.casterId === a.casterId) : false
  const tgt = affected(state, b, a.casterId, sp, a.targetId)
  if (tgt.code) return { rejection: tgt.code }
  if (a.targetId && spellWarded(state, caster.owner, a.targetId)) return rej('E_TARGET_INVALID', 'a ward stops spells targeting that model')
  { const gb = a.targetId ? giftBlock(state, b, a.casterId, a.targetId, ['spell']) : null; if (gb) return rej('E_TARGET_INVALID', gb) } // menoth: the Gift of Law
  if (a.targetId && a.targetId !== originId && sp.rng !== 'CTRL' && sp.rng !== 'SELF' && !witch && !losReport(state, originId, a.targetId, losOptsFor(state, b, originId)).visible) return rej('E_NO_LOS', 'no line of sight to the target')
  if (via && sp.rng === 'SELF') return rej('E_TARGET_INVALID', 'a SELF spell cannot be channelled')
  if (sp.scope?.who === 'point' && a.point) {
    if (modelDistance(state.models[originId]!, { ...caster, pos: a.point, base: 30 }) > (sp.rng === 'CTRL' ? statOf(state, b, a.casterId, 'CTRL') : (sp.rng as number)) + 1e-6) return rej('E_OUT_OF_RANGE', 'the point is outside the spell\'s range')
  }

  let s = state
  const events: GameEvent[] = []

  // payment: focus, fury, forced fury, 1 damage (Wrath of Lyliss) or nothing (Stoke the Pyre)
  if (cc.wrath) {
    const ap = applyDamage(s, a.casterId, 1, { layouts: layoutsOf(b, s.models[a.casterId]!), source: 'other' })
    s = ap.state; events.push(...ap.events)
    const a2 = actOf(s)!
    s = { ...s, activation: { ...a2, limitsUsed: [...a2.limitsUsed, `wrath:${a.spellId}`] } as typeof s.activation }
  } else {
    const pay = spendFocus(s, a.casterId, cost, 'spell', b)
    if (isRejection(pay)) return pay
    s = pay.state; events.push(...pay.events)
  }
  if (cc.stoke) { const r = useIllumination(s, cc.stoke); s = r.state; events.push(...r.events) } // Illumination: the fire goes out, once per turn
  const act2 = actOf(s)!
  const point: Vec2 | undefined = a.point
  events.push({ type: 'SpellCast', casterId: a.casterId, spellId: a.spellId, originId, targetId: a.targetId, point, cost: cc.cost, ...(sp.animus ? { animus: true } : {}), ...(isBeast(caster) ? { forced: true } : {}) })
  s = { ...s, activation: { ...act2, spellsCast: [...act2.spellsCast, a.spellId], limitsUsed: isBeast(caster) ? [...act2.limitsUsed, `animus:${caster.id}`] : act2.limitsUsed, x: { ...act2.x, channelVia: null } } as typeof s.activation }

  if (isOffensive(sp)) {
    if (!a.targetId) return rej('E_TARGET_INVALID', 'offensive spells need a target')
    return { state: s, events, offensive: { casterId: a.casterId, spellId: a.spellId, targetId: a.targetId, via } } // via: the node the attack comes from (R6.8)
  }

  // out of range: a non-offensive spell is still cast (cost paid) and does nothing (R8.5)
  const rng = typeof sp.rng === 'number' ? sp.rng : sp.rng === 'CTRL' ? statOf(s, b, a.casterId, 'CTRL') : 0
  if (a.targetId && typeof sp.rng === 'number' && modelDistance(s.models[originId]!, s.models[a.targetId]!) > rng + 1e-6 && !witch) return { state: s, events }

  const dur = DURATION[sp.dur as string] ?? 'instant'
  const codeNodes = ((sp.effect ?? []) as Rec[]).filter((n) => n.code)
  const runCodes = (st: GameState, evs: GameEvent[], targetId: ModelId | undefined): GameState => {
    let cur = st
    for (const n of codeNodes) {
      const r = runCodeEffect(cur, b, n.code, { point: 'spell.cast', selfId: a.casterId, activePlayer: cur.activePlayer, targetId, pointTarget: a.point }, n.params ?? {})
      cur = r.state; evs.push(...r.events)
    }
    return cur
  }
  const isPoint = sp.scope?.who === 'point'
  // a spell the descriptors cannot say (Teleport) is done by its faction file
  { const fx = menothSpellEffect(s, a.casterId, a.spellId, a.point); if (fx) return { state: fx.state, events: [...events, ...fx.events], ...(fx.endActivation ? { endActivation: true } : {}) } }
  // an instant spell has no lasting effect, but its code still runs
  if (dur === 'instant') {
    if (tgt.ids.length) s = runCodes(s, events, tgt.ids[0])
    return { state: s, events }
  }
  if (!tgt.ids.length && !isPoint) return { state: s, events }
  const mods: StatMod[] = []
  const condMods: NonNullable<EffectExtras['condMods']> = []
  const forbid: string[] = []
  const grants: Id[] = []
  const rollMods: { roll: 'attack' | 'damage' | 'any'; value: number; kinds?: string[] }[] = []
  const when = sp.when as Rec | undefined
  for (const n of (sp.effect ?? []) as Rec[]) {
    if (n.op === 'modStat') {
      if (when?.test === 'attackKind') condMods.push({ stat: n.stat, value: n.value, mode: n.mode, kinds: ['ranged', 'aoe', 'spray', 'arcane'] })
      else mods.push({ stat: n.stat, value: n.value, mode: n.mode ?? 'add' })
    } else if (n.op === 'forbid') forbid.push(n.what)
    else if (n.op === 'grantAbility' && n.ability) grants.push(n.ability)
    else if (n.op === 'modRoll' && (n.roll === 'damage' || n.roll === 'attack')) rollMods.push({ roll: n.roll, value: n.value ?? 0, ...(n.roll === 'damage' ? { kinds: ['melee', 'power'] } : {}) }) // 'any' rolls belong to a plugin (Incite)
  }
  // an upkeep spell: one friendly upkeep per target; recasting the same spell ends the old casting (R8.6)
  const slots = isPoint ? [`pt:${a.casterId}:${a.spellId}`] : tgt.ids
  const targetIds = isPoint ? [] : tgt.ids
  if (dur === 'upkeep') {
    for (const e of s.effects.filter((x) => x.sourceId === a.spellId && x.casterId === a.casterId)) { const r = removeEffect(s, e.id, 'replaced'); s = r.state; events.push(...r.events) }
    for (const t of slots) {
      const old = s.upkeeps[t]?.friendly
      if (old) { const r = removeEffect(s, old, 'replaced'); s = r.state; events.push(...r.events) }
    }
  }
  if (sp.animus) {
    for (const t of tgt.ids) {
      for (const e of s.effects.filter((x) => x.targetIds.includes(t) && x.owner === caster.owner && x.sourceId !== a.spellId && rec(b, x.sourceId).animus)) {
        const r = removeEffect(s, e.id, 'replaced'); s = r.state; events.push(...r.events)
      }
    }
  }
  const made = applyEffect(s, {
    sourceId: a.spellId, name: sp.name, owner: caster.owner, casterId: a.casterId, targetIds, mods, forbid: forbid.length ? forbid : undefined,
    duration: dur, upkeep: dur === 'upkeep' ? { casterId: a.casterId } : undefined,
    ...(condMods.length ? { condMods } : {}), ...(grants.length ? { grants } : {}),
    ...(rollMods.length ? { rollMods } : {}),
  })
  s = made.state; events.push(...made.events)
  if (dur === 'upkeep') {
    const up = { ...s.upkeeps }
    for (const t of slots) up[t] = { ...up[t], friendly: made.effect.id }
    s = { ...s, upkeeps: up }
  }
  // Banishing Ward: enemy upkeep spells and animi already on the warded models end (the spell.expire window)
  if (forbid.includes('beTargeted') && tgt.ids.length) {
    const ending = s.effects.filter((e) => e.owner !== caster.owner && e.targetIds.some((t) => tgt.ids.includes(t)) && (e.upkeep || !!rec(b, e.sourceId).animus)).map((e) => e.id)
    if (ending.length) { const r = forceExpire(s, b, ending); s = r.state; events.push(...r.events) }
  }
  s = runCodes(s, events, tgt.ids[0])
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
  const caster = state.models[a.casterId]!
  if (caster.type !== 'leader') return rej('E_NOT_AN_OPTION', 'only casters heal')
  // M9 F2.2: a warlock may also heal a battlegroup beast in CTRL (never a Construct)
  const m = a.targetId && a.targetId !== a.casterId ? state.models[a.targetId] : caster
  if (!m || m.life !== 'active' || m.offTable) return rej('E_TARGET_INVALID', 'nothing to heal there')
  if (m.id !== caster.id) {
    if (!isWarlock(caster) || !isBeast(m) || m.controllerId !== caster.id || m.wild) return rej('E_TARGET_INVALID', 'a warlock heals only its own battlegroup')
    if (isConstructBeast(b, m)) return rej('E_TARGET_INVALID', 'Construct beasts cannot be healed')
    if (!inCtrlOf(state, b, caster, m)) return rej('E_OUT_OF_CTRL', 'the beast is outside CTRL')
  }
  if (state.effects.some((e) => e.targetIds.includes(m.id) && e.forbid?.includes('heal'))) return rej('E_NOT_AN_OPTION', 'an effect stops this model being healed')
  const filled = m.damage.track === 'single' ? m.damage.filled : m.damage.grids.reduce((n, g) => n + g.cols.flat().filter(Boolean).length, 0)
  if (a.points < 1 || a.points > filled) return rej('E_BAD_PAYLOAD', 'nothing to heal')
  const pay = spendFocus(state, a.casterId, a.points, 'heal', b)
  if (isRejection(pay)) return pay
  const h = healDamage(pay.state, m.id, a.points, layoutsOf(b, m), a.boxes)
  const act = actOf(h.state)!
  const s = { ...h.state, activation: { ...act, healed: act.healed + a.points } as typeof h.state.activation }
  return { state: s, events: [...pay.events, ...h.events] }
}

/** Models that may channel this caster's spells: Arc Nodes, and (Rites of the Wurm) battlegroup beasts in CTRL. */
function channelers(state: GameState, b: DataBundle, casterId: ModelId): ModelId[] {
  const caster = state.models[casterId]
  if (!caster) return []
  const ctrl = statOf(state, b, casterId, 'CTRL')
  const nodes = Object.values(state.models).filter((n) => n.owner === caster.owner && n.id !== casterId && n.life === 'active' && !n.offTable && hasAb(state, b, n.id, 'core.a.arc-node') && inCtrl(caster, n, ctrl)).map((n) => n.id)
  return [...new Set([...nodes, ...ritesChannelers(state, b, casterId)])]
}

export function channel(state: GameState, b: DataBundle, a: ChannelAction, casterId: ModelId): SpellResult {
  const gate = anytimeGate(state, casterId)
  if (gate) return { rejection: gate }
  const act = actOf(state)!
  if (a.via === null) return { state: { ...state, activation: { ...act, x: { ...act.x, channelVia: null } } as typeof state.activation }, events: [] }
  const node = state.models[a.via]
  const caster = state.models[casterId]!
  if (!node || node.owner !== caster.owner || !channelers(state, b, casterId).includes(node.id)) return rej('E_TARGET_INVALID', 'only an Arc Node (or a beast under Rites of the Wurm) can channel')
  if (!inCtrl(caster, node, statOf(state, b, casterId, 'CTRL'))) return rej('E_OUT_OF_CTRL', 'the node is outside CTRL')
  if (hasCondition(state, node, 'knockedDown') || hasCondition(state, node, 'stationary')) return rej('E_TARGET_INVALID', 'the node cannot channel')
  if (engagedBy(state, node.id, (x) => meleeReach(state, b, x)).length) return rej('E_ENGAGED', 'an engaged node cannot channel') // R8.7
  return { state: { ...state, activation: { ...act, x: { ...act.x, channelVia: a.via } } as typeof state.activation }, events: [] }
}

/**
 * The channel decision (00 section 5): a spell the caster could cast itself that an Arc Node (or a Rites of the Wurm beast) could just as well
 * carry. Returns those nodes; empty when channelling is already chosen, the spell is SELF, an animus, or no node can carry it.
 */
export function channelChoices(state: GameState, b: DataBundle, a: CastSpellAction): ModelId[] {
  if (a.animusOf) return []
  const act = actOf(state)
  const caster = state.models[a.casterId]
  if (!act || act.x.channelVia || !caster || isBeast(caster)) return []
  if (rec(b, a.spellId).rng === 'SELF') return []
  if ('rejection' in castSpell(state, b, a)) return []
  const out: ModelId[] = []
  for (const n of channelers(state, b, a.casterId)) {
    const ch = channel(state, b, { type: 'channel', decisionId: a.decisionId, player: a.player, via: n }, a.casterId)
    if ('rejection' in ch) continue
    if (!('rejection' in castSpell(ch.state, b, a))) out.push(n)
  }
  return out
}

/** Any-time options a caster can take now (used to widen chooseMovement / chooseCombatAction / chooseAttack). */
export function anytimeOptions(state: GameState, b: DataBundle, casterId: ModelId, decisionId: string): DecisionOption[] {
  const m = state.models[casterId]
  if (m && isBeast(m) && !anytimeGate(state, casterId)) return beastOptions(state, b, m, decisionId)
  if (!m || m.type !== 'leader' || anytimeGate(state, casterId)) return []
  const out: DecisionOption[] = []
  const player = m.owner
  if (isWarlock(m)) out.push(...warlockOptions(state, b, m, decisionId))
  const ctrl = statOf(state, b, casterId, 'CTRL')
  const via = actOf(state)?.x.channelVia ?? null
  for (const spId of (prof(b, m).spells ?? []) as Id[]) {
    const sp = rec(b, spId)
    if (isFuryModel(m) ? (m.fury ?? 0) < circleSpellCost(state, b, casterId, spId, sp.cost) : false) continue
    const mk = (targetId?: ModelId, point?: Vec2) => {
      const action: CastSpellAction = { type: 'castSpell', decisionId, player, casterId, spellId: spId, ...(targetId ? { targetId } : {}), ...(point ? { point } : {}) }
      if (!('rejection' in castSpell(state, b, action))) out.push({ id: `cast:${spId}${targetId ? ':' + targetId : ''}${point ? `:${point.x.toFixed(1)},${point.z.toFixed(1)}` : ''}`, label: `Cast ${sp.name}`, action, cost: costFor(m, circleSpellCost(state, b, casterId, spId, sp.cost)) })
    }
    if (sp.scope?.who === 'friendly' && sp.scope?.range === 'CTRL' && sp.rng === 'CTRL') mk()
    else if (spId === 'men.s.teleport') { for (const p of teleportSamples(state, casterId)) mk(undefined, p) } // menoth: a few landing spots to pick from
    else if (sp.rng === 'SELF' || sp.scope?.who === 'point') mk()
    else {
      // a targeted spell: every model in range that its scope allows (castSpell has the last word)
      const reach = (typeof sp.rng === 'string' && /^SP/.test(sp.rng) ? Number(sp.rng.slice(2)) : sp.rng === 'CTRL' ? ctrl : Number(sp.rng)) + 0.5
      const origin = via && state.models[via] ? state.models[via]! : m
      for (const t of Object.values(state.models)) {
        if (t.life !== 'active' || t.offTable) continue
        const who = sp.scope?.who
        if (who === 'enemy' || sp.offensive) { if (t.owner === m.owner) continue }
        else if (who === 'warEngines') { if (t.owner !== m.owner || t.type !== 'warEngine') continue }
        else if (who === 'warbeasts') { if (t.owner !== m.owner || !isBeast(t) || t.controllerId !== m.id || t.wild) continue }
        else if (who === 'battlegroup') { if (t.id !== m.id && (t.owner !== m.owner || !isBeast(t) || t.controllerId !== m.id || t.wild)) continue }
        else if (t.owner !== m.owner) continue
        if (modelDistance(origin, t) > reach) continue
        mk(t.id)
      }
    }
  }
  const nodes = via ? [] : channelers(state, b, casterId)
  for (const n of nodes.slice(0, 6)) out.push({ id: `channel:${n}`, label: `Channel spells through ${n}`, action: { type: 'channel', decisionId, player, via: n } as Action })
  if (via) out.push({ id: 'channel:none', label: 'Cast from the caster again', action: { type: 'channel', decisionId, player, via: null } as Action })
  const featId = prof(b, m).feat as Id | undefined
  if (featId && !m.featUsed) {
    const action: UseFeatAction = { type: 'useFeat', decisionId, player, casterId, featId }
    if (!('rejection' in useFeat(state, b, action))) out.push({ id: `feat:${featId}`, label: `Use feat ${rec(b, featId).name}`, action })
  }
  return out
}

export const isAnytimeAction = (a: Action): a is CastSpellAction | UseFeatAction | HealAction | ChannelAction | AdjustFuryAction | TakeControlAction =>
  a.type === 'castSpell' || a.type === 'useFeat' || a.type === 'heal' || a.type === 'channel' || a.type === 'adjustFury' || a.type === 'takeControl'

// ---------- M9 any-time option samples (81 C.2): rile, shed, heal, take control, animi ----------
function beastOptions(state: GameState, b: DataBundle, m: ModelState, did: string): DecisionOption[] {
  const out: DecisionOption[] = []
  const room = Math.max(0, (((prof(b, m).stats ?? {}) as Record<string, number>).FURY ?? 0) - (m.fury ?? 0))
  for (const n of new Set([room, room - 1])) {
    if (n < 1) continue
    const action: Action = { type: 'adjustFury', decisionId: did, player: m.owner, modelId: m.id, delta: n }
    if (!validateRile(state, b, action as AdjustFuryAction)) out.push({ id: `rile:${n}`, label: `Rile (+${n} fury)`, action, cost: costFor(m, n) })
  }
  const an = prof(b, m).animus as Id | undefined
  if (an && !state.activation?.limitsUsed.includes(`animus:${m.id}`)) {
    const action: CastSpellAction = { type: 'castSpell', decisionId: did, player: m.owner, casterId: m.id, spellId: an }
    if (!('rejection' in castSpell(state, b, action))) out.push({ id: `cast:${an}`, label: `Animus: ${rec(b, an).name}`, action, cost: costFor(m, circleSpellCost(state, b, m.id, an, rec(b, an).cost as number)) })
  }
  return out
}
const validateRile = (state: GameState, b: DataBundle, a: AdjustFuryAction): Rejection | null => fury.validateAdjustFury(state, b, a)
function warlockOptions(state: GameState, b: DataBundle, w: ModelState, did: string): DecisionOption[] {
  const out: DecisionOption[] = []
  const player = w.owner
  if ((w.fury ?? 0) > 0) out.push({ id: 'shed:all', label: 'Shed all fury', action: { type: 'adjustFury', decisionId: did, player, modelId: w.id, delta: -(w.fury ?? 0) } })
  for (const beast of battlegroupOf(state, w)) {
    if (!inCtrlOf(state, b, w, beast)) continue
    const an = prof(b, beast).animus as Id | undefined
    const anCost = an ? circleAnimusCostForWarlock(state, b, w.id, rec(b, an).cost as number) : 0
    if (an && (w.fury ?? 0) >= anCost) {
      const action: CastSpellAction = { type: 'castSpell', decisionId: did, player, casterId: w.id, spellId: an, animusOf: beast.id }
      if (!('rejection' in castSpell(state, b, action))) out.push({ id: `animus:${beast.id}`, label: `Cast ${rec(b, an).name} (${beast.id})`, action, cost: costFor(w, anCost) })
    }
    if ((w.fury ?? 0) >= 1 && beast.damage.track === 'grid' && !isConstructBeast(b, beast)) {
      const marked = beast.damage.grids[0]!.cols.flat().filter(Boolean).length
      for (const n of new Set([1, Math.min(marked, w.fury ?? 0)])) if (n >= 1 && n <= marked) out.push({ id: `heal:${beast.id}:${n}`, label: `Heal ${n} on ${beast.id}`, action: { type: 'heal', decisionId: did, player, casterId: w.id, points: n, targetId: beast.id }, cost: costFor(w, n) })
    }
  }
  for (const t of Object.values(state.models)) {
    if (t.type !== 'beast' || !t.wild || t.owner !== w.owner || (w.fury ?? 0) < 1) continue
    const action: TakeControlAction = { type: 'takeControl', decisionId: did, player, casterId: w.id, targetId: t.id }
    if (!fury.validateTakeControl(state, b, action)) out.push({ id: `takeControl:${t.id}`, label: `Take control of ${t.id}`, action, cost: costFor(w, 1) })
  }
  return out.slice(0, 64)
}
