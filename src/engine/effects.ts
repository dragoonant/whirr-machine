// R9, R12.3, 00 section 6.1: effect instances, durations, same-name rule, conditions. Pure: state in, state out.
import { computeStat } from './dice'
import type { GridLayout } from './damage'
import type { GameEvent } from './events'
import type {
  DamageType, DataBundle, EffectDuration, EffectInstance, GameState, Id, ModelId, ModelState, PlayerId, Stat, StoredConditionId,
} from './types'

// ---------- data helpers ----------
export type Profile = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export const profileOf = (bundle: DataBundle, m: Pick<ModelState, 'profileId'>): Profile => (bundle.byId[m.profileId] ?? {}) as Profile
export const hasAbility = (bundle: DataBundle, m: ModelState, abilityId: Id): boolean =>
  ((profileOf(bundle, m).abilities as string[] | undefined) ?? []).includes(abilityId)
export const otherPlayer = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const setModel = (s: GameState, m: ModelState): GameState => ({ ...s, models: { ...s.models, [m.id]: m } })

// ---------- effects ----------
export const effectsOn = (state: GameState, targetId: Id): EffectInstance[] => (state.effects ?? []).filter((e) => e.targetIds.includes(targetId))

/** When an effect created now with this duration ends (R12.3). Turn numbers are global player turns. */
export function expiryFor(state: GameState, duration: EffectDuration): EffectInstance['expires'] {
  if (duration === 'turn') return { round: state.round, turn: state.turn, player: state.activePlayer }
  if (duration === 'round') return { round: state.round + 1, turn: state.turn + 2, player: state.activePlayer } // start of creator's next turn
  return null
}
const later = (a: EffectInstance['expires'], b: EffectInstance['expires']): EffectInstance['expires'] =>
  a === null || b === null ? null : a.turn >= b.turn ? a : b

/**
 * Extra, optional parts of an effect that the frozen EffectInstance does not name (engine-internal, JSON-safe, read through casts):
 *  grants: ability ids the targets have while it lasts (Soul Phase, Fight to the Last); resist: damage types the targets resist
 *  (Fortification); condMods: DEF/ARM mods that apply only to some attack kinds; ignoreFriendly: friendly models never block
 *  the targets' LOS and can be moved through (Precision Strike); noAdvance: the targets cannot advance (Shadow Bind).
 */
export interface EffectExtras {
  grants?: Id[]
  resist?: DamageType[]
  condMods?: { stat: Stat; value: number; mode?: 'add' | 'set' | 'double' | 'half'; kinds: string[] }[]
  ignoreFriendly?: boolean
  noAdvance?: boolean
  /** Fortification: friendly models of the caster inside its CTRL count as in cover against ranged and arcane attacks (read by defFor) */
  grantedCover?: boolean
  /** flat attack or damage roll modifiers of the models the effect is on (Crippling Grasp); `kinds` limits them to those attack kinds */
  rollMods?: { roll: 'attack' | 'damage' | 'any'; value: number; kinds?: string[] }[]
  /** Enliven: after an enemy attack damages the model it may advance this far at once, then the effect ends */
  afterDamageAdvance?: number
  /** M10 (R1.12): the effect's owner may make the affected model reroll one of its own attack or damage rolls, once; the effect then ends (Marionette style) */
  rerollRight?: { roll: 'attack' | 'damage' | 'any' }
}
/** Apply an effect. A same-named effect on the same targets never stacks: keep one instance with the later expiry (R9.10). */
export function applyEffect(
  state: GameState, spec: Omit<EffectInstance, 'id' | 'expires'> & { expires?: EffectInstance['expires'] } & EffectExtras,
): { state: GameState; events: GameEvent[]; effect: EffectInstance } {
  const expires = spec.expires === undefined ? expiryFor(state, spec.duration) : spec.expires
  const dup = state.effects.find((e) => e.name === spec.name && e.targetIds.some((t) => spec.targetIds.includes(t)))
  if (dup) {
    const merged: EffectInstance = { ...dup, expires: later(dup.expires, expires), targetIds: [...new Set([...dup.targetIds, ...spec.targetIds])] }
    return {
      state: { ...state, effects: state.effects.map((e) => (e.id === dup.id ? merged : e)) },
      events: [{ type: 'EffectApplied', effectId: dup.id, sourceId: spec.sourceId, name: spec.name, targetIds: spec.targetIds, refreshed: true }],
      effect: merged,
    }
  }
  const seq = state.effectSeq + 1
  const effect: EffectInstance = { ...spec, id: `e:${seq}`, expires }
  return {
    state: { ...state, effectSeq: seq, effects: [...state.effects, effect] },
    events: [{ type: 'EffectApplied', effectId: effect.id, sourceId: spec.sourceId, name: spec.name, targetIds: spec.targetIds, refreshed: false }],
    effect,
  }
}

export function removeEffect(state: GameState, effectId: Id, reason: Extract<GameEvent, { type: 'EffectExpired' }>['reason']): { state: GameState; events: GameEvent[] } {
  const e = state.effects.find((x) => x.id === effectId)
  if (!e) return { state, events: [] }
  const upkeeps = { ...state.upkeeps }
  for (const [k, v] of Object.entries(upkeeps)) {
    const nv = { ...v }
    if (nv.friendly === effectId) delete nv.friendly
    if (nv.enemy === effectId) delete nv.enemy
    if (nv.friendly || nv.enemy) upkeeps[k] = nv
    else delete upkeeps[k]
  }
  return { state: { ...state, effects: state.effects.filter((x) => x.id !== effectId), upkeeps }, events: [{ type: 'EffectExpired', effectId, reason }] }
}

/**
 * Expire effects of one duration kind.
 *  - 'turnStart' (R4.0): 'round' effects whose expiry turn has come, owned by the player starting a turn.
 *  - 'turnEnd' (R12.2): 'turn' effects whose expiry turn has come.
 *  - 'activation' / 'attack': every effect of that duration.
 */
export function expireEffects(state: GameState, when: 'turnStart' | 'turnEnd' | 'activation' | 'attack'): { state: GameState; events: GameEvent[] } {
  const due = state.effects.filter((e) => {
    if (when === 'turnStart') return e.duration === 'round' && e.expires !== null && e.expires.turn <= state.turn && e.expires.player === state.activePlayer
    if (when === 'turnEnd') return e.duration === 'turn' && e.expires !== null && e.expires.turn <= state.turn
    return e.duration === when
  })
  let s = state
  const events: GameEvent[] = []
  for (const e of due) { const r = removeEffect(s, e.id, 'duration'); s = r.state; events.push(...r.events) }
  return { state: s, events }
}

/** A caster that is gone ends its upkeep effects (R8.6). */
export function expireCasterEffects(state: GameState, casterId: ModelId): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  for (const e of state.effects.filter((x) => x.upkeep?.casterId === casterId || (x.duration === 'upkeep' && x.casterId === casterId))) {
    const r = removeEffect(s, e.id, 'casterDestroyed'); s = r.state; events.push(...r.events)
  }
  return { state: s, events }
}

// ---------- stats ----------
/** Base stat from the profile plus every effect mod on the model (R1.13 order lives in computeStat). */
export function modelStat(state: GameState, bundle: DataBundle, modelId: ModelId, stat: Stat): number {
  const m = state.models[modelId]
  if (!m) return 0
  const base = ((profileOf(bundle, m).stats ?? {}) as Record<string, number>)[stat] ?? 0
  const mods = effectsOn(state, modelId).flatMap((e) => e.mods.filter((x) => x.stat === stat))
  return computeStat(stat, base, mods)
}

// ---------- conditions (R9) ----------
/** Stored conditions plus conditions an effect grants. */
export function hasCondition(state: GameState, m: ModelState, cond: StoredConditionId): boolean {
  return m.conditions.includes(cond) || effectsOn(state, m.id).some((e) => e.conditions?.includes(cond))
}
export const isKnockedDown = (state: GameState, m: ModelState): boolean => hasCondition(state, m, 'knockedDown')
export const isStationary = (state: GameState, m: ModelState): boolean => hasCondition(state, m, 'stationary')
/** R9.4: a disrupted war-engine loses its focus and cannot gain any for the effect's duration. */
export const isDisrupted = (state: GameState, m: ModelState): boolean => hasCondition(state, m, 'disrupted')
export const isInert = (m: ModelState): boolean => !!m.inert || m.conditions.includes('inert')
export const cortexCrippled = (m: ModelState): boolean => m.crippled.includes('C')
export const isCaster = (m: ModelState): boolean => m.type === 'leader'
export const isWarEngine = (m: ModelState): boolean => m.type === 'warEngine'

export function addCondition(state: GameState, modelId: ModelId, cond: StoredConditionId, sourceId?: Id): { state: GameState; events: GameEvent[] } {
  const m = state.models[modelId]
  if (!m || m.conditions.includes(cond)) return { state, events: [] } // not cumulative (R9.1)
  return { state: setModel(state, { ...m, conditions: [...m.conditions, cond] }), events: [{ type: 'ConditionAdded', modelId, condition: cond, sourceId }] }
}
export function removeCondition(
  state: GameState, modelId: ModelId, cond: StoredConditionId, reason: Extract<GameEvent, { type: 'ConditionRemoved' }>['reason'],
): { state: GameState; events: GameEvent[] } {
  const m = state.models[modelId]
  if (!m || !m.conditions.includes(cond)) return { state, events: [] }
  return { state: setModel(state, { ...m, conditions: m.conditions.filter((c) => c !== cond) }), events: [{ type: 'ConditionRemoved', modelId, condition: cond, reason }] }
}

/** Resistance or immunity to a continuous effect's damage type, read from the profile (fire / corrosion). */
export function immuneToContinuous(bundle: DataBundle, m: ModelState, cond: 'fire' | 'corrosion'): boolean {
  return hasAbility(bundle, m, `core.a.resist-${cond}`) || hasAbility(bundle, m, `core.a.immunity-${cond}`)
}

// ---------- profile damage layouts and inert cohorts ----------
/** Grid layouts for a profile's damage track (undefined for single-row models). */
export function gridLayoutsOf(profile: Profile): GridLayout[] | undefined {
  const d = profile.damage as { track: string; columns?: string[]; branches?: string[]; grids?: { left: string[]; right: string[] } } | undefined
  if (!d) return undefined
  if (d.track === 'spiral' && d.branches) return [{ id: 'main', columns: d.branches.map((x) => x.toLowerCase()), spiral: true }] // M9
  if (d.track === 'grid' && d.columns) return [{ id: 'main', columns: d.columns }]
  if (d.track === 'dualGrid' && d.grids) return [{ id: 'left', columns: d.grids.left }, { id: 'right', columns: d.grids.right }]
  return undefined
}

/** R8.9: when a caster leaves play its war-engines go inert and lose their focus. */
export function markInertCohorts(state: GameState, casterId: ModelId): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  for (const m of Object.values(state.models)) {
    if (m.controllerId !== casterId || m.type !== 'warEngine' || m.inert || m.life === 'destroyed') continue
    const focusLost = m.focus > 0
    s = setModel(s, { ...m, inert: true, focus: 0 })
    events.push({ type: 'WarEngineInert', modelId: m.id, casterId })
    if (focusLost) events.push({ type: 'FocusChanged', modelId: m.id, delta: -m.focus, after: 0, reason: 'lose' })
  }
  return { state: s, events }
}
