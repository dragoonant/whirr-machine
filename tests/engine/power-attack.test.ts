import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { legalActions } from '../../src/engine/index'
import { slamDistance, resolvePowerAttack } from '../../src/engine/power-attacks'
import { seedRng } from '../../src/engine/rng'
import type { GameState, ModelState } from '../../src/engine/types'
import { asOut, choose, place, send, settle, startState, trySend } from './action-helpers'
import { mdl, world } from './geometryHelpers'

type S = GameState
const R = (mm: number) => mm / 25.4 / 2
/** Park every model not in `keep` far away so it cannot engage, block LOS or be trampled. */
function clearAround(s: S, keep: string[]): S {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
const ev = <T extends GameEvent['type']>(events: GameEvent[], t: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === t)
const optionIds = (o: ReturnType<typeof asOut>) => (o.pending.options ?? []).map((x) => x.id)

/** Razor (A:e0, 50 mm, SPD 5, focus 3) at the origin facing a target placed `gap` inches away edge to edge along +z. */
function razorVs(seed: string, targetId: string, gap: number, targetMm = 30): S {
  let s = startState(seed).state
  s = clearAround(s, ['A:e0', targetId])
  s = place(s, 'A:e0', { x: 0, z: 0 }, { focus: 3 })
  s = place(s, targetId, { x: 0, z: R(50) + R(targetMm) + gap })
  return s
}

describe('PWR slam and trample through the activation flow', () => {
  it('PWR-005 slam with 3"+ moved: focus paid at declaration, straight in, the hit slams d6" away, knocks down and damages', () => {
    let seen = false
    for (let i = 0; i < 60 && !seen; i++) {
      const s = razorVs('sl' + i, 'B:e1', 4.5)
      let o = choose(asOut(s), 'A:e0')
      expect(optionIds(o)).toContain('slam')
      o = send(o, { type: 'chooseMovement', option: 'slam', modelId: 'A:e0' })
      expect(o.state.models['A:e0']!.focus).toBe(2)
      expect(o.pending.kind).toBe('chargeTarget')
      expect(o.pending.context.data?.mode).toBe('slam')
      o = send(o, { type: 'chargeTarget', targetId: 'B:e1' })
      expect(o.pending.kind).toBe('moveModel')
      expect(o.pending.constraints?.toward).toBe('B:e1')
      o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>)
      expect(o.pending.kind).toBe('chooseAttack')
      // the slam must be made: the only answer is the slam attack at the declared target
      expect(legalActions(o.state).map((a) => a.type)).toEqual(['powerAttack'])
      const pre = o.state.models['B:e1']!.pos
      o = send(o, { type: 'powerAttack', modelId: 'A:e0', kind: 'slam', targetId: 'B:e1' })
      o = settle(o)
      const res = ev(o.events, 'AttackResolved')[0]!
      if (!res.hit) continue
      seen = true
      const moved = ev(o.events, 'ModelMoved').find((e) => e.modelId === 'B:e1' && e.kind === 'slam')
      expect(moved).toBeTruthy()
      const after = o.state.models['B:e1']
      if (after && after.life === 'active') {
        expect(after.pos.z).toBeGreaterThan(pre.z)
        expect(after.conditions).toContain('knockedDown')
      }
      expect(ev(o.events, 'DiceRolled').some((d) => d.purpose === 'slamDist')).toBe(true)
    }
    expect(seen).toBe(true)
  })

  it('PWR-006 slam with under 3" moved: a hit deals damage only (no slam movement, no knockdown)', () => {
    let seen = false
    for (let i = 0; i < 60 && !seen; i++) {
      const s = razorVs('sl6' + i, 'B:e0', 2.5, 50) // Deuce, 50 mm: moves 1.5"
      let o = choose(asOut(s), 'A:e0')
      o = send(o, { type: 'chooseMovement', option: 'slam', modelId: 'A:e0' })
      o = send(o, { type: 'chargeTarget', targetId: 'B:e0' })
      o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>)
      expect(o.state.activation!.moved).toBeLessThan(3)
      o = send(o, { type: 'powerAttack', modelId: 'A:e0', kind: 'slam', targetId: 'B:e0' })
      o = settle(o)
      if (!ev(o.events, 'AttackResolved')[0]!.hit) continue
      seen = true
      expect(ev(o.events, 'ModelMoved').some((e) => e.modelId === 'B:e0')).toBe(false)
      expect(o.state.models['B:e0']!.conditions).not.toContain('knockedDown')
      expect(ev(o.events, 'DiceRolled').filter((d) => d.purpose === 'damage').length).toBe(1)
    }
    expect(seen).toBe(true)
  })

  it('PWR-007 slam at a larger base: -2 to hit and the slam distance is halved', () => {
    const look = { arm: () => 14 }
    const base = { ...world([mdl('a', 0, 0, { base: 40 }), mdl('t', 0, R(40) + R(50) + 0.5, { owner: 'B', base: 50 })]), seed: 's', rng: seedRng('s'), rollSeq: 0 } as S
    const r = resolvePowerAttack(base, { kind: 'slam', attackerId: 'a', targetId: 't', mat: 6, def: 12, look, movedDistance: 4 })
    const roll = ev(r.events, 'DiceRolled').find((d) => d.purpose === 'attack') as unknown as { mods?: { value: number }[] }
    expect(roll.mods?.some((m) => m.value === -2)).toBe(true)
    expect(slamDistance(5, 40, 50)).toBe(3)
    expect(slamDistance(5, 50, 50)).toBe(5)
    expect(slamDistance(5, 120, 50)).toBe(7)
  })

  it('PWR-008 a slam that does not reach its target fails and ends the activation', () => {
    const s = razorVs('sl8', 'B:e1', 12)
    let o = choose(asOut(s), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'slam', modelId: 'A:e0' })
    o = send(o, { type: 'chargeTarget', targetId: 'B:e1' })
    o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>)
    expect(ev(o.events, 'ActivationEnded')[0]?.reason).toBe('failedSlam')
    expect(o.pending.kind).toBe('chooseActivation')
    expect(o.state.models['A:e0']!.focus).toBe(2) // the focus stays spent
  })

  it('PWR-021 slam declared at a model out of LOS at the start of Normal Movement is rejected; the slam line is straight at the target', () => {
    let s = razorVs('sl21', 'B:e1', 4.5)
    s = place(s, 'B:e0', { x: 0, z: 3 }) // Deuce (50 mm) stands between Razor and Falk (30 mm) and blocks LOS
    let o = choose(asOut(s), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'slam', modelId: 'A:e0' })
    expect(optionIds(o)).not.toContain('B:e1')
    const r = trySend(o, { type: 'chargeTarget', targetId: 'B:e1' })
    expect(r && 'rejection' in r && r.rejection.code).toBe('E_NO_LOS')
    // a clear line: an end point off the line to the target's centre is not a slam
    const s2 = razorVs('sl21b', 'B:e1', 4.5)
    let o2 = choose(asOut(s2), 'A:e0')
    o2 = send(o2, { type: 'chooseMovement', option: 'slam', modelId: 'A:e0' })
    o2 = send(o2, { type: 'chargeTarget', targetId: 'B:e1' })
    const bad = trySend(o2, { type: 'moveModel', modelId: 'A:e0', path: [{ x: 1, z: 3.5 }] })
    expect(bad && 'rejection' in bad && bad.rejection.code).toBe('E_NOT_STRAIGHT')
  })

  it('PWR-015 trample is allowed while engaged (slam, charge and run are not) and leaving melee forfeits nothing', () => {
    const s = razorVs('tr15', 'B:e1', 0.5) // Falk within 1": Razor is engaged
    const o = choose(asOut(s), 'A:e0')
    const ids = optionIds(o)
    expect(ids).toContain('trample')
    expect(ids).not.toContain('slam')
    expect(ids).not.toContain('charge')
    expect(ids).not.toContain('run')
    let t = send(o, { type: 'chooseMovement', option: 'trample', modelId: 'A:e0' })
    expect(t.pending.kind).toBe('moveModel')
    expect(t.pending.constraints?.straightLine).toBe(true)
    t = send(t, { type: 'moveModel', modelId: 'A:e0', path: [{ x: 6, z: 0 }] }) // straight away from Falk
    expect(ev(t.events, 'CombatActionForfeited').length).toBe(0)
    expect(t.state.models['A:e0']!.pos.x).toBeCloseTo(6)
  })

  it('PWR-016 trample through two 30 mm enemies: one attack roll each, then additional melee attacks may follow', () => {
    let s = startState('tr16').state
    s = clearAround(s, ['A:e0', 'B:u2.1', 'B:u2.2'])
    s = place(s, 'A:e0', { x: 0, z: 0 }, { focus: 3 })
    s = place(s, 'B:u2.1', { x: 0, z: 3 })
    s = place(s, 'B:u2.2', { x: 0, z: 5.5 })
    let o = choose(asOut(s), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'trample', modelId: 'A:e0' })
    expect(o.state.models['A:e0']!.focus).toBe(2)
    o = send(o, { type: 'moveModel', modelId: 'A:e0', path: [{ x: 0, z: 8 }] })
    const decl = ev(o.events, 'AttackDeclared')
    expect(decl.map((d) => d.targetId).sort()).toEqual(['B:u2.1', 'B:u2.2'])
    expect(decl.every((d) => d.kind === 'trample')).toBe(true)
    expect(o.state.models['A:e0']!.pos.z).toBeCloseTo(8)
    expect(o.pending.kind).toBe('chooseAttack')
    // the model ended clear of every base, and no ranged attack follows a power attack (R7.4)
    expect((o.pending.options ?? []).every((x) => x.action.type !== 'chooseAttack' || !(x.action as { weaponId: string }).weaponId.includes('cannon'))).toBe(true)
  })

  it('PWR-016b a trample may not end overlapping a small base', () => {
    let s = startState('tr16b').state
    s = clearAround(s, ['A:e0', 'B:u2.1'])
    s = place(s, 'A:e0', { x: 0, z: 0 }, { focus: 3 })
    s = place(s, 'B:u2.1', { x: 0, z: 4 })
    let o = choose(asOut(s), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'trample', modelId: 'A:e0' })
    const bad = trySend(o, { type: 'moveModel', modelId: 'A:e0', path: [{ x: 0, z: 4 }] })
    expect(bad && 'rejection' in bad && bad.rejection.code).toBe('E_BASE_OVERLAP')
  })

  it('PWR-001b a war-engine with no focus is not offered slam or trample', () => {
    let s = razorVs('pf0', 'B:e1', 4.5)
    s = place(s, 'A:e0', { x: 0, z: 0 }, { focus: 0 })
    const o = choose(asOut(s), 'A:e0')
    expect(optionIds(o)).not.toContain('slam')
    expect(optionIds(o)).not.toContain('trample')
  })

  it('PWR-014 throw with the throwing weapon system crippled is rejected', () => {
    let s = startState('th14').state
    s = clearAround(s, ['B:e0', 'A:e1'])
    s = place(s, 'B:e0', { x: 0, z: 0 }, { focus: 3, crippled: ['R'] })
    s = place(s, 'A:e1', { x: 0, z: R(50) + R(40) + 0.5 })
    const asB = asOut({ ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 })
    let o = choose(asB, 'B:e0')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e0' })
    expect(optionIds(o).some((id) => id.includes('throw'))).toBe(false)
    const r = trySend(o, { type: 'chooseCombatAction', modelId: 'B:e0', choice: 'powerAttack', powerAttack: 'throw' })
    expect(r && 'rejection' in r && r.rejection.code).toBe('E_POWER_ATTACK')
  })
})

void ({} as ModelState)
