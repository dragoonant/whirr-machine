import { describe, expect, it } from 'vitest'
import { seedRng } from '../../src/engine/rng'
import { engagedBy, movementOptions, placeUnit, push, resolveAdvance, resolveCharge, resolveFall, resolveTrampleMove, resolveUnitMove, slideAway } from '../../src/engine/movement'
import { resolvePowerAttack, resolveTrampleAttacks } from '../../src/engine/power-attacks'
import type { GameState, ModelState } from '../../src/engine/types'
import { mdl, ter, world } from './geometryHelpers'

const look = { arm: () => 14 }
const info = { spd: 6, hasMelee: true }
const mk = (models: ModelState[], terrain = [] as ReturnType<typeof ter>[]): GameState => ({ ...world(models, terrain), seed: 's', rng: seedRng('s'), rollSeq: 0 } as GameState)
const enemy = (id: string, x: number, z: number, o: Partial<ModelState> = {}) => mdl(id, x, z, { owner: 'B', ...o })

describe('MOVE', () => {
  it('MOVE-001 options: engaged blocks run/charge/slam; war-engine run costs focus', () => {
    const s = mk([mdl('a', 0, 0, { type: 'warEngine', base: 50, focus: 0 }), enemy('e', 0, 2.5, { base: 50 })])
    const o = Object.fromEntries(movementOptions(s, 'a', { ...info, warEngine: true }).map((x) => [x.option, x]))
    expect(o.advance!.allowed).toBe(true)
    expect(o.run!.allowed).toBe(false)
    expect(o.charge!.allowed).toBe(false)
    const free = mk([mdl('a', 0, 0, { type: 'warEngine', base: 50, focus: 1 })])
    const f = Object.fromEntries(movementOptions(free, 'a', { ...info, warEngine: true }).map((x) => [x.option, x]))
    expect(f.run!.maxDist).toBe(11)
    expect(f.run!.focusCost).toBe(1)
    expect(f.charge!.focusCost).toBe(1)
  })
  it('MOVE-002 advance: too far rejected; rough terrain costs 2"', () => {
    const s = mk([mdl('a', 0, 0)])
    expect(resolveAdvance(s, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 7, z: 0 }] }).ok).toBe(false)
    const ok = resolveAdvance(s, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 6, z: 0 }] })
    expect(ok.ok && ok.state.models.a!.pos.x).toBe(6)
    const rough = mk([mdl('a', 0, 0)], [ter('r', 'rough', 3, 0, 2, 4, 0)])
    expect(resolveAdvance(rough, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 6, z: 0 }] }).ok).toBe(false)
    expect(resolveAdvance(rough, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 4, z: 0 }] }).ok).toBe(true)
  })
  it('MOVE-003 disengage forfeits the combat action; run ends activation', () => {
    const s = mk([mdl('a', 0, 0), enemy('e', 0, 1.5)])
    expect(engagedBy(s, 'a')).toEqual(['e'])
    const r = resolveAdvance(s, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: -4, z: 0 }] })
    expect(r.ok && r.forfeitCombat).toBe(true)
    const un = resolveAdvance(s, { modelId: 'a', kind: 'advance', info: { ...info, unstoppable: true }, waypoints: [{ x: -4, z: 0 }] })
    expect(un.ok && un.forfeitCombat).toBe(false)
    const run = resolveAdvance(mk([mdl('a', 0, 0)]), { modelId: 'a', kind: 'run', info, waypoints: [{ x: 11, z: 0 }] })
    expect(run.ok && run.endsActivation && run.forfeitCombat).toBe(true)
  })
  it('MOVE-004 obstacle: cannot stop on it, can clear it with movement left', () => {
    const s = mk([mdl('a', 0, 0)], [ter('o', 'obstacle', 3, 0, 0.5, 6, 0.5)])
    expect(resolveAdvance(s, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 3, z: 0 }] }).ok).toBe(false)
    expect(resolveAdvance(s, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 5, z: 0 }] }).ok).toBe(true)
  })
})

describe('CHG', () => {
  it('CHG-001 charge success gives a charge attack at >= 3"; failure ends the activation', () => {
    const s = mk([mdl('a', 0, 0), enemy('e', 0, 7)])
    const r = resolveCharge(s, { modelId: 'a', targetId: 'e', info })
    expect(r.ok && r.success && r.chargeAttack).toBe(true)
    const far = resolveCharge(mk([mdl('a', 0, 0), enemy('e', 0, 14)]), { modelId: 'a', targetId: 'e', info })
    expect(far.ok && !far.success && far.endsActivation).toBe(true)
    const near = resolveCharge(mk([mdl('a', 0, 0), enemy('e', 0, 2.5)]), { modelId: 'a', targetId: 'e', info })
    expect(near.ok && near.success && !near.chargeAttack).toBe(true)
  })
  it('CHG-002 charge stops on an obstacle and fails; engaged cannot charge', () => {
    const s = mk([mdl('a', 0, 0), enemy('e', 0, 8)], [ter('o', 'obstacle', 0, 4, 6, 0.5, 0.5)])
    const r = resolveCharge(s, { modelId: 'a', targetId: 'e', info })
    expect(r.ok && !r.success).toBe(true)
    const eng = resolveCharge(mk([mdl('a', 0, 0), enemy('e', 0, 1.5), enemy('f', 0, 9)]), { modelId: 'a', targetId: 'f', info })
    expect(eng.ok).toBe(false)
  })
  it('CHG-003 unit move: lead trooper moves, others placed within 2"', () => {
    const base = mk([mdl('t1', 0, 0, { unitId: 'u' }), mdl('t2', 1.5, 0, { unitId: 'u' }), mdl('t3', 3, 0, { unitId: 'u' })])
    const s = { ...base, units: { u: { id: 'u', profileId: 'x', owner: 'A', troopers: ['t1', 't2', 't3'], attachments: [], activated: false } } } as GameState
    const r = resolveUnitMove(s, 'u', 't1', info, (st) => resolveAdvance(st, { modelId: 't1', kind: 'advance', info, waypoints: [{ x: 0, z: 6 }] }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.models.t1!.pos.z).toBe(6)
    for (const id of ['t2', 't3']) {
      const m = r.state.models[id]!
      expect(Math.hypot(m.pos.x, m.pos.z - 6) - 2 * 0.5906).toBeLessThanOrEqual(2 + 1e-6)
    }
    const eng = { ...s, models: { ...s.models, e: enemy('e', 4.5, 0) } } as GameState
    const p = placeUnit(eng, 'u', 't1', { engagedBefore: { t3: ['e'] } })
    expect(Array.isArray(p.forfeit)).toBe(true)
  })
})

describe('PWR', () => {
  it('PWR-001 push stops on contact; slam passes through smaller, collateral knocks them down', () => {
    const s = mk([mdl('a', 0, 0), enemy('b', 0, 2, { base: 40 })])
    const p = push(s, 'a', { x: 0, z: 5 }, 4, look)
    expect(p.travelled).toBeGreaterThanOrEqual(0)
    const sl = mk([enemy('big', 0, 0, { base: 50 }), mdl('small', 0, 3)])
    const r = slideAway(sl, 'big', { x: 0, z: -3 }, 6, 'slam', look)
    expect(r.contacted).toContain('small')
    expect(r.state.models.small!.conditions).toContain('knockedDown')
  })
  it('PWR-002 slam into an equal base stops it; table edge is not an obstacle', () => {
    const s = mk([enemy('t', 0, 0), mdl('w', 0, 4)])
    const r = slideAway(s, 't', { x: 0, z: -2 }, 6, 'slam', look)
    expect(r.stoppedAgainst).toBe(true)
    const e = mk([enemy('t', 0, 16)])
    const r2 = slideAway(e, 't', { x: 0, z: 10 }, 6, 'slam', look)
    expect(r2.stoppedAgainst).toBe(false)
    expect(r2.state.models.t!.pos.z).toBeLessThan(18)
  })
  it('PWR-003 headbutt and throw resolve end to end with rolls and knockdown', () => {
    let hits = 0
    for (let i = 0; i < 12; i++) {
      const base = { ...mk([mdl('a', 0, 0, { base: 50, focus: 2 }), enemy('t', 0, 1.9, { base: 40 })]), seed: 'x' + i, rng: seedRng('x' + i) } as GameState
      const r = resolvePowerAttack(base, { kind: 'headbutt', attackerId: 'a', targetId: 't', mat: 20, def: 10, look, warEngine: true })
      expect(r.ok).toBe(true)
      expect(r.state.models.a!.focus).toBe(1)
      if (r.hit) { hits++; expect(r.state.models.t!.conditions).toContain('knockedDown') }
    }
    expect(hits).toBeGreaterThan(0)
    const big = mk([mdl('a', 0, 0, { base: 40 }), enemy('t', 0, 1.9, { base: 50 })])
    expect(resolvePowerAttack(big, { kind: 'throw', attackerId: 'a', targetId: 't', mat: 9, def: 9, look }).code).toBe('E_POWER_ATTACK')
    const th = mk([mdl('a', 0, 0, { base: 50 }), enemy('t', 0, 1.9, { base: 40 })])
    const r = resolvePowerAttack(th, { kind: 'throw', attackerId: 'a', targetId: 't', mat: 30, def: 5, look })
    expect(r.hit && r.moved).toBeTruthy()
    expect(r.state.models.t!.pos.z).toBeGreaterThan(1.9)
  })
  it('PWR-004 slam under 3 inches has no movement; trample rolls per small model', () => {
    const s = mk([mdl('a', 0, 0, { base: 50 }), enemy('t', 0, 1.9, { base: 40 })])
    const r = resolvePowerAttack(s, { kind: 'slam', attackerId: 'a', targetId: 't', mat: 30, def: 5, look, movedDistance: 2 })
    expect(r.hit && !r.moved).toBe(true)
    expect(r.state.models.t!.conditions).not.toContain('knockedDown')
    const tr = mk([mdl('a', 0, 0, { base: 50 }), enemy('s1', 0, 4), enemy('s2', 0, 6.5), enemy('m', 0, 12, { base: 40 })])
    const mv = resolveTrampleMove(tr, { modelId: 'a', dir: { x: 0, z: 1 }, info })
    expect(mv.ok).toBe(true)
    if (!mv.ok) return
    expect([...mv.trampled].sort()).toEqual(['s1', 's2'])
    const att = resolveTrampleAttacks(mv.state, { attackerId: 'a', move: mv, mat: 30, def: () => 5, look })
    expect(att.hits.length).toBe(2)
  })
  it('PWR-005 fall damage dice scale', () => {
    const s = mk([mdl('a', 0, 0)])
    const f = resolveFall(s, 'a', 4, look)
    const roll = f.events.find((e) => e.type === 'DiceRolled') as { dice: number[] }
    expect(roll.dice).toHaveLength(3)
    expect(f.state.models.a!.conditions).toContain('knockedDown')
    expect(resolveFall(s, 'a', 0.5, look).events).toHaveLength(0)
  })
})
