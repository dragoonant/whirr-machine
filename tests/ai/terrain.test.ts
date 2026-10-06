// M8 terrain awareness: the bot values cover and blocked lines against shooters, avoids hazard pieces, and plays whole
// games on every board without a rejected action (the engine filters every candidate, so obstructions are never pathed).
import { describe, expect, it } from 'vitest'
import { newCtx } from '../../src/ai/damage'
import { decideSync, newBrain } from '../../src/ai/decider'
import { fastThreat, type Env } from '../../src/ai/plan'
import { pickSensible } from '../../src/ai/random'
import { TIERS } from '../../src/ai/tiers'
import { hazardCost, rangedWeapons } from '../../src/ai/world'
import { createGame, legalActions, step, type GameState, type TerrainInstance } from '../../src/engine/index'
import { ASH, bundle, parkOthers, playUntil, stage } from './helpers'

const piece = (pid: string, id: string, x: number, z: number, rot = 0): TerrainInstance => {
  const t = bundle.byId[pid] as unknown as Record<string, any>
  return { id, pieceId: pid, rulesType: t.rulesType, pos: { x, z }, rot, footprint: t.footprint, height: t.height, props: t.props ?? {} }
}

describe('AI terrain awareness', () => {
  it('AI-TER-1 a shooter is less dangerous to a model behind cover, and a blocked line is cheaper still', () => {
    const s0 = playUntil(ASH(true), 'ter-1', (s) => s.round >= 2 && s.pending.kind === 'chooseActivation')
    const me = s0.pending.player
    const mine = Object.values(s0.models).find((m) => m.owner === me && m.type === 'trooper' && !m.offTable && m.life === 'active')!
    const foe = Object.values(s0.models).find((m) => m.owner !== me && m.type === 'warEngine' && rangedWeapons(m).length > 0 && !m.offTable && m.life === 'active')!
    const keep = [mine.id, foe.id]
    const base = stage(s0, { ...parkOthers(s0, keep), [foe.id]: { pos: { x: 0, z: 9 }, focus: 3, conditions: [] }, [mine.id]: { pos: { x: 0, z: 2.8 }, conditions: [] } })
    const exposure = (terrain: TerrainInstance[]): number => {
      const s: GameState = { ...base, terrain }
      const env = { ctx: newCtx(s), s, me, tier: TIERS.normal, rnd: () => 0.5, line: null, committed: false } as Env
      return fastThreat(env, s.models[mine.id]!, s.models[mine.id]!.pos).exp
    }
    const open = exposure([])
    const wall = exposure([piece('terrain.village-stone-wall', 'w', 0, 4.2, Math.PI / 2)]) // a wall within 1" of the target: cover
    const hut = exposure([piece('terrain.bog-stilt-hut', 'h', 0, 5.5)]) // a building across the line: no LOS
    expect(open).toBeGreaterThan(0)
    expect(wall).toBeLessThan(open)
    expect(hut).toBeLessThan(open)
  })

  it('AI-TER-2 hazardCost: entering or ending in the Blight Pool costs value; outside is free; Resistance: Fire is immune', () => {
    const s0 = playUntil(ASH(true), 'ter-2', (s) => s.round >= 2 && s.pending.kind === 'chooseActivation')
    const s: GameState = { ...s0, terrain: [piece('terrain.wasteland-blight-pool', 'hz', 0, 0)] }
    const cyg = Object.values(s.models).find((m) => m.profileId.startsWith('cyg.') && m.type === 'trooper' && !m.offTable && m.life === 'active')!
    const kha = Object.values(s.models).find((m) => m.profileId.startsWith('kha.') && m.type === 'trooper' && !m.offTable && m.life === 'active')!
    const out = { x: 8, z: 0 }, inside = { x: 0, z: 0 }
    expect(hazardCost(s, cyg, out, { x: 8, z: 5 })).toBe(0)
    const enter = hazardCost(s, cyg, { x: -6, z: 0 }, { x: 4, z: 0 }) // through it and out the far side: one entry
    const stop = hazardCost(s, cyg, { x: 8, z: 0 }, inside) // in and ending inside: entry plus end of activation
    expect(enter).toBeGreaterThan(0)
    expect(stop).toBeGreaterThan(enter)
    expect(hazardCost(s, kha, { x: 8, z: 0 }, inside)).toBe(0)
  })

  it('AI-TER-3 whole games on one layout of every board end with no rejected action', () => {
    for (const layout of ['layout.bog-1', 'layout.ruins-2', 'layout.village-2', 'layout.wasteland-1', 'layout.outpost-1']) {
      let s = createGame({ ...ASH(), layout }, `ter-${layout}`, bundle).state
      const brain = newBrain()
      let rejected = 0, i = 0
      for (; i < 4000 && s.pending.kind !== 'gameOver'; i++) {
        const legal = legalActions(s)
        const p = s.pending.player
        const a = p === 'A' ? decideSync(s, s.pending, legal, { tier: 'normal', seed: `ter:${p}`, brain }) : pickSensible(s, s.pending, legal, `ter:${p}`)
        const r = step(s, a)
        if (r.rejection) { rejected++; s = step(s, legal[0]!).state } else s = r.state
      }
      expect(s.pending.kind, layout).toBe('gameOver')
      expect(rejected, layout).toBe(0)
    }
  }, 60_000)
})
