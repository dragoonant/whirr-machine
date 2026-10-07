// Protectorate of Menoth data (docs/spec/factions/menoth.md): the whole Defenders of the Flame starter, 30 points.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { validateAll } from '../../tools/validate-data'

type Any = Record<string, any>
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any

describe('FAC-MEN data', () => {
  it('the Menoth records pass schema, ref, list and MK3-leak validation (other factions are checked elsewhere)', () => {
    const rep = validateAll()
    expect(rep.errors.filter((e) => /\bmen[.\/-]/.test(String(e)))).toEqual([])
  })

  it('every model of the box is entered with the spec stat line', () => {
    const want: Record<string, Record<string, number>> = {
      'men.feora': { SPD: 6, AAT: 6, MAT: 7, RAT: 6, DEF: 15, ARM: 17, ARC: 6, CTRL: 12 },
      'men.crusader': { SPD: 4, MAT: 6, RAT: 5, DEF: 10, ARM: 19 },
      'men.valeria': { SPD: 7, MAT: 6, RAT: 8, DEF: 15, ARM: 12 },
      'men.pyrrhus': { SPD: 6, MAT: 7, RAT: 5, DEF: 15, ARM: 14 },
      'men.defenders-grunt': { SPD: 6, MAT: 6, RAT: 5, DEF: 13, ARM: 13 },
    }
    for (const [id, stats] of Object.entries(want)) expect(rec(id).stats, id).toEqual(stats)
    expect(rec('men.feora').type).toBe('leader')
    expect(rec('men.defenders').composition.grunts).toEqual({ profile: 'men.defenders-grunt', min: 5, max: 5 })
    expect(rec('men.defenders').composition.costBySize['5']).toBe(7)
  })

  it('the Crusader grid has 32 boxes, three of each system, and no head system', () => {
    const cols: string[] = rec('men.crusader').damage.columns
    expect(cols.map((c) => c.length)).toEqual([4, 6, 6, 6, 6, 4])
    const letters = cols.join('')
    expect(letters.length).toBe(32)
    for (const l of 'LMCR') expect(letters.split(l).length - 1, l).toBe(3)
    expect(letters).not.toContain('H')
  })

  it('men-starter-recon: 30 points, Feora leads, same entry shape as the Cygnar list', () => {
    const l = rec('men.l.starter-recon')
    expect(l.level).toBe('recon')
    expect(l.points).toBe(30)
    expect(l.leader).toBe('men.feora')
    const cost = (e: Any): number => (e.size !== undefined && rec(e.profile).composition?.costBySize?.[String(e.size)]) || rec(e.profile).cost
    expect(l.entries.reduce((n: number, e: Any) => n + cost(e), 0)).toBe(30)
    expect(l.entries.find((e: Any) => e.profile === 'men.defenders').size).toBe(5)
    expect(l.entries.some((e: Any) => rec(e.profile).type === 'warEngine' && !rec(e.profile).lesser)).toBe(true)
    const cyg = rec('cyg.l.qs-recon')
    expect(Object.keys(l).sort()).toEqual(Object.keys(cyg).sort())
  })

  it('Feora knows her five spells and the feat; every weapon and ability the models name exists', () => {
    expect(rec('men.feora').spells).toEqual(['kha.s.avenging-force', 'men.s.convection', 'men.s.fire-step', 'men.s.hex-hammer', 'men.s.incite'])
    expect(rec('men.feora').feat).toBe('men.f.blessing-of-the-first-gift')
    for (const id of ['men.feora', 'men.crusader', 'men.valeria', 'men.pyrrhus', 'men.defenders-grunt']) {
      for (const w of rec(id).weapons) expect(bundle.byId[w.weapon], w.weapon).toBeDefined()
      for (const a of rec(id).abilities ?? []) expect(bundle.byId[a], a).toBeDefined()
    }
  })

  it('melee reach is 1" or 2", the run rule is core, and no MK3 words appear in Menoth data', () => {
    for (const id of ['men.w.blazing-star', 'men.w.flame-spear', 'men.w.pyrrhus-spear']) expect(rec(id).rng).toBe(2)
    for (const id of ['men.w.flameguard-shield', 'men.w.pyrrhus-shield', 'men.w.valeria-knife']) expect(rec(id).rng).toBe(1)
    const text = JSON.stringify(Object.values(bundle.byId).filter((r) => String((r as Any).id).startsWith('men.')))
    expect(text).not.toMatch(/\b(STR|facing|free strike|template|scatter|deviation)\b/i)
  })
})
