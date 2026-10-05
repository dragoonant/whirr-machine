import { describe, expect, it } from 'vitest'
import { defModifiers, losReport } from '../../src/engine/los'
import { mdl, ter, world } from './geometryHelpers'

const base = { baseDef: 12, originId: 'a' }

describe('LOS and DEF modifiers', () => {
  it('LOS-010 clear in the open; a big enough model in the way blocks, a smaller one does not', () => {
    expect(losReport(world([mdl('a', 0, 0), mdl('b', 10, 0, { owner: 'B' })]), 'a', 'b').visible).toBe(true)
    const wide = world([mdl('a', 0, 0), mdl('m', 5, 0, { base: 120 }), mdl('b', 10, 0, { owner: 'B', base: 120 })])
    expect(losReport(wide, 'a', 'b').visible).toBe(false)
    expect(losReport(wide, 'a', 'b').reasons).toContain('model')
    const small = world([mdl('a', 0, 0, { base: 50 }), mdl('m', 5, 0), mdl('b', 10, 0, { owner: 'B', base: 50 })])
    expect(losReport(small, 'a', 'b').visible).toBe(true)
  })

  it('LOS-011 a tall building blocks and the verdict says why; a low wall does not', () => {
    const s = world([mdl('a', 0, 0), mdl('b', 12, 0, { owner: 'B' })], [ter('bld', 'building', 6, 0, 3, 12, 4)])
    const r = losReport(s, 'a', 'b')
    expect(r.visible).toBe(false)
    expect(r.reasons).toContain('terrain')
    expect(r.blockers).toContain('bld')
    expect(r.why).toMatch(/terrain/)
    const wall = world([mdl('a', 0, 0), mdl('b', 12, 0, { owner: 'B' })], [ter('w', 'obstacle', 6, 0, 0.5, 12, 0.75)])
    expect(losReport(wall, 'a', 'b').visible).toBe(true)
  })

  it('LOS-012 forest blocks when both ends are outside, allows 3" when one end is inside', () => {
    const forest = ter('f', 'forest', 6, 0, 2, 20, 4)
    expect(losReport(world([mdl('a', 0, 0), mdl('b', 12, 0, { owner: 'B' })], [forest]), 'a', 'b').reasons).toContain('forestDepth')
    const into = ter('f2', 'forest', 10, 0, 4, 20, 4)
    expect(losReport(world([mdl('a', 0, 0), mdl('b', 10, 0, { owner: 'B' })], [into]), 'a', 'b').visible).toBe(true)
    expect(losReport(world([mdl('a', 0, 0), mdl('b', 12, 0, { owner: 'B', base: 120 })], [forest]), 'a', 'b').visible).toBe(true)
  })

  it('LOS-013 clouds block unless an end is in them or the target is huge; flares never block', () => {
    const cloud = { id: 'c', pos: { x: 6, z: 0 }, diameter: 3, owner: 'A' as const }
    const mk = (extra: object = {}, tb: 30 | 120 = 30) =>
      world([mdl('a', 0, 0), mdl('b', 12, 0, { owner: 'B', base: tb })], [], [{ ...cloud, ...extra }])
    expect(losReport(mk(), 'a', 'b').reasons).toContain('cloud')
    expect(losReport(mk({ kind: 'flare' }), 'a', 'b').visible).toBe(true)
    expect(losReport(mk({}, 120), 'a', 'b').visible).toBe(true)
    expect(losReport(world([mdl('a', 5.5, 0), mdl('b', 12, 0, { owner: 'B' })], [], [cloud]), 'a', 'b').visible).toBe(true)
  })

  it('LOS-014 elevation: an elevated viewer sees over a nearby model', () => {
    const flat = world([mdl('a', 0, 0), mdl('m', 5, 0, { base: 120 }), mdl('b', 12, 0, { owner: 'B' })])
    expect(losReport(flat, 'a', 'b').visible).toBe(false)
    const high = world([mdl('a', 0, 0, { elev: 3 }), mdl('m', 5, 0, { base: 120 }), mdl('b', 12, 0, { owner: 'B' })])
    expect(losReport(high, 'a', 'b').visible).toBe(true)
  })

  it('TERR-010 DEF modifiers: cover 4, concealment 2, spray ignores both, elevation +2, melee +4', () => {
    const inRubble = world([mdl('a', 0, 0), mdl('b', 10, 0, { owner: 'B' })], [ter('r', 'rubble', 10, 0, 4, 4, 0)])
    expect(defModifiers(inRubble, 'b', { ...base, kind: 'ranged' }).def).toBe(16)
    const inForest = world([mdl('a', 0, 0), mdl('b', 10, 0, { owner: 'B' })], [ter('f', 'forest', 10, 0, 4, 4, 4)])
    expect(defModifiers(inForest, 'b', { ...base, kind: 'ranged' }).def).toBe(14)
    expect(defModifiers(inForest, 'b', { ...base, kind: 'spray' }).def).toBe(12)
    const hi = world([mdl('a', 0, 0), mdl('b', 10, 0, { owner: 'B', elev: 2 })])
    expect(defModifiers(hi, 'b', { ...base, kind: 'arcane' }).def).toBe(14)
    const melee = world([mdl('a', 0, 0), mdl('b', 10, 0, { owner: 'B' }), mdl('e', 11.5, 0)])
    expect(defModifiers(melee, 'b', { ...base, kind: 'ranged' }).def).toBe(16)
    expect(defModifiers(melee, 'b', { ...base, kind: 'ranged', ignoreTargetInMelee: true }).def).toBe(12)
  })

  it('TERR-011 knocked down sets base DEF 5 then bonuses add; huge bases get nothing', () => {
    const wall = ter('w', 'obstacle', 9, 0, 0.5, 6, 0.75)
    const down = world([mdl('a', 0, 0), mdl('b', 10, 0, { owner: 'B', conditions: ['knockedDown'] })], [wall])
    const r = defModifiers(down, 'b', { ...base, kind: 'ranged' })
    expect(r.baseDef).toBe(5)
    expect(r.cover).toBe(true)
    expect(r.def).toBe(9)
    const huge = world([mdl('a', 0, 0), mdl('b', 10, 0, { owner: 'B', base: 120 })], [ter('f', 'forest', 10, 0, 12, 12, 4)])
    expect(defModifiers(huge, 'b', { ...base, kind: 'ranged' }).def).toBe(12)
  })
})
