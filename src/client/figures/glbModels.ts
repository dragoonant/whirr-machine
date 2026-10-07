// Which model profiles render from a pre-made GLB (public/assets/models/<slug>.glb) instead of the procedural figure
// (30-figures section 3). Key = the model's profile id (ModelState.profileId); value = slug = file name without ".glb".
//
// TO ENABLE A MODEL: drop <slug>.glb into public/assets/models/ and either add the slug to ENABLED_GLB_SLUGS or list it in
// public/assets/models/manifest.json (a test checks that both agree with the files on disk). A slug in neither is never
// requested and stays procedural, so a missing GLB can never log a 404. The M9 models (trl, cir, cry, men) are
// EXPECTED_GLB_SLUGS: mapped now, drawn procedurally until their file is listed in the manifest.
import { useEffect, useState } from 'react'
import { dataFigureSlug } from './profile'

/** Slugs whose GLB file exists in public/assets/models/. */
export const ENABLED_GLB_SLUGS: ReadonlySet<string> = new Set([
  'wm-caine', 'wm-falk', 'wm-glover', 'wm-ryan', 'wm-watts', 'wm-deuce',
  'wm-vilkul', 'wm-lazarenko', 'wm-tererya', 'wm-fedyniak', 'wm-skrobala', 'wm-razor',
])

/** Slugs of the M9 models whose GLBs are still to come; they switch on when listed in manifest.json. */
export const EXPECTED_GLB_SLUGS: ReadonlySet<string> = new Set([
  'wm-bomber', 'wm-braylen', 'wm-gunnbjorn', 'wm-highwaymen-grunt',
  'wm-lord-of-the-feast', 'wm-pureblood', 'wm-ravager-1', 'wm-ravager-2', 'wm-ravager-3', 'wm-tanith',
  'wm-chatterbane', 'wm-furies-a', 'wm-furies-b', 'wm-furies-c', 'wm-hades', 'wm-nekane',
  'wm-crusader', 'wm-defenders-grunt', 'wm-feora', 'wm-pyrrhus', 'wm-valeria',
])

/** Profile id -> GLB slug. Every trooper has its own figure (MGSD versions of the real sculpts). */
export const GLB_SLUG_BY_MODEL: Readonly<Record<string, string>> = {
  'cyg.caine': 'wm-caine',
  'cyg.falk': 'wm-falk',
  'cyg.black13-glover': 'wm-glover',
  'cyg.black13-ryan': 'wm-ryan',
  'cyg.black13-watts': 'wm-watts',
  'cyg.deuce': 'wm-deuce',
  'kha.vilkul': 'wm-vilkul',
  'kha.lazarenko': 'wm-lazarenko',
  'kha.hounds-fedyniak': 'wm-fedyniak',
  'kha.hounds-skrobala': 'wm-skrobala',
  'kha.hounds-tererya': 'wm-tererya',
  'kha.razor': 'wm-razor',
  // M9 (slug = the model id's slug; every trooper has its own)
  'trl.bomber': 'wm-bomber',
  'trl.braylen': 'wm-braylen',
  'trl.gunnbjorn': 'wm-gunnbjorn',
  'trl.highwaymen-grunt': 'wm-highwaymen-grunt',
  'cir.lord-of-the-feast': 'wm-lord-of-the-feast',
  'cir.pureblood': 'wm-pureblood',
  'cir.ravager-1': 'wm-ravager-1',
  'cir.ravager-2': 'wm-ravager-2',
  'cir.ravager-3': 'wm-ravager-3',
  'cir.tanith': 'wm-tanith',
  'cry.chatterbane': 'wm-chatterbane',
  'cry.furies-a': 'wm-furies-a',
  'cry.furies-b': 'wm-furies-b',
  'cry.furies-c': 'wm-furies-c',
  'cry.hades': 'wm-hades',
  'cry.nekane': 'wm-nekane',
  'men.crusader': 'wm-crusader',
  'men.defenders-grunt': 'wm-defenders-grunt',
  'men.feora': 'wm-feora',
  'men.pyrrhus': 'wm-pyrrhus',
  'men.valeria': 'wm-valeria',
}

/** Slugs the manifest says exist on disk (filled once by loadGlbManifest; empty until then or if it cannot be read). */
const manifestSlugs = new Set<string>()
let manifestLoad: Promise<void> | undefined
let manifestListeners: Array<() => void> = []

/** Parse a manifest body ({ "slugs": [...] }) into slugs; anything malformed gives []. Pure (tests). */
export function parseGlbManifest(raw: unknown): string[] {
  const list = raw && typeof raw === 'object' ? (raw as { slugs?: unknown }).slugs : undefined
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]+$/.test(s)) : []
}

/** Fetch public/assets/models/manifest.json once (never throws, never logs). Listeners fire when it settles. */
export function loadGlbManifest(): Promise<void> {
  if (manifestLoad) return manifestLoad
  manifestLoad = (async () => {
    try {
      if (typeof fetch === 'undefined' || typeof location === 'undefined') return
      const res = await fetch(`${import.meta.env.BASE_URL}assets/models/manifest.json`, { cache: 'no-cache' })
      if (res.ok) for (const s of parseGlbManifest(await res.json())) manifestSlugs.add(s)
    } catch { /* offline or malformed: everything stays procedural */ }
    const ls = manifestListeners
    manifestListeners = []
    ls.forEach((l) => l())
  })()
  return manifestLoad
}
/** Call fn once when the manifest has loaded (immediately-next-tick if it already has). */
export const onGlbManifest = (fn: () => void): void => { void loadGlbManifest().then(fn) }
/** Test hook: set the manifest slugs directly. */
export function setGlbManifestForTest(slugs: readonly string[]): void { manifestSlugs.clear(); slugs.forEach((s) => manifestSlugs.add(s)); manifestLoad = Promise.resolve() }

if (typeof window !== 'undefined') void loadGlbManifest()

/** Re-renders the caller once the manifest has loaded, so a figure picks up a GLB that is listed there. */
export function useGlbManifestReady(): boolean {
  const [, tick] = useState(0)
  useEffect(() => { onGlbManifest(() => tick((n) => n + 1)) }, [])
  return manifestSlugs.size > 0
}

/** True when the slug's file is known to exist (enabled, or listed in the manifest). */
export const glbAvailable = (slug: string): boolean => ENABLED_GLB_SLUGS.has(slug) || (EXPECTED_GLB_SLUGS.has(slug) && manifestSlugs.has(slug))

/** The enabled GLB slug for a profile (the explicit map first, then the data's figure.slug), or undefined = procedural. */
export function glbSlugFor(profileId: string): string | undefined {
  const slug = GLB_SLUG_BY_MODEL[profileId] ?? dataFigureSlug(profileId)
  return slug && glbAvailable(slug) ? slug : undefined
}

/** Every available slug once, sorted (the gallery lists these). */
export const enabledSlugs = (): string[] => [...new Set([...ENABLED_GLB_SLUGS, ...[...EXPECTED_GLB_SLUGS].filter((s) => manifestSlugs.has(s))])].sort()

/** A representative profile for a slug (the gallery names the figure by it). */
export function profileForSlug(slug: string): string | undefined {
  return Object.keys(GLB_SLUG_BY_MODEL).find((k) => GLB_SLUG_BY_MODEL[k] === slug)
}
