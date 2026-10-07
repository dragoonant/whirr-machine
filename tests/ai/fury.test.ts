// 81 §F: the AI's fury economy. Leech drains the battlegroup, forcing is priced by next turn's frenzy risk, a warlock's
// transfers count in its safety, and every new faction plays whole games with no rejected answer and a result.
import { describe, expect, it } from 'vitest'
import { decideSync, newBrain } from '../../src/ai/decider'
import { killChance, newCtx } from '../../src/ai/damage'
import { forcePenalty, spendCost } from '../../src/ai/fury'
import { damageDist } from '../../src/ai/prob'
import { bundle, playUntil, stage } from './helpers'
import { createGame, legalActions, step, validate, type GameSetup, type GameState } from '../../src/engine/index'

const LISTS = { trl: 'trl.l.starter-recon', cir: 'cir.l.starter-recon', cry: 'cry.l.necro-recon', men: 'men.l.starter-recon' }
const setup = (l: string, o = 'cyg.l.qs-recon'): GameSetup => ({ scenario: 'scn-ashwall-divide', lists: { A: l, B: o } })

/** Play the normal AI on both seats until `pred` holds. */
function aiUntil(g: GameSetup, seed: string, pred: (s: GameState) => boolean, cap = 4000): GameState {
  let s = createGame(g, seed, bundle).state
  const brains = { A: newBrain(), B: newBrain() }
  for (let i = 0; i < cap && s.pending.kind !== 'gameOver' && !pred(s); i++) {
    const p = s.pending.player
    s = step(s, decideSync(s, s.pending, legalActions(s), { tier: 'normal', seed: `${seed}:${p}`, brain: brains[p] })).state
  }
  return s
}

function warlockScene(seed: string): { s: GameState; w: string; beast: string } {
  const s = playUntil(setup(LISTS.trl, LISTS.trl), seed, (x) => x.round >= 2 && x.pending.kind === 'chooseActivation')
  const me = s.pending.player
  const w = s.players[me].leaderId
  const beast = Object.values(s.models).find((m) => m.owner === me && m.type === 'beast' && !m.offTable && m.life === 'active')!.id
  return { s, w, beast }
}

describe('fury AI', () => {
  it('AI-FURY-001 leech drains the beasts by what the warlock has room for, and the answer validates', () => {
    const s = aiUntil(setup(LISTS.trl, LISTS.trl), 'furyleech', (x) => x.pending.kind === 'leech' && (((x.pending.context.data as { sources?: unknown[] })?.sources ?? []).length > 0), 4000)
    expect(s.pending.kind).toBe('leech')
    const data = s.pending.context.data as { room: number; sources: { beastId: string; fury: number }[] }
    for (const tier of ['normal', 'easy'] as const) {
      const a = decideSync(s, s.pending, legalActions(s), { tier, seed: 'x', brain: newBrain() })
      expect(a.type).toBe('leech')
      expect(validate(s, a)).toBeNull()
      const taken = Object.values((a as { from: Record<string, number> }).from).reduce((x, y) => x + y, 0)
      const held = data.sources.reduce((x, y) => x + y.fury, 0)
      expect(taken).toBe(Math.min(data.room, held))
      if (tier === 'easy') expect((a as { self: number }).self).toBe(0)
    }
  })

  it('AI-FURY-002 forcing a beast costs more the more fury it already holds and the more it takes', () => {
    const { s, beast } = warlockScene('furyforce')
    const b = s.models[beast]!
    const cap = (bundle.byId[b.profileId] as unknown as { stats: { FURY: number } }).stats.FURY
    const at = (f: number): GameState => stage(s, { [beast]: { fury: f } })
    expect(forcePenalty(at(0), at(0).models[beast]!, 2)).toBeGreaterThanOrEqual(forcePenalty(at(0), at(0).models[beast]!, 1))
    const lo = forcePenalty(at(0), at(0).models[beast]!, 1)
    const hi = forcePenalty(at(cap - 1), at(cap - 1).models[beast]!, 1)
    expect(hi).toBeGreaterThanOrEqual(lo)
    // a beast already at its FURY cannot be forced further
    expect(spendCost(at(cap), at(cap).models[beast]!, 1, 0).ok).toBe(false)
  })

  it('AI-FURY-003 a warlock holding fury with a beast in reach is harder to kill than one with none', () => {
    const { s, w, beast } = warlockScene('furyrisk')
    const W = s.models[w]!, B = s.models[beast]!
    // the beast stands beside the warlock with all its boxes free
    const near = stage(s, { [beast]: { pos: { x: W.pos.x + 2, z: W.pos.z }, fury: 0 } })
    const seqs = [{ p: 0.9, onHit: damageDist(2, 6), melee: true }, { p: 0.9, onHit: damageDist(2, 6), melee: true }, { p: 0.9, onHit: damageDist(2, 6), melee: true }]
    void B
    newCtx(near)
    const withFury = killChance({ ...near.models[w]!, fury: 6 }, seqs)
    const without = killChance({ ...near.models[w]!, fury: 0 }, seqs)
    expect(withFury).toBeLessThan(without)
  })

  for (const [name, list] of Object.entries(LISTS)) {
    it(`AI-FURY-010 ${name}: normal and easy play a whole game with no rejected answer, and it ends`, () => {
      let s = createGame(setup(list, 'kha.l.qs-recon'), `fury-${name}`, bundle).state
      const brains = { A: newBrain(), B: newBrain() }
      let rejected = 0
      for (let i = 0; i < 4000 && s.pending.kind !== 'gameOver'; i++) {
        const p = s.pending.player
        const legal = legalActions(s)
        const a = decideSync(s, s.pending, legal, { tier: p === 'A' ? 'normal' : 'easy', seed: `f${name}:${p}`, brain: brains[p] })
        const r = step(s, a)
        if (r.rejection) { rejected++; s = step(s, legal[0]!).state } else s = r.state
        for (const m of Object.values(s.models)) if (m.fury !== undefined) expect(m.fury).toBeGreaterThanOrEqual(0)
      }
      expect(s.pending.kind).toBe('gameOver')
      expect(rejected).toBe(0)
      expect(brains.A.stats.fallbacks + brains.B.stats.fallbacks).toBe(0)
    }, 60000)
  }
})
