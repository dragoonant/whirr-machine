// cygRaw: static imports of this faction's data JSON files (paths relative to src/data/).
// Add a line here when this faction gets a new JSON file; tests/data checks that none is missing.
// src/data/raw.ts spreads every faction group, so faction builders never edit raw.ts.
import type { RawGroup } from '../../raw'
import d0 from './abilities.json'
import d1 from './faction.json'
import d2 from './feats.json'
import d3 from './models/black13-glover.json'
import d4 from './models/black13-ryan.json'
import d5 from './models/black13-watts.json'
import d6 from './models/black13.json'
import d7 from './models/caine.json'
import d8 from './models/deuce.json'
import d9 from './models/falk.json'
import d10 from './spells.json'
import d11 from './weapons.json'
import d12 from '../../lists/cyg-qs-recon.json'

export const cygRaw: RawGroup = {
  'ability': [
    { path: 'factions/cyg/abilities.json', data: d0 },
  ],
  'faction': [
    { path: 'factions/cyg/faction.json', data: d1 },
  ],
  'feat': [
    { path: 'factions/cyg/feats.json', data: d2 },
  ],
  'model': [
    { path: 'factions/cyg/models/black13-glover.json', data: d3 },
    { path: 'factions/cyg/models/black13-ryan.json', data: d4 },
    { path: 'factions/cyg/models/black13-watts.json', data: d5 },
    { path: 'factions/cyg/models/black13.json', data: d6 },
    { path: 'factions/cyg/models/caine.json', data: d7 },
    { path: 'factions/cyg/models/deuce.json', data: d8 },
    { path: 'factions/cyg/models/falk.json', data: d9 },
  ],
  'spell': [
    { path: 'factions/cyg/spells.json', data: d10 },
  ],
  'weapon': [
    { path: 'factions/cyg/weapons.json', data: d11 },
  ],
  'list': [
    { path: 'lists/cyg-qs-recon.json', data: d12 },
  ],
}
