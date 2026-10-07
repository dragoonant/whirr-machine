// M13 WP7 (91 B, 12 SR-001 to SR-003, SR-014, SR-021, SR-022): the seven Steamroller 2026 scenarios as data, and the SR layout fit.
import { describe, expect, it } from 'vitest'
import { ALL_QUARTER_TURNS, BOARDS, droppedPieces, eligibleLayouts, layoutFit, pickBattlefield, preferFlagTerrain, rotateQuarterTurns } from '../../src/data/battlefields'
import { loadBundle, type TypedRecord } from '../../src/data/index'
import { baseRadius } from '../../src/engine/geometry'
import { distToShape, terrainTraits, worldShape } from '../../src/engine/terrain'
import type { TerrainInstance } from '../../src/engine/types'
import { objectiveClearanceProblems, objectiveClearances, validateAll } from '../../tools/validate-data'

type Any = Record<string, any>
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any

const SR = [
  'scn-sr26-trench-warfare', 'scn-sr26-two-fronts', 'scn-sr26-wolves', 'scn-sr26-pressure-point',
  'scn-sr26-high-stakes', 'scn-sr26-fault-line', 'scn-sr26-payload',
] as const

const MM: Record<string, number> = { objective50: 50, objective40: 40, flag: 30, cache: 30 }
type Edge = ['L' | 'R', number, 'T' | 'B', number]
/** The printed map labels (SR p5 to p11): distance from the Attacker's left (L) or right (R) edge and from the Defender's (T) or Attacker's (B) edge. */
const PRINTED: Record<string, Record<string, [string, Edge]>> = {
  'scn-sr26-trench-warfare': {
    'el-50-blue': ['objective50', ['L', 12, 'T', 21]], 'el-40-blue': ['objective40', ['L', 22, 'T', 12]], 'el-cache-blue': ['cache', ['L', 20, 'T', 18]], 'el-flag-blue': ['flag', ['R', 6, 'T', 15]],
    'el-50-red': ['objective50', ['R', 12, 'B', 25]], 'el-40-red': ['objective40', ['R', 22, 'B', 14]], 'el-cache-red': ['cache', ['R', 20, 'B', 22]], 'el-flag-red': ['flag', ['L', 6, 'B', 17]],
  },
  'scn-sr26-two-fronts': {
    'el-40-blue': ['objective40', ['L', 12, 'T', 19]], 'el-50-blue': ['objective50', ['R', 12, 'T', 17]], 'el-flag': ['flag', ['L', 23, 'T', 24]],
    'el-40-red': ['objective40', ['L', 8, 'B', 20]], 'el-50-red': ['objective50', ['R', 8, 'B', 19]],
  },
  'scn-sr26-wolves': {
    'el-flag-blue': ['flag', ['L', 12, 'T', 20]], 'el-50-blue': ['objective50', ['R', 19, 'T', 20]], 'el-40-blue': ['objective40', ['R', 8, 'T', 15]],
    'el-50-red': ['objective50', ['L', 19, 'B', 24]], 'el-40-red': ['objective40', ['L', 8, 'B', 20]], 'el-flag-red': ['flag', ['R', 12, 'B', 20]],
  },
  'scn-sr26-pressure-point': {
    'el-flag-1': ['flag', ['L', 12, 'T', 20]], 'el-flag-2': ['flag', ['R', 12, 'T', 20]], 'el-flag-3': ['flag', ['L', 6, 'T', 31]], 'el-flag-4': ['flag', ['R', 6, 'T', 31]],
    'el-50': ['objective50', ['R', 23, 'B', 22]],
  },
  'scn-sr26-high-stakes': {
    'el-flag-blue': ['flag', ['L', 8, 'T', 23]], 'el-50': ['objective50', ['R', 23, 'T', 22]], 'el-40-blue': ['objective40', ['R', 14, 'T', 17]],
    'el-40-red': ['objective40', ['L', 14, 'B', 18]], 'el-flag-red': ['flag', ['R', 8, 'B', 20]],
  },
  'scn-sr26-fault-line': {
    'el-40-blue-a': ['objective40', ['R', 8, 'T', 15]], 'el-50-blue': ['objective50', ['R', 23, 'T', 20]], 'el-40-blue-b': ['objective40', ['L', 8, 'T', 25]],
    'el-40-red-a': ['objective40', ['R', 8, 'B', 25]], 'el-50-red': ['objective50', ['L', 23, 'B', 20]], 'el-40-red-b': ['objective40', ['L', 8, 'B', 15]],
  },
  'scn-sr26-payload': {
    'el-50-blue': ['objective50', ['L', 9, 'T', 16]], 'el-40-blue': ['objective40', ['L', 20, 'T', 20]], 'el-flag-blue': ['flag', ['R', 16, 'T', 19]],
    'el-flag-red': ['flag', ['L', 16, 'B', 19]], 'el-40-red': ['objective40', ['R', 20, 'B', 20]], 'el-50-red': ['objective50', ['R', 9, 'B', 16]],
  },
}
const centre = (kind: string, [h, hd, v, vd]: Edge): { x: number; z: number } => {
  const r = baseRadius(MM[kind]!)
  return { x: h === 'L' ? -24 + hd + r : 24 - hd - r, z: v === 'T' ? 24 - vd - r : -24 + vd + r }
}

const layoutIds = (): string[] => BOARDS.flatMap((b) => eligibleLayouts(bundle, b, SR[0]))

function pieces(layoutId: string): { id: string; t: TerrainInstance }[] {
  return (rec(layoutId).pieces as Any[]).map((pc) => {
    const tp = rec(pc.terrain)
    return { id: pc.id as string, t: { id: pc.id, pieceId: pc.terrain, rulesType: tp.rulesType, pos: pc.pos, rot: pc.rot ?? 0, footprint: tp.footprint, height: tp.height ?? 0, props: tp.props ?? {} } as TerrainInstance }
  })
}

describe('SR scenario data', () => {
  it('SR-001 schema, refs, clearance and 12-word-run checks raise nothing for the seven scn-sr26 files', () => {
    const rep = validateAll()
    expect(rep.errors.filter((e) => /sr26|scn-sr26/.test(e))).toEqual([]) // other packages' records are theirs to keep green
    for (const id of SR) {
      const r = rec(id)
      expect(r.recordType, id).toBe('scenario')
      expect(typeof r.text, id).toBe('string')
      expect(r.text.length, id).toBeGreaterThan(40)
      expect(r.text, id).not.toMatch(/\bSteamforged\b|\bSFG\b/i)
    }
  })

  it('SR-001 element centres equal the printed edge distance plus the base radius, to 0.01"', () => {
    for (const id of SR) {
      const els = rec(id).elements as Any[]
      expect(els.map((e) => e.id).sort(), id).toEqual(Object.keys(PRINTED[id]!).sort())
      for (const e of els) {
        const [kind, edge] = PRINTED[id]![e.id]!
        expect(e.kind, `${id} ${e.id}`).toBe(kind)
        const c = centre(kind, edge)
        expect(Math.abs(e.pos.x - c.x), `${id} ${e.id} x ${e.pos.x} vs ${c.x}`).toBeLessThanOrEqual(0.0101)
        expect(Math.abs(e.pos.z - c.z), `${id} ${e.id} z ${e.pos.z} vs ${c.z}`).toBeLessThanOrEqual(0.0101)
      }
    }
  })

  it('SR-001 table 48x48, deployment 6 / 11 with 3" advance, 7 rounds, attacker frame, all four sizes, every element base on the table', () => {
    for (const id of SR) {
      const r = rec(id)
      expect(r).toMatchObject({ table: { w: 48, d: 48 }, deployment: { first: 6, second: 11, advance: 3, unitSpread: 3 }, rounds: 7, frame: 'attacker', levels: ['recon', 'skirmish', 'pitched', 'grandMelee'] })
      expect(rec(r.terrainLayout)?.table, id).toEqual({ w: 48, d: 48 })
      for (const e of r.elements as Any[]) {
        const rad = baseRadius(MM[e.kind]!)
        expect(Math.abs(e.pos.x) + rad, `${id} ${e.id}`).toBeLessThanOrEqual(24)
        expect(Math.abs(e.pos.z) + rad, `${id} ${e.id}`).toBeLessThanOrEqual(24)
      }
    }
  })

  it('SR-021 scoring starts on the Defender\'s round-2 turn, the Kill Box on the Attacker\'s round-2 turn, lead-by-3 except Payload', () => {
    for (const id of SR) {
      const r = rec(id)
      expect(r.scoring, id).toMatchObject({ fromRound: 2, fromPlayer: 'second', winOnOpponentTurnOnly: true, leaderPresence: 10, winMargin: id === 'scn-sr26-payload' ? 0 : 3 })
      expect(r.killBox, id).toEqual({ fromRound: 2, fromPlayer: 'first', depth: 12, vp: 2 })
      // the rules[] list replaces vp.control, so no element carries a control value
      for (const e of r.elements as Any[]) expect(e.vp?.control ?? 0, `${id} ${e.id}`).toBe(0)
      expect(r.scoring.rules.length, id).toBeGreaterThan(0)
    }
  })

  it('SR-003 SR-005 flags pick within 5" and use the SR9 hold (one Leader or solo, else two, inside the area); objectives and caches use SR6 to SR8', () => {
    for (const id of SR) {
      const r = rec(id)
      const flags = (r.elements as Any[]).filter((e) => e.kind === 'flag')
      if (flags.length) expect(r.setup, id).toEqual({ flagRadius: 5, flagPickOrder: 'attackerFirst' })
      else expect(r.setup, id).toBeUndefined()
      for (const e of r.elements as Any[]) {
        expect(e.contest, `${id} ${e.id}`).toEqual({ within: 3, excludes: ['leader', 'inert', 'disabled', 'wild'] })
        if (e.kind === 'flag') expect(e.hold, `${id} ${e.id}`).toEqual({ within: 3, models: 2, eligible: ['any'], single: ['leader', 'solo'], mode: 'area' })
        if (e.kind === 'objective50') expect(e.hold, `${id} ${e.id}`).toEqual({ within: 3, models: 1, eligible: ['leader', 'warEngine', 'battleEngine'] })
        if (e.kind === 'objective40') expect(e.hold, `${id} ${e.id}`).toEqual({ within: 3, models: 1, eligible: ['leader', 'unitAll'] })
        if (e.kind === 'cache') expect(e.hold, `${id} ${e.id}`).toEqual({ within: 3, models: 1, eligible: ['any'] })
        expect(e.terrain, `${id} ${e.id}`).toBeUndefined() // flags choose their terrain at setup; nothing is anchored
      }
    }
  })

  it('SR-006 SR-007 SR-009 Trench Warfare: 2 + 2 + 2 + 2 + earthworks; caches and flags both owned by colour', () => {
    const r = rec('scn-sr26-trench-warfare')
    expect(r.scoring.rules).toEqual([
      { kind: 'control', select: { kinds: ['objective40', 'objective50'], owner: 'any' }, vp: 1 },
      { kind: 'control', select: { kinds: ['flag'], owner: 'opponent' }, vp: 2 },
      { kind: 'cache', vp: 2 },
    ])
    expect(r.special).toEqual([{ kind: 'earthworks', within: 3, bases: [30, 40], warriorOnly: true, of: ['objective40', 'objective50'] }])
    const own = (k: string): string[] => (r.elements as Any[]).filter((e) => e.kind === k).map((e) => `${e.id}:${e.owner}`).sort()
    expect(own('cache')).toEqual(['el-cache-blue:second', 'el-cache-red:first'])
    expect(own('flag')).toEqual(['el-flag-blue:second', 'el-flag-red:first'])
    expect(own('objective50')).toEqual(['el-50-blue:second', 'el-50-red:first'])
    expect(own('objective40')).toEqual(['el-40-blue:second', 'el-40-red:first'])
  })

  it('SR-010 SR-011 SR-012 SR-013 SR-014 SR-015 SR-016 SR-017 SR-018 the scoring vocabulary of the other six scenarios', () => {
    const rules = (id: string): Any[] => rec(id).scoring.rules
    const sel = (kinds: string[], owner = 'any'): Any => ({ kinds, owner })
    expect(rules('scn-sr26-two-fronts')).toEqual([
      { kind: 'control', select: sel(['objective40', 'objective50']), vp: 1 }, { kind: 'control', select: sel(['flag']), vp: 1 },
      { kind: 'countBonus', select: sel(['objective40']), atLeast: 2, vp: 1 }, { kind: 'countBonus', select: sel(['objective50']), atLeast: 2, vp: 1 },
    ])
    expect(rules('scn-sr26-wolves')).toEqual([
      { kind: 'control', select: sel(['objective40', 'objective50']), vp: 1 }, { kind: 'control', select: sel(['flag']), vp: 1 }, { kind: 'tokenRace', vp: 3, third: 3 },
    ])
    expect(rec('scn-sr26-wolves').special).toEqual([
      { kind: 'killBoxGrowth', fromRound: 3, fromPlayer: 'first', step: 2 }, { kind: 'heelTokens', on: 'objective40', toward: 'objective50', move: 3 },
    ])
    expect(rules('scn-sr26-pressure-point')).toEqual([{ kind: 'control', select: sel(['flag']), vp: 1 }, { kind: 'control', select: sel(['objective50']), vp: 2 }])
    expect(rules('scn-sr26-high-stakes')).toEqual([
      { kind: 'control', select: sel(['objective40']), vp: 1 }, { kind: 'control', select: sel(['objective50']), vp: 1 }, { kind: 'control', select: sel(['flag']), vp: 1 },
      { kind: 'zeroTokenBonus', select: sel(['objective50', 'flag']), vp: 1 },
    ])
    expect(rec('scn-sr26-high-stakes').special).toEqual([
      { kind: 'fuse', tokens: 5, on: ['flag', 'objective50'], d3: ['flag:second', 'flag:first', 'objective50'], blast: { pow: 14, damageType: 'magical', within: 3 } },
    ])
    expect(rules('scn-sr26-fault-line')).toEqual([
      { kind: 'control', select: sel(['objective40', 'objective50']), vp: 1 },
      { kind: 'countBonus', select: sel(['objective40', 'objective50'], 'own'), atLeast: 2, vp: 1 },
      { kind: 'countBonus', select: sel(['objective40', 'objective50'], 'own'), atLeast: 3, vp: 1 },
    ])
    expect(rules('scn-sr26-payload')).toEqual([
      { kind: 'control', select: sel(['objective40', 'objective50']), vp: 1 }, { kind: 'control', select: sel(['flag']), vp: 1 }, { kind: 'delivered', vp: 3 },
    ])
    expect(rec('scn-sr26-payload').special).toEqual([{ kind: 'payload', move: 3, perOther: 1, toward: 'opponentFlagTerrain', haul: 5 }])
  })

  it('SR-014 Pressure Point has four neutral flags and a neutral 50; Two Fronts a neutral flag; Fault Line six owned objectives and no flag', () => {
    const owners = (id: string, kind: string): unknown[] => (rec(id).elements as Any[]).filter((e) => e.kind === kind).map((e) => e.owner)
    expect(owners('scn-sr26-pressure-point', 'flag')).toEqual([undefined, undefined, undefined, undefined])
    expect(owners('scn-sr26-pressure-point', 'objective50')).toEqual([undefined])
    expect(owners('scn-sr26-two-fronts', 'flag')).toEqual([undefined])
    expect(owners('scn-sr26-high-stakes', 'objective50')).toEqual([undefined])
    const fl = rec('scn-sr26-fault-line').elements as Any[]
    expect(fl.filter((e) => e.kind === 'flag')).toHaveLength(0)
    expect(fl.filter((e) => e.owner === 'first')).toHaveLength(3)
    expect(fl.filter((e) => e.owner === 'second')).toHaveLength(3)
    // every other scenario is balanced between the colours for its owned elements
    for (const id of ['scn-sr26-trench-warfare', 'scn-sr26-wolves', 'scn-sr26-payload']) {
      const els = rec(id).elements as Any[]
      expect(els.filter((e) => e.owner === 'first').map((e) => e.kind).sort(), id).toEqual(els.filter((e) => e.owner === 'second').map((e) => e.kind).sort())
    }
  })
})

describe('SR layout fit', () => {
  it('SR-022 after the drop no impassable piece sits within 1" of an objective or cache base at any edge choice, and no wall overlaps one', () => {
    let dropped = 0
    for (const id of SR) {
      for (const l of layoutIds()) {
        const drop = new Set(droppedPieces(bundle, id, l))
        dropped += drop.size
        const ps = pieces(l)
        for (const q of ALL_QUARTER_TURNS) {
          for (const e of rec(id).elements as Any[]) {
            if (e.kind === 'flag') continue
            const pos = rotateQuarterTurns(e.pos, q)
            for (const p of ps) {
              if (drop.has(p.id)) continue
              const gap = Math.max(0, distToShape(pos, worldShape(p.t)) - baseRadius(MM[e.kind]!))
              if (terrainTraits(p.t).move === 'impassable') expect(gap, `${id} ${l} q${q} ${e.id} vs ${p.id}`).toBeGreaterThanOrEqual(1 - 1e-9)
              if (p.t.rulesType === 'obstacle') expect(gap, `${id} ${l} q${q} ${e.id} vs ${p.id}`).toBeGreaterThan(0)
            }
          }
        }
      }
    }
    expect(dropped).toBeGreaterThan(0) // the fit is not vacuous: some layouts do crowd an element
  })

  it('SR-022 a drop is needed only where a piece crowds: the fit drops nothing it need not, and is the union of the quarter turns', () => {
    for (const id of SR) {
      for (const l of layoutIds()) {
        const union = new Set(ALL_QUARTER_TURNS.flatMap((q) => droppedPieces(bundle, id, l, [q])))
        expect(droppedPieces(bundle, id, l), `${id} ${l}`).toEqual([...union].sort())
        for (const d of union) expect((rec(l).pieces as Any[]).some((p) => p.id === d), `${id} ${l} ${d}`).toBe(true)
      }
    }
    // Trench Warfare in the bog-1 layout: b1 and b2 crowd an objective at some edge choice, nothing is dropped from bog-2
    expect(droppedPieces(bundle, 'scn-sr26-trench-warfare', 'layout.bog-1-48')).toEqual(['b1', 'b2'])
    expect(droppedPieces(bundle, 'scn-sr26-trench-warfare', 'layout.bog-2-48')).toEqual([])
    // no scenario element means nothing to drop
    expect(droppedPieces(bundle, 'scn-ashwall-divide', 'layout.bog-1')).toEqual([])
  })

  it('SR-022 TER-110 in tools/validate-data: SR scenarios report no clearance problem, the cache is measured, and S3 is unchanged', () => {
    const byId = bundle.byId as Record<string, TypedRecord>
    expect(objectiveClearanceProblems(byId)).toEqual([])
    const rows = objectiveClearances(byId)
    const sr = rows.filter((r) => r.scenario.startsWith('scn-sr26-'))
    expect(sr.length).toBeGreaterThan(0)
    expect(sr.every((r) => r.fitted === true)).toBe(true)
    expect(sr.some((r) => r.element.startsWith('el-cache'))).toBe(true) // ELEMENT_MM has cache (30 mm)
    expect(sr.some((r) => r.element.includes('flag'))).toBe(false) // a flag moves onto its piece (SR10)
    expect(sr.every((r) => !r.impassable || r.gap >= 1 - 1e-9)).toBe(true)
    expect(rows.filter((r) => r.scenario === 'scn-copperline-crossing').every((r) => r.fitted === undefined)).toBe(true)
  })

  it('rotateQuarterTurns turns elements about the table centre and four turns return the start', () => {
    expect(rotateQuarterTurns({ x: 3, z: 5 }, 0)).toEqual({ x: 3, z: 5 })
    expect(rotateQuarterTurns({ x: 3, z: 5 }, 2)).toEqual({ x: -3, z: -5 })
    expect(rotateQuarterTurns({ x: 3, z: 5 }, 1)).toEqual({ x: -5, z: 3 })
    expect(rotateQuarterTurns({ x: 3, z: 5 }, 3)).toEqual({ x: 5, z: -3 })
    expect(rotateQuarterTurns({ x: 3, z: 5 }, 4)).toEqual({ x: 3, z: 5 })
    expect(rotateQuarterTurns({ x: 3, z: 5 }, -1)).toEqual({ x: 5, z: -3 })
    // SR5: 180 degrees puts the Attacker's frame on the +z edge: the blue 50 of Trench Warfare goes to the red side
    const el = (rec('scn-sr26-trench-warfare').elements as Any[]).find((e) => e.id === 'el-50-blue')!
    expect(rotateQuarterTurns(el.pos, 2).z).toBeCloseTo(-2.02, 9)
  })

  it('SR-003 layoutFit counts the flags that have no terrain piece within 5" at an edge choice; preferFlagTerrain ranks on it', () => {
    const f = layoutFit(bundle, 'scn-sr26-two-fronts', 'layout.ruins-1-48')
    expect(f.flagsWithoutTerrain).toEqual(['el-flag'])
    expect(f.flagMisses).toBeGreaterThan(0)
    expect(layoutFit(bundle, 'scn-sr26-two-fronts', 'layout.bog-1-48')).toMatchObject({ flagsWithoutTerrain: [], flagMisses: 0 })
    // a scenario with a flag keeps only the layouts with the fewest misses; one without flags keeps all
    const all = layoutIds()
    const kept = preferFlagTerrain(bundle, 'scn-sr26-two-fronts', all)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(all.length)
    expect(kept.every((l) => layoutFit(bundle, 'scn-sr26-two-fronts', l).flagMisses === 0)).toBe(true)
    expect(preferFlagTerrain(bundle, 'scn-sr26-fault-line', all)).toEqual(all)
    // Trench Warfare has no layout where every flag reaches a piece: the ranking keeps the best of them, not nothing
    const tw = preferFlagTerrain(bundle, 'scn-sr26-trench-warfare', all)
    const least = Math.min(...all.map((l) => layoutFit(bundle, 'scn-sr26-trench-warfare', l).flagMisses))
    expect(least).toBeGreaterThan(0)
    expect(tw.length).toBeGreaterThan(0)
    expect(tw.every((l) => layoutFit(bundle, 'scn-sr26-trench-warfare', l).flagMisses === least)).toBe(true)
  })

  it('pickBattlefield for an SR scenario is deterministic, takes a 48" layout of the board, and lands on a best-fit layout', () => {
    for (const id of SR) {
      for (const board of BOARDS) {
        const ok = preferFlagTerrain(bundle, id, eligibleLayouts(bundle, board, id))
        for (let i = 0; i < 4; i++) {
          const pick = pickBattlefield(`sr${i}`, id, board)
          expect(pick).toEqual(pickBattlefield(`sr${i}`, id, board))
          expect(pick.board).toBe(board)
          expect(pick.layoutId.endsWith('-48')).toBe(true)
          expect(ok, `${id} ${board} ${pick.layoutId}`).toContain(pick.layoutId)
        }
      }
    }
    // the scenario's own default layout is a 48" layout that exists and fits the table
    for (const id of SR) expect(rec(rec(id).terrainLayout), id).toBeDefined()
  })

  it('earlier scenarios keep their seeded picks: S3 has no flag, so preferFlagTerrain returns its eligible list untouched', () => {
    for (const b of BOARDS) {
      const el = eligibleLayouts(bundle, b, 'scn-copperline-crossing')
      expect(preferFlagTerrain(bundle, 'scn-copperline-crossing', el)).toEqual(el)
    }
  })
})
