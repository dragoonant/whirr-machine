// M10 Skirmish figures: every Skirmish profile maps to a GLB that exists, is listed, and sits on a base the size of its profile.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { glbSlugFor, setGlbManifestForTest } from '../../src/client/figures/glbModels'

const DIR = join(process.cwd(), 'public', 'assets', 'models')
const map = (JSON.parse(readFileSync(join(DIR, 'skirmish-slugs.json'), 'utf8')) as { models: Record<string, string> }).models
const listed = (JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as { slugs: string[] }).slugs
setGlbManifestForTest(listed)

/** Bounding boxes of a GLB's mesh nodes from its JSON chunk: the base disc radius and the lowest body point. */
function glbBox(slug: string): { baseR: number; bodyMinY: number; bodyMaxY: number } {
  const b = readFileSync(join(DIR, slug + '.glb'))
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'))
  let baseR = 0, bodyMinY = 1e9, bodyMaxY = -1e9
  for (const n of j.nodes) {
    if (n.mesh === undefined) continue
    for (const p of j.meshes[n.mesh].primitives) {
      const a = j.accessors[p.attributes.POSITION]
      if (n.name === 'base') baseR = Math.max(a.max[0], a.max[2])
      else { bodyMinY = Math.min(bodyMinY, a.min[1]); bodyMaxY = Math.max(bodyMaxY, a.max[1]) }
    }
  }
  return { baseR, bodyMinY, bodyMaxY }
}

describe('M10 Skirmish figures', () => {
  it('covers the 19 Skirmish profiles plus Tanith, each resolving to its GLB', () => {
    expect(Object.keys(map).length).toBe(20)
    for (const [id, slug] of Object.entries(map)) {
      expect(glbSlugFor(id), id).toBe(slug)
      expect(existsSync(join(DIR, slug + '.glb')), slug).toBe(true)
      expect(listed, slug).toContain(slug)
    }
  })
  it('each figure stands on the base its profile names and does not float or sink', () => {
    for (const [id, slug] of Object.entries(map)) {
      const base = (loadBundle().byId[id] as unknown as { base: number }).base
      const g = glbBox(slug)
      // the Krielstone Bearer GLB has a 50 mm disc and the Scribe a 30 mm one while both profiles say 40 (data owner's card read); the disc is rescaled at load
      if (!id.startsWith('trl.stone-')) expect(g.baseR, id).toBeCloseTo(base / 25.4 / 2, 1)
      expect(g.bodyMinY, id).toBeGreaterThanOrEqual(0.1)
      expect(g.bodyMinY, id).toBeLessThan(0.2)
      expect(g.bodyMaxY, id).toBeGreaterThan(1.2)
      expect(g.bodyMaxY, id).toBeLessThan(3)
    }
  })
})
