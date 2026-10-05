import { describe, expect, it } from 'vitest'
import { applyDamage, damageDistribution, expectedDamage, healDamage, pKill, resolveDeath, rollDamage } from '../../src/engine/damage'
import type { GameState, ModelState } from '../../src/engine/types'
import { mkState } from './dice-helpers'

const single = (boxes: number, extra: Partial<ModelState> = {}): ModelState =>
  ({ id: 'm', life: 'active', conditions: [], crippled: [], damage: { track: 'single', filled: 0, boxes }, ...extra } as unknown as ModelState)
const withModel = (m: ModelState, seed = 's'): GameState => mkState(seed, { [m.id]: m })
type G = { grids: { cols: boolean[][] }[] }

describe('DMG', () => {
  it('DMG-001 damage roll: resistance removes one die, floor 0, exact distribution', () => {
    expect(rollDamage(mkState('d'), { pow: 5, armor: 99 }).points).toBe(0)
    expect(rollDamage(mkState('d'), { pow: 5, armor: 0, resist: true }).dice).toHaveLength(1)
    const d = damageDistribution({ pow: 5, armor: 12 })
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(pKill(d, 1)).toBeCloseTo(15 / 36)
    expect(expectedDamage(damageDistribution({ pow: 0, armor: 0 }))).toBeCloseTo(7)
  })
  it('DMG-002 single row fills, caps, and disables on the last box; no boxes = 1 point disables', () => {
    let r = applyDamage(withModel(single(3)), 'm', 2)
    expect(r.state.models.m!.life).toBe('active')
    r = applyDamage(r.state, 'm', 5)
    expect(r.state.models.m!.life).toBe('disabled')
    expect((r.state.models.m!.damage as { filled: number }).filled).toBe(3)
    expect(applyDamage(withModel(single(0)), 'm', 1).state.models.m!.life).toBe('disabled')
  })
  const cols = ['LLL', 'LM', 'M', '--', '-', 'R']
  const grid = (): ModelState => ({ ...single(0), damage: { track: 'grid', grids: [{ id: 'main', cols: cols.map(c => [...c].map(() => false)) }] } } as unknown as ModelState)
  const layouts = [{ id: 'main' as const, columns: cols }]
  it('GRID-001 top-down fill, spill to next column, wrap 6 to 1, crippling and restore', () => {
    let r = applyDamage(withModel(grid()), 'm', 3, { column: 2, layouts })
    const g = (r.state.models.m!.damage as G).grids[0]!.cols
    expect(g[1]).toEqual([true, true])
    expect(g[2]).toEqual([true])
    expect(r.state.models.m!.crippled).toEqual(['M'])
    r = applyDamage(r.state, 'm', 1, { column: 6, layouts })
    expect(r.state.models.m!.crippled).toEqual(['M', 'R'])
    r = applyDamage(r.state, 'm', 1, { column: 6, layouts })
    expect((r.state.models.m!.damage as G).grids[0]!.cols[0]![0]).toBe(true)
    const h = healDamage(r.state, 'm', 1, layouts)
    expect(h.state.models.m!.crippled).toEqual(['M', 'R'].filter(x => x !== 'R'))
  })
  it('GRID-002 column is rolled when not chosen; overflow reported', () => {
    const r = applyDamage(withModel(grid()), 'm', 99, { layouts })
    expect(r.events[0]!.type).toBe('DiceRolled')
    expect(r.state.models.m!.life).toBe('disabled')
    const applied = r.events.find(e => e.type === 'DamageApplied') as unknown as { overflow: number }
    expect(applied.overflow).toBe(99 - 10)
  })
  it('GRID-003 colossal spills to the other grid', () => {
    const half = (id: string) => ({ id, cols: [[false], [false], [false], [false], [false], [false]] })
    const m = { ...single(0), damage: { track: 'grid', grids: [half('left'), half('right')] } } as unknown as ModelState
    const r = applyDamage(withModel(m), 'm', 8, { column: 1, gridId: 'left' })
    const gs = (r.state.models.m!.damage as G).grids
    expect(gs[0]!.cols.flat().every(Boolean)).toBe(true)
    expect(gs[1]!.cols.flat().filter(Boolean)).toHaveLength(2)
  })
  it('DMG-003 disabled, boxed, destroyed; Tough survives on 5-6 knocked down with 1 box healed', () => {
    let s = applyDamage(withModel(single(2)), 'm', 2).state
    const dead = resolveDeath(s, 'm')
    expect(dead.outcome).toBe('destroyed')
    expect(dead.events.filter(e => e.type === 'LifeStateChanged').map(e => (e as unknown as { to: string }).to)).toEqual(['boxed', 'destroyed'])
    let survived = 0, died = 0
    for (let i = 0; i < 60; i++) {
      const st = applyDamage(withModel(single(2), 't' + i), 'm', 2).state
      const r = resolveDeath(st, 'm', { tough: true })
      if (r.outcome === 'alive') {
        survived++
        const m = r.state.models.m!
        expect(m.life).toBe('active')
        expect(m.conditions).toContain('knockedDown')
        expect((m.damage as { filled: number }).filled).toBe(1)
      } else died++
    }
    expect(survived).toBeGreaterThan(0)
    expect(died).toBeGreaterThan(0)
    s = { ...s, models: { m: { ...s.models.m!, conditions: ['knockedDown'] } } } as GameState
    expect(resolveDeath(s, 'm', { tough: true }).events.some(e => e.type === 'DiceRolled')).toBe(false)
  })
  it('DMG-004 deny Tough and RFP skip destroyed', () => {
    const s = applyDamage(withModel(single(1)), 'm', 1).state
    const r = resolveDeath(s, 'm', { tough: true, denyTough: true, removeFromPlay: true })
    expect(r.outcome).toBe('removed')
    expect(r.state.models.m!.life).toBe('boxed')
    expect(r.events.some(e => e.type === 'DiceRolled')).toBe(false)
  })
})
