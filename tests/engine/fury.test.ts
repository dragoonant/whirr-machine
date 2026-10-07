// FURY-001..012, 020..030, 044..048: fury economy, leeching, Spirit Bond, upkeep, threshold, forcing, wildness, shake.
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

import { isRejection } from '../../src/engine/focus'
import {
  applyAdjustFury, canForce, clampFury, force, furyInfo, markWildBeasts, maintenanceFury, onBeastLeavesPlay, shed, spiritBondPoints,
  startingFury, takeControl, validateAdjustFury, validateLeech, validateTakeControl,
} from '../../src/engine/fury'
import { applyEffect } from '../../src/engine/effects'
import { maintenanceFocus, spendFocus } from '../../src/engine/focus'
import { raiseChooseActivation } from '../../src/engine/turnflow'
import { raiseLeech } from '../../src/engine/pending'
import { handleActivationAction, moverInfo } from '../../src/engine/phases/activation'
import { movementOptions } from '../../src/engine/movement'
import { answerControl, continueControl, runControl, shakeOptions } from '../../src/engine/phases/control'
import { afterDeaths } from '../../src/engine/scenario'
import { legalActions, query, validate } from '../../src/engine/index'
import type { Action } from '../../src/engine/actions'
import type { GameEvent } from '../../src/engine/events'
import type { GameState, ModelState } from '../../src/engine/types'
import { BUNDLE as B, beast, enemyLeader, mk, warlock, world } from './fury-helpers'
import { must } from './turn-helpers'

const force2 = (s: GameState, ...rolls: number[][]): void => rolls.forEach((f, i) => FORCED.set(s.rollSeq + i, f))
const evs = (events: GameEvent[], type: string) => events.filter((e) => e.type === type)
const ctl = (o: ReturnType<typeof answerControl>) => must(o)
const actStub = (ids: string[], limitsUsed: string[] = []) => ({ activeId: ids[0]!, modelIds: ids, limitsUsed, perModel: {}, spellsCast: [], healed: 0, featUsed: false, ran: false, charge: null, aimed: false, moved: 0, movedModelId: null, movement: null, x: { channelVia: null } }) as unknown as GameState['activation']
const filled = (m: ModelState): number => (m.damage.track === 'grid' ? m.damage.grids[0]!.cols.flat().filter(Boolean).length : 0)
const leechAct = (s: GameState, from: Record<string, number>, self = 0): Action => ({ type: 'leech', decisionId: s.pending.id, player: 'A', warlockId: 'A:L', from, self })

describe('FURY economy and Control order', () => {
  it('FURY-001 a warlock starts with fury = ARC, beasts with 0, and focus stays 0', () => {
    const s = world([{ ...warlock(), fury: undefined, focus: 6 }, { ...beast('A:b1', 3, 0), fury: undefined }, enemyLeader()])
    const r = startingFury(s, B)
    expect(r.state.models['A:L']).toMatchObject({ fury: 6, focus: 0 })
    expect(r.state.models['A:b1']!.fury).toBe(0)
    expect(evs(r.events, 'FuryChanged')).toMatchObject([{ modelId: 'A:L', delta: 6, after: 6, reason: 'start' }])
  })

  it('FURY-002 Maintenance trims a warlock above ARC and leaves beast fury alone', () => {
    const s = world([warlock({ fury: 8 }), beast('A:b1', 3, 0, { fury: 3 }), enemyLeader()])
    const r = maintenanceFocus(s, B, 'A')
    expect(r.state.models['A:L']!.fury).toBe(6)
    expect(r.state.models['A:b1']!.fury).toBe(3)
    expect(evs(r.events, 'FuryChanged')).toMatchObject([{ modelId: 'A:L', reason: 'trim', after: 6 }])
    expect(maintenanceFury(s, B, 'A').state.models['A:b1']!.fury).toBe(3)
  })

  it('FURY-003 leech cap: ARC 7, warlock at 2, two beasts at 3: {3,3} is E_FURY_CAP, {3,2} works', () => {
    const s = world([mk('A:L', 'f.w7', 'A', 0, 0, { fury: 2 }), beast('A:b1', 3, 0, { fury: 3 }), beast('A:b2', -3, 0, { fury: 3 }), enemyLeader()])
    const c = continueControl(s, B, 'leech')
    expect(c.pending?.kind).toBe('leech')
    expect(answerControl(c.state, B, leechAct(c.state, { 'A:b1': 3, 'A:b2': 3 }))).toHaveProperty('rejection.code', 'E_FURY_CAP')
    force2(c.state, [1, 1]) // the lone threshold check afterwards
    const r = ctl(answerControl(c.state, B, leechAct(c.state, { 'A:b1': 3, 'A:b2': 2 })))
    expect(r.state.models['A:L']!.fury).toBe(7)
    expect([r.state.models['A:b1']!.fury, r.state.models['A:b2']!.fury]).toEqual([0, 1])
    expect(evs(r.events, 'FuryLeeched')).toMatchObject([{ warlockId: 'A:L', selfPoints: 0, spiritBond: 0, after: 7 }])
  })

  it('FURY-004 leeching rejects out-of-CTRL beasts, other battlegroups and wild beasts', () => {
    const s = world([warlock({ fury: 0 }), beast('A:far', 40, 0, { fury: 2 }), beast('A:alien', 3, 0, { fury: 2, controllerId: 'B:L' }), beast('A:wild', -3, 0, { fury: 0, wild: true, inert: true }), enemyLeader()])
    const base = { warlockId: 'A:L', player: 'A' as const, self: 0 }
    expect(validateLeech(s, B, { ...base, from: { 'A:far': 1 } })?.code).toBe('E_OUT_OF_CTRL')
    expect(validateLeech(s, B, { ...base, from: { 'A:alien': 1 } })?.code).toBe('E_TARGET_INVALID')
    expect(validateLeech(s, B, { ...base, from: { 'A:wild': 1 } })?.code).toBe('E_TARGET_INVALID')
  })

  it('FURY-005 self-leech gives fury, costs damage points, and raises no transfer prompt', () => {
    const s = world([warlock({ fury: 3 }), enemyLeader()])
    const c = continueControl(s, B, 'leech')
    const r = ctl(answerControl(c.state, B, leechAct(c.state, {}, 2)))
    expect(r.state.models['A:L']!.fury).toBe(5)
    expect(filled(r.state.models['A:L']!)).toBe(2)
    expect(r.pending?.kind).not.toBe('transferDamage')
    expect(evs(r.events, 'FuryChanged').map((e) => (e as { reason: string }).reason)).toContain('leechSelf')
  })

  it('FURY-006 self-leech that fills the last box disables the warlock; a Tough warlock rolls Tough', () => {
    const last = (profile: string): GameState => {
      let w = mk('A:L', profile, 'A', 0, 0, { fury: 3 })
      const cols = w.damage.track === 'grid' ? w.damage.grids[0]!.cols.map((c) => c.map(() => true)) : []
      cols[0]![0] = false // one unmarked box left
      w = { ...w, damage: { track: 'grid', grids: [{ id: 'main', cols }] } }
      return world([w, enemyLeader()])
    }
    const s1 = last('f.w')
    const c1 = raiseLeech(s1, B, 'A:L')
    const r1 = ctl(answerControl(c1.state, B, leechAct(c1.state, {}, 1)))
    expect(r1.state.models['A:L']!.life).toBe('destroyed') // no Tough: disabled, boxed, destroyed
    expect(r1.state.phase).toBe('ended') // the assassination ends the game
    const s2 = last('f.wt')
    const c2 = raiseLeech(s2, B, 'A:L')
    force2(c2.state, [2], [5]) // column roll, then Tough 5 heals 1
    const r2 = ctl(answerControl(c2.state, B, leechAct(c2.state, {}, 1)))
    expect(r2.events.some((e) => e.type === 'DiceRolled' && e.purpose === 'tough')).toBe(true)
    expect(r2.state.models['A:L']!.life).toBe('active')
    expect(r2.state.models['A:L']!.conditions).toContain('knockedDown')
  })

  it('FURY-007 Spirit Bond: +1 per medium-or-larger destroyed beast, auto-applied after leeching, never above ARC', () => {
    const gone = [beast('A:d1', 3, 0, { life: 'destroyed', bondedTo: 'A:L' }), beast('A:d2', -3, 0, { life: 'destroyed', bondedTo: 'A:L', base: 30 }), beast('A:d3', 6, 0, { life: 'destroyed', bondedTo: 'A:L', base: 40 })]
    const s = world([warlock({ fury: 3 }), ...gone, enemyLeader()])
    expect(spiritBondPoints(s, s.models['A:L']!)).toBe(2) // 50 mm and 40 mm count, 30 mm does not
    const c = continueControl(s, B, 'leech')
    const r = ctl(answerControl(c.state, B, leechAct(c.state, {})))
    expect(r.state.models['A:L']!.fury).toBe(5)
    expect(evs(r.events, 'FuryLeeched')).toMatchObject([{ spiritBond: 2, after: 5 }])
    // at ARC there is no room: nothing happens and no decision is raised
    const full = continueControl(world([warlock({ fury: 6 }), ...gone, enemyLeader()]), B, 'leech')
    expect(full.pending?.kind).not.toBe('leech')
    expect(full.state.models['A:L']!.fury).toBe(6)
  })

  it('FURY-008 a beast back in play, or one that was wild when it died, never counts', () => {
    const back = beast('A:d1', 3, 0, { life: 'active', bondedTo: undefined })
    const s = world([warlock(), back, enemyLeader()])
    expect(spiritBondPoints(s, s.models['A:L']!)).toBe(0)
    const wildDead = world([warlock(), beast('A:w', 3, 0, { life: 'destroyed', wild: true, inert: true, controllerId: undefined }), enemyLeader()])
    const r = onBeastLeavesPlay(wildDead, B, 'A:w')
    expect(r.state.models['A:w']!.bondedTo).toBeUndefined()
    expect(spiritBondPoints(r.state, r.state.models['A:L']!)).toBe(0)
  })

  it('FURY-009 a beast leeched to 0 makes no threshold roll, and upkeep is paid after leeching', () => {
    let s = world([warlock({ fury: 2 }), beast('A:b1', 3, 0, { fury: 3 }), enemyLeader()])
    s = applyEffect(s, { sourceId: 'x.up', name: 'Test Upkeep', owner: 'A', casterId: 'A:L', targetIds: ['A:L'], mods: [], duration: 'upkeep', upkeep: { casterId: 'A:L' } }).state
    const c = runControl(s, B)
    expect(c.pending?.kind).toBe('leech')
    const max = c.pending!.options!.find((o) => o.id === 'max')!
    const r1 = ctl(answerControl(c.state, B, max.action))
    expect(r1.pending?.kind).toBe('payUpkeep') // allocate was skipped, upkeep next
    const r2 = ctl(answerControl(r1.state, B, r1.pending!.options![0]!.action))
    const all = [...r1.events, ...r2.events]
    expect(all.some((e) => e.type === 'ThresholdChecked')).toBe(false)
    const iLeech = all.findIndex((e) => e.type === 'FuryChanged' && e.reason === 'leech')
    const iPaid = all.findIndex((e) => e.type === 'UpkeepPaid')
    expect(iLeech).toBeGreaterThanOrEqual(0)
    expect(iPaid).toBeGreaterThan(iLeech)
  })

  it('FURY-010 upkeep costs the warlock 1 fury each; too many is E_INSUFFICIENT_FURY and the rest expire', () => {
    let s = world([warlock({ fury: 1 }), enemyLeader()])
    const mkUp = (n: string) => { const r = applyEffect(s, { sourceId: `x.${n}`, name: n, owner: 'A', casterId: 'A:L', targetIds: ['A:L'], mods: [], duration: 'upkeep', upkeep: { casterId: 'A:L' } }); s = r.state; return r.effect.id }
    const e1 = mkUp('One'), e2 = mkUp('Two')
    const c = continueControl(s, B, 'upkeep')
    expect(c.pending?.kind).toBe('payUpkeep')
    expect(answerControl(c.state, B, { type: 'payUpkeep', decisionId: c.pending!.id, player: 'A', keep: [e1, e2] })).toHaveProperty('rejection.code', 'E_INSUFFICIENT_FURY')
    const r = ctl(answerControl(c.state, B, { type: 'payUpkeep', decisionId: c.pending!.id, player: 'A', keep: [e1] }))
    expect(r.state.models['A:L']!.fury).toBe(0)
    expect(r.state.effects.map((e) => e.id)).toEqual([e1])
    expect(r.events.some((e) => e.type === 'EffectExpired' && e.reason === 'upkeepDropped')).toBe(true)
  })

  it('FURY-011 threshold: total above THR frenzies, equal passes', () => {
    const mkS = () => {
      let s = world([warlock({ fury: 6 }), beast('A:b1', 3, 0, { fury: 3 }), enemyLeader()])
      s = applyEffect(s, { sourceId: 'x.thr', name: 'Thr', owner: 'A', targetIds: ['A:b1'], mods: [{ stat: 'THR', value: 1, mode: 'add' }], duration: 'round' }).state // THR 9
      return s
    }
    const s1 = mkS(); force2(s1, [3, 3])
    const r1 = continueControl(s1, B, 'threshold')
    expect(evs(r1.events, 'ThresholdChecked')).toMatchObject([{ beastId: 'A:b1', fury: 3, thr: 9, total: 9, frenzied: false }])
    const s2 = mkS(); force2(s2, [3, 4])
    const r2 = continueControl(s2, B, 'threshold')
    expect(evs(r2.events, 'ThresholdChecked')).toMatchObject([{ total: 10, frenzied: true }])
    expect(evs(r2.events, 'Frenzied').length).toBe(1)
  })

  it('FURY-012 a Construct beast with fury makes no threshold roll', () => {
    const s = world([warlock(), mk('A:k', 'f.k', 'A', 3, 0, { fury: 3 }), enemyLeader()])
    const r = continueControl(s, B, 'threshold')
    expect(evs(r.events, 'ThresholdChecked')).toEqual([])
    expect(evs(r.events, 'DiceRolled')).toEqual([])
  })
})

describe('FURY forcing, rile, shed, animi', () => {
  const act = (s: GameState): GameState => ({ ...s, phase: 'activation', activation: actStub(['A:b1']) })

  it('FURY-020 a beast outside CTRL is offered no run or charge, and run is E_OUT_OF_CTRL', () => {
    let s = world([warlock(), beast('A:b1', 30, 0), mk('B:L', 'f.el', 'B', 30, 8)])
    s = { ...s, phase: 'activation', activePlayer: 'A' }
    const out = raiseChooseActivation(s, [])
    const r = must(handleActivationAction(out.state, B, { type: 'chooseActivation', decisionId: out.pending.id, player: 'A', activate: 'A:b1' } as Action)!)
    const opts = r.pending.options!.map((o) => o.id)
    expect(opts).toContain('advance')
    expect(opts).not.toContain('run')
    expect(opts).not.toContain('charge')
    const bad = handleActivationAction(r.state, B, { type: 'chooseMovement', decisionId: r.pending.id, player: 'A', option: 'run', modelId: 'A:b1' } as Action)!
    expect(bad).toHaveProperty('rejection.code', 'E_OUT_OF_CTRL')
    // in CTRL the same options exist and cost a force
    const near = world([warlock(), beast('A:b1', 5, 0), mk('B:L', 'f.el', 'B', 30, 8)], { phase: 'activation' })
    const info = movementOptions(near, 'A:b1', moverInfo(near, B, 'A:b1'))
    expect(info.find((o) => o.option === 'run')).toMatchObject({ allowed: true, focusCost: 1 })
  })

  it('FURY-021 forcing stops at FURY: at 3 of 3 it is E_FURY_CAP, at 2 it works and says BeastForced', () => {
    const full = world([warlock(), beast('A:b1', 3, 0, { fury: 3 }), enemyLeader()])
    expect(canForce(full, B, 'A:b1', 1, 'boostAttack')?.code).toBe('E_FURY_CAP')
    const s = world([warlock(), beast('A:b1', 3, 0, { fury: 2 }), enemyLeader()])
    const r = must(force(s, B, 'A:b1', 1, 'boostAttack'))
    expect(r.state.models['A:b1']!.fury).toBe(3)
    expect(evs(r.events, 'BeastForced')).toMatchObject([{ beastId: 'A:b1', controllerId: 'A:L', purpose: 'boostAttack', gained: 1, after: 3 }])
    expect(evs(r.events, 'FuryChanged')).toMatchObject([{ modelId: 'A:b1', delta: 1, reason: 'forced' }])
  })

  it('FURY-022 Spirit crippled: every force is E_CRIPPLED, the beast can still advance', () => {
    const s = world([warlock(), beast('A:b1', 3, 0, { crippled: ['s'] }), enemyLeader()], { phase: 'activation' })
    expect(canForce(s, B, 'A:b1', 1)?.code).toBe('E_CRIPPLED')
    expect(furyInfo(s, B, 'A:b1')).toMatchObject({ forceable: false, block: 'spirit' })
    const opts = movementOptions(s, 'A:b1', moverInfo(s, B, 'A:b1'))
    expect(opts.find((o) => o.option === 'advance')!.allowed).toBe(true)
    expect(opts.find((o) => o.option === 'run')!.allowed).toBe(false)
  })

  it('FURY-023 each additional melee attack forces the beast once (+1 fury each)', () => {
    let s = world([warlock({ fury: 6 }), beast('A:b1', 3, 0), enemyLeader()])
    const a = must(force(s, B, 'A:b1', 1, 'additionalAttack'))
    const b2 = must(force(a.state, B, 'A:b1', 1, 'additionalAttack'))
    expect(b2.state.models['A:b1']!.fury).toBe(2)
    expect(evs([...a.events, ...b2.events], 'BeastForced').map((e) => (e as { purpose: string }).purpose)).toEqual(['additionalAttack', 'additionalAttack'])
    s = b2.state
    expect(furyInfo(s, B, 'A:b1').room).toBe(1)
  })

  it('FURY-024 a warlock pays its own fury for boosts and additional attacks; a beast is forced instead', () => {
    const s = world([warlock({ fury: 3 }), beast('A:b1', 3, 0), enemyLeader()])
    const boost = must(spendFocus(s, 'A:L', 1, 'boostAttack', B))
    expect(boost.state.models['A:L']!.fury).toBe(2)
    expect(boost.events).toMatchObject([{ type: 'FuryChanged', modelId: 'A:L', delta: -1, reason: 'spend', purpose: 'boostAttack' }])
    const extra = must(spendFocus(boost.state, 'A:L', 1, 'additionalAttack', B))
    expect(extra.state.models['A:L']!.fury).toBe(1)
    expect(spendFocus(s, 'A:L', 4, 'boostAttack', B)).toHaveProperty('rejection.code', 'E_INSUFFICIENT_FURY')
    const forced = must(spendFocus(s, 'A:b1', 1, 'boostAttack', B))
    expect(forced.state.models['A:b1']!.fury).toBe(1)
    expect(forced.state.models['A:L']!.fury).toBe(3) // the warlock pays nothing for a force
    expect(canForce(s, B, 'A:L', 1)?.code).toBe('E_CANNOT_FORCE')
  })

  it('FURY-025 beast headbutt costs +1 at the combat choice and is not offered with Mind crippled', () => {
    const mkAt = (patch: Partial<ModelState>): GameState => {
      const s = world([warlock(), beast('A:b1', 5, 0, patch), mk('B:e', 'f.e', 'B', 7.4, 0), mk('B:L', 'f.el', 'B', 30, 8)], { phase: 'activation' })
      const out = raiseChooseActivation(s, [])
      const r1 = must(handleActivationAction(out.state, B, { type: 'chooseActivation', decisionId: out.pending.id, player: 'A', activate: 'A:b1' } as Action)!)
      const r2 = must(handleActivationAction(r1.state, B, { type: 'chooseMovement', decisionId: r1.pending.id, player: 'A', option: 'forfeit', modelId: 'A:b1' } as Action)!)
      return r2.state
    }
    const ok = mkAt({})
    const hb = ok.pending.options!.find((o) => o.id.startsWith('powerAttack') && o.label === 'Headbutt')
    expect(hb).toBeDefined()
    expect(hb!.cost).toEqual({ focus: 0, forced: 1 })
    const paid = must(handleActivationAction(ok, B, hb!.action)!)
    expect(paid.state.models['A:b1']!.fury).toBe(1)
    expect(evs(paid.events, 'BeastForced')).toMatchObject([{ purpose: 'powerAttack', gained: 1 }])
    const mind = mkAt({ crippled: ['m'] })
    expect(mind.pending.options!.some((o) => o.label === 'Headbutt')).toBe(false)
  })

  it('FURY-026 rile adds fury up to FURY, and is rejected above it', () => {
    let s = world([warlock(), beast('A:b1', 3, 0, { fury: 1 }), enemyLeader()], { activation: actStub(['A:b1']) })
    s = applyEffect(s, { sourceId: 'x.f', name: 'Bigger', owner: 'A', targetIds: ['A:b1'], mods: [{ stat: 'FURY', value: 1, mode: 'add' }], duration: 'round' }).state // FURY 4
    const act = (delta: number) => ({ type: 'adjustFury' as const, decisionId: 'd', player: 'A' as const, modelId: 'A:b1', delta })
    const r = must(applyAdjustFury(s, B, act(2)))
    expect(r.state.models['A:b1']!.fury).toBe(3)
    expect(evs(r.events, 'BeastForced')).toMatchObject([{ purpose: 'rile', gained: 2 }])
    expect(validateAdjustFury(s, B, act(4) as never)?.code).toBe('E_FURY_CAP')
  })

  it('FURY-027 shed removes the warlock\'s own fury; shedding more than it has is rejected', () => {
    const s = world([warlock({ fury: 5 }), enemyLeader()], { activation: actStub(['A:L']) })
    const r = must(applyAdjustFury(s, B, { type: 'adjustFury', decisionId: 'd', player: 'A', modelId: 'A:L', delta: -3 }))
    expect(r.state.models['A:L']!.fury).toBe(2)
    expect(evs(r.events, 'FuryChanged')).toMatchObject([{ reason: 'shed', delta: -3 }])
    expect(applyAdjustFury(s, B, { type: 'adjustFury', decisionId: 'd', player: 'A', modelId: 'A:L', delta: -6 })).toHaveProperty('rejection.code', 'E_INSUFFICIENT_FURY')
  })

  const animusBundle = (): void => { /* the animus record is added to the shared bundle once */ }
  animusBundle()
  B.byId['f.s.roar'] = { id: 'f.s.roar', name: 'Test Roar', cost: 2, rng: 'SELF', dur: 'RND', animus: true, effect: [{ op: 'modStat', stat: 'SPD', value: 1 }], scope: { who: 'self' } }
  B.byId['f.s.roar2'] = { id: 'f.s.roar2', name: 'Test Roar Two', cost: 1, rng: 'SELF', dur: 'RND', animus: true, effect: [{ op: 'modStat', stat: 'DEF', value: 1 }], scope: { who: 'self' } }
  B.byId['f.b.an'] = { ...(B.byId['f.b'] as object), id: 'f.b.an', animus: 'f.s.roar' } as never
  B.byId['f.b.an2'] = { ...(B.byId['f.b'] as object), id: 'f.b.an2', animus: 'f.s.roar2' } as never

  it('FURY-028 a beast forced to cast its animus gains the COST, once per activation, within FURY', async () => {
    const { castSpell } = await import('../../src/engine/spells')
    const mkB = (fury: number, limits: string[] = []): GameState => world([warlock(), mk('A:b1', 'f.b.an', 'A', 3, 0, { fury }), enemyLeader()], { phase: 'activation', activation: actStub(['A:b1'], limits) })
    const cast = (s: GameState) => castSpell(s, B, { type: 'castSpell', decisionId: 'd', player: 'A', casterId: 'A:b1', spellId: 'f.s.roar', targetId: 'A:b1' } as never)
    const ok = must(cast(mkB(0)))
    expect(ok.state.models['A:b1']!.fury).toBe(2)
    expect(ok.events.find((e) => e.type === 'SpellCast')).toMatchObject({ forced: true, animus: true, cost: 2 })
    expect(cast({ ...ok.state })).toHaveProperty('rejection.code', 'E_ALREADY_USED')
    expect(cast(mkB(2))).toHaveProperty('rejection.code', 'E_FURY_CAP')
  })

  it('FURY-029 a warlock casts a battlegroup animus for fury while the beast is in CTRL; out of CTRL it is not offered', async () => {
    const { castSpell, anytimeOptions } = await import('../../src/engine/spells')
    const mkW = (x: number): GameState => world([warlock({ fury: 4 }), mk('A:b1', 'f.b.an', 'A', x, 0), enemyLeader()], { phase: 'activation', activation: actStub(['A:L']) })
    const cast = (s: GameState) => castSpell(s, B, { type: 'castSpell', decisionId: 'd', player: 'A', casterId: 'A:L', spellId: 'f.s.roar', animusOf: 'A:b1', targetId: 'A:b1' } as never)
    const s = mkW(5)
    const r = must(cast(s))
    expect(r.state.models['A:L']!.fury).toBe(2)
    expect(r.events.find((e) => e.type === 'SpellCast')).toMatchObject({ casterId: 'A:L', animus: true })
    expect(anytimeOptions(s, B, 'A:L', 'd:1').some((o) => o.id === 'animus:A:b1')).toBe(true)
    const far = mkW(40)
    expect(cast(far)).toHaveProperty('rejection.code', 'E_OUT_OF_CTRL')
    expect(anytimeOptions(far, B, 'A:L', 'd:1').some((o) => o.id === 'animus:A:b1')).toBe(false)
  })

  it('FURY-030 a model carries one friendly animus: a newer one replaces the older', async () => {
    const { castSpell } = await import('../../src/engine/spells')
    let s = world([warlock({ fury: 6 }), mk('A:b1', 'f.b.an', 'A', 3, 0), mk('A:b2', 'f.b.an2', 'A', -3, 0), enemyLeader()], { phase: 'activation', activation: actStub(['A:L']) })
    const c1 = must(castSpell(s, B, { type: 'castSpell', decisionId: 'd', player: 'A', casterId: 'A:L', spellId: 'f.s.roar', animusOf: 'A:b1', targetId: 'A:L' } as never))
    s = c1.state
    expect(s.effects.filter((e) => e.targetIds.includes('A:L')).map((e) => e.sourceId)).toEqual(['f.s.roar'])
    const c2 = must(castSpell(s, B, { type: 'castSpell', decisionId: 'd', player: 'A', casterId: 'A:L', spellId: 'f.s.roar2', animusOf: 'A:b2', targetId: 'A:L' } as never))
    expect(c2.state.effects.filter((e) => e.targetIds.includes('A:L')).map((e) => e.sourceId)).toEqual(['f.s.roar2'])
  })

  it('FURY-047 C7 shake: a warlock pays 1 fury, a beast in CTRL is forced (+1); a beast out of CTRL is not offered', () => {
    const s = world([warlock({ fury: 1, conditions: ['knockedDown'] }), beast('A:b1', 3, 0, { conditions: ['stationary'] }), beast('A:far', 40, 0, { conditions: ['stationary'] }), enemyLeader()])
    const offered = shakeOptions(s, 'A', B).map((o) => o.modelId)
    expect(offered).toEqual(expect.arrayContaining(['A:L', 'A:b1']))
    expect(offered).not.toContain('A:far')
    const c = continueControl(s, B, 'shake')
    expect(c.pending?.kind).toBe('shake')
    const r = ctl(answerControl(c.state, B, c.pending!.options!.find((o) => o.id === 'shakeAll')!.action))
    expect(r.state.models['A:L']).toMatchObject({ fury: 0, conditions: [] })
    expect(r.state.models['A:b1']).toMatchObject({ fury: 1, conditions: [] })
  })

  it('FURY-048 when current FURY drops below the fury held, the excess is removed at once (capTrim)', () => {
    let s = world([warlock(), beast('A:b1', 3, 0, { fury: 3 }), enemyLeader()])
    s = applyEffect(s, { sourceId: 'x.d', name: 'Drained', owner: 'B', targetIds: ['A:b1'], mods: [{ stat: 'FURY', value: -1, mode: 'add' }], duration: 'round' }).state
    const r = clampFury(s, B)
    expect(r.state.models['A:b1']!.fury).toBe(2)
    expect(evs(r.events, 'FuryChanged')).toMatchObject([{ reason: 'capTrim', delta: -1 }])
  })
})

describe('FURY wild beasts and control', () => {
  it('FURY-044 a destroyed warlock turns its beasts wild: fury 0, inert, upkeeps ended, no activation, DEF 5', () => {
    let s = world([warlock({ fury: 2, life: 'destroyed' }), beast('A:b1', 3, 0, { fury: 2 }), enemyLeader()])
    s = applyEffect(s, { sourceId: 'x.up', name: 'Held', owner: 'A', casterId: 'A:L', targetIds: ['A:b1'], mods: [], duration: 'upkeep', upkeep: { casterId: 'A:L' } }).state
    const r = afterDeaths(s, B)
    const m = r.state.models['A:b1']!
    expect(m).toMatchObject({ wild: true, inert: true, fury: 0 })
    expect(r.state.effects).toEqual([])
    expect(evs(r.events, 'BeastWild')).toMatchObject([{ modelId: 'A:b1', warlockId: 'A:L' }])
    expect(evs(r.events, 'FuryChanged')).toMatchObject([{ modelId: 'A:b1', reason: 'wild', delta: -2 }])
    expect(r.state.phase).toBe('ended')
    const w = markWildBeasts(world([warlock(), beast('A:b1', 3, 0), enemyLeader()]), 'A:L')
    expect(canForce(w.state, B, 'A:b1', 1)?.code).toBe('E_CANNOT_FORCE')
    expect(furyInfo(w.state, B, 'A:b1').block).toBe('wild')
    const out = raiseChooseActivation({ ...w.state, phase: 'activation' }, [])
    expect(handleActivationAction(out.state, B, { type: 'chooseActivation', decisionId: out.pending.id, player: 'A', activate: 'A:b1' } as Action)).toHaveProperty('rejection.code', 'E_TARGET_INVALID')
  })

  it('FURY-045 take control: same-Faction warlock within 1" pays 1 fury; other Faction or 1.5" away is rejected', () => {
    const wildB = (x: number): ModelState => beast('A:w', x, 0, { wild: true, inert: true, controllerId: undefined, fury: 0 })
    const a = (target = 'A:w'): Action => ({ type: 'takeControl', decisionId: 'd', player: 'A', casterId: 'A:L', targetId: target })
    const mkS = (x: number, wl = warlock({ fury: 3 })): GameState => world([wl, wildB(x), enemyLeader()], { activation: actStub(['A:L']) })
    const near = mkS(0.79 + 0.98 + 0.5) // 0.5" apart
    const r = must(takeControl(near, B, a() as never))
    expect(r.state.models['A:L']!.fury).toBe(2)
    expect(r.state.models['A:w']).toMatchObject({ controllerId: 'A:L', inert: false })
    expect(r.state.models['A:w']!.wild).toBeUndefined()
    expect(evs(r.events, 'BeastControlTaken')).toHaveLength(1)
    expect(evs(r.events, 'CombatActionForfeited')).toMatchObject([{ reason: 'tookControl' }])
    expect(validateTakeControl(mkS(0.79 + 0.98 + 1.5), B, a() as never)?.code).toBe('E_OUT_OF_RANGE')
    expect(validateTakeControl(mkS(0.79 + 0.98 + 0.5, mk('A:L', 'f.wx', 'A', 0, 0, { fury: 3 })), B, a() as never)?.code).toBe('E_TARGET_INVALID')
  })
})

describe('FURY decisions are answerable (sim-style check)', () => {
  it('FURY-049 every control decision offers only answers that pass validate, and is never empty', () => {
    const worlds: GameState[] = [
      world([warlock({ fury: 2 }), beast('A:b1', 3, 0, { fury: 2 }), beast('A:b2', -3, 0, { fury: 3 }), enemyLeader()]),
      world([warlock({ fury: 6, conditions: ['knockedDown'] }), beast('A:b1', 3, 0, { conditions: ['stationary'] }), enemyLeader()]),
    ]
    for (const s0 of worlds) {
      for (const stage of ['leech', 'shake'] as const) {
        const c = continueControl(s0, B, stage)
        if (!c.pending) continue
        const s = c.state
        const la = legalActions(s)
        expect(la.length).toBeGreaterThan(0)
        for (const a of la) expect(validate(s, a), `${s.pending.kind}:${JSON.stringify(a)}`).toBeNull()
      }
    }
  })
})

describe('FURY reave and Spirit Bond bookkeeping', () => {
  it('FURY-038 a beast destroyed in CTRL by an enemy attack is reaved up to ARC; the rest is lost', () => {
    const s0 = world([warlock({ fury: 5 }), beast('A:b1', 3, 0, { fury: 3, life: 'destroyed' }), enemyLeader()])
    const r = afterDeaths(s0, B)
    expect(r.state.models['A:L']!.fury).toBe(6)
    expect(r.state.models['A:b1']).toMatchObject({ fury: 0, bondedTo: 'A:L' })
    expect(evs(r.events, 'FuryReaved')).toMatchObject([{ reaverId: 'A:L', beastId: 'A:b1', points: 1, lost: 2 }])
    expect(evs(r.events, 'DecisionAutoResolved')).toMatchObject([{ kind: 'reave' }])
    const s1 = world([warlock({ fury: 1 }), beast('A:b1', 3, 0, { fury: 3, life: 'destroyed' }), enemyLeader()])
    expect(afterDeaths(s1, B).state.models['A:L']!.fury).toBe(4)
  })

  it('FURY-039 no reave from a friendly attack or outside CTRL: the fury is lost', () => {
    const base = world([warlock({ fury: 1 }), beast('A:b1', 3, 0, { fury: 3, life: 'destroyed' }), enemyLeader()])
    const fr = onBeastLeavesPlay(base, B, 'A:b1', { friendlyAttack: true })
    expect(fr.state.models['A:L']!.fury).toBe(1)
    expect(evs(fr.events, 'FuryChanged')).toMatchObject([{ modelId: 'A:b1', reason: 'lose', delta: -3 }])
    const far = world([warlock({ fury: 1 }), beast('A:b1', 40, 0, { fury: 3, life: 'destroyed' }), enemyLeader()])
    const r = onBeastLeavesPlay(far, B, 'A:b1')
    expect(r.state.models['A:L']!.fury).toBe(1)
    expect(evs(r.events, 'FuryChanged')).toMatchObject([{ reason: 'lose' }])
    expect(evs(r.events, 'FuryReaved')).toEqual([])
  })
})

describe('FURY setup', () => {
  it('FURY-001b a real list builds warlock fury = ARC, beast fury 0 and the beast answers to the warlock', async () => {
    const { createInitialState } = await import('../../src/engine/setup')
    B.byId['f.l.ok'] = { id: 'f.l.ok', faction: 'f', leader: 'f.w', points: 99, entries: [{ profile: 'f.b' }] }
    B.byId['f.l.bad'] = { id: 'f.l.bad', faction: 'f', leader: 'f.w', points: 99, entries: [{ profile: 'f.bl' }] }
    B.byId['f.bl'] = { ...(B.byId['f.b'] as object), id: 'f.bl', beastClass: 'lesser', base: 30 } as never
    const ok = createInitialState({ scenario: 'scn-ashwall-divide', lists: { A: 'f.l.ok', B: 'kha.l.qs-recon' } }, 's', B)
    const st = must(ok).state
    expect(st.models['A:L']).toMatchObject({ fury: 6, focus: 0 })
    expect(st.models['A:e0']).toMatchObject({ fury: 0, type: 'beast', controllerId: 'A:L' })
    expect(st.models['A:e0']!.damage.track).toBe('grid') // the spiral is a 6-branch grid
  })

  it('FURY-050 Recon needs a non-lesser beast: a lesser-only battlegroup is E_BAD_SETUP', async () => {
    const { createInitialState } = await import('../../src/engine/setup')
    B.byId['f.bl'] = { ...(B.byId['f.b'] as object), id: 'f.bl', beastClass: 'lesser', base: 30 } as never
    B.byId['f.l.bad'] = { id: 'f.l.bad', faction: 'f', leader: 'f.w', points: 99, entries: [{ profile: 'f.bl' }] }
    B.byId['f.l.ok'] = { id: 'f.l.ok', faction: 'f', leader: 'f.w', points: 99, entries: [{ profile: 'f.b' }] }
    const bad = createInitialState({ scenario: 'scn-ashwall-divide', lists: { A: 'f.l.bad', B: 'kha.l.qs-recon' } }, 's', B)
    expect(bad).toHaveProperty('rejection.code', 'E_BAD_SETUP')
    expect(isRejection(createInitialState({ scenario: 'scn-ashwall-divide', lists: { A: 'f.l.ok', B: 'kha.l.qs-recon' } }, 's', B))).toBe(false)
  })

  it('FURY-051 a beast secures a 50 mm objective like a war-engine; a wild one does not', async () => {
    const { controlReport } = await import('../../src/engine/scenario')
    const defId = 'f.sc'
    const el = (B.byId[defId] as unknown as { elements: { id: string; kind: string; pos: { x: number; z: number } }[] }).elements[0]!
    const mkS = (patch: Partial<ModelState>): GameState => {
      const s = world([warlock({ pos: { x: 15, z: 15 } }), beast('A:b1', el.pos.x + 1, el.pos.z, patch), enemyLeader({ pos: { x: -15, z: -15 } })])
      return { ...s, scenario: { ...s.scenario, id: defId } }
    }
    const held = controlReport(mkS({}), B).elements[el.id]!
    expect(held.controller).toBe('A')
    const wildHeld = controlReport(mkS({ wild: true, inert: true, controllerId: undefined }), B).elements[el.id]!
    expect(wildHeld.controller).toBeNull()
  })
})

describe('FURY query.* extensions', () => {
  it('FURY-052 query.fury, battlegroup, threshold, spiral, transferPreview, frenzyTarget and leechPreview answer from the engine', () => {
    const s = world([warlock({ fury: 3 }), beast('A:b1', 3, 0, { fury: 2 }), beast('A:far', 40, 0), mk('B:e', 'f.e', 'B', 10, 0), enemyLeader()])
    expect(query.fury(s, 'A:L')).toMatchObject({ kind: 'warlock', fury: 3, cap: 6, capStat: 'ARC', room: 3 })
    expect(query.fury(s, 'A:b1')).toMatchObject({ kind: 'beast', fury: 2, cap: 3, capStat: 'FURY', inCtrl: true, forceable: true, room: 1 })
    expect(query.fury(s, 'A:far')).toMatchObject({ forceable: false, block: 'outOfCtrl' })
    expect(query.fury(s, 'B:e').kind).toBeNull()
    const bg = query.battlegroup(s, 'A:L')
    expect(bg).toMatchObject({ ctrl: 10, leechRoom: 3, spiritBond: 0 })
    expect(bg.beasts.map((b) => b.modelId)).toEqual(['A:b1', 'A:far'])
    // THR 8, fury 2: frenzy needs 2d6 >= 7 -> 21/36; one more point -> 26/36
    expect(query.threshold(s, 'A:b1')).toMatchObject({ thr: 8, fury: 2, need: 7, construct: false })
    expect(query.threshold(s, 'A:b1').pFrenzy).toBeCloseTo(21 / 36, 9)
    expect(query.threshold(s, 'A:b1', 1).pFrenzy).toBeCloseTo(26 / 36, 9)
    expect(query.spiral(s, 'A:b1').branches.map((b) => b.boxes.length)).toEqual([6, 3, 7, 5, 6, 3])
    expect(query.transferPreview(s, 'A:L', 4).map((r) => r.beastId)).toEqual(['A:b1', 'A:far'])
    expect(query.frenzyTarget(s, 'A:b1')).toMatchObject({ canCharge: true })
    expect(query.leechPreview(s, 'A:L', { from: { 'A:b1': 2 }, self: 1 })).toMatchObject({ gained: 3, selfDamage: 1, after: 6, pFrenzyAfter: { 'A:b1': 0 } })
  })
})

describe('FURY todo', () => {
  it.todo('FURY-031 non-attack damage (continuous fire, hazards) raises a transfer prompt (F8.c: not in M9)')
})

// FURY-038b/039b/049b: reave bookkeeping and the control decisions, driven through the real attack pipeline and real games.
import { fillBoxes } from './fury-helpers'
import { createGame, step, type GameSetup } from '../../src/engine/index'
import { pickSensible } from '../../src/ai/random'
import { handleActivationAction as hAct } from '../../src/engine/phases/activation'
import type { FlowOut } from '../../src/engine/pending'

const sendA = (out: FlowOut, a: Record<string, unknown>): FlowOut => {
  const r = hAct(out.state, B, { ...a, decisionId: out.pending.id, player: out.pending.player } as unknown as Action)
  if (!r) throw new Error(`not an activation action: ${String(a.type)}`)
  const res = must(r)
  return { ...res, events: [...out.events, ...res.events] }
}
const settleA = (out0: FlowOut): FlowOut => {
  let out = out0
  for (let i = 0; i < 20; i++) {
    const k = out.pending.kind
    if (k === 'boostAttack') out = sendA(out, { type: 'boostAttack', boost: false })
    else if (k === 'boostDamage') out = sendA(out, { type: 'boostDamage', boost: false })
    else if (k === 'chooseBoxes') out = sendA(out, { type: 'chooseBoxes', column: Number(out.pending.options![0]!.id.replace('col', '')) })
    else if (k === 'triggerWindow') out = sendA(out, { type: 'pass' })
    else break
  }
  return out
}

describe('FURY reave through real attacks', () => {
  it('FURY-038b an enemy attack that destroys a beast in CTRL reaves its fury to the warlock (real attack, real death)', () => {
    const target = fillBoxes(beast('A:b1', 3.5, 0, { fury: 3 }), 22) // 3 unmarked boxes
    const s = world([warlock({ fury: 1, pos: { x: -4, z: 0 } }), target, mk('B:e', 'f.e', 'B', 1.6, 0), enemyLeader({ pos: { x: 30, z: 30 } })], { phase: 'activation', activePlayer: 'B' })
    force2(s, [6, 6], [3, 3]) // hit; 6 + POW 19 - ARM 17 = 8
    let out = raiseChooseActivation(s, [])
    out = sendA(out, { type: 'chooseActivation', activate: 'B:e' })
    out = sendA(out, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e' })
    out = sendA(out, { type: 'chooseCombatAction', modelId: 'B:e', choice: 'melee' })
    out = sendA(out, { type: 'chooseAttack', modelId: 'B:e', weaponId: 'f.big', targetId: 'A:b1', additional: false })
    out = settleA(out)
    expect(out.state.models['A:b1']!.life).toBe('destroyed')
    expect(evs(out.events, 'FuryReaved')).toMatchObject([{ reaverId: 'A:L', beastId: 'A:b1', points: 3 }])
    expect(out.state.models['A:L']!.fury).toBe(4)
  })

  it('FURY-039b a beast killed by a friendly frenzy attack is not reaved: its fury is lost and the warlock gains nothing', () => {
    const wx = 10 + 50 / 25.4 / 2 + 2 + 50 / 25.4 / 2
    const victim = fillBoxes(beast('A:b2', wx, 0, { fury: 2 }), 22)
    const s = world([warlock({ fury: 1, pos: { x: -20, z: 0 } }), beast('A:b1', 10, 0, { fury: 3 }), victim, enemyLeader({ pos: { x: 20, z: 20 } })])
    force2(s, [6, 6], [6, 6, 6], [6, 6])
    const r = continueControl(s, B, 'threshold')
    expect(evs(r.events, 'AttackDeclared')).toMatchObject([{ attackerId: 'A:b1', targetId: 'A:b2' }])
    expect(r.state.models['A:b2']!.life).toBe('destroyed')
    expect(evs(r.events, 'FuryReaved')).toEqual([])
    expect(evs(r.events, 'FuryChanged')).toMatchObject([{ modelId: 'A:b2', reason: 'lose', delta: -2 }])
    expect(r.state.models['A:L']!.fury).toBe(1)
  })

  it('FURY-039c deaths that are not attacks (hazards, fire) inside a friendly activation still reave: only an attack is a friendly attack', () => {
    const s = world([warlock({ fury: 1 }), beast('A:b1', 3, 0, { fury: 3, life: 'destroyed' }), enemyLeader()], { phase: 'activation' })
    const r = afterDeaths({ ...s, activation: actStub(['A:L']), attack: null }, B)
    expect(r.state.models['A:L']!.fury).toBe(4)
    expect(evs(r.events, 'FuryReaved')).toHaveLength(1)
  })
})

describe('FURY decisions in real games', () => {
  it('FURY-049b bot-vs-bot games with a warlock list: every open decision has legal answers and each passes validate', () => {
    B.byId['f.l.sim'] = { id: 'f.l.sim', faction: 'f', leader: 'f.w', points: 99, entries: [{ profile: 'f.b' }, { profile: 'f.b' }] }
    const setup: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'f.l.sim', B: 'kha.l.qs-recon' } }
    const kinds = new Set<string>()
    let turns = 0
    for (const seed of ['fz1', 'fz2', 'fz3']) {
      let r = createGame(setup, seed, B)
      expect(r.rejection).toBeUndefined()
      for (let guard = 0; guard < 6000 && r.pending.kind !== 'gameOver' && r.state.round < 4; guard++) {
        const legal = legalActions(r.state)
        expect(legal.length, `no legal action for ${r.pending.kind}`).toBeGreaterThan(0)
        kinds.add(r.pending.kind)
        if (['leech', 'adjustFury', 'transferDamage', 'shake', 'allocateFocus'].includes(r.pending.kind)) for (const a of legal) expect(validate(r.state, a)).toBeNull()
        r = step(r.state, pickSensible(r.state, r.pending, legal, seed))
        expect(r.rejection).toBeUndefined()
        turns++
      }
    }
    expect(turns).toBeGreaterThan(100)
    expect(kinds.has('leech') || kinds.has('adjustFury') || kinds.has('shake')).toBe(true) // the fury control decisions really came up
  })
})
