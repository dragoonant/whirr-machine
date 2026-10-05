// 40-ai §6: caster safety is a hard constraint. On a staged position where our Leader stands in front of the enemy
// army (staying put is a likely assassination), the AI moves it to a spot whose leaderRisk is within tau_safe while
// keeping the Power Field reserve that risk needs; and no candidate it rejects for risk is ever chosen.
import { describe, expect, it } from 'vitest'
import { killChance, newCtx } from '../../src/ai/damage'
import { decideSync, newBrain } from '../../src/ai/decider'
import { threatAt } from '../../src/ai/threat'
import { TIERS } from '../../src/ai/tiers'
import { legalActions, step, type GameState, type PlayerId } from '../../src/engine/index'
import { ASH, along, fwd, parkOthers, playUntil, stage } from './helpers'

function scene(seed: string): { s: GameState; me: PlayerId; leader: string } {
  const s0 = playUntil(ASH(true), seed, (s) => s.round >= 2 && s.pending.kind === 'chooseActivation')
  const me = s0.pending.player
  const them: PlayerId = me === 'A' ? 'B' : 'A'
  const f = fwd(s0, me)
  const ML = s0.players[me].leaderId, EL = s0.players[them].leaderId
  const foes = Object.values(s0.models).filter((m) => m.owner === them && !m.offTable && m.life === 'active' && m.id !== EL)
  const at = { x: 10, z: 0 }
  const moves: Parameters<typeof stage>[1] = { ...parkOthers(s0, [ML, EL, ...foes.map((m) => m.id)]) }
  moves[ML] = { pos: at, activated: false, conditions: [] }
  // the enemy line 5-7" in front of our Leader, their caster close behind it (so their war-engine has focus)
  foes.forEach((m, i) => { moves[m.id] = { pos: along({ x: at.x - 6 + i * 3, z: at.z }, f, 6 + (i % 2)), conditions: [] } })
  moves[EL] = { pos: along({ x: at.x + 6, z: at.z }, f, 11), conditions: [] }
  return { s: stage(s0, moves), me, leader: ML }
}

function riskAt(s: GameState, leader: string): number {
  const L = s.models[leader]!
  const rep = threatAt(newCtx(s), s, L, L.pos)
  return killChance(L, rep.seqs, L.focus)
}

describe('caster safety', () => {
  for (const seed of ['safe-1', 'safe-2']) {
    it(`AI-SAFE ${seed}: the Leader leaves a deadly spot and ends within tau_safe`, () => {
      const { s, me, leader } = scene(seed)
      expect(riskAt(s, leader)).toBeGreaterThan(TIERS.normal.tauSafe) // staying put is unsafe
      const brain = newBrain()
      let cur = step(s, { type: 'chooseActivation', decisionId: s.pending.id, player: me, activate: leader }).state
      expect(cur.pending.kind).not.toBe('chooseActivation')
      for (let i = 0; i < 60 && cur.activation?.activeId === leader && cur.pending.player === me; i++) {
        const a = decideSync(cur, cur.pending, legalActions(cur), { tier: 'normal', seed, brain })
        const r = step(cur, a)
        expect(r.rejection).toBeUndefined()
        cur = r.state
      }
      const L = cur.models[leader]!
      expect(L.life).toBe('active')
      expect(riskAt(cur, leader)).toBeLessThanOrEqual(TIERS.normal.tauSafe + 1e-9)
    })
  }
})
