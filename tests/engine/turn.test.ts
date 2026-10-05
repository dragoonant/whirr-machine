import { describe, expect, it } from 'vitest'
import { answerControlDecision, activatable, endTurn } from '../../src/engine/turnflow'
import { answerSetup, createInitialState } from '../../src/engine/setup'
import { bundle, finishActivations, must, newGame, QS, runControlTo, runSetup, S1 } from './turn-helpers'

describe('SCN setup and deployment', () => {
  it('SCN-001/002/003 starter lists are valid; an over-cost list and a list without a war-engine reject with E_BAD_SETUP', () => {
    expect(newGame(QS).pending.kind).toBe('deploy')
    const base = bundle.byId['cyg.l.qs-recon']!
    const over = {
      ...bundle,
      byId: {
        ...bundle.byId,
        'cyg.big': { ...bundle.byId['cyg.deuce']!, id: 'cyg.big', fa: undefined, cost: 99 },
        'x.l': { ...base, id: 'x.l', entries: [{ profile: 'cyg.big' }] },
        'y.l': { ...base, id: 'y.l', entries: [{ profile: 'cyg.falk' }] },
      },
    }
    const tooMany = createInitialState({ ...QS, lists: { A: 'x.l', B: 'cyg.l.qs-recon' } }, 's', over)
    expect('rejection' in tooMany && tooMany.rejection.code).toBe('E_BAD_SETUP')
    const noCohort = createInitialState({ ...QS, lists: { A: 'y.l', B: 'cyg.l.qs-recon' } }, 's', over)
    expect('rejection' in noCohort && noCohort.rejection.code).toBe('E_BAD_SETUP')
  })

  it('SCN-025 roll-off winner who goes second also picks the edge; the first player gets the opposite one', () => {
    const g = newGame(S1, 'rolloff')
    expect(g.events.some((e) => e.type === 'RollOffWon')).toBe(true)
    const winner = g.pending.player
    expect(g.pending.kind).toBe('chooseTurnOrder')
    const second = must(answerSetup(g.state, bundle, { type: 'chooseTurnOrder', decisionId: g.pending.id, player: winner, order: 'second' }))
    expect(second.pending.kind).toBe('chooseEdge')
    expect(second.pending.player).toBe(winner)
    const edge = must(answerSetup(second.state, bundle, { type: 'chooseEdge', decisionId: second.pending.id, player: winner, edge: 'south' }))
    const other = winner === 'A' ? 'B' : 'A'
    expect(edge.state.players[winner].edge).toBe('south')
    expect(edge.state.players[other].edge).toBe('north')
    expect(edge.state.firstPlayer).toBe(other)
  })

  it('SCN-004/005/029 zone, unit spread and deployment order', () => {
    const g = newGame(QS)
    expect(g.pending).toMatchObject({ kind: 'deploy', player: 'A' })
    const good = g.pending.options![0]!.action as { placements: { modelId: string; pos: { x: number; z: number } }[] }
    // the leader at z = -11.5 pokes out of the 6" zone
    const bad = { ...good, placements: good.placements.map((p) => (p.modelId === 'A:L' ? { ...p, pos: { x: 0, z: -11.5 } } : p)) }
    expect(answerSetup(g.state, bundle, bad as never)).toHaveProperty('rejection.code', 'E_OUT_OF_ZONE')
    // order: A normal, B normal, A advance, B advance, then round 1
    const kinds: string[] = []
    let cur = g
    while (cur.pending.kind === 'deploy' || cur.pending.kind === 'advanceDeploy') {
      kinds.push(`${cur.pending.kind}:${cur.pending.player}`)
      if (kinds.length === 4) {
        // B's Advance Deployment: spread the unit troopers 4.7" apart (3.5" edge to edge) -> rejected
        const adv = cur.pending.options![0]!.action as { placements: { modelId: string; pos: { x: number; z: number } }[] }
        const spread = { ...adv, placements: adv.placements.map((p, i) => (p.modelId.startsWith('B:u') ? { ...p, pos: { x: -10 + i * 4.7, z: 12 } } : p)) }
        expect(answerSetup(cur.state, bundle, spread as never)).toHaveProperty('rejection')
      }
      cur = must(answerSetup(cur.state, bundle, cur.pending.options![0]!.action))
    }
    expect(kinds).toEqual(['deploy:A', 'deploy:B', 'advanceDeploy:A', 'advanceDeploy:B'])
    // Granted: Prey is chosen after deployment, before round 1 (Black 13th)
    expect(cur.pending.kind).toBe('abilityChoice')
    expect(cur.pending.context.data?.code).toBe('prey')
    cur = must(answerSetup(cur.state, bundle, cur.pending.options![0]!.action))
    expect(cur.state.round).toBe(1)
  })
})

describe('turn machine', () => {
  it('FOC-001/003/004 caster starts full, power up gives the cohort 1, allocation is capped at 3', () => {
    const g = runSetup(newGame(QS))
    expect(g.state.models['A:L']!.focus).toBe(6)
    expect(g.state.models['A:e0']!.focus).toBe(1) // Razor after power up
    expect(g.pending.kind).toBe('allocateFocus')
    const over = { type: 'allocateFocus', decisionId: g.pending.id, player: 'A', allocation: { 'A:e0': 3 } } as const
    expect(answerControlDecision(g.state, bundle, over)).toHaveProperty('rejection.code', 'E_FOCUS_CAP')
    const done = runControlTo(g)
    expect(done.state.models['A:e0']!.focus).toBe(3)
    expect(done.state.models['A:L']!.focus).toBe(4)
    expect(done.pending.kind).toBe('chooseActivation')
  })

  it('R4.10 endTurn is rejected while a model is unactivated; play passes to B, then to round 2', () => {
    let g = runControlTo(runSetup(newGame(QS)))
    expect(activatable(g.state).length).toBe(4) // leader, Razor, Lazarenko, the Hounds
    expect(endTurn(g.state, bundle, { type: 'endTurn', decisionId: g.pending.id, player: 'A' })).toHaveProperty('rejection.code', 'E_NOT_AN_OPTION')
    g = finishActivations(g.state)
    g = must(endTurn(g.state, bundle, { type: 'endTurn', decisionId: g.pending.id, player: 'A' }))
    expect(g.state).toMatchObject({ round: 1, turn: 2, activePlayer: 'B' })
    g = finishActivations(runControlTo(g).state)
    g = must(endTurn(g.state, bundle, { type: 'endTurn', decisionId: g.pending.id, player: 'B' }))
    expect(g.state).toMatchObject({ round: 2, turn: 3, activePlayer: 'A' })
    expect(g.state.models['A:L']!.activated).toBe(false) // fresh for the new turn
  })

  it('R4 / V1.4 the game ends after round 7 with a result and a gameOver decision', () => {
    let g = runControlTo(runSetup(newGame(QS)))
    // nobody near a wall: move B's troopers back so no VP is scored
    g = { ...g, state: { ...g.state, models: Object.fromEntries(Object.entries(g.state.models).map(([k, m]) => [k, m.id.startsWith('B:u') ? { ...m, pos: { x: m.pos.x, z: 17 } } : m])) } }
    for (let i = 0; i < 14 && g.state.phase !== 'ended'; i++) {
      g = finishActivations(runControlTo(g).state)
      g = must(endTurn(g.state, bundle, { type: 'endTurn', decisionId: g.pending.id, player: g.state.activePlayer }))
    }
    expect(g.state.phase).toBe('ended')
    expect(g.state.round).toBe(7)
    expect(g.pending.kind).toBe('gameOver')
    expect(g.state.scenario.result).toBeDefined()
  })
})
