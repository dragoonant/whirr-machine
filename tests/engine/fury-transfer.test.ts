// FURY-025b, 032..037, 040..043, 046: damage transfer inside a real attack, life spirals and aspects, healing a beast.
import { describe, expect, it, vi } from 'vitest'

const FORCED = vi.hoisted(() => new Map<number, number[]>())
vi.mock('../../src/engine/rng', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/engine/rng')>()
  return {
    ...real,
    roll(state: import('../../src/engine/types').GameState, spec: import('../../src/engine/rng').RollSpec) {
      const f = FORCED.get(state.rollSeq)
      if (!f) return real.roll(state, spec)
      const n = Math.max(1, spec.count)
      const dice = Array.from({ length: n }, (_, i) => f[i] ?? 1)
      const kept = [...dice].sort((x, y) => y - x).slice(0, dice.length - (spec.dropLowest ?? 0))
      const total = kept.reduce((a, b) => a + b, 0) + (spec.flat ?? 0)
      return {
        state: { ...state, rollSeq: state.rollSeq + 1 },
        event: { type: 'DiceRolled' as const, rollId: `r:${state.rollSeq + 1}`, purpose: spec.purpose, ownerId: spec.ownerId, dice, kept, total, target: spec.target },
      }
    },
  }
})

import type { Action } from '../../src/engine/actions'
import { applyDamage, healDamage, layoutsFor, spiralView, transferAvailable, transferPreview, validateTransfer } from '../../src/engine/damage'
import type { GameEvent } from '../../src/engine/events'
import type { FlowOut } from '../../src/engine/pending'
import { handleActivationAction } from '../../src/engine/phases/activation'
import { spiritBondPoints } from '../../src/engine/fury'
import { heal } from '../../src/engine/spells'
import { raiseChooseActivation } from '../../src/engine/turnflow'
import type { GameState, ModelState } from '../../src/engine/types'
import { BUNDLE as B, beast, enemyLeader, fillBoxes, mk, warlock, world } from './fury-helpers'
import { must } from './turn-helpers'

const force = (s: GameState, ...rolls: number[][]): void => rolls.forEach((f, i) => FORCED.set(s.rollSeq + i, f))
const evs = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const layoutsOf = (id: string) => layoutsFor(B.byId[id] as never)!
const marked = (m: ModelState): number => (m.damage.track === 'grid' ? m.damage.grids[0]!.cols.flat().filter(Boolean).length : 0)
const asOut = (s: GameState): FlowOut => ({ state: s, events: [], pending: s.pending })

function send(out: FlowOut, a: Record<string, unknown>): FlowOut {
  const r = handleActivationAction(out.state, B, { ...a, decisionId: out.pending.id, player: out.pending.player } as unknown as Action)
  if (!r) throw new Error(`not an activation action: ${a.type}`)
  const res = must(r)
  return { ...res, events: [...out.events, ...res.events] }
}
/** Answer plain attack decisions (no boosts) until something else is asked. */
function settle(out0: FlowOut): FlowOut {
  let out = out0
  for (let i = 0; i < 20; i++) {
    const k = out.pending.kind
    if (k === 'boostAttack') out = send(out, { type: 'boostAttack', boost: false })
    else if (k === 'boostDamage') out = send(out, { type: 'boostDamage', boost: false })
    else if (k === 'chooseBoxes') out = send(out, { type: 'chooseBoxes', column: Number(out.pending.options![0]!.id.replace('col', '')) })
    else if (k === 'triggerWindow') out = send(out, { type: 'pass' })
    else break
  }
  return out
}
/** Enemy brute B:e (POW 19 cleaver, MAT 12) attacks the warlock A:L; dice are forced to deal exactly 10 damage points. */
function bruteHitsWarlock(models: ModelState[]): FlowOut {
  const s = world([...models, mk('B:e', 'f.e', 'B', 1.6, 0), enemyLeader({ pos: { x: 30, z: 30 } })], { phase: 'activation', activePlayer: 'B' })
  force(s, [6, 6], [3, 3]) // hit, then 6 + POW 19 - ARM 15 = 10
  let out = raiseChooseActivation(s, [])
  out = send(out, { type: 'chooseActivation', activate: 'B:e' })
  out = send(out, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e' })
  out = send(out, { type: 'chooseCombatAction', modelId: 'B:e', choice: 'melee' })
  out = send(out, { type: 'chooseAttack', modelId: 'B:e', weaponId: 'f.big', targetId: 'A:L', additional: false })
  return settle(out)
}
const beastWithRoom = (id: string, unmarked: number, x: number, patch: Partial<ModelState> = {}, profile = 'f.b'): ModelState => {
  const m = mk(id, profile, 'A', x, 0, patch)
  return fillBoxes(m, 30 - unmarked)
}

describe('FURY damage transfer', () => {
  it('FURY-032 transfer: the beast takes what it can (branch rolled), the overflow reaches the warlock with no second prompt', () => {
    const out = bruteHitsWarlock([fillBoxes(warlock({ fury: 6 }), 23), beastWithRoom('A:b1', 8, 3)])
    expect(out.pending.kind).toBe('transferDamage')
    expect(out.pending.player).toBe('A')
    expect(out.pending.options!.map((o) => o.id)).toEqual(['to:A:b1', 'keep'])
    expect(out.pending.options![0]!.cost).toEqual({ focus: 0, fury: 1 })
    expect(out.pending.canPass).toBe(false)
    const r = send(out, { type: 'transferDamage', toId: 'A:b1' })
    expect(evs(r.events, 'DamageTransferred')).toMatchObject([{ warlockId: 'A:L', beastId: 'A:b1', points: 10, absorbed: 8, overflow: 2 }])
    expect(evs(r.events, 'DiceRolled').filter((e) => e.purpose === 'column').length).toBeGreaterThanOrEqual(1) // the branch was rolled
    expect(evs(r.events, 'FuryChanged').filter((e) => e.modelId === 'A:L')).toMatchObject([{ delta: -1, reason: 'spend', purpose: 'transfer' }])
    expect(r.state.models['A:b1']!.life).not.toBe('active') // 8 absorbed on 8 unmarked boxes: disabled, then destroyed
    expect(r.state.models['A:L']!.life).toBe('destroyed') // the 2 overflow points hit its last box
    expect(evs(r.events, 'DamageTransferred')).toHaveLength(1) // no second transfer prompt for the overflow
    expect(r.state.phase).toBe('ended') // the warlock was the Leader
  })

  it('FURY-033 a beast already holding all its fury is not a candidate, and a forged answer is E_FURY_CAP', () => {
    const models = [warlock({ fury: 6 }), beastWithRoom('A:b1', 20, 3, { fury: 3 }), beastWithRoom('A:b2', 20, -3)]
    const s = world([...models, enemyLeader()])
    expect(validateTransfer(s, B, 'A:L', 'A:b1')?.code).toBe('E_FURY_CAP')
    const out = bruteHitsWarlock(models)
    expect(out.pending.kind).toBe('transferDamage')
    expect(out.pending.options!.map((o) => o.id)).toEqual(['to:A:b2', 'keep'])
    const bad = handleActivationAction(out.state, B, { type: 'transferDamage', decisionId: out.pending.id, player: 'A', toId: 'A:b1' } as Action)
    expect(bad).toHaveProperty('rejection.code', 'E_FURY_CAP')
  })

  it('FURY-034 no prompt when the warlock has 0 fury or the instance deals 0 points', () => {
    const s = world([warlock({ fury: 0 }), beastWithRoom('A:b1', 20, 3), enemyLeader()])
    expect(transferAvailable(s, B, 'A:L', 10)).toBe(false)
    const s2 = world([warlock({ fury: 3 }), beastWithRoom('A:b1', 20, 3), enemyLeader()])
    expect(transferAvailable(s2, B, 'A:L', 0)).toBe(false)
    expect(transferAvailable(s2, B, 'A:L', 1)).toBe(true)
    const out = bruteHitsWarlock([warlock({ fury: 0 }), beastWithRoom('A:b1', 20, 3)])
    expect(out.pending.kind).not.toBe('transferDamage')
    expect(evs(out.events, 'DamageApplied').filter((e) => e.targetId === 'A:L')).toMatchObject([{ points: 10 }])
  })

  it('FURY-035 a beast destroyed by transferred damage is not reaved; it counts for Spirit Bond next Control', () => {
    const out = bruteHitsWarlock([warlock({ fury: 6 }), beastWithRoom('A:b1', 3, 3, { fury: 2 })])
    const r = send(out, { type: 'transferDamage', toId: 'A:b1' })
    expect(r.state.models['A:b1']).toMatchObject({ life: 'destroyed', fury: 0, bondedTo: 'A:L' })
    expect(evs(r.events, 'FuryReaved')).toEqual([])
    expect(evs(r.events, 'FuryChanged').filter((e) => e.modelId === 'A:b1')).toMatchObject([{ reason: 'lose', delta: -2 }])
    expect(r.state.models['A:L']!.fury).toBe(5) // only the transfer cost
    expect(spiritBondPoints(r.state, r.state.models['A:L']!)).toBe(1)
  })

  it('FURY-036 after a full transfer the warlock still takes a (zero-point) damage instance, so damage triggers see it', () => {
    const out = bruteHitsWarlock([warlock({ fury: 6 }), beastWithRoom('A:b1', 15, 3)])
    const r = send(out, { type: 'transferDamage', toId: 'A:b1' })
    expect(evs(r.events, 'DamageTransferred')).toMatchObject([{ absorbed: 10, overflow: 0 }])
    const dmg = evs(r.events, 'DamageApplied')
    expect(dmg.find((e) => e.targetId === 'A:b1')).toMatchObject({ source: 'transfer', points: 10 })
    expect(dmg.find((e) => e.targetId === 'A:L')).toMatchObject({ points: 0 })
    expect(marked(r.state.models['A:L']!)).toBe(0)
  })

  it('FURY-037 a Tough beast filled by a transfer rolls Tough; the overflow computed beforehand still reaches the warlock', () => {
    B.byId['f.bt'] = { ...(B.byId['f.b'] as object), id: 'f.bt', abilities: ['core.a.tough'] } as never
    const out = bruteHitsWarlock([warlock({ fury: 6 }), beastWithRoom('A:b1', 8, 3, {}, 'f.bt')])
    force(out.state, [4], [5]) // beast's branch roll, then Tough 5
    const r = send(out, { type: 'transferDamage', toId: 'A:b1' })
    expect(evs(r.events, 'DamageTransferred')).toMatchObject([{ absorbed: 8, overflow: 2 }])
    expect(evs(r.events, 'DiceRolled').some((e) => e.purpose === 'tough')).toBe(true)
    expect(r.state.models['A:b1']).toMatchObject({ life: 'active' })
    expect(r.state.models['A:b1']!.conditions).toContain('knockedDown')
    expect(marked(r.state.models['A:L']!)).toBe(2)
    const types = r.events.map((e) => (e.type === 'DamageApplied' ? `dmg:${e.targetId}` : e.type))
    expect(types.indexOf('dmg:A:b1')).toBeLessThan(types.indexOf('dmg:A:L')) // beast first
  })

  it('FURY-032b the transfer preview is exact over the six branches', () => {
    const s = world([warlock({ fury: 6 }), beastWithRoom('A:b1', 8, 3), enemyLeader()])
    const [row] = transferPreview(s, B, 'A:L', 10)
    expect(row).toMatchObject({ beastId: 'A:b1', eligible: true, unmarked: 8, absorbed: 8, overflow: 2, pDisabled: 1, fury: 0, cap: 3 })
    for (const p of Object.values(row!.pCripple)) expect(p * 6).toBeCloseTo(Math.round(p * 6), 9)
  })
})

describe('FURY life spirals and aspects', () => {
  const s0 = () => world([warlock(), beast('A:b1', 3, 0), enemyLeader()])

  it('FURY-040 spiral fill: outermost first, a full branch spills to the next higher one, 6 wraps to 1', () => {
    let s = s0()
    const grid = (m: ModelState) => (m.damage as { grids: { cols: boolean[][] }[] }).grids[0]!.cols
    const cols = grid(s.models['A:b1']!).map((c) => [...c])
    cols[1]![0] = true // branch 2 already holds 1 mark
    s = { ...s, models: { ...s.models, 'A:b1': { ...s.models['A:b1']!, damage: { track: 'grid', grids: [{ id: 'main', cols }] } } } }
    const r = applyDamage(s, 'A:b1', 5, { layouts: layoutsOf('f.b'), column: 2 })
    const after = grid(r.state.models['A:b1']!)
    expect(after[1]).toEqual([true, true, true]) // branch 2: boxes 2 and 3 marked, outer first
    expect(after[2]!.slice(0, 3)).toEqual([true, true, true]) // spill: three from the outermost box of branch 3
    expect(after[2]!.slice(3).every((x) => !x)).toBe(true)
    expect(evs(r.events, 'DamageApplied')[0]).toMatchObject({ column: 2, points: 5, boxes: [{ col: 1, row: 1 }, { col: 1, row: 2 }, { col: 2, row: 0 }, { col: 2, row: 1 }, { col: 2, row: 2 }] })
    // wrap: branch 6 is full, a 6 goes to branch 1
    const cols2 = grid(s0().models['A:b1']!).map((c) => [...c])
    cols2[5] = cols2[5]!.map(() => true)
    const w = { ...s0(), models: { ...s0().models, 'A:b1': { ...s0().models['A:b1']!, damage: { track: 'grid' as const, grids: [{ id: 'main' as const, cols: cols2 }] } } } }
    const r2 = applyDamage(w, 'A:b1', 1, { layouts: layoutsOf('f.b'), column: 6 })
    expect(evs(r2.events, 'DamageApplied')[0]!.boxes).toEqual([{ grid: 'main', col: 0, row: 0 }])
  })

  it('FURY-041 filling every Spirit box cripples Spirit; healing one Spirit box restores it', () => {
    const r = applyDamage(s0(), 'A:b1', 5, { layouts: layoutsOf('f.b'), aspect: 'spirit' })
    expect(r.state.models['A:b1']!.crippled).toEqual(['s'])
    expect(evs(r.events, 'AspectCrippled')).toMatchObject([{ modelId: 'A:b1', aspect: 'spirit' }])
    expect(evs(r.events, 'SystemCrippled')).toMatchObject([{ system: 's' }])
    const h = healDamage(r.state, 'A:b1', 1, layoutsOf('f.b'), [{ grid: 'main', col: 1, row: 0 }])
    expect(h.state.models['A:b1']!.crippled).toEqual([])
    expect(evs(h.events, 'AspectRestored')).toMatchObject([{ aspect: 'spirit' }])
    expect(evs(h.events, 'SystemRestored')).toMatchObject([{ system: 's' }])
    const view = spiralView(r.state, B, 'A:b1')
    expect(view.aspects.spirit).toEqual({ total: 5, filled: 5, crippled: true })
    expect(view.aspects.mind).toMatchObject({ total: 5, filled: 0, crippled: false })
  })

  it('FURY-042 crippled Body removes a damage die, crippled Mind an attack die', () => {
    const run = (patch: Partial<ModelState>, boostDmg = false): FlowOut => {
      const s = world([warlock(), beast('A:b1', 5, 0, patch), mk('B:e', 'f.e', 'B', 7.4, 0), enemyLeader({ pos: { x: 30, z: 30 } })], { phase: 'activation', activePlayer: 'A' })
      force(s, [6, 6, 6], [4, 4, 4])
      let out = raiseChooseActivation(s, [])
      out = send(out, { type: 'chooseActivation', activate: 'A:b1' })
      out = send(out, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:b1' })
      out = send(out, { type: 'chooseCombatAction', modelId: 'A:b1', choice: 'melee' })
      out = send(out, { type: 'chooseAttack', modelId: 'A:b1', weaponId: 'f.claw', targetId: 'B:e', additional: false })
      for (let i = 0; i < 6 && ['boostAttack', 'boostDamage'].includes(out.pending.kind); i++) {
        out = out.pending.kind === 'boostDamage' ? send(out, { type: 'boostDamage', boost: boostDmg }) : send(out, { type: 'boostAttack', boost: false })
      }
      return out
    }
    const rolls = (o: FlowOut, p: string) => evs(o.events, 'DiceRolled').filter((e) => e.purpose === p)
    expect(rolls(run({}), 'damage')[0]!.dice).toHaveLength(2)
    expect(rolls(run({ crippled: ['b'] }), 'damage')[0]!.dice).toHaveLength(1)
    expect(rolls(run({ crippled: ['b'] }, true), 'damage')[0]!.dice).toHaveLength(2) // boosted 3d6 becomes 2d6
    expect(rolls(run({}), 'attack')[0]!.dice).toHaveLength(2)
    expect(rolls(run({ crippled: ['m'] }), 'attack')[0]!.dice).toHaveLength(1)
  })

  it('FURY-043 "damage to Mind" marks the lowest-numbered branch with an unmarked Mind box, outermost first', () => {
    const r = applyDamage(s0(), 'A:b1', 2, { layouts: layoutsOf('f.b'), aspect: 'mind' })
    expect(evs(r.events, 'DamageApplied')[0]!.boxes).toEqual([{ grid: 'main', col: 0, row: 0 }, { grid: 'main', col: 0, row: 1 }])
    const more = applyDamage(r.state, 'A:b1', 1, { layouts: layoutsOf('f.b'), aspect: 'mind' })
    expect(evs(more.events, 'DamageApplied')[0]!.boxes).toEqual([{ grid: 'main', col: 2, row: 3 }]) // branch 1 has no Mind left: branch 3
    // an aspect that fills spills the rest as a normal roll from that branch (RULING F10.b)
    const full = applyDamage(s0(), 'A:b1', 7, { layouts: layoutsOf('f.b'), aspect: 'mind' })
    expect(marked(full.state.models['A:b1']!)).toBe(7)
    expect(full.state.models['A:b1']!.crippled).toContain('m')
  })

  it('FURY-046 a warlock spends fury to heal a battlegroup beast in CTRL (crippled aspects first); a Construct cannot be healed', () => {
    const hurt = applyDamage(world([warlock(), beast('A:b1', 3, 0), mk('A:k', 'f.k', 'A', -3, 0), enemyLeader()]), 'A:b1', 5, { layouts: layoutsOf('f.b'), aspect: 'spirit' })
    let s = applyDamage(hurt.state, 'A:b1', 3, { layouts: layoutsOf('f.b'), column: 5 }).state
    s = applyDamage(s, 'A:k', 2, { layouts: layoutsOf('f.k'), column: 1 }).state
    s = { ...s, phase: 'activation', activation: { activeId: 'A:L', modelIds: ['A:L'], limitsUsed: [], healed: 0, spellsCast: [], ran: false, x: {} } as never }
    expect(s.models['A:b1']!.crippled).toEqual(['s'])
    const r = must(heal(s, B, { type: 'heal', decisionId: 'd', player: 'A', casterId: 'A:L', points: 2, targetId: 'A:b1' }))
    expect(r.state.models['A:L']!.fury).toBe(4)
    expect(r.state.models['A:b1']!.crippled).toEqual([]) // the first box healed was a Spirit box
    expect(marked(r.state.models['A:b1']!)).toBe(8 - 2)
    expect(evs(r.events, 'Healed')).toMatchObject([{ modelId: 'A:b1', points: 2 }])
    expect(heal(s, B, { type: 'heal', decisionId: 'd', player: 'A', casterId: 'A:L', points: 1, targetId: 'A:k' })).toHaveProperty('rejection.code', 'E_TARGET_INVALID')
    const far = { ...s, models: { ...s.models, 'A:b1': { ...s.models['A:b1']!, pos: { x: 40, z: 0 } } } }
    expect(heal(far, B, { type: 'heal', decisionId: 'd', player: 'A', casterId: 'A:L', points: 1, targetId: 'A:b1' })).toHaveProperty('rejection.code', 'E_OUT_OF_CTRL')
  })

  const beastAttack = (fury: number): FlowOut => {
    const s = world([warlock(), beast('A:b1', 5, 0, { fury }), mk('B:e', 'f.e', 'B', 7.4, 0), enemyLeader({ pos: { x: 30, z: 30 } })], { phase: 'activation', activePlayer: 'A' })
    force(s, [6, 6], [1, 1], [6, 6], [1, 1])
    let out = raiseChooseActivation(s, [])
    out = send(out, { type: 'chooseActivation', activate: 'A:b1' })
    out = send(out, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:b1' })
    out = send(out, { type: 'chooseCombatAction', modelId: 'A:b1', choice: 'melee' })
    return send(out, { type: 'chooseAttack', modelId: 'A:b1', weaponId: 'f.claw', targetId: 'B:e', additional: false })
  }

  it('FURY-021b in a real attack a beast boost is a force: +1 fury, BeastForced, RollBoosted source fury; at FURY no boost is offered', () => {
    const out = beastAttack(2)
    expect(out.pending.kind).toBe('boostAttack')
    const boost = out.pending.options!.find((o) => o.id === 'boost')!
    expect(boost.cost).toEqual({ focus: 0, forced: 1 })
    const r = send(out, boost.action as unknown as Record<string, unknown>)
    expect(r.state.models['A:b1']!.fury).toBe(3)
    expect(evs(r.events, 'BeastForced')).toMatchObject([{ beastId: 'A:b1', purpose: 'boostAttack', gained: 1, after: 3 }])
    expect(evs(r.events, 'RollBoosted')).toMatchObject([{ roll: 'attack', source: 'fury' }])
    const capped = beastAttack(3)
    expect(capped.pending.kind).not.toBe('boostAttack') // nothing left to force: straight to the roll
  })

  it('FURY-023b additional melee attacks are offered after the initial ones at a forced cost, +1 fury each', () => {
    let out = beastAttack(0)
    out = settle(out)
    out = send(out, { type: 'chooseAttack', modelId: 'A:b1', weaponId: 'f.bite', targetId: 'B:e', additional: false })
    out = settle(out)
    const extra = out.pending.options!.filter((o) => o.id.endsWith(':add'))
    expect(extra.length).toBeGreaterThan(0)
    expect(extra[0]!.cost).toEqual({ focus: 0, forced: 1 })
    out = settle(send(out, extra.find((o) => o.id.startsWith('atk:f.claw'))!.action as unknown as Record<string, unknown>))
    expect(out.state.models['A:b1']!.fury).toBeGreaterThanOrEqual(1)
    expect(evs(out.events, 'BeastForced').filter((e) => e.purpose === 'additionalAttack')).toHaveLength(1)
  })

  it('FURY-025b a beast slam is one force, paid when the movement is declared', () => {
    const s = world([warlock(), beast('A:b1', 5, 0), mk('B:e', 'f.e', 'B', 11, 0), enemyLeader({ pos: { x: 30, z: 30 } })], { phase: 'activation', activePlayer: 'A' })
    let out = raiseChooseActivation(s, [])
    out = send(out, { type: 'chooseActivation', activate: 'A:b1' })
    const slam = out.pending.options!.find((o) => o.id === 'slam')
    expect(slam).toBeDefined()
    expect(slam!.cost).toEqual({ focus: 0, forced: 1 })
    const r = send(out, { type: 'chooseMovement', option: 'slam', modelId: 'A:b1' })
    expect(evs(r.events, 'BeastForced')).toMatchObject([{ purpose: 'powerAttack', gained: 1 }])
    expect(r.state.models['A:b1']!.fury).toBe(1)
    expect(r.pending.kind).toBe('chargeTarget')
  })
})
