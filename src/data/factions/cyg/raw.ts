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
import d8 from './models/courser-sg.json'
import d9 from './models/deuce.json'
import d10 from './models/falk.json'
import d11 from './models/storm-vane.json'
import d12 from './models/storm-vanes.json'
import d13 from './models/tempest-assailer.json'
import d14 from './models/tempest-assailers.json'
import d15 from './spells.json'
import d16 from './weapons.json'
import d17 from '../../lists/cyg-qs-recon.json'
import d18 from '../../lists/cyg-skirmish.json'

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
    { path: 'factions/cyg/models/courser-sg.json', data: d8 },
    { path: 'factions/cyg/models/deuce.json', data: d9 },
    { path: 'factions/cyg/models/falk.json', data: d10 },
    { path: 'factions/cyg/models/storm-vane.json', data: d11 },
    { path: 'factions/cyg/models/storm-vanes.json', data: d12 },
    { path: 'factions/cyg/models/tempest-assailer.json', data: d13 },
    { path: 'factions/cyg/models/tempest-assailers.json', data: d14 },
  ],
  'spell': [
    { path: 'factions/cyg/spells.json', data: d15 },
  ],
  'weapon': [
    { path: 'factions/cyg/weapons.json', data: d16 },
  ],
  'list': [
    { path: 'lists/cyg-qs-recon.json', data: d17 },
    { path: 'lists/cyg-skirmish.json', data: d18 },
  ],
}
