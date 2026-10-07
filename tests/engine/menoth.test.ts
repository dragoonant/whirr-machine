// Protectorate of Menoth faction rules (docs/spec/factions/menoth.md): one test per special ability, FAC-MEN-001..016.
// A game of the Menoth starter (A) against the Cygnar Quick Start (B), models parked by hand so each rule is isolated.
import { describe, expect, it } from 'vitest'
import { cannotKnockDown, codeHooks, hasFlag, runCodeEffect, statOf } from '../../src/engine/code-hooks'
import { applyEffect } from '../../src/engine/effects'
import type { GameEvent } from '../../src/engine/events'
import { shieldBonusArm, shieldedByFlameguard } from '../../src/engine/factions/menoth'
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
const burning = (s: GameState, id: string): GameState => withModel(s, id, { conditions: [...s.models[id]!.conditions, 'fire'] })
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const flatOf = (e: Ev<'DiceRolled'>): number => e.total - e.kept.reduce((a, b) => a + b, 0)
const damageRolls = (es: GameEvent[]): Ev<'DiceRolled'>[] => evs(es, 'DiceRolled').filter((e) => e.purpose === 'damage')

describe('FAC-MEN data wiring', () => {
  it('FAC-MEN-000 every code hook the Menoth data names is registered', () => {
    const have = new Set(Object.keys(codeHooks().effects))
    for (const c of ['stokeStripAttack', 'stokeStripDamage', 'inciteAttack', 'stokeRefund', 'fireStep', 'hexHammer', 'blessingOfTheFirstGift', 'battlePlan']) expect(have.has(c), c).toBe(true)
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
    let o = openCombat(asOut(s), 'A:e2', 'melee')
    o = send(o, { type: 'chooseAttack', modelId: 'A:e2', weaponId: 'men.w.pyrrhus-spear', targetId: 'B:e1', additional: false })
    return o
  }

  it('FAC-MEN-001 attack roll: a long-shot melee attack in Feora\'s CTRL strips the target\'s fire for an extra die', () => {
    const o = strike(duel('st1', { x: 0, z: 0 }))
    const m = evs(o.events, 'AttackMeasured')[0]!
    expect(m.dice).toBe(3) // Pyrrhus MAT 7 vs Falk DEF 15 is a long shot
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
      let o = openCombat(asOut(s), 'A:e2', 'melee')
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

  it('FAC-MEN-002 casting with an enemy on fire in CTRL strips it and refunds the focus', () => {
    let s = startMen('st3')
    s = park(s, ['A:L', 'B:e1'])
    s = withModel(s, 'A:L', { focus: 6 })
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 6, z: 0 })
    s = burning(s, 'B:e1')
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.incite' })
    expect(o.state.models['A:L']!.focus).toBe(6)
    expect(o.state.models['B:e1']!.conditions).not.toContain('fire')
    // nothing burning: the spell costs its focus
    let t = startMen('st3b')
    t = park(t, ['A:L'])
    t = withModel(t, 'A:L', { focus: 6 })
    t = place(t, 'A:L', { x: 0, z: 0 })
    let p = choose(asOut(t), 'A:L')
    p = send(p, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.incite' })
    expect(p.state.models['A:L']!.focus).toBe(2)
  })
})

describe('FAC-MEN Resistance, Steady, Relentless Charge, Shield Wall', () => {
  it('COND-007 Resistance: Fire: Feora takes the feat damage roll (one die fewer) but never catches fire', () => {
    let s = startMen('res', 'B')
    s = park(s, ['A:L', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:L', { x: 3, z: 0 })
    // run the feat's code as if the enemy warcaster used it
    const r = runCodeEffect(s, bundle, 'blessingOfTheFirstGift', { point: 'feat.used', selfId: 'B:L', activePlayer: 'B' })
    const roll = evs(r.events, 'DiceRolled').find((e) => e.purpose === 'damage')!
    expect(roll.dice.length).toBe(1)
    expect(r.state.models['A:L']!.conditions).not.toContain('fire')
    expect(evs(r.events, 'DamageApplied').some((e) => e.targetId === 'A:L')).toBe(true)
    expect(statOf(s, bundle, 'A:L', 'ARM')).toBe(17)
  })

  it('FAC-MEN-004 Steady: Pyrrhus cannot be knocked down; Valeria can', () => {
    const s = startMen('steady')
    expect(cannotKnockDown(s, bundle, 'A:e2')).toBe(true)
    expect(cannotKnockDown(s, bundle, 'A:e1')).toBe(false)
  })

  it('FAC-MEN-005 Relentless Charge: Pyrrhus has Pathfinder, a Defender does not', () => {
    const s = startMen('relent')
    expect(hasFlag(s, bundle, 'A:e2', 'pathfinder')).toBe(true)
    expect(hasFlag(s, bundle, 'A:u3.1', 'pathfinder')).toBe(false)
  })

  it('FAC-KHA Shield Wall reused: a Defender touching a unit-mate gets +2 ARM and cannot be knocked down', () => {
    let s = startMen('sw')
    s = place(s, 'A:u3.1', { x: 0, z: 0 })
    s = place(s, 'A:u3.2', { x: R, z: 0 })
    s = place(s, 'A:u3.3', { x: 10, z: 10 })
    expect(statOf(s, bundle, 'A:u3.1', 'ARM')).toBe(15)
    expect(statOf(s, bundle, 'A:u3.3', 'ARM')).toBe(13)
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

describe('FAC-MEN-006 Impenetrable Shield', () => {
  const hit = (seed: string, withDefender: boolean) => {
    for (let i = 0; i < 120; i++) {
      let s = startMen(seed + i, 'B')
      s = park(s, ['A:e2', 'A:u3.1', 'B:e1'])
      s = place(s, 'A:e2', { x: 0, z: 0 })
      s = place(s, 'A:u3.1', withDefender ? { x: R, z: 0 } : { x: 9, z: 9 })
      s = place(s, 'B:e1', { x: 0, z: 1.2 })
      let o = openCombat(asOut(s), 'B:e1', 'melee')
      o = send(o, { type: 'chooseAttack', modelId: 'B:e1', weaponId: 'cyg.w.sword', targetId: 'A:e2', additional: false })
      o = settle(o)
      const res = evs(o.events, 'AttackResolved')[0]!
      if (!res.hit) continue
      return { o, s }
    }
    throw new Error('no hit found')
  }
  it('a non-magical melee hit does no damage while a Flameguard model touches Pyrrhus', () => {
    const { o, s } = hit('is-a', true)
    expect(shieldedByFlameguard(s, bundle, 'A:e2')).toBe(true)
    expect(evs(o.events, 'DamageRolled')[0]!.points).toBe(0)
    expect(o.state.models['A:e2']!.damage).toMatchObject({ filled: 0 })
  })
  it('the same hit hurts him when he stands alone', () => {
    const { o, s } = hit('is-b', false)
    expect(shieldedByFlameguard(s, bundle, 'A:e2')).toBe(false)
    expect(evs(o.events, 'DamageRolled')[0]!.points).toBeGreaterThan(0)
  })
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
      s = park(s, ['A:e2', 'B:e1'])
      s = place(s, 'A:e2', { x: 0, z: 0 })
      s = place(s, 'B:e1', { x: 0, z: 2 })
      let o = openCombat(asOut(s), 'A:e2', 'melee')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e2', weaponId: 'men.w.pyrrhus-spear', targetId: 'B:e1', additional: false })
      o = settle(o)
      const r = evs(o.events, 'AttackResolved')[0]!
      if (!r.hit) continue
      const fire = o.state.models['B:e1']!.conditions.includes('fire')
      if (r.crit) { crit = true; expect(fire).toBe(true) } else { plain = true; expect(fire).toBe(false) }
    }
    expect(crit && plain).toBe(true)
  })

  it('FAC-MEN-011 Chain Weapon: the Blazing Star ignores the Buckler ARM bonus (POW 17 +1 on the roll vs Deuce)', () => {
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
      expect(flatOf(d)).toBe(18)
    }
    expect(seen).toBe(true)
  })
})

describe('FAC-MEN Incite, Stir the Blood', () => {
  const withEffect = (s: GameState, sourceId: string, name: string, targetIds: string[], casterId: string) =>
    applyEffect(s, { sourceId, name, owner: 'A', casterId, targetIds, mods: [], duration: 'turn' }).state

  it('FAC-MEN-015 Incite: +2 on attack and damage rolls against enemies within 10" of Feora, not beyond', () => {
    let near = false
    for (let i = 0; i < 80 && !near; i++) {
      let s = startMen('inc' + i)
      s = park(s, ['A:L', 'A:e2', 'B:e1'])
      s = place(s, 'A:L', { x: 0, z: 0 })
      s = place(s, 'A:e2', { x: 2, z: 0 })
      s = place(s, 'B:e1', { x: 2, z: 2.5 })
      s = withEffect(s, 'men.s.incite', 'Incite', ['A:L'], 'A:L')
      let o = openCombat(asOut(s), 'A:e2', 'melee')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e2', weaponId: 'men.w.pyrrhus-spear', targetId: 'B:e1', additional: false })
      expect(evs(o.events, 'AttackMeasured')[0]!.mods.some((m) => m.source === 'men.s.incite' && m.value === 2)).toBe(true)
      o = settle(o)
      const d = damageRolls(o.events)[0]
      if (!d) continue
      near = true
      expect(flatOf(d)).toBe(12) // POW 10 + Incite
    }
    expect(near).toBe(true)
    let s = startMen('inc-far')
    s = park(s, ['A:L', 'A:e2', 'B:e1'])
    s = place(s, 'A:L', { x: -14, z: -14 })
    s = place(s, 'A:e2', { x: 2, z: 0 })
    s = place(s, 'B:e1', { x: 2, z: 2.5 })
    s = withEffect(s, 'men.s.incite', 'Incite', ['A:L'], 'A:L')
    let o = openCombat(asOut(s), 'A:e2', 'melee')
    o = send(o, { type: 'chooseAttack', modelId: 'A:e2', weaponId: 'men.w.pyrrhus-spear', targetId: 'B:e1', additional: false })
    expect(evs(o.events, 'AttackMeasured')[0]!.mods.some((m) => m.source === 'men.s.incite')).toBe(false)
  })

  it('FAC-MEN-009 Stir the Blood: +2 on the next melee damage roll, then it is spent', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = startMen('stir' + i)
      s = park(s, ['A:e2', 'A:u3.1', 'B:e1'])
      s = place(s, 'A:u3.1', { x: 0, z: 0 })
      s = place(s, 'B:e1', { x: 0, z: 2 })
      s = withEffect(s, 'men.a.stir-the-blood', 'Stir the Blood', ['A:u3.1'], 'A:e2')
      let o = send(asOut(s), { type: 'chooseActivation', activate: 'A:u3' })
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:u3.1' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'A:u3.1', choice: 'melee' })
      o = send(o, { type: 'chooseAttack', modelId: 'A:u3.1', weaponId: 'men.w.flame-spear', targetId: 'B:e1', additional: false })
      o = settle(o)
      const d = damageRolls(o.events)[0]
      if (!d) continue
      seen = true
      expect(flatOf(d)).toBe(12)
      expect(o.state.effects.some((e) => e.sourceId === 'men.a.stir-the-blood')).toBe(false)
    }
    expect(seen).toBe(true)
  })
})

describe('FAC-MEN-013 Fire Step, FAC-MEN-014 Hex Hammer, FAC-MEN-016 feat', () => {
  it('FAC-MEN-013 Fire Step: enemies within 2" take fire damage and Feora is placed within 2"; a second cast the same activation does nothing', () => {
    let s = startMen('fs')
    s = park(s, ['A:L', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 1.5, z: 0 })
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.fire-step' })
    const hurt = evs(o.events, 'DamageApplied').filter((e) => e.targetId === 'B:e1')
    expect(hurt.length).toBe(1)
    expect(hurt[0]!.points).toBeGreaterThan(0) // 2d6 + 13 against ARM 12 always hurts
    expect(hurt[0]!.damageTypes).toEqual(['fire'])
    const moved = evs(o.events, 'ModelMoved')[0]!
    expect(moved.modelId).toBe('A:L')
    expect(moved.distance).toBeLessThanOrEqual(2 + 1e-9)
    const pos = o.state.models['A:L']!.pos
    expect(o.state.models['B:e1']!.life === 'active' || o.state.models['B:e1']!.life === 'destroyed').toBe(true)
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.fire-step' })
    expect(evs(o.events, 'DamageApplied').length).toBe(0)
    expect(o.state.models['A:L']!.pos).toEqual(pos)
  })

  it('FAC-MEN-014 Hex Hammer: an enemy declaring a spell inside Feora\'s CTRL takes d3 first; outside it does not', () => {
    let s = startMen('hh', 'B')
    s = park(s, ['A:L', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:L', { x: 5, z: 0 })
    s = applyEffect(s, { sourceId: 'men.s.hex-hammer', name: 'Hex Hammer', owner: 'A', casterId: 'A:L', targetIds: ['A:L'], mods: [], duration: 'round' }).state
    const r = runCodeEffect(s, bundle, 'hexHammer', { point: 'spell.declare', selfId: 'B:L', activePlayer: 'B' })
    const dmg = r.state.models['B:L']!.damage as { filled: number }
    expect(dmg.filled).toBeGreaterThanOrEqual(1)
    expect(dmg.filled).toBeLessThanOrEqual(3)
    const far = place(s, 'B:L', { x: 15, z: 0 })
    const r2 = runCodeEffect(far, bundle, 'hexHammer', { point: 'spell.declare', selfId: 'B:L', activePlayer: 'B' })
    expect((r2.state.models['B:L']!.damage as { filled: number }).filled).toBe(0)
    // cast time: the marker does nothing
    const r3 = runCodeEffect(s, bundle, 'hexHammer', { point: 'spell.cast', selfId: 'A:L', activePlayer: 'A' })
    expect(r3.events).toEqual([])
  })
  // Hex Hammer at spell.declare in play: CORE-031 (core-m9.test.ts)

  it('FAC-MEN-016 Blessing of the First Gift: every enemy in CTRL takes fire damage and catches fire; models outside do not', () => {
    let s = startMen('feat')
    s = park(s, ['A:L', 'B:e0', 'B:e1', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 5, z: 0 })
    s = place(s, 'B:e1', { x: 0, z: 5 })
    s = place(s, 'B:L', { x: 20, z: 0 })
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'useFeat', casterId: 'A:L', featId: 'men.f.blessing-of-the-first-gift' })
    expect(o.state.models['B:e0']!.conditions).toContain('fire') // Deuce survives and burns
    const hurt = evs(o.events, 'DamageApplied').map((e) => e.targetId).sort()
    expect(hurt).toEqual(['B:e0', 'B:e1']) // Falk too (he may die first); Caine is outside CTRL
    const falk = evs(o.events, 'DamageApplied').find((e) => e.targetId === 'B:e1')!
    expect(falk.points).toBeGreaterThan(0) // 2d6 + 12 vs ARM 12 always hurts
    expect(o.state.models['B:L']!.conditions).not.toContain('fire')
    expect(o.state.models['A:L']!.featUsed).toBe(true)
  })
})

describe('FAC-MEN-012 Convection, FAC-MEN-007/008 Battle Plan', () => {
  it('FAC-MEN-012 Convection: destroying a living enemy gives a warjack in CTRL a focus (loop seeds for a kill)', () => {
    let seen = false
    for (let i = 0; i < 120 && !seen; i++) {
      let s = startMen('conv' + i)
      s = park(s, ['A:L', 'A:e0', 'B:e1'])
      s = place(s, 'A:L', { x: 0, z: 0 })
      s = place(s, 'A:e0', { x: 4, z: -4 })
      s = place(s, 'B:e1', { x: 0, z: 6 })
      s = withModel(s, 'B:e1', { damage: { track: 'single', filled: 7, boxes: 8 } })
      let o = choose(asOut(s), 'A:L')
      const r = trySend(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.convection', targetId: 'B:e1' })
      if (!r || 'rejection' in r) throw new Error('convection rejected: ' + JSON.stringify(r))
      o = r
      o = settle(o)
      if (o.state.models['B:e1']!.life !== 'destroyed') continue
      seen = true
      expect(o.state.models['A:e0']!.focus).toBe(1)
    }
    expect(seen).toBe(true)
  })

  it('FAC-MEN-007 Battle Plan: at the end of Pyrrhus\'s activation a nearby Menoth model gets Stir the Blood', () => {
    let s = startMen('plan')
    s = park(s, ['A:e2', 'A:u3.1', 'A:u3.2'])
    s = place(s, 'A:e2', { x: 0, z: 0 })
    s = place(s, 'A:u3.1', { x: 3, z: 0 })
    s = place(s, 'A:u3.2', { x: 4, z: 1 })
    let o = choose(asOut(s), 'A:e2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e2' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e2', choice: 'forfeit' })
    // the zero-length move request that keeps the plan's state is answered by staying put
    while (o.pending.kind === 'moveModel') o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>)
    const e = o.state.effects.find((x) => x.sourceId === 'men.a.stir-the-blood')
    expect(e).toBeDefined()
    expect(e!.targetIds).toContain('A:u3.1')
    expect(e!.targetIds).toContain('A:u3.2')
    expect(e!.targetIds.length).toBe(5) // the whole unit is chosen, because a member is within 5"
  })
  // Fight to the Last grants Tough and Precision Strike passes friends: CORE-030 and CORE-075
})
