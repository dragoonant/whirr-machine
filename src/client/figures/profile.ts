// Profile lookups for figures (data only).
import { loadBundle } from '../../data/index'

const cache = new Map<string, string | undefined>()
/** The profile's figure.archetype hint, if the data names one. */
export function dataArchetype(profileId: string): string | undefined {
  if (cache.has(profileId)) return cache.get(profileId)
  const rec = loadBundle().byId[profileId] as { figure?: { archetype?: string } } | undefined
  const a = rec?.figure?.archetype
  cache.set(profileId, a)
  return a
}
