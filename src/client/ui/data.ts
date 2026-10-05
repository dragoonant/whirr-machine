// Read-only data lookups for the HUD (names, stats shown on cards, weapon rows). Display text only: no rules maths.
import { loadBundle } from '../../data/index'
import type { Id, ModelState, Stat } from '../../engine/index'

export interface WeaponRec {
  id: Id; name?: string; type?: string; rng?: number | string; rof?: number; pow?: number; location?: string
  qualities?: Id[]; abilities?: Id[]; text?: string
}
export interface ProfileRec {
  id: Id; name?: string; type?: string; stats?: Partial<Record<Stat, number>>; base?: number
  damage?: { track: 'single' | 'grid' | 'dualGrid'; boxes?: number; columns?: string[]; grids?: { left?: string[]; right?: string[] } }
  weapons?: { weapon: Id; count?: number; location?: string }[]
  abilities?: Id[]; spells?: Id[]; feat?: Id; engineClass?: string; keywords?: string[]
}
export interface SpellRec { id: Id; name?: string; text?: string; cost?: number; rng?: number | string; offensive?: boolean; pow?: number; dur?: string }
export interface TextRec { id: Id; name?: string; text?: string }

const rec = <T,>(id: Id | undefined | null): T | undefined => (id ? (loadBundle().byId[id] as unknown as T | undefined) : undefined)

export const profileOf = (m: Pick<ModelState, 'profileId'>): ProfileRec | undefined => rec<ProfileRec>(m.profileId)
export const weaponRec = (id: Id): WeaponRec | undefined => rec<WeaponRec>(id)
export const spellRec = (id: Id): SpellRec | undefined => rec<SpellRec>(id)
export const textRec = (id: Id): TextRec | undefined => rec<TextRec>(id)
/** Our-words rules text of an ability, spell, feat or quality; '' when the data has none. */
export const dataText = (id: Id | undefined | null): string => rec<TextRec>(id)?.text ?? ''

export interface WeaponRow {
  key: string; weaponId: Id; name: string; kind: string; reach: string; pow: number | null; rof: number | null
  location: string | null; count: number; qualities: string[]
}

/** "SP8" is a spray of 8 inches; a number is a range in inches. */
export function reachText(w: WeaponRec): string {
  const r = w.rng
  if (typeof r === 'string') return /^SP(\d+)/.test(r) ? `Spray ${r.slice(2)}"` : r
  if (typeof r === 'number') return w.type === 'melee' ? `Reach ${r}"` : `Range ${r}"`
  return ''
}

export function weaponRows(m: Pick<ModelState, 'profileId'>, nameOf: (id: Id) => string): WeaponRow[] {
  const p = profileOf(m)
  if (!p?.weapons) return []
  return p.weapons.flatMap((e, i) => {
    const w = weaponRec(e.weapon)
    if (!w) return []
    return [{
      key: `${e.weapon}:${i}`, weaponId: e.weapon, name: w.name ?? nameOf(e.weapon), kind: w.type ?? 'ranged', reach: reachText(w),
      pow: typeof w.pow === 'number' ? w.pow : null, rof: typeof w.rof === 'number' ? w.rof : null,
      location: e.location ?? w.location ?? null, count: e.count ?? 1, qualities: (w.qualities ?? []).map(nameOf),
    }]
  })
}
