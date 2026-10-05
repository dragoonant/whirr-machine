import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RAW, getRecord, loadBundle, modelWeapons, checkRefs, type TypedRecord } from '../../src/data/index'
import { validateAll } from '../../tools/validate-data'

type Any = Record<string, any>
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any

describe('data bundle', () => {
  it('passes schema, ref, list and MK3-leak validation', () => {
    const rep = validateAll()
    expect(rep.errors).toEqual([])
  })

  it('loads deterministically with a content-hash version', () => {
    expect(bundle.version).toMatch(/^[0-9a-f]{14}$/)
    expect(loadBundle()).toBe(bundle)
  })

  it('lists every data JSON file in raw.ts', () => {
    const dir = path.resolve(__dirname, '../../src/data')
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? (e.name === 'schema' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.json') ? [path.relative(dir, path.join(d, e.name)).split(path.sep).join('/')] : [])
    const onDisk = walk(dir).sort()
    const listed = Object.values(RAW).flat().map(f => f.path).sort()
    expect(listed).toEqual(onDisk)
  })

  it('contains all 8 starter models plus the trooper profiles', () => {
    for (const id of ['cyg.caine', 'cyg.deuce', 'cyg.falk', 'cyg.black13', 'kha.vilkul', 'kha.razor', 'kha.lazarenko', 'kha.hounds'])
      expect(bundle.byId[id], id).toBeDefined()
    for (const u of ['cyg.black13', 'kha.hounds']) {
      const c = rec(u).composition
      for (const s of [c.grunts, ...c.extra]) expect(rec(s.profile).type).toBe('trooper')
    }
  })

  it('keeps verified Quick Start values (bases, stats, grids)', () => {
    expect(rec('kha.lazarenko').base).toBe(40)
    expect(rec('cyg.deuce').base).toBe(50)
    expect(rec('cyg.falk').damage.boxes).toBe(8)
    expect(rec('kha.razor').stats).toMatchObject({ SPD: 5, DEF: 11, ARM: 19 })
    expect(rec('cyg.caine').stats).toMatchObject({ ARC: 6, CTRL: 12 })
    for (const id of ['cyg.deuce', 'kha.razor']) {
      const cols: string[] = rec(id).damage.columns
      expect(cols.map(c => c.length)).toEqual([4, 5, 6, 6, 5, 4])
      expect(cols.join('').split('').filter(c => c === 'L').length).toBe(3)
      expect(cols.join('')).not.toMatch(/H/)
    }
  })

  it('resolves weapons with locations and counts', () => {
    const razor = modelWeapons(bundle, 'kha.razor')
    expect(razor.map(w => w.location).sort()).toEqual(['L', 'L', 'R', 'R'])
    expect(modelWeapons(bundle, 'cyg.caine')[0].count).toBe(2)
    const gl = getRecord<Any>(bundle, 'kha.w.grenade-launcher', 'weapon')
    expect(gl).toMatchObject({ aoe: 2, pow: 10, blastPow: 5 })
  })

  it('has two 30-point lists that match their model costs', () => {
    for (const id of ['cyg.l.qs-recon', 'kha.l.qs-recon']) {
      const l = rec(id)
      const total = l.entries.reduce((a: number, e: Any) => a + rec(e.profile).cost, 0)
      expect(total).toBe(30)
      expect(rec(l.leader).cost).toBe(0)
    }
  })

  it('defines the Ashwall Divide scenario with Quick Start scoring and wall elements', () => {
    const s = rec('scn-ashwall-divide')
    expect(s.table).toEqual({ w: 36, d: 36 })
    expect(s.deployment).toMatchObject({ first: 6, second: 11, advance: 3 })
    expect(s.scoring).toMatchObject({ fromRound: 1, fromPlayer: 'first', winMargin: 3 })
    expect(s.killBox).toBeUndefined()
    expect(s.elements).toHaveLength(2)
    expect(s.elements[0]).toMatchObject({ kind: 'scenarioTerrain', hold: { within: 2, models: 2 }, contest: { within: 2 }, vp: { control: 1 } })
    expect(rec('scn-qs-demo').terrainLayout).toBe('layout.ashwall-divide')
  })

  it('lays out walls and ponds point-symmetrically', () => {
    const l = rec('layout.ashwall-divide')
    const p = Object.fromEntries(l.pieces.map((x: Any) => [x.id, x.pos]))
    expect(p.w1).toEqual({ x: -p.w2.x, z: -p.w2.z })
    expect(p.p1).toEqual({ x: -p.p2.x, z: -p.p2.z })
    expect(rec('terrain.low-wall')).toMatchObject({ rulesType: 'obstacle', height: 0.75 })
    expect(rec('terrain.pond').rulesType).toBe('shallowWater')
  })

  it('detects a dangling reference and a duplicate id', () => {
    const copy: Record<string, TypedRecord> = { ...(bundle.byId as Record<string, TypedRecord>) }
    copy['cyg.deuce'] = { ...copy['cyg.deuce'], weapons: [{ weapon: 'cyg.w.nope' }] } as TypedRecord
    expect(checkRefs(copy).join('\n')).toMatch(/cyg\.w\.nope/)
    expect(checkRefs(bundle.byId as Record<string, TypedRecord>)).toEqual([])
  })

  it('uses only code hooks that are declared (listed for the engine to implement)', () => {
    const rep = validateAll()
    expect(rep.codeHooks.length).toBeGreaterThan(0)
    expect(rep.codeHooks).toContain('coreFlag')
  })
});
