// FROZEN after M0: public engine API (00 §2, §8, §10). M2 wires the bodies to the rules modules.
// Additive since M2 (00 §14): registerBundle(), the bundle registry step() reads by state.dataVersion.
import type { Action } from './actions'
import type {
  Aspect, AttackContext, BaseMm, DataBundle, ElementControl, GameSetup, GameState, Id, LosReason, ModelId, Mod, PendingDecision,
  PlayerId, PlayerView, Rejection, SaveFile, Stat, StatMod, StepResult, Vec2,
} from './types'
import { EngineInvariantError } from './types'
import type { DiceRolled, GameEvent } from './events'
import { loadBundle } from '../data/index'
import { abilitiesOf, meleeReach, prof, statOf, weaponRange, rangeBonusOf, weaponsOf, isMelee } from './code-hooks'
import { damageDistribution, expectedDamage as expDamage, pKill as pKillOf, spiralView, transferPreview as transferPreviewRows } from './damage'
import { battlegroupInfo, furyInfo, leechPreviewInfo, thresholdInfo } from './fury'
import { frenzyTarget as frenzyTargetInfo } from './phases/frenzy'
import { pAttackHit, pAttackHitDropLowest } from './dice'
import { effectsOn } from './effects'
import { runBonus } from './factions/menoth'
import { dist, isOnTable } from './geometry'
import { defModifiers, losReport } from './los'
import { modelDistance, modelToPoint } from './measure'
import { resolveAdvance } from './movement'
import { raiseGameOver, type FlowResult } from './pending'
import { activationLegalActions, activeStar, declareAttack, handleActivationAction, isChargeAttack, moverInfo, previewDamage, type DamagePreview } from './phases/activation'
import { controlReport } from './scenario'
import { answerSetup, createInitialState, isSetupDecision, setupLegalActions } from './setup'
import { housekeeping } from './housekeeping'
import { answerControlDecision, answerMaintenanceDecision, endTurn, flowLegalActions, isControlDecision, isMaintenanceDecision } from './turnflow'

export * from './types'
export * from './actions'
export * from './events'
export * from './hooks'
export * from './rng'
export * from './decider'

export const ENGINE_VERSION = '0.2.0'

// ---------- data bundles ----------
// step(state, action) takes no bundle (frozen signature), so the engine keeps the bundles it has seen, keyed by version.
const BUNDLES = new Map<string, DataBundle>()
let defaultBundle: DataBundle | null = null
/** Make a bundle available to step()/validate()/legalActions()/query for states built from it. */
export function registerBundle(bundle: DataBundle): void { BUNDLES.set(bundle.version, bundle) }
function bundleFor(state: GameState): DataBundle {
  const hit = BUNDLES.get(state.dataVersion)
  if (hit) return hit
  defaultBundle ??= loadBundle()
  registerBundle(defaultBundle)
  if (defaultBundle.version === state.dataVersion) return defaultBundle
  throw new EngineInvariantError(`no data bundle registered for version ${state.dataVersion}`)
}

// ---------- reducer ----------
const rejectedResult = (state: GameState, action: Action | null, rejection: Rejection): StepResult => ({
  state, events: action ? [{ type: 'ActionRejected', action, rejection }] : [], pending: state.pending, rejection,
})

/** Normalise a flow result: the pending lives on the state; an ended game always shows gameOver. */
function finish(state: GameState, events: GameEvent[]): StepResult {
  let s = state
  if (s.phase === 'ended' && s.pending.kind !== 'gameOver') s = raiseGameOver(s).state
  return { state: s, events, pending: s.pending }
}

export function createGame(setup: GameSetup, seed: string, bundle: DataBundle): StepResult {
  registerBundle(bundle)
  const r = createInitialState(setup, seed, bundle)
  if ('rejection' in r) {
    // no state can be built: return a minimal ended shell so callers still get a StepResult
    const shell = { phase: 'ended', pending: { id: 'd:0', player: 'A', kind: 'gameOver', window: 'game.end', context: {}, canPass: false }, dataVersion: bundle.version, setup, seed, log: [] } as unknown as GameState
    return { state: shell, events: [], pending: shell.pending, rejection: r.rejection }
  }
  return finish(r.state, r.events)
}

function dispatch(state: GameState, b: DataBundle, a: Action): FlowResult {
  const pd = state.pending
  if (pd.kind === 'gameOver' || state.phase === 'ended') {
    if (a.type === 'ack' && a.decisionId === pd.id) return { state, events: [], pending: pd }
    return { rejection: { code: 'E_GAME_OVER', message: 'the game is over' } }
  }
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return { rejection: { code: 'E_BAD_PAYLOAD', message: 'not an action' } }
  if (a.decisionId !== pd.id) return { rejection: { code: 'E_WRONG_DECISION', message: `expected an answer to ${pd.id}` } }
  if (a.player !== pd.player) return { rejection: { code: 'E_NOT_YOUR_DECISION', message: `the decision belongs to player ${pd.player}` } }
  if (isSetupDecision(state)) return answerSetup(state, b, a)
  if (isControlDecision(state)) return answerControlDecision(state, b, a)
  if (isMaintenanceDecision(state)) return answerMaintenanceDecision(state, b, a)
  if (pd.kind === 'chooseActivation' && a.type === 'endTurn') return endTurn(state, b, a)
  const r = handleActivationAction(state, b, a)
  if (r) return r
  return { rejection: { code: 'E_WRONG_DECISION', message: `${a.type} does not answer a ${pd.kind} decision` } }
}

function guarded(state: GameState, action: Action): FlowResult {
  const b = bundleFor(state)
  try {
    return dispatch(state, b, action)
  } catch (e) {
    if (e instanceof EngineInvariantError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new EngineInvariantError(`${action?.type} on ${state.pending.kind} (${state.pending.id}): ${msg}`)
  }
}

export function step(state: GameState, action: Action): StepResult {
  const r = guarded(state, action)
  if ('rejection' in r) return rejectedResult(state, action, r.rejection)
  if (r.state === state) return { state, events: r.events, pending: state.pending } // gameOver ack: nothing changes
  return finish(housekeeping({ ...r.state, log: [...state.log, action] }), r.events)
}

export function validate(state: GameState, action: Action): Rejection | null {
  const r = guarded(state, action)
  return 'rejection' in r ? r.rejection : null
}

/** Candidates offered for the open decision, before validation. */
function candidates(state: GameState): Action[] {
  const pd = state.pending
  if (pd.kind === 'gameOver' || state.phase === 'ended') return [{ type: 'ack', decisionId: pd.id, player: pd.player }]
  if (isSetupDecision(state)) return setupLegalActions(state)
  if (isControlDecision(state)) return flowLegalActions(state)
  if (pd.kind === 'chooseActivation') return flowLegalActions(state)
  return activationLegalActions(state)
}

/** Answers to state.pending that pass full validation (00 §5). Never empty while a decision is open. */
export function legalActions(state: GameState): Action[] {
  const all = candidates(state)
  if (state.pending.kind === 'gameOver') return all
  const ok = all.filter((a) => validate(state, a) === null)
  return ok
}

export function replay(setup: GameSetup, seed: string, bundle: DataBundle, actions: readonly Action[]): StepResult {
  let cur = createGame(setup, seed, bundle)
  if (cur.rejection) return cur
  const events: GameEvent[] = [...cur.events]
  for (const a of actions) {
    const r = step(cur.state, a)
    if (r.rejection) return { ...r, events: [...events, ...r.events] }
    events.push(...r.events)
    cur = r
  }
  return { ...cur, events }
}

export function save(state: GameState, label = ''): SaveFile {
  return {
    format: 1, engine: ENGINE_VERSION, dataVersion: state.dataVersion, setup: state.setup, seed: state.seed,
    actions: [...state.log], meta: { savedAt: new Date().toISOString(), label },
  }
}

export function load(file: SaveFile, bundle: DataBundle): StepResult {
  if (file.format !== 1) {
    const base = createGame(file.setup, file.seed, bundle)
    return { ...base, rejection: { code: 'E_BAD_PAYLOAD', message: `unknown save format ${String(file.format)}` } }
  }
  if (file.dataVersion !== bundle.version) {
    const base = createGame(file.setup, file.seed, bundle)
    return { ...base, rejection: { code: 'E_DATA_VERSION', message: `save uses data ${file.dataVersion}, this build has ${bundle.version}` } }
  }
  return replay(file.setup, file.seed, bundle, file.actions)
}

export function view(state: GameState, player: PlayerId): PlayerView { return { player, state } }

// ---------- query.* result shapes (00 §8) ----------
export interface LosResult {
  visible: boolean
  reasons: LosReason[]
  blockers: Id[]
  mods: { concealment: boolean; cover: boolean; elevation: boolean; inMelee: boolean; stealth: boolean }
}
/**
 * attackType: the weapon's Attack Type (shot mode) chosen at declaration, as in ChooseAttackAction.attackType (00 §14).
 * chargeAttack: omitted = inferred from the activation (the charger's first melee attack at its charge target after a 3"+ charge).
 */
export interface AttackPreviewOpts { additional?: boolean; boostAttack?: boolean; boostDamage?: boolean; chargeAttack?: boolean; fromPos?: Vec2; spellId?: Id; attackType?: string }
export interface AttackPreview {
  legal: Rejection | null
  hitTarget: number
  dice: number
  mods: Mod[]
  pHit: number
  pHitBoosted: number
  pCrit: number
  damageTarget: number
  damageDice: number
  expectedDamage: number
  pKill: number
  autoHit: boolean
  autoMiss: boolean
}
// needsForce (M9): a beast's run/charge/slam ranges assume it can be forced (query.fury(...).forceable)
export interface ThreatRanges { advance: number; run: number; charge: number; slam: number | null; ranged: number | null; meleeRange: number; needsForce?: boolean }

// ---------- M9 fury query shapes (81 D.2); bodies land with E7 ----------
export type FuryBlock = 'wild' | 'frenzied' | 'spirit' | 'outOfCtrl' | 'cap' | 'noController'
export interface FuryInfo {
  kind: 'warlock' | 'beast' | null
  fury: number
  cap: number
  capStat: 'ARC' | 'FURY'
  controllerId?: ModelId
  inCtrl?: boolean
  forceable: boolean
  block?: FuryBlock
  room: number
}
export interface BattlegroupInfo { ctrl: number; leechRoom: number; spiritBond: number; beasts: (FuryInfo & { modelId: ModelId; pFrenzyNow: number })[] }
export interface ThresholdInfo { thr: number; fury: number; need: number; pFrenzy: number; construct: boolean }
export interface SpiralView {
  branches: { branch: number; boxes: { aspect: Aspect | null; filled: boolean }[] }[]
  unmarked: number
  aspects: Record<Aspect, { total: number; filled: number; crippled: boolean }>
}
export interface TransferPreviewRow {
  beastId: ModelId
  eligible: boolean
  reason?: string
  unmarked: number
  fury: number
  cap: number
  absorbed: number
  overflow: number
  pDisabled: number
  pCripple: Record<Aspect, number>
}
export interface FrenzyTargetInfo { tiedIds: ModelId[]; distance: number; friendly: boolean; canCharge: boolean; reason?: 'noTarget' | 'cannotCharge' | 'cannotActivate' }
export interface LeechPlan { from: Record<ModelId, number>; self: number }
export interface LeechPreview { gained: number; selfDamage: number; after: number; pFrenzyAfter: Record<ModelId, number> }
export interface ControlReport {
  elements: Record<Id, ElementControl>
  vpNow: Record<PlayerId, number>
  killBox: Record<PlayerId, boolean>
}
export interface StatTrace { stat: Stat; value: number; base: number; steps: { source: string; mode: 'set' | 'double' | 'half' | 'add'; value: number; after: number }[] }
export interface MoveCheck { ok: boolean; stopAt: Vec2 | null; reason: 'ok' | 'collision' | 'rough' | 'obstacle' | 'obstruction' | 'tooFar' | 'edge' | 'notStraight' | null; distance: number; cost: number }

const sumMods = (mods: readonly Mod[]): number => mods.reduce((a, m) => a + (m.mode === 'set' ? 0 : m.value), 0)
const remainingBoxes = (s: GameState, id: ModelId): number => {
  const d = s.models[id]?.damage
  if (!d) return 1
  if (d.track === 'single') return Math.max(1, d.boxes - d.filled)
  return Math.max(1, d.grids.reduce((a, g) => a + g.cols.reduce((c, col) => c + col.filter((x) => !x).length, 0), 0))
}
const emptyPreview = (legal: Rejection): AttackPreview => ({
  legal, hitTarget: 0, dice: 0, mods: [], pHit: 0, pHitBoosted: 0, pCrit: 0, damageTarget: 0, damageDice: 0, expectedDamage: 0, pKill: 0, autoHit: false, autoMiss: false,
})

export const query = {
  /** Edge-to-edge inches between two models, a model and a point, or two points. */
  distance(state: GameState, a: ModelId | Vec2, b: ModelId | Vec2): number {
    const ma = typeof a === 'string' ? state.models[a] : undefined
    const mb = typeof b === 'string' ? state.models[b] : undefined
    if (ma && mb) return modelDistance(ma, mb)
    if (ma && typeof b !== 'string') return modelToPoint(ma, b)
    if (mb && typeof a !== 'string') return modelToPoint(mb, a)
    if (typeof a !== 'string' && typeof b !== 'string') return dist(a, b)
    return NaN
  },

  /** LOS verdict with the reasons and the DEF-relevant flags the LOS view shows (R6). */
  los(state: GameState, viewerId: ModelId, targetId: ModelId): LosResult {
    const b = bundleFor(state)
    const rep = losReport(state, viewerId, targetId)
    const v = state.models[viewerId], t = state.models[targetId]
    let mods = { concealment: false, cover: false, elevation: false, inMelee: false, stealth: false }
    if (v && t && rep.visible) {
      const df = defModifiers(state, targetId, { kind: 'ranged', baseDef: statOf(state, b, targetId, 'DEF'), originId: viewerId })
      const stealth = abilitiesOf(state, b, targetId).includes('core.a.stealth') && modelDistance(v, t) > 5 + 1e-6
      mods = { concealment: df.concealment, cover: df.cover, elevation: df.elevation, inMelee: df.targetInMelee, stealth }
    }
    return { visible: rep.visible, reasons: rep.reasons, blockers: rep.blockers, mods }
  },

  /** Hit and damage numbers for one attack, computed by the same code the attack itself runs. */
  attackPreview(state0: GameState, attackerId: ModelId, weaponId: Id, targetId: ModelId, opts: AttackPreviewOpts = {}): AttackPreview {
    const b = bundleFor(state0)
    let state = state0
    if (opts.fromPos && state.models[attackerId]) state = { ...state, models: { ...state.models, [attackerId]: { ...state.models[attackerId]!, pos: opts.fromPos } } }
    let dec
    const weapon = !opts.spellId
    const chargeAttack = opts.chargeAttack ?? (weapon && !opts.additional && isChargeAttack(state, b, attackerId, weaponId, targetId))
    const star = weapon ? activeStar(state, attackerId) : undefined
    try {
      dec = declareAttack(state, b, {
        attackerId, targetId, weaponId: weapon ? weaponId : undefined, spellId: opts.spellId, additional: !!opts.additional,
        attackType: weapon ? opts.attackType : undefined, star, noFocus: false, chargeAttack, basic: !star,
      })
    } catch (e) {
      return emptyPreview({ code: 'E_TARGET_INVALID', message: e instanceof Error ? e.message : String(e) })
    }
    if ('rejection' in dec) return emptyPreview(dec.rejection)
    const atk = dec.state.attack as AttackContext
    const at = dec.state.models[attackerId]!
    const statName: Stat = atk.kind === 'melee' || atk.kind === 'power' ? 'MAT' : atk.kind === 'arcane' || atk.spellId ? 'AAT' : 'RAT'
    const statv = statOf(dec.state, b, attackerId, statName, { atk: { kind: atk.kind } })
    const bonus = statv + sumMods(atk.mods)
    const diceN = atk.dice + (opts.boostAttack ? 1 : 0)
    const roll = atk.autoMiss ? { pHit: 0, pCrit: 0 } : atk.autoHit ? { pHit: 1, pCrit: 0 } : (atk as { x?: { flags?: Record<string, unknown> } }).x?.flags?.dropLowestAtk ? pAttackHitDropLowest(diceN, bonus, atk.hitTarget) : pAttackHit(diceN, bonus, atk.hitTarget)
    // damage: the same damage.beforeRoll step the attack runs (additional dice, flat bonuses, Armor-Piercing, Resistance)
    const boostDmg = !!opts.boostDamage || chargeAttack
    const distOf = (d: DamagePreview, boost: boolean) => damageDistribution({
      pow: d.pow, armor: d.armor, dice: { added: d.added, removed: d.removed, boost: boost && !d.unboostable }, resist: d.resist, flat: d.flat, dropLowest: d.dropLowest,
    })
    const boxes = remainingBoxes(dec.state, targetId)
    const direct = previewDamage(dec.state, b, 'direct')
    const dd = distOf(direct, boostDmg)
    let exp = expDamage(dd) * roll.pHit
    let pk = pKillOf(dd, boxes) * roll.pHit
    if (atk.kind === 'aoe' && atk.losVerdict.inRange) {
      // R7.9: a miss with the target in range still hits it (not directly) with the blast POW
      const bl = distOf(previewDamage(dec.state, b, 'blast'), false)
      exp += expDamage(bl) * (1 - roll.pHit)
      pk += pKillOf(bl, boxes) * (1 - roll.pHit)
    }
    void at
    return {
      legal: null, hitTarget: atk.hitTarget, dice: diceN, mods: atk.mods, pHit: roll.pHit, pHitBoosted: atk.pHitBoosted, pCrit: roll.pCrit,
      damageTarget: direct.armor, damageDice: Math.max(0, 2 + direct.added - direct.removed - (direct.resist ? 1 : 0) + (boostDmg ? 1 : 0)),
      expectedDamage: exp, pKill: pk, autoHit: !!atk.autoHit, autoMiss: !!atk.autoMiss,
    }
  },

  /** Threat rings: advance SPD, run SPD+5, charge SPD+3+reach, slam (war-engines) SPD+3, ranged = SPD + longest ranged RNG. */
  threat(state: GameState, modelId: ModelId): ThreatRanges {
    const b = bundleFor(state)
    const m = state.models[modelId]
    if (!m) return { advance: 0, run: 0, charge: 0, slam: null, ranged: null, meleeRange: 0 }
    const spd = statOf(state, b, modelId, 'SPD')
    const reach = meleeReach(state, b, modelId)
    const ws = weaponsOf(b, m)
    const ranged = ws.filter((w) => !isMelee(w.w) && !m.crippled.includes(w.loc)).map((w) => weaponRange(w.w, rangeBonusOf(state, modelId)))
    const hasMelee = ws.some((w) => isMelee(w.w))
    // M9 D.2: a warbeast's run, charge and slam all cost a force, so they only show when the beast can be forced right now
    const fz = m.type === 'beast' && m.fury !== undefined ? furyInfo(state, b, modelId) : null
    const noForce = !!fz && !fz.forceable
    return {
      advance: spd, run: noForce ? spd : spd + 5 + runBonus(state, b, modelId), charge: noForce ? (hasMelee ? spd + reach : spd) : hasMelee ? spd + 3 + reach : spd + 3,
      slam: m.type === 'warEngine' ? spd + 3 : m.type === 'beast' && !noForce ? spd + 3 : null,
      ranged: ranged.length ? spd + Math.max(...ranged) : null,
      meleeRange: reach,
      ...(fz ? { needsForce: true } : {}),
    }
  },

  /** Scenario control right now (the client never computes control itself). */
  control(state: GameState): ControlReport {
    return controlReport(state, bundleFor(state))
  },

  /** A resolved stat with the effects that changed it. */
  stat(state: GameState, modelId: ModelId, stat: Stat): StatTrace {
    const b = bundleFor(state)
    const m = state.models[modelId]
    const base = m ? (((prof(b, m).stats ?? {}) as Record<string, number>)[stat] ?? 0) : 0
    const value = statOf(state, b, modelId, stat)
    const steps: StatTrace['steps'] = []
    let after = base
    for (const e of effectsOn(state, modelId)) {
      for (const x of e.mods.filter((y: StatMod) => y.stat === stat)) {
        after = x.mode === 'set' ? x.value : x.mode === 'double' ? after * 2 : x.mode === 'half' ? Math.ceil(after / 2) : after + x.value
        steps.push({ source: e.name, mode: x.mode, value: x.value, after })
      }
    }
    if (after !== value) steps.push({ source: 'abilities and conditions', mode: 'add', value: value - after, after: value })
    return { stat, value, base, steps }
  },

  /** Would this advance path be legal for the model right now? */
  moveCheck(state: GameState, modelId: ModelId, path: Vec2[]): MoveCheck {
    const b = bundleFor(state)
    const m = state.models[modelId]
    if (!m || !isOnTable(m) || !path.length) return { ok: false, stopAt: null, reason: null, distance: 0, cost: 0 }
    let d = 0
    let prev = m.pos
    for (const p of path) { d += dist(prev, p); prev = p }
    const info = moverInfo(state, b, modelId)
    const r = resolveAdvance(state, { modelId, waypoints: path, kind: 'advance', info })
    if (r.ok) return { ok: true, stopAt: r.state.models[modelId]!.pos, reason: 'ok', distance: d, cost: d }
    const reason: MoveCheck['reason'] = r.code === 'E_TOO_FAR' ? 'tooFar' : r.code === 'E_BASE_OVERLAP' ? 'collision' : r.code === 'E_NOT_STRAIGHT' ? 'notStraight'
      : r.code === 'E_OUT_OF_ZONE' ? 'edge' : /rough/i.test(r.message) ? 'rough' : /obstruction/i.test(r.message) ? 'obstruction' : 'obstacle'
    return { ok: false, stopAt: null, reason, distance: d, cost: d }
  },

  /** Power-attack collateral/slam POW: 12 when the attacker's base is not larger than the target's, else 14. */
  powerAttackPow(attackerBase: BaseMm, targetBase: BaseMm): number { return attackerBase <= targetBase ? 12 : 14 },

  // ---------- M9 fury queries (81 D.2): bodies in fury.ts, damage.ts and phases/frenzy.ts ----------
  /** Fury pool, cap and whether a beast can be forced right now. */
  fury(state: GameState, modelId: ModelId): FuryInfo { return furyInfo(state, bundleFor(state), modelId) },
  /** A warlock's battlegroup for the HUD fury bars. */
  battlegroup(state: GameState, warlockId: ModelId): BattlegroupInfo { return battlegroupInfo(state, bundleFor(state), warlockId) },
  /** Threshold odds: pFrenzy = P(2d6 > THR - fury - extraFury). */
  threshold(state: GameState, beastId: ModelId, extraFury = 0): ThresholdInfo { return thresholdInfo(state, bundleFor(state), beastId, extraFury) },
  /** The life spiral as the spiral view draws it. */
  spiral(state: GameState, modelId: ModelId): SpiralView { return spiralView(state, bundleFor(state), modelId) },
  /** One row per battlegroup beast: what a transfer of `points` would do. */
  transferPreview(state: GameState, warlockId: ModelId, points: number): TransferPreviewRow[] { return transferPreviewRows(state, bundleFor(state), warlockId, points) },
  /** Who a frenzying beast would charge (prediction for the AI and UI). */
  frenzyTarget(state: GameState, beastId: ModelId): FrenzyTargetInfo { return frenzyTargetInfo(state, bundleFor(state), beastId) },
  /** Result of a leech plan before it is answered. */
  leechPreview(state: GameState, warlockId: ModelId, plan: LeechPlan): LeechPreview { return leechPreviewInfo(state, bundleFor(state), warlockId, plan) },
}

// ---------- describe-numbers helpers (format engine numbers for prompts; no rules arithmetic) ----------
export interface DescribedLine { label: string; value: string; detail?: string }
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)
const nameOf = (state: GameState, id: Id | undefined): string => {
  if (!id) return '?'
  const m = state.models[id]
  if (!m) return id
  const p = (bundleFor(state).byId[m.profileId] ?? {}) as { name?: string }
  return p.name ?? id
}

/** Option cost in our words: focus, fury spent by a warlock, fury a beast gains when forced (M9). */
function costText(c: NonNullable<PendingDecision['options']>[number]['cost'] & object): string {
  const parts: string[] = []
  if (c.focus) parts.push(`${c.focus} focus`)
  if (c.fury) parts.push(`${c.fury} fury`)
  if (c.forced) parts.push(`force ${c.forced}`)
  return parts.length ? parts.join(', ') : '0 focus'
}

/** Decision kinds whose short title already names the target. */
const TITLE_NAMES_TARGET = new Set<PendingDecision['kind']>(['moveModel'])

/** A short title for each decision kind, in our own words (the client's fallback heading). */
function decisionTitle(state: GameState, pd: PendingDecision): string {
  const data = pd.context.data ?? {}
  const mode = data.mode as string | undefined
  const target = pd.context.targetId ? nameOf(state, pd.context.targetId) : ''
  switch (pd.kind) {
    case 'rollOff': return 'roll off for the first turn'
    case 'chooseTurnOrder': return 'go first or second'
    case 'chooseEdge': return 'pick your table edge'
    case 'deploy': return 'deploy your army'
    case 'advanceDeploy': return 'place your advance-deploying models'
    case 'maintenanceOrder': return 'order the start-of-turn effects'
    case 'allocateFocus': return 'hand out focus to the battlegroup'
    case 'payUpkeep': return 'keep or drop upkeep spells'
    case 'shake': return 'shake off conditions'
    case 'chooseActivation': return 'pick a model or unit to activate'
    case 'chooseMovement': return 'pick a Normal Movement option'
    case 'moveModel':
      if (data.code === 'avengingForce') return 'Avenging Force advance'
      if ((data.trigger as { ctx?: string } | undefined)?.ctx === 'ward') return 'answer the ward with an advance'
      if (data.trigger) return 'optional move'
      if (mode === 'slam') return `slam toward ${target || 'the target'}`
      if (mode === 'trample') return 'trample in a straight line'
      if (pd.constraints?.toward) return `charge toward ${target || 'the target'}`
      return 'move'
    case 'chargeTarget': return mode === 'slam' ? 'pick a slam target' : 'pick a charge target'
    case 'placeTroopers': return data.code === 'ambush' ? 'bring in the Ambush models' : 'place the rest of the unit'
    case 'chooseCombatAction': return 'pick a Combat Action'
    case 'chooseAttack': return data.code === 'avengingForce' ? 'Avenging Force attack' : data.code === 'sentry' ? 'Sentry: take the Rapid Fire shot' : 'pick an attack'
    case 'combinedAttack': return 'set up a combined attack'
    case 'channel': return 'cast directly or through a channeller'
    case 'castSpell': return 'cast a spell'
    case 'useFeat': return 'use the feat'
    case 'boostAttack': return 'boost the attack roll?'
    case 'rollAnyway': return 'roll for the automatic hit?'
    case 'reroll': return 'reroll the dice?'
    case 'boostDamage': return 'boost the damage roll?'
    case 'chooseGrid': return 'pick a damage grid'
    case 'powerField': return 'spend focus on Power Field?'
    case 'chooseBoxes': return 'pick the damage column'
    case 'triggerWindow': {
      const id = (data.triggerId as string | undefined) ?? ''
      const rec = id ? (bundleFor(state).byId[id] as { name?: string } | undefined) : undefined
      return rec?.name ? `use ${rec.name}?` : 'use the triggered ability?'
    }
    case 'abilityChoice':
      if (data.code === 'powerfulAttack') return 'use Powerful Attack?'
      if (data.code === 'prey') return 'pick the prey'
      if (data.code === 'startTrigger') return 'use an ability before moving?'
      if (data.code === 'declOpt') return 'use the shot ability?'
      return 'make a choice'
    case 'gameOver': return 'game over'
    case 'leech': return 'leech fury'
    case 'transferDamage': return 'transfer the damage?'
    case 'adjustFury': return 'remove fury from the warbeast'
    case 'reave': return 'pick who reaves the fury'
    default: return String(pd.kind)
  }
}

export const describe = {
  percent(p: number): string { return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%` },
  mods(mods: readonly Mod[]): DescribedLine[] {
    return mods.map((m) => ({ label: m.label, value: m.mode === 'set' ? `=${m.value}` : signed(m.value), detail: m.source }))
  },
  attack(ctx: AttackContext): DescribedLine[] {
    const lines: DescribedLine[] = [
      { label: 'Roll', value: `${ctx.dice}d6${ctx.boosted ? ' (boosted)' : ''}` },
      { label: 'Needs', value: `${ctx.hitTarget}`, detail: 'DEF after modifiers' },
      { label: 'Hit chance', value: describe.percent(ctx.pHit), detail: `boosted ${describe.percent(ctx.pHitBoosted)}` },
    ]
    if (ctx.autoHit) lines.push({ label: 'Auto-hit', value: 'yes' })
    if (ctx.autoMiss) lines.push({ label: 'Auto-miss', value: 'yes' })
    if (ctx.damageTarget !== undefined) lines.push({ label: 'ARM', value: `${ctx.damageTarget}` })
    lines.push({ label: 'POW', value: `${ctx.powDirect}${ctx.powBlast ? ` / blast ${ctx.powBlast}` : ''}` })
    return [...lines, ...describe.mods(ctx.mods)]
  },
  roll(ev: DiceRolled): DescribedLine {
    const vs = ev.target !== undefined ? ` vs ${ev.target}` : ''
    return { label: ev.purpose, value: `${ev.total}${vs}`, detail: `dice ${ev.dice.join(', ')}${ev.kept.length !== ev.dice.length ? ` (kept ${ev.kept.join(', ')})` : ''}` }
  },
  decision(state: GameState, pending: PendingDecision): { title: string; lines: DescribedLine[] } {
    const who = pending.context.modelId ? nameOf(state, pending.context.modelId) : `Player ${pending.player}`
    const lines: DescribedLine[] = (pending.options ?? []).map((o) => ({
      label: o.label,
      value: o.cost ? costText(o.cost) : '',
      detail: o.odds?.pHit !== undefined ? `hit ${describe.percent(o.odds.pHit)}` : o.odds?.expectedDamage !== undefined ? `avg ${o.odds.expectedDamage.toFixed(1)}` : undefined,
    }))
    if (state.attack && ['boostAttack', 'boostDamage', 'powerField', 'rollAnyway', 'reroll'].includes(pending.kind)) lines.push(...describe.attack(state.attack))
    const target = pending.context.targetId ? nameOf(state, pending.context.targetId) : ''
    return { title: `${who}: ${decisionTitle(state, pending)}${target && !TITLE_NAMES_TARGET.has(pending.kind) ? ` → ${target}` : ''}`, lines }
  },
  event(state: GameState, ev: GameEvent): string {
    const e = ev as GameEvent & Record<string, unknown>
    const n = (k: string): string => nameOf(state, e[k] as string | undefined)
    switch (ev.type) {
      case 'DiceRolled': return `${ev.purpose} roll: ${ev.dice.join(' ')} = ${ev.total}${ev.target !== undefined ? ` vs ${ev.target}` : ''}`
      case 'ModelMoved': return `${n('modelId')} ${ev.kind} ${ev.distance.toFixed(1)}"`
      case 'AttackDeclared': return `${n('attackerId')} attacks ${n('targetId')}`
      case 'DamageApplied': return `${n('targetId')} takes ${ev.points} damage`
      case 'TurnStarted': return `Round ${ev.round}, player ${ev.player}'s turn`
      case 'GameEnded': return ev.winner ? `Player ${ev.winner} wins (${ev.reason})` : `Draw (${ev.reason})`
      case 'FuryChanged': return `${n('modelId')} ${ev.delta >= 0 ? 'gains' : 'loses'} ${Math.abs(ev.delta)} fury (now ${ev.after})`
      case 'FuryLeeched': return `${n('warlockId')} leeches fury (now ${ev.after})`
      case 'FuryReaved': return `${n('reaverId')} reaves ${ev.points} fury from ${n('beastId')}`
      case 'BeastForced': return `${n('beastId')} is forced (${ev.purpose}), fury ${ev.after}`
      case 'ThresholdChecked': return `${n('beastId')} threshold check: ${ev.frenzied ? 'frenzy!' : 'holds'}`
      case 'Frenzied': return ev.targetId ? `Frenzy: ${n('beastId')} charges ${n('targetId')}` : `Frenzy: ${n('beastId')} has nothing to charge`
      case 'FrenzyEnded': return `${n('beastId')} calms down`
      case 'DamageTransferred': return `${n('warlockId')} moves ${ev.points} damage onto ${n('beastId')}`
      case 'AspectCrippled': return `${n('modelId')}: ${ev.aspect} crippled`
      case 'AspectRestored': return `${n('modelId')}: ${ev.aspect} restored`
      case 'BeastWild': return `${n('modelId')} runs wild`
      case 'BeastControlTaken': return `${n('warlockId')} takes control of ${n('modelId')}`
      case 'TokenGained': return `${n('modelId')} gains ${ev.count} ${ev.token} token${ev.count === 1 ? '' : 's'}`
      case 'TokenSpent': return `${n('modelId')} spends ${ev.count} ${ev.token} token${ev.count === 1 ? '' : 's'}`
      default: return ev.type
    }
  },
}



