// 40-ai §3: closed-form dice math matches the spec table and the engine's own preview numbers.
import { describe, expect, it } from 'vitest'
import { newCtx, profileOf } from '../../src/ai/damage'
import { countAtLeast, damageDist, expected, pHit, pKillSequence } from '../../src/ai/prob'
import { weaponsOf } from '../../src/ai/world'
import { query } from '../../src/engine/index'
import { ASH, playUntil } from './helpers'

describe('AI dice math', () => {
  it('AI-PROB-1 counts outcomes as in the 40-ai section 3 table', () => {
    const two = [36, 35, 33, 30, 26, 21, 15, 10, 6, 3, 1]
    two.forEach((n, i) => expect(countAtLeast(2, i + 2)).toBe(n))
    const three = [216, 215, 212, 206, 196, 181, 160, 135, 108, 81, 56, 35, 20, 10, 4, 1]
    three.forEach((n, i) => expect(countAtLeast(3, i + 3)).toBe(n))
  })
  it('AI-PROB-2 all 1s miss and all 6s hit', () => {
    expect(pHit(2, 2)).toBeCloseTo(35 / 36)
    expect(pHit(2, 13)).toBeCloseTo(1 / 36)
    expect(pHit(3, 30)).toBeCloseTo(1 / 216)
    expect(pHit(0, 2)).toBe(0)
  })
  it('AI-PROB-3 sequence pKill: certain kills, Power Field and Tough', () => {
    const sure = { p: 1, onHit: damageDist(2, 20) } // 22+ damage
    expect(pKillSequence([sure], 10)).toBeCloseTo(1)
    expect(pKillSequence([sure], 10, 0, true)).toBeCloseTo(2 / 3)
    // Power Field cuts 5 per focus from a positive instance: 2d6+2 (4..14) vs 9 boxes
    const one = { p: 1, onHit: damageDist(2, 2) }
    expect(pKillSequence([one], 9, 1)).toBeLessThan(pKillSequence([one], 9, 0))
    expect(expected(damageDist(2, 0))).toBeCloseTo(7)
  })
  it('AI-PROB-4 attack profiles reproduce query.attackPreview', () => {
    const s = playUntil(ASH(), 'prob-1', (x) => x.round >= 2 && x.pending.kind === 'chooseActivation')
    const ctx = newCtx(s)
    let checked = 0
    for (const a of Object.values(s.models)) {
      if (a.offTable || a.life !== 'active') continue
      for (const t of Object.values(s.models)) {
        if (t.owner === a.owner || t.offTable || t.life !== 'active') continue
        for (const w of weaponsOf(a)) {
          if (w.aoe) continue
          const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z)
          const from = { x: t.pos.x + ((a.pos.x - t.pos.x) / d) * 1.2, z: t.pos.z + ((a.pos.z - t.pos.z) / d) * 1.2 }
          const pv = query.attackPreview(s, a.id, w.id, t.id, { fromPos: from })
          const pr = profileOf(ctx, s, a, w, t, { fromPos: from })
          if (pv.legal) { expect(pr).toBeNull(); continue }
          expect(pr).not.toBeNull()
          expect(pr!.p).toBeCloseTo(pv.pHit, 6)
          expect(pr!.p * expected(pr!.onHit)).toBeCloseTo(pv.expectedDamage, 1)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(10)
  })
})
