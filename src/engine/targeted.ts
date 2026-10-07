// General targeted special actions (M12 follow-ups). A special action (an ability of kind `specialAction`, trigger `combat.choose`) is "targeted" when the
// player must name the friendly model it works on: core then offers one `chooseCombatAction` option per usable target (with `targetId`) instead of letting
// the code hook pick. An ability is targeted when
//   1. its record carries `targeted: true` (the scope range and filter then say who may be named), or `targeted: { range, self }` to override them, or
//   2. its effect list has a `makeAttack` or `advance` op or the `repair` hook (the original cases), or
//   3. its code hook is in TARGETED_CODES below, which also names the rule's own range, who qualifies and the order the options are listed in (the first
//      option is what the hook used to pick by itself, so callers that take the first option see no change).
// The hook gets the chosen model as `ctx.targetId`; when it is called without one (old tests, a bare runCodeEffect) it still picks for itself.
import { alive, hasFlag, isMelee, prof, rec, statOf, weaponsOf, type Rec } from './code-hooks'
import { hasCondition } from './effects'
import { isOnTable } from './geometry'
import { modelDistance, within } from './measure'
import type { DataBundle, GameState, Id, ModelId, ModelState } from './types'

export interface TargetedSpec {
  /** inches from the user (edge to edge); falls back to the ability's scope range */
  range?: number | 'CTRL' | 'melee'
  /** extra test on a candidate (the scope filter has already passed) */
  accepts?: (state: GameState, b: DataBundle, srcId: ModelId, cand: ModelState) => boolean
  /** options are listed in ascending order of this number (default: model id order) */
  rank?: (state: GameState, b: DataBundle, srcId: ModelId, cand: ModelState) => number
}

const enemyGap = (state: GameState, m: ModelState): number =>
  Object.values(state.models).filter((f) => f.owner !== m.owner && isOnTable(f) && f.life === 'active').reduce((n, f) => Math.min(n, modelDistance(m, f)), Infinity)
const keywords = (b: DataBundle, m: ModelState): string[] => (prof(b, m).keywords ?? []) as string[]
const engaged = (state: GameState, m: ModelState): boolean =>
  Object.values(state.models).some((e) => e.owner !== m.owner && alive(e) && e.life === 'active' && within(m, e, 1.5))

/** A warjack that Empower could help: focus to gain (the cap is 3) or a Disruption to end. */
const empowerable = (state: GameState, m: ModelState): boolean => m.type === 'warEngine' && !m.inert && !m.crippled.includes('C') && (m.focus < 3 || hasCondition(state, m, 'disrupted'))

/** The destroyed Grunt Grim Returns would bring back for a trooper's unit (the Furies and other characters never return). */
export function grimReturnsGrunt(state: GameState, b: DataBundle, t: ModelState): ModelState | undefined {
  if (t.type !== 'trooper' || !t.unitId || prof(b, t).character) return undefined
  const unit = state.units[t.unitId]
  if (!unit || rec(b, unit.profileId).character) return undefined
  const gruntProfile = (rec(b, unit.profileId).composition as { grunts?: { profile?: Id } } | undefined)?.grunts?.profile
  return Object.values(state.models)
    .filter((m) => m.unitId === unit.id && m.life === 'destroyed' && !m.offTable && m.profileId === gruntProfile)
    .sort((x, y) => x.id.localeCompare(y.id))[0]
}

/** Per hook code. Ranges not named here come from the ability's scope. */
export const TARGETED_CODES: Record<string, TargetedSpec> = {
  // Cryx Initiates: Empower (a Cryx warjack in 6") and Grim Returns (a trooper in 5" whose unit has lost a Grunt)
  cryEmpower: { accepts: (s, _b, _id, c) => empowerable(s, c), rank: (_s, _b, _id, c) => c.focus },
  cryGrimReturns: { accepts: (s, b, _id, c) => !!grimReturnsGrunt(s, b, c) },
  // Khador Arkanists: Empower (the warjack with the least focus first), Sigil of Power (the model nearest an enemy first)
  khaEmpower: { accepts: (s, _b, _id, c) => empowerable(s, c), rank: (s, _b, id, c) => c.focus * 100 + modelDistance(s.models[id]!, c) },
  khaSigilOfPower: { rank: (s, _b, _id, c) => enemyGap(s, c) },
  // Trollblood Runebearer: Guidance (the Leader first, then cohort models, then the rest)
  guidance: {
    accepts: (_s, _b, _id, c) => !c.inert,
    rank: (s, _b, id, c) => (c.type === 'leader' ? 0 : c.type === 'beast' || c.type === 'warEngine' ? 100 : 200) + modelDistance(s.models[id]!, c),
  },
  // Storm Vane: Lightning Wreath names a friendly model with a melee weapon in 3" (models already in a fight first, then the best MAT)
  lightningWreath: {
    range: 3,
    accepts: (s, b, _id, c) => weaponsOf(b, c).some((w) => isMelee(w.w)),
    rank: (s, b, _id, c) => (engaged(s, c) ? 0 : 100) - statOf(s, b, c.id, 'MAT'),
  },
}

const nodesOf = (ab: Rec): Rec[] => (ab.effect ?? []) as Rec[]

/** The targeting rule of a special action, or null when the ability needs no chosen model. */
export function targetedSpec(ab: Rec | undefined): TargetedSpec | null {
  if (!ab) return null
  let spec: TargetedSpec | null = null
  if (ab.targeted === true) spec = {}
  else if (ab.targeted && typeof ab.targeted === 'object') spec = { ...(ab.targeted as TargetedSpec) }
  for (const n of nodesOf(ab)) {
    if (n.op === 'makeAttack' || n.op === 'advance' || n.code === 'repair') spec = spec ?? {}
    else if (typeof n.code === 'string' && TARGETED_CODES[n.code]) spec = { ...TARGETED_CODES[n.code], ...(spec ?? {}) }
  }
  return spec
}

/** Does the ability need one chosen friendly model (Repair, Enliven, Empower, Guidance, Lightning Wreath ...) rather than an area? */
export const needsTarget = (ab: Rec | undefined): boolean => targetedSpec(ab) !== null

/** Friendly models a targeted special action may name (scope range and filter, the rule's own test; never the user), in option order. */
export function targetCandidates(
  state: GameState, b: DataBundle, id: ModelId, ab: Rec, evalFilter: (candId: ModelId) => boolean,
): ModelId[] {
  const me = state.models[id]
  const spec = targetedSpec(ab)
  if (!me || !spec) return []
  const sc = (ab.scope ?? {}) as Rec
  const raw = spec.range ?? sc.range
  const range = raw === 'CTRL' ? statOf(state, b, id, 'CTRL') : raw === 'melee' ? 1 : typeof raw === 'number' ? raw : 0
  const list = Object.values(state.models)
    .filter((t) => t.id !== id && t.owner === me.owner && alive(t) && t.life === 'active' && within(me, t, range) && evalFilter(t.id) && (!spec.accepts || spec.accepts(state, b, id, t)))
  if (spec.rank) {
    const rank = spec.rank
    list.sort((x, y) => rank(state, b, id, x) - rank(state, b, id, y) || x.id.localeCompare(y.id))
  }
  return list.map((t) => t.id)
}

/** Galvanic Capacitor (Storm Vane): each Vane uses at most one capacitor effect a turn, whichever effect it is. */
export const CAPACITOR_ABILITIES: readonly Id[] = ['cyg.a.lightning-wreath', 'cyg.a.polarity-field-generator', 'cyg.a.wind-weaver']
/** Extra once-per-activation keys a special action marks and checks besides its own `<id>:<limit>` key (a Vane's one capacitor effect per turn). */
export function sharedLimitKeys(state: GameState, b: DataBundle, id: ModelId, abId: Id): string[] {
  if (CAPACITOR_ABILITIES.includes(abId) && hasFlag(state, b, id, 'galvanicCapacitor')) return [`cyg.a.galvanic-capacitor:${id}`]
  return []
}
