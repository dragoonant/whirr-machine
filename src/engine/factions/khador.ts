// Khador (Winter Korps, SKS-6 cadre) code hooks: every {code} the Khador data references.
// Data codes: marksmanColumn, grantQuality, armorPiercing, avengingForce, pallOfAshesMove.
import type { CodeHookRegistry, HookContext, HookResult } from '../hooks'
import { atkOf, noop, setAtk, type AttackPlugin } from '../code-hooks'
import type { EffectInstance, GameState, Id, ModelId } from '../types'

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

export const khadorHooks: CodeHookRegistry = {
  conditions: {},
  effects: { marksmanColumn, grantQuality, armorPiercing, avengingForce, pallOfAshesMove },
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

export const khadorPlugins: AttackPlugin[] = []
