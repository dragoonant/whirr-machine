// trlRaw: static imports of this faction's data JSON files (paths relative to src/data/).
// Add a line here when this faction gets a new JSON file; tests/data checks that none is missing.
// src/data/raw.ts spreads every faction group, so faction builders never edit raw.ts.
import type { RawGroup } from '../../raw'
import d0 from './abilities.json'
import d1 from './faction.json'
import d2 from './feats.json'
import d3 from './models/bomber.json'
import d4 from './models/braylen.json'
import d5 from './models/gunnbjorn.json'
import d6 from './models/highwaymen-grunt.json'
import d7 from './models/highwaymen.json'
import d8 from './spells.json'
import d9 from './weapons.json'
import d10 from '../../lists/trl-starter-recon.json'

export const trlRaw: RawGroup = {
  'ability': [
    { path: 'factions/trl/abilities.json', data: d0 },
  ],
  'faction': [
    { path: 'factions/trl/faction.json', data: d1 },
  ],
  'feat': [
    { path: 'factions/trl/feats.json', data: d2 },
  ],
  'model': [
    { path: 'factions/trl/models/bomber.json', data: d3 },
    { path: 'factions/trl/models/braylen.json', data: d4 },
    { path: 'factions/trl/models/gunnbjorn.json', data: d5 },
    { path: 'factions/trl/models/highwaymen-grunt.json', data: d6 },
    { path: 'factions/trl/models/highwaymen.json', data: d7 },
  ],
  'spell': [
    { path: 'factions/trl/spells.json', data: d8 },
  ],
  'weapon': [
    { path: 'factions/trl/weapons.json', data: d9 },
  ],
  'list': [
    { path: 'lists/trl-starter-recon.json', data: d10 },
  ],
}
