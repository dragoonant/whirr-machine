// M13 game clock, engine side (91 C.2, CLK-007 to CLK-012): the clockExpired action, the clocked-out defaults and the end-of-turn verdict.
import { describe, expect, it } from 'vitest'
import { clockOutAtTurnEnd, clockOutDefault, isClockedOut, resolveClockExpired, settleClockOut } from '../../src/engine/clock'
import { createGame, legalActions, load, registerBundle, replay, save, step, type Action, type ClockExpiredAction, type GameEvent, type GameState } from '../../src/engine/index'
import type { DataBundle } from '../../src/engine/types'
import { asOut, bundle, choose, place, send, startState } from './action-helpers'
import { QS, newGame, runSetup, withModel } from './turn-helpers'

registerBundle(bundle)

const expire = (s: GameState, timedOut: 'A' | 'B'): ClockExpiredAction => ({ type: 'clockExpired', decisionId: s.pending.id, player: timedOut, timedOut })
const flow = (r: ReturnType<typeof resolveClockExpired>) => { if ('rejection' in r) throw new Error(`rejected ${JSON.stringify(r.rejection)}`); return r }
const types = (ev: GameEvent[]) => ev.map((e) => e.type)

// Everything parked at the back edges, away from both walls (W1 at (-6,-4), W2 at (6,4)); round 1, A's turn.
const parked = (): GameState => {
  const s = runSetup(newGame()).state
  const models = Object.fromEntries(Object.entries(s.models).map(([k, m], i) => [k, { ...m, pos: { x: -16 + (i % 12) * 2.6, z: m.owner === 'A' ? -17 : 17 } }]))
  return { ...s, models, round: 1, turn: 1, activePlayer: 'A' as const }
}
const put = (s: GameState, id: string, x: number, z: number): GameState => withModel(s, id, { pos: { x, z } })
/** B holds wall W2 (a Leader and a friend within 2"). */
const bHoldsW2 = (s: GameState): GameState => put(put(s, 'B:e0', 6, 2.5), 'B:L', 4, 2.5)

describe('CLK clockExpired on the active player (CLK5)', () => {
  it('CLK-007 the opponent scores alone; more VP than the timed-out player is a scenario win with result.timeout set', () => {
    const s = bHoldsW2(parked())
    const r = flow(resolveClockExpired(s, bundle, expire(s, 'A')))
    expect(r.state.scenario.vp).toEqual({ A: 0, B: 1 })
    expect(r.state.scenario.result).toEqual({ winner: 'B', reason: 'scenario', timeout: 'A' })
    expect(r.state.phase).toBe('ended')
    expect(r.pending.kind).toBe('gameOver')
    expect(types(r.events)).toEqual(expect.arrayContaining(['ClockExpired', 'ControlChecked', 'ScenarioScored', 'GameEnded']))
    expect(r.events[0]).toMatchObject({ type: 'ClockExpired', player: 'A', active: 'A' })
    expect(r.events.find((e) => e.type === 'ScenarioScored')).toMatchObject({ player: 'B', delta: 1 })
    expect(r.state.models[s.players.A.leaderId]!.life).not.toBe('destroyed')
  })

  it('CLK-007 only the opponent scores: the timed-out player holding a wall gains nothing, and an equal count is not a lead', () => {
    let s = bHoldsW2(parked())
    s = put(put(s, 'A:e0', -6, -2.5), 'A:L', -4, -2.5) // A holds W1 too
    const r = flow(resolveClockExpired(s, bundle, expire(s, 'A')))
    expect(r.state.scenario.vp.A).toBe(0)
    expect(r.state.scenario.vp.B).toBe(1)
    // B already trails: 0 + 1 is not more than A's 1, so the Leader falls instead
    const behind = { ...s, scenario: { ...s.scenario, vp: { A: 1, B: 0 } } }
    const r2 = flow(resolveClockExpired(behind, bundle, expire(behind, 'A')))
    expect(r2.state.scenario.result).toEqual({ winner: 'B', reason: 'assassination', timeout: 'A' })
  })

  it('CLK-008 no VP lead: the timed-out Leader is destroyed (cause timeout) and the opponent wins by assassination', () => {
    const s = parked()
    const r = flow(resolveClockExpired(s, bundle, expire(s, 'A')))
    const lid = s.players.A.leaderId
    expect(r.state.models[lid]!.life).toBe('destroyed')
    expect(r.events.find((e) => e.type === 'LifeStateChanged')).toMatchObject({ modelId: lid, to: 'destroyed', cause: 'timeout' })
    expect(r.events.find((e) => e.type === 'ModelRemoved')).toMatchObject({ modelId: lid, reason: 'destroyed' })
    expect(types(r.events).indexOf('LifeStateChanged')).toBeLessThan(types(r.events).indexOf('ModelRemoved'))
    expect(r.state.scenario.result).toEqual({ winner: 'B', reason: 'assassination', timeout: 'A' })
    expect(types(r.events).filter((t) => t === 'GameEnded')).toHaveLength(1)
    expect(r.state.pending.kind).toBe('gameOver')
  })

  it('CLK-008 the same holds for player B timing out on its own turn', () => {
    const s = { ...parked(), activePlayer: 'B' as const, turn: 2 }
    const r = flow(resolveClockExpired(s, bundle, expire(s, 'B')))
    expect(r.state.scenario.result).toEqual({ winner: 'A', reason: 'assassination', timeout: 'B' })
    expect(r.state.models[s.players.B.leaderId]!.life).toBe('destroyed')
  })

  it('CLK-009 before scoring starts nothing is scored: the Leader falls even if the opponent holds an element', () => {
    const late: DataBundle = { ...bundle, byId: { ...bundle.byId, 'scn-qs-demo': { ...bundle.byId['scn-qs-demo']!, scoring: { fromRound: 2, fromPlayer: 'first' } } } }
    const s = bHoldsW2(parked())
    const r = flow(resolveClockExpired(s, late, expire(s, 'A')))
    expect(types(r.events)).not.toContain('ScenarioScored')
    expect(types(r.events)).not.toContain('ControlChecked')
    expect(r.state.scenario.vp).toEqual({ A: 0, B: 0 })
    expect(r.state.scenario.result).toEqual({ winner: 'B', reason: 'assassination', timeout: 'A' })
  })

  it('CLK-009 a player who runs out while deploying loses the same way (no scoring in the deployment phase)', () => {
    const s0 = newGame().state // the first setup decision
    const s = { ...s0, phase: 'deploy' as const }
    const r = flow(resolveClockExpired(s, bundle, expire(s, s.pending.player)))
    expect(types(r.events)).not.toContain('ControlChecked')
    expect(r.state.scenario.result).toMatchObject({ winner: s.pending.player === 'A' ? 'B' : 'A', reason: 'assassination', timeout: s.pending.player })
  })

  it('CLK-008 no Kill Box points, no lead-by-3 and no round limit apply to the clock-out score', () => {
    const sr: DataBundle = { ...bundle, byId: { ...bundle.byId, 'scn-qs-demo': { ...bundle.byId['scn-qs-demo']!, killBox: { fromRound: 1, fromPlayer: 'first', depth: 12, vp: 2 } } } }
    const s = put(parked(), 'A:L', 0, -17) // A's Leader sits in its own Kill Box
    const r = flow(resolveClockExpired(s, sr, expire(s, 'A')))
    expect(types(r.events)).not.toContain('KillBoxScored')
    expect(r.state.scenario.vp.B).toBe(0)
  })
})

describe('CLK clockExpired on the inactive player (CLK6)', () => {
  /** Khador A at its first choice; Cygnar B's Spellstorm Cannon shoots Vilkul until Power Field raises a decision owned by A. */
  function powerFieldScene(): ReturnType<typeof asOut> {
    for (let i = 0; i < 80; i++) {
      let s = startState('clk-pf' + i).state
      let k = 0
      for (const m of Object.values(s.models)) {
        if (m.id === 'A:L' || m.id === 'B:e0') continue
        s = place(s, m.id, { x: -16 + (k % 8) * 4, z: 16 - Math.floor(k / 8) * 3 }); k++
      }
      s = place(place(s, 'A:L', { x: 0, z: 0 }), 'B:e0', { x: 0, z: 8 })
      let o = asOut({ ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 })
      o = choose(o, 'B:e0')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e0' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'B:e0', choice: 'ranged' })
      o = send(o, { type: 'chooseAttack', modelId: 'B:e0', weaponId: 'cyg.w.spellstorm-cannon', targetId: 'A:L', additional: false })
      for (let j = 0; j < 6 && o.pending.kind !== 'powerField' && ['boostAttack', 'abilityChoice', 'boostDamage'].includes(o.pending.kind); j++) {
        o = o.pending.kind === 'abilityChoice' ? send(o, { type: 'abilityChoice', optionId: 'no' }) : send(o, { type: o.pending.kind, boost: false })
      }
      if (o.pending.kind === 'powerField') return o
    }
    throw new Error('no powerField decision found')
  }

  it('CLK-010 the clock only sets clockOut; the reaction decision the player owes is answered with its default and the game goes on', () => {
    const o = powerFieldScene()
    expect(o.pending.player).toBe('A')
    expect(o.state.activePlayer).toBe('B')
    const focus = o.state.models['A:L']!.focus
    const r = flow(resolveClockExpired(o.state, bundle, expire(o.state, 'A')))
    expect(r.state.scenario.clockOut).toBe('A')
    expect(r.state.scenario.result).toBeUndefined()
    expect(r.state.phase).not.toBe('ended')
    expect(types(r.events)[0]).toBe('ClockExpired')
    expect(r.events).toContainEqual({ type: 'DecisionAutoResolved', kind: 'powerField', optionId: expect.any(String) })
    expect(r.state.models['A:L']!.focus).toBe(focus) // Power Field refused: no focus spent
    expect(r.pending.player === 'A' && r.pending.kind === 'powerField').toBe(false)
    expect(isClockedOut(r.state)).toBe(true)
    expect(isClockedOut(r.state, 'A')).toBe(true)
    expect(isClockedOut(r.state, 'B')).toBe(false)
  })

  it('CLK-010 clockOutDefault: no decision of the other player, refusals by action type, pass when allowed, else the first option', () => {
    const o = powerFieldScene()
    const marked = { ...o.state, scenario: { ...o.state.scenario, clockOut: 'A' as const } }
    expect(clockOutDefault(marked, bundle)).toMatchObject({ type: 'powerField', spend: 0 })
    expect(clockOutDefault({ ...marked, scenario: { ...marked.scenario, clockOut: 'B' } }, bundle)).toBeNull() // the decision is A's
    expect(clockOutDefault(o.state, bundle)).toBeNull() // nobody clocked out
    const mk = (kind: string, opts: unknown[], canPass: boolean): GameState => ({ ...marked, pending: { ...marked.pending, kind: kind as never, canPass, options: opts as never } })
    const a = (type: string, extra: object) => ({ type, decisionId: marked.pending.id, player: 'A', ...extra })
    const opt = (id: string, action: object) => ({ id, label: id, action })
    expect(clockOutDefault(mk('boostAttack', [opt('y', a('boostAttack', { boost: true })), opt('n', a('boostAttack', { boost: false }))], false), bundle)).toMatchObject({ boost: false })
    expect(clockOutDefault(mk('reroll', [opt('y', a('reroll', { reroll: true })), opt('n', a('reroll', { reroll: false }))], false), bundle)).toMatchObject({ reroll: false })
    expect(clockOutDefault(mk('transferDamage', [opt('to', a('transferDamage', { toId: 'A:b1' })), opt('keep', a('transferDamage', { toId: null }))], false), bundle)).toMatchObject({ toId: null })
    expect(clockOutDefault(mk('reave', [opt('r', a('reave', { reaverId: 'A:L' })), opt('none', a('reave', { reaverId: null }))], false), bundle)).toMatchObject({ reaverId: null })
    expect(clockOutDefault(mk('triggerWindow', [opt('t', a('triggerWindow', { triggerId: 'x' }))], true), bundle)).toMatchObject({ type: 'pass' })
    expect(clockOutDefault(mk('abilityChoice', [opt('no', a('abilityChoice', { optionId: 'no' })), opt('yes', a('abilityChoice', { optionId: 'yes' }))], false), bundle)).toMatchObject({ optionId: 'no' })
    expect(clockOutDefault(mk('chooseBoxes', [opt('col0', a('chooseBoxes', { column: 0 })), opt('col1', a('chooseBoxes', { column: 1 }))], false), bundle)).toMatchObject({ column: 0 })
    expect(clockOutDefault(mk('chooseBoxes', [], false), bundle)).toBeNull()
  })

  it('CLK-010 settleClockOut stops at the first decision that is not the clocked-out player\'s, and never plays their own turn', () => {
    const o = powerFieldScene()
    const marked = { ...o.state, scenario: { ...o.state.scenario, clockOut: 'A' as const } }
    const r = settleClockOut({ state: marked, events: [], pending: marked.pending }, bundle)
    expect(r.state.pending.player).not.toBe('A')
    expect(r.state.activePlayer).toBe('B')
    const own = { ...marked, activePlayer: 'A' as const }
    expect(settleClockOut({ state: own, events: [], pending: own.pending }, bundle).state).toBe(own) // never auto-plays the clocked-out player's own turn
    const none = { ...o.state }
    const same = { state: none, events: [], pending: none.pending }
    expect(settleClockOut(same, bundle)).toBe(same)
  })

  it('CLK-010 at the end of the active turn: more VP than the clocked-out player is a scenario win', () => {
    const s0 = { ...parked(), activePlayer: 'B' as const, turn: 2, scenario: { ...parked().scenario, clockOut: 'A' as const, vp: { A: 1, B: 2 } } }
    const r = flow(clockOutAtTurnEnd(s0, bundle)!)
    expect(r.state.scenario.result).toEqual({ winner: 'B', reason: 'scenario', timeout: 'A' })
    expect(types(r.events)).toEqual(['GameEnded'])
    expect(r.state.models[s0.players.A.leaderId]!.life).not.toBe('destroyed')
  })

  it('CLK-010 at the end of the active turn: no lead means the clocked-out Leader is destroyed (assassination)', () => {
    const base = parked()
    for (const vp of [{ A: 2, B: 2 }, { A: 3, B: 1 }, { A: 0, B: 0 }]) {
      const s = { ...base, activePlayer: 'B' as const, turn: 2, scenario: { ...base.scenario, clockOut: 'A' as const, vp } }
      const r = flow(clockOutAtTurnEnd(s, bundle)!)
      expect(r.state.scenario.result).toEqual({ winner: 'B', reason: 'assassination', timeout: 'A' })
      expect(r.events.find((e) => e.type === 'LifeStateChanged')).toMatchObject({ modelId: s.players.A.leaderId, cause: 'timeout' })
    }
  })

  it('CLK-010 clockOutAtTurnEnd does nothing without a clockOut, after the game has ended, or when the clocked-out player is the active one', () => {
    const s = { ...parked(), activePlayer: 'B' as const }
    expect(clockOutAtTurnEnd(s, bundle)).toBeNull()
    const marked = { ...s, scenario: { ...s.scenario, clockOut: 'A' as const } }
    expect(clockOutAtTurnEnd({ ...marked, phase: 'ended' }, bundle)).toBeNull()
    expect(clockOutAtTurnEnd({ ...marked, activePlayer: 'A' }, bundle)).toBeNull()
  })
})

describe('CLK clockExpired through step()', () => {
  /** Create a game and answer every decision with its first option until the first player's choose-activation. */
  function toFirstActivation(seed: string): GameState {
    let s = createGame(QS, seed, bundle).state
    for (let i = 0; i < 80 && s.pending.kind !== 'chooseActivation'; i++) {
      const a = s.pending.options?.[0]?.action
      if (!a) throw new Error(`no option at ${s.pending.kind}`)
      const r = step(s, a)
      if (r.rejection) throw new Error(JSON.stringify(r.rejection))
      s = r.state
    }
    return s
  }

  it('CLK-011 clockExpired is never listed by legalActions', () => {
    const s = toFirstActivation('clk-11')
    expect(legalActions(s).some((a: Action) => a.type === 'clockExpired')).toBe(false)
    expect(legalActions(s).length).toBeGreaterThan(0)
  })

  it('CLK-011 the decisionId must match; the owner check is skipped; a bad payload and a second expiry are refused', () => {
    const s = toFirstActivation('clk-11b')
    const other = s.pending.player === 'A' ? 'B' : 'A'
    const stale = step(s, { ...expire(s, other), decisionId: 'd:1' })
    expect(stale.rejection?.code).toBe('E_WRONG_DECISION')
    expect(stale.state).toBe(s)
    const bad = step(s, { ...expire(s, other), timedOut: 'C' as never })
    expect(bad.rejection?.code).toBe('E_BAD_PAYLOAD')
    const ok = step(s, expire(s, other)) // the other player's clock: not the decision's owner
    expect(ok.rejection).toBeUndefined()
    expect(ok.state.scenario.clockOut).toBe(other)
    expect(ok.state.phase).not.toBe('ended')
    expect(ok.state.log.at(-1)).toMatchObject({ type: 'clockExpired', timedOut: other })
    expect(ok.state.pending.id).toBe(s.pending.id) // O's turn goes on untouched
    const again = step(ok.state, expire(ok.state, other))
    expect(again.rejection?.code).toBe('E_ALREADY_USED')
  })

  it('CLK-011 after the game is over every clockExpired is E_GAME_OVER', () => {
    const s = toFirstActivation('clk-11c')
    const over = step(s, expire(s, s.pending.player))
    expect(over.state.phase).toBe('ended')
    expect(over.pending.kind).toBe('gameOver')
    const late = step(over.state, { type: 'clockExpired', decisionId: over.pending.id, player: 'A', timedOut: 'A' })
    expect(late.rejection?.code).toBe('E_GAME_OVER')
  })

  it('CLK-012 a log with clockExpired replays and loads to the same result with no clock running', () => {
    const s = toFirstActivation('clk-12')
    const owner = s.pending.player
    const over = step(s, expire(s, owner))
    expect(over.state.scenario.result).toMatchObject({ winner: owner === 'A' ? 'B' : 'A', timeout: owner })
    expect(['scenario', 'assassination']).toContain(over.state.scenario.result!.reason)
    const file = save(over.state, 'clk')
    const back = load(file, bundle)
    expect(back.rejection).toBeUndefined()
    expect(back.state.scenario.result).toEqual(over.state.scenario.result)
    expect(back.state.phase).toBe('ended')
    expect(back.state.models[over.state.players[owner].leaderId]!.life).toBe(over.state.models[over.state.players[owner].leaderId]!.life)
    const again = replay(file.setup, file.seed, bundle, file.actions)
    expect(again.state.scenario).toEqual(over.state.scenario)
  })

  it('CLK-012 an inactive-player expiry also survives a save and load, with clockOut still set', () => {
    const s = toFirstActivation('clk-12b')
    const other = s.pending.player === 'A' ? 'B' : 'A'
    const marked = step(s, expire(s, other))
    const back = load(save(marked.state), bundle)
    expect(back.state.scenario.clockOut).toBe(other)
    expect(back.state.pending.id).toBe(marked.state.pending.id)
  })
})
