// Frame pacing helpers: the shadow pass re-renders once per change, never on a timer.
import { describe, expect, it } from 'vitest'
import { LOW_AMBIENT_MS, markShadowsDirty, takeShadowsDirty } from '../../src/client/board/frameRate'

describe('frame pacing', () => {
  it('PERF-001 a shadow change is taken exactly once', () => {
    takeShadowsDirty()
    expect(takeShadowsDirty()).toBe(false)
    markShadowsDirty()
    markShadowsDirty()
    expect(takeShadowsDirty()).toBe(true)
    expect(takeShadowsDirty()).toBe(false)
  })

  it('PERF-002 Low graphics caps ambient animation at about 30 Hz', () => {
    expect(1000 / LOW_AMBIENT_MS).toBeGreaterThanOrEqual(29)
    expect(1000 / LOW_AMBIENT_MS).toBeLessThanOrEqual(31)
  })
})
