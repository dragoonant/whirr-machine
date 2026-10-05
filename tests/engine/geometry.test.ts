import { describe, expect, it } from 'vitest'
import {
  baseRadius, edgeDistance, findPlacementNear, isLegalPlacement, leastDisturbance, placeWithin, sweepStraight, validateAdvancePath,
} from '../../src/engine/geometry'
import { completelyWithin, within } from '../../src/engine/measure'
import { mdl, ter, world } from './geometryHelpers'

describe('geometry and measurement', () => {
  it('LOS-001 edge distance is base edge to base edge, exactly-d counts as within', () => {
    const r = baseRadius(30)
    expect(edgeDistance({ x: 0, z: 0 }, 30, { x: 2 * r + 3, z: 0 }, 30)).toBeCloseTo(3, 9)
    const a = mdl('a', 0, 0), b = mdl('b', 2 * r + 3, 0)
    expect(within(a, b, 3)).toBe(true)
    expect(within(a, b, 2.99)).toBe(false)
    expect(completelyWithin(b, a, 3 + 2 * r)).toBe(true)
    expect(completelyWithin(b, a, 3 + 2 * r - 0.1)).toBe(false)
  })

  it('TERR-001 a sweep stops at first contact with an equal-or-larger base', () => {
    const s = world([mdl('m', 0, 0), mdl('t', 10, 0)])
    const r = sweepStraight(s, 'm', { x: 1, z: 0 }, 20)
    expect(r.stoppedBy).toEqual({ kind: 'model', id: 't' })
    expect(r.travelled).toBeCloseTo(10 - 2 * baseRadius(30), 6)
  })

  it('TERR-002 slam passes through smaller bases but stops at larger ones', () => {
    const s = world([mdl('m', 0, 0, { base: 50 }), mdl('small', 4, 0), mdl('big', 10, 0, { base: 80 })])
    const r = sweepStraight(s, 'm', { x: 1, z: 0 }, 20, { passThrough: 'smaller' })
    expect(r.passedThrough).toEqual(['small'])
    expect(r.contacted).toBe('big')
  })

  it('TERR-003 charge stops on an obstacle; Pathfinder runs over it; obstructions always stop', () => {
    const wall = ter('w', 'obstacle', 6, 0, 1, 10, 0.75)
    const s = world([mdl('m', 0, 0)], [wall])
    expect(sweepStraight(s, 'm', { x: 1, z: 0 }, 12).stoppedBy.kind).toBe('obstacle')
    expect(sweepStraight(s, 'm', { x: 1, z: 0 }, 12, { obstacles: 'ignore' }).stoppedBy.kind).toBe('maxDist')
    const bld = world([mdl('m', 0, 0)], [ter('b', 'building', 6, 0, 4, 4, 3)])
    expect(sweepStraight(bld, 'm', { x: 1, z: 0 }, 12, { obstacles: 'ignore' }).stoppedBy.kind).toBe('obstruction')
  })

  it('TERR-004 a sweep stops at the table edge without an extra stop', () => {
    const s = world([mdl('m', 0, 0)])
    const r = sweepStraight(s, 'm', { x: 1, z: 0 }, 40)
    expect(r.stoppedBy.kind).toBe('edge')
    expect(r.end.x).toBeCloseTo(18 - baseRadius(30), 6)
  })

  it('TERR-005 advance path: rough costs 2", obstacle needs room to clear, bases block', () => {
    const rough = world([mdl('m', 0, 0)], [ter('r', 'rough', 3, 0, 2, 4, 0)])
    expect(validateAdvancePath(rough, 'm', [{ x: 6, z: 0 }], 6).ok).toBe(false)
    expect(validateAdvancePath(rough, 'm', [{ x: 4, z: 0 }], 6).ok).toBe(true)
    const wall = world([mdl('m', 0, 0)], [ter('w', 'obstacle', 3, 0, 0.5, 6, 0.75)])
    expect(validateAdvancePath(wall, 'm', [{ x: 5, z: 0 }], 6).ok).toBe(true)
    expect(validateAdvancePath(wall, 'm', [{ x: 3, z: 0 }], 6).ok).toBe(false)
    const blocked = world([mdl('m', 0, 0), mdl('o', 3, 0)])
    expect(validateAdvancePath(blocked, 'm', [{ x: 6, z: 0 }], 8).code).toBe('E_PATH_BLOCKED')
  })

  it('TERR-006 trooper placement within 2" is legal and avoids terrain and bases', () => {
    const s = world([mdl('lead', 0, 0), mdl('t1', 8, 8), mdl('t2', 8, 9)], [ter('b', 'building', 1.5, 0, 1, 1, 3)])
    const { placed, failed } = placeWithin(s, 'lead', ['t1', 't2'], { dist: 2 })
    expect(failed).toEqual([])
    for (const id of ['t1', 't2']) {
      const p = placed[id]!
      expect(within(mdl('x', p.x, p.z), mdl('lead', 0, 0), 2)).toBe(true)
      expect(isLegalPlacement(s, id, p, 30, { ignoreIds: ['t1', 't2'] }).ok).toBe(true)
    }
    const a = placed['t1']!, b = placed['t2']!
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(2 * baseRadius(30) - 1e-6)
    expect(findPlacementNear(s, 't1', { x: 1.5, z: 0 })).not.toBeNull()
  })

  it('TERR-007 least disturbance moves the other model, or the mover if it is larger', () => {
    const s = world([mdl('m', 0, 0), mdl('o', 0.5, 0)])
    const r = leastDisturbance(s, 'm')
    expect(r.moverMoved).toBe(false)
    const p = r.moves['o']!
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(2 * baseRadius(30) - 1e-6)
    const s2 = world([mdl('m', 0, 0), mdl('big', 0.5, 0, { base: 50 })])
    expect(leastDisturbance(s2, 'm').moverMoved).toBe(true)
  })
})
