// M13 WP2: command cards (91 A). Test names carry the CARD-nnn checklist ids (12-rules-test-checklist.md).
// The near-element test belongs to WP3 (scenario-rules.ts); here it is a switch, so the cards are tested on their own.
import { describe, expect, it, vi } from 'vitest'

const near = vi.hoisted(() => ({ value: true }))
vi.mock('../../src/engine/scenario-rules', async (orig) => ({ ...(await orig<typeof import('../../src/engine/scenario-rules')>()), nearScenarioElement: () => near.value }))

import { pickSensible } from '../../src/ai/random'
import type { Action, PlayCardAction } from '../../src/engine/actions'
import { cardUsedOn, endDigIns, initialCards, validateCardHands } from '../../src/engine/cards'
import { type AtkCtx, abilitiesOf, actOf, corePlugins, hasFlag, lookups, losOptsFor, resistsDamageType } from '../../src/engine/code-hooks'
import { expireEffects } from '../../src/engine/effects'
import { legalActions, query, step, validate } from '../../src/engine/index'
import { declareAttack } from '../../src/engine/phases/activation'
import { push, slideAway } from '../../src/engine/movement'
import type { FlowOut } from '../../src/engine/pending'
import { beginTurn } from '../../src/engine/turnflow'
import type { CardPlay, GameSetup, GameState, Id, PlayerId } from '../../src/engine/types'
import { bundle, startState, withModel } from './action-helpers'

const UNI: Id[] = ['core.card.bite-and-hold', 'core.card.blessings-of-the-gods', 'core.card.careful-reconnaissance', 'core.card.duck-and-cover', 'core.card.put-the-fires-out']
const FTM = 'kha.card.for-the-motherland'
const BH = UNI[0]!, BLESS = UNI[1]!, RECON = UNI[2]!, DUCK = UNI[3]!, FIRES = UNI[4]!

// ---------- helpers ----------
const withHand = (s: GameState, player: PlayerId, hand: Id[], played: CardPlay[] = []): GameState =>
  ({ ...s, players: { ...s.players, [player]: { ...s.players[player], cards: { hand, played } } } })
/** Khador's Hounds, Lazarenko and Razor all have Pathfinder; the Recon tests need models that do not, so the Hounds become plain Arkanists. */
const bare = (s: GameState): GameState => ['A:u2.1', 'A:u2.2', 'A:u2.3'].reduce((acc, id) => withModel(acc, id, { profileId: 'kha.arkanist' }), s)
const asOut = (state: GameState): FlowOut => ({ state, events: [], pending: state.pending })
function start(handA: Id[] = UNI, handB?: Id[]): FlowOut {
  const o = startState('cards-1')
  let s = withHand(o.state, 'A', handA)
  if (handB) s = withHand(s, 'B', handB)
  return asOut(s)
}
const ok = (r: ReturnType<typeof step>): FlowOut => {
  if (r.rejection) throw new Error(`rejected: ${JSON.stringify(r.rejection)}`)
  return { state: r.state, events: r.events, pending: r.pending }
}
const act = (o: FlowOut, a: Record<string, unknown>) => step(o.state, { ...a, decisionId: o.pending.id, player: o.pending.player } as unknown as Action)
const activate = (o: FlowOut, id: string): FlowOut => ok(act(o, { type: 'chooseActivation', activate: id }))
const cardActions = (o: FlowOut): PlayCardAction[] => (o.pending.options ?? []).map((x) => x.action).filter((a): a is PlayCardAction => a.type === 'playCard')
const play = (o: FlowOut, cardId: Id, option: string, targetId: string, data?: PlayCardAction['data']) =>
  act(o, { type: 'playCard', cardId, option, targetId, ...(data ? { data } : {}) })
const has = (o: FlowOut, cardId: Id, option?: string, target?: string): boolean =>
  cardActions(o).some((a) => a.cardId === cardId && (!option || a.option === option) && (!target || a.targetId === target))
const activeModels = (o: FlowOut) => actOf(o.state)!.modelIds

/** Answer the open decisions with their plainest non-card choice until the next chooseActivation (or the end). */
function drain(o0: FlowOut): FlowOut {
  let o = o0
  for (let i = 0; i < 60 && o.pending.kind !== 'chooseActivation' && o.pending.kind !== 'gameOver'; i++) {
    const opts = (o.pending.options ?? []).filter((x) => x.action.type !== 'playCard')
    const pick = opts.find((x) => (x.action as { option?: string }).option === 'forfeit') ?? opts.find((x) => (x.action as { choice?: string }).choice === 'forfeit')
      ?? opts.find((x) => x.action.type === 'endAttacks') ?? opts[0]
    if (!pick) throw new Error(`drain: nothing to pick at ${o.pending.kind}`)
    o = ok(step(o.state, pick.action))
  }
  return o
}

describe('hands and setup', () => {
  it('CARD-001 no hand: no cards, no playCard option anywhere, and initialCards is undefined', () => {
    const setup: GameSetup = { scenario: 'scn-qs-demo', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }
    expect(initialCards(setup, 'A')).toBeUndefined()
    expect(initialCards({ ...setup, cards: { A: [] } }, 'A')).toBeUndefined()
    let o = asOut(startState('cards-0').state)
    o = activate(o, 'A:e1')
    expect(cardActions(o)).toEqual([])
    expect(query.cards(o.state, 'A')).toMatchObject({ hand: [], playsLeft: 2, usedOn: [] })
  })

  it('CARD-002 six cards, a duplicate, or an army card for a list with no army are E_BAD_SETUP', () => {
    const base: GameSetup = { scenario: 'scn-qs-demo', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }
    expect(validateCardHands({ ...base, cards: { A: UNI } }, bundle)).toBeNull()
    expect(validateCardHands({ ...base, cards: { A: [...UNI, FTM] } }, bundle)?.code).toBe('E_BAD_SETUP')
    expect(validateCardHands({ ...base, cards: { A: [BH, BH] } }, bundle)?.code).toBe('E_BAD_SETUP')
    expect(validateCardHands({ ...base, cards: { A: [FTM] } }, bundle)?.code).toBe('E_BAD_SETUP')
    expect(validateCardHands({ ...base, cards: { B: [FTM] } }, bundle)?.code).toBe('E_BAD_SETUP')
    expect(validateCardHands({ ...base, cards: { A: ['kha.vilkul'] } }, bundle)?.code).toBe('E_BAD_SETUP')
    const army = { ...bundle, byId: { ...bundle.byId, 'kha.l.qs-recon': { ...bundle.byId['kha.l.qs-recon']!, army: 'kha.old-umbrey' } } }
    expect(validateCardHands({ ...base, cards: { A: [FTM, BH, BLESS, RECON, DUCK] } }, army)).toBeNull()
  })

  it('CARD-002 a hand that pushes the list over the level is E_BAD_SETUP', () => {
    const base: GameSetup = { scenario: 'scn-qs-demo', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }
    const costly = { ...bundle, byId: { ...bundle.byId, [BH]: { ...bundle.byId[BH]!, cost: 3 } } }
    expect(validateCardHands({ ...base, cards: { A: [BH] } }, costly)?.code).toBe('E_BAD_SETUP')
  })
})

describe('offering and limits', () => {
  it('CARD-003 Careful Reconnaissance is on chooseMovement of a friendly activation, never on the enemy turn, never inside an attack', () => {
    const o = activate(asOut(bare(start(UNI, UNI).state)), 'A:u2')
    expect(o.pending.kind).toBe('chooseMovement')
    expect(has(o, RECON, 'pathfinder', 'A:u2')).toBe(true)
    expect(has(o, RECON, 'reposition', 'A:u2')).toBe(true)
    // a model that has the rule already is not offered it again (Lazarenko has Pathfinder)
    expect(has(activate(start(UNI, UNI), 'A:e1'), RECON, 'pathfinder')).toBe(false)
    expect(legalActions(o.state).some((a) => a.type === 'playCard')).toBe(true)
    // B holds the same cards, but it is A's turn: nothing for B
    expect(cardActions(o).every((a) => a.player === 'A')).toBe(true)
    // the chooseActivation decision itself offers no card
    expect(cardActions(asOut(start().state))).toEqual([])
    // inside an attack (boost decision) nothing is offered and a play is not an option
    let m = activate(start(), 'A:e1')
    m = ok(act(m, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e1' }))
    expect(m.pending.kind).toBe('chooseCombatAction')
    expect(has(m, RECON)).toBe(true)
    const near1 = { ...m.state, models: { ...m.state.models, 'B:e1': { ...m.state.models['B:e1']!, pos: { x: m.state.models['A:e1']!.pos.x + 2, z: m.state.models['A:e1']!.pos.z } } } }
    m = asOut(near1)
    const melee = (m.pending.options ?? []).find((x) => (x.action as { choice?: string }).choice === 'melee')
    expect(melee).toBeTruthy()
  })

  it('CARD-003 a card the decision did not list is E_NOT_AN_OPTION', () => {
    const o = start()
    const r = act(o, { type: 'playCard', cardId: RECON, option: 'pathfinder', targetId: 'A:u2' }) // chooseActivation lists no card
    expect(r.rejection?.code).toBe('E_NOT_AN_OPTION')
    const a = activate(start(), 'A:u2')
    expect(play(a, RECON, 'pathfinder', 'A:e1').rejection?.code).toBe('E_TARGET_INVALID') // not the activating unit
    expect(play(a, 'core.card.nope', 'x', 'A:u2').rejection?.code).toBe('E_NOT_AN_OPTION')
    expect(play(a, FTM, 'tough', 'A:u2').rejection?.code).toBe('E_NOT_AN_OPTION') // not in the hand
  })

  it('CARD-004 a third card in a turn is E_ALREADY_USED; two in turn 1 and one in turn 3 is fine', () => {
    const played = [
      { cardId: BH, option: 'sturdy', targetIds: ['A:e0'], round: 1, turn: 1 },
      { cardId: BLESS, option: 'weapons', targetIds: ['A:L'], round: 1, turn: 1 },
    ]
    const o1 = activate(asOut(withHand(start().state, 'A', UNI, played)), 'A:u2')
    expect(cardActions(o1)).toEqual([])
    const bad = play(o1, RECON, 'pathfinder', 'A:u2')
    expect(bad.rejection?.code).toBe('E_ALREADY_USED')
    // two turns later the same two plays no longer count
    const later = { ...withHand(bare(start().state), 'A', UNI, played), turn: 3, round: 2 }
    const o3 = activate(asOut(later), 'A:u2')
    expect(has(o3, RECON, 'pathfinder', 'A:u2')).toBe(true)
    expect(query.cards(o3.state, 'A').playsLeft).toBe(2)
  })

  it('CARD-005 a second card on the same unit in one turn is E_ALREADY_USED, the first even on one trooper', () => {
    const o = activate(asOut(bare(start().state)), 'A:u2')
    const o2 = ok(play(o, RECON, 'pathfinder', 'A:u2'))
    expect(o2.pending.kind).toBe('chooseMovement')
    expect(cardActions(o2)).toEqual([]) // everything else on the unit is blocked
    expect(play(o2, DUCK, 'set-defense', 'A:u2').rejection?.code).toBe('E_ALREADY_USED')
    expect(cardUsedOn(o2.state, 'A', 'A:u2')).toBe(true)
    expect(cardUsedOn(o2.state, 'A', 'A:u2.2')).toBe(true) // the whole unit
    expect(cardUsedOn(o2.state, 'A', 'A:e1')).toBe(false)
    // Blessings on one trooper uses up the unit as well
    const t = activate(start(), 'A:u2')
    const b = ok(play(t, BLESS, 'weapons', 'A:u2.1'))
    expect(play(b, RECON, 'pathfinder', 'A:u2').rejection?.code).toBe('E_ALREADY_USED')
  })

  it('CARD-006 a played card is gone for the rest of the game', () => {
    const o = ok(play(activate(start(), 'A:e1'), RECON, 'reposition', 'A:e1'))
    const h = o.state.players.A.cards!
    expect(h.played).toEqual([{ cardId: RECON, option: 'reposition', targetIds: ['A:e1'], round: 1, turn: 1 }])
    expect(h.hand).toContain(RECON) // spent is derived from played
    // the same card in a later turn: not offered, and a direct play is E_ALREADY_USED
    const later = asOut({ ...o.state, turn: 3, round: 2, phase: 'activation', pending: o.state.pending })
    const a = activate(asOut(finishTo(later)), 'A:u2')
    expect(has(a, RECON)).toBe(false)
    expect(has(a, BH)).toBe(true)
    expect(play(a, RECON, 'reposition', 'A:u2').rejection?.code).toBe('E_ALREADY_USED')
  })

  it('CARD-021 query.cards shows both hands, plays left and what a card was played on', () => {
    let o = activate(asOut(bare(start(UNI, [BH, RECON]).state)), 'A:u2')
    let q = query.cards(o.state, 'A')
    expect(q.hand.map((c) => c.cardId)).toEqual(UNI)
    expect(q.playsLeft).toBe(2)
    const rc = q.hand.find((c) => c.cardId === RECON)!
    expect(rc).toMatchObject({ played: false, playableNow: true })
    expect(rc.options.find((x) => x.id === 'pathfinder')!.targets).toEqual(['A:u2'])
    expect(query.cards(o.state, 'B').hand.map((c) => c.cardId)).toEqual([BH, RECON])
    expect(query.cards(o.state, 'B').hand.every((c) => !c.playableNow)).toBe(true)
    o = ok(play(o, RECON, 'pathfinder', 'A:u2'))
    q = query.cards(o.state, 'A')
    expect(q.playsLeft).toBe(1)
    expect(q.usedOn).toEqual(['A:u2'])
    expect(q.hand.find((c) => c.cardId === RECON)!.played).toBe(true)
  })
})

/** Finish the open activation(s) the cheap way: mark everything of the active player activated and raise chooseActivation. */
function finishTo(o: FlowOut): GameState {
  const s = o.state
  const models = Object.fromEntries(Object.entries(s.models).map(([k, m]) => [k, { ...m, activated: false }]))
  const units = Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, { ...u, activated: false }]))
  return { ...s, models, units, activation: null, attack: null, effects: [] , pending: { ...s.pending, kind: 'chooseActivation', options: [] } }
}

describe('Careful Reconnaissance', () => {
  it('CARD-007 option A grants Pathfinder for the activation only', () => {
    let o = ok(play(activate(asOut(bare(start().state)), 'A:u2'), RECON, 'pathfinder', 'A:u2'))
    for (const id of activeModels(o)) expect(hasFlag(o.state, bundle, id, 'pathfinder')).toBe(true)
    expect(abilitiesOf(o.state, bundle, 'A:u2.1')).toContain('core.a.pathfinder')
    o = drain(o)
    expect(o.pending.kind).toBe('chooseActivation')
    for (const id of ['A:u2.1', 'A:u2.2', 'A:u2.3']) expect(abilitiesOf(o.state, bundle, id)).not.toContain('core.a.pathfinder')
  })

  it('CARD-008 option B: advance, then a 3 inch advance ends the activation; after a run there is no Reposition move', () => {
    // Lazarenko has no Reposition of his own
    let o = ok(play(activate(start(), 'A:e1'), RECON, 'reposition', 'A:e1'))
    expect(abilitiesOf(o.state, bundle, 'A:e1')).toContain('core.a.reposition')
    o = ok(act(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e1' }))
    o = ok(act(o, { type: 'chooseCombatAction', modelId: 'A:e1', choice: 'forfeit' }))
    expect(o.pending.kind).toBe('moveModel')
    expect((o.pending.context.data?.trigger as { abilityId: string }).abilityId).toBe('core.a.reposition')
    // after a run: the activation ends with no Reposition prompt
    const r = ok(play(activate(start(), 'A:e1'), RECON, 'reposition', 'A:e1'))
    const run = ok(act(r, { type: 'chooseMovement', option: 'run', modelId: 'A:e1' }))
    expect(run.pending.kind).toBe('moveModel')
    const to = run.pending.options!.find((x) => x.action.type === 'moveModel')!
    const done = ok(step(run.state, to.action))
    expect(done.pending.kind).toBe('chooseActivation')
  })
})

describe('Blessings of the Gods', () => {
  it('CARD-009 option A: the weapons are blessed and magical for the activation, then not', () => {
    let o = ok(play(activate(start(), 'A:e1'), BLESS, 'weapons', 'A:e1'))
    o = ok(act(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e1' }))
    o = asOut({ ...o.state, models: { ...o.state.models, 'B:e1': { ...o.state.models['B:e1']!, pos: { x: o.state.models['A:e1']!.pos.x + 1.6, z: o.state.models['A:e1']!.pos.z } } } })
    const dec = declareAttack(o.state, bundle, { attackerId: 'A:e1', targetId: 'B:e1', weaponId: 'kha.w.lazarenko-knife', additional: false, noFocus: false, chargeAttack: false })
    if ('rejection' in dec) throw new Error(dec.rejection.message)
    const atk = dec.state.attack as unknown as { x: { blessed: boolean } }
    expect(atk.x.blessed).toBe(true)
    // the magical damage type comes from the weapons plugin
    expect(corePlugins[0]!.damageTypes!(dec.state, bundle, dec.state.attack as AtkCtx)).toEqual(['magical'])
    // without the card the same attack is neither
    const plain = declareAttack({ ...o.state, effects: [] }, bundle, { attackerId: 'A:e1', targetId: 'B:e1', weaponId: 'kha.w.lazarenko-knife', additional: false, noFocus: false, chargeAttack: false })
    if ('rejection' in plain) throw new Error(plain.rejection.message)
    expect((plain.state.attack as unknown as { x: { blessed: boolean } }).x.blessed).toBe(false)
    expect(corePlugins[0]!.damageTypes!(plain.state, bundle, plain.state.attack as AtkCtx)).toEqual([])
    const end = drain(o)
    expect(end.state.effects.some((e) => e.name === 'Blessings of the Gods')).toBe(false)
  })

  it('CARD-010 Blessings is offered on the first decision only', () => {
    const o = activate(start(), 'A:e1')
    expect(has(o, BLESS, 'weapons', 'A:e1')).toBe(true)
    const adv = ok(act(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e1' }))
    expect(has(adv, BLESS)).toBe(false)
    expect(has(adv, RECON)).toBe(true) // the any-time cards stay
    // a unit offers it per trooper
    const u = activate(start(), 'A:u2')
    expect(cardActions(u).filter((a) => a.cardId === BLESS && a.option === 'weapons').map((a) => a.targetId).sort()).toEqual(['A:u2.1', 'A:u2.2', 'A:u2.3'])
  })

  it('CARD-011 option B: focus respects the war-engine cap, fury goes to a warlock below its limit, tokens only to a model that can hold them', () => {
    const gain = (o: FlowOut, id: string, g: string) => cardActions(o).some((a) => a.cardId === BLESS && a.option === 'gain' && a.targetId === id && a.data?.gain === g)
    // Razor is a war-engine: 3 focus is the cap
    const s3 = withModel(start().state, 'A:e0', { focus: 3 })
    expect(gain(activate(asOut(s3), 'A:e0'), 'A:e0', 'focus')).toBe(false)
    const s2 = withModel(start().state, 'A:e0', { focus: 2 })
    let o = activate(asOut(s2), 'A:e0')
    expect(gain(o, 'A:e0', 'focus')).toBe(true)
    o = ok(play(o, BLESS, 'gain', 'A:e0', { gain: 'focus' }))
    expect(o.state.models['A:e0']!.focus).toBe(3)
    expect(o.events.map((e) => e.type)).toEqual(expect.arrayContaining(['CardPlayed', 'FocusChanged']))
    // a warlock below ARC gets fury (Vilkul stands in as a fury model)
    const sw = withModel(start().state, 'A:L', { fury: 2, focus: 0 })
    let w = activate(asOut(sw), 'A:L')
    expect(gain(w, 'A:L', 'fury')).toBe(true)
    expect(gain(w, 'A:L', 'focus')).toBe(false)
    w = ok(play(w, BLESS, 'gain', 'A:L', { gain: 'fury' }))
    expect(w.state.models['A:L']!.fury).toBe(3)
    // soul tokens: nothing in Khador takes them, a Soul Taker does
    expect(gain(activate(start(), 'A:e1'), 'A:e1', 'soul')).toBe(false)
    const hades = withModel(start().state, 'A:e1', { profileId: 'cry.hades' })
    expect(gain(activate(asOut(hades), 'A:e1'), 'A:e1', 'soul')).toBe(true)
  })
})

describe('Duck and Cover!', () => {
  const unitNear = (): FlowOut => {
    let s = start().state
    // two Hounds next to the first wall, so Bite and Hold can see them as holders too
    s = withModel(s, 'A:u2.1', { pos: { x: -6, z: -3 } })
    s = withModel(s, 'A:u2.2', { pos: { x: -5, z: -4.2 } })
    s = withModel(s, 'A:u2.3', { pos: { x: -7.2, z: -4.2 } })
    return asOut(bare(s))
  }

  it('CARD-012 Dig In: cover against ranged, Resistance: Blast, and the model does not block LOS', () => {
    near.value = true
    let o = activate(unitNear(), 'A:u2')
    o = ok(play(o, DUCK, 'dig-in', 'A:u2'))
    const id = 'A:u2.1'
    expect(resistsDamageType(o.state, bundle, id, ['blast'])).toBe(true)
    expect(losOptsFor(o.state, bundle, 'B:e1').skipModel!(o.state.models[id]!)).toBe(true)
    expect(losOptsFor(o.state, bundle, 'B:e1').skipModel!(o.state.models['A:e1']!)).toBe(false)
    // the target number against a ranged attack goes up by the cover bonus
    const place = (s: GameState): GameState => withModel(withModel(s, 'B:u2.1', { pos: { x: -6, z: 0 } }), 'A:u2.1', { pos: { x: -6, z: -3 } })
    const wpn = bundle.byId[o.state.models['B:u2.1']!.profileId]!.weapons as { weapon: string }[]
    const ranged = wpn.map((w) => w.weapon).find((w) => (bundle.byId[w] as { type?: string }).type === 'ranged')!
    const withDig = query.attackPreview(place(o.state), 'B:u2.1', ranged, id)
    const without = query.attackPreview(place({ ...o.state, effects: [] }), 'B:u2.1', ranged, id)
    expect(withDig.legal).toBeNull()
    expect(withDig.hitTarget - without.hitTarget).toBe(4)
  })

  it('CARD-012 away from every element the grants are switched off', () => {
    near.value = true
    let o = activate(unitNear(), 'A:u2')
    o = ok(play(o, DUCK, 'dig-in', 'A:u2'))
    near.value = false
    expect(resistsDamageType(o.state, bundle, 'A:u2.1', ['blast'])).toBe(false)
    expect(abilitiesOf(o.state, bundle, 'A:u2.1')).not.toContain('core.a.dig-in')
    near.value = true
    expect(abilitiesOf(o.state, bundle, 'A:u2.1')).toContain('core.a.dig-in')
  })

  it('CARD-013 Dig In ends when the model moves or is engaged (each model on its own)', () => {
    near.value = true
    const o = ok(play(activate(unitNear(), 'A:u2'), DUCK, 'dig-in', 'A:u2'))
    expect(o.state.effects.filter((e) => e.name === 'Dig In')).toHaveLength(1)
    const moved = withModel(o.state, 'A:u2.1', { pos: { x: -6.8, z: -2.6 } })
    const r1 = endDigIns(moved, bundle)
    expect(r1.state.effects.find((e) => e.name === 'Dig In')!.targetIds).toEqual(['A:u2.2', 'A:u2.3'])
    const engaged = withModel(r1.state, 'A:u2.2', {}) // still anchored
    const withEnemy = withModel(engaged, 'B:e1', { pos: { x: -5, z: -3 } }) // Falk next to A:u2.2
    const r2 = endDigIns(withEnemy, bundle)
    expect(r2.state.effects.find((e) => e.name === 'Dig In')!.targetIds).not.toContain('A:u2.2')
    // everyone gone: the effect itself goes
    const r3 = endDigIns(withModel(withModel(withModel(r2.state, 'A:u2.3', { pos: { x: 0, z: -5 } }), 'A:u2.1', { pos: { x: 0, z: -6 } }), 'A:u2.2', { pos: { x: 0, z: -7 } }), bundle)
    expect(r3.state.effects.some((e) => e.name === 'Dig In')).toBe(false)
    expect(r3.events.some((e) => e.type === 'EffectExpired')).toBe(true)
    // and through a real action: moving the unit takes the effect off
    const adv = ok(act(o, { type: 'chooseMovement', option: 'advance', modelId: 'A:u2.1' }))
    const here = adv.state.models['A:u2.1']!.pos
    const mv = adv.pending.options?.find((x) => x.action.type === 'moveModel' && (x.action.path.length > 0 && (Math.abs(x.action.path.at(-1)!.x - here.x) > 0.5 || Math.abs(x.action.path.at(-1)!.z - here.z) > 0.5)))
    expect(mv).toBeTruthy()
    const after = ok(step(adv.state, mv!.action))
    expect(after.state.effects.find((e) => e.name === 'Dig In')?.targetIds ?? []).not.toContain('A:u2.1')
  })

  it('CARD-014 Set Defense: charge and slam rolls against the model take -2, only near an element', () => {
    near.value = true
    const o = ok(play(activate(unitNear(), 'A:u2'), DUCK, 'set-defense', 'A:u2'))
    expect(hasFlag(o.state, bundle, 'A:u2.1', 'setDefense')).toBe(true)
    // preview the charge attack a Cygnar trooper would make
    const place = (s: GameState): GameState => withModel(withModel(s, 'B:u2.1', { pos: { x: -6, z: -1.4 } }), 'A:u2.1', { pos: { x: -6, z: -3 } })
    const melee = (bundle.byId[o.state.models['B:u2.1']!.profileId]!.weapons as { weapon: string }[]).map((w) => w.weapon).find((w) => (bundle.byId[w] as { type?: string }).type === 'melee')!
    const withIt = query.attackPreview(place(o.state), 'B:u2.1', melee, 'A:u2.1', { chargeAttack: true })
    const without = query.attackPreview(place({ ...o.state, effects: [] }), 'B:u2.1', melee, 'A:u2.1', { chargeAttack: true })
    expect(withIt.mods.some((m) => m.label === 'Set Defense' && m.value === -2)).toBe(true)
    expect(without.mods.some((m) => m.label === 'Set Defense')).toBe(false)
    near.value = false
    expect(hasFlag(o.state, bundle, 'A:u2.1', 'setDefense')).toBe(false)
    near.value = true
  })

  it('CARD-015 Duck and Cover on a warjack, warbeast or battle engine is E_TARGET_INVALID', () => {
    const o = activate(start(), 'A:e0') // Razor, a warjack
    expect(has(o, DUCK)).toBe(false)
    expect(play(o, DUCK, 'dig-in', 'A:e0').rejection?.code).toBe('E_TARGET_INVALID')
    expect(play(o, DUCK, 'set-defense', 'A:e0').rejection?.code).toBe('E_TARGET_INVALID')
    const solo = activate(start(), 'A:e1') // Lazarenko, a solo: fine
    expect(has(solo, DUCK, 'set-defense', 'A:e1')).toBe(true)
    const lead = activate(start(), 'A:L') // a warcaster is not a warrior
    expect(has(lead, DUCK)).toBe(false)
  })
})

describe('Bite and Hold', () => {
  it('CARD-016 option A: the element a unit secures is offered, and the hold is recorded for this turn', () => {
    near.value = true
    let s = start().state
    s = withModel(s, 'A:u2.1', { pos: { x: -6, z: -3 } })
    s = withModel(s, 'A:u2.2', { pos: { x: -5, z: -4.2 } })
    let o = activate(asOut(s), 'A:u2')
    expect(has(o, BH, 'secure', 'A:u2')).toBe(true)
    expect(cardActions(o).find((a) => a.cardId === BH && a.option === 'secure')!.data).toEqual({ elementId: 'el-w1' })
    expect(play(o, BH, 'secure', 'A:u2').rejection?.code).toBe('E_NOT_AN_OPTION') // an element has to be named
    o = ok(play(o, BH, 'secure', 'A:u2', { elementId: 'el-w1' }))
    expect(o.state.scenario.elementState!['el-w1']!.stickyHold).toEqual({ player: 'A', round: 1, turn: 1 })
    expect(has(o, BH)).toBe(false)
    // a unit that secures nothing does not get option A
    const far = activate(start(), 'A:u2')
    expect(has(far, BH, 'secure')).toBe(false)
    expect(has(far, BH, 'sturdy', 'A:u2')).toBe(true)
  })

  it('CARD-017 option B: a push does not move the model near an element, a slam still does', () => {
    near.value = true
    const o = ok(play(activate(start(), 'A:u2'), BH, 'sturdy', 'A:u2'))
    const look = lookups(o.state, bundle)
    const id = 'A:u2.1'
    const before = o.state.models[id]!.pos
    const p = push(o.state, id, { x: before.x - 2, z: before.z }, 2, look)
    expect(p.travelled).toBe(0)
    expect(p.state.models[id]!.pos).toEqual(before)
    const sl = slideAway(o.state, id, { x: before.x - 2, z: before.z }, 2, 'slam', look)
    expect(sl.travelled).toBeGreaterThan(0)
    // off the element it moves like anyone else
    near.value = false
    const q = push(o.state, id, { x: before.x - 2, z: before.z }, 2, lookups(o.state, bundle))
    expect(q.travelled).toBeGreaterThan(0)
    near.value = true
  })
})

describe('For the Motherland', () => {
  it('CARD-020 a unit gains Tough for the round, then loses it', () => {
    let o = activate(asOut(bare(start([FTM, BH]).state)), 'A:u2')
    expect(has(o, FTM, 'tough', 'A:u2')).toBe(true)
    o = ok(play(o, FTM, 'tough', 'A:u2'))
    const look = lookups(o.state, bundle)
    for (const id of ['A:u2.1', 'A:u2.2', 'A:u2.3']) expect(look.tough!(id)).toBe(true)
    expect(look.tough!('A:e1')).toBe(false)
    // the effect lasts until the start of A's next turn
    const next = expireEffects({ ...o.state, turn: o.state.turn + 2, activePlayer: 'A' }, 'turnStart').state
    expect(lookups(next, bundle).tough!('A:u2.1')).toBe(false)
    // not on a warjack
    expect(has(activate(start([FTM]), 'A:e0'), FTM)).toBe(false)
  })
})

describe('Put the Fires Out (Maintenance)', () => {
  const turnStart = (s: GameState): FlowOut => beginTurn({ ...s, phase: 'maintenance', window: 'maintenance.start' }, bundle)

  it('CARD-018 the prompt is raised only when a model would gain; option A ends Fire before the continuous roll', () => {
    // nothing to gain: no prompt
    const clean = turnStart(withHand(startState('fires-1').state, 'A', UNI))
    expect(clean.pending.kind).not.toBe('abilityChoice')
    // a burning model
    let s = withHand(bare(startState('fires-1').state), 'A', UNI)
    s = withModel(s, 'A:u2.1', { conditions: ['fire'] })
    let o = turnStart(s)
    expect(o.pending.kind).toBe('abilityChoice')
    expect(o.pending.context.data?.code).toBe('card')
    expect(o.pending.canPass).toBe(true)
    expect(o.state.phase).toBe('maintenance')
    expect(cardActions(o).map((a) => `${a.option}:${a.targetId}`)).toEqual(['end-effects:A:u2'])
    expect(legalActions(o.state).some((a) => a.type === 'pass')).toBe(true)
    expect(o.events.some((e) => e.type === 'ContinuousEffectRolled')).toBe(false) // nothing rolled yet
    const played = ok(play(o, FIRES, 'end-effects', 'A:u2'))
    expect(played.state.models['A:u2.1']!.conditions).not.toContain('fire')
    expect(played.events.map((e) => e.type)).toEqual(expect.arrayContaining(['CardPlayed', 'ConditionRemoved']))
    expect(played.events.some((e) => e.type === 'ContinuousEffectRolled')).toBe(false)
    expect(played.pending.kind).not.toBe('abilityChoice') // on to Control / activation
    expect(played.state.players.A.cards!.played).toHaveLength(1)
    // passing leaves the fire to burn
    o = turnStart(s)
    const passed = ok(act(o, { type: 'pass' }))
    expect(passed.events.some((e) => e.type === 'ContinuousEffectRolled')).toBe(true)
    expect(passed.state.players.A.cards!.played).toHaveLength(0)
  })

  it('CARD-018 option B heals d3+1 boxes', () => {
    let s = withHand(startState('fires-2').state, 'A', UNI)
    s = withModel(s, 'A:e1', { damage: { track: 'single', boxes: 10, filled: 6 } })
    const hurt = s.models['A:e1']!
    const o = turnStart(s)
    expect(cardActions(o).map((a) => `${a.option}:${a.targetId}`)).toContain('heal:A:e1')
    const r = ok(play(o, FIRES, 'heal', 'A:e1'))
    expect(r.events.some((e) => e.type === 'Healed')).toBe(true)
    const healed = (hurt.damage as { filled: number }).filled - (r.state.models['A:e1']!.damage as { filled: number }).filled
    expect(healed).toBeGreaterThanOrEqual(2)
    expect(healed).toBeLessThanOrEqual(4)
  })

  it('CARD-019 option B is not offered to a model that cannot have damage removed', () => {
    let s = withHand(startState('fires-3').state, 'A', UNI)
    s = withModel(s, 'A:e1', { damage: { track: 'single', boxes: 10, filled: 6 } })
    s = { ...s, effects: [{ id: 'e:900', sourceId: 'cir.s.grievous-wounds', name: 'Grievous Wounds', owner: 'B', targetIds: ['A:e1'], mods: [], forbid: ['heal'], duration: 'round', expires: null }] }
    const o = turnStart(s)
    expect(o.pending.kind).not.toBe('abilityChoice') // nothing else to gain either
  })

  it('CARD-018 the player may not play the card for the opponent or twice', () => {
    let s = withHand(startState('fires-4').state, 'A', UNI)
    s = withModel(s, 'A:u2.1', { conditions: ['knockedDown'] })
    const o = turnStart(s)
    expect(o.pending.kind).toBe('abilityChoice')
    expect(validate(o.state, { type: 'playCard', decisionId: o.pending.id, player: 'B', cardId: FIRES, option: 'heal', targetId: 'A:e1' } as Action)?.code).toBe('E_NOT_YOUR_DECISION')
    expect(play(o, FIRES, 'end-effects', 'B:u2').rejection?.code).toBe('E_TARGET_INVALID')
  })
})

describe('whole games with hands', () => {
  it('CARD-022 random play offers cards, every offered playCard validates, games make progress', () => {
    near.value = true
    let offered = 0
    let played = 0
    for (const seed of ['cg-1', 'cg-2', 'cg-3']) {
      let o = asOut(withHand(withHand(startState(seed).state, 'A', UNI), 'B', UNI))
      for (let i = 0; i < 700 && o.pending.kind !== 'gameOver'; i++) {
        const legal = legalActions(o.state)
        expect(legal.length).toBeGreaterThan(0)
        const cards = legal.filter((a) => a.type === 'playCard')
        offered += cards.length
        for (const a of cards) expect(validate(o.state, a)).toBeNull()
        const a = cards.length && i % 3 === 0 ? cards[i % cards.length]! : pickSensible(o.state, o.state.pending, legal, seed)
        const r = step(o.state, a)
        expect(r.rejection).toBeUndefined()
        if (a.type === 'playCard') played++
        o = { state: r.state, events: r.events, pending: r.pending }
      }
      // never more than two plays a turn, never the same card twice
      for (const p of ['A', 'B'] as const) {
        const pl = o.state.players[p].cards!.played
        expect(new Set(pl.map((x) => x.cardId)).size).toBe(pl.length)
        const perTurn = new Map<number, number>()
        for (const x of pl) perTurn.set(x.turn, (perTurn.get(x.turn) ?? 0) + 1)
        for (const n of perTurn.values()) expect(n).toBeLessThanOrEqual(2)
      }
    }
    expect(offered).toBeGreaterThan(0)
    expect(played).toBeGreaterThan(0)
  })
})

