// Fury UI (81 G): badges, battlegroup rows, spiral model, leech / transfer / vent prompts, forced costs, beats and feed lines.
// Engine numbers come from query.* on hand-built worlds (tests/engine/fury-helpers.ts); the components are rendered with
// react-dom/server against a real Trollbloods game.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { query, type GameEvent, type GameState } from '../../src/engine/index'
import { raiseLeech, raiseTransfer, raiseVent } from '../../src/engine/pending'
import { BUNDLE as B, beast, enemyLeader, warlock, world } from '../engine/fury-helpers'
import { buildBeats } from '../../src/client/presentation/beats'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import { useAnnounceStore } from '../../src/client/presentation/announceStore'
import { setDirectorClock, setPaused } from '../../src/client/presentation/director'
import { newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { ui, useUiStore } from '../../src/client/store/uiStore'
import { useTrayStore } from '../../src/client/dice/trayStore'
import { GridCardFor } from '../../src/client/ui/GridCard'
import { groupActions } from '../../src/client/ui/activationView'
import { buildFeed } from '../../src/client/ui/feedView'
import { LeechForm, TransferForm, VentForm } from '../../src/client/ui/fury/FuryForms'
import { SpiralSvg } from '../../src/client/ui/fury/SpiralCard'
import { furyFeedLine } from '../../src/client/ui/fury/feedLines'
import { battlegroupView, costWords, furyBadge, leechModel, payWords, spiralModel, transferModel, ventOdds, FRENZY_HOT } from '../../src/client/ui/fury/furyView'
import { buildPromptView } from '../../src/client/ui/promptView'

const state0 = (over: Parameters<typeof beast>[3] = {}, wFury = 3): GameState =>
  world([warlock({ fury: wFury }), beast('A:b1', 4, 0, over), beast('A:b2', -5, 0), enemyLeader()])

describe('fury badges and battlegroup', () => {
  it('FURY-UI-001 a warlock badge shows fury/ARC and no frenzy chance; a beast adds THR and the engine pFrenzy', () => {
    const s = state0({ fury: 3 })
    const w = furyBadge(s, 'A:L')!
    expect(w).toMatchObject({ kind: 'warlock', fury: 3, cap: 6, capStat: 'ARC', pFrenzy: null, thr: null })
    expect(w.pips).toHaveLength(6)
    expect(w.pips.filter(Boolean)).toHaveLength(3)
    const b = furyBadge(s, 'A:b1')!
    const t = query.threshold(s, 'A:b1')
    expect(b).toMatchObject({ kind: 'beast', fury: 3, cap: 3, capStat: 'FURY', thr: t.thr, pFrenzy: t.pFrenzy })
    expect(b.tone).toBe(t.pFrenzy > FRENZY_HOT ? 'hot' : t.pFrenzy > 0 ? 'warn' : 'ok')
    expect(furyBadge(s, 'B:L')).toBeNull()
  })

  it('FURY-UI-002 a beast with no fury is safe; a wild beast never shows a frenzy chance', () => {
    const s = state0({ fury: 0 })
    expect(furyBadge(s, 'A:b1')!.pFrenzy).toBe(0)
    expect(furyBadge(s, 'A:b1')!.tone).toBe('ok')
    const wild = world([warlock(), beast('A:b1', 4, 0, { fury: 0, wild: true, inert: true }), enemyLeader()])
    expect(furyBadge(wild, 'A:b1')!.pFrenzy).toBeNull()
    expect(furyBadge(wild, 'A:b1')!.wild).toBe(true)
  })

  it('FURY-UI-003 the battlegroup strip lists each beast with the engine control and force flags', () => {
    const s = world([warlock({ fury: 2 }), beast('A:b1', 4, 0, { fury: 1 }), beast('A:far', 40, 0), enemyLeader()])
    const v = battlegroupView(s, 'A:L')!
    const bg = query.battlegroup(s, 'A:L')
    expect(v.ctrl).toBe(bg.ctrl)
    expect(v.rows.map((r) => r.id).sort()).toEqual(['A:b1', 'A:far'])
    const near = v.rows.find((r) => r.id === 'A:b1')!
    const far = v.rows.find((r) => r.id === 'A:far')!
    expect(near.inCtrl).toBe(true)
    expect(far.inCtrl).toBe(false)
    expect(far.forceable).toBe(false)
    expect(far.blockText).toMatch(/control range/i)
    expect(battlegroupView(s, 'B:L')).toBeNull()
  })
})

describe('life spiral model', () => {
  it('FURY-UI-010 six branches, aspects from the engine, outermost box first, a crippled aspect flagged', () => {
    const s = state0()
    const sv = spiralModel(s, 'A:b1')!
    const q = query.spiral(s, 'A:b1')
    expect(sv.branches).toHaveLength(6)
    expect(sv.total).toBe(q.branches.reduce((a, b) => a + b.boxes.length, 0))
    expect(sv.branches[0]!.boxes[0]).toMatchObject({ branch: 1, i: 0, aspect: 'mind', filled: false })
    expect(sv.aspects.map((a) => a.aspect)).toEqual(['mind', 'body', 'spirit'])
    expect(sv.aspects.every((a) => !a.crippled)).toBe(true)
    // fill every spirit box: Spirit is crippled and the card says what that does
    const m = s.models['A:b1']!
    const grid = m.damage.track === 'grid' ? m.damage.grids[0]!.cols.map((c) => [...c]) : []
    const letters = ['MM--BB', 'S-S', 'BB-MM--', 'S-S-S', '------', 'M--']
    letters.forEach((br, c) => [...br].forEach((ch, i) => { if (ch === 'S') grid[c]![i] = true }))
    const g0 = m.damage.track === 'grid' ? m.damage.grids[0]! : null
    const hurt = { ...s, models: { ...s.models, 'A:b1': { ...m, damage: { track: 'grid' as const, grids: [{ ...g0!, cols: grid }] }, crippled: ['s'] } } } as GameState
    const sv2 = spiralModel(hurt, 'A:b1', new Set(['main:0:0']))!
    const sp = sv2.aspects.find((a) => a.aspect === 'spirit')!
    expect(sp.crippled).toBe(true)
    expect(sp.filled).toBe(sp.total)
    expect(sp.effect).toMatch(/cannot be forced/)
    expect(sv2.branches[0]!.boxes[0]!.flash).toBe(true)
  })

  it('FURY-UI-011 the SVG has one box per spiral box with the documented test ids', () => {
    const s = state0()
    const sv = spiralModel(s, 'A:b1')!
    const out = renderToStaticMarkup(createElement(SpiralSvg, { model: sv, id: 'A:b1' }))
    expect((out.match(/data-testid="spiral-box-/g) ?? []).length).toBe(sv.total)
    expect(out).toContain('data-testid="spiral-box-1-0"')
    expect(out).toContain('data-aspect="mind"')
    expect(out).toContain('data-filled="false"')
  })
})

describe('fury prompts', () => {
  it('FURY-UI-020 leech: the form lists beasts holding fury, starts at the engine max plan and shows engine odds', () => {
    const s = world([warlock({ fury: 1 }), beast('A:b1', 4, 0, { fury: 2 }), beast('A:b2', -5, 0), enemyLeader()])
    const { state, pending } = raiseLeech(s, B, 'A:L')
    const v = buildPromptView(state, pending)
    expect(v.kind).toBe('leech')
    expect(v.form).toBe('leech')
    expect(v.title).toMatch(/leech fury/i)
    const lm = leechModel(state, pending)!
    expect(lm.room).toBe(5)
    expect(lm.sources.map((x) => x.beastId)).toEqual(['A:b1'])
    expect(lm.sources[0]!.fury).toBe(2)
    const out = renderToStaticMarkup(createElement(LeechForm, { state, pd: pending }))
    expect(out).toContain('data-testid="leech-form"')
    expect(out).toContain('data-testid="leech-n-A:b1">2<')
    expect(out).toContain('data-testid="leech-n-self">0<')
    expect(out).toContain('data-testid="leech-option-max"')
    expect(out).toContain('data-testid="leech-option-none"')
    const pv = query.leechPreview(state, 'A:L', { from: { 'A:b1': 2 }, self: 0 })
    expect(out).toContain(`You gain ${pv.gained}, ending at ${pv.after}`)
  })

  it('FURY-UI-021 transfer: one card per eligible beast with the engine split, plus Keep', () => {
    const s = world([warlock({ fury: 2 }), beast('A:b1', 4, 0, { fury: 1 }), beast('A:b2', -5, 0, { fury: 3 }), enemyLeader()])
    const { state, pending } = raiseTransfer(s, B, 'A:L', 4)
    const v = buildPromptView(state, pending)
    expect(v.form).toBe('transfer')
    expect(v.title).toContain('4 incoming')
    const tm = transferModel(state, pending, () => 20)!
    const rows = query.transferPreview(state, 'A:L', 4).filter((r) => r.eligible)
    expect(tm.candidates.map((c) => c.beastId).sort()).toEqual(rows.map((r) => r.beastId).sort())
    expect(tm.candidates.map((c) => c.beastId)).not.toContain('A:b2') // already at its FURY cap
    const c1 = tm.candidates.find((c) => c.beastId === 'A:b1')!
    expect(c1.absorbed).toBe(rows.find((r) => r.beastId === 'A:b1')!.absorbed)
    const out = renderToStaticMarkup(createElement(TransferForm, { state, pd: pending }))
    expect(out).toContain('data-testid="transfer-to-A:b1"')
    expect(out).toContain('data-testid="transfer-keep"')
    expect(out).not.toContain('data-testid="transfer-to-A:b2"')
    expect(out).toContain(`takes ${c1.absorbed}`)
  })

  it('FURY-UI-022 vent: one button per amount, each with the engine frenzy chance after venting', () => {
    const s = world([warlock(), beast('A:b1', 4, 0, { fury: 3 }), enemyLeader()])
    const { state, pending } = raiseVent(s, 'A:b1')
    expect(buildPromptView(state, pending).form).toBe('vent')
    const out = renderToStaticMarkup(createElement(VentForm, { state, pd: pending }))
    for (const k of [0, 1, 2, 3]) expect(out).toContain(`data-testid="vent-${k}"`)
    expect(ventOdds(state, 'A:b1', 3)).toBe(0)
    expect(ventOdds(state, 'A:b1', 0)).toBe(query.threshold(state, 'A:b1').pFrenzy)
    expect(ventOdds(state, 'A:b1', 1)!).toBeLessThanOrEqual(ventOdds(state, 'A:b1', 0)!)
  })

  it('FURY-UI-023 costs: forced shows fury gained on the beast, warlock fury and focus keep their words', () => {
    expect(costWords({ focus: 0, forced: 1 }, 'Bomber')).toBe('+1 fury on Bomber')
    expect(costWords({ focus: 0, fury: 2 })).toBe('2 fury')
    expect(costWords({ focus: 1 })).toBe('1 focus')
    expect(costWords({ focus: 0 })).toBeUndefined()
    const s = state0({ fury: 1 }, 4)
    expect(payWords(s, 'A:L', { focus: 0, fury: 1 })).toBe('1 fury, 3 left')
    expect(payWords(s, 'A:b1', { focus: 0, forced: 1 })).toMatch(/forces \+1 fury on .*holds 1\/3/)
    expect(payWords(s, 'B:L', { focus: 1 })).toMatch(/^1 focus, \d+ left$/)
  })

  it('FURY-UI-024 the reave prompt reads as words, not ids', () => {
    const s = world([warlock(), beast('A:b1', 4, 0, { fury: 2 }), enemyLeader()])
    const pd = { ...s.pending, kind: 'reave' as const, canPass: false, context: { modelId: 'A:b1' }, options: [{ id: 'A:L', label: 'Reave with A:L', action: { type: 'reave' as const, decisionId: s.pending.id, player: 'A' as const, reaverId: 'A:L' } }] }
    const v = buildPromptView(s, pd)
    expect(v.title).toMatch(/fallen holding fury/)
    expect(v.options[0]!.label).toBe('Reave with A:L') // names resolve from the data bundle; the test profile has none
  })
})

describe('activation panel for fury models', () => {
  it('FURY-UI-030 a beast decision lists forced costs red and a rile; a warlock lists shed', () => {
    const s = world([warlock({ fury: 4 }), beast('A:b1', 4, 0, { fury: 0 }), enemyLeader()])
    const did = s.pending.id
    const pd = {
      ...s.pending, kind: 'chooseMovement' as const, context: { modelId: 'A:b1' }, canPass: false,
      options: [
        { id: 'run', label: 'run', cost: { focus: 0, forced: 1 }, action: { type: 'chooseMovement' as const, decisionId: did, player: 'A' as const, option: 'run' as const } },
        { id: 'rile:2', label: 'Rile (+2 fury)', cost: { focus: 0, forced: 2 }, action: { type: 'adjustFury' as const, decisionId: did, player: 'A' as const, modelId: 'A:b1', delta: 2 } },
      ],
    }
    const g = groupActions(s, pd, pd.options.map((o) => o.action), 'A:b1')
    const run = g.movement.find((b) => b.testid === 'act-move-run')!
    expect(run.forced).toBe(true)
    expect(run.cost).toMatch(/^\+1 fury on /)
    expect(g.fury.map((b) => b.testid)).toEqual(['act-rile-2'])
    const pdW = { ...pd, context: { modelId: 'A:L' }, options: [{ id: 'shed:all', label: 'Shed all fury', action: { type: 'adjustFury' as const, decisionId: did, player: 'A' as const, modelId: 'A:L', delta: -4 } }] }
    const gw = groupActions(s, pdW, pdW.options.map((o) => o.action), 'A:L')
    expect(gw.fury.map((b) => b.label)).toEqual(['Shed 4 fury'])
  })

  it('FURY-UI-031 a beast that cannot be forced says why (from query.fury)', () => {
    const s = world([warlock(), beast('A:far', 40, 0), enemyLeader()])
    const pd = { ...s.pending, kind: 'chooseMovement' as const, context: { modelId: 'A:far' }, canPass: false, options: [] }
    const g = groupActions(s, pd, [], 'A:far')
    expect(g.forceNote).toMatch(/control range/i)
  })
})

describe('beats and feed lines', () => {
  const opts = { narration: true, playerName: (p: 'A' | 'B') => `Player ${p}`, modelName: (id: string) => id }
  const se = (event: GameEvent, seq = 1) => ({ seq, event })

  it('FURY-UI-040 fury events become timed beats with pops built from the event numbers', () => {
    const s = state0()
    const leech = se({ type: 'FuryLeeched', warlockId: 'A:L', sources: [{ modelId: 'A:b1', points: 2 }], selfPoints: 1, spiritBond: 0, after: 6 })
    const beats = buildBeats(s, [leech], opts)
    expect(beats).toHaveLength(1)
    expect(beats[0]).toMatchObject({ kind: 'fury', applyAt: 'start' })
    expect(beats[0]!.baseMs).toBeGreaterThan(0)
    expect(beats[0]!.pops!.map((p) => p.text)).toEqual(['-2 fury', '+3 fury', '1 from itself'])
    const fz = buildBeats(s, [se({ type: 'Frenzied', beastId: 'A:b1', targetId: 'A:L', tiedIds: ['A:L'] })], opts)
    expect(fz[0]).toMatchObject({ kind: 'frenzy' })
    expect(fz[0]!.banner!.text).toBe('A:b1 frenzies at A:L')
    const tr = buildBeats(s, [se({ type: 'DamageTransferred', warlockId: 'A:L', beastId: 'A:b1', points: 4, absorbed: 3, overflow: 1 })], opts)
    expect(tr[0]).toMatchObject({ kind: 'transfer' })
    expect(tr[0]!.pops!.map((p) => p.text)).toEqual(['moves 3, 1 stay', 'takes 3'])
    const ac = buildBeats(s, [se({ type: 'AspectCrippled', modelId: 'A:b1', aspect: 'spirit' })], opts)
    expect(ac[0]!.pops![0]!.text).toBe('Spirit crippled')
    const empty = buildBeats(s, [se({ type: 'FuryLeeched', warlockId: 'A:L', sources: [], selfPoints: 0, spiritBond: 0, after: 6 })], opts)
    expect(empty[0]!.kind).toBe('apply')
  })

  it('FURY-UI-041 feed lines are in our words and flag a friendly frenzy target', () => {
    const s = state0()
    const f = furyFeedLine(s, { type: 'Frenzied', beastId: 'A:b1', targetId: 'A:b2', tiedIds: ['A:b2', 'A:L'] })!
    expect(f.tone).toBe('death')
    expect(f.text).toMatch(/frenzies and charges the closest model/)
    expect(f.text).toMatch(/a friend/)
    expect(f.detail[0]).toMatch(/Tied for closest/)
    const foe = furyFeedLine(s, { type: 'Frenzied', beastId: 'A:b1', targetId: 'B:L', tiedIds: ['B:L'] })!
    expect(foe.text).not.toMatch(/a friend/)
    const none = furyFeedLine(s, { type: 'Frenzied', beastId: 'A:b1', targetId: null, tiedIds: [], reason: 'noTarget' })!
    expect(none.text).toMatch(/nothing in sight/)
    expect(furyFeedLine(s, { type: 'FuryChanged', modelId: 'A:L', delta: 1, after: 3, reason: 'leech' })).toBeNull()
    expect(furyFeedLine(s, { type: 'ThresholdChecked', beastId: 'A:b1', rollId: 'r:1', fury: 3, thr: 8, total: 9, frenzied: true })!.detail[0]).toMatch(/above it/)
    // and the event feed picks them up
    const lines = buildFeed(s, [{ seq: 5, event: { type: 'BeastForced', beastId: 'A:b1', controllerId: 'A:L', purpose: 'run', gained: 1, after: 1 } }])
    expect(lines[0]!.text).toMatch(/forced to run: \+1 fury, now 1/)
  })
})

describe('cards on a real Trollbloods game', () => {
  beforeEach(() => {
    setStorage(memoryStorage()); setDirectorClock(null); useSettingsStore.getState().set({ speed: 0 }); setPaused(false); resetGameStore(); ui.reset()
  })
  const html = (el: ReturnType<typeof createElement>): string => {
    for (const s of [usePresentedStore, useGameStore, useUiStore, useAnnounceStore, useSettingsStore, useTrayStore]) Object.assign(s.getInitialState() as object, s.getState() as object)
    return renderToStaticMarkup(el)
  }

  it('FURY-UI-050 the warlock card shows flame pips and its battlegroup; the beast card shows a spiral, THR and the frenzy chance', () => {
    expect(newGame({ scenario: 'scn-qs-demo', lists: { A: 'trl.l.starter-recon', B: 'kha.l.qs-recon' }, controllers: { A: 'human', B: 'human' }, seed: 'fury-ui' })).toBeNull()
    const dealt = useGameStore.getState().state!
    const bs0 = Object.values(dealt.models).find((m) => m.owner === 'A' && m.type === 'beast')!
    // put the warbeast on the table beside its warlock (before deployment it is off-table and not in the battlegroup)
    const state = { ...dealt, models: { ...dealt.models, [bs0.id]: { ...bs0, offTable: false, pos: { x: 3, z: 0 } } } }
    usePresentedStore.setState({ state })
    const wl = Object.values(state.models).find((m) => m.owner === 'A' && m.type === 'leader')!
    const bs = state.models[bs0.id]!
    expect(wl.fury).toBeGreaterThan(0)
    const wOut = html(createElement(GridCardFor, { model: wl }))
    expect(wOut).toContain(`data-testid="card-fury-${wl.id}"`)
    expect(wOut).toContain(`data-fury="${wl.fury}"`)
    expect(wOut).toContain(`data-testid="card-battlegroup-${wl.id}"`)
    expect(wOut).toContain('Warlock')
    expect(wOut).not.toMatch(/\d+ focus/)
    const bOut = html(createElement(GridCardFor, { model: bs }))
    expect(bOut).toContain(`data-testid="card-spiral-${bs.id}"`)
    expect(bOut).toContain('data-testid="spiral-box-1-0"')
    expect(bOut).toContain(`data-testid="card-thr-${bs.id}"`)
    expect(bOut).toContain(`data-testid="card-frenzy-${bs.id}"`)
    expect(bOut).toContain('Warbeast')
    expect(bOut).not.toContain('card-grid-')
  })
})

describe('how to play', () => {
  it('FURY-UI-060 has a Warlocks and fury tab covering leech, frenzy, transfer and the spiral', async () => {
    const { HELP_TABS } = await import('../../src/client/ui/help/helpContent')
    const t = HELP_TABS.find((x) => x.id === 'fury')!
    expect(t.title).toBe('Warlocks and fury')
    const text = JSON.stringify(t.blocks).toLowerCase()
    for (const w of ['leech', 'frenzy', 'transfer', 'spiral', 'wild']) expect(text).toContain(w)
  })
})
