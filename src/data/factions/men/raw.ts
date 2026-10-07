// menRaw: static imports of this faction's data JSON files (paths relative to src/data/).
// Add a line here when this faction gets a new JSON file; tests/data checks that none is missing.
// src/data/raw.ts spreads every faction group, so faction builders never edit raw.ts.
import type { RawGroup } from '../../raw'
import d0 from './faction.json'

export const menRaw: RawGroup = {
  'faction': [
    { path: 'factions/men/faction.json', data: d0 },
  ],
}
