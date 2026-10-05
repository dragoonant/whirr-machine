// 40-ai §7: the assassination search finds a line on a staged position (a badly hurt enemy Leader in reach of our
// war-engine and caster), commits to it, activates a line model first and aims its attacks at the Leader.
import { describe, expect, it } from 'vitest'
import { findLine } from '../../src/ai/assassin'
import { newCtx } from '../../src/ai/damage'
import { decideSync, newBrain } from '../../src/ai/decider'
import { TIERS } from '../../src/ai/tiers'
import { legalActions, step, type GameState, type PlayerId } from '../../src/engine/index'
import { ASH, along, fwd, parkOthers, playUntil, stage } from './helpers'

function scene(): { s: GameState; me: PlayerId; enemyLeader: string } {
  // the first activation decision of round 2: everything is deployed
  const s0 = playUntil(ASH(), 'assn-1', (s) => s.round >= 2 && s.pending.kind === 'chooseActivation')
  const me = s0.pending.player
  const them: PlayerId = me === 'A' ? 'B' : 'A'
  const f = fwd(s0, me)
  const EL = s0.players[them].leaderId, ML = s0.players[me].leaderId
  const jack = Object.values(s0.models).find((m) => m.owner === me && m.type === 'warEngine')!
  const L = s0.models[EL]!
  const target = { x: 12, z: 0 }
  const boxes = L.damage.track === 'single' ? L.damage.boxes : 15
  const s = stage(s0, {
    ...parkOthers(s0, [EL, ML, jack.id]),
    [EL]: { pos: target, focus: 0, damage: { track: 'single', boxes, filled: boxes - 3 }, conditions: [] },
    [jack.id]: { pos: along(target, { x: -f.x, z: -f.z }, 4.5), focus: 3, activated: false, conditions: [] },
    [ML]: { pos: along(target, { x: -f.x, z: -f.z }, 9), activated: false, conditions: [] },
  })
  return { s, me, enemyLeader: EL }
}

describe('assassination search', () => {
  it('AI-ASSN-1 finds a line on a hurt enemy Leader with pKill above tau_go', () => {
    const { s, me, enemyLeader } = scene()
    const line = findLine(newCtx(s), s, me)
    expect(line).not.toBeNull()
    expect(line!.targetId).toBe(enemyLeader)
    expect(Math.max(line!.pKill, line!.pKillNoLeader)).toBeGreaterThanOrEqual(TIERS.normal.tauGo!)
    expect(line!.steps.length).toBeGreaterThan(0)
  })

  it('AI-ASSN-2 commits: a line model activates first and every attack it makes targets the Leader', () => {
    const { s, me, enemyLeader } = scene()
    const brain = newBrain()
    let cur = s
    const first = decideSync(cur, cur.pending, legalActions(cur), { tier: 'normal', seed: 'assn', brain })
    expect(first.type).toBe('chooseActivation')
    const line = findLine(newCtx(s), s, me)!
    const ids = line.steps.map((x) => x.activationId)
    expect(ids).toContain((first as { activate: string }).activate)
    expect(brain.line?.committed).toBe(true)
    cur = step(cur, first).state
    const targets: string[] = []
    // play the activation out with the AI (dice from the engine)
    for (let i = 0; i < 60 && cur.activation && cur.pending.player === me && cur.pending.kind !== 'chooseActivation'; i++) {
      const a = decideSync(cur, cur.pending, legalActions(cur), { tier: 'normal', seed: 'assn', brain })
      if (a.type === 'chooseAttack' || a.type === 'chargeTarget') targets.push(a.targetId)
      const r = step(cur, a)
      expect(r.rejection).toBeUndefined()
      cur = r.state
    }
    expect(targets.length).toBeGreaterThan(0)
    expect(new Set(targets)).toEqual(new Set([enemyLeader]))
  })
})
