// Cygnar Skirmish (50 points) additions: the Tempest Assailers, Storm Vanes and the Shield Guard Courser, and the list that holds them
// (docs/spec/90-skirmish.md B.1, docs/spec/factions/cygnar.md Skirmish section). Data checks first (SKM-001 and the card values), then one
// behaviour test per rule the three models bring (FAC-CYG-013 onward; the checklist rows are proposed in cygnar.md).
import { describe, expect, it } from 'vitest'
import { abilitiesOf, atkOf, cannotKnockDown, resistsDamageType, statOf } from '../../src/engine/code-hooks'
import { cygnarHooks, polarityFieldBlocks, warpingWindsRngPenalty } from '../../src/engine/factions/cygnar'
import type { GameEvent } from '../../src/engine/events'
import type { GameSetup, GameState } from '../../src/engine/types'
import { validateAll } from '../../tools/validate-data'
import { asOut, bundle, choose, place, send, withModel } from '../engine/action-helpers'
import { newGame, runControlTo, runSetup } from '../engine/turn-helpers'

type Any = Record<string, any>
const rec = (id: string): Any => bundle.byId[id] as unknown as Any

// ---------------------------------------------------------------- data

describe('SKM-001 cyg.l.skirmish', () => {
  const list = rec('cyg.l.skirmish')
  const cost = (e: Any): number => (e.size !== undefined && rec(e.profile).composition?.costBySize?.[String(e.size)]) || rec(e.profile).cost

  it('is a 50-point Skirmish list led by Caine: the starter plus the Assailers, the Vanes and the Courser', () => {
    expect(list.level).toBe('skirmish')
    expect(list.points).toBe(50)
    expect(list.leader).toBe('cyg.caine')
    expect(list.entries.reduce((n: number, e: Any) => n + cost(e), 0)).toBe(50)
    expect(list.entries.map((e: Any) => e.profile)).toEqual([
      'cyg.deuce', 'cyg.falk', 'cyg.black13', 'cyg.tempest-assailers', 'cyg.storm-vanes', 'cyg.courser-sg',
    ])
    // every entry of the recon starter is still in it, with the same options
    for (const e of rec('cyg.l.qs-recon').entries) expect(list.entries).toContainEqual(e)
  })

  it('has a non-lesser Cohort model, no banned engine class, and respects field allowance (characters once, the rest within FA)', () => {
    const profiles = list.entries.map((e: Any) => rec(e.profile))
    expect(profiles.some((p: Any) => p.type === 'warEngine' && !p.lesser)).toBe(true)
    expect(profiles.some((p: Any) => ['battleEngine', 'colossal'].includes(p.type) || ['colossal'].includes(p.engineClass))).toBe(false)
    const count = new Map<string, number>()
    for (const e of list.entries) count.set(e.profile, (count.get(e.profile) ?? 0) + 1)
    for (const [id, n] of count) {
      const fa = rec(id).fa
      if (fa === 'C') expect(n, id).toBe(1)
      else if (typeof fa === 'number') expect(n, id).toBeLessThanOrEqual(fa)
    }
  })

  it('every Cygnar record passes schema, reference, hook and MK3-leak validation', () => {
    const rep = validateAll()
    expect(rep.errors.filter((e) => /\bcyg[.\/-]/.test(String(e)))).toEqual([])
  })

  it('the engine builds the army on the Skirmish scenario (13 models a side, 48" table)', () => {
    const s = start('cyg-sk-build')
    expect(s.scenario.table).toEqual({ w: 48, d: 48 })
    expect(Object.keys(s.models).filter((id) => id.startsWith('A:')).sort()).toEqual([
      'A:L', 'A:e0', 'A:e1', 'A:e5', 'A:u2.1', 'A:u2.2', 'A:u2.3', 'A:u3.1', 'A:u3.2', 'A:u3.3', 'A:u4.1', 'A:u4.2', 'A:u4.3',
    ])
  })
})

describe('FAC-CYG-013a card values of the three new models', () => {
  it('Tempest Assailers: unit of 3, 9 points, FA 2; SPD 5 MAT 7 DEF 12 ARM 18, 8 boxes, medium base, Heavy Voltaic Hammer reach 2 POW 15', () => {
    const u = rec('cyg.tempest-assailers')
    expect(u).toMatchObject({ type: 'unit', cost: 9, fa: 2 })
    expect(u.composition.grunts).toEqual({ profile: 'cyg.tempest-assailer', min: 3, max: 3 })
    expect(u.composition.costBySize['3']).toBe(9)
    const t = rec('cyg.tempest-assailer')
    expect(t.stats).toMatchObject({ SPD: 5, MAT: 7, DEF: 12, ARM: 18 })
    expect(t.damage).toEqual({ track: 'single', boxes: 8 })
    expect(t.base).toBe(40)
    expect(t.abilities).toEqual(expect.arrayContaining(['cyg.a.resist-electricity', 'cyg.a.repulsor-field', 'cyg.a.shield-wall']))
    expect(t.weapons).toEqual([{ weapon: 'cyg.w.heavy-voltaic-hammer' }])
    expect(rec('cyg.w.heavy-voltaic-hammer')).toMatchObject({ type: 'melee', rng: 2, pow: 15 })
    expect(rec('cyg.w.heavy-voltaic-hammer').abilities).toContain('cyg.a.smite')
  })

  it('Storm Vanes: unit of 3, 5 points, FA 2; SPD 5 RAT 5 DEF 12 ARM 14, 5 boxes, small base, Storm Surge SP6 POW 10 electrical pistol', () => {
    const u = rec('cyg.storm-vanes')
    expect(u).toMatchObject({ type: 'unit', cost: 5, fa: 2 })
    expect(u.composition.grunts).toEqual({ profile: 'cyg.storm-vane', min: 3, max: 3 })
    const t = rec('cyg.storm-vane')
    expect(t.stats).toMatchObject({ SPD: 5, RAT: 5, DEF: 12, ARM: 14 })
    expect(t.damage).toEqual({ track: 'single', boxes: 5 })
    expect(t.base).toBe(30)
    expect(t.abilities).toEqual(expect.arrayContaining([
      'cyg.a.resist-electricity', 'cyg.a.galvanic-capacitor', 'cyg.a.lightning-wreath', 'cyg.a.polarity-field-generator', 'cyg.a.wind-weaver', 'cyg.a.plasma-nimbus',
    ]))
    expect(rec('cyg.w.storm-surge')).toMatchObject({ type: 'ranged', rng: 'SP6', rof: 1, pow: 10, damageTypes: ['electricity'] })
  })

  it('Courser (Shield Guard / Heavy Stormthrower / Voltaic Punching Spike): light warjack, 6 points, FA 4; SPD 6 MAT 5 RAT 6 DEF 14 ARM 16', () => {
    const c = rec('cyg.courser-sg')
    expect(c).toMatchObject({ type: 'warEngine', engineClass: 'light', cost: 6, fa: 4, base: 40 })
    expect(c.stats).toEqual({ SPD: 6, MAT: 5, RAT: 6, DEF: 14, ARM: 16 })
    expect(c.abilities).toEqual(expect.arrayContaining(['core.a.construct', 'core.a.dual-attack', 'cyg.a.resist-electricity', 'cyg.a.insulated-cortex', 'cyg.a.shield-guard']))
    // a light warjack has Headbutt and Slam but no Trample
    expect(c.abilities).toEqual(expect.arrayContaining(['core.a.headbutt', 'core.a.slam']))
    expect(c.abilities).not.toContain('core.a.trample')
    expect(rec('cyg.w.heavy-stormthrower')).toMatchObject({ type: 'ranged', rng: 'SP8', rof: 1, pow: 12, location: 'R' })
    expect(rec('cyg.w.voltaic-punching-spike')).toMatchObject({ type: 'melee', rng: 1, pow: 12, location: 'L' })
    expect(rec('cyg.w.voltaic-punching-spike').qualities).toContain('core.q.throw')
  })

  it('the Courser grid has 26 boxes in columns of 3, 5, 5, 5, 5, 3 and the systems the card shows (L3 M3 H2 C3 R3)', () => {
    const cols: string[] = rec('cyg.courser-sg').damage.columns
    expect(cols.map((c) => c.length)).toEqual([3, 5, 5, 5, 5, 3])
    const letters = cols.join('')
    expect(letters.replace(/-/g, '').length).toBe(14)
    for (const [l, n] of Object.entries({ L: 3, M: 3, H: 2, C: 3, R: 3 })) expect(letters.split(l).length - 1, l).toBe(n)
    expect(cols.reduce((n, c) => n + c.length, 0)).toBe(26)
  })

  it('no MK3 vocabulary and melee reach is 1 or 2 in the new records', () => {
    const mine = Object.values(bundle.byId).filter((r) => /^cyg\./.test(String((r as Any).id)))
    expect(JSON.stringify(mine)).not.toMatch(/\b(STR|facing|free strike|template|scatter|deviation)\b/i)
    for (const w of Object.values(bundle.byId) as Any[]) if (/^cyg\.w\./.test(w.id) && w.type === 'melee') expect([1, 2]).toContain(w.rng)
  })
})

// ---------------------------------------------------------------- behaviour

const SETUP: GameSetup = { scenario: 'scn-copperline-crossing', lists: { A: 'cyg.l.skirmish', B: 'cyg.l.skirmish' } }
/** Models: A:L Caine, A:e0 Deuce, A:e1 Falk, A:u2.1-3 Black 13th, A:u3.1-3 Assailers, A:u4.1-3 Vanes, A:e5 Courser; B the same. */
function start(seed: string, who: 'A' | 'B' = 'A'): GameState {
  const s = runControlTo(runSetup(newGame(SETUP, seed))).state
  return { ...s, activePlayer: who, pending: { ...s.pending, kind: 'chooseActivation', player: who, id: 'd:900', options: [] }, decisionSeq: 900 }
}
/** Park every model but `keep` along the table edge, far from the action. */
function park(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -20 + (i % 10) * 4, z: 21 - Math.floor(i / 10) * 3 })
    i++
  }
  return s
}
type Out = ReturnType<typeof asOut>
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const acts = (o: Out) => (o.pending.options ?? []).map((x) => x.action as unknown as { type: string; modelId?: string; choice?: string; abilityId?: string; weaponId?: string; targetId?: string })
const offers = (o: Out, modelId: string, abilityId: string): boolean => acts(o).some((a) => a.modelId === modelId && a.abilityId === abilityId)
const dist = (s: GameState, a: string, b: string): number => Math.hypot(s.models[a]!.pos.x - s.models[b]!.pos.x, s.models[a]!.pos.z - s.models[b]!.pos.z)
const filled = (s: GameState, id: string): number => (s.models[id]!.damage as { filled: number }).filled

/** Answer attack-internal decisions with the plain choice; `takeNimbus` accepts an optional trigger (Plasma Nimbus). */
function settle(o0: Out, opts: { takeTrigger?: boolean } = {}): Out {
  let o = o0
  const all = [...o0.events]
  const REST = new Set(['chooseActivation', 'chooseMovement', 'chooseCombatAction', 'chooseAttack', 'gameOver', 'moveModel', 'chargeTarget'])
  for (let i = 0; i < 60 && !REST.has(o.pending.kind); i++) {
    const k = o.pending.kind
    if (k === 'boostAttack') o = send(o, { type: 'boostAttack', boost: false })
    else if (k === 'boostDamage') o = send(o, { type: 'boostDamage', boost: false })
    else if (k === 'powerField') o = send(o, { type: 'powerField', spend: 0 })
    else if (k === 'chooseBoxes') o = send(o, { type: 'chooseBoxes', column: Number(o.pending.options![0]!.id.replace('col', '')) })
    else if (k === 'triggerWindow') {
      const take = o.pending.options!.find((x) => x.id === 'take')
      o = opts.takeTrigger && take ? send(o, take.action as unknown as Record<string, unknown>) : send(o, { type: 'pass' })
    } else if (k === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: o.pending.options![0]!.id })
    else throw new Error(`settle: unexpected ${k}`)
    all.push(...o.events)
  }
  return { ...o, events: all }
}
/** Activate `unitOrModel`, forfeit movement for `id`, skip the combat of every other model first, and stop at `id`'s Combat Action choice. */
function openCombat(o0: Out, unitOrModel: string, id: string): Out {
  let o = choose(o0, unitOrModel)
  o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: id })
  let guard = 0
  while (o.pending.kind === 'chooseMovement' && guard++ < 6) o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: o.pending.context.modelId })
  guard = 0
  while (o.pending.kind === 'chooseCombatAction' && o.pending.context.modelId !== id && guard++ < 6) {
    o = send(o, { type: 'chooseCombatAction', modelId: o.pending.context.modelId, choice: 'forfeit' })
  }
  return o
}
const HAMMER = 'cyg.w.heavy-voltaic-hammer'
/** Run `scenario(seed)` over seeds until it reports a state worth asserting on; fail loudly when none does. */
function firstSeed<T>(name: string, run: (seed: string) => T | null, n = 40): T {
  for (let i = 0; i < n; i++) {
    const r = run(`${name}-${i}`)
    if (r) return r
  }
  throw new Error(`${name}: no seed in ${n} produced the case`)
}

describe('FAC-CYG-013 Smite (★Attack): the model hit is slammed d6" away, half if its base is larger, then knocked down', () => {
  /** A:u3.1 faces `target` at 2.4" (its hammer reaches 2"). Returns the events and the state after the attack. */
  function smiteDuel(seed: string, target: string, tx: number, how: 'smite' | 'melee') {
    let s = park(start(seed), ['A:u3.1', target])
    s = place(s, 'A:u3.1', { x: 0, z: 0 })
    s = place(s, target, { x: tx, z: 0 })
    s = withModel(s, target, { activated: false })
    let o = openCombat(asOut(s), 'A:u3', 'A:u3.1')
    expect(o.pending.kind).toBe('chooseCombatAction')
    const offered = offers(o, 'A:u3.1', 'cyg.a.smite')
    o = send(o, how === 'smite'
      ? { type: 'chooseCombatAction', modelId: 'A:u3.1', choice: 'specialAttack', abilityId: 'cyg.a.smite' }
      : { type: 'chooseCombatAction', modelId: 'A:u3.1', choice: 'melee' })
    o = send(o, { type: 'chooseAttack', modelId: 'A:u3.1', weaponId: HAMMER, targetId: target, additional: false })
    o = settle(o)
    return { offered, state: o.state, events: o.events, hit: evs(o.events, 'AttackResolved').some((e) => e.hit) }
  }

  it('the Combat Action choice offers Smite for the hammer', () => {
    const r = smiteDuel('smite-offer', 'B:u3.1', 3.2, 'smite')
    expect(r.offered).toBe(true)
  })

  it('a Smite hit on an equal base slams it 1-6" straight away from the attacker and knocks it down', () => {
    const r = firstSeed('smite-equal', (seed) => {
      const x = smiteDuel(seed, 'B:u3.1', 3.2, 'smite')
      const t = x.state.models['B:u3.1']!
      return x.hit && t.life === 'active' ? x : null
    })
    const t = r.state.models['B:u3.1']!
    const rolled = evs(r.events, 'DiceRolled').find((e) => e.purpose === 'slamDist')!
    expect(rolled).toBeDefined()
    const d6 = rolled.dice[0]!
    expect(d6).toBeGreaterThanOrEqual(1)
    expect(t.pos.x).toBeGreaterThan(3.2 - 1e-6) // pushed along +x, away from the Assailer at the origin
    expect(Math.abs(t.pos.z)).toBeLessThan(1e-6)
    expect(t.pos.x - 3.2).toBeLessThanOrEqual(d6 + 1e-6)
    expect(t.conditions).toContain('knockedDown')
    expect(evs(r.events, 'ModelMoved').some((m) => m.modelId === 'B:u3.1' && m.kind === 'slam')).toBe(true)
  })

  it('against a larger base (Deuce, 50 mm) the slam is half the roll', () => {
    const r = firstSeed('smite-large', (seed) => {
      const x = smiteDuel(seed, 'B:e0', 3.5, 'smite')
      return x.hit && x.state.models['B:e0']!.life === 'active' ? x : null
    })
    const rolled = evs(r.events, 'DiceRolled').find((e) => e.purpose === 'slamDist')!
    const mv = evs(r.events, 'ModelMoved').find((m) => m.modelId === 'B:e0' && m.kind === 'slam')
    if (mv) expect(mv.distance).toBeLessThanOrEqual(rolled.dice[0]! / 2 + 1e-6)
    expect(r.state.models['B:e0']!.pos.x - 3.5).toBeLessThanOrEqual(3 + 1e-6)
  })

  it('a basic hammer attack never slams: no slam roll, the target stays where it stood', () => {
    const r = firstSeed('smite-basic', (seed) => {
      const x = smiteDuel(seed, 'B:u3.1', 3.2, 'melee')
      return x.hit ? x : null
    })
    expect(evs(r.events, 'DiceRolled').some((e) => e.purpose === 'slamDist')).toBe(false)
    expect(r.state.models['B:u3.1']!.pos.x).toBeCloseTo(3.2)
    expect(r.state.models['B:u3.1']!.conditions).not.toContain('knockedDown')
  })
})

describe('FAC-CYG-014 Repulsor Field: an enemy that hits an Assailer in melee is pushed 1" directly away from it', () => {
  function duel(seed: string) {
    let s = park(start(seed), ['A:e1', 'B:u3.1'])
    s = place(s, 'B:u3.1', { x: 0, z: 0 })
    s = place(s, 'A:e1', { x: 1.6, z: 0 }) // Falk: base contact range for his sword
    let o = choose(asOut(s), 'A:e1')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e1' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e1', choice: 'melee' })
    o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'cyg.w.sword', targetId: 'B:u3.1', additional: false })
    o = settle(o)
    return { before: 1.6, state: o.state, events: o.events, hit: evs(o.events, 'AttackResolved').some((e) => e.hit) }
  }
  it('a hit pushes the attacker 1" away (and a miss does not)', () => {
    const hit = firstSeed('repulse-hit', (seed) => { const r = duel(seed); return r.hit ? r : null })
    const x = hit.state.models['A:e1']!.pos.x
    expect(x).toBeCloseTo(1.6 + 1, 1)
    expect(Math.abs(hit.state.models['A:e1']!.pos.z)).toBeLessThan(1e-6)
    expect(evs(hit.events, 'ModelMoved').some((m) => m.modelId === 'A:e1' && m.kind === 'push')).toBe(true)
    const miss = firstSeed('repulse-miss', (seed) => { const r = duel(seed); return r.hit ? null : r })
    expect(miss.state.models['A:e1']!.pos.x).toBeCloseTo(1.6)
  })
})

describe('FAC-CYG-015 Plasma Nimbus: a Vane hit in melee may fry the attacker with a POW 10 electrical roll', () => {
  function duel(seed: string, take: boolean) {
    let s = park(start(seed), ['A:e1', 'B:u4.1'])
    s = place(s, 'B:u4.1', { x: 0, z: 0 })
    s = place(s, 'A:e1', { x: 1.2, z: 0 })
    let o = choose(asOut(s), 'A:e1')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e1' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e1', choice: 'melee' })
    o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'cyg.w.sword', targetId: 'B:u4.1', additional: false })
    o = settle(o, { takeTrigger: take })
    return { state: o.state, events: o.events, hit: evs(o.events, 'AttackResolved').some((e) => e.hit) }
  }
  it('the owner takes the trigger: the attacker suffers an electrical damage roll that no attack caused', () => {
    const r = firstSeed('nimbus-take', (seed) => {
      const x = duel(seed, true)
      return x.hit && x.state.models['B:u4.1']!.life === 'active' ? x : null
    })
    const dmg = evs(r.events, 'DamageApplied').filter((d) => d.targetId === 'A:e1' && d.source === 'other')
    expect(dmg.length).toBe(1)
    expect(dmg[0]!.damageTypes).toContain('electricity')
    expect(evs(r.events, 'DiceRolled').some((e) => e.purpose === 'damage' && e.ownerId === 'A:e1')).toBe(true)
  })
  it('declined, or a miss, costs the attacker nothing', () => {
    const declined = firstSeed('nimbus-pass', (seed) => {
      const x = duel(seed, false)
      return x.hit && x.state.models['B:u4.1']!.life === 'active' ? x : null
    })
    expect(evs(declined.events, 'DamageApplied').filter((d) => d.targetId === 'A:e1')).toEqual([])
  })
})

describe('FAC-CYG-016 Resistance: Electricity, Shield Wall and Critical Armor-Piercing on the new models', () => {
  it('the three new models resist electricity; Deuce and Falk do not', () => {
    const s = start('res')
    for (const id of ['A:u3.1', 'A:u4.1', 'A:e5']) expect(resistsDamageType(s, bundle, id, ['electricity']), id).toBe(true)
    for (const id of ['A:e0', 'A:e1', 'A:L']) expect(resistsDamageType(s, bundle, id, ['electricity']), id).toBe(false)
    expect(resistsDamageType(s, bundle, 'A:u3.1', ['fire'])).toBe(false)
  })

  it('Shield Wall: an Assailer touching a unit-mate has +2 ARM and cannot be knocked down; alone it has ARM 18 and can be', () => {
    let s = park(start('wall'), ['A:u3.1', 'A:u3.2'])
    s = place(s, 'A:u3.1', { x: 0, z: 0 })
    s = place(s, 'A:u3.2', { x: 1.575, z: 0 }) // two 40 mm bases touching
    expect(statOf(s, bundle, 'A:u3.1', 'ARM')).toBe(20)
    expect(cannotKnockDown(s, bundle, 'A:u3.1')).toBe(true)
    s = place(s, 'A:u3.2', { x: 6, z: 0 })
    expect(statOf(s, bundle, 'A:u3.1', 'ARM')).toBe(18)
    expect(cannotKnockDown(s, bundle, 'A:u3.1')).toBe(false)
  })

  it('Critical Armor-Piercing (Punching Spike): the hook turns Armor-Piercing on for the damage roll, and only on a crit', () => {
    const spike = rec('cyg.w.voltaic-punching-spike')
    expect(spike.abilities).toContain('cyg.a.critical-armor-piercing')
    expect(rec('cyg.a.critical-armor-piercing')).toMatchObject({ trigger: 'damage.beforeRoll', when: { test: 'crit' } })
    const s0 = start('cap')
    const cur = { addDice: 0, flat: 0, boost: false, dropLowest: false, armorPiercing: false }
    const s = { ...s0, attack: { x: { cur } } } as unknown as GameState
    const hook = cygnarHooks.effects.cygCriticalArmorPiercing!
    const r = hook({ state: s, point: 'damage.beforeRoll', selfId: 'A:e5', activePlayer: 'A', bundle } as never, undefined as never)
    expect((atkOf(r.state)!.x.cur as { armorPiercing: boolean }).armorPiercing).toBe(true)
    expect(cur.armorPiercing).toBe(false)
  })
})

describe('FAC-CYG-017 Shield Guard (Courser): a ranged direct hit on a friend within 3" lands on the Courser instead', () => {
  function shot(seed: string) {
    let s = park(start(seed, 'B'), ['A:L', 'A:e5', 'B:u2.1'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'A:e5', { x: 2.4, z: 0 }) // the Courser stands within 3" of Caine
    s = place(s, 'B:u2.1', { x: 0, z: 8 }) // Ryan shoots from 8"
    let o = choose(asOut(s), 'B:u2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:u2.1' })
    let guard = 0
    while (o.pending.kind === 'chooseMovement' && guard++ < 6) o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: o.pending.context.modelId })
    guard = 0
    while (o.pending.kind === 'chooseCombatAction' && o.pending.context.modelId !== 'B:u2.1' && guard++ < 6) {
      o = send(o, { type: 'chooseCombatAction', modelId: o.pending.context.modelId, choice: 'forfeit' })
    }
    o = send(o, { type: 'chooseCombatAction', modelId: 'B:u2.1', choice: 'ranged' })
    o = send(o, { type: 'chooseAttack', modelId: 'B:u2.1', weaponId: 'cyg.w.magelock-pistol', targetId: 'A:L', additional: false })
    o = settle(o)
    return { state: o.state, events: o.events, hit: evs(o.events, 'AttackResolved').some((e) => e.hit) }
  }
  it('the Courser takes the damage and Caine takes none', () => {
    const r = firstSeed('guard', (seed) => {
      const x = shot(seed)
      return x.hit && evs(x.events, 'DamageApplied').length > 0 ? x : null
    })
    const targets = evs(r.events, 'DamageApplied').map((d) => d.targetId)
    expect(targets).toContain('A:e5')
    expect(targets).not.toContain('A:L')
    expect(filled(r.state, 'A:L')).toBe(0)
  })
})

describe('FAC-CYG-018 Galvanic Capacitor: the Vanes pick distinct effects; Lightning Wreath gives a friend Electro Leap', () => {
  /** Falk fights a Hound-less enemy pair: B Assailers (resistant) are ignored by the arc, B Deuce further off is the victim. */
  function wreathField(seed: string) {
    let s = park(start(seed), ['A:u4.1', 'A:u4.2', 'A:u4.3', 'A:e1', 'B:u2.1', 'B:e0', 'B:u3.1'])
    s = place(s, 'A:u4.1', { x: -3, z: 0 })
    s = place(s, 'A:u4.2', { x: -3, z: 2 })
    s = place(s, 'A:u4.3', { x: -3, z: -2 })
    s = place(s, 'A:e1', { x: -1, z: 0 }) // Falk, 2" from the first Vane
    s = place(s, 'B:u2.1', { x: 0.9, z: 0 }) // the model Falk hits (Ryan, 30 mm), 0.7" from Falk's edge
    s = place(s, 'B:u3.1', { x: 2.6, z: 0 }) // a resistant Assailer, nearest to Ryan: the arc must skip it
    s = place(s, 'B:e0', { x: 3.4, z: 2.2 }) // Deuce, within 3" of Ryan: the arc lands here
    return s
  }

  it('each capacitor effect is offered at the Vane\'s Combat Action, and an effect used by one Vane leaves the unit', () => {
    const s = wreathField('cap-offer')
    let o = openCombat(asOut(s), 'A:u4', 'A:u4.1')
    for (const id of ['cyg.a.lightning-wreath', 'cyg.a.polarity-field-generator', 'cyg.a.wind-weaver']) expect(offers(o, 'A:u4.1', id), id).toBe(true)
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:u4.1', choice: 'specialAction', abilityId: 'cyg.a.lightning-wreath' })
    expect(o.pending.kind).toBe('chooseCombatAction') // an any-time ability does not use the Combat Action up
    expect(offers(o, 'A:u4.1', 'cyg.a.lightning-wreath')).toBe(false)
    expect(offers(o, 'A:u4.1', 'cyg.a.wind-weaver')).toBe(true)
    const wreath = o.state.effects.find((e) => e.sourceId === 'cyg.a.lightning-wreath')!
    expect(wreath.targetIds).toEqual(['A:e1']) // Falk is the friendly melee model in 3"
    expect(abilitiesOf(o.state, bundle, 'A:e1')).toContain('cyg.a.electro-leap')
    expect(wreath.duration).toBe('turn')
  })

  it('Falk\'s basic melee hit then arcs a POW 10 electrical roll to the nearest model that has no resistance, never the attacker', () => {
    const r = firstSeed('wreath-arc', (seed) => {
      let o = openCombat(asOut(wreathField(seed)), 'A:u4', 'A:u4.1')
      o = send(o, { type: 'chooseCombatAction', modelId: 'A:u4.1', choice: 'specialAction', abilityId: 'cyg.a.lightning-wreath' })
      // finish the Vanes' activation with forfeits, then activate Falk
      let guard = 0
      while (o.pending.kind === 'chooseCombatAction' && guard++ < 6) o = send(o, { type: 'chooseCombatAction', modelId: o.pending.context.modelId, choice: 'forfeit' })
      if (o.pending.kind !== 'chooseActivation') return null
      o = choose(o, 'A:e1')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e1' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'A:e1', choice: 'melee' })
      o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'cyg.w.sword', targetId: 'B:u2.1', additional: false })
      o = settle(o)
      const hit = evs(o.events, 'AttackResolved').some((e) => e.hit)
      return hit ? { state: o.state, events: o.events } : null
    })
    const arc = evs(r.events, 'DamageApplied').filter((d) => d.source === 'other' && d.damageTypes.includes('electricity'))
    expect(arc.map((d) => d.targetId)).toEqual(['B:e0']) // Deuce, not the closer Assailer (resistant), and never Falk
    expect(evs(r.events, 'DiceRolled').filter((e) => e.purpose === 'damage' && e.ownerId === 'B:e0').length).toBe(1)
  })

  it('Polarity Field Generator: the unit is barred as a charge or slam target of a construct only', () => {
    const s = wreathField('polarity')
    let o = openCombat(asOut(s), 'A:u4', 'A:u4.1')
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:u4.1', choice: 'specialAction', abilityId: 'cyg.a.polarity-field-generator' })
    for (const id of ['A:u4.1', 'A:u4.2', 'A:u4.3']) {
      expect(polarityFieldBlocks(o.state, bundle, 'B:e0', id), `Deuce at ${id}`).toBe(true) // a construct
      expect(polarityFieldBlocks(o.state, bundle, 'B:u2.1', id), `Ryan at ${id}`).toBe(false) // a living trooper
    }
    expect(polarityFieldBlocks(o.state, bundle, 'B:e0', 'A:e1')).toBe(false) // Falk is not in the unit
  })

  it('Wind Weaver: Warping Winds costs ranged attacks at a Cygnar model within 3" of the Vane 3 RNG; near Cygnar models resist blast for the round', () => {
    const s = wreathField('wind')
    expect(warpingWindsRngPenalty(s, bundle, 'A:e1')).toBe(0)
    let o = openCombat(asOut(s), 'A:u4', 'A:u4.1')
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:u4.1', choice: 'specialAction', abilityId: 'cyg.a.wind-weaver' })
    expect(warpingWindsRngPenalty(o.state, bundle, 'A:e1')).toBe(3) // Falk is 2" from the Vane
    expect(warpingWindsRngPenalty(o.state, bundle, 'A:u4.1')).toBe(3)
    expect(warpingWindsRngPenalty(o.state, bundle, 'A:e0')).toBe(0) // Deuce is far away (parked)
    expect(warpingWindsRngPenalty(o.state, bundle, 'B:e0')).toBe(0) // an enemy is never covered
    expect(resistsDamageType(o.state, bundle, 'A:e1', ['blast'])).toBe(true)
    expect(resistsDamageType(o.state, bundle, 'A:e0', ['blast'])).toBe(false)
  })
})
