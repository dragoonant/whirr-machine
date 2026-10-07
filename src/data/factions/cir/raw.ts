// cirRaw: static imports of this faction's data JSON files (paths relative to src/data/).
// Add a line here when this faction gets a new JSON file; tests/data checks that none is missing.
// src/data/raw.ts spreads every faction group, so faction builders never edit raw.ts.
import type { RawGroup } from '../../raw'
import d0 from './abilities.json'
import d1 from './faction.json'
import d2 from './feats.json'
import d3 from './models/lord-of-the-feast.json'
import d4 from './models/pureblood.json'
import d5 from './models/ravager-1.json'
import d6 from './models/ravager-2.json'
import d7 from './models/ravager-3.json'
import d8 from './models/ravager-shaman.json'
import d9 from './models/ravagers.json'
import d10 from './models/tanith.json'
import d11 from './models/wild-argus.json'
import d12 from './models/wolf-rider.json'
import d13 from './models/wolf-riders.json'
import d14 from './spells.json'
import d15 from './weapons.json'
import d16 from '../../lists/cir-skirmish.json'
import d17 from '../../lists/cir-starter-recon.json'

export const cirRaw: RawGroup = {
  'ability': [
    { path: 'factions/cir/abilities.json', data: d0 },
  ],
  'faction': [
    { path: 'factions/cir/faction.json', data: d1 },
  ],
  'feat': [
    { path: 'factions/cir/feats.json', data: d2 },
  ],
  'model': [
    { path: 'factions/cir/models/lord-of-the-feast.json', data: d3 },
    { path: 'factions/cir/models/pureblood.json', data: d4 },
    { path: 'factions/cir/models/ravager-1.json', data: d5 },
    { path: 'factions/cir/models/ravager-2.json', data: d6 },
    { path: 'factions/cir/models/ravager-3.json', data: d7 },
    { path: 'factions/cir/models/ravager-shaman.json', data: d8 },
    { path: 'factions/cir/models/ravagers.json', data: d9 },
    { path: 'factions/cir/models/tanith.json', data: d10 },
    { path: 'factions/cir/models/wild-argus.json', data: d11 },
    { path: 'factions/cir/models/wolf-rider.json', data: d12 },
    { path: 'factions/cir/models/wolf-riders.json', data: d13 },
  ],
  'spell': [
    { path: 'factions/cir/spells.json', data: d14 },
  ],
  'weapon': [
    { path: 'factions/cir/weapons.json', data: d15 },
  ],
  'list': [
    { path: 'lists/cir-skirmish.json', data: d16 },
    { path: 'lists/cir-starter-recon.json', data: d17 },
  ],
}
