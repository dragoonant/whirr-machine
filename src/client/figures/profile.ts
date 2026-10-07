// Profile lookups for figures (data only).
import { loadBundle } from '../../data/index'
import type { Kit } from './kit'

type FigureRec = { figure?: { archetype?: string; slug?: string; heightIn?: number } }
const cache = new Map<string, FigureRec['figure']>()
function figureOf(profileId: string): FigureRec['figure'] {
  if (cache.has(profileId)) return cache.get(profileId)
  const rec = loadBundle().byId[profileId] as FigureRec | undefined
  cache.set(profileId, rec?.figure)
  return rec?.figure
}
interface ModelRec { type?: string; keywords?: string[]; weapons?: { weapon: string }[] }
const modelOf = (profileId: string): ModelRec => (loadBundle().byId[profileId] as ModelRec | undefined) ?? {}

/** Weapon family a profile carries, read from its weapon ids ('gun', 'axe', 'spear', 'bow', 'blade', 'scythe', 'none'). */
export function kitOf(weaponIds: readonly string[]): { kit: Kit; shield: boolean } {
  const has = (re: RegExp) => weaponIds.some((w) => re.test(w))
  const shield = has(/shield/)
  const kit: Kit = has(/bow/) ? 'bow' : has(/spear/) ? 'spear' : has(/pistol|rifle|carbine|bazooka|spiker|gun/) ? 'gun'
    : has(/eviscerator|scythe|reaper/) ? 'scythe' : has(/axe/) ? 'axe' : has(/blade|sword|knife/) ? 'blade' : 'none'
  return { kit, shield }
}

/** Factions whose figures are still procedural stand-ins and get the refined (beast, bone-jack, kit) archetypes. */
const REFINED = new Set(['trl', 'cir', 'cry', 'men'])

/**
 * The profile's figure archetype for the procedural body: the data's hint, refined for the M9 factions. Warbeasts
 * become 'beast' ('warpwolf' / 'woldwarden' by keyword), Cryx jacks 'boneJack', Menoth jacks 'crusaderJack', wraiths
 * 'wraith', and infantry and solos 'trooper:<kit>' / 'solo:<kit>' from their weapons.
 */
export function dataArchetype(profileId: string): string | undefined {
  const hint = figureOf(profileId)?.archetype
  const faction = factionOf(profileId)
  if (!REFINED.has(faction)) return hint
  const rec = modelOf(profileId)
  const kw = rec.keywords ?? []
  if (rec.type === 'beast' || hint === 'beast' || kw.includes('warbeast')) {
    return kw.includes('woldwarden') ? 'woldwarden' : kw.includes('warpwolf') ? 'warpwolf' : 'beast'
  }
  if (hint === 'heavyEngine' || hint === 'lightEngine' || rec.type === 'warEngine') {
    return faction === 'cry' ? 'boneJack' : faction === 'men' ? 'crusaderJack' : hint
  }
  if (kw.includes('wraith')) return 'wraith'
  if (hint === 'infantry' || hint === 'solo' || rec.type === 'trooper' || rec.type === 'solo') {
    const { kit, shield } = kitOf((rec.weapons ?? []).map((w) => w.weapon))
    const base = hint === 'solo' || rec.type === 'solo' ? 'solo' : 'trooper'
    return `${base}:${kit}${shield ? '+shield' : ''}`
  }
  return hint
}
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

/** The faction's stock two-colour paint (primary, secondary), so a procedural stand-in wears the faction palette. */
export function factionPaint(factionId: string): { primary?: string; secondary?: string } | undefined {
  const p = factionData(factionId).palette
  return p?.primary || p?.secondary ? { primary: p.primary, secondary: p.secondary } : undefined
}
