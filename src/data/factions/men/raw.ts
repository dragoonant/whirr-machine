// menRaw: static imports of this faction's data JSON files (paths relative to src/data/).
// Add a line here when this faction gets a new JSON file; tests/data checks that none is missing.
// src/data/raw.ts spreads every faction group, so faction builders never edit raw.ts.
import type { RawGroup } from '../../raw'
import d0 from './abilities.json'
import d1 from './faction.json'
import d2 from './feats.json'
import d12 from './models/cleanser-sanctifiers-grunt.json'
import d13 from './models/cleanser-sanctifiers.json'
import d3 from './models/crusader.json'
import d4 from './models/defenders-grunt.json'
import d5 from './models/defenders.json'
import d6 from './models/feora.json'
import d7 from './models/pyrrhus.json'
import d8 from './models/valeria.json'
import d14 from './models/revenger-arc.json'
import d15 from './models/vassals-grunt.json'
import d16 from './models/vassals.json'
import d9 from './spells.json'
import d10 from './weapons.json'
import d11 from '../../lists/men-starter-recon.json'
import d17 from '../../lists/men-skirmish.json'

export const menRaw: RawGroup = {
  'ability': [
    { path: 'factions/men/abilities.json', data: d0 },
  ],
  'faction': [
    { path: 'factions/men/faction.json', data: d1 },
  ],
  'feat': [
    { path: 'factions/men/feats.json', data: d2 },
  ],
  'model': [
    { path: 'factions/men/models/crusader.json', data: d3 },
    { path: 'factions/men/models/defenders-grunt.json', data: d4 },
    { path: 'factions/men/models/defenders.json', data: d5 },
    { path: 'factions/men/models/feora.json', data: d6 },
    { path: 'factions/men/models/pyrrhus.json', data: d7 },
    { path: 'factions/men/models/valeria.json', data: d8 },
    { path: 'factions/men/models/cleanser-sanctifiers-grunt.json', data: d12 },
    { path: 'factions/men/models/cleanser-sanctifiers.json', data: d13 },
    { path: 'factions/men/models/revenger-arc.json', data: d14 },
    { path: 'factions/men/models/vassals-grunt.json', data: d15 },
    { path: 'factions/men/models/vassals.json', data: d16 },
  ],
  'spell': [
    { path: 'factions/men/spells.json', data: d9 },
  ],
  'weapon': [
    { path: 'factions/men/weapons.json', data: d10 },
  ],
  'list': [
    { path: 'lists/men-starter-recon.json', data: d11 },
    { path: 'lists/men-skirmish.json', data: d17 },
  ],
}
