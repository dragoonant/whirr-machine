// cryRaw: static imports of this faction's data JSON files (paths relative to src/data/).
// Add a line here when this faction gets a new JSON file; tests/data checks that none is missing.
// src/data/raw.ts spreads every faction group, so faction builders never edit raw.ts.
import type { RawGroup } from '../../raw'
import d0 from './abilities.json'
import d1 from './faction.json'
import d2 from './feats.json'
import d3 from './models/chatterbane.json'
import d4 from './models/furies-a.json'
import d5 from './models/furies-b.json'
import d6 from './models/furies-c.json'
import d7 from './models/furies.json'
import d8 from './models/hades.json'
import d9 from './models/nekane.json'
import d10 from './spells.json'
import d11 from './weapons.json'
import d12 from '../../lists/cry-starter-recon.json'

export const cryRaw: RawGroup = {
  'ability': [
    { path: 'factions/cry/abilities.json', data: d0 },
  ],
  'faction': [
    { path: 'factions/cry/faction.json', data: d1 },
  ],
  'feat': [
    { path: 'factions/cry/feats.json', data: d2 },
  ],
  'model': [
    { path: 'factions/cry/models/chatterbane.json', data: d3 },
    { path: 'factions/cry/models/furies-a.json', data: d4 },
    { path: 'factions/cry/models/furies-b.json', data: d5 },
    { path: 'factions/cry/models/furies-c.json', data: d6 },
    { path: 'factions/cry/models/furies.json', data: d7 },
    { path: 'factions/cry/models/hades.json', data: d8 },
    { path: 'factions/cry/models/nekane.json', data: d9 },
  ],
  'spell': [
    { path: 'factions/cry/spells.json', data: d10 },
  ],
  'weapon': [
    { path: 'factions/cry/weapons.json', data: d11 },
  ],
  'list': [
    { path: 'lists/cry-starter-recon.json', data: d12 },
  ],
}
