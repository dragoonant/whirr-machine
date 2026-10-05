// 40-ai §2 deployment: the AI's placement is always legal, including very shallow zones where the engine's own tidy
// line may not fit (chain-deploy fallback along the zone's width).
import { describe, expect, it } from 'vitest'
import { planDeployment } from '../../src/ai/deploy'
import { decideSync, newBrain } from '../../src/ai/decider'
import { pickSensible } from '../../src/ai/random'
import { createGame, legalActions, step, validate, type Action, type DataBundle, type GameState } from '../../src/engine/index'
import { ASH, bundle } from './helpers'

/** A copy of the data bundle whose Ashwall Divide deployment zones are `first` and `second` inches deep. */
function shallowBundle(first: number, second: number, advance: number): DataBundle {
  const scn = bundle.byId['scn-ashwall-divide']! as Record<string, unknown> & { id: string }
  const dep = { ...(scn.deployment as Record<string, number>), first, second, advance }
  return { version: `${bundle.version}+shallow${first}-${second}-${advance}`, byId: { ...bundle.byId, 'scn-ashwall-divide': { ...scn, deployment: dep } } }
}

function deployAll(b: DataBundle, seed: string, swap: boolean): { states: GameState[]; final: GameState } {
  let s = createGame(ASH(swap), seed, b).state
  const states: GameState[] = []
  const brain = newBrain()
  for (let i = 0; i < 40 && s.phase !== 'activation' && s.pending.kind !== 'gameOver'; i++) {
    const legal = legalActions(s)
    let a: Action
    if (s.pending.kind === 'deploy' || s.pending.kind === 'advanceDeploy') {
      states.push(s)
      a = decideSync(s, s.pending, legal, { tier: 'normal', seed, brain })
    } else a = legal.length ? pickSensible(s, s.pending, legal, seed) : legal[0]!
    const r = step(s, a)
    expect(r.rejection).toBeUndefined()
    s = r.state
  }
  return { states, final: s }
}

describe('AI deployment', () => {
  it('AI-DEPLOY-1 deploys every model legally on the normal zones', () => {
    const { states, final } = deployAll(bundle, 'dep-1', false)
    expect(states.length).toBeGreaterThanOrEqual(2)
    for (const s of states) { const p = planDeployment(s); expect(p).not.toBeNull(); expect(validate(s, { type: s.pending.kind, decisionId: s.pending.id, player: s.pending.player, placements: p! } as Action)).toBeNull() }
    expect(Object.values(final.models).filter((m) => m.offTable && !final.players[m.owner].ambushIds.includes(m.id))).toEqual([])
  })
  for (const [first, second, adv] of [[2.5, 3, 1], [2, 2.5, 0.5]] as const) {
    it(`AI-DEPLOY-2 chain-deploys into ${first}"/${second}" zones (+${adv}" advance)`, () => {
      const b = shallowBundle(first, second, adv)
      for (const swap of [false, true]) {
        const { states, final } = deployAll(b, `dep-shallow-${first}-${swap}`, swap)
        expect(states.length).toBeGreaterThanOrEqual(2)
        expect(final.phase).not.toBe('deploy')
        expect(Object.values(final.models).filter((m) => m.offTable && !final.players[m.owner].ambushIds.includes(m.id))).toEqual([])
      }
    })
  }
})
