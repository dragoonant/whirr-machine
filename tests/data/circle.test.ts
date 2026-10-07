import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { validateAll } from '../../tools/validate-data'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any
const all = Object.values(bundle.byId) as unknown as Any[]
const cir = all.filter((r) => typeof r.id === 'string' && r.id.startsWith('cir.'))

describe('Circle Orboros data', () => {
  it('DATA-CIR-001 validate-data reports no error for any cir record', () => {
    expect(validateAll().errors.filter((e) => e.includes('cir.') || e.includes('cir-') || e.includes('/cir/'))).toEqual([])
  })

  it('DATA-CIR-002 the full starter roster exists with the documented stat lines', () => {
    expect(rec('cir.tanith')).toMatchObject({ type: 'leader', resource: 'fury', cost: 0, base: 30, stats: { SPD: 6, AAT: 7, MAT: 6, RAT: 6, DEF: 15, ARM: 15, ARC: 6, CTRL: 12 }, damage: { track: 'single', boxes: 15 } })
    expect(rec('cir.pureblood')).toMatchObject({ type: 'beast', beastClass: 'heavy', cost: 15, base: 50, stats: { SPD: 6, MAT: 6, RAT: 5, DEF: 14, ARM: 17, FURY: 4, THR: 10 }, animus: 'cir.s.wraithbane' })
    expect(rec('cir.lord-of-the-feast')).toMatchObject({ type: 'solo', cost: 5, base: 30, stats: { SPD: 6, MAT: 7, RAT: 6, DEF: 12, ARM: 16 } })
    expect(rec('cir.ravagers')).toMatchObject({ type: 'unit', cost: 9 })
    for (const i of [1, 2, 3]) expect(rec(`cir.ravager-${i}`)).toMatchObject({ type: 'trooper', base: 40, stats: { SPD: 6, MAT: 7, DEF: 13, ARM: 15 } })
    const c = rec('cir.ravagers').composition
    expect([c.grunts, ...c.extra].map((s: Any) => s.profile)).toEqual(['cir.ravager-1', 'cir.ravager-2', 'cir.ravager-3'])
  })

  it('DATA-CIR-003 weapons match the spec table', () => {
    expect(rec('cir.w.jaws-of-the-earth')).toMatchObject({ type: 'ranged', rng: 10, rof: 1, aoe: 2, pow: 13, blastPow: 7 })
    expect(rec('cir.w.staff-of-fate')).toMatchObject({ type: 'melee', rng: 2, pow: 11 })
    expect(rec('cir.w.death-howler')).toMatchObject({ type: 'ranged', rng: 'SP8', pow: 14 })
    expect(rec('cir.w.claw')).toMatchObject({ type: 'melee', rng: 1, pow: 14 })
    expect(rec('cir.w.raven')).toMatchObject({ type: 'ranged', rng: 8, pow: 0, abilities: ['cir.a.shifter'] })
    expect(rec('cir.w.wurmblade')).toMatchObject({ type: 'melee', rng: 1, pow: 13 })
    expect(rec('cir.w.tharn-axe')).toMatchObject({ type: 'melee', rng: 2, pow: 15 })
    expect(rec('cir.pureblood').weapons.find((w: Any) => w.weapon === 'cir.w.claw').count).toBe(2)
  })

  it('DATA-CIR-004 the Pureblood spiral has the community branch sizes and the assumed aspects', () => {
    const br: string[] = rec('cir.pureblood').damage.branches
    expect(br.map((b) => b.length)).toEqual([5, 3, 5, 3, 7, 5])
    expect(br.join('').length).toBe(28)
    expect(new Set(br.join(''))).toEqual(new Set(['M', 'B', 'S']))
  })

  it('DATA-CIR-005 the starter list is 29 points in the Leader battlegroup and matches the model costs', () => {
    const l = rec('cir.l.starter-recon')
    expect(l).toMatchObject({ faction: 'cir', level: 'recon', leader: 'cir.tanith', points: 29 })
    const total = l.entries.reduce((a: number, e: Any) => a + (rec(e.profile).composition?.costBySize?.[e.size] ?? rec(e.profile).cost), 0)
    expect(total).toBe(29)
    expect(l.entries.map((e: Any) => e.profile)).toEqual(['cir.pureblood', 'cir.lord-of-the-feast', 'cir.ravagers'])
    expect(l.entries.every((e: Any) => e.controller === undefined)).toBe(true)
  })

  it('DATA-CIR-006 every reference resolves, the animus is an animus spell, ids are namespaced', () => {
    for (const r of cir) {
      expect(String(r.id)).toMatch(/^cir(\.(a|s|w|f|l))?\.[a-z0-9-]+$|^cir$/)
      for (const a of r.abilities ?? []) expect(bundle.byId[a], `${r.id} -> ${a}`).toBeDefined()
      for (const a of r.spells ?? []) expect(bundle.byId[a], `${r.id} -> ${a}`).toBeDefined()
    }
    expect(rec('cir.s.wraithbane').animus).toBe(true)
    expect(rec('cir.tanith').feat).toBe('cir.f.rites-of-the-wurm')
    expect(rec('cir.tanith').spells.map((s: string) => rec(s).name)).toEqual(['Admonition', 'Affliction', 'Rift', 'Scything Touch', 'Veil of Mists'])
  })

  it('DATA-CIR-007 spells follow the documented costs, ranges and durations', () => {
    const t = (id: string) => { const s = rec(id); return [s.cost, s.rng, s.dur, s.offensive] }
    expect(t('cir.s.admonition')).toEqual([2, 6, 'UP', false])
    expect(t('cir.s.affliction')).toEqual([2, 8, 'UP', true]) // offensive (spec OFF yes), no POW
    expect(rec('cir.s.affliction').pow).toBe(0)
    expect(rec('cir.s.admonition').scope.who).toBe('warbeasts') // battlegroup only
    expect(t('cir.s.rift')).toEqual([3, 10, 'RND', true])
    expect(rec('cir.s.rift')).toMatchObject({ pow: 13, aoe: 3 })
    expect(t('cir.s.scything-touch')).toEqual([2, 6, 'UP', false])
    expect(t('cir.s.veil-of-mists')).toEqual([2, 'CTRL', 'UP', false])
    expect(t('cir.s.wraithbane')).toEqual([2, 6, 'TURN', false])
    expect(rec('cir.f.rites-of-the-wurm').duration).toBe('turn')
  })

  it('DATA-CIR-008 prose is short and has no MK3 words; no STR stat anywhere', () => {
    for (const r of cir) {
      if (typeof r.text === 'string') expect(r.text.length).toBeLessThanOrEqual(400)
      expect(JSON.stringify(r)).not.toMatch(/\b(facing|free strike|template|scatter|deviation)\b/i)
      if (r.stats) expect(Object.keys(r.stats)).not.toContain('STR')
    }
    expect(cir.filter((r) => r.text).length).toBeGreaterThanOrEqual(30)
  })

  it('DATA-CIR-009 faction record carries the palette and marking', () => {
    expect(rec('cir')).toMatchObject({ name: 'Circle Orboros', marking: 'thornknot', palette: { primary: '#4b6b3c', ui: '#6fa35a' } })
  })
})
