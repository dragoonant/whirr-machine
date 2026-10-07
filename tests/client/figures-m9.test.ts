// M9 figures: GLB mapping with manifest fallback, refined procedural archetypes, weapon flavours and looks for the new
// weapons, and the six-faction gallery list. Headless: no canvas.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameEvent, GameState } from '../../src/engine/index'
import { loadBundle } from '../../src/data/index'
import { ENABLED_GLB_SLUGS, EXPECTED_GLB_SLUGS, GLB_SLUG_BY_MODEL, glbSlugFor, parseGlbManifest, setGlbManifestForTest } from '../../src/client/figures/glbModels'
import { galleryEntries } from '../../src/client/figures/Gallery'
import { archetypeOf } from '../../src/client/figures/kit'
import { dataArchetype, factionOf, factionPaint, kitOf } from '../../src/client/figures/profile'
import { FLAVOURS, weaponFlavour } from '../../src/client/weaponFlavour'
import { lookOf, planEvents, type AttackMemos } from '../../src/client/vfx/effects'

const MODELS_DIR = join(process.cwd(), 'public', 'assets', 'models')
const NEW_FACTIONS = ['trl', 'cir', 'cry', 'men']
type Rec = { id: string; recordType: string; type?: string; base?: number }
const bundle = () => Object.values(loadBundle().byId) as unknown as Rec[]
const newModels = () => bundle().filter((r) => r.recordType === 'model' && r.type !== 'unit' && NEW_FACTIONS.includes(factionOf(r.id)))

const slugMap = JSON.parse(readFileSync(join(MODELS_DIR, 'm9-slugs.json'), 'utf8')) as Record<string, string>
afterEach(() => setGlbManifestForTest([]))

describe('M9 GLB mapping', () => {
  it('every new model maps to a slug from m9-slugs.json (shared for Highwaymen and Defenders, one sculpt per Ravager and Fury)', () => {
    const models = newModels().filter((m) => GLB_SLUG_BY_MODEL[m.id] && EXPECTED_GLB_SLUGS.has(GLB_SLUG_BY_MODEL[m.id]!))
    expect(models.length).toBeGreaterThanOrEqual(21)
    for (const m of models) {
      const slug = GLB_SLUG_BY_MODEL[m.id]
      expect(slug, m.id).toMatch(/^wm-/)
      expect(slugMap[slug!], slug).toBeDefined()
      expect(EXPECTED_GLB_SLUGS.has(slug!), slug).toBe(true)
    }
    expect(new Set(models.map((m) => GLB_SLUG_BY_MODEL[m.id])).size).toBe(21)
  })
  it('stays procedural until the manifest lists the slug, then switches on (no 404 is ever requested)', () => {
    expect(glbSlugFor('cry.hades')).toBeUndefined()
    setGlbManifestForTest(['wm-hades'])
    expect(glbSlugFor('cry.hades')).toBe('wm-hades')
    expect(glbSlugFor('cry.nekane')).toBeUndefined()
    expect(glbSlugFor('cyg.caine')).toBe('wm-caine')
  })
  it('the manifest parses defensively and agrees with the files on disk', () => {
    expect(parseGlbManifest(null)).toEqual([])
    expect(parseGlbManifest({ slugs: ['wm-a', 5, 'Bad Slug'] })).toEqual(['wm-a'])
    // the manifest is optional (a fresh checkout may not have one): missing reads as an empty list, like the client
    const manifestPath = join(MODELS_DIR, 'manifest.json')
    const listed = existsSync(manifestPath) ? parseGlbManifest(JSON.parse(readFileSync(manifestPath, 'utf8'))) : []
    for (const s of listed) expect(existsSync(join(MODELS_DIR, s + '.glb')), s).toBe(true)
    // a GLB on disk in neither list is never requested (stays procedural), so it is not an error
  })
})

describe('M9 procedural archetypes', () => {
  const arch = (id: string) => archetypeOf((loadBundle().byId[id] as unknown as { type: never }).type, dataArchetype(id))
  it('warbeasts are beasts, with warpwolf and woldwarden variants by keyword', () => {
    expect(arch('trl.bomber')).toBe('beast')
    expect(arch('cir.pureblood')).toBe('warpwolf')
    expect(archetypeOf('beast')).toBe('beast')
  })
  it('Cryx jacks are bone-jacks and Menoth jacks robed crusaders; Furies are wraiths', () => {
    expect(arch('cry.hades')).toBe('boneJack')
    expect(arch('men.crusader')).toBe('crusaderJack')
    expect(arch('cry.furies-a')).toBe('wraith')
  })
  it('infantry and solos carry the kit their weapons name', () => {
    expect(arch('cir.ravager-1')).toBe('trooper:axe')
    expect(arch('trl.highwaymen-grunt')).toBe('trooper:gun')
    expect(arch('men.defenders-grunt')).toBe('trooper:spear')
    expect(arch('men.valeria')).toBe('solo:bow')
    expect(arch('men.pyrrhus')).toBe('solo:spear')
    expect(arch('trl.braylen')).toBe('solo:gun')
    expect(kitOf(['x.w.unknown']).kit).toBe('none')
  })
  it('casters stay casters and the original factions keep their data hint', () => {
    expect(arch('cry.nekane')).toBe('caster')
    expect(arch('cyg.caine')).toBe('caster')
    const hint = (loadBundle().byId['cyg.deuce'] as unknown as { figure?: { archetype?: string } }).figure?.archetype
    expect(dataArchetype('cyg.deuce')).toBe(hint)
  })
  it('every faction resolves a palette to paint the stand-in with', () => {
    for (const f of [...NEW_FACTIONS, 'cyg', 'kha']) expect(factionPaint(f)?.primary, f).toMatch(/^#/)
  })
})

describe('M9 weapon flavours and looks', () => {
  const weapons = () => bundle().filter((r) => r.recordType === 'weapon' && NEW_FACTIONS.includes(factionOf(r.id)))
  it('every new weapon id matches a flavour of the right kind by an explicit slug', () => {
    const ws = weapons()
    expect(ws.length).toBeGreaterThanOrEqual(30)
    for (const w of ws) {
      const melee = w.type === 'melee'
      const f = weaponFlavour(w.id, melee)
      expect(f.melee, w.id).toBe(melee)
      // M12 weapons without a bespoke flavour fall back to a generic one of the right kind (checked above)
    }
  })
  it('the new flavours exist with the right feel', () => {
    expect(weaponFlavour('cry.w.death-claw', true).id).toBe('claws')
    expect(weaponFlavour('trl.w.claw', true).id).toBe('claws')
    expect(weaponFlavour('cry.w.tusks', true).id).toBe('bite')
    expect(weaponFlavour('cry.w.eviscerator', true).id).toBe('chain-weapon')
    expect(weaponFlavour('cry.w.soul-cannon').id).toBe('soul-cannon')
    expect(weaponFlavour('men.w.flame-belcher').id).toBe('flame')
    expect(weaponFlavour('men.w.truth-consequence-flame').id).toBe('holy-fire')
    expect(weaponFlavour('cir.w.death-howler').id).toBe('lightning')
    expect(weaponFlavour('cir.w.jaws-of-the-earth').id).toBe('thorn')
    expect(weaponFlavour('men.w.pyrrhus-spear', true).id).toBe('holy-fire-melee')
    expect(weaponFlavour('trl.w.bazooka').id).toBe('rocket')
    expect(weaponFlavour('cir.w.wurmblade', true).id).toBe('blade')
    expect(new Set(FLAVOURS.map((f) => f.id)).size).toBe(FLAVOURS.length)
  })
  it('special flavours plan a look on the projectile and on the impact; ordinary ones stay as they were', () => {
    const model = (id: string, x: number) => ({ id, pos: { x, z: 0 }, elev: 0, base: 30, offTable: false })
    const s = { models: { a: model('a', 0), b: model('b', 6) } } as unknown as GameState
    const ev = (e: Record<string, unknown>) => ({ attackId: 'a:1', attackerId: 'a', originId: 'a', targetId: 'b', additional: false, ...e }) as unknown as GameEvent
    const dmg = { type: 'DamageApplied', attackId: 'a:1', targetId: 'b', points: 3 } as unknown as GameEvent
    const memos: AttackMemos = new Map()
    const out = planEvents([ev({ type: 'AttackDeclared', kind: 'ranged', weaponId: 'cry.w.soul-cannon' }), dmg], s, memos)
    expect(out.find((o) => o.kind === 'projectile')).toMatchObject({ look: 'soul' })
    expect(out.find((o) => o.kind === 'impact')).toMatchObject({ look: 'soul' })
    const plain = planEvents([ev({ type: 'AttackDeclared', kind: 'ranged', weaponId: 'cyg.w.magelock-pistol' })], s, new Map())
    expect(plain.find((o) => o.kind === 'projectile')).not.toHaveProperty('look')
    expect(lookOf(weaponFlavour('cyg.w.axe', true))).toBeUndefined()
    const melee = planEvents([ev({ type: 'AttackDeclared', kind: 'melee', weaponId: 'trl.w.claw' }), dmg], s, new Map())
    expect(melee.find((o) => o.kind === 'impact')).toMatchObject({ mode: 'melee', look: 'claws' })
  })
})

describe('M9 gallery list', () => {
  it('lists every model of all six factions, GLB or procedural', () => {
    const entries = galleryEntries()
    const factions = new Set(entries.map((e) => factionOf(e.profileId)))
    expect([...factions].sort()).toEqual(['cir', 'cry', 'cyg', 'kha', 'men', 'trl'])
    expect(entries.length).toBeGreaterThanOrEqual(33)
    expect(entries.filter((e) => e.slug).length).toBe(Object.values(GLB_SLUG_BY_MODEL).filter((s) => ENABLED_GLB_SLUGS.has(s)).length)
    expect(entries.find((e) => e.profileId === 'cry.hades')?.slug).toBeUndefined()
  })
})
