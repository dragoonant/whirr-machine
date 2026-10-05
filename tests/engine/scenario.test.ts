import { describe, expect, it } from 'vitest'
import { afterDeaths, controlReport, endOfTurnScoring, finalResult } from '../../src/engine/scenario'
import type { DataBundle, GameState } from '../../src/engine/types'
import { bundle, newGame, runSetup, withModel } from './turn-helpers'

// Everything parked at the back edges, away from both walls: W1 (-6,-4) and W2 (6,4).
const parked = (): GameState => {
  const s = runSetup(newGame()).state
  const models = Object.fromEntries(Object.entries(s.models).map(([k, m], i) => [k, { ...m, pos: { x: -16 + (i % 12) * 2.6, z: m.owner === 'A' ? -17 : 17 } }]))
  return { ...s, models, round: 1, turn: 1, activePlayer: 'A' as const }
}
const put = (s: GameState, id: string, x: number, z: number): GameState => withModel(s, id, { pos: { x, z } })
const heldBy = (s: GameState, el: string) => controlReport(s, bundle).elements[el]!

describe('SCN scenario control and scoring (Ashwall Divide)', () => {
  it('SCN-011/014 two friendly models within 2" hold a wall (a Leader counts); one model alone does not', () => {
    let s = put(parked(), 'A:e0', -6, -2.5)
    expect(heldBy(s, 'el-w1').controller).toBeNull()
    s = put(s, 'A:L', -4, -2.5)
    expect(heldBy(s, 'el-w1')).toMatchObject({ controller: 'A', contested: false })
  })

  it('SCN-012/027 an enemy within 2" contests (a Leader too); at 2.5" it does not', () => {
    let s = put(put(parked(), 'A:e0', -6, -2.5), 'A:L', -4, -2.5)
    s = put(s, 'B:L', -6, -0.5) // ~2.5" from the wall edge
    expect(heldBy(s, 'el-w1').controller).toBe('A')
    s = put(s, 'B:L', -6, -1.5)
    expect(heldBy(s, 'el-w1')).toMatchObject({ controller: null, contested: true })
  })

  it('SCN-009/010 scoring starts at the end of the first player turn and both players score', () => {
    let s = put(put(parked(), 'A:e0', -6, -2.5), 'A:L', -4, -2.5)
    s = put(put(s, 'B:e0', 6, 2.5), 'B:L', 4, 2.5)
    const r = endOfTurnScoring(s, bundle) // end of A's round-1 turn: both walls held, both score 1
    expect(r.state.scenario.vp).toEqual({ A: 1, B: 1 })
    expect(r.ended).toBe(false)
  })

  it('SCN-015/016 a 3 VP lead wins only at the end of the opponent turn', () => {
    const s = parked()
    const own = endOfTurnScoring({ ...s, scenario: { ...s.scenario, vp: { A: 5, B: 0 } } }, bundle) // A active, A leads
    expect(own.ended).toBe(false)
    const opp = endOfTurnScoring({ ...s, activePlayer: 'B', turn: 2, scenario: { ...s.scenario, vp: { A: 5, B: 0 } } }, bundle)
    expect(opp.ended).toBe(true)
    expect(opp.state.scenario.result).toEqual({ winner: 'A', reason: 'scenario' })
  })

  it('SCN-017/018 Kill Box: Leader completely within 12" of its own edge gives the opponent 2 VP; a straddling base does not', () => {
    const sr: DataBundle = { ...bundle, byId: { ...bundle.byId, 'scn-qs-demo': { ...bundle.byId['scn-qs-demo']!, killBox: { fromRound: 1, fromPlayer: 'first', depth: 12, vp: 2 } } } }
    const s = put(parked(), 'A:L', 0, -17)
    expect(endOfTurnScoring(s, sr).state.scenario.vp.B).toBe(2)
    expect(endOfTurnScoring(put(s, 'A:L', 0, -6.3), sr).state.scenario.vp.B).toBe(0) // base pokes past z = -6
  })

  it('SCN-019 assassination: the only Leader left wins at once; both gone falls through to VP and presence', () => {
    const s = parked()
    const dead = withModel(s, 'B:L', { life: 'destroyed' })
    const r = afterDeaths(dead, bundle)
    expect(r).toMatchObject({ ended: true })
    expect(r.state.scenario.result).toEqual({ winner: 'A', reason: 'assassination' })
    expect(r.state.models['B:e0']!.inert).toBe(true) // a destroyed caster leaves its war-engine inert
    const both = afterDeaths(withModel(dead, 'A:L', { life: 'destroyed' }), bundle)
    expect(both.state.scenario.result).toEqual({ winner: null, reason: 'draw' })
  })

  it('SCN-021/022 VP tie after round 7: presence (Leader = 10) decides, else a draw', () => {
    let s: GameState = { ...parked(), round: 7, turn: 14, activePlayer: 'B' }
    expect(finalResult(s, bundle).state.scenario.result).toEqual({ winner: null, reason: 'draw' })
    s = put(s, 'A:L', -6, -2.5) // Vilkul near W1, but no VP scored
    expect(finalResult(s, bundle).state.scenario.result).toEqual({ winner: 'A', reason: 'tiebreakPresence' })
  })
})
