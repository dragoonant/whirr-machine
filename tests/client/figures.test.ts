// Figures and VFX (30 sections 3-5): GLB mapping, army painter, status sockets, beat -> effect planning, particle pool.
// Headless: no canvas, no GL.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three'
import type { GameEvent, GameState } from '../../src/engine/index'
import { loadBundle } from '../../src/data/index'
import { ENABLED_GLB_SLUGS, GLB_SLUG_BY_MODEL, glbSlugFor, profileForSlug } from '../../src/client/figures/glbModels'
import { BAND_DEG, hsvOf, sourceBands, variantCount, variantMaterial } from '../../src/client/figures/glbPaint'
import { PAINT_PRESETS, paintKey, resolvePaint, sanitizePaint, usePaintStore } from '../../src/client/figures/paintStore'
import { splitGlb } from '../../src/client/figures/GlbBody'
import { partMaterial } from '../../src/client/figures/kit'
import { memoryStorage, readJson, setStorage } from '../../src/client/store/storage'
import { blastRadius, centreOf, planEvent, planEvents, travelSeconds, type AttackMemos, type FxSpec } from '../../src/client/vfx/effects'
import { ParticlePool } from '../../src/client/vfx/particles'
import { socketFor, socketsFor } from '../../src/client/vfx/sockets'

const MODELS_DIR = join(process.cwd(), 'public', 'assets', 'models')

describe('GLB mapping (30 section 3)', () => {
  it('every enabled slug has its file on disk', () => {
    for (const slug of ENABLED_GLB_SLUGS) expect(existsSync(join(MODELS_DIR, `${slug}.glb`)), slug).toBe(true)
  })
  it('every mapped profile exists in the data and maps to an enabled slug', () => {
    const byId = loadBundle().byId
    for (const [profile, slug] of Object.entries(GLB_SLUG_BY_MODEL)) {
      expect(byId[profile], profile).toBeDefined()
      expect(ENABLED_GLB_SLUGS.has(slug), slug).toBe(true)
    }
  })
  it('one GLB serves every trooper of a unit; unknown profiles stay procedural', () => {
    expect(glbSlugFor('cyg.black13-glover')).toBe('wm-black13')
    expect(glbSlugFor('cyg.black13-watts')).toBe('wm-black13')
    expect(glbSlugFor('kha.hounds-tererya')).toBe('wm-hounds')
    expect(glbSlugFor('kha.razor')).toBe('wm-razor')
    expect(glbSlugFor('cyg.nobody')).toBeUndefined()
    for (const s of ENABLED_GLB_SLUGS) expect(profileForSlug(s), s).toBeDefined()
  })
})

describe('army painter (30 section 4)', () => {
  it('reads the faction source hues and a saturated reference colour', () => {
    const cyg = sourceBands('cyg')!
    expect(Math.round(cyg[0].hue * 360)).toBe(220)
    expect(Math.round(cyg[1].hue * 360)).toBe(45)
    const kha = sourceBands('kha')!
    expect(Math.round(kha[0].hue * 360)).toBe(0)
    expect(Math.round(kha[1].hue * 360)).toBe(30)
    expect(sourceBands('nope')).toBeNull()
    expect(BAND_DEG).toBe(22)
  })
  it('hsvOf puts blue near 240 degrees and grey at zero saturation', () => {
    expect(Math.round(hsvOf('#0000ff')[0] * 360)).toBe(240)
    expect(hsvOf('#808080')[1]).toBeLessThan(0.01)
  })
  it('defaults keep the original material; paints are cloned once per (material, paint) and cached', () => {
    const src = new MeshStandardMaterial({ color: '#2b4a8c' })
    expect(variantMaterial(src, 'cyg', undefined, false)).toBe(src)
    const before = variantCount()
    const p = { primary: '#1f7a6e', secondary: '#c98a3c' }
    const a = variantMaterial(src, 'cyg', p, false)
    const b = variantMaterial(src, 'cyg', { ...p }, false)
    expect(a).not.toBe(src)
    expect(b).toBe(a)
    expect(variantCount()).toBe(before + 1)
    expect(variantMaterial(src, 'cyg', { primary: '#ff0000' }, false)).not.toBe(a)
    expect(variantMaterial(src, 'cyg', undefined, true)).not.toBe(src) // grey variant
  })
  it('sanitises colours and resolves side over faction over stock', () => {
    setStorage(memoryStorage())
    expect(sanitizePaint({ primary: '#ABCDEF', secondary: 'red', junk: 1 })).toEqual({ primary: '#abcdef' })
    const st = usePaintStore.getState()
    expect(resolvePaint('cyg', 'A')).toBeUndefined()
    st.setFaction('cyg', { primary: '#112233' })
    expect(readJson('wm.paint.cyg')).toEqual({ primary: '#112233' })
    expect(resolvePaint('cyg', 'A')).toEqual({ primary: '#112233' })
    st.setSide('A', { primary: '#445566', secondary: '#778899' })
    expect(resolvePaint('cyg', 'A')?.primary).toBe('#445566')
    expect(resolvePaint('cyg', 'B')?.primary).toBe('#112233')
    st.setSide('A', undefined)
    st.setFaction('cyg', {})
    expect(resolvePaint('cyg', 'A')).toBeUndefined()
    expect(paintKey({})).toBe('')
    expect(PAINT_PRESETS).toHaveLength(4)
  })
  it('procedural parts take the paint on primary and secondary only', () => {
    const stock = partMaterial('A', 'primary')
    const painted = partMaterial('A', 'primary', { primary: '#123456' })
    expect(painted).not.toBe(stock)
    expect(partMaterial('A', 'primary', { primary: '#123456' })).toBe(painted)
    expect(partMaterial('A', 'metal', { primary: '#123456' })).toBe(partMaterial('A', 'metal'))
  })
})

describe('GLB split', () => {
  it('separates the base disc (resized to the engine base) from the body', () => {
    const scene = new Group()
    const base = new Mesh(new BoxGeometry(1.2, 0.12, 1.2), new MeshStandardMaterial({ name: 'base_black' }))
    base.name = 'base'
    base.position.y = 0.06
    const fig = new Mesh(new BoxGeometry(0.6, 1.2, 0.4), new MeshStandardMaterial({ name: 'Material_0' }))
    fig.name = 'figure'
    fig.position.y = 0.72
    scene.add(base, fig)
    const parts = splitGlb(scene, 0.8)
    expect(parts.base.children).toHaveLength(1)
    expect(parts.body.children).toHaveLength(1)
    expect(parts.base.scale.x).toBeCloseTo(0.8 / 0.6, 3)
    expect(parts.halfWidth).toBeCloseTo(0.3, 3)
    expect(parts.height).toBeCloseTo(1.2, 3)
  })
})

describe('status sockets (30 section 5)', () => {
  it('arms spark, head smokes, movement steams, cortex flickers; fire and corrosion add their own', () => {
    expect(socketFor('L', 0.6, 1.25).kind).toBe('spark')
    expect(socketFor('R', 0.6, 1.25).kind).toBe('spark')
    expect(socketFor('L', 0.6, 1.25).x).toBeGreaterThan(0)
    expect(socketFor('R', 0.6, 1.25).x).toBeLessThan(0)
    expect(socketFor('H', 0.6, 1.25).kind).toBe('smoke')
    expect(socketFor('M', 0.6, 1.25).kind).toBe('steam')
    expect(socketFor('C', 0.6, 1.25).kind).toBe('flicker')
    expect(socketsFor(['L', 'H'], ['fire', 'corrosion'], 0.6, 1.25).map((s) => s.kind)).toEqual(['spark', 'smoke', 'flame', 'drip'])
    expect(socketsFor([], [], 0.6, 1.25)).toEqual([])
  })
})

// ---------- beat -> effect planning ----------
const model = (id: string, x: number, z: number, base = 30) => ({ id, pos: { x, z }, elev: 0, base, offTable: false })
const state = { models: { a: model('a', 0, 0), b: model('b', 6, 0), c: model('c', 7, 0) } } as unknown as GameState
const declared = (over: Record<string, unknown>) => ({ type: 'AttackDeclared', attackId: 'a:1', attackerId: 'a', originId: 'a', targetId: 'b', additional: false, ...over }) as unknown as GameEvent
const kinds = (s: FxSpec[]) => s.map((x) => x.kind)

describe('effects planner (beats -> VFX)', () => {
  let memos: AttackMemos
  beforeEach(() => { memos = new Map() })

  it('ranged attack: muzzle flash and a tracer from shooter to target', () => {
    const out = planEvent(declared({ kind: 'ranged', weaponId: 'cyg.w.magelock-rifle' }), state, memos)
    expect(kinds(out)).toEqual(['muzzle', 'projectile'])
    const proj = out[1] as Extract<FxSpec, { kind: 'projectile' }>
    expect(proj.arcane).toBe(false)
    expect(proj.from.x).toBe(0)
    expect(proj.to.x).toBe(6)
    expect(proj.style).toBe('tracer')
    expect(memos.get('a:1')?.mode).toBe('ranged')
  })
  it('a cannon lobs an arc; a spell is an arcane bolt with no muzzle flash', () => {
    const shell = planEvent(declared({ kind: 'ranged', weaponId: 'kha.w.slug-cannon' }), state, memos)
    expect((shell[1] as Extract<FxSpec, { kind: 'projectile' }>).style).toBe('arc')
    const spell = planEvent(declared({ kind: 'arcane', spellId: 'cyg.s.arcane-conflagration', attackId: 'a:2' }), state, memos)
    expect(kinds(spell)).toEqual(['projectile'])
    expect((spell[0] as Extract<FxSpec, { kind: 'projectile' }>).arcane).toBe(true)
  })
  it('melee: nothing at the declaration, sparks when damage lands', () => {
    expect(planEvent(declared({ kind: 'melee', weaponId: 'kha.w.axe', attackId: 'a:3' }), state, memos)).toEqual([])
    const dmg = { type: 'DamageApplied', targetId: 'b', attackId: 'a:3', points: 4 } as unknown as GameEvent
    const out = planEvent(dmg, state, memos)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'impact', mode: 'melee' })
    expect(planEvent({ ...dmg, points: 0 } as unknown as GameEvent, state, memos)).toEqual([])
  })
  it('blast: a ring at the centre sized from the weapon data, the neighbours get ordinary sparks', () => {
    planEvent(declared({ kind: 'aoe', weaponId: 'kha.w.grenade-launcher', attackId: 'a:4' }), state, memos)
    const out = planEvent({ type: 'BlastTargetsFixed', attackId: 'a:4', centreId: 'b', targetIds: ['b', 'c'] } as unknown as GameEvent, state, memos)
    expect(kinds(out)).toEqual(['ring', 'impact'])
    expect((out[0] as Extract<FxSpec, { kind: 'ring' }>).radius).toBe(blastRadius('kha.w.grenade-launcher'))
    expect(blastRadius('kha.w.grenade-launcher')).toBe(1)
    expect(blastRadius(undefined)).toBe(1.5)
    const neighbour = planEvent({ type: 'DamageApplied', targetId: 'c', attackId: 'a:4', points: 2 } as unknown as GameEvent, state, memos)
    expect(neighbour[0]).toMatchObject({ kind: 'impact', mode: 'ranged' })
  })
  it('spells at a point draw an arcane ring; attack spells are left to their AttackDeclared', () => {
    const point = planEvent({ type: 'SpellCast', casterId: 'a', spellId: 's', originId: 'a', point: { x: 3, z: 3 }, cost: 1 } as unknown as GameEvent, state, memos)
    expect(point[0]).toMatchObject({ kind: 'ring', mode: 'arcane' })
    expect(planEvent({ type: 'SpellCast', casterId: 'a', spellId: 's', originId: 'a', targetId: 'b', cost: 1, attackId: 'a:9' } as unknown as GameEvent, state, memos)).toEqual([])
  })
  it('crippled systems and downed models burst; a long run is a fast-forward and plays nothing', () => {
    expect(kinds(planEvent({ type: 'SystemCrippled', modelId: 'b', system: 'L' } as unknown as GameEvent, state, memos))).toEqual(['cripple'])
    expect(kinds(planEvent({ type: 'LifeStateChanged', modelId: 'b', from: 'active', to: 'destroyed' } as unknown as GameEvent, state, memos))).toEqual(['down'])
    const many = Array.from({ length: 20 }, () => declared({ kind: 'ranged', weaponId: 'cyg.w.magelock-rifle' }))
    expect(planEvents(many, state, memos)).toEqual([])
    expect(planEvents(many.slice(0, 2), state, memos).length).toBeGreaterThan(0)
  })
  it('off-table and missing models draw nothing; travel time is clamped', () => {
    const away = { models: { a: model('a', 0, 0), b: { ...model('b', 6, 0), offTable: true } } } as unknown as GameState
    expect(centreOf(away, 'b')).toBeNull()
    expect(planEvent(declared({ kind: 'ranged', weaponId: 'cyg.w.magelock-rifle' }), away, memos)).toEqual([])
    expect(travelSeconds(0, 'tracer')).toBeGreaterThanOrEqual(0.1)
    expect(travelSeconds(500, 'arc')).toBe(0.5)
  })
})

describe('particle pool', () => {
  it('reuses a fixed ring of slots and dies out', () => {
    const pool = new ParticlePool(8, true)
    for (let i = 0; i < 20; i++) pool.emit({ x: 0, y: 0, z: 0, vy: 1, life: 0.5, size0: 0.2, r: 1, g: 1, b: 1 })
    expect(pool.alive).toBe(8)
    expect(pool.update(0.2)).toBe(true)
    expect(pool.alive).toBe(8)
    expect(pool.update(0.4)).toBe(false)
    expect(pool.alive).toBe(0)
    pool.dispose()
  })
})
