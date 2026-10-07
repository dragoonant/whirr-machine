// khaRaw: static imports of this faction's data JSON files (paths relative to src/data/).
// Add a line here when this faction gets a new JSON file; tests/data checks that none is missing.
// src/data/raw.ts spreads every faction group, so faction builders never edit raw.ts.
import type { RawGroup } from '../../raw'
import d0 from './abilities.json'
import d1 from './faction.json'
import d2 from './feats.json'
import d3 from './models/hounds-fedyniak.json'
import d4 from './models/hounds-skrobala.json'
import d5 from './models/hounds-tererya.json'
import d6 from './models/hounds.json'
import d7 from './models/lazarenko.json'
import d8 from './models/razor.json'
import d9 from './models/vilkul.json'
import d10 from './spells.json'
import d11 from './weapons.json'
import d12 from '../../lists/kha-qs-recon.json'

export const khaRaw: RawGroup = {
  'ability': [
    { path: 'factions/kha/abilities.json', data: d0 },
  ],
  'faction': [
    { path: 'factions/kha/faction.json', data: d1 },
  ],
  'feat': [
    { path: 'factions/kha/feats.json', data: d2 },
  ],
  'model': [
    { path: 'factions/kha/models/hounds-fedyniak.json', data: d3 },
    { path: 'factions/kha/models/hounds-skrobala.json', data: d4 },
    { path: 'factions/kha/models/hounds-tererya.json', data: d5 },
    { path: 'factions/kha/models/hounds.json', data: d6 },
    { path: 'factions/kha/models/lazarenko.json', data: d7 },
    { path: 'factions/kha/models/razor.json', data: d8 },
    { path: 'factions/kha/models/vilkul.json', data: d9 },
  ],
  'spell': [
    { path: 'factions/kha/spells.json', data: d10 },
  ],
  'weapon': [
    { path: 'factions/kha/weapons.json', data: d11 },
  ],
  'list': [
    { path: 'lists/kha-qs-recon.json', data: d12 },
  ],
}
