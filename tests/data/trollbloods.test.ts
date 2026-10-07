// Trollbloods data (docs/spec/factions/trollbloods.md): values, ids, list and ref integrity.
import { describe, expect, it } from 'vitest'
import { loadBundle, modelWeapons } from '../../src/data/index'
import { validateAll } from '../../tools/validate-data'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any

describe('Trollbloods data', () => {
  it('DATA-TRL-001 the whole data set validates with no error naming a Trollblood record', () => {
    const rep = validateAll()
    expect(rep.errors.filter((e) => e.includes('trl'))).toEqual([])
  })

  it('DATA-TRL-002 stat lines match the spec', () => {
    expect(rec('trl.gunnbjorn').stats).toEqual({ SPD: 6, MAT: 6, RAT: 7, DEF: 15, ARM: 16, ARC: 6, CTRL: 12 })
    expect(rec('trl.gunnbjorn').damage).toEqual({ track: 'single', boxes: 17 })
    expect(rec('trl.bomber').stats).toEqual({ SPD: 5, MAT: 6, RAT: 5, DEF: 12, ARM: 18, FURY: 4, THR: 8 })
    expect(rec('trl.braylen')).toMatchObject({ stats: { SPD: 6, RAT: 7, DEF: 14, ARM: 15 }, damage: { boxes: 8 }, cost: 4, base: 40 })
    expect(rec('trl.highwaymen-grunt')).toMatchObject({ stats: { SPD: 6, RAT: 6, DEF: 12, ARM: 14 }, damage: { boxes: 1 }, base: 40 })
    expect(rec('trl.highwaymen')).toMatchObject({ cost: 7, fa: 2 })
  })

  it('DATA-TRL-003 the Bomber spiral has 6 branches, 30 boxes and the assumed aspect split', () => {
    const b: string[] = rec('trl.bomber').damage.branches
    expect(b).toHaveLength(6)
    expect(b.map((x) => x.length)).toEqual([6, 3, 7, 5, 6, 3])
    const all = b.join('')
    expect(all.length).toBe(30)
    for (const [letter, n] of [['M', 9], ['B', 12], ['S', 9]] as const) expect(all.split('').filter((c) => c === letter).length).toBe(n)
  })

  it('DATA-TRL-004 weapons: values, no war-engine locations, blast iff AOE, warbeast weapons use location "-"', () => {
    expect(rec('trl.w.bazooka')).toMatchObject({ rng: 12, aoe: 2, pow: 14, blastPow: 8 })
    expect(rec('trl.w.powder-bomb')).toMatchObject({ rng: 8, aoe: 3, pow: 16, blastPow: 8 })
    expect(rec('trl.w.claw')).toMatchObject({ type: 'melee', pow: 15 })
    expect(rec('trl.w.heavy-pistol')).toMatchObject({ rng: 8, pow: 12 })
    expect(rec('trl.w.pistol')).toMatchObject({ rng: 8, pow: 10 })
    expect(modelWeapons(bundle, 'trl.bomber').map((w) => w.location)).toEqual(['-', '-'])
    expect(modelWeapons(bundle, 'trl.bomber').find((w) => w.weapon.id === 'trl.w.claw')!.count).toBe(2)
    expect(modelWeapons(bundle, 'trl.braylen')[0]!.count).toBe(2)
    expect(modelWeapons(bundle, 'trl.highwaymen-grunt')[0]!.count).toBe(2)
  })

  it('DATA-TRL-005 the starter list: 28 points, Gunnbjorn leads, the Bomber is in his battlegroup, Braylen and the unit deploy forward', () => {
    const l = rec('trl.l.starter-recon')
    expect(l).toMatchObject({ faction: 'trl', level: 'recon', points: 28, leader: 'trl.gunnbjorn' })
    expect(l.entries).toEqual([
      { profile: 'trl.bomber' },
      { profile: 'trl.braylen', advanceDeploy: true },
      { profile: 'trl.highwaymen', size: 3, advanceDeploy: true },
    ])
    const cost = l.entries.reduce((n: number, e: Any) => n + rec(e.profile).cost, 0)
    expect(cost).toBe(28)
  })

  it('DATA-TRL-006 ids follow the scheme and the feat, spells and animus resolve', () => {
    expect(rec('trl.gunnbjorn').spells).toEqual(['trl.s.guided-fire', 'trl.s.rock-wall', 'trl.s.sentry', 'trl.s.snipe'])
    expect(rec('trl.gunnbjorn').feat).toBe('trl.f.fortification')
    expect(rec(rec('trl.bomber').animus).animus).toBe(true)
    expect(rec('trl.gunnbjorn').resource).toBe('fury')
    for (const id of Object.keys(bundle.byId).filter((k) => k.startsWith('trl.'))) expect(id).toMatch(/^trl\.(l\.|w\.|a\.|s\.|f\.)?[a-z0-9-]+$/)
  })

  it('DATA-TRL-007 faction record and palette', () => {
    expect(rec('trl')).toMatchObject({ name: 'Trollbloods', marking: 'river-knot', sourceHues: [200, 30] })
  })
})
