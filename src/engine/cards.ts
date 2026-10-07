// M13 (91 A): command cards. Card data lives in src/data/core/cards.json (record kind 'card', card.schema.json). Every card rides on a
// window the engine already has (91 A.5): no new WindowId or DecisionKind. Card effects are code, keyed by `option.code`.
//
//  - Activation cards (Bite and Hold, Blessings, Careful Reconnaissance, Duck and Cover!, For the Motherland): their `playCard` options are
//    appended to the activation's AT decisions by phases/activation.ts (`activationCardOptions`); a played card re-raises the same decision.
//  - Put the Fires Out: phases/maintenance.ts calls `maintenanceCardPrompt` before the continuous effects roll; turnflow resumes after the answer.
//  - Position-gated grants (Sturdy, Dig In, Set Defense) are effects with `grants` + `whileNear`; code-hooks `abilitiesOf` switches them off
//    while the model fails the near-element test (card-effects.ts), and `endDigIns` removes Dig In when the model moves or is engaged.
import type { Action, PlayCardAction } from './actions'
import { actOf, alive, hasFlag, layoutsOf, meleeReach, type ActCtx } from './code-hooks'
import { healDamage } from './damage'
import { rollD3 } from './dice'
import { applyEffect, effectsOn, removeCondition, removeEffect, type EffectExtras } from './effects'
import type { GameEvent } from './events'
import { engagedWith } from './los'
import { canHoldFocus, focusCap, gainFocus } from './focus'
import { capOf, furyOf, gainFury, isBeast, isWarlock } from './fury'
import { CORPSE_CAP } from './factions/circle'
import { gainToken, isSoulTaker, SOUL_CAP, tokensOf } from './factions/cryx'
import type { CardsView, CardView } from './index'
import { raiseWith, reject, type FlowResult } from './pending'
import { reraise } from './phases/activation'
import { controlReport } from './scenario'
import { LEVEL_CAP } from './setup'
import { answerMaintenanceDecision } from './turnflow'
import type {
  CardHandState, CardPlay, DataBundle, DecisionOption, EffectInstance, GameSetup, GameState, Id, ModelId, ModelState, PlayerId, Rejection, StoredConditionId, UnitId,
} from './types'

/** When a card may be played (91 A.5): during the activation of one of your models, at its start, or at the start of your Maintenance Phase. */
export type CardTiming = 'activationAny' | 'activationStart' | 'maintenanceStart'
export type CardSubject = 'modelOrUnit' | 'model' | 'warriorModelOrUnit'
export interface CardOptionRecord { id: string; label: string; text: string; code: string }
/** A `card` data record (card.schema.json). `armies` empty = universal. */
export interface CardRecord {
  id: Id
  name: string
  text: string
  cost: number
  fa?: number
  armies: Id[]
  timing: CardTiming
  subject: CardSubject
  options: CardOptionRecord[]
}

/** Most cards a hand may hold (91 CC1); 7 is reserved for Grymkin, which is not a Whirr Machine faction. */
export const HAND_SIZE = 5
/** Most cards one player may play in a turn (CC4). */
export const PLAYS_PER_TURN = 2

type Rec = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const cardOf = (b: DataBundle, id: Id): CardRecord | undefined => {
  const r = b.byId[id] as unknown as (CardRecord & { recordType?: string }) | undefined
  return r && r.recordType === 'card' ? r : undefined
}
const handOf = (state: GameState, player: PlayerId): CardHandState | undefined => state.players[player]?.cards
const playsThisTurn = (state: GameState, player: PlayerId): CardPlay[] => (handOf(state, player)?.played ?? []).filter((p) => p.turn === state.turn)

// ---------------------------------------------------------------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------------------------------------------------------------
const listPoints = (b: DataBundle, list: Rec): number => {
  let n = 0
  for (const e of (list.entries ?? []) as { profile: string; size?: number }[]) {
    const p = (b.byId[e.profile] ?? {}) as Rec
    const bySize = p.composition?.costBySize as Record<string, number> | undefined
    n += (e.size !== undefined && bySize?.[String(e.size)]) || p.cost || 0
  }
  return n
}

/** `createGame` hand check (91 A.4): at most HAND_SIZE cards, no duplicates, each open to the list's army, card cost + list cost within the level. Failure code `E_BAD_SETUP`. */
export function validateCardHands(setup: GameSetup, b: DataBundle): Rejection | null {
  const bad = (message: string): Rejection => ({ code: 'E_BAD_SETUP', message })
  for (const p of ['A', 'B'] as PlayerId[]) {
    const hand = setup.cards?.[p]
    if (!hand || hand.length === 0) continue
    if (hand.length > HAND_SIZE) return bad(`player ${p}: a hand holds at most ${HAND_SIZE} command cards (${hand.length} given)`)
    if (new Set(hand).size !== hand.length) return bad(`player ${p}: a hand holds one copy of each command card`)
    const list = (b.byId[setup.lists[p]] ?? {}) as Rec
    let cost = 0
    for (const id of hand) {
      const c = cardOf(b, id)
      if (!c) return bad(`player ${p}: '${id}' is not a command card`)
      if (c.armies.length > 0 && !(typeof list.army === 'string' && c.armies.includes(list.army))) return bad(`player ${p}: ${c.name} is not open to this list's army`)
      cost += c.cost
    }
    const cap = list.level === undefined ? (list.points ?? 30) : LEVEL_CAP[list.level as string]
    if (cap !== undefined && cost + listPoints(b, list) > cap) return bad(`player ${p}: the command cards (${cost} points) push the list over ${cap} points`)
  }
  return null
}

/** The hand `createGame` stores in `PlayerState.cards`; undefined when the player took none. */
export function initialCards(setup: GameSetup, player: PlayerId): CardHandState | undefined {
  const hand = setup.cards?.[player]
  return hand && hand.length > 0 ? { hand: [...hand], played: [] } : undefined
}

// ---------------------------------------------------------------------------------------------------------------------------------
// limits (CC3 to CC5)
// ---------------------------------------------------------------------------------------------------------------------------------
/** The ids that count as "the same model or unit" for CC5: the id itself, and for a unit or a trooper the unit and all its models. */
function subjectKeys(state: GameState, id: Id): Set<Id> {
  const unit = state.units[id] ?? (state.models[id]?.unitId ? state.units[state.models[id]!.unitId!] : undefined)
  if (!unit) return new Set([id])
  return new Set([id, unit.id, ...unit.troopers, ...unit.attachments])
}

/** True when a card has been played on this model or its unit this turn (CC5), so no second card may use it. */
export function cardUsedOn(state: GameState, player: PlayerId, subject: ModelId | UnitId): boolean {
  const keys = subjectKeys(state, subject)
  return playsThisTurn(state, player).some((p) => p.targetIds.some((t) => keys.has(t)))
}

// ---------------------------------------------------------------------------------------------------------------------------------
// where a card can be played
// ---------------------------------------------------------------------------------------------------------------------------------
const ACTIVATION_CARD_KINDS = new Set(['chooseMovement', 'chooseCombatAction', 'chooseAttack', 'abilityChoice'])

/** True while the Maintenance card prompt (`abilityChoice`, `data.code = 'card'`) is open. */
export const isMaintenanceCardDecision = (state: GameState): boolean =>
  state.phase === 'maintenance' && state.pending.kind === 'abilityChoice' && state.pending.context.data?.code === 'card'

/** The first decision of an activation (91 A.5): nothing moved, attacked, cast or played yet. Blessings of the Gods is offered only here. */
function atActivationStart(a: ActCtx): boolean {
  if (a.frenzy) return false
  if (a.x.stage !== 'start' && a.x.stage !== 'movement') return false
  return a.movement === null && a.moved === 0 && !a.ran && !a.charge && !a.aimed && a.spellsCast.length === 0 && !a.featUsed && a.healed === 0
    && a.limitsUsed.length === 0 && !a.x.standUpUsed && a.movedModelId === null
}

interface Subject { id: Id; models: ModelId[] }
const isWarriorType = (m: ModelState): boolean => m.type === 'trooper' || m.type === 'solo' || m.type === 'unit'

function activationSubjects(state: GameState, card: CardRecord): Subject[] {
  const a = actOf(state)
  if (!a || a.frenzy || state.phase !== 'activation') return []
  const models = a.modelIds.filter((id) => alive(state.models[id]) && state.models[id]!.owner === state.activePlayer)
  if (models.length === 0) return []
  if (card.subject === 'warriorModelOrUnit' && !models.every((id) => isWarriorType(state.models[id]!))) return []
  if (card.subject === 'model') return models.map((id) => ({ id, models: [id] }))
  return [{ id: a.activeId, models }]
}

const onTable = (state: GameState, player: PlayerId): ModelState[] =>
  Object.values(state.models).filter((m) => m.owner === player && alive(m) && m.life === 'active').sort((x, y) => x.id.localeCompare(y.id))

// ---------------------------------------------------------------------------------------------------------------------------------
// card effects
// ---------------------------------------------------------------------------------------------------------------------------------
interface Tgt { subject: Subject; data?: PlayCardAction['data']; label?: string }
interface CodeImpl {
  /** Every (subject, extra choice) this option could be played on in the current window. */
  targets(state: GameState, b: DataBundle, card: CardRecord, subjects: Subject[], player: PlayerId): Tgt[]
  apply(state: GameState, b: DataBundle, player: PlayerId, subject: Subject, data: PlayCardAction['data']): { state: GameState; events: GameEvent[] }
}
const grantedBy = (state: GameState, b: DataBundle, id: ModelId, abilityId: Id): boolean => {
  void b
  return effectsOn(state, id).some((e) => ((e as EffectInstance & EffectExtras & { grants?: Id[] }).grants ?? []).includes(abilityId))
}
const profileHas = (b: DataBundle, m: ModelState, abilityId: Id): boolean => (((b.byId[m.profileId] ?? {}) as Rec).abilities as Id[] | undefined ?? []).includes(abilityId)
const hasFlagNow = (state: GameState, b: DataBundle, id: ModelId, flag: string): boolean => hasFlag(state, b, id, flag)

const each = (subjects: Subject[], ok: (s: Subject) => boolean): Tgt[] => subjects.filter(ok).map((subject) => ({ subject }))

/** An effect named after the card, on every model of the subject. `extra` carries the engine-internal parts (grants, whileNear...). */
function cardEffect(state: GameState, player: PlayerId, card: string, name: string, models: ModelId[], duration: 'round' | 'activation', extra: EffectExtras & { grants?: Id[]; magicalWeapons?: boolean }) {
  return applyEffect(state, { sourceId: card, name, owner: player, targetIds: models, mods: [], duration, ...extra } as Parameters<typeof applyEffect>[1])
}

const marked = (m: ModelState): number => (m.damage.track === 'single' ? m.damage.filled : m.damage.grids.reduce((n, g) => n + g.cols.reduce((c, col) => c + col.filter(Boolean).length, 0), 0))
const SHAKEABLE_CONDITIONS: StoredConditionId[] = ['knockedDown', 'stationary', 'shadowBind', 'blind']
const CONTINUOUS_CONDITIONS: StoredConditionId[] = ['fire', 'corrosion']
const endable = (e: EffectInstance): boolean => !!e.shakeable || e.duration === 'continuous' || !!e.conditions?.some((c) => SHAKEABLE_CONDITIONS.includes(c) || CONTINUOUS_CONDITIONS.includes(c))
const endableOn = (state: GameState, id: ModelId): boolean => {
  const m = state.models[id]
  return !!m && (m.conditions.some((c) => SHAKEABLE_CONDITIONS.includes(c) || CONTINUOUS_CONDITIONS.includes(c)) || effectsOn(state, id).some(endable))
}
const canHeal = (state: GameState, id: ModelId): boolean => {
  const m = state.models[id]
  return !!m && marked(m) > 0 && !effectsOn(state, id).some((e) => e.forbid?.includes('heal'))
}

/** Which resource points a Blessings B model could take now (focus, fury, soul, corpse). */
function gainsFor(state: GameState, b: DataBundle, m: ModelState): ('focus' | 'fury' | 'soul' | 'corpse')[] {
  const out: ('focus' | 'fury' | 'soul' | 'corpse')[] = []
  if ((m.type === 'leader' && m.fury === undefined) || m.type === 'warEngine') {
    if (canHoldFocus(state, m) && m.focus < focusCap(m)) out.push('focus') // RULING: a war-engine stops at 3, a caster has no cap
  }
  if ((isWarlock(m) || isBeast(m)) && furyOf(m) < capOf(state, b, m)) out.push('fury')
  if (isSoulTaker(state, b, m.id) && tokensOf(m, 'soul') < SOUL_CAP) out.push('soul')
  if (profileHas(b, m, 'cir.a.body-snatcher') && tokensOf(m, 'corpse') < CORPSE_CAP) out.push('corpse')
  return out
}

const CODES: Record<string, CodeImpl> = {
  // ---- Bite and Hold ----
  biteHoldSecure: {
    targets(state, b, _card, subjects, player) {
      const out: Tgt[] = []
      const sticky = state.scenario.elementState ?? {}
      const els = controlReport(state, b).elements
      for (const subject of subjects) {
        for (const [eid, c] of Object.entries(els)) {
          if (c.controller !== player || !c.holders.some((h) => subject.models.includes(h))) continue
          const s = sticky[eid]?.stickyHold
          if (s && s.player === player && s.turn === state.turn) continue
          out.push({ subject, data: { elementId: eid }, label: eid })
        }
      }
      return out
    },
    apply(state, _b, player, _subject, data) {
      const eid = data!.elementId!
      const es = state.scenario.elementState ?? {}
      return { state: { ...state, scenario: { ...state.scenario, elementState: { ...es, [eid]: { ...es[eid], stickyHold: { player, round: state.round, turn: state.turn } } } } }, events: [] }
    },
  },
  biteHoldSturdy: {
    targets: (_s, _b, _c, subjects) => each(subjects, () => true),
    apply(state, _b, player, subject) {
      const r = cardEffect(state, player, 'core.card.bite-and-hold', 'Bite and Hold: Sturdy', subject.models, 'round', { grants: ['core.a.sturdy'], whileNear: true })
      return { state: r.state, events: r.events }
    },
  },
  // ---- Blessings of the Gods ----
  blessWeapons: {
    targets: (_s, _b, _c, subjects) => each(subjects, () => true),
    apply(state, _b, player, subject) {
      const r = cardEffect(state, player, 'core.card.blessings-of-the-gods', 'Blessings of the Gods', subject.models, 'activation', { magicalWeapons: true, weaponGrants: ['blessed', 'magical'] })
      return { state: r.state, events: r.events }
    },
  },
  blessGain: {
    targets(state, b, _card, subjects) {
      const out: Tgt[] = []
      for (const subject of subjects) {
        const m = state.models[subject.id]
        if (!m) continue
        for (const gain of gainsFor(state, b, m)) out.push({ subject, data: { gain }, label: gain })
      }
      return out
    },
    apply(state, b, _player, subject, data) {
      const id = subject.id
      switch (data!.gain) {
        case 'focus': { const r = gainFocus(state, id, 1, 'gain'); return { state: r.state, events: r.events } }
        case 'fury': { const r = gainFury(state, b, id, 1, 'gain'); return { state: r.state, events: r.events } }
        default: { const r = gainToken(state, id, data!.gain as 'soul' | 'corpse', 1); return { state: r.state, events: r.events } }
      }
    },
  },
  // ---- Careful Reconnaissance ----
  reconPathfinder: {
    targets: (state, b, _c, subjects) => each(subjects, (s) => s.models.some((id) => !hasFlagNow(state, b, id, 'pathfinder'))),
    apply(state, _b, player, subject) {
      const r = cardEffect(state, player, 'core.card.careful-reconnaissance', 'Careful Reconnaissance: Pathfinder', subject.models, 'activation', { grants: ['core.a.pathfinder'] })
      return { state: r.state, events: r.events }
    },
  },
  reconReposition: {
    targets(state, b, _c, subjects) {
      const a = actOf(state)
      if (!a || a.ran || a.x.failedCharge) return []
      return each(subjects, (s) => s.models.some((id) => !grantedBy(state, b, id, 'core.a.reposition') && !profileHas(b, state.models[id]!, 'core.a.reposition')))
    },
    apply(state, _b, player, subject) {
      const r = cardEffect(state, player, 'core.card.careful-reconnaissance', 'Careful Reconnaissance: Reposition', subject.models, 'activation', { grants: ['core.a.reposition'] })
      return { state: r.state, events: r.events }
    },
  },
  // ---- Duck and Cover! ----
  duckDigIn: {
    targets: (state, b, _c, subjects) => each(subjects, (s) => s.models.every((id) => !isEngaged(state, b, id)) && s.models.some((id) => !grantedBy(state, b, id, 'core.a.dig-in'))),
    apply(state, _b, player, subject) {
      const anchors = Object.fromEntries(subject.models.map((id) => [id, { ...state.models[id]!.pos }]))
      const r = cardEffect(state, player, 'core.card.duck-and-cover', 'Dig In', subject.models, 'round', { grants: ['core.a.dig-in'], whileNear: true, endsOn: ['move', 'engaged'], anchors })
      return { state: r.state, events: r.events }
    },
  },
  duckSetDefense: {
    targets: (_s, _b, _c, subjects) => each(subjects, () => true),
    apply(state, _b, player, subject) {
      const r = cardEffect(state, player, 'core.card.duck-and-cover', 'Set Defense', subject.models, 'round', { grants: ['core.a.set-defense'], whileNear: true })
      return { state: r.state, events: r.events }
    },
  },
  // ---- Put the Fires Out ----
  firesOutEnd: {
    targets: (state, _b, _c, subjects) => each(subjects, (s) => s.models.some((id) => endableOn(state, id))),
    apply(state, _b, _player, subject) {
      let s = state
      const events: GameEvent[] = []
      for (const id of subject.models) {
        const m = s.models[id]
        if (!m) continue
        for (const c of m.conditions) {
          if (!SHAKEABLE_CONDITIONS.includes(c) && !CONTINUOUS_CONDITIONS.includes(c)) continue
          const r = removeCondition(s, id, c, 'effect'); s = r.state; events.push(...r.events)
        }
        for (const e of effectsOn(s, id).filter(endable)) {
          if (e.targetIds.length <= 1) { const r = removeEffect(s, e.id, 'shaken'); s = r.state; events.push(...r.events) } else s = { ...s, effects: s.effects.map((x) => (x.id === e.id ? { ...x, targetIds: x.targetIds.filter((t) => t !== id) } : x)) }
        }
      }
      return { state: s, events }
    },
  },
  firesOutHeal: {
    targets: (state, _b, _c, subjects) => each(subjects, (s) => canHeal(state, s.id)),
    apply(state, b, _player, subject) {
      const d = rollD3(state, 'd3')
      const m = d.state.models[subject.id]!
      const h = healDamage(d.state, subject.id, d.value + 1, layoutsOf(b, m))
      return { state: h.state, events: [d.event, ...h.events] }
    },
  },
  // ---- For the Motherland ----
  motherlandTough: {
    targets: (state, b, _c, subjects) => each(subjects, (s) => s.models.some((id) => !hasFlagNow(state, b, id, 'tough'))),
    apply(state, _b, player, subject) {
      const r = cardEffect(state, player, 'kha.card.for-the-motherland', 'For the Motherland', subject.models, 'round', { grants: ['core.a.tough'] })
      return { state: r.state, events: r.events }
    },
  },
}

/** The option codes cards.ts implements (tools/validate-data.ts checks every card record against them). */
export const CARD_CODES: ReadonlySet<string> = new Set(Object.keys(CODES))

function isEngaged(state: GameState, b: DataBundle, id: ModelId): boolean {
  return engagedWith(state, id, { reach: (m) => meleeReach(state, b, m.id) }).length > 0
}

// ---------------------------------------------------------------------------------------------------------------------------------
// subjects and options
// ---------------------------------------------------------------------------------------------------------------------------------
function maintenanceSubjects(state: GameState, code: string, player: PlayerId): Subject[] {
  const models = onTable(state, player)
  if (code === 'firesOutHeal') return models.map((m) => ({ id: m.id, models: [m.id] }))
  const out: Subject[] = []
  for (const u of Object.values(state.units).filter((x) => x.owner === player).sort((x, y) => x.id.localeCompare(y.id))) {
    const ids = [...u.troopers, ...u.attachments].filter((id) => alive(state.models[id]) && state.models[id]!.life === 'active')
    if (ids.length) out.push({ id: u.id, models: ids })
  }
  for (const m of models) if (!m.unitId) out.push({ id: m.id, models: [m.id] })
  return out
}

/** Which cards the player may still play this turn (in hand, unspent, plays left). */
function playableCards(state: GameState, b: DataBundle, player: PlayerId, timing: CardTiming[]): CardRecord[] {
  const h = handOf(state, player)
  if (!h || playsThisTurn(state, player).length >= PLAYS_PER_TURN) return []
  return h.hand.filter((id) => !h.played.some((p) => p.cardId === id)).map((id) => cardOf(b, id)).filter((c): c is CardRecord => !!c && timing.includes(c.timing))
}

interface Offer { card: CardRecord; opt: CardOptionRecord; tgt: Tgt }
function offersFor(state: GameState, b: DataBundle, player: PlayerId, timings: CardTiming[]): Offer[] {
  const out: Offer[] = []
  for (const card of playableCards(state, b, player, timings)) {
    const maint = card.timing === 'maintenanceStart'
    for (const opt of card.options) {
      const impl = CODES[opt.code]
      if (!impl) continue
      const subjects = (maint ? maintenanceSubjects(state, opt.code, player) : activationSubjects(state, card)).filter((s) => !cardUsedOn(state, player, s.id))
      if (!subjects.length) continue
      for (const tgt of impl.targets(state, b, card, subjects, player)) out.push({ card, opt, tgt })
    }
  }
  return out
}

const dataKey = (d: PlayCardAction['data']): string => (d ? [d.elementId, d.gain, d.trooperId].filter(Boolean).join('+') : '')
function toOption(did: string, player: PlayerId, o: Offer): DecisionOption {
  const { card, opt, tgt } = o
  const action: PlayCardAction = { type: 'playCard', decisionId: did, player, cardId: card.id, option: opt.id, targetId: tgt.subject.id, ...(tgt.data ? { data: tgt.data } : {}) }
  const k = dataKey(tgt.data)
  return { id: `card:${card.id}:${opt.id}:${tgt.subject.id}${k ? ':' + k : ''}`, label: `${card.name}: ${opt.label}${tgt.label ? ` (${tgt.label})` : ''} on ${tgt.subject.id}`, action: action as Action }
}

/**
 * `playCard` options to append to an activation decision (`chooseMovement`, `chooseCombatAction`, `chooseAttack`, or the first
 * decision of an activation for `activationStart` cards) for the active player: one per (card, option, subject, extra choice).
 * Empty when the player has no cards, no plays left, or nothing is playable here. Never called inside an attack, a spell,
 * a trigger window or a placement.
 */
export function cardPlayOptions(state: GameState, b: DataBundle, timing: 'activationAny' | 'activationStart'): DecisionOption[] {
  const player = state.activePlayer
  if (!handOf(state, player)) return []
  const a = actOf(state)
  if (!a || state.phase !== 'activation') return []
  if (timing === 'activationStart' && !atActivationStart(a)) return []
  const did = `d:${state.decisionSeq + 1}`
  return offersFor(state, b, player, [timing]).map((o) => toOption(did, player, o))
}

/** Both timings an activation decision offers (activationAny always, activationStart on the first decision). Called by phases/activation.ts. */
export function activationCardOptions(state: GameState, b: DataBundle): DecisionOption[] {
  if (!handOf(state, state.activePlayer)) return []
  return [...cardPlayOptions(state, b, 'activationAny'), ...cardPlayOptions(state, b, 'activationStart')]
}

// ---------------------------------------------------------------------------------------------------------------------------------
// playing a card
// ---------------------------------------------------------------------------------------------------------------------------------
const sameCard = (x: Action, a: PlayCardAction): boolean =>
  x.type === 'playCard' && x.cardId === a.cardId && x.option === a.option && x.targetId === a.targetId
  && (x.data?.elementId ?? null) === (a.data?.elementId ?? null) && (x.data?.gain ?? null) === (a.data?.gain ?? null)

/** Validate and apply a `playCard` action at the open decision (the decision must list it; `E_NOT_AN_OPTION` otherwise). Emits `CardPlayed` then the effect's own events. */
export function handlePlayCard(state: GameState, b: DataBundle, a0: PlayCardAction): FlowResult {
  if (isMaintenanceCardDecision(state)) return answerMaintenanceDecision(state, b, a0)
  const r = playCardNow(state, b, a0)
  if ('rejection' in r) return r
  return reraise(r.state, b, r.events)
}

/** The checks and the effect of a play, without raising the next decision. */
function playCardNow(state: GameState, b: DataBundle, a0: PlayCardAction): { state: GameState; events: GameEvent[] } | { rejection: Rejection } {
  const player = a0.player
  const hand = handOf(state, player)
  const card = cardOf(b, a0.cardId)
  if (!hand || !card || !hand.hand.includes(card.id)) return reject('E_NOT_AN_OPTION', 'you do not hold that card')
  const opt = card.options.find((o) => o.id === a0.option)
  const impl = opt ? CODES[opt.code] : undefined
  if (!opt || !impl) return reject('E_NOT_AN_OPTION', `${card.name} has no option '${a0.option}'`)
  if (hand.played.some((p) => p.cardId === card.id)) return reject('E_ALREADY_USED', `${card.name} has been played already`)
  if (playsThisTurn(state, player).length >= PLAYS_PER_TURN) return reject('E_ALREADY_USED', `at most ${PLAYS_PER_TURN} command cards per turn`)
  const maint = card.timing === 'maintenanceStart'
  if (maint ? !isMaintenanceCardDecision(state) : !(state.phase === 'activation' && ACTIVATION_CARD_KINDS.has(state.pending.kind) && !!actOf(state))) return reject('E_NOT_AN_OPTION', `${card.name} cannot be played now`)
  if (player !== state.activePlayer) return reject('E_NOT_AN_OPTION', 'cards are played in your own turn')
  // subject: a trooper id with a unit target in `data.trooperId` is the same as naming the trooper
  const a: PlayCardAction = card.subject === 'model' && a0.data?.trooperId && state.units[a0.targetId] ? { ...a0, targetId: a0.data.trooperId } : a0
  const subjects = maint ? maintenanceSubjects(state, opt.code, player) : activationSubjects(state, card)
  const subject = subjects.find((s) => s.id === a.targetId)
  if (!subject) return reject('E_TARGET_INVALID', `${card.name} cannot be played on ${a.targetId}`)
  if (cardUsedOn(state, player, subject.id)) return reject('E_ALREADY_USED', `a card has already been played on ${subject.id} this turn`)
  const listed = (state.pending.options ?? []).some((o) => sameCard(o.action, a))
  if (!listed) return reject('E_NOT_AN_OPTION', `${card.name} (${opt.label}) is not on offer now`)
  const ap = impl.apply(state, b, player, subject, a.data)
  const play: CardPlay = { cardId: card.id, option: opt.id, targetIds: [subject.id], round: state.round, turn: state.turn }
  const s = { ...ap.state, players: { ...ap.state.players, [player]: { ...ap.state.players[player], cards: { ...hand, played: [...hand.played, play] } } } }
  return { state: s, events: [{ type: 'CardPlayed', player, cardId: card.id, option: opt.id, targetIds: [subject.id] }, ...ap.events] }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Maintenance prompt (Put the Fires Out)
// ---------------------------------------------------------------------------------------------------------------------------------
/**
 * Start of the Maintenance Phase (91 A.5): raise the `abilityChoice` `context.data.code = 'card'` prompt for the active player when they hold
 * Put the Fires Out, have plays left and at least one model would gain something; null when nothing is offered. Called by phases/maintenance.ts
 * before continuous effects roll; the answer comes back through `answerMaintenanceCard`.
 */
export function maintenanceCardPrompt(state: GameState, b: DataBundle): FlowResult | null {
  const player = state.activePlayer
  if (!handOf(state, player)) return null
  const offers = offersFor(state, b, player, ['maintenanceStart'])
  if (!offers.length) return null
  const r = raiseWith(state, { player, kind: 'abilityChoice', window: 'maintenance.start', canPass: true, context: { data: { code: 'card' } } }, (id) => offers.map((o) => toOption(id, player, o)))
  return { state: r.state, events: [], pending: r.pending }
}

/** The answer to the Maintenance card prompt: an `abilityChoice` (option id `<option>:<subject>`, or `pass`), a `pass` or a `playCard`; returns the state to carry on from (the pending decision is stale: the caller continues the phase). */
export function answerMaintenanceCard(state: GameState, b: DataBundle, a: PlayCardAction | { type: 'abilityChoice'; optionId: string } | { type: 'pass' }): FlowResult {
  const keep = (s: GameState, events: GameEvent[]): FlowResult => ({ state: s, events, pending: s.pending })
  if (a.type === 'pass' || (a.type === 'abilityChoice' && a.optionId === 'pass')) return keep(state, [])
  let play: PlayCardAction | null = null
  if (a.type === 'playCard') play = a
  else if (a.type === 'abilityChoice') {
    const hit = (state.pending.options ?? []).find((o) => o.action.type === 'playCard' && (o.id === a.optionId || `${o.action.option}:${o.action.targetId}` === a.optionId))
    if (hit) play = hit.action as PlayCardAction
  }
  if (!play) return reject('E_NOT_AN_OPTION', 'choose one of the offered card plays, or pass')
  const r = playCardNow(state, b, { ...play, decisionId: state.pending.id, player: state.pending.player })
  if ('rejection' in r) return r
  return keep(r.state, r.events)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Dig In upkeep
// ---------------------------------------------------------------------------------------------------------------------------------
/** Dig In (Duck and Cover!) ends for a model that moved, was pushed or placed off its spot, or is engaged. Called after every activation action. */
export function endDigIns(state: GameState, b: DataBundle): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  for (const e of state.effects) {
    const x = e as EffectInstance & EffectExtras
    if (!x.endsOn || !x.anchors) continue
    const gone = e.targetIds.filter((id) => {
      const m = s.models[id]
      if (!m || !alive(m)) return true
      const at = x.anchors![id]
      if (x.endsOn!.includes('move') && at && (Math.abs(at.x - m.pos.x) > 1e-6 || Math.abs(at.z - m.pos.z) > 1e-6)) return true
      return x.endsOn!.includes('engaged') && isEngaged(s, b, id)
    })
    if (!gone.length) continue
    const rest = e.targetIds.filter((id) => !gone.includes(id))
    if (!rest.length) { const r = removeEffect(s, e.id, 'other'); s = r.state; events.push(...r.events) } else {
      s = { ...s, effects: s.effects.map((y) => (y.id === e.id ? ({ ...y, targetIds: rest } as EffectInstance) : y)) }
    }
  }
  return { state: s, events }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// query.cards
// ---------------------------------------------------------------------------------------------------------------------------------
/** `query.cards`: both hands are open information (CC6), so any player may be asked about. */
export function cardsView(state: GameState, b: DataBundle, player: PlayerId): CardsView {
  const h = handOf(state, player)
  const pd = state.pending
  const offered = pd.player === player ? (pd.options ?? []).map((o) => o.action).filter((x): x is PlayCardAction => x.type === 'playCard') : []
  const hand: CardView[] = (h?.hand ?? []).flatMap((id) => {
    const c = cardOf(b, id)
    if (!c) return []
    const options = c.options.map((o) => ({ id: o.id, label: o.label, targets: [...new Set(offered.filter((x) => x.cardId === id && x.option === o.id).map((x) => x.targetId))] }))
    return [{ cardId: id, name: c.name, text: c.text, cost: c.cost, played: !!h!.played.some((p) => p.cardId === id), playableNow: options.some((o) => o.targets.length > 0), options }]
  })
  const used = playsThisTurn(state, player)
  return { hand, playsLeft: Math.max(0, PLAYS_PER_TURN - used.length), usedOn: [...new Set(used.flatMap((p) => p.targetIds))] }
}
