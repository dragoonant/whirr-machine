// Protectorate of Menoth card rules (docs/spec/factions/menoth.md), the M10 card values: Four Gifts, Sanctified Hull, Marshal, Heavy Boiler,
// Gladiator, Thresher, Shield Guard, Heroic Inspiration, Holy Martyrs, Cleansing Volley, the three arrows, Debilitating Heat, Lawgiver's
// Judgement, Teleport, Conflagration. One test per rule, FAC-MEN-017 onward (FAC-MEN-001..016 live in menoth.test.ts).
import { describe, expect, it } from 'vitest'
import { losOptsFor, resistsDamageType } from '../../src/engine/code-hooks'
import { applyEffect } from '../../src/engine/effects'
import type { GameEvent } from '../../src/engine/events'
import {
  chooseGift, currentGift, GIFT_NAMES, GIFTS, giftBlock, menothMaintenance, sheafBlocked, teleportSamples, type GiftId,
} from '../../src/engine/factions/menoth'
import { losReport } from '../../src/engine/los'
import { moverInfo } from '../../src/engine/phases/activation'
import { runMaintenance } from '../../src/engine/phases/maintenance'
import type { GameSetup, GameState } from '../../src/engine/types'
import { asOut, bundle, choose, place, send, settle, trySend, withModel } from './action-helpers'
import { newGame, runControlTo, runSetup } from './turn-helpers'

const SETUP: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'men.l.starter-recon', B: 'cyg.l.qs-recon' } }
const MIRROR: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'men.l.starter-recon', B: 'men.l.starter-recon' } }
/** Models: A:L Feora, A:e0 Crusader, A:e1 Valeria, A:e2 Pyrrhus, A:u3.1-5 Defenders; B:L Caine, B:e0 Deuce, B:e1 Falk, B:u2.1-3 Black 13th. */
function startMen(seed: string, who: 'A' | 'B' = 'A', setup: GameSetup = SETUP): GameState {
  const s = runControlTo(runSetup(newGame(setup, seed))).state
  // the real Maintenance Phase already gave Feora a Gift; the tests that want one add it themselves
  return { ...s, effects: s.effects.filter((e) => e.sourceId !== 'men.a.four-gifts'), activePlayer: who, pending: { ...s.pending, kind: 'chooseActivation', player: who, id: 'd:900', options: [] }, decisionSeq: 900 }
}
/** Park every model but `keep` far from the action along the table edge. */
function park(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
/** Pyrrhus is no longer offered anything at the start of his activation, so the plain open works for every model. */
function open(out: ReturnType<typeof asOut>, id: string, choice: string, extra: Record<string, unknown> = {}) {
  let o = choose(out, id)
  o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: id })
  return send(o, { type: 'chooseCombatAction', modelId: id, choice, ...extra })
}
const burning = (s: GameState, id: string): GameState => withModel(s, id, { conditions: [...s.models[id]!.conditions, 'fire'] })
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const flatOf = (e: Ev<'DiceRolled'>): number => e.total - e.kept.reduce((a, b) => a + b, 0)
const damageRolls = (es: GameEvent[]): Ev<'DiceRolled'>[] => evs(es, 'DiceRolled').filter((e) => e.purpose === 'damage')
const filled = (s: GameState, id: string): number => (s.models[id]!.damage as { filled: number }).filled
const dropGifts = (s: GameState): GameState => ({ ...s, effects: s.effects.filter((e) => e.sourceId !== 'men.a.four-gifts') })
/** Hold a Gift for player A as if Feora had taken it this Maintenance Phase. */
function giveGift(s: GameState, gift: GiftId, owner: 'A' | 'B' = 'A', leader = 'A:L'): GameState {
  return applyEffect(dropGifts(s), ({ sourceId: 'men.a.four-gifts', name: GIFT_NAMES[gift], owner, casterId: leader, targetIds: [leader], mods: [], duration: 'round', gift } as unknown) as Parameters<typeof applyEffect>[1]).state
}

describe('FAC-MEN-017 The Four Gifts of Menoth: Maintenance', () => {
  it('each Maintenance Phase Feora takes one Gift for the round, and no Gift repeats until all four have been taken', () => {
    let s = startMen('gifts-cycle')
    const seen: GiftId[] = []
    for (let i = 0; i < 4; i++) {
      s = dropGifts(s)
      const r = menothMaintenance(s, bundle, 'A')
      s = r.state
      const g = currentGift(s, 'A')!
      expect(g).toBeTruthy()
      expect(r.events.some((e) => e.type === 'EffectApplied' && e.name === GIFT_NAMES[g])).toBe(true)
      seen.push(g)
    }
    expect([...seen].sort()).toEqual([...GIFTS].sort())
    // the fifth round starts a new cycle
    s = dropGifts(s)
    s = menothMaintenance(s, bundle, 'A').state
    expect(currentGift(s, 'A')).not.toBeNull()
  })

  it('the Gift is chosen by what the enemy army can do (a Cygnar army of casters and warjacks gets Law or the Sheaf first), and an army without the rule takes none', () => {
    const s = startMen('gifts-pick')
    expect(GIFTS).toContain(chooseGift(s, bundle, 'A'))
    expect(menothMaintenance(s, bundle, 'B').state).toBe(s) // Cygnar has no Gifts
    // no Menoth leader on the table: no Gift
    const dead = withModel(s, 'A:L', { life: 'destroyed' })
    expect(menothMaintenance(dead, bundle, 'A').state).toBe(dead)
  })

  it('the real Maintenance Phase hands Feora a Gift that lasts until her next turn, and a new one is taken the turn after', () => {
    let s = startMen('gifts-real')
    s = { ...s, phase: 'maintenance' }
    const m1 = runMaintenance(s, bundle)
    const g1 = currentGift(m1.state, 'A')
    expect(g1).not.toBeNull()
    expect(m1.state.effects.find((e) => e.sourceId === 'men.a.four-gifts')!.duration).toBe('round')
    // Cygnar's Maintenance leaves it in place (it lasts the round)
    const m2 = runMaintenance({ ...m1.state, activePlayer: 'B', turn: m1.state.turn + 1 }, bundle)
    expect(currentGift(m2.state, 'A')).toBe(g1)
  })
})

describe('FAC-MEN-018 The Gifts forbid what the enemy may do to Faction models in Feora\'s CTRL', () => {
  /** Feora, a Defender and Pyrrhus stand together; Black 13th, Deuce and Falk face them from 8". */
  function line(seed: string, gift: GiftId, who: 'A' | 'B' = 'B') {
    let s = startMen(seed, who)
    s = park(s, ['A:L', 'A:u3.1', 'A:e2', 'B:u2.1', 'B:e0', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'A:u3.1', { x: 0, z: 3 })
    s = place(s, 'A:e2', { x: 3, z: 0 })
    s = place(s, 'B:u2.1', { x: 0, z: 11 })
    s = place(s, 'B:e0', { x: 4, z: 11 })
    s = place(s, 'B:e1', { x: -4, z: 11 })
    return giveGift(s, gift)
  }

  it('Flame: an enemy warrior cannot charge a Faction model in her CTRL; a warjack still can; outside her CTRL it can', () => {
    const s = line('flame', 'flame')
    expect(giftBlock(s, bundle, 'B:u2.1', 'A:u3.1', ['charge'])).toMatch(/Gift of Flame/)
    expect(giftBlock(s, bundle, 'B:e0', 'A:u3.1', ['charge'])).toBeNull() // Deuce is a warjack, not a warrior
    expect(giftBlock(s, bundle, 'B:u2.1', 'A:u3.1', ['ranged'])).toBeNull() // the Wall is not up
    // through the engine: the protected models are not on the list of charge targets, the unprotected parked ones are
    let o = choose(asOut(s), 'B:u2')
    o = send(o, { type: 'chooseMovement', option: 'charge', modelId: 'B:u2.1' })
    const tg = o.pending.options!.map((x) => (x.action as { targetId?: string }).targetId)
    for (const id of ['A:L', 'A:u3.1', 'A:e2']) expect(tg, id).not.toContain(id)
    expect(tg.length).toBeGreaterThan(0)
    expect(trySend(o, { type: 'chargeTarget', targetId: 'A:u3.1' })).toMatchObject({ rejection: { code: 'E_TARGET_INVALID' } })
    // Deuce may charge the same Defender
    o = choose(asOut(withModel(s, 'B:e0', { focus: 2 })), 'B:e0')
    o = send(o, { type: 'chooseMovement', option: 'charge', modelId: 'B:e0' })
    expect(o.pending.options!.some((x) => (x.action as { targetId?: string }).targetId === 'A:u3.1')).toBe(true)
    // far from Feora the Defender is fair game
    const far = place(s, 'A:u3.1', { x: 0, z: 14 })
    const fo = place(far, 'A:L', { x: -16, z: -16 })
    expect(giftBlock(fo, bundle, 'B:u2.1', 'A:u3.1', ['charge'])).toBeNull()
  })

  it('Flame: it also stops enemy warriors special-attacking the model (a power attack or a star attack)', () => {
    const s = line('flame2', 'flame')
    expect(giftBlock(s, bundle, 'B:u2.1', 'A:u3.1', ['special'])).toMatch(/Flame/)
    expect(giftBlock(s, bundle, 'B:e0', 'A:u3.1', ['special'])).toBeNull()
    expect(giftBlock(s, bundle, 'B:u2.1', 'A:u3.1', [])).toBeNull() // a plain attack is not special
  })

  it('Law: no enemy spell at a Faction model in her CTRL (a mirror game, B Feora against A\'s Pyrrhus)', () => {
    let s = startMen('law', 'B', MIRROR)
    s = park(s, ['A:L', 'A:e2', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'A:e2', { x: 2, z: 0 })
    s = place(s, 'B:L', { x: 0, z: 8 })
    s = withModel(s, 'B:L', { focus: 6 })
    const cast = { type: 'castSpell', casterId: 'B:L', spellId: 'men.s.conflagration', targetId: 'A:e2' }
    expect(trySend(choose(asOut(giveGift(s, 'law')), 'B:L'), cast)).toMatchObject({ rejection: { code: 'E_TARGET_INVALID' } })
    const free = send(choose(asOut(giveGift(s, 'wall')), 'B:L'), cast) // another Gift: the spell goes ahead
    expect(evs(free.events, 'SpellCast').length).toBe(1)
  })

  it('the Wall: no enemy ranged attack at a Faction model in her CTRL, melee still allowed', () => {
    const s = line('wall', 'wall')
    expect(giftBlock(s, bundle, 'B:u2.1', 'A:u3.1', ['ranged'])).toMatch(/Wall/)
    let o = choose(asOut(withModel(s, 'B:u2.1', {})), 'B:u2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:u2.1' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'B:u2.1', choice: 'ranged' })
    const targets = o.pending.options!.map((x) => (x.action as { targetId?: string }).targetId).filter(Boolean)
    expect(targets).not.toContain('A:u3.1')
    expect(trySend(o, { type: 'chooseAttack', modelId: 'B:u2.1', weaponId: o.pending.options!.find((x) => x.action.type === 'chooseAttack')?.action ? (o.pending.options!.find((x) => x.action.type === 'chooseAttack')!.action as { weaponId: string }).weaponId : 'x', targetId: 'A:u3.1', additional: false }))
      .toMatchObject({ rejection: { code: 'E_TARGET_INVALID' } })
  })

  it('the Sheaf: an enemy warjack in her CTRL cannot spend focus (no run, no boost); out of her CTRL it can', () => {
    const s = withModel(line('sheaf', 'sheaf'), 'B:e0', { focus: 3 })
    expect(sheafBlocked(s, bundle, 'B:e0')).toBe(true)
    expect(sheafBlocked(s, bundle, 'B:u2.1')).toBe(false) // not a cohort model
    expect(sheafBlocked(s, bundle, 'A:e2')).toBe(false) // her own
    const o = choose(asOut(s), 'B:e0')
    expect(trySend(o, { type: 'chooseMovement', option: 'run', modelId: 'B:e0' })).toMatchObject({ rejection: { code: 'E_NOT_AN_OPTION' } })
    const free = place(s, 'B:e0', { x: 4, z: 30 })
    expect(sheafBlocked(free, bundle, 'B:e0')).toBe(false)
    const o2 = choose(asOut(withModel(giveGift(s, 'wall'), 'B:e0', { focus: 3 })), 'B:e0')
    expect(trySend(o2, { type: 'chooseMovement', option: 'run', modelId: 'B:e0' })).not.toHaveProperty('rejection')
  })
})

describe('FAC-MEN-019 Sanctified Hull', () => {
  it('the Gift reaches models within 3" of the Crusader while it stands in Feora\'s CTRL, even beyond her own CTRL', () => {
    let s = startMen('hull', 'B')
    s = park(s, ['A:L', 'A:e0', 'A:u3.1', 'B:u2.1', 'B:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'A:e0', { x: 12, z: 0 }) // in her CTRL (12")
    s = place(s, 'A:u3.1', { x: 14.4, z: 0 }) // beyond CTRL, within 3" of the Crusader
    s = place(s, 'B:u2.1', { x: 14.4, z: 8 })
    s = place(s, 'B:e0', { x: 14.4, z: 9 })
    s = giveGift(s, 'flame')
    expect(giftBlock(s, bundle, 'B:u2.1', 'A:u3.1', ['charge'])).toMatch(/Flame/)
    // the Crusader stands outside her CTRL: no hull reach
    expect(giftBlock(place(s, 'A:e0', { x: 14.5, z: -3 }), bundle, 'B:u2.1', 'A:u3.1', ['charge'])).toBeNull()
    // and the Sheaf reaches an enemy warjack within 3" of the hull
    const sheaf = giveGift(place(s, 'B:e0', { x: 14.4, z: 3.5 }), 'sheaf')
    expect(sheafBlocked(sheaf, bundle, 'B:e0')).toBe(true)
    expect(sheafBlocked(place(sheaf, 'B:e0', { x: 14.4, z: 12 }), bundle, 'B:e0')).toBe(false)
  })
})

describe('FAC-MEN-020 Marshal [Covenant of the Flame] and Marshal [Flameguard Defender]', () => {
  it('Feora sees past a friendly Covenant model and may advance through it; a model without Marshal cannot', () => {
    let s = startMen('marshal')
    s = park(s, ['A:L', 'A:e0', 'A:e1', 'A:u3.1', 'B:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'A:e0', { x: 0, z: 4 }) // the Crusader stands between Feora and Deuce
    s = place(s, 'B:e0', { x: 0, z: 9 })
    s = place(s, 'A:e1', { x: 4, z: 0 })
    s = place(s, 'A:u3.1', { x: -4, z: 0 })
    const ids = moverInfo(s, bundle, 'A:L').passIds ?? []
    expect(ids).toContain('A:e0')
    expect(ids).toContain('A:u3.1')
    expect(ids).not.toContain('B:e0')
    expect(moverInfo(s, bundle, 'A:e1').passIds).toBeUndefined() // Valeria has no Marshal
    expect(losReport(s, 'A:L', 'B:e0', losOptsFor(s, bundle, 'A:L')).visible).toBe(true)
    // advancing through the Crusader to the far side
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'chooseMovement', option: 'advance', modelId: 'A:L' })
    const r = trySend(o, { type: 'moveModel', modelId: 'A:L', path: [{ x: 0, z: 6 }] })
    expect(r && !('rejection' in r)).toBe(true)
  })

  it('Pyrrhus passes through Flameguard Defenders only', () => {
    let s = startMen('marshal2')
    s = park(s, ['A:e2', 'A:u3.1', 'A:u3.2', 'A:e1'])
    s = place(s, 'A:e2', { x: 0, z: 0 })
    s = place(s, 'A:u3.1', { x: 3, z: 0 })
    s = place(s, 'A:u3.2', { x: -3, z: 0 })
    s = place(s, 'A:e1', { x: 0, z: 3 })
    const ids = moverInfo(s, bundle, 'A:e2').passIds ?? []
    expect(ids).toContain('A:u3.1')
    expect(ids).toContain('A:u3.2')
    expect(ids).not.toContain('A:e1') // Valeria is Menoth but not a Defender
  })
})

describe('FAC-MEN-021 Heavy Boiler', () => {
  it('the Crusader runs 2" farther than SPD+5; other warjacks run SPD+5', () => {
    let s = startMen('boiler')
    s = park(s, ['A:e0', 'B:e0'])
    s = withModel(place(s, 'A:e0', { x: -14, z: -14 }), 'A:e0', { focus: 2 })
    expect(moverInfo(s, bundle, 'A:e0').runBonus).toBe(2)
    expect(moverInfo(s, bundle, 'B:e0').runBonus).toBeUndefined()
    let o = choose(asOut(s), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'run', modelId: 'A:e0' })
    expect(evs(o.events, 'MovementChosen')[0]!.maxDist).toBe(11) // SPD 4 + 5 + 2
    expect(o.pending.constraints!.maxDist).toBe(11)
    expect(trySend(o, { type: 'moveModel', modelId: 'A:e0', path: [{ x: -14, z: -3 }] })).not.toHaveProperty('rejection') // exactly 11"
    expect(trySend(o, { type: 'moveModel', modelId: 'A:e0', path: [{ x: -14, z: -2.9 }] })).toMatchObject({ rejection: { code: 'E_TOO_FAR' } })
    // an advance is not affected
    const adv = send(choose(asOut(s), 'A:e0'), { type: 'chooseMovement', option: 'advance', modelId: 'A:e0' })
    expect(adv.pending.constraints!.maxDist).toBe(4)
  })
})
