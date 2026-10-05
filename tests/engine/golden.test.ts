// GOLD-001: the Quick Start worked turns (docs/spec/13-golden-first-turn.md) replayed through the public engine API
// with the printed dice forced. Positions are the authored ones from that file.
import { beforeAll, describe, expect, it, vi } from 'vitest'

// ---------- forced dice: roll number k (state.rollSeq) gets FORCED[k] when set ----------
const FORCED = new Map<number, number[]>()
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
      const rollId = `r:${state.rollSeq + 1}`
      return {
        state: { ...state, rollSeq: state.rollSeq + 1 },
        event: { type: 'DiceRolled' as const, rollId, purpose: spec.purpose, ownerId: spec.ownerId, dice, kept, total, target: spec.target },
      }
    },
  }
})

import { loadBundle } from '../../src/data/index'
import { createGame, query, step, type Action, type GameEvent, type GameState, type StepResult, type Vec2 } from '../../src/engine/index'

const bundle = loadBundle()
let cur: StepResult
let log: GameEvent[] = []

const ID: Record<string, string> = {}
const id = (k: string): string => { const v = ID[k]; if (!v) throw new Error(`unknown model ${k}`); return v }
const P = (x: number, z: number): Vec2 => ({ x, z })
const S = (): GameState => cur.state

/** Answer the open decision; fails with the engine's message when rejected. */
function act(type: string, fields: Record<string, unknown> = {}): GameEvent[] {
  const a = { type, decisionId: cur.pending.id, player: cur.pending.player, ...fields } as unknown as Action
  const r = step(cur.state, a)
  if (r.rejection) throw new Error(`${type} on ${cur.pending.kind}: ${r.rejection.code} ${r.rejection.message}`)
  cur = r
  log = r.events
  return r.events
}
/** Answer with one of the offered options. */
function pick(optionId: string): GameEvent[] {
  const o = (cur.pending.options ?? []).find((x) => x.id === optionId)
  if (!o) throw new Error(`no option ${optionId} on ${pend()}`)
  const r = step(cur.state, o.action)
  if (r.rejection) throw new Error(`${optionId} on ${cur.pending.kind}: ${r.rejection.code} ${r.rejection.message}`)
  cur = r
  log = r.events
  return r.events
}
/** The next rolls (in engine order) come up with these faces. */
function force(...rolls: number[][]): void { rolls.forEach((f, i) => FORCED.set(S().rollSeq + i, f)) }
const rolls = (ev: GameEvent[] = log) => ev.filter((e): e is Extract<GameEvent, { type: 'DiceRolled' }> => e.type === 'DiceRolled')
const dmgTo = (k: string): number => { const d = S().models[id(k)]!.damage; return d.track === 'single' ? d.filled : d.grids.reduce((a, g) => a + g.cols.flat().filter(Boolean).length, 0) }
const near = (a: Vec2, b: Vec2, tol = 0.01): void => { expect(Math.abs(a.x - b.x), `x ${a.x} vs ${b.x}`).toBeLessThanOrEqual(tol); expect(Math.abs(a.z - b.z), `z ${a.z} vs ${b.z}`).toBeLessThanOrEqual(tol) }
/** Decline end-of-activation movement and finish answering until the next activation choice. */
function finishActivation(): void {
  for (let i = 0; i < 10 && cur.pending.kind !== 'chooseActivation' && cur.pending.kind !== 'gameOver'; i++) {
    if (cur.pending.kind === 'chooseAttack') pick('endAttacks')
    else if (cur.pending.canPass) act('pass')
    else if (cur.pending.kind === 'moveModel') act('moveModel', { modelId: cur.pending.constraints!.modelId, path: [S().models[cur.pending.constraints!.modelId]!.pos] })
    else throw new Error(`finishActivation: ${pend()}`)
  }
}
const focus = (k: string): number => S().models[id(k)]!.focus
const unitOf = (k: string): string => S().models[id(k)]!.unitId!
const pend = (): string => `${cur.pending.kind} [${(cur.pending.options ?? []).map((o) => o.id).join(', ')}]`

describe('GOLD-001 Quick Start worked turns', () => {
  beforeAll(() => {
    cur = createGame({ scenario: 'scn-qs-demo', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }, 'gold-001', bundle)
    for (const m of Object.values(cur.state.models)) {
      const short = m.profileId.replace(/^(kha|cyg)\./, '$1.').replace('hounds-', 'hounds.').replace('black13-', 'black13.')
      ID[short] = m.id
    }
  })

  it('GOLD-001 setup: fixed QS deployment and Prey', () => {
    const at: Record<string, Vec2> = {
      'kha.hounds.tererya': P(-5.9, -12.7), 'kha.hounds.fedyniak': P(-4.6, -12.7), 'kha.hounds.skrobala': P(-3.3, -12.7),
      'kha.vilkul': P(-1.8, -12.7), 'kha.razor': P(0.1, -13.1),
      'cyg.deuce': P(0.1, 8.1), 'cyg.caine': P(1.9, 7.7), 'cyg.black13.ryan': P(3.4, 7.7), 'cyg.black13.glover': P(4.75, 7.7), 'cyg.black13.watts': P(6.05, 7.7),
      'kha.lazarenko': P(2.1, -9.9), 'cyg.falk': P(-1.8, 4.7),
    }
    const byId = Object.fromEntries(Object.entries(at).map(([k, v]) => [id(k), v]))
    for (let i = 0; i < 6 && (cur.pending.kind === 'deploy' || cur.pending.kind === 'advanceDeploy'); i++) {
      const need = (cur.pending.context.data?.modelIds ?? []) as string[]
      act(cur.pending.kind, { placements: need.map((m) => ({ modelId: m, pos: byId[m]! })) })
    }
    expect(cur.pending.kind, pend()).toBe('abilityChoice')
    act('abilityChoice', { optionId: id('kha.razor'), data: cur.pending.context.data })
    expect(S().units[id('cyg.black13.ryan').replace(/\.\d+$/, '')]!.preyId).toBe(id('kha.razor'))
    expect(S().round).toBe(1)
    expect(S().scenario.vp).toEqual({ A: 0, B: 0 })
  })

  it('GOLD-001 K1.control: refill to ARC, Razor powers up, no allocation', () => {
    expect(focus('kha.vilkul')).toBe(6)
    expect(focus('kha.razor')).toBe(1)
    if (cur.pending.kind === 'allocateFocus') act('allocateFocus', { allocation: {} })
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 K1.vilkul: feat (4 clouds), Superiority, Avenging Force, run behind W1', () => {
    act('chooseActivation', { activate: id('kha.vilkul') })
    expect(cur.pending.kind, pend()).toBe('chooseMovement')
    force([1])
    act('useFeat', { casterId: id('kha.vilkul'), featId: 'kha.f.pall-of-ashes', choices: { points: [P(-6.2, -2.6), P(-3.3, -1.8), P(-0.3, -1.8), P(2.6, -2.6)] } })
    expect(S().clouds.length).toBe(4)
    act('castSpell', { casterId: id('kha.vilkul'), spellId: 'kha.s.superiority', targetId: id('kha.razor') })
    expect(focus('kha.vilkul')).toBe(4)
    act('castSpell', { casterId: id('kha.vilkul'), spellId: 'kha.s.avenging-force', targetId: id('kha.razor') })
    expect(focus('kha.vilkul')).toBe(2)
    // R8.6 (rulebook p110): a model carries one friendly upkeep, so Avenging Force replaces Superiority (the QS keeps both)
    expect(S().effects.filter((e) => e.targetIds.includes(id('kha.razor'))).map((e) => e.name)).toEqual(['Avenging Force'])
    act('chooseMovement', { option: 'run', modelId: id('kha.vilkul') })
    act('moveModel', { modelId: id('kha.vilkul'), path: [P(-4.3, -5.0)] })
    expect(S().models[id('kha.vilkul')]!.pos).toEqual(P(-4.3, -5.0))
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 K1.razor: run costs 1 focus, stops short of C3', () => {
    act('chooseActivation', { activate: id('kha.razor') })
    act('chooseMovement', { option: 'run', modelId: id('kha.razor') })
    expect(focus('kha.razor')).toBe(0)
    act('moveModel', { modelId: id('kha.razor'), path: [P(-1.75, -4.0)] })
    expect(S().models[id('kha.razor')]!.pos).toEqual(P(-1.75, -4.0))
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 K1.hounds: Fedyniak runs B2B with Vilkul, the others are placed within 2"', () => {
    act('chooseActivation', { activate: unitOf('kha.hounds.fedyniak') })
    act('chooseMovement', { option: 'run', modelId: id('kha.hounds.fedyniak') })
    act('moveModel', { modelId: id('kha.hounds.fedyniak'), path: [P(-5.49, -6.5), P(-5.49, -5.0)] })
    expect(cur.pending.kind, pend()).toBe('placeTroopers')
    act('placeTroopers', { placements: [{ modelId: id('kha.hounds.tererya'), pos: P(-6.68, -5.0) }, { modelId: id('kha.hounds.skrobala'), pos: P(-7.87, -5.0) }] })
    expect(S().models[id('kha.hounds.skrobala')]!.pos).toEqual(P(-7.87, -5.0))
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 K1.lazarenko: Jack Buster misses Deuce, the blast does nothing', () => {
    act('chooseActivation', { activate: id('kha.lazarenko') })
    act('chooseMovement', { option: 'advance', modelId: id('kha.lazarenko') })
    act('moveModel', { modelId: id('kha.lazarenko'), path: [P(1.0, -4.5)] })
    act('chooseCombatAction', { modelId: id('kha.lazarenko'), choice: 'ranged' })
    force([2, 3], [1, 6])
    const ev = act('chooseAttack', { modelId: id('kha.lazarenko'), weaponId: 'kha.w.jack-buster', targetId: id('cyg.deuce'), additional: false })
    const r = rolls(ev)
    expect([r[0]!.total, r[0]!.target]).toEqual([12, 13]) // 2+3+RAT 7 vs DEF 13: miss
    expect([r[1]!.total, r[1]!.target]).toEqual([14, 19]) // blast 1+6+7 vs ARM 18 + Buckler 1
    expect(dmgTo('cyg.deuce')).toBe(0)
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 K1.end: Khador holds W1 and scores 1', () => {
    act('endTurn')
    expect(S().scenario.vp).toEqual({ A: 1, B: 0 })
    expect(S().scenario.elements['el-w1']?.controller).toBe('A')
    expect(S().scenario.elements['el-w2']?.controller).toBeNull()
    expect(S().activePlayer).toBe('B')
  })

  it('GOLD-001 C1.control: Caine refills, Deuce powers up, 1 focus allocated', () => {
    expect(focus('cyg.caine')).toBe(6)
    expect(focus('cyg.deuce')).toBe(1)
    expect(cur.pending.kind, pend()).toBe('allocateFocus')
    act('allocateFocus', { allocation: { [id('cyg.deuce')]: 1 } })
    expect(focus('cyg.caine')).toBe(5)
    expect(focus('cyg.deuce')).toBe(2)
    while (cur.pending.kind === 'payUpkeep' || cur.pending.kind === 'shake') act('pass')
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 C1.deuce: Accumulator, Beat Back with Powerful Attack, then Decrepitation with Reload', () => {
    act('chooseActivation', { activate: id('cyg.deuce') })
    expect(focus('cyg.deuce')).toBe(3)
    act('chooseMovement', { option: 'advance', modelId: id('cyg.deuce') })
    act('moveModel', { modelId: id('cyg.deuce'), path: [P(0.1, 2.1)] })
    act('chooseCombatAction', { modelId: id('cyg.deuce'), choice: 'ranged' })
    act('chooseAttack', { modelId: id('cyg.deuce'), weaponId: 'cyg.w.spellstorm-cannon', targetId: id('kha.razor'), additional: false, attackType: 'beat-back' })
    expect(cur.pending.kind, pend()).toBe('abilityChoice') // Powerful Attack
    force([1, 3, 4], [2, 2, 3])
    const ev = act('abilityChoice', { optionId: 'powerful' })
    expect(focus('cyg.deuce')).toBe(2)
    const r1 = rolls(ev)
    // R8.6: Avenging Force replaced Superiority on Razor (one friendly upkeep per model), so Razor is DEF 11, not the QS's 13
    expect([r1[0]!.dice, r1[0]!.total, r1[0]!.target]).toEqual([[1, 3, 4], 15, 11]) // hit, no crit
    expect([r1[1]!.total, r1[1]!.target]).toEqual([21, 21]) // 2+2+3+14 vs ARM 19 + Shield 2
    expect(dmgTo('kha.razor')).toBe(0)
    // Beat Back (optional trigger): push Razor 1" away, Deuce follows up 1"
    expect(cur.pending.kind, pend()).toBe('triggerWindow')
    pick('take')
    near(S().models[id('kha.razor')]!.pos, P(-2.0402, -4.9570))
    near(S().models[id('cyg.deuce')]!.pos, P(-0.1902, 1.1430))
    // Reload: one more Spellstorm Cannon attack for 1 focus, Decrepitation, Powerful Attack again
    expect(cur.pending.kind, pend()).toBe('chooseAttack')
    act('chooseAttack', { modelId: id('cyg.deuce'), weaponId: 'cyg.w.spellstorm-cannon', targetId: id('kha.razor'), additional: true, attackType: 'decrepitation' })
    expect(focus('cyg.deuce')).toBe(1)
    force([4, 5, 6], [1, 2, 5, 6], [5])
    const ev2 = act('abilityChoice', { optionId: 'powerful' })
    expect(focus('cyg.deuce')).toBe(0)
    const r2 = rolls(ev2)
    expect([r2[0]!.total, r2[0]!.target]).toEqual([22, 11])
    expect([r2[1]!.dice, r2[1]!.total, r2[1]!.target]).toEqual([[1, 2, 5, 6], 28, 21]) // Decrepitation die vs a construct + boost
    expect(r2[2]!.purpose).toBe('column')
    expect(dmgTo('kha.razor')).toBe(7)
    const g = (S().models[id('kha.razor')]!.damage as { grids: { cols: boolean[][] }[] }).grids[0]!.cols
    expect(g[4]!.every(Boolean)).toBe(true) // column 5 full
    expect(g[5]!.slice(0, 2)).toEqual([true, true]) // then the top two of column 6
    expect(S().models[id('kha.razor')]!.crippled).toEqual([])
    finishActivation()
  })

  it('GOLD-001 C1.caine: Deflection on the army, run behind W2', () => {
    act('chooseActivation', { activate: id('cyg.caine') })
    act('castSpell', { casterId: id('cyg.caine'), spellId: 'cyg.s.deflection' })
    expect(focus('cyg.caine')).toBe(2)
    const defl = S().effects.find((e) => e.name === 'Deflection')!
    for (const k of ['cyg.deuce', 'cyg.falk', 'cyg.black13.ryan', 'cyg.black13.glover', 'cyg.black13.watts']) expect(defl.targetIds).toContain(id(k))
    act('chooseMovement', { option: 'run', modelId: id('cyg.caine') })
    act('moveModel', { modelId: id('cyg.caine'), path: [P(1.9, 6.3), P(7.57, 5.0)] })
    near(S().models[id('cyg.caine')]!.pos, P(7.57, 5.0))
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 C1.falk: through P2 into C2, scattergun spray on Vilkul, Power Field stops it', () => {
    act('chooseActivation', { activate: id('cyg.falk') })
    act('chooseMovement', { option: 'advance', modelId: id('cyg.falk') })
    act('moveModel', { modelId: id('cyg.falk'), path: [P(-3.9, -0.5)] })
    near(S().models[id('cyg.falk')]!.pos, P(-3.9, -0.5))
    act('chooseCombatAction', { modelId: id('cyg.falk'), choice: 'ranged' })
    force([5, 6], [3, 4])
    const ev = act('chooseAttack', { modelId: id('cyg.falk'), weaponId: 'cyg.w.magelock-scattergun', targetId: id('kha.vilkul'), additional: false, attackType: 'decrepitation' })
    const r = rolls(ev)
    expect(ev.filter((e) => e.type === 'AttackResolved').length).toBe(1) // the spray line crosses Vilkul only
    expect([r[0]!.total, r[0]!.target]).toEqual([16, 16]) // 5+6+RAT 7 -2 (Pall of Ashes cloud) vs DEF 16
    expect([r[1]!.total, r[1]!.target]).toEqual([19, 15]) // 3+4+12 vs ARM 15: 4 points
    expect(cur.pending.kind, pend()).toBe('powerField')
    expect(cur.pending.player).toBe('A')
    act('powerField', { spend: 1 })
    expect(focus('kha.vilkul')).toBe(1)
    expect(dmgTo('kha.vilkul')).toBe(0)
    finishActivation()
  })

  it('GOLD-001 C1.black13: Ryan knocks Lazarenko down, Glover Both Barrels, Watts cripples Razor', () => {
    act('chooseActivation', { activate: unitOf('cyg.black13.ryan') })
    act('chooseMovement', { option: 'advance', modelId: id('cyg.black13.ryan') })
    act('moveModel', { modelId: id('cyg.black13.ryan'), path: [P(3.4, 6.2), P(5.19, 5.0)] })
    act('placeTroopers', { placements: [{ modelId: id('cyg.black13.glover'), pos: P(4.0, 5.0) }, { modelId: id('cyg.black13.watts'), pos: P(6.38, 5.0) }] })
    // Ryan: two Magelock Pistol shots with Thunderbolt
    expect(cur.pending.context.modelId).toBe(id('cyg.black13.ryan'))
    act('chooseCombatAction', { modelId: id('cyg.black13.ryan'), choice: 'ranged' })
    force([1, 3])
    let ev = act('chooseAttack', { modelId: id('cyg.black13.ryan'), weaponId: 'cyg.w.magelock-pistol', targetId: id('kha.lazarenko'), additional: false, attackType: 'thunderbolt' })
    expect([rolls(ev)[0]!.total, rolls(ev)[0]!.target]).toEqual([11, 14])
    force([4, 4], [1], [1, 2])
    ev = act('chooseAttack', { modelId: id('cyg.black13.ryan'), weaponId: 'cyg.w.magelock-pistol', targetId: id('kha.lazarenko'), additional: false, attackType: 'thunderbolt' })
    let r = rolls(ev)
    expect([r[0]!.dice, r[0]!.total, r[0]!.target]).toEqual([[4, 4], 15, 14]) // crit: Thunderbolt
    near(S().models[id('kha.lazarenko')]!.pos, P(0.5965, -5.4150)) // pushed d3 = 1" away from Ryan
    expect(S().models[id('kha.lazarenko')]!.conditions).toContain('knockedDown')
    expect([r[2]!.total, r[2]!.target]).toEqual([13, 14])
    expect(dmgTo('kha.lazarenko')).toBe(0)
    // Glover: Both Barrels against the knocked-down Lazarenko (base DEF 5)
    expect(cur.pending.context.modelId).toBe(id('cyg.black13.glover'))
    act('chooseCombatAction', { modelId: id('cyg.black13.glover'), choice: 'specialAttack', abilityId: 'cyg.a.both-barrels' })
    force([1, 5], [2, 2, 3])
    ev = act('chooseAttack', { modelId: id('cyg.black13.glover'), weaponId: 'cyg.w.dual-magelock-pistol', targetId: id('kha.lazarenko'), additional: false, attackType: 'brutal-damage' })
    r = rolls(ev)
    expect([r[0]!.total, r[0]!.target]).toEqual([13, 5])
    expect([r[1]!.dice, r[1]!.total, r[1]!.target]).toEqual([[2, 2, 3], 21, 14]) // +1 Brutal Damage die, +4 Both Barrels
    expect(dmgTo('kha.lazarenko')).toBe(7)
    // Watts: Magelock Rifle at Razor, its Prey
    expect(cur.pending.context.modelId).toBe(id('cyg.black13.watts'))
    act('chooseCombatAction', { modelId: id('cyg.black13.watts'), choice: 'ranged' })
    force([2, 5], [3, 4, 6], [6])
    ev = act('chooseAttack', { modelId: id('cyg.black13.watts'), weaponId: 'cyg.w.magelock-rifle', targetId: id('kha.razor'), additional: false, attackType: 'brutal-damage' })
    r = rolls(ev)
    expect([r[0]!.total, r[0]!.target]).toEqual([16, 11]) // +2 Prey; DEF 11 (no Superiority, see R8.6)
    expect([r[1]!.total, r[1]!.target]).toEqual([25, 21]) // +2 Prey
    expect(r[2]!.dice).toEqual([6])
    expect(dmgTo('kha.razor')).toBe(11)
    const g = (S().models[id('kha.razor')]!.damage as { grids: { cols: boolean[][] }[] }).grids[0]!.cols
    expect(g[5]!.slice(0, 4)).toEqual([true, true, true, true])
    expect(g[0]!.slice(0, 2)).toEqual([true, true]) // spill wraps from column 6 to column 1
    expect(S().models[id('kha.razor')]!.crippled).toEqual(['R'])
    finishActivation()
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 C1.end: each side holds its wall; Khador 2, Cygnar 1', () => {
    act('endTurn')
    expect(S().scenario.vp).toEqual({ A: 2, B: 1 })
    expect(S().scenario.elements['el-w1']?.controller).toBe('A')
    expect(S().scenario.elements['el-w2']?.controller).toBe('B')
    expect(S().round).toBe(2)
    expect(S().activePlayer).toBe('A')
  })

  it('GOLD-001 K2.start and maintenance: clouds gone, Avenging Force advances Razor 3" and its shot misses', () => {
    expect(S().clouds).toEqual([]) // Pall of Ashes ends at the start of Khador's turn
    const names = S().effects.map((e) => e.name).sort()
    expect(names).toEqual(['Avenging Force', 'Deflection']) // Superiority was replaced (R8.6)
    expect(S().phase).toBe('maintenance')
    expect(cur.pending.kind, pend()).toBe('moveModel')
    act('moveModel', { modelId: id('kha.razor'), path: [P(-1.1695, -2.0861)] })
    near(S().models[id('kha.razor')]!.pos, P(-1.1695, -2.0861))
    expect(cur.pending.kind, pend()).toBe('chooseAttack')
    force([1])
    const ev = act('chooseAttack', { modelId: id('kha.razor'), weaponId: 'kha.w.slug-cannon', targetId: id('cyg.deuce'), additional: false })
    expect(rolls(ev)[0]!.dice).toEqual([1]) // R crippled: one die, and no focus outside the activation
    expect(ev.some((e) => e.type === 'AttackResolved' && !e.hit)).toBe(true)
    expect(dmgTo('cyg.deuce')).toBe(0)
  })

  it('GOLD-001 K2.control: refill, power up, 2 focus to Razor, keep Avenging Force', () => {
    expect(focus('kha.vilkul')).toBe(6)
    expect(focus('kha.razor')).toBe(1)
    act('allocateFocus', { allocation: { [id('kha.razor')]: 2 } })
    expect(focus('kha.vilkul')).toBe(4)
    expect(focus('kha.razor')).toBe(3)
    expect(cur.pending.kind, pend()).toBe('payUpkeep')
    const af = S().effects.find((e) => e.name === 'Avenging Force')!
    act('payUpkeep', { keep: [af.id] })
    expect(focus('kha.vilkul')).toBe(3) // the QS pays 2 (Superiority too); see R8.6
    while (cur.pending.kind === 'shake') act('pass')
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 K2.razor: Slug Cannon knocks Deuce down, grenade blast on the Black 13th, Reposition', () => {
    act('chooseActivation', { activate: id('kha.razor') })
    act('chooseMovement', { option: 'advance', modelId: id('kha.razor') })
    act('moveModel', { modelId: id('kha.razor'), path: [P(-0.2, -2.6)] })
    act('chooseCombatAction', { modelId: id('kha.razor'), choice: 'ranged' })
    act('chooseAttack', { modelId: id('kha.razor'), weaponId: 'kha.w.slug-cannon', targetId: id('cyg.deuce'), additional: false })
    expect(cur.pending.kind, pend()).toBe('boostAttack')
    force([5, 5])
    let ev = act('boostAttack', { boost: true })
    expect(focus('kha.razor')).toBe(2)
    let r = rolls(ev)
    expect([r[0]!.dice, r[0]!.total, r[0]!.target]).toEqual([[5, 5], 16, 15]) // 2 - 1 (crippled) + 1 (boost); DEF 13 + Deflection 2
    expect(S().models[id('cyg.deuce')]!.conditions).toContain('knockedDown') // Momentum vs a 50 mm base
    expect(cur.pending.kind, pend()).toBe('boostDamage')
    force([2, 6], [3])
    ev = act('boostDamage', { boost: true })
    expect(focus('kha.razor')).toBe(1)
    r = rolls(ev)
    expect([r[0]!.total, r[0]!.target]).toEqual([24, 19])
    expect(dmgTo('cyg.deuce')).toBe(5)
    const g = (S().models[id('cyg.deuce')]!.damage as { grids: { cols: boolean[][] }[] }).grids[0]!.cols
    expect(g[2]!.slice(0, 5)).toEqual([true, true, true, true, true])
    // Grenade Launcher (L): Ryan in cover behind W2; the blast catches Glover and Watts, not Caine
    expect(cur.pending.kind, pend()).toBe('chooseAttack')
    act('chooseAttack', { modelId: id('kha.razor'), weaponId: 'kha.w.grenade-launcher', targetId: id('cyg.black13.ryan'), additional: false })
    force([3, 6, 6], [2, 4], [3, 5], [2, 2])
    ev = act('boostAttack', { boost: true })
    expect(focus('kha.razor')).toBe(0)
    r = rolls(ev)
    expect([r[0]!.total, r[0]!.target]).toEqual([21, 21]) // DEF 15 + Deflection 2 + cover 4
    const hitIds = ev.filter((e) => e.type === 'DamageRolled').map((e) => (e as { instance: { targetId: string } }).instance.targetId)
    expect(hitIds).toEqual([id('cyg.black13.ryan'), id('cyg.black13.glover'), id('cyg.black13.watts')])
    expect(r.slice(1).map((x) => [x.total, x.target])).toEqual([[16, 12], [13, 12], [9, 12]])
    expect([dmgTo('cyg.black13.ryan'), dmgTo('cyg.black13.glover'), dmgTo('cyg.black13.watts')]).toEqual([4, 1, 0])
    pick('endAttacks') // the R launcher could still shoot (one die fewer); the QS stops here
    // Reposition [3"]: 1.5" toward Deuce
    expect(cur.pending.kind, pend()).toBe('moveModel')
    act('moveModel', { modelId: id('kha.razor'), path: [P(-0.1961, -1.1)] })
    near(S().models[id('kha.razor')]!.pos, P(-0.1961, -1.1))
    expect(query.distance(S(), id('kha.razor'), id('cyg.deuce'))).toBeCloseTo(0.274, 2)
    finishActivation()
    expect(cur.pending.kind, pend()).toBe('chooseActivation')
  })

  it('GOLD-001 K2.vilkul: charge Falk across W1, miss, then an extra boosted axe attack takes him down', () => {
    act('chooseActivation', { activate: id('kha.vilkul') })
    act('chooseMovement', { option: 'charge', modelId: id('kha.vilkul') })
    act('chargeTarget', { targetId: id('cyg.falk') })
    expect(cur.pending.kind, pend()).toBe('moveModel')
    expect(cur.pending.constraints?.straightLine).toBe(true)
    act('moveModel', { modelId: id('kha.vilkul'), path: [P(-4.0344, -2.0118)] }) // 3" straight over W1 (Pathfinder)
    near(S().models[id('kha.vilkul')]!.pos, P(-4.0344, -2.0118))
    expect(query.distance(S(), id('kha.vilkul'), id('cyg.falk'))).toBeCloseTo(0.337, 2)
    act('chooseCombatAction', { modelId: id('kha.vilkul'), choice: 'melee' })
    force([1, 1])
    let ev = act('chooseAttack', { modelId: id('kha.vilkul'), weaponId: 'kha.w.mechanika-axe', targetId: id('cyg.falk'), additional: false, attackType: 'ward-breaker' })
    expect(cur.pending.kind, pend()).toBe('boostAttack')
    ev = act('boostAttack', { boost: false })
    expect(rolls(ev)[0]!.dice).toEqual([1, 1]) // all ones: a miss, and the charge attack's free damage boost is lost
    expect(ev.some((e) => e.type === 'AttackResolved' && !e.hit)).toBe(true)
    // one additional attack for 1 focus, boosted for another
    act('chooseAttack', { modelId: id('kha.vilkul'), weaponId: 'kha.w.mechanika-axe', targetId: id('cyg.falk'), additional: true, attackType: 'ward-breaker' })
    expect(focus('kha.vilkul')).toBe(2) // QS: 2 -> 1 (it paid one more upkeep, see R8.6)
    force([2, 5, 5])
    ev = act('boostAttack', { boost: true })
    expect(focus('kha.vilkul')).toBe(1)
    let r = rolls(ev)
    expect([r[0]!.total, r[0]!.target]).toEqual([19, 15]) // DEF 15, no Deflection in melee
    if (cur.pending.kind === 'boostDamage') { force([1, 4, 4]); ev = act('boostDamage', { boost: false }) }
    r = rolls(ev)
    const dmg = r.find((x) => x.purpose === 'damage')!
    expect([dmg.dice, dmg.total, dmg.target]).toEqual([[1, 4, 4], 22, 12]) // 2 + Weapon Master; not a charge attack
    const life = ev.filter((e) => e.type === 'LifeStateChanged' && e.modelId === id('cyg.falk')).map((e) => (e as { to: string }).to)
    // Vilkul's Take Down (data, unverified on the QS card) removes a model boxed by her melee attack from play,
    // so Falk is boxed and removed rather than destroyed (the QS narrates a plain destruction)
    expect(life).toEqual(['disabled', 'boxed'])
    expect(ev.some((e) => e.type === 'ModelRemoved' && e.modelId === id('cyg.falk') && e.reason === 'removedFromPlay')).toBe(true)
  })

  it('GOLD-001 STOP: end state after Vilkul (QS p47)', () => {
    expect(S().round).toBe(2)
    expect(S().activePlayer).toBe('A')
    expect(S().phase).toBe('activation')
    expect(S().scenario.vp).toEqual({ A: 2, B: 1 })
    expect(S().models[id('cyg.falk')]!.life).toBe('boxed') // removed from play by Take Down
    expect(S().models[id('cyg.deuce')]!.conditions).toContain('knockedDown')
    expect(S().models[id('kha.lazarenko')]!.conditions).toContain('knockedDown')
    expect([dmgTo('kha.razor'), dmgTo('cyg.deuce'), dmgTo('kha.lazarenko'), dmgTo('kha.vilkul')]).toEqual([11, 5, 7, 0])
    expect([focus('kha.razor'), focus('cyg.caine'), focus('cyg.deuce')]).toEqual([0, 2, 0])
    const at: [string, number, number][] = [
      ['kha.vilkul', -4.0344, -2.0118], ['kha.razor', -0.1961, -1.1], ['kha.lazarenko', 0.5965, -5.415],
      ['kha.hounds.fedyniak', -5.49, -5.0], ['kha.hounds.tererya', -6.68, -5.0], ['kha.hounds.skrobala', -7.87, -5.0],
      ['cyg.deuce', -0.1902, 1.143], ['cyg.caine', 7.57, 5.0], ['cyg.black13.glover', 4.0, 5.0], ['cyg.black13.ryan', 5.19, 5.0], ['cyg.black13.watts', 6.38, 5.0],
    ]
    for (const [k, x, z] of at) near(S().models[id(k)]!.pos, P(x, z))
  })
})
