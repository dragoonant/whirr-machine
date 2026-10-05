import { describe, expect, it } from 'vitest'
import { hitProbability, rollAttack } from '../../src/engine/attack'
import { computeStat, diceCount, pAttackHit, rollNd6, sumDistribution } from '../../src/engine/dice'
import { mkState } from './dice-helpers'

describe('DICE', () => {
  it('DICE-001 rolls are deterministic per seed and advance rollSeq', () => {
    const a = rollNd6(mkState('x'), 3, 'other'), b = rollNd6(mkState('x'), 3, 'other')
    expect(a.dice).toEqual(b.dice)
    expect(a.state.rollSeq).toBe(1)
    expect(a.dice.every(d => d >= 1 && d <= 6)).toBe(true)
  })
  it('DICE-002 sum distribution is exact', () => {
    const d = sumDistribution(2)
    expect(d[7]).toBeCloseTo(6 / 36)
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('DICE-003 hit chance: 2d6 vs 7 = 21/36; snake eyes always miss, boxcars hit', () => {
    expect(pAttackHit(2, 0, 7).pHit).toBeCloseTo(21 / 36)
    expect(pAttackHit(2, 20, 7).pHit).toBeCloseTo(35 / 36)
    expect(pAttackHit(2, -20, 30).pHit).toBeCloseTo(1 / 36)
    expect(pAttackHit(1, -20, 30).pHit).toBe(0)
  })
  it('DICE-004 crit = any pair on a hit; boost and removed dice change the count', () => {
    expect(pAttackHit(2, 20, 7).pCrit).toBeCloseTo(5 / 36)
    expect(diceCount({ boost: true, added: 1, removed: 1 })).toBe(3)
    expect(diceCount({ removed: 5 })).toBe(0)
  })
  it('DICE-005 auto-miss beats auto-hit; zero dice miss; auto-hit skips the roll', () => {
    const s = mkState()
    expect(rollAttack(s, { stat: 5, target: 10, autoHit: true, autoMiss: true }).hit).toBe(false)
    expect(rollAttack(s, { stat: 5, target: 10, dice: { removed: 2 } }).hit).toBe(false)
    const r = rollAttack(s, { stat: 5, target: 10, autoHit: true })
    expect(r.hit).toBe(true)
    expect(r.state).toBe(s)
    expect(hitProbability({ stat: 5, target: 10, autoHit: true }).pHit).toBe(1)
  })
  it('DICE-006 rollAttack frequency matches the exact probability', () => {
    let hits = 0
    const N = 4000
    for (let i = 0; i < N; i++) if (rollAttack(mkState('k' + i), { stat: 6, target: 12 }).hit) hits++
    expect(Math.abs(hits / N - hitProbability({ stat: 6, target: 12 }).pHit)).toBeLessThan(0.03)
  })
  it('DICE-007 stat order: lowest set, double, half, bonuses, penalties, floor 0', () => {
    expect(computeStat(undefined, 9, [{ stat: 'DEF', value: 7, mode: 'set' }, { stat: 'DEF', value: 5, mode: 'set' }])).toBe(5)
    expect(computeStat(undefined, 5, [{ stat: 'ARM', value: 2, mode: 'add' }, { stat: 'ARM', value: 0, mode: 'double' }])).toBe(12)
    expect(computeStat(undefined, 3, [{ stat: 'ARM', value: -9, mode: 'add' }])).toBe(0)
  })
})
