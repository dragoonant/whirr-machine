// Khador (Winter Korps, SKS-6 cadre) code hooks: every {code} the Khador data references.
// Data codes: marksmanColumn, grantQuality, armorPiercing, avengingForce, pallOfAshesMove.
// Skirmish (WP-D-kha): volleyFire, razorWind, khaEmpower, khaSigilOfPower, and the Sniper / Razor Wind / Sigil plugin below.
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import { atkOf, hasAb, noop, setAtk, type AttackPlugin } from '../code-hooks'
import { applyEffect, removeCondition } from '../effects'
import { fillGrid } from '../damage'
import { rollNd6 } from '../dice'
import { gainFocus } from '../focus'
import { isOnTable } from '../geometry'
import { modelDistance, within } from '../measure'
import type { DamageType, DataBundle, EffectInstance, GameState, Id, ModelId, ModelState } from '../types'
import type { GameEvent } from '../events'

const patchX = (c: HookContext, patch: Record<string, unknown>): HookResult => {
  const a = atkOf(c.state)
  if (!a) return noop(c)
  return { state: setAtk(c.state, { ...a, x: { ...a.x, ...patch } }), events: [] }
}

/** Marksman: ranged damage to a war-engine lets the attacker pick the damage column (GRID-010). */
const marksmanColumn = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  const t = a ? c.state.models[a.targetId] : undefined
  if (!a || !t || t.damage.track !== 'grid' || a.kind === 'melee') return noop(c)
  return patchX(c, { needColumn: true })
}

/** Ward Breaker: the attack gains Blessed (ignores DEF/ARM bonuses from spells). */
const grantQuality = (c: HookContext): HookResult => {
  const q = (c.params?.quality as string | undefined) ?? 'blessed'
  return q === 'blessed' ? patchX(c, { blessed: true }) : noop(c)
}

/** Armor-Piercing: halve the target's base ARM before bonuses (ATK-015). Read by the damage step. */
const armorPiercing = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  if (!a?.x.cur) return noop(c)
  return patchX(c, { cur: { ...a.x.cur, armorPiercing: true } })
}

/**
 * Avenging Force (spell, upkeep): the spell effect itself is created by spells.ts; this code arms it at cast time for the
 * maintenance module (avengingForceReady below). `triggered` is set by noteDamaged when a friendly model is hurt in the enemy turn.
 */
const avengingForce = (c: HookContext): HookResult => {
  const e = c.state.effects.find((x) => x.sourceId === 'kha.s.avenging-force' && x.casterId === c.selfId)
  if (!e) return noop(c)
  const next = { ...e, triggered: false } as EffectInstance
  return { state: { ...c.state, effects: c.state.effects.map((x) => (x.id === e.id ? next : x)) }, events: [] }
}

/** Pall of Ashes: friendly models in a cloud gain Pathfinder (read through inPallCloud in activation.ts). */
const pallOfAshesMove = (c: HookContext): HookResult => ({ state: c.state, events: [] })

// ---------- Skirmish additions (docs/spec/factions/khador.md, Skirmish section) ----------
const SNIPER = 'kha.a.sniper'
const RAZOR_WIND = 'kha.a.razor-wind'
const SIGIL = 'kha.a.sigil-of-power'
const isRangedKind = (k: string): boolean => k === 'ranged' || k === 'aoe' || k === 'spray' || k === 'arcane'

/**
 * Volley Fire (weapon quality at attack.beforeRoll): the attack roll against a warrior model is boosted for free, with no boost
 * offer after it. Battle engines and structures are not warrior models (RB), so the roll stays plain against them.
 */
const volleyFire = (c: HookContext): HookResult => {
  const a = atkOf(c.state)
  const t = a ? c.state.models[a.targetId] : undefined
  if (!a || !t || a.x.boosted || a.kind === 'melee' || a.kind === 'power') return noop(c)
  if (t.type === 'battleEngine' || t.type === 'structure') return noop(c)
  return { state: setAtk(c.state, { ...a, x: { ...a.x, boosted: true, flags: { ...a.x.flags, freeBoost: true } } }), events: [] }
}

/** Razor Wind: the critical fill is done by the plugin below; the ability only needs a registered code. */
const razorWind = (c: HookContext): HookResult => noop(c)

/** Friendly models on the table within `range` of `selfId` (edge to edge), nearest first. */
const friendsWithin = (state: GameState, selfId: ModelId, range: number): ModelState[] => {
  const me = state.models[selfId]
  if (!me) return []
  return Object.values(state.models)
    .filter((m) => m.id !== selfId && m.owner === me.owner && isOnTable(m) && m.life === 'active' && within(me, m, range))
    .sort((p, q) => modelDistance(me, p) - modelDistance(me, q) || p.id.localeCompare(q.id))
}

/**
 * Empower (star Action, range 6): the warjack the player names (core's targeted special action; without a name, the friendly warjack in range
 * that has the least focus, ties nearest then id) gets 1 focus, and a Disruption on it ends first.
 */
const khaEmpower = (c: HookContext): HookResult => {
  const jacks = friendsWithin(c.state, c.selfId, 6).filter((m) => m.type === 'warEngine' && !m.inert && !m.crippled.includes('C'))
  const named = jacks.find((m) => m.id === c.targetId) // the player's choice (a targeted special action)
  const pick = named ?? [...jacks].sort((p, q) => p.focus - q.focus)[0]
  if (!pick) return noop(c)
  let state = c.state
  const events: GameEvent[] = []
  const rc = removeCondition(state, pick.id, 'disrupted', 'effect')
  state = rc.state; events.push(...rc.events)
  // a Disruption carried by an effect ends with the effect's condition
  for (const e of state.effects.filter((x) => x.targetIds.includes(pick.id) && x.conditions?.includes('disrupted'))) {
    const left = (e.conditions ?? []).filter((x) => x !== 'disrupted')
    state = { ...state, effects: state.effects.map((x) => (x.id === e.id ? ({ ...x, conditions: left } as EffectInstance) : x)) }
  }
  const g = gainFocus(state, pick.id, 1, 'gain', c.selfId)
  return { state: g.state, events: [...events, ...g.events] }
}

/**
 * Sigil of Power (star Action, range 6): the friendly model (and its whole unit) in range that stands nearest an enemy makes
 * magical weapon attacks until the end of the turn. The plugin below adds the damage type while the effect lasts.
 */
const khaSigilOfPower = (c: HookContext): HookResult => {
  const me = c.state.models[c.selfId]
  if (!me) return noop(c)
  const foes = Object.values(c.state.models).filter((m) => m.owner !== me.owner && isOnTable(m) && m.life === 'active')
  const gap = (m: ModelState): number => foes.reduce((n, f) => Math.min(n, modelDistance(m, f)), Infinity)
  const near = friendsWithin(c.state, c.selfId, 6)
  const pick = near.find((m) => m.id === c.targetId) ?? [...near].sort((p, q) => gap(p) - gap(q) || p.id.localeCompare(q.id))[0] // the player's choice, else nearest an enemy
  if (!pick) return noop(c)
  const ids = pick.unitId ? (c.state.units[pick.unitId]?.troopers ?? []).filter((t) => c.state.models[t] && isOnTable(c.state.models[t]!)) : [pick.id]
  const r = applyEffect(c.state, { sourceId: SIGIL, name: 'Sigil of Power', owner: me.owner, casterId: c.selfId, targetIds: ids, mods: [], duration: 'turn' })
  return { state: r.state, events: r.events }
}

export const khadorHooks: CodeHookRegistry = {
  conditions: {},
  effects: { marksmanColumn, grantQuality, armorPiercing, avengingForce, pallOfAshesMove, volleyFire, razorWind, khaEmpower, khaSigilOfPower },
}

// ---------- Avenging Force seam for the Maintenance module ----------
/** Avenging Force effects armed during the enemy turn. The maintenance module advances each engine 3" and gives it one basic attack. */
export function avengingForceReady(state: GameState): { effectId: Id; engineId: ModelId; casterId: ModelId }[] {
  return state.effects
    .filter((e) => e.sourceId === 'kha.s.avenging-force' && (e as EffectInstance & { triggered?: boolean }).triggered)
    .map((e) => ({ effectId: e.id, engineId: e.targetIds[0]!, casterId: e.casterId! }))
}
/** Arm Avenging Force effects when a friendly model of the caster takes damage in the enemy turn. */
export function noteDamaged(state: GameState, damagedId: ModelId): GameState {
  const d = state.models[damagedId]
  if (!d) return state
  let changed = false
  const effects = state.effects.map((e) => {
    if (e.sourceId !== 'kha.s.avenging-force' || e.owner !== d.owner || state.activePlayer === d.owner) return e
    changed = true
    return { ...e, triggered: true } as EffectInstance
  })
  return changed ? { ...state, effects } : state
}

/** Mean of max(0, nd6 + flat - arm), exact (n is a handful of dice at most). */
export function meanPoints(n: number, flat: number, arm: number): number {
  let dist: number[] = [1]
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(dist.length + 6).fill(0)
    dist.forEach((p, s) => { for (let d = 1; d <= 6; d++) next[s + d] = (next[s + d] ?? 0) + p / 6 })
    dist = next
  }
  return dist.reduce((acc, p, s) => acc + p * Math.max(0, s + flat - arm), 0)
}
const boxesLeft = (m: ModelState): number => (m.damage.track === 'single' ? Math.max(1, m.damage.boxes) - m.damage.filled : Infinity)

export const khadorPlugins: AttackPlugin[] = [{
  id: 'khador-skirmish',
  /** Sigil of Power makes the damage of every weapon the carrier uses magical while the effect lasts. */
  damageTypes(state, _b, atk): DamageType[] {
    return state.effects.some((e) => e.sourceId === SIGIL && e.targetIds.includes(atk.attackerId)) ? ['magical'] : []
  },
  /**
   * Sniper: a ranged direct hit by a Sniper model does 1 point in place of the damage roll when that beats the roll: the target
   * has one box left (a sure kill), or the roll's expected damage is below 1 (high ARM). The choice is made on the odds, never on
   * the dice already rolled. Razor Wind: a critical hit on a grid or spiral model fills the unmarked boxes of the last column
   * damaged (the column is rolled here and handed to the damage step, like Marksman's pick).
   */
  adjustPoints(state, b, atk, job, points) {
    if (job.kind !== 'direct') return null
    const t = state.models[job.targetId]
    if (!t) return null
    let pts = points
    let s = state
    const events: GameEvent[] = []
    const rolled = atk.x.cur?.rolled
    if (hasAb(state, b, atk.attackerId, SNIPER) && isRangedKind(atk.kind) && rolled) {
      if (boxesLeft(t) <= 1 || meanPoints(rolled.nDice, rolled.flat, rolled.arm) < 1) pts = 1
    }
    if (atk.x.star === RAZOR_WIND && pts >= 1 && atk.x.results[job.targetId]?.crit && t.damage.track === 'grid' && t.damage.grids.length === 1 && (t.type === 'warEngine' || t.type === 'beast')) {
      let column = atk.x.flags.column as number | undefined
      if (column === undefined) {
        const r = rollNd6(s, 1, 'column', { ownerId: t.id })
        s = r.state; events.push(r.event); column = r.dice[0]!
      }
      const grid = t.damage.grids[0]!
      const fr = fillGrid(t.damage.grids, grid.id, column, pts)
      const last = fr.boxes[fr.boxes.length - 1]
      if (last) pts += fr.grids[0]!.cols[last.col]!.filter((x) => !x).length
      const a2 = atkOf(s)!
      s = setAtk(s, { ...a2, x: { ...a2.x, flags: { ...a2.x.flags, column } } })
    }
    return pts === points && s === state ? null : { state: s, events, points: pts }
  },
  /** Sniper: a model disabled by the Sniper's ranged attack gets no Tough roll. */
  onBoxed(state, b, atk) {
    if (!hasAb(state, b, atk.attackerId, SNIPER) || !isRangedKind(atk.kind)) return null
    return { removeFromPlay: false, denyTough: true }
  },
}]
