import { describe, expect, it } from 'vitest'
import type { GameState } from '../../src/engine/index'
import { facingYaw, turnToward } from '../../src/client/figures/facing'

const model = (owner: 'A' | 'B', x: number, z: number, life = 'active') => ({ owner, pos: { x, z }, life, offTable: false })
const state = (models: Record<string, unknown>, edgeA = 'south', edgeB = 'north') =>
  ({ models, players: { A: { edge: edgeA }, B: { edge: edgeB } } }) as unknown as GameState

describe('figure facing', () => {
  it('faces the nearest living enemy (+Z front)', () => {
    const s = state({ a: model('A', 0, 10), b: model('B', 0, -10), c: model('B', 20, 10, 'destroyed') })
    expect(facingYaw(s, 'a', { x: 0, z: 10 })).toBeCloseTo(Math.PI) // enemy is toward -Z
    expect(Math.abs(facingYaw(s, 'b', { x: 0, z: -10 })!)).toBeCloseTo(0) // enemy is toward +Z
  })
  it('falls back to facing across the table from its own edge, whichever seat it is', () => {
    const s = state({ a: model('A', 0, 15) }, 'south')
    expect(facingYaw(s, 'a', { x: 0, z: 15 })).toBeCloseTo(Math.PI)
    const s2 = state({ a: model('A', 0, -15) }, 'north')
    expect(facingYaw(s2, 'a', { x: 0, z: -15 })).toBeCloseTo(0)
  })
  it('turns along the shorter arc', () => {
    expect(turnToward(3.0, -3.0, 0.1)).toBeGreaterThan(3.0)
    expect(turnToward(0, 0.05, 0.1)).toBe(0.05)
  })
})
