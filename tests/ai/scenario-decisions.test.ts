// M13 seams: the table edge choice of the normal tier (AIC-015) and the sensible random bot's answers to the scenario decisions (AIC-016).
import { describe, expect, it } from 'vitest'
import { newCtx } from '../../src/ai/damage'
import { decideSync, newBrain } from '../../src/ai/decider'
import { edgePick, terrainBalance } from '../../src/ai/edge'
import type { Env } from '../../src/ai/plan'
import { pickSensible } from '../../src/ai/random'
import { pieceScore } from '../../src/ai/scenario'
import { TIERS } from '../../src/ai/tiers'
import { bundle as ai } from '../../src/ai/world'
import type { Action, GameState, PendingDecision, PlayerId, TerrainInstance } from '../../src/engine/index'
import { createGame, legalActions, step } from '../../src/engine/index'
import { applyAttackerFrame, CLAIM_CACHE_ABILITY } from '../../src/engine/scenario-rules'
import { runGame } from '../../tools/sim'
import { rolesFor, DENY_TURNS } from '../../src/ai/roles'
import { elementsOf } from '../../src/ai/world'
import { bundle, parkOthers, playUntil, stage } from './helpers'

const TRENCH = 'scn-sr26-trench-warfare'
const LISTS = { A: 'kha.l.skirmish', B: 'cyg.l.skirmish' }

/** A game of `scn` stopped at the Defender's `chooseEdge` decision. */
function atEdge(scn: string, seed: string): GameState {
  let r = createGame({ scenario: scn, lists: LISTS }, seed, bundle)
  const first = r.state.pending.options!.find((o) => o.id === 'first')!
  r = step(r.state, first.action)
  expect(r.state.pending.kind).toBe('chooseEdge')
  return r.state
}
const envOf = (s: GameState, me: PlayerId, tier: 'easy' | 'normal' = 'normal'): Env => ({ ctx: newCtx(s), s, me, tier: TIERS[tier], rnd: () => 0.5, line: null, committed: false })
const forest = (id: string, x: number, z: number): TerrainInstance => ({ id, pieceId: 'terrain.village-pines', rulesType: 'forest', pos: { x, z }, rot: 0, footprint: { circle: { r: 3 } }, height: 4, props: {} })
/** The table the Defender (the decision's owner) would get from `edge`: both edges set and the attacker-frame elements turned. */
const frame = (s: GameState, edge: 'north' | 'south'): GameState => {
  const me = s.pending.player, foe: PlayerId = me === 'A' ? 'B' : 'A'
  const players = { ...s.players, [me]: { ...s.players[me], edge }, [foe]: { ...s.players[foe], edge: edge === 'north' ? 'south' : 'north' } } as GameState['players']
  return applyAttackerFrame({ ...s, players }, ai())
}
/** Where the Defender's own flag stands on a table (flag elements are owned by 'first' or 'second'). */
function ownFlag(s: GameState, me: PlayerId): { x: number; z: number } {
  const els = (ai().byId[s.setup.scenario] as unknown as { elements: { id: string; kind: string; owner?: string }[] }).elements
  const mine = els.find((e) => e.kind === 'flag' && (e.owner === 'first' ? s.firstPlayer : s.firstPlayer === 'A' ? 'B' : 'A') === me)!
  return s.scenario.elementState![mine.id]!.pos!
}

describe('table edge choice (normal tier)', () => {
  it('AIC-015 the edge chosen is the legal one whose resulting table is best for the Defender, for several seeds and scenarios', () => {
    for (const scn of [TRENCH, 'scn-sr26-high-stakes', 'scn-sr26-two-fronts']) {
      for (let i = 0; i < 4; i++) {
        const s = atEdge(scn, `edge-${scn}-${i}`)
        const legal = legalActions(s)
        const me = s.pending.player
        const a = decideSync(s, s.pending, legal, { tier: 'normal', seed: 'e', brain: newBrain() })
        expect(legal.some((x) => JSON.stringify(x) === JSON.stringify(a))).toBe(true)
        const value = (x: Action): number => terrainBalance(frame(s, (x as { edge: 'north' | 'south' }).edge), me)
        expect(value(a)).toBeCloseTo(Math.max(...legal.map(value)), 9)
      }
    }
  })

  it('AIC-015 with one forest on the table, the Defender takes the edge that puts its own flag beside it, whichever side that is', () => {
    const s0 = atEdge(TRENCH, 'edge-forest')
    const me = s0.pending.player
    for (const want of ['north', 'south'] as const) {
      const at = ownFlag(frame(s0, want), me)
      const s = { ...s0, terrain: [forest('f1', at.x + 1.5, at.z)] }
      expect(edgePick(envOf(s, me), legalActions(s))).toMatchObject({ type: 'chooseEdge', edge: want })
    }
  })

  it('AIC-015 the easy tier keeps the sensible random pick, which is always a legal edge', () => {
    const s = atEdge(TRENCH, 'edge-easy')
    const a = decideSync(s, s.pending, legalActions(s), { tier: 'easy', seed: 'e', brain: newBrain() })
    expect(a.type).toBe('chooseEdge')
    expect(step(s, a).rejection).toBeUndefined()
  })
})

describe('the sensible random bot at scenario decisions', () => {
  const s0 = atEdge(TRENCH, 'rnd-scn')
  const pd = (code: string, options: string[]): { pending: PendingDecision; legal: Action[] } => {
    const id = 'd:900'
    const pending = { id, player: 'A', kind: 'abilityChoice', window: 'turn.end', context: { data: { code } }, canPass: true, options: [] } as unknown as PendingDecision
    return { pending, legal: options.map((o) => ({ type: 'abilityChoice', decisionId: id, player: 'A', optionId: o }) as Action) }
  }
  const sharp = (p: { pending: PendingDecision; legal: Action[] }): Action => pickSensible(s0, p.pending, p.legal, 'aic-016', 0.01)

  it("AIC-016 heel tokens are taken, the opponent's objective is pulled, Payload moves the 50 as far as it may, a card play beats passing", () => {
    expect(sharp(pd('heelToken', ['yes', 'no']))).toMatchObject({ optionId: 'yes' })
    expect(sharp(pd('heelMove', ['stay', 'move']))).toMatchObject({ optionId: 'move' })
    expect(sharp(pd('payload', ['d0', 'd1', 'd2', 'd3']))).toMatchObject({ optionId: 'd3' })
    expect(sharp(pd('card', ['pass', 'tough:A:u3']))).toMatchObject({ optionId: 'tough:A:u3' })
  })

  it('AIC-016 a flag terrain pick is the offered piece with the best pieceScore', () => {
    let s = createGame({ scenario: 'scn-sr26-pressure-point', lists: LISTS }, 'rnd-flags', bundle).state
    let picks = 0
    for (let i = 0; i < 40 && s.pending.kind !== 'deploy'; i++) {
      const legal = legalActions(s)
      const a = pickSensible(s, s.pending, legal, `rnd:${s.pending.player}`, 0.01)
      if (s.pending.kind === 'abilityChoice' && s.pending.context.data?.code === 'flagTerrain') {
        const me = s.pending.player, st = s
        const sc = (x: Action): number => pieceScore(st, me, st.terrain.find((t) => t.id === (x as { optionId: string }).optionId.split('|')[1])!)
        expect(sc(a)).toBeCloseTo(Math.max(...legal.map(sc)), 6)
        picks++
      }
      const r = step(s, a)
      expect(r.rejection).toBeUndefined()
      s = r.state
    }
    expect(picks).toBeGreaterThanOrEqual(2)
  })

  it('AIC-016 a cache claim beats the Combat Action choices, and the haul move goes toward the 50', () => {
    const ca = (choice: string, extra: object = {}): Action => ({ type: 'chooseCombatAction', decisionId: 'd:900', player: 'A', modelId: 'A:e0', choice, ...extra }) as Action
    const claim = ca('specialAction', { abilityId: CLAIM_CACHE_ABILITY, elementId: 'el-cache-red' })
    const pending = { id: 'd:900', player: 'A', kind: 'chooseCombatAction', window: 'combat.choose', context: { modelId: 'A:e0' }, canPass: false, options: [] } as unknown as PendingDecision
    expect(pickSensible(s0, pending, [ca('melee'), claim, ca('forfeit')], 'aic-016', 0.01)).toBe(claim)
    const m = Object.values(s0.models).find((x) => x.owner === 'A')!
    const hp = { id: 'd:901', player: 'A', kind: 'moveModel', window: 'turn.end', context: { modelId: m.id, data: { code: 'haul', toward: { x: 10, z: 0 } } }, canPass: true, options: [] } as unknown as PendingDecision
    const mv = (x: number): Action => ({ type: 'moveModel', decisionId: 'd:901', player: 'A', modelId: m.id, path: [{ x, z: 0 }] }) as Action
    expect(pickSensible(s0, hp, [mv(-5), mv(8), mv(0)], 'aic-016', 0.01)).toEqual(mv(8))
  })

  it('AIC-016 whole sim games with command hands on the scenarios that raise these decisions end with no rejected answer', () => {
    for (const scn of ['scn-sr26-trench-warfare', 'scn-sr26-high-stakes', 'scn-sr26-payload', 'scn-sr26-wolves']) {
      const r = runGame(1, { seed: 'aic16', scenario: scn, cap: 4000, stall: 200, wallMs: 60000, size: 'skirmish', cards: true })
      expect(r.violations, scn).toEqual([])
      expect(r.summary.ended, scn).toBe(true)
    }
  }, 120000)
})

describe('guarding an element that only denies the enemy points', () => {
  const quiet = playUntil({ scenario: TRENCH, lists: LISTS }, 'aic-deny', (x) => x.round >= 2 && x.pending.kind === 'chooseActivation' && x.pending.player === 'A')
  const flagOf = (s: GameState) => elementsOf(s).find((e) => e.kind === 'flag' && e.owner === 'A')!
  const guards = (s: GameState): string[] => [...rolesFor(s, 'A').values()].filter((r) => r.element?.id === flagOf(s).id).map((r) => r.kind)

  it('AIC-017 our own Trench Warfare flag (worth us nothing, the enemy 2) gets no guard while every enemy is more than DENY_TURNS away, and one as soon as an enemy is near', () => {
    expect(DENY_TURNS).toBeGreaterThan(0)
    const flag = flagOf(quiet)
    expect(flag.vpFor).toMatchObject({ A: 0, B: 2 })
    // every enemy parked on its own back edge: far from the flag
    const far = stage(quiet, parkOthers(quiet, Object.values(quiet.models).filter((m) => m.owner === 'A').map((m) => m.id)))
    expect(guards(far)).toEqual([])
    // one enemy trooper beside the flag
    const foe = Object.values(far.models).find((m) => m.owner === 'B' && m.type === 'trooper')!
    const near = stage(far, { [foe.id]: { pos: { x: flag.pos.x + 4, z: flag.pos.z } } })
    expect(guards(near).length).toBeGreaterThan(0)
  })
})
