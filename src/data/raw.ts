// Static imports of every data JSON file, so loading works in Vite, vitest and tsx alike.
// Core and shared files are listed here; each faction lists its own files in src/data/factions/<id>/raw.ts
// (a RawGroup) and is spread in below, so parallel faction builders never edit this file.
// tests/data checks that no JSON file on disk is missing from RAW.
import d0 from './core/abilities.json'
import d1 from './core/qualities.json'
import d2 from './core/systems.json'
import d29 from './scenarios/ashwall-divide.json'
import d30 from './scenarios/qs-demo.json'
import d31 from './terrain/layouts/ashwall-divide.json'
import d32 from './terrain/pieces.json'
import d33 from './terrain/pieces-bog.json'
import d34 from './terrain/pieces-ruins.json'
import d35 from './terrain/pieces-village.json'
import d36 from './terrain/pieces-wasteland.json'
import d37 from './terrain/pieces-outpost.json'
import d38 from './terrain/layouts/bog-1.json'
import d39 from './terrain/layouts/bog-2.json'
import d40 from './terrain/layouts/bog-3.json'
import d41 from './terrain/layouts/ruins-1.json'
import d42 from './terrain/layouts/ruins-2.json'
import d43 from './terrain/layouts/ruins-3.json'
import d44 from './terrain/layouts/village-1.json'
import d45 from './terrain/layouts/village-2.json'
import d46 from './terrain/layouts/village-3.json'
import d47 from './terrain/layouts/wasteland-1.json'
import d48 from './terrain/layouts/wasteland-2.json'
import d49 from './terrain/layouts/wasteland-3.json'
import d50 from './terrain/layouts/outpost-1.json'
import d51 from './terrain/layouts/outpost-2.json'
import d52 from './terrain/layouts/outpost-3.json'
import d53 from './terrain/boards.json'
import { cygRaw } from './factions/cyg/raw'
import { khaRaw } from './factions/kha/raw'
import { trlRaw } from './factions/trl/raw'
import { cirRaw } from './factions/cir/raw'
import { cryRaw } from './factions/cry/raw'
import { menRaw } from './factions/men/raw'

export interface RawFile { path: string; data: unknown }
/** One faction's files by record kind (the same keys as RAW). */
export type RawGroup = Partial<Record<string, RawFile[]>>

/** Faction groups in load order. Add a new faction here once (M9 already lists trl, cir, cry, men). */
export const FACTION_RAW: readonly RawGroup[] = [cygRaw, khaRaw, trlRaw, cirRaw, cryRaw, menRaw]

const CORE: RawGroup = {
  'ability': [
    { path: 'core/abilities.json', data: d0 },
    { path: 'core/qualities.json', data: d1 },
  ],
  'systems': [
    { path: 'core/systems.json', data: d2 },
  ],
}

const SHARED: RawGroup = {
  'scenario': [
    { path: 'scenarios/ashwall-divide.json', data: d29 },
    { path: 'scenarios/qs-demo.json', data: d30 },
  ],
  'terrain-layout': [
    { path: 'terrain/layouts/ashwall-divide.json', data: d31 },
    { path: 'terrain/layouts/bog-1.json', data: d38 },
    { path: 'terrain/layouts/bog-2.json', data: d39 },
    { path: 'terrain/layouts/bog-3.json', data: d40 },
    { path: 'terrain/layouts/ruins-1.json', data: d41 },
    { path: 'terrain/layouts/ruins-2.json', data: d42 },
    { path: 'terrain/layouts/ruins-3.json', data: d43 },
    { path: 'terrain/layouts/village-1.json', data: d44 },
    { path: 'terrain/layouts/village-2.json', data: d45 },
    { path: 'terrain/layouts/village-3.json', data: d46 },
    { path: 'terrain/layouts/wasteland-1.json', data: d47 },
    { path: 'terrain/layouts/wasteland-2.json', data: d48 },
    { path: 'terrain/layouts/wasteland-3.json', data: d49 },
    { path: 'terrain/layouts/outpost-1.json', data: d50 },
    { path: 'terrain/layouts/outpost-2.json', data: d51 },
    { path: 'terrain/layouts/outpost-3.json', data: d52 },
  ],
  'terrain': [
    { path: 'terrain/pieces.json', data: d32 },
    { path: 'terrain/pieces-bog.json', data: d33 },
    { path: 'terrain/pieces-ruins.json', data: d34 },
    { path: 'terrain/pieces-village.json', data: d35 },
    { path: 'terrain/pieces-wasteland.json', data: d36 },
    { path: 'terrain/pieces-outpost.json', data: d37 },
  ],
  'board': [
    { path: 'terrain/boards.json', data: d53 },
  ],
}

/** Record kinds in their historical order (byId insertion order follows it). */
const KINDS = ['ability', 'systems', 'faction', 'feat', 'model', 'spell', 'weapon', 'list', 'scenario', 'terrain-layout', 'terrain', 'board'] as const

function merge(groups: readonly RawGroup[]): Record<string, RawFile[]> {
  const out: Record<string, RawFile[]> = {}
  for (const k of KINDS) out[k] = []
  for (const g of groups) for (const [k, files] of Object.entries(g)) (out[k] ??= []).push(...(files ?? []))
  return out
}

export const RAW: Record<string, RawFile[]> = merge([CORE, ...FACTION_RAW, SHARED])
