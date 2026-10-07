// M9 (81): fury is a first-class resource, the twin of focus.ts. Warlocks hold fury (cap ARC); beasts are forced, which puts
// fury ON the beast (cap FURY). Leeching, Spirit Bond, reaving, wildness, take control, threshold. Pure: state in, state out.
// This module never imports damage.ts or focus.ts (they import it); self-leech damage is applied by the Control Phase.
import type { AdjustFuryAction, LeechAction, TakeControlAction } from './actions'
import { sumDistribution } from './dice'
import { applyEffect, effectsOn, modelStat, profileOf } from './effects'
import type { GameEvent } from './events'
import { modelDistance, within } from './measure'
import type {
  DamageState, DataBundle, ForcePurpose, FuryPurpose, FuryReason, GameState, ModelId, ModelState, PlayerId, Rejection,
} from './types'
import { ASPECT_LETTER, type Aspect } from './types'

const setModel = (s: GameState, m: ModelState): GameState => ({ ...s, models: { ...s.models, [m.id]: m } })
const rej = (code: Rejection['code'], message: string, detail?: Record<string, unknown>): { rejection: Rejection } => ({ rejection: { code, message, detail } })
export type FuryOut = { state: GameState; events: GameEvent[] }
export type FuryResult = FuryOut | { rejection: Rejection }
export const isFuryRejection = (r: object): r is { rejection: Rejection } => 'rejection' in r

// ---------- classification ----------
export const isFuryModel = (m: ModelState): boolean => m.fury !== undefined
export const isBeast = (m: ModelState): boolean => m.type === 'beast'
export const isWarlock = (m: ModelState): boolean => m.type === 'leader' && m.fury !== undefined
/** Cohort models: war-engines and warbeasts (secure 50 mm objectives, power attacks, Recon minimum). */
export const isCohort = (m: ModelState): boolean => m.type === 'warEngine' || m.type === 'beast'
export const isWild = (m: ModelState): boolean => !!m.wild
export const furyOf = (m: ModelState): number => m.fury ?? 0
export const aspectCrippled = (m: ModelState, a: Aspect): boolean => m.crippled.includes(ASPECT_LETTER[a])
/** Medium-or-larger counts for Spirit Bond (F4.5): 40 mm and up. */
export const spiritBondSize = (m: ModelState): boolean => m.base >= 40

/** Profile flag check without the code-hook machinery (Construct). */
export function profileFlag(b: DataBundle, m: ModelState, flag: string): boolean {
  const p = profileOf(b, m)
  if (Array.isArray(p.flags) && p.flags.includes(flag)) return true
  if (Array.isArray(p.keywords) && p.keywords.includes(flag)) return true
  for (const id of (p.abilities as string[] | undefined) ?? []) {
    if (id === `core.a.${flag}`) return true
    const ab = (b.byId[id] ?? {}) as { effect?: { code?: string; params?: { flag?: string } }[] }
    if ((ab.effect ?? []).some((n) => n.code === 'coreFlag' && n.params?.flag === flag)) return true
  }
  return false
}
export const isConstructBeast = (b: DataBundle, m: ModelState): boolean => profileFlag(b, m, 'construct')

/** ARC for a warlock, FURY for a beast (current value, effects included). */
export const capOf = (state: GameState, b: DataBundle, m: ModelState): number => modelStat(state, b, m.id, isWarlock(m) ? 'ARC' : 'FURY')
export const warlockCtrl = (state: GameState, b: DataBundle, w: ModelState): number => modelStat(state, b, w.id, 'CTRL')

const warlockUp = (w: ModelState | undefined): w is ModelState => !!w && isWarlock(w) && w.life === 'active' && !w.offTable
/** The warlock a beast answers to (alive, on the table), else undefined. */
export function controllerOf(state: GameState, m: ModelState): ModelState | undefined {
  const w = m.controllerId ? state.models[m.controllerId] : undefined
  return warlockUp(w) ? w : undefined
}
/** F2.5: inside the warlock's CTRL (circle from its base edge); the warlock is always in its own. LOS never needed. */
export function inCtrlOf(state: GameState, b: DataBundle, w: ModelState, m: ModelState): boolean {
  return m.id === w.id || within(w, m, warlockCtrl(state, b, w))
}
/** Beasts of a warlock's battlegroup that are alive on the table and not wild. */
export const battlegroupOf = (state: GameState, w: ModelState): ModelState[] =>
  Object.values(state.models).filter((m) => isBeast(m) && m.controllerId === w.id && !m.wild && m.life === 'active' && !m.offTable).sort((a, c) => a.id.localeCompare(c.id))
export const beastsInCtrl = (state: GameState, b: DataBundle, w: ModelState): ModelState[] => battlegroupOf(state, w).filter((m) => inCtrlOf(state, b, w, m))

/** Unmarked boxes left on a model's damage track (a track with no boxes counts as 1). */
export function unmarkedBoxes(d: DamageState): number {
  if (d.track === 'single') return Math.max(Math.max(d.boxes, 1) - d.filled, 0)
  return d.grids.reduce((a, g) => a + g.cols.reduce((c, col) => c + col.filter((x) => !x).length, 0), 0)
}

// ---------- setters ----------
export function setFury(state: GameState, id: ModelId, value: number, reason: FuryReason, purpose?: FuryPurpose, fromId?: ModelId): FuryOut {
  const m = state.models[id]
  if (!m || m.fury === undefined || value === m.fury) return { state, events: [] }
  return {
    state: setModel(state, { ...m, fury: value }),
    events: [{ type: 'FuryChanged', modelId: id, delta: value - m.fury, after: value, reason, purpose, fromId }],
  }
}

/** Initialise starting fury (F1.4): warlocks = ARC, beasts 0. Idempotent. */
export function startingFury(state: GameState, b: DataBundle): FuryOut {
  let s = state
  const events: GameEvent[] = []
  for (const m of Object.values(state.models)) {
    const p = profileOf(b, m)
    const fury = m.fury === undefined && ((m.type === 'leader' && p.resource === 'fury') || m.type === 'beast')
    if (!fury) continue
    const start = m.type === 'beast' ? 0 : modelStat(s, b, m.id, 'ARC')
    s = setModel(s, { ...m, fury: 0, focus: 0 })
    if (start > 0) { const r = setFury(s, m.id, start, 'start'); s = r.state; events.push(...r.events) }
  }
  return { state: s, events }
}

/** Plain gain (an effect, Spirit Bond, a card rule). Wild models and 'gainFury' forbids gain nothing; stops at the cap. */
export function gainFury(state: GameState, b: DataBundle, id: ModelId, n: number, reason: FuryReason = 'gain', fromId?: ModelId): FuryOut & { gained: number } {
  const m = state.models[id]
  if (!m || n <= 0 || m.fury === undefined || m.wild || m.life !== 'active') return { state, events: [], gained: 0 }
  if (effectsOn(state, id).some((e) => e.forbid?.includes('gainFury'))) return { state, events: [], gained: 0 }
  const target = Math.min(m.fury + n, Math.max(capOf(state, b, m), m.fury))
  const r = setFury(state, id, target, reason, undefined, fromId)
  return { ...r, gained: target - m.fury }
}
/** Remove fury (an effect or a rule); never below 0. */
export function loseFury(state: GameState, id: ModelId, n: number, reason: FuryReason = 'lose'): FuryOut & { lost: number } {
  const m = state.models[id]
  if (!m || m.fury === undefined || n <= 0) return { state, events: [], lost: 0 }
  const target = Math.max(0, m.fury - n)
  return { ...setFury(state, id, target, reason), lost: m.fury - target }
}

/** The warlock's own spend (F2.2). E_INSUFFICIENT_FURY when short; never below 0. */
export function spendFury(state: GameState, id: ModelId, n: number, purpose: FuryPurpose): FuryResult {
  const m = state.models[id]
  if (!m || m.fury === undefined) return rej('E_TARGET_INVALID', `${id} holds no fury`)
  if (m.type === 'beast') return rej('E_CANNOT_FORCE', 'a beast never spends fury; it is forced')
  if (m.fury < n) return rej('E_INSUFFICIENT_FURY', `${id} has ${m.fury} fury, needs ${n}`)
  return n === 0 ? { state, events: [] } : setFury(state, id, m.fury - n, 'spend', purpose)
}

/** F2.3: remove any number of the warlock's own fury. */
export function shed(state: GameState, id: ModelId, n: number): FuryResult {
  const m = state.models[id]
  if (!m || !isWarlock(m)) return rej('E_TARGET_INVALID', `${id} is not a warlock`)
  if (n < 0 || !Number.isInteger(n)) return rej('E_BAD_PAYLOAD', 'shed a whole number of fury')
  if (n > m.fury!) return rej('E_INSUFFICIENT_FURY', `${id} has ${m.fury} fury`)
  return setFury(state, id, m.fury! - n, 'shed')
}

// ---------- forcing (F5) ----------
export type FuryBlockCode = 'wild' | 'frenzied' | 'spirit' | 'outOfCtrl' | 'cap' | 'noController'
/** The first failing check of the forceable gate, as a code plus the rejection; null when the beast can take `n` fury. */
export function forceGate(state: GameState, b: DataBundle, id: ModelId, n: number, purpose?: ForcePurpose): { block: FuryBlockCode; rejection: Rejection } | null {
  const m = state.models[id]
  const bad = (block: FuryBlockCode, code: Rejection['code'], message: string): { block: FuryBlockCode; rejection: Rejection } => ({ block, rejection: { code, message } })
  if (!m || m.type !== 'beast' || m.fury === undefined) return bad('noController', 'E_CANNOT_FORCE', `${id} is not a beast`)
  if (m.life !== 'active' || m.offTable) return bad('noController', 'E_CANNOT_FORCE', `${id} is not on the table`)
  if (m.wild) return bad('wild', 'E_CANNOT_FORCE', 'wild beasts cannot be forced')
  if (m.frenzied) return bad('frenzied', 'E_CANNOT_FORCE', 'a frenzied beast cannot be forced')
  const w = controllerOf(state, m)
  if (!w) return bad('noController', 'E_CANNOT_FORCE', `${id} has no warlock to force it`)
  if (effectsOn(state, id).some((e) => e.forbid?.includes('force') || e.forbid?.includes('gainFury'))) return bad('noController', 'E_CANNOT_FORCE', 'an effect stops this beast being forced')
  if (!inCtrlOf(state, b, w, m)) return bad('outOfCtrl', 'E_OUT_OF_CTRL', `${id} is outside ${w.id}'s CTRL`)
  if (aspectCrippled(m, 'spirit')) return bad('spirit', 'E_CRIPPLED', 'Spirit is crippled: this beast cannot be forced')
  if (purpose === 'animus' && state.activation?.limitsUsed.includes(`animus:${id}`)) return { block: 'cap', rejection: { code: 'E_ALREADY_USED', message: 'one animus cast per activation' } }
  if (m.fury + n > capOf(state, b, m)) return bad('cap', 'E_FURY_CAP', `${id} would pass its FURY`)
  return null
}
/** Rejection or null; the cheap form of forceGate for validators. */
export const canForce = (state: GameState, b: DataBundle, id: ModelId, n: number, purpose?: ForcePurpose): Rejection | null => forceGate(state, b, id, n, purpose)?.rejection ?? null

/** Put `n` fury on a beast (the warlock pays nothing). Rejects on the first failed gate. */
export function force(state: GameState, b: DataBundle, id: ModelId, n: number, purpose: ForcePurpose): FuryResult {
  if (n <= 0) return { state, events: [] }
  const g = forceGate(state, b, id, n, purpose)
  if (g) return { rejection: g.rejection }
  const m = state.models[id]!
  const r = setFury(state, id, m.fury! + n, 'forced')
  return { state: r.state, events: [...r.events, { type: 'BeastForced', beastId: id, controllerId: m.controllerId!, purpose, gained: n, after: m.fury! + n }] }
}
/** F5.7: gain fury for nothing else. */
export const rile = (state: GameState, b: DataBundle, id: ModelId, n: number): FuryResult => force(state, b, id, n, 'rile')

/** F5.8: a beast whose current FURY dropped loses the excess at once. */
export function clampFury(state: GameState, b: DataBundle): FuryOut {
  let s = state
  const events: GameEvent[] = []
  for (const m of Object.values(state.models)) {
    if (m.type !== 'beast' || m.fury === undefined) continue
    const cap = capOf(s, b, m)
    if (m.fury > cap) { const r = setFury(s, m.id, cap, 'capTrim'); s = r.state; events.push(...r.events) }
  }
  return { state: s, events }
}
/** F2.4 Maintenance: a warlock above ARC drops to ARC. Beasts keep what they hold (cap trim only). */
export function maintenanceFury(state: GameState, b: DataBundle, player: PlayerId): FuryOut {
  let s = state
  const events: GameEvent[] = []
  for (const m of Object.values(state.models)) {
    if (m.owner !== player || m.life === 'destroyed' || !isWarlock(m)) continue
    const arc = modelStat(s, b, m.id, 'ARC')
    if (m.fury! > arc) { const r = setFury(s, m.id, arc, 'trim'); s = r.state; events.push(...r.events) }
  }
  const c = clampFury(s, b)
  return { state: c.state, events: [...events, ...c.events] }
}

/** The any-time rile (+) and shed (-) answers: only in the model's own activation (F2.1, F5.a). */
export function validateAdjustFury(state: GameState, b: DataBundle, a: AdjustFuryAction): Rejection | null {
  const m = state.models[a.modelId]
  if (!m || m.fury === undefined) return { code: 'E_TARGET_INVALID', message: `${a.modelId} holds no fury` }
  if (!Number.isInteger(a.delta) || a.delta === 0) return { code: 'E_BAD_PAYLOAD', message: 'delta must be a non-zero whole number' }
  if (m.owner !== a.player) return { code: 'E_NOT_YOUR_DECISION', message: 'not your model' }
  if (!state.activation?.modelIds.includes(a.modelId)) return { code: 'E_NOT_AN_OPTION', message: 'only in the model\'s own activation' }
  if (a.delta > 0) return m.type === 'beast' ? canForce(state, b, a.modelId, a.delta, 'rile') : { code: 'E_NOT_AN_OPTION', message: 'only a beast can rile' }
  if (!isWarlock(m)) return { code: 'E_NOT_AN_OPTION', message: 'only a warlock can shed' }
  return -a.delta > m.fury! ? { code: 'E_INSUFFICIENT_FURY', message: `${m.id} has ${m.fury} fury` } : null
}
export function applyAdjustFury(state: GameState, b: DataBundle, a: AdjustFuryAction): FuryResult {
  const bad = validateAdjustFury(state, b, a)
  if (bad) return { rejection: bad }
  return a.delta > 0 ? rile(state, b, a.modelId, a.delta) : shed(state, a.modelId, -a.delta)
}

// ---------- leeching and Spirit Bond (F4) ----------
export interface LeechPlanArg { from: Record<ModelId, number>; self: number }
export const leechRoom = (state: GameState, b: DataBundle, w: ModelState): number => Math.max(0, capOf(state, b, w) - (w.fury ?? 0))
/** Beasts the warlock could draw fury from: its battlegroup, in CTRL, holding fury. */
export const leechSources = (state: GameState, b: DataBundle, w: ModelState): ModelState[] => beastsInCtrl(state, b, w).filter((m) => (m.fury ?? 0) > 0)
/** F4.5: 1 per medium-or-larger beast of this battlegroup that was destroyed or removed and is still gone. */
export const spiritBondPoints = (state: GameState, w: ModelState): number =>
  Object.values(state.models).filter((m) => m.type === 'beast' && m.bondedTo === w.id && m.life !== 'active' && spiritBondSize(m)).length

export function validateLeech(state: GameState, b: DataBundle, a: Pick<LeechAction, 'warlockId' | 'from' | 'self' | 'player'>): Rejection | null {
  const w = state.models[a.warlockId]
  if (!warlockUp(w)) return { code: 'E_TARGET_INVALID', message: `${a.warlockId} is not a warlock on the table` }
  if (w.owner !== a.player) return { code: 'E_NOT_YOUR_DECISION', message: 'not your warlock' }
  if (!Number.isInteger(a.self) || a.self < 0) return { code: 'E_BAD_PAYLOAD', message: 'self-leech must be a whole number >= 0' }
  let total = a.self
  for (const [id, n] of Object.entries(a.from)) {
    if (!Number.isInteger(n) || n < 0) return { code: 'E_BAD_PAYLOAD', message: 'leech amounts must be whole numbers >= 0' }
    if (n === 0) continue
    const m = state.models[id]
    if (!m || m.type !== 'beast' || m.controllerId !== w.id || m.wild || m.life !== 'active' || m.offTable) return { code: 'E_TARGET_INVALID', message: `${id} is not in ${w.id}'s battlegroup` }
    if (!inCtrlOf(state, b, w, m)) return { code: 'E_OUT_OF_CTRL', message: `${id} is outside CTRL` }
    if (n > (m.fury ?? 0)) return { code: 'E_INSUFFICIENT_FURY', message: `${id} holds ${m.fury ?? 0} fury` }
    total += n
  }
  if (total > leechRoom(state, b, w)) return { code: 'E_FURY_CAP', message: `leeching ${total} would push ${w.id} past ARC` }
  if (a.self > unmarkedBoxes(w.damage)) return { code: 'E_NOT_AN_OPTION', message: 'cannot self-leech more than the damage boxes left' }
  return null
}

/**
 * Move the fury only (F4.1). The self-leech damage is applied by the caller (control.ts) because it needs damage.ts;
 * this still adds the self-leeched fury to the warlock (reason 'leechSelf').
 */
export function leechFury(state: GameState, a: Pick<LeechAction, 'warlockId' | 'from' | 'self'>): FuryOut & { sources: { modelId: ModelId; points: number }[] } {
  let s = state
  const events: GameEvent[] = []
  const sources: { modelId: ModelId; points: number }[] = []
  for (const [id, n] of Object.entries(a.from).sort(([x], [y]) => x.localeCompare(y))) {
    if (n <= 0) continue
    const bm = s.models[id]!
    const r1 = setFury(s, id, (bm.fury ?? 0) - n, 'leech'); s = r1.state; events.push(...r1.events)
    const w = s.models[a.warlockId]!
    const r2 = setFury(s, a.warlockId, (w.fury ?? 0) + n, 'leech', undefined, id); s = r2.state; events.push(...r2.events)
    sources.push({ modelId: id, points: n })
  }
  if (a.self > 0) { const w = s.models[a.warlockId]!; const r = setFury(s, a.warlockId, (w.fury ?? 0) + a.self, 'leechSelf'); s = r.state; events.push(...r.events) }
  return { state: s, events, sources }
}

/** F4.5, F4.6: auto-applied at the maximum, still capped at ARC. */
export function applySpiritBond(state: GameState, b: DataBundle, warlockId: ModelId): FuryOut & { points: number } {
  const w = state.models[warlockId]
  if (!warlockUp(w)) return { state, events: [], points: 0 }
  const n = Math.min(spiritBondPoints(state, w), leechRoom(state, b, w))
  if (n <= 0) return { state, events: [], points: 0 }
  const r = setFury(state, warlockId, w.fury! + n, 'spiritBond')
  return { ...r, points: n }
}

// ---------- beast leaves play: reaving (F9) ----------
export interface BeastDeathOpts { friendlyAttack?: boolean; transferred?: boolean }
/**
 * Call right after a beast is destroyed or removed from play. Records bondedTo (F9.6), then reaves (F9.1-F9.5): the
 * controller takes all the fury it can hold when the beast was in CTRL and not killed by a friendly attack or by
 * transferred damage; anything else is lost. One eligible reaver, so it is auto-applied.
 */
export function onBeastLeavesPlay(state: GameState, b: DataBundle, beastId: ModelId, opts: BeastDeathOpts = {}): FuryOut {
  const beast = state.models[beastId]
  if (!beast || beast.type !== 'beast') return { state, events: [] }
  let s = state
  const events: GameEvent[] = []
  const w = beast.wild ? undefined : controllerOf(s, beast)
  if (!beast.wild && beast.controllerId) s = setModel(s, { ...s.models[beastId]!, bondedTo: beast.controllerId })
  const f = beast.fury ?? 0
  if (f <= 0) return { state: s, events }
  const eligible = !!w && !opts.friendlyAttack && !opts.transferred && inCtrlOf(s, b, w, beast)
  if (eligible && w) {
    const room = Math.max(0, capOf(s, b, w) - (w.fury ?? 0))
    const gain = Math.min(f, room)
    const r1 = setFury(s, beastId, 0, 'reave', undefined, w.id); s = r1.state; events.push(...r1.events)
    if (gain > 0) { const r2 = setFury(s, w.id, w.fury! + gain, 'reave', undefined, beastId); s = r2.state; events.push(...r2.events) }
    events.push({ type: 'DecisionAutoResolved', kind: 'reave', optionId: w.id } as GameEvent)
    events.push({ type: 'FuryReaved', reaverId: w.id, beastId, points: gain, lost: f - gain })
    return { state: s, events }
  }
  const r = setFury(s, beastId, 0, 'lose'); s = r.state; events.push(...r.events)
  return { state: s, events }
}

// ---------- warlock gone: wild beasts (F11) ----------
/** F11.1, F11.4: every live beast of this battlegroup goes wild (and inert), loses all fury. Upkeeps expire via expireCasterEffects. */
export function markWildBeasts(state: GameState, warlockId: ModelId): FuryOut {
  let s = state
  const events: GameEvent[] = []
  for (const m of Object.values(state.models)) {
    if (m.type !== 'beast' || m.controllerId !== warlockId || m.wild || m.life === 'destroyed') continue
    const lost = m.fury ?? 0
    s = setModel(s, { ...s.models[m.id]!, wild: true, inert: true, fury: 0, frenzied: false, controllerId: undefined })
    events.push({ type: 'BeastWild', modelId: m.id, warlockId })
    if (lost > 0) events.push({ type: 'FuryChanged', modelId: m.id, delta: -lost, after: 0, reason: 'wild' })
  }
  return { state: s, events }
}

/** F11.3: pay 1 fury; a friendly same-Faction warlock takes a wild beast within 1" (and the beast forfeits its Combat Action this turn). */
export function validateTakeControl(state: GameState, b: DataBundle, a: TakeControlAction): Rejection | null {
  const w = state.models[a.casterId]
  const t = state.models[a.targetId]
  if (!warlockUp(w)) return { code: 'E_TARGET_INVALID', message: `${a.casterId} is not a warlock on the table` }
  if (w.owner !== a.player) return { code: 'E_NOT_YOUR_DECISION', message: 'not your warlock' }
  if (!state.activation?.modelIds.includes(w.id)) return { code: 'E_NOT_AN_OPTION', message: 'only in the warlock\'s own activation' }
  if (!t || t.type !== 'beast' || !t.wild || t.life !== 'active' || t.owner !== w.owner) return { code: 'E_TARGET_INVALID', message: 'not a friendly wild beast' }
  const fw = profileOf(b, w).faction, ft = profileOf(b, t).faction
  if (fw !== undefined && ft !== undefined && fw !== ft) return { code: 'E_TARGET_INVALID', message: 'a warlock only takes beasts of its own Faction' }
  if (modelDistance(w, t) > 1 + 1e-6) return { code: 'E_OUT_OF_RANGE', message: 'the beast must be within 1"' }
  if ((w.fury ?? 0) < 1) return { code: 'E_INSUFFICIENT_FURY', message: 'taking control costs 1 fury' }
  return null
}
export function takeControl(state: GameState, b: DataBundle, a: TakeControlAction): FuryResult {
  const bad = validateTakeControl(state, b, a)
  if (bad) return { rejection: bad }
  const sp = spendFury(state, a.casterId, 1, 'takeControl')
  if (isFuryRejection(sp)) return sp
  let s = sp.state
  const events = [...sp.events]
  const t = s.models[a.targetId]!
  const { wild: _w, ...rest } = t
  s = setModel(s, { ...rest, inert: false, controllerId: a.casterId, fury: t.fury ?? 0 })
  events.push({ type: 'BeastControlTaken', modelId: a.targetId, warlockId: a.casterId }, { type: 'CombatActionForfeited', modelId: a.targetId, reason: 'tookControl' })
  const e = applyEffect(s, { sourceId: 'core.fury.take-control', name: 'Taken Control', owner: t.owner, targetIds: [a.targetId], mods: [], forbid: ['combatAction'], duration: 'turn' })
  return { state: e.state, events: [...events, ...e.events] }
}

// ---------- threshold (F7) ----------
export function thresholdEligible(b: DataBundle, m: ModelState): boolean {
  return m.type === 'beast' && m.life === 'active' && !m.offTable && !m.wild && !m.frenzied && (m.fury ?? 0) >= 1 && !isConstructBeast(b, m)
}
/** P(2d6 + fury > thr). */
export function pFrenzy(thr: number, fury: number): number {
  const d = sumDistribution(2)
  return d.reduce((a, p, s) => a + (s + fury > thr ? p : 0), 0)
}
export function thresholdInfo(state: GameState, b: DataBundle, beastId: ModelId, extraFury = 0): { thr: number; fury: number; need: number; pFrenzy: number; construct: boolean } {
  const m = state.models[beastId]
  const thr = m ? modelStat(state, b, beastId, 'THR') : 0
  const fury = (m?.fury ?? 0) + extraFury
  const construct = !!m && isConstructBeast(b, m)
  return { thr, fury, need: thr - fury + 1, pFrenzy: construct || fury < 1 ? 0 : pFrenzy(thr, fury), construct }
}

// ---------- query rows (81 D.2; index.ts wires them) ----------
export function furyInfo(state: GameState, b: DataBundle, id: ModelId): {
  kind: 'warlock' | 'beast' | null; fury: number; cap: number; capStat: 'ARC' | 'FURY'; controllerId?: ModelId; inCtrl?: boolean
  forceable: boolean; block?: FuryBlockCode; room: number
} {
  const m = state.models[id]
  if (!m || m.fury === undefined) return { kind: null, fury: 0, cap: 0, capStat: 'FURY', forceable: false, room: 0 }
  const cap = capOf(state, b, m)
  if (isWarlock(m)) return { kind: 'warlock', fury: m.fury, cap, capStat: 'ARC', controllerId: m.id, inCtrl: true, forceable: false, room: Math.max(0, cap - m.fury) }
  const w = controllerOf(state, m)
  const gate = forceGate(state, b, id, 1)
  const room = Math.max(0, cap - m.fury)
  return {
    kind: 'beast', fury: m.fury, cap, capStat: 'FURY', controllerId: m.controllerId, inCtrl: w ? inCtrlOf(state, b, w, m) : false,
    forceable: !gate, block: gate?.block, room,
  }
}
export function battlegroupInfo(state: GameState, b: DataBundle, warlockId: ModelId): {
  ctrl: number; leechRoom: number; spiritBond: number; beasts: (ReturnType<typeof furyInfo> & { modelId: ModelId; pFrenzyNow: number })[]
} {
  const w = state.models[warlockId]
  if (!w || !isWarlock(w)) return { ctrl: 0, leechRoom: 0, spiritBond: 0, beasts: [] }
  return {
    ctrl: warlockCtrl(state, b, w),
    leechRoom: leechRoom(state, b, w),
    spiritBond: spiritBondPoints(state, w),
    beasts: battlegroupOf(state, w).map((m) => ({ ...furyInfo(state, b, m.id), modelId: m.id, pFrenzyNow: thresholdInfo(state, b, m.id).pFrenzy })),
  }
}
export function leechPreviewInfo(state: GameState, b: DataBundle, warlockId: ModelId, plan: LeechPlanArg): { gained: number; selfDamage: number; after: number; pFrenzyAfter: Record<ModelId, number> } {
  const w = state.models[warlockId]
  const gained = Object.values(plan.from).reduce((a, n) => a + n, 0) + plan.self
  const pf: Record<ModelId, number> = {}
  if (w && isWarlock(w)) for (const m of battlegroupOf(state, w)) pf[m.id] = thresholdInfo(state, b, m.id, -(plan.from[m.id] ?? 0)).pFrenzy
  return { gained, selfDamage: plan.self, after: (w?.fury ?? 0) + gained, pFrenzyAfter: pf }
}
