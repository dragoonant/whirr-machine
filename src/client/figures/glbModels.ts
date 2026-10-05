// Which model profiles render from a pre-made GLB (public/assets/models/<slug>.glb) instead of the procedural figure
// (30-figures section 3). Key = the model's profile id (ModelState.profileId); value = slug = file name without ".glb".
//
// TO ENABLE A MODEL: drop <slug>.glb into public/assets/models/ and add the slug to ENABLED_GLB_SLUGS (a test checks
// that every enabled slug has its file on disk). Slugs not listed there are never requested and stay procedural.
import { dataFigureSlug } from './profile'

/** Slugs whose GLB file exists in public/assets/models/. */
export const ENABLED_GLB_SLUGS: ReadonlySet<string> = new Set([
  'wm-caine', 'wm-falk', 'wm-black13', 'wm-deuce',
  'wm-vilkul', 'wm-lazarenko', 'wm-hounds', 'wm-razor',
])

/** Profile id -> GLB slug. One GLB serves every trooper of a unit (the three Black 13th profiles, the three Hounds). */
export const GLB_SLUG_BY_MODEL: Readonly<Record<string, string>> = {
  'cyg.caine': 'wm-caine',
  'cyg.falk': 'wm-falk',
  'cyg.black13-glover': 'wm-black13',
  'cyg.black13-ryan': 'wm-black13',
  'cyg.black13-watts': 'wm-black13',
  'cyg.deuce': 'wm-deuce',
  'kha.vilkul': 'wm-vilkul',
  'kha.lazarenko': 'wm-lazarenko',
  'kha.hounds-fedyniak': 'wm-hounds',
  'kha.hounds-skrobala': 'wm-hounds',
  'kha.hounds-tererya': 'wm-hounds',
  'kha.razor': 'wm-razor',
}

/** The enabled GLB slug for a profile (the explicit map first, then the data's figure.slug), or undefined = procedural. */
export function glbSlugFor(profileId: string): string | undefined {
  const slug = GLB_SLUG_BY_MODEL[profileId] ?? dataFigureSlug(profileId)
  return slug && ENABLED_GLB_SLUGS.has(slug) ? slug : undefined
}

/** Every enabled slug once, sorted (the gallery lists these). */
export const enabledSlugs = (): string[] => [...ENABLED_GLB_SLUGS].sort()

/** A representative profile for a slug (the gallery names the figure by it). */
export function profileForSlug(slug: string): string | undefined {
  return Object.keys(GLB_SLUG_BY_MODEL).find((k) => GLB_SLUG_BY_MODEL[k] === slug)
}
