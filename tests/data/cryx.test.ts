import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { validateAll } from '../../tools/validate-data'
import { cryxHooks } from '../../src/engine/factions/cryx'

type Any = Record<string, any>
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any

describe('Cryx data', () => {
  it('validates against the schemas, refs and hook registry', () => {
    // other factions are built in parallel: only Cryx errors count here
    const mine = Object.keys(cryxHooks.effects)
    const errs = validateAll().errors.filter((e: string) => /cry./.test(e) || mine.some((h) => e.includes(`'${h}'`)))
    expect(errs).toEqual([])
  })

  it('has the five starter profiles, a model file per Fury, and Hades with an H system', () => {
    for (const id of ['cry.nekane', 'cry.hades', 'cry.chatterbane', 'cry.furies', 'cry.furies-a', 'cry.furies-b', 'cry.furies-c'])
      expect(bundle.byId[id], id).toBeDefined()
    const cols: string[] = rec('cry.hades').damage.columns
    expect(cols.map((c) => c.length)).toEqual([3, 5, 6, 6, 5, 3])
    expect(cols.join('')).toMatch(/H/)
    expect(rec('cry.nekane').stats).toMatchObject({ ARC: 6, CTRL: 12, DEF: 16, ARM: 15 })
  })

  it('the starter list costs 30 points and follows the Recon shape', () => {
    const l = rec('cry.l.necro-recon')
    expect(l).toMatchObject({ faction: 'cry', level: 'recon', points: 30, leader: 'cry.nekane' })
    const cost = l.entries.reduce((n: number, e: Any) => n + (e.size ? rec(e.profile).composition.costBySize[e.size] : rec(e.profile).cost), 0)
    expect(cost).toBe(30)
    expect(rec('cry.hades').type).toBe('warEngine')
  })

  it('keeps MK4 values: reach 2 on the Eviscerator, spray Venom, no MK3 leakage in prose', () => {
    expect(rec('cry.w.eviscerator').rng).toBe(2)
    expect(rec('cry.s.venom').rng).toBe('SP10')
    for (const r of Object.values(bundle.byId) as Any[]) {
      if (typeof r.id !== 'string' || !r.id.startsWith('cry.')) continue
      expect(JSON.stringify(r)).not.toMatch(/\bSTR\b|facing|free strike|template/i)
    }
  })
})
