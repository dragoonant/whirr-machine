// Profile lookups for figures (data only).
import { loadBundle } from '../../data/index'

type FigureRec = { figure?: { archetype?: string; slug?: string; heightIn?: number } }
const cache = new Map<string, FigureRec['figure']>()
function figureOf(profileId: string): FigureRec['figure'] {
  if (cache.has(profileId)) return cache.get(profileId)
  const rec = loadBundle().byId[profileId] as FigureRec | undefined
  cache.set(profileId, rec?.figure)
  return rec?.figure
}
/** The profile's figure.archetype hint, if the data names one. */
export const dataArchetype = (profileId: string): string | undefined => figureOf(profileId)?.archetype
/** The profile's figure.slug, if the data names one. */
export const dataFigureSlug = (profileId: string): string | undefined => figureOf(profileId)?.slug
/** The profile's figure.heightIn override, if any. */
export const dataHeightIn = (profileId: string): number | undefined => figureOf(profileId)?.heightIn

/** Faction id of a profile (the prefix before the first dot: `cyg.caine` -> `cyg`). */
export const factionOf = (profileId: string): string => profileId.split('.')[0] ?? ''

interface FactionRec { palette?: { primary?: string; secondary?: string }; sourceHues?: [number, number] }
/** Faction palette and source hues from the data bundle. */
export function factionData(factionId: string): FactionRec {
  return (loadBundle().byId[factionId] as FactionRec | undefined) ?? {}
}
