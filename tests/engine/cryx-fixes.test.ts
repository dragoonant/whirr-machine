// Cryx verified-finding fixes and the behaviour tests for FAC-CRY-010/011/015/016/017/021/023 (docs/spec/factions/cryx.md).
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { applyDamage } from '../../src/engine/damage'
import { INCORPOREAL_LOST, isIncorporeal, layoutsOf, statOf } from '../../src/engine/code-hooks'
import { applyEffect, hasCondition } from '../../src/engine/effects'
import { answerControlDecision } from '../../src/engine/turnflow'
import { continueControl } from '../../src/engine/phases/control'
import type { GameSetup } from '../../src/engine/index'
import type { GameState } from '../../src/engine/types'
import { asOut, choose, openCombat, place, send, settle } from './action-helpers'
import { bundle, newGame, runControlTo, runSetup } from './turn-helpers'

const SETUP: GameSetup = { scenario: 'scn-qs-demo', lists: { A: 'cry.l.necro-recon', B: 'cyg.l.qs-recon' } }
const start = (seed: string, setup: GameSetup = SETUP) => runControlTo(runSetup(newGame(setup, seed))).state
const NEKANE = 'A:L', HADES = 'A:e0', CHATTER = 'A:e1', F1 = 'A:u2.1', F2 = 'A:u2.2', F3 = 'A:u2.3', CAINE = 'B:L', DEUCE = 'B:e0'

/** Park every model out of the way except `keep`. */
function clearAround(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
const furyField = (seed: string): GameState => {
  let s = clearAround(start(seed), [F1, F2, F3, CAINE])
  s = place(s, F1, { x: 0, z: 0 }); s = place(s, F2, { x: 2, z: 0 }); s = place(s, F3, { x: -2, z: 0 }); s = place(s, CAINE, { x: 0, z: 6 })
  return s
}
const choices = (o: ReturnType<typeof asOut>) => (o.pending.options ?? []).map((x) => x.action as unknown as { modelId: string; choice?: string; abilityId?: string })
/** The unit's next trooper may still owe its movement choice. */
const skipMove = (o: ReturnType<typeof asOut>, id: string) => (o.pending.kind === 'chooseMovement' ? send(o, { type: 'chooseMovement', option: 'forfeit', modelId: id }) : o)
const offers = (o: ReturnType<typeof asOut>, modelId: string, abilityId: string) => choices(o).some((a) => a.modelId === modelId && a.abilityId === abilityId)

describe('Cryx fixes', () => {
  it('FAC-CRY-016 Power of Death: undead within 10" gain +2 melee damage for the turn, others do not; only one Fury per unit activation may use it', () => {
    let s = furyField('cry-pod')
    s = place(s, CHATTER, { x: 8, z: 0 }); s = place(s, HADES, { x: 14, z: 0 })
    let o = choose(asOut(s), 'A:u2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: F1 })
    expect(offers(o, F1, 'cry.a.power-of-death')).toBe(true)
    o = send(o, { type: 'chooseCombatAction', modelId: F1, choice: 'specialAction', abilityId: 'cry.a.power-of-death' })
    const e = o.state.effects.find((x) => x.sourceId === 'cry.a.power-of-death')!
    expect(e.targetIds).toEqual(expect.arrayContaining([F1, F2, F3, CHATTER]))
    expect(e.targetIds).not.toContain(HADES) // 14" away
    expect(e.targetIds).not.toContain(CAINE) // living enemy
    expect((e as unknown as { rollMods: { roll: string; value: number; kinds?: string[] }[] }).rollMods[0]).toMatchObject({ roll: 'damage', value: 2, kinds: ['melee', 'power'] })
    // the next Fury is not offered it again, nor a second one of its siblings
    o = skipMove(o, F2)
    expect(o.pending.kind).toBe('chooseCombatAction')
    expect(offers(o, F2, 'cry.a.power-of-death')).toBe(false)
    expect(offers(o, F2, 'cry.a.stygian-abyss')).toBe(true)
  })

  it('FAC-CRY-017 Stygian Abyss: a critical hit blinds the target; the arcane star attack keeps Incorporeal; once per unit activation (loop seeds for a crit)', () => {
    let crit = false, noCrit = false
    for (let i = 0; i < 300 && !(crit && noCrit); i++) {
      const s = furyField('cry-sa' + i)
      let o = choose(asOut(s), 'A:u2')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: F1 })
      o = send(o, { type: 'chooseCombatAction', modelId: F1, choice: 'specialAttack', abilityId: 'cry.a.stygian-abyss' })
      o = send(o, { type: 'chooseAttack', modelId: F1, weaponId: 'cry.w.stygian-abyss', targetId: CAINE, additional: false })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }> | undefined
      expect(res).toBeDefined()
      expect(isIncorporeal(o.state, bundle, F1)).toBe(true) // RB p113: an arcane attack does not end Incorporeal
      expect(o.state.effects.some((e) => e.sourceId === INCORPOREAL_LOST)).toBe(false)
      if (!res!.hit) continue
      if (o.state.models[CAINE]!.life !== 'active') continue
      if ((res as unknown as { crit: boolean }).crit) { crit = true; expect(hasCondition(o.state, o.state.models[CAINE]!, 'blind')).toBe(true) }
      else { noCrit = true; expect(hasCondition(o.state, o.state.models[CAINE]!, 'blind')).toBe(false) }
      // the unit's other Furies cannot use it again this activation
      o = skipMove(o, F2)
      expect(offers(o, F2, 'cry.a.stygian-abyss')).toBe(false)
      expect(offers(o, F2, 'cry.a.power-of-death')).toBe(true)
    }
    expect(crit).toBe(true)
    expect(noCrit).toBe(true)
  })

  it('FAC-CRY-004b Wraithbinder follows Incorporeal: a Fury that has lost it by attacking drops to 14 ARM until its next activation', () => {
    let s = start('cry-wb2')
    s = place(s, NEKANE, { x: 0, z: 0 }); s = place(s, F1, { x: 5, z: 0 })
    expect(statOf(s, bundle, F1, 'ARM')).toBe(17)
    expect(bundle.byId['cry.furies-a']).not.toMatchObject({ keywords: expect.arrayContaining(['incorporeal']) })
    s = applyEffect(s, { sourceId: INCORPOREAL_LOST, name: 'Incorporeal lost', owner: 'A', casterId: F1, targetIds: [F1], mods: [], duration: 'round' }).state
    expect(isIncorporeal(s, bundle, F1)).toBe(false)
    expect(statOf(s, bundle, F1, 'ARM')).toBe(14)
    // a Fury that attacks in melee through the engine loses the +3 as well
    let t = clearAround(start('cry-wb3'), [NEKANE, F1, DEUCE])
    t = place(t, NEKANE, { x: 0, z: -4 }); t = place(t, F1, { x: 0, z: 0 }); t = place(t, DEUCE, { x: 0, z: 2.6 })
    expect(statOf(t, bundle, F1, 'ARM')).toBe(17)
    let o = choose(asOut(t), 'A:u2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: F1 })
    o = send(o, { type: 'chooseCombatAction', modelId: F1, choice: 'melee' })
    o = send(o, { type: 'chooseAttack', modelId: F1, weaponId: 'cry.w.wraith-strike', targetId: DEUCE, additional: false })
    expect(statOf(o.state, bundle, F1, 'ARM')).toBe(14)
  })

  it('FAC-CRY-015 Marionette: limited to one use per unit activation and offered as an arcane star attack (the reroll itself is in cryx-m10.test.ts)', () => {
    const ab = bundle.byId['cry.a.marionette'] as unknown as { limit?: string; kind: string }
    expect(ab.kind).toBe('specialAttack')
    expect(ab.limit).toBe('oncePerActivation')
    const s = furyField('cry-mar')
    let o = choose(asOut(s), 'A:u2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: F1 })
    expect(offers(o, F1, 'cry.a.marionette')).toBe(true)
    expect(offers(o, F1, 'cry.a.stygian-abyss')).toBe(true)
  })

  it('FAC-CRY-010 Ancillary Attack: Chatterbane lets a friendly cohort within 3" make a basic attack, once per turn per target', () => {
    let s = clearAround(start('cry-aa'), [CHATTER, HADES, DEUCE])
    s = place(s, CHATTER, { x: 0, z: 0 }); s = place(s, HADES, { x: 2.5, z: 0 }); s = place(s, DEUCE, { x: 2.5, z: 5 })
    let o = choose(asOut(s), CHATTER)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: CHATTER })
    const opt = (o.pending.options ?? []).find((x) => (x.action as unknown as { abilityId?: string; targetId?: string }).abilityId === 'cry.a.ancillary-attack' && (x.action as unknown as { targetId?: string }).targetId === HADES)
    expect(opt).toBeDefined()
    o = send(o, opt!.action as unknown as Record<string, unknown>)
    const decl = o.events.find((e) => e.type === 'AttackDeclared') as unknown as { attackerId: string; targetId: string }
    expect(decl).toMatchObject({ attackerId: HADES, targetId: DEUCE })
    expect(o.state.activation!.limitsUsed).toContain(`cry.a.ancillary-attack:${HADES}`)
    // out of range: not offered
    let far = place(s, HADES, { x: 6, z: 0 })
    far = place(far, DEUCE, { x: 6, z: 5 })
    let f = choose(asOut(far), CHATTER)
    f = send(f, { type: 'chooseMovement', option: 'forfeit', modelId: CHATTER })
    expect(offers(f, CHATTER, 'cry.a.ancillary-attack')).toBe(false)
  })

  it('FAC-CRY-011 Enliven: the model advances only after an enemy attack that damages it; a hit that deals nothing leaves it waiting (loop seeds)', () => {
    let fired = false, kept = false
    for (let i = 0; i < 300 && !(fired && kept); i++) {
      let s = clearAround(start('cry-en' + i), [HADES, CAINE])
      s = place(s, HADES, { x: 0, z: 0 }); s = place(s, CAINE, { x: 0, z: 6 })
      // earlier damage on Hades: the old check fired on any hit once this existed
      s = applyDamage(s, HADES, 4, { source: 'direct', layouts: layoutsOf(bundle, s.models[HADES]!) }).state
      s = applyEffect(s, { sourceId: 'cry.a.enliven', name: 'Enliven', owner: 'A', casterId: CHATTER, targetIds: [HADES], mods: [], duration: 'round', afterDamageAdvance: 6 } as never).state
      s = { ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 }
      const dmgBefore = JSON.stringify(s.models[HADES]!.damage)
      let o = openCombat(asOut(s), CAINE, 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: CAINE, weaponId: 'cyg.w.spellstorm-pistol', targetId: HADES, additional: false })
      const evs: GameEvent[] = [...o.events]
      for (let k = 0; k < 30 && !['triggerWindow', 'chooseAttack', 'chooseActivation', 'moveModel'].includes(o.pending.kind); k++) {
        const kind = o.pending.kind
        if (kind === 'boostAttack') o = send(o, { type: 'boostAttack', boost: false })
        else if (kind === 'boostDamage') o = send(o, { type: 'boostDamage', boost: false })
        else if (kind === 'powerField') o = send(o, { type: 'powerField', spend: 0 })
        else if (kind === 'chooseBoxes') o = send(o, { type: 'chooseBoxes', column: Number(o.pending.options![0]!.id.replace('col', '')) })
        else if (kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: o.pending.options![0]!.id })
        else break
        evs.push(...o.events)
      }
      const hit = (evs.find((e) => e.type === 'AttackResolved') as unknown as { hit: boolean } | undefined)?.hit
      const hurt = JSON.stringify(o.state.models[HADES]!.damage) !== dmgBefore
      const offered = o.pending.kind === 'moveModel' && (o.pending.context.data as { trigger?: { abilityId?: string } }).trigger?.abilityId === 'cry.a.enliven'
      if (offered) {
        fired = true
        expect(hurt).toBe(true)
        expect((o.pending.constraints as { maxDist: number }).maxDist).toBe(6)
        expect(o.state.effects.some((e) => e.sourceId === 'cry.a.enliven')).toBe(false)
      } else if (hit && !hurt) {
        kept = true
        expect(o.state.effects.some((e) => e.sourceId === 'cry.a.enliven')).toBe(true)
      }
    }
    expect(fired).toBe(true)
    expect(kept).toBe(true)
  })

  it('FAC-CRY-025b Mirage: Apparition lets the model be placed within 2" in the Control Phase, once, or it may decline', () => {
    const mir = bundle.byId['cry.s.mirage'] as unknown as { effect: { op: string; ability: string }[] }
    expect(mir.effect[0]).toMatchObject({ op: 'grantAbility', ability: 'cry.a.apparition' })
    let s = clearAround(start('cry-ap'), [HADES, DEUCE])
    s = place(s, HADES, { x: 0, z: 0 }); s = place(s, DEUCE, { x: 9, z: 9 })
    s = applyEffect(s, { sourceId: 'cry.s.mirage', name: 'Mirage', owner: 'A', casterId: NEKANE, targetIds: [HADES], mods: [], grants: ['cry.a.apparition'], duration: 'upkeep' } as never).state
    s = { ...s, phase: 'control' }
    const r = continueControl(s, bundle, 'apparition', [])
    expect(r.pending).toMatchObject({ kind: 'moveModel', player: 'A', context: { modelId: HADES, data: { code: 'apparition' } } })
    expect((r.pending!.constraints as { maxDist: number }).maxDist).toBe(2)
    const go = (st: GameState, action: Record<string, unknown>) => answerControlDecision(st, bundle, { ...action, decisionId: st.pending.id, player: 'A' } as never)
    // too far is refused
    expect(go(r.state, { type: 'moveModel', modelId: HADES, path: [{ x: 3, z: 0 }] })).toHaveProperty('rejection')
    const ok = go(r.state, { type: 'moveModel', modelId: HADES, path: [{ x: 1.5, z: 0 }] }) as { state: GameState; events: GameEvent[] }
    expect(ok).not.toHaveProperty('rejection')
    expect(ok.state.models[HADES]!.pos).toEqual({ x: 1.5, z: 0 })
    expect(ok.events.some((e) => e.type === 'ModelMoved' && (e as unknown as { kind: string }).kind === 'place')).toBe(true)
    expect(ok.state.pending.kind).not.toBe('moveModel') // used for the turn: the next decision is not another Apparition
    // declining costs nothing and the model stays
    const no = go(r.state, { type: 'pass' }) as { state: GameState }
    expect(no.state.models[HADES]!.pos).toEqual({ x: 0, z: 0 })
    expect(no.state.pending.kind).not.toBe('moveModel')
  })

  it('FAC-CRY-026 Crippling Grasp is offensive: casting it rolls an attack against the target (loop seeds for a hit that applies -2 DEF)', () => {
    expect((bundle.byId['cry.s.crippling-grasp'] as unknown as { offensive: boolean }).offensive).toBe(true)
    let landed = false
    for (let i = 0; i < 80 && !landed; i++) {
      let s = clearAround(start('cry-cg' + i), [NEKANE, CAINE])
      s = place(s, NEKANE, { x: 0, z: 0 }); s = place(s, CAINE, { x: 0, z: 6 })
      s = { ...s, models: { ...s.models, [NEKANE]: { ...s.models[NEKANE]!, focus: 6 } } }
      const def = statOf(s, bundle, CAINE, 'DEF')
      let o = choose(asOut(s), NEKANE)
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: NEKANE })
      o = send(o, { type: 'castSpell', casterId: NEKANE, spellId: 'cry.s.crippling-grasp', targetId: CAINE })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as unknown as { hit: boolean } | undefined
      expect(res).toBeDefined() // an attack roll was made
      if (!res!.hit) { expect(o.state.effects.some((e) => e.sourceId === 'cry.s.crippling-grasp')).toBe(false); continue }
      landed = true
      expect(statOf(o.state, bundle, CAINE, 'DEF')).toBe(def - 2)
    }
    expect(landed).toBe(true)
  })

  it('FAC-CRY-021b Volume Fire against a 40 mm base: +1 to hit (Lazarenko), nothing against a 30 mm base', () => {
    const khador: GameSetup = { scenario: 'scn-qs-demo', lists: { A: 'cry.l.necro-recon', B: 'kha.l.qs-recon' } }
    const laz = Object.values(start('cry-vf40', khador).models).find((m) => m.profileId === 'kha.lazarenko')!
    expect(laz.base).toBe(40)
    const measured = (targetId: string, seed: string) => {
      let s = clearAround(start(seed, khador), [CHATTER, targetId])
      s = place(s, CHATTER, { x: 0, z: 0 }); s = place(s, targetId, { x: 0, z: 6 })
      let o = openCombat(asOut(s), CHATTER, 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: CHATTER, weaponId: 'cry.w.light-spiker', targetId, additional: false })
      o = settle(o)
      return o.events.find((e) => e.type === 'AttackMeasured') as unknown as { mods: { source: string; value: number }[] }
    }
    const m40 = measured(laz.id, 'cry-vf40a')
    expect(m40.mods.find((m) => m.source === 'cry.a.volume-fire')?.value).toBe(1)
    const small = Object.values(start('cry-vf30', khador).models).find((m) => m.owner === 'B' && m.base === 30)!
    expect(measured(small.id, 'cry-vf30a').mods.some((m) => m.source.startsWith('cry.a.volume-fire'))).toBe(false)
  })

  it('FAC-CRY-023b Wrath of Lyliss: with the feat on, Nekane pays a spell cost in damage instead of focus', () => {
    let s = clearAround(start('cry-wol2'), [NEKANE, HADES])
    s = place(s, NEKANE, { x: 0, z: 0 }); s = place(s, HADES, { x: 3, z: 0 })
    s = { ...s, models: { ...s.models, [NEKANE]: { ...s.models[NEKANE]!, focus: 0 } } }
    const marked = (st: GameState) => JSON.stringify(st.models[NEKANE]!.damage)
    const noFeat = send(choose(asOut(s), NEKANE), { type: 'chooseMovement', option: 'forfeit', modelId: NEKANE })
    let p = send(noFeat, { type: 'useFeat', casterId: NEKANE, featId: 'cry.f.wrath-of-lyliss' })
    const b2 = marked(p.state)
    p = send(p, { type: 'castSpell', casterId: NEKANE, spellId: 'cry.s.mirage', targetId: HADES })
    expect(p.state.models[NEKANE]!.focus).toBe(0)
    expect(marked(p.state)).not.toBe(b2) // one damage point paid
    expect(p.state.effects.some((e) => e.sourceId === 'cry.s.mirage')).toBe(true)
  })
})
