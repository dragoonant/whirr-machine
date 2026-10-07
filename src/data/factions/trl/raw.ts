// trlRaw: static imports of this faction's data JSON files (paths relative to src/data/).
// Add a line here when this faction gets a new JSON file; tests/data checks that none is missing.
// src/data/raw.ts spreads every faction group, so faction builders never edit raw.ts.
import type { RawGroup } from '../../raw'
import d0 from './abilities.json'
import d1 from './faction.json'
import d2 from './feats.json'
import d3 from './models/bomber.json'
import d4 from './models/braylen.json'
import d5 from './models/dozer-smigg.json'
import d6 from './models/gunnbjorn.json'
import d7 from './models/highwaymen-grunt.json'
import d8 from './models/highwaymen.json'
import d9 from './models/krielstone.json'
import d10 from './models/runebearer.json'
import d11 from './models/stone-bearer.json'
import d12 from './models/stone-scribe.json'
import d13 from './spells.json'
import d14 from './weapons.json'
import d15 from '../../lists/trl-starter-recon.json'
import d16 from '../../lists/trl-skirmish.json'

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
    { path: 'factions/trl/models/dozer-smigg.json', data: d5 },
    { path: 'factions/trl/models/gunnbjorn.json', data: d6 },
    { path: 'factions/trl/models/highwaymen-grunt.json', data: d7 },
    { path: 'factions/trl/models/highwaymen.json', data: d8 },
    { path: 'factions/trl/models/krielstone.json', data: d9 },
    { path: 'factions/trl/models/runebearer.json', data: d10 },
    { path: 'factions/trl/models/stone-bearer.json', data: d11 },
    { path: 'factions/trl/models/stone-scribe.json', data: d12 },
  ],
  'spell': [
    { path: 'factions/trl/spells.json', data: d13 },
  ],
  'weapon': [
    { path: 'factions/trl/weapons.json', data: d14 },
  ],
  'list': [
    { path: 'lists/trl-starter-recon.json', data: d15 },
    { path: 'lists/trl-skirmish.json', data: d16 },
  ],
}
