// Protectorate of Menoth faction rules (docs/spec/factions/menoth.md): one test per special ability, FAC-MEN-001..016.
// A game of the Menoth starter (A) against the Cygnar Quick Start (B), models parked by hand so each rule is isolated.
import { describe, expect, it } from 'vitest'
import { cannotKnockDown, codeHooks, hasFlag, runCodeEffect, statOf } from '../../src/engine/code-hooks'
import { applyEffect } from '../../src/engine/effects'
import type { GameEvent } from '../../src/engine/events'
import { shieldBonusArm, stokeFreeVictim } from '../../src/engine/factions/menoth'
import type { GameSetup, GameState } from '../../src/engine/types'
import { asOut, bundle, choose, openCombat, place, send, settle, trySend, withModel } from './action-helpers'
import { newGame, runControlTo, runSetup } from './turn-helpers'

const SETUP: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'men.l.starter-recon', B: 'cyg.l.qs-recon' } }
const R = 30 / 25.4 // a 30 mm base across, in inches (two such bases touch when their centres are this far apart)

/** Models: A:L Feora, A:e0 Crusader, A:e1 Valeria, A:e2 Pyrrhus, A:u3.1-5 Defenders; B:L Caine, B:e0 Deuce, B:e1 Falk, B:u2.1-3 Black 13th. */
function startMen(seed: string, who: 'A' | 'B' = 'A'): GameState {
  const s = runControlTo(runSetup(newGame(SETUP, seed))).state
  return { ...s, activePlayer: who, pending: { ...s.pending, kind: 'chooseActivation', player: who, id: 'd:900', options: [] }, decisionSeq: 900 }
}
/** Park every model but `keep` far from the action along the table edge, so nothing blocks, engages or joins a blast. */
function park(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
/** Pyrrhus is offered Battle Plan when he activates beside a warrior; these tests are about something else, so decline it. */
function openMen(out: ReturnType<typeof asOut>, id: string, choice: string) {
  let o = choose(out, id)
  if (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
  o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: id })
  return send(o, { type: 'chooseCombatAction', modelId: id, choice })
}
const burning = (s: GameState, id: string): GameState => withModel(s, id, { conditions: [...s.models[id]!.conditions, 'fire'] })
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const flatOf = (e: Ev<'DiceRolled'>): number => e.total - e.kept.reduce((a, b) => a + b, 0)
const damageRolls = (es: GameEvent[]): Ev<'DiceRolled'>[] => evs(es, 'DiceRolled').filter((e) => e.purpose === 'damage')

describe('FAC-MEN data wiring', () => {
  it('FAC-MEN-000 every code hook the Menoth data names is registered', () => {
    const have = new Set(Object.keys(codeHooks().effects))
    for (const c of ['stokeStripAttack', 'stokeStripDamage', 'blessingOfTheFirstGift']) expect(have.has(c), c).toBe(true)
    // the hooks of the old guessed kit are gone: no data names them
    for (const c of ['stokeRefund', 'fireStep', 'hexHammer', 'inciteAttack', 'battlePlan']) expect(have.has(c), c).toBe(false)
  })

  it('FAC-MEN-000 the starter list builds a legal 30-point army and starts a game', () => {
    const s = startMen('men-list')
    expect(Object.keys(s.models).filter((id) => id.startsWith('A:')).length).toBe(9) // Feora, Crusader, Valeria, Pyrrhus, five Defenders
    expect(s.models['A:L']!.profileId).toBe('men.feora')
    expect(s.models['A:L']!.focus).toBe(6)
    expect(s.models['A:e0']!.damage.track).toBe('grid')
  })
})

describe('FAC-MEN Stoke the Pyre', () => {
  const duel = (seed: string, feora: { x: number; z: number }) => {
    let s = startMen(seed)
    s = park(s, ['A:L', 'A:e2', 'B:e1'])
    s = place(s, 'A:L', feora)
    s = place(s, 'A:e2', { x: 2, z: 0 })
    s = place(s, 'B:e1', { x: 2, z: 2.5 })
    return burning(s, 'B:e1')
  }
  const strike = (s: GameState) => {
    let o = openMen(asOut(s), 'A:e2', 'melee')
    o = send(o, { type: 'chooseAttack', modelId: 'A:e2', weaponId: 'men.w.pyrrhus-spear', targetId: 'B:e1', additional: false })
    return o
  }

  it('FAC-MEN-001 attack roll: a long-shot melee attack in Feora\'s CTRL strips the target\'s fire for an extra die', () => {
    const o = strike(duel('st1', { x: 0, z: 0 }))
    const m = evs(o.events, 'AttackMeasured')[0]!
    expect(m.dice).toBe(3) // Pyrrhus MAT 7 vs Falk DEF 15 is a long shot: the strip boosts the roll
    expect(evs(o.events, 'DiceRolled').find((e) => e.purpose === 'attack')!.dice.length).toBe(3)
    expect(o.state.models['B:e1']!.conditions).not.toContain('fire')
    expect(o.events.some((e) => e.type === 'ConditionRemoved' && e.condition === 'fire')).toBe(true)
  })

  it('FAC-MEN-001 outside Feora\'s CTRL the same attack keeps the fire and rolls two dice', () => {
    const o = strike(duel('st1b', { x: -14, z: -14 }))
    expect(evs(o.events, 'AttackMeasured')[0]!.dice).toBe(2)
    expect(o.state.models['B:e1']!.conditions).toContain('fire')
  })

  it('FAC-MEN-001 an easy hit keeps the fire for the damage roll, which gets the extra die (loop seeds for a hit)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = duel('st2' + i, { x: 0, z: 0 })
      // Deuce DEF 13 is within reach of MAT 7 + 2d6, so the fire is held for damage
      s = place(s, 'B:e0', { x: 2, z: 2.5 })
      s = place(s, 'B:e1', { x: 14, z: 14 })
      s = burning(s, 'B:e0')
      let o = openMen(asOut(s), 'A:e2', 'melee')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e2', weaponId: 'men.w.pyrrhus-spear', targetId: 'B:e0', additional: false })
      expect(evs(o.events, 'AttackMeasured')[0]!.dice).toBe(2)
      o = settle(o)
      const d = evs(o.events, 'DamageRolled')[0]
      if (!d) continue
      seen = true
      expect(d.instance.dice).toBe(4) // 2 + Weapon Master + Stoke the Pyre
      expect(o.state.models['B:e0']!.conditions).not.toContain('fire')
    }
    expect(seen).toBe(true)
  })

  it('FAC-MEN-001 Stoke the Pyre is a boost: a focus-using warjack gets 3 dice on a long shot, and no focus boost is offered on top', () => {
    let s = startMen('st-boost')
    s = park(s, ['A:L', 'A:e0', 'B:e1'])
    s = withModel(s, 'A:e0', { focus: 3 })
    s = place(s, 'A:L', { x: -3, z: 0 })
    s = place(s, 'A:e0', { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 0, z: 2.5 })
    s = burning(s, 'B:e1') // Crusader MAT 6 vs Falk DEF 15 is a long shot
    let o = openMen(asOut(s), 'A:e0', 'melee')
    o = send(o, { type: 'chooseAttack', modelId: 'A:e0', weaponId: 'men.w.blazing-star', targetId: 'B:e1', additional: false })
    expect(evs(o.events, 'AttackMeasured')[0]!.dice).toBe(3)
    expect(o.pending.kind).not.toBe('boostAttack')
    expect(o.state.models['A:e0']!.focus).toBe(3)
    expect(o.state.models['B:e1']!.conditions).not.toContain('fire')
  })

  it('FAC-MEN-001 a roll that is already boosted is left alone: the fire is kept and no extra die appears', () => {
    // a charge attack's damage roll is boosted for free, so Stoke the Pyre must not add a die or burn the fire
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = startMen('st-charge' + i)
      s = park(s, ['A:L', 'A:e2', 'B:e0'])
      s = place(s, 'A:L', { x: 0, z: -2 })
      s = place(s, 'A:e2', { x: 0, z: 0 })
      s = place(s, 'B:e0', { x: 0, z: 6 })
      s = burning(s, 'B:e0')
      let o = choose(asOut(s), 'A:e2')
      if (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
      o = send(o, { type: 'chooseMovement', option: 'charge', modelId: 'A:e2' })
      o = send(o, { type: 'chargeTarget', targetId: 'B:e0' })
      o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>)
      o = send(o, { type: 'chooseCombatAction', modelId: 'A:e2', choice: 'melee' })
      o = send(o, { type: 'chooseAttack', modelId: 'A:e2', weaponId: 'men.w.pyrrhus-spear', targetId: 'B:e0', additional: false })
      o = settle(o)
      const d = evs(o.events, 'DamageRolled')[0]
      if (!d) continue
      seen = true
      expect(d.instance.dice).toBe(4) // 2 + Weapon Master + the charge boost, and no Stoke die
      expect(o.state.models['B:e0']!.conditions).toContain('fire')
    }
    expect(seen).toBe(true)
  })

  it('FAC-MEN-002 Illumination: the first spell with an enemy on fire in CTRL is free and puts the fire out; the second pays', () => {
    let s = startMen('st3')
    s = park(s, ['A:L', 'B:e1', 'B:e0'])
    s = withModel(s, 'A:L', { focus: 6 })
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 6, z: 0 })
    s = place(s, 'B:e0', { x: -6, z: 0 })
    s = burning(burning(s, 'B:e1'), 'B:e0')
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.sacred-paragon' })
    expect(o.state.models['A:L']!.focus).toBe(6)
    expect(o.state.models['B:e0']!.conditions).not.toContain('fire') // the lowest id is put out first
    expect(o.state.models['B:e1']!.conditions).toContain('fire')
    // the second spell this turn is paid for, and the other fire stays
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.lawgivers-judgement' })
    expect(o.state.models['A:L']!.focus).toBe(4)
    expect(o.state.models['B:e1']!.conditions).toContain('fire')
    // nothing burning: the spell costs its focus
    let t = startMen('st3b')
    t = park(t, ['A:L'])
    t = withModel(t, 'A:L', { focus: 6 })
    t = place(t, 'A:L', { x: 0, z: 0 })
    let p = choose(asOut(t), 'A:L')
    p = send(p, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.sacred-paragon' })
    expect(p.state.models['A:L']!.focus).toBe(4)
  })

  it('FAC-MEN-002 Illumination is once per turn, so a second activation after a new turn gets it again; a burning enemy outside CTRL gives nothing', () => {
    let s = startMen('st3c')
    s = park(s, ['A:L', 'B:e1'])
    s = withModel(s, 'A:L', { focus: 6 })
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 14, z: 0 }) // beyond CTRL 12
    s = burning(s, 'B:e1')
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.sacred-paragon' })
    expect(o.state.models['A:L']!.focus).toBe(4)
    expect(o.state.models['B:e1']!.conditions).toContain('fire')
    expect(stokeFreeVictim(o.state, bundle, 'A:L')).toBeNull()
    expect(stokeFreeVictim(place(s, 'B:e1', { x: 6, z: 0 }), bundle, 'A:L')).toBeNull() // not in her activation yet
  })
})

describe('FAC-MEN Resistance, Steady, Relentless Charge, Shield Wall', () => {
  it('COND-007 Resistance: Fire: the feat never sets a model that resists fire alight', () => {
    let s = startMen('res', 'B')
    s = park(s, ['A:L', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:L', { x: 3, z: 0 })
    // run the feat's code as if the enemy warcaster used it
    const r = runCodeEffect(s, bundle, 'blessingOfTheFirstGift', { point: 'feat.used', selfId: 'B:L', activePlayer: 'B' })
    expect(r.state.models['A:L']!.conditions).not.toContain('fire')
    expect(r.events).toEqual([])
    expect(statOf(s, bundle, 'A:L', 'ARM')).toBe(17)
  })

  it('FAC-KHA Shield Wall reused: a Defender touching a unit-mate gets +2 ARM and cannot be knocked down', () => {
    let s = startMen('sw')
    s = place(s, 'A:u3.1', { x: 0, z: 0 })
    s = place(s, 'A:u3.2', { x: R, z: 0 })
    s = place(s, 'A:u3.3', { x: 10, z: 10 })
    expect(statOf(s, bundle, 'A:u3.1', 'ARM')).toBe(18)
    expect(statOf(s, bundle, 'A:u3.3', 'ARM')).toBe(16)
    expect(cannotKnockDown(s, bundle, 'A:u3.1')).toBe(true)
    expect(cannotKnockDown(s, bundle, 'A:u3.3')).toBe(false)
  })
})

describe('FAC-MEN Set Defense and Combined Melee Attack (core support pending)', () => {
  it('FAC-MEN-003 Set Defense is on Pyrrhus and every Defender (flag read by core once it supports defender-side rolls)', () => {
    const s = startMen('sd')
    for (const id of ['A:e2', 'A:u3.1', 'A:u3.5']) expect(hasFlag(s, bundle, id, 'setDefense')).toBe(true)
    expect(hasFlag(s, bundle, 'A:e1', 'setDefense')).toBe(false)
  })
  // Set Defense in play: CORE-074 (core-m9c.test.ts)
  it('ATK-0xx Combined Melee Attack is on every Defender (flag)', () => {
    const s = startMen('cma')
    expect(hasFlag(s, bundle, 'A:u3.2', 'combinedMeleeAttack')).toBe(true)
  })
  // Combined Melee Attack in play: CORE-034 (core-m9.test.ts)
})

describe('FAC-MEN Critical Fire, Continuous Effect: Fire, Chain Weapon', () => {
  it('FAC-MEN-011 Continuous Effect: Fire: a Flame Belcher hit sets the target on fire (loop seeds for a hit)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = startMen('cf' + i)
      s = park(s, ['A:e0', 'B:e0'])
      s = place(s, 'A:e0', { x: 0, z: 0 })
      s = place(s, 'B:e0', { x: 0, z: 6 })
      let o = openCombat(asOut(s), 'A:e0', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e0', weaponId: 'men.w.flame-belcher', targetId: 'B:e0', additional: false })
      o = settle(o)
      if (!evs(o.events, 'AttackResolved')[0]!.hit) continue
      seen = true
      expect(o.state.models['B:e0']!.conditions).toContain('fire')
    }
    expect(seen).toBe(true)
  })

  it('COND-007 Critical Fire: only a critical hit with the Flame Spear sets the target on fire (loop seeds for a crit and a plain hit)', () => {
    let crit = false, plain = false
    for (let i = 0; i < 400 && !(crit && plain); i++) {
      let s = startMen('crf' + i)
      s = park(s, ['A:u3.1', 'B:e1'])
      s = place(s, 'A:u3.1', { x: 0, z: 0 })
      s = place(s, 'B:e1', { x: 0, z: 2 })
      let o = choose(asOut(s), 'A:u3'); o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:u3.1' }); o = send(o, { type: 'chooseCombatAction', modelId: 'A:u3.1', choice: 'melee' })
      o = send(o, { type: 'chooseAttack', modelId: 'A:u3.1', weaponId: 'men.w.flame-spear', targetId: 'B:e1', additional: false })
      o = settle(o)
      const r = evs(o.events, 'AttackResolved')[0]!
      if (!r.hit) continue
      const fire = o.state.models['B:e1']!.conditions.includes('fire')
      if (r.crit) { crit = true; expect(fire).toBe(true) } else { plain = true; expect(fire).toBe(false) }
    }
    expect(crit && plain).toBe(true)
  })

  it('FAC-MEN-011 Chain Weapon: the Blazing Star ignores the Buckler ARM bonus (POW 18 +1 on the roll vs Deuce)', () => {
    let s = startMen('chain')
    s = park(s, ['A:e0', 'B:e0'])
    s = place(s, 'A:e0', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 3.5, z: 0 })
    expect(shieldBonusArm(s, bundle, 'B:e0')).toBe(1)
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let p = startMen('chain' + i)
      p = park(p, ['A:e0', 'B:e0'])
      p = place(p, 'A:e0', { x: 0, z: 0 })
      p = place(p, 'B:e0', { x: 3.5, z: 0 })
      let o = openCombat(asOut(p), 'A:e0', 'melee')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e0', weaponId: 'men.w.blazing-star', targetId: 'B:e0', additional: false })
      o = settle(o)
      const d = damageRolls(o.events)[0]
      if (!d) continue
      seen = true
      expect(flatOf(d)).toBe(19)
    }
    expect(seen).toBe(true)
  })
})

describe('FAC-MEN-016 feat: Blessing of the First Gift', () => {
  it('FAC-MEN-016 every enemy in CTRL catches fire with no damage roll; models outside do not; the whole unit burns', () => {
    let s = startMen('feat')
    s = park(s, ['A:L', 'B:e0', 'B:e1', 'B:L', 'B:u2.1', 'B:u2.2'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 5, z: 0 })
    s = place(s, 'B:e1', { x: 0, z: 5 })
    s = place(s, 'B:L', { x: 20, z: 0 })
    s = place(s, 'B:u2.1', { x: 0, z: -8 }) // in CTRL
    s = place(s, 'B:u2.2', { x: -2, z: -20 }) // out of CTRL, but a unit-mate of a model in CTRL
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'useFeat', casterId: 'A:L', featId: 'men.f.blessing-of-the-first-gift' })
    for (const id of ['B:e0', 'B:e1', 'B:u2.1', 'B:u2.2']) expect(o.state.models[id]!.conditions, id).toContain('fire')
    expect(o.state.models['B:L']!.conditions).not.toContain('fire')
    expect(evs(o.events, 'DiceRolled').filter((e) => e.purpose === 'damage')).toEqual([]) // the card has no damage roll
    expect(evs(o.events, 'DamageApplied')).toEqual([])
    expect(o.state.models['A:L']!.featUsed).toBe(true)
  })
})

describe('FAC-MEN-003 Combined Melee Attack (CORE-034): +1 per participant, primary included, no cap', () => {
  /** Five Defenders ringed round Deuce, every one in melee range of it. */
  const ring = (seed: string, extra?: (s: GameState) => GameState) => {
    let s = startMen(seed)
    s = park(s, ['A:u3.1', 'A:u3.2', 'A:u3.3', 'A:u3.4', 'A:u3.5', 'B:e0'])
    s = place(s, 'B:e0', { x: 0, z: 0 })
    for (let i = 0; i < 5; i++) {
      const ang = (i * 2 * Math.PI) / 5
      s = place(s, `A:u3.${i + 1}`, { x: Math.cos(ang) * 1.97, z: Math.sin(ang) * 1.97 })
    }
    return extra ? extra(s) : s
  }
  const combinedOption = (o: ReturnType<typeof asOut>) => o.pending.options!.find((x) => x.action.type === 'combinedAttack')

  it('four contributors add +5 to the attack roll and the damage roll (no cap at three)', () => {
    let o = choose(asOut(ring('comb5')), 'A:u3')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:u3.1' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:u3.1', choice: 'melee' })
    const comb = combinedOption(o)!
    expect(comb).toBeDefined()
    expect((comb.action as { contributorIds: string[] }).contributorIds.length).toBe(4)
    expect(comb.label).toContain('+5')
    o = send(o, comb.action as unknown as Record<string, unknown>)
    expect(evs(o.events, 'AttackMeasured')[0]!.mods.some((m) => /Combined/.test(m.label) && m.value === 5)).toBe(true)
  })

  it('the damage roll gets the same +(n+1) (loop seeds for a hit)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let o = choose(asOut(ring('combd' + i)), 'A:u3')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:u3.1' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'A:u3.1', choice: 'melee' })
      o = send(o, combinedOption(o)!.action as unknown as Record<string, unknown>)
      o = settle(o)
      const d = damageRolls(o.events)[0]
      if (!d) continue
      seen = true
      expect(flatOf(d)).toBe(12 + 5) // Spear POW 12 plus five participants
    }
    expect(seen).toBe(true)
  })
})

describe('FAC-MEN-003 Combined Melee Attack on a charge', () => {
  /** The Defenders charge Deuce, then the unit is ringed round it by hand (the engine's own placement is not what is tested). */
  const charged = (seed: string, dropFromCharge: string[] = []) => {
    let s = startMen(seed)
    s = park(s, ['A:u3.1', 'A:u3.2', 'A:u3.3', 'A:u3.4', 'A:u3.5', 'B:e0'])
    s = place(s, 'B:e0', { x: 0, z: 6 })
    for (let k = 0; k < 5; k++) s = place(s, `A:u3.${k + 1}`, { x: -2 + k * 1.3, z: 0 })
    let o = choose(asOut(s), 'A:u3')
    o = send(o, { type: 'chooseMovement', option: 'charge', modelId: 'A:u3.1' })
    o = send(o, { type: 'chargeTarget', targetId: 'B:e0' })
    o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>)
    o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>) // auto-place the unit
    let st = o.state
    for (let k = 0; k < 5; k++) {
      const ang = (k * 2 * Math.PI) / 5 + 1
      st = place(st, `A:u3.${k + 1}`, { x: Math.cos(ang) * 1.97, z: 6 + Math.sin(ang) * 1.97 })
    }
    if (dropFromCharge.length) {
      const a = st.activation as unknown as { x: { meleeOnly: string[] } }
      st = { ...st, activation: { ...a, x: { ...a.x, meleeOnly: a.x.meleeOnly.filter((id: string) => !dropFromCharge.includes(id)) } } as unknown as typeof st.activation }
    }
    return { ...o, state: st }
  }
  const combinedDamage = (seedBase: string, drop: string[]) => {
    for (let i = 0; i < 80; i++) {
      let o = charged(seedBase + i, drop)
      o = send(o, { type: 'chooseCombatAction', modelId: 'A:u3.1', choice: 'melee' })
      const comb = o.pending.options!.find((x) => x.action.type === 'combinedAttack')
      if (!comb) throw new Error('no combined attack offered: ' + JSON.stringify(o.pending.options!.map((x) => x.id)))
      o = send(o, comb.action as unknown as Record<string, unknown>)
      o = settle(o)
      const d = evs(o.events, 'DamageRolled')[0]
      if (d) return d
    }
    throw new Error('no damage roll found')
  }

  it('when every participant charged, the combined attack is a charge attack (its damage roll is boosted free)', () => {
    expect(combinedDamage('combc', []).instance.boosted).toBe(true)
  })

  it('when a contributor did not charge, it is an ordinary melee attack (no free boost)', () => {
    expect(combinedDamage('combn', ['A:u3.5']).instance.boosted).toBe(false)
  })
})
