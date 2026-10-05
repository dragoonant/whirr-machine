// Static imports of every data JSON file, so loading works in Vite, vitest and tsx alike.
// Add a line here (and to the right group) when a new JSON data file is created; tests/data checks none is missing.
import d0 from './core/abilities.json'
import d1 from './core/qualities.json'
import d2 from './core/systems.json'
import d3 from './factions/cyg/abilities.json'
import d4 from './factions/cyg/faction.json'
import d5 from './factions/cyg/feats.json'
import d6 from './factions/cyg/models/black13-glover.json'
import d7 from './factions/cyg/models/black13-ryan.json'
import d8 from './factions/cyg/models/black13-watts.json'
import d9 from './factions/cyg/models/black13.json'
import d10 from './factions/cyg/models/caine.json'
import d11 from './factions/cyg/models/deuce.json'
import d12 from './factions/cyg/models/falk.json'
import d13 from './factions/cyg/spells.json'
import d14 from './factions/cyg/weapons.json'
import d15 from './factions/kha/abilities.json'
import d16 from './factions/kha/faction.json'
import d17 from './factions/kha/feats.json'
import d18 from './factions/kha/models/hounds-fedyniak.json'
import d19 from './factions/kha/models/hounds-skrobala.json'
import d20 from './factions/kha/models/hounds-tererya.json'
import d21 from './factions/kha/models/hounds.json'
import d22 from './factions/kha/models/lazarenko.json'
import d23 from './factions/kha/models/razor.json'
import d24 from './factions/kha/models/vilkul.json'
import d25 from './factions/kha/spells.json'
import d26 from './factions/kha/weapons.json'
import d27 from './lists/cyg-qs-recon.json'
import d28 from './lists/kha-qs-recon.json'
import d29 from './scenarios/ashwall-divide.json'
import d30 from './scenarios/qs-demo.json'
import d31 from './terrain/layouts/ashwall-divide.json'
import d32 from './terrain/pieces.json'

export interface RawFile { path: string; data: unknown }
export const RAW: Record<string, RawFile[]> = {
  'ability': [
    { path: 'core/abilities.json', data: d0 },
    { path: 'core/qualities.json', data: d1 },
    { path: 'factions/cyg/abilities.json', data: d3 },
    { path: 'factions/kha/abilities.json', data: d15 },
  ],
  'systems': [
    { path: 'core/systems.json', data: d2 },
  ],
  'faction': [
    { path: 'factions/cyg/faction.json', data: d4 },
    { path: 'factions/kha/faction.json', data: d16 },
  ],
  'feat': [
    { path: 'factions/cyg/feats.json', data: d5 },
    { path: 'factions/kha/feats.json', data: d17 },
  ],
  'model': [
    { path: 'factions/cyg/models/black13-glover.json', data: d6 },
    { path: 'factions/cyg/models/black13-ryan.json', data: d7 },
    { path: 'factions/cyg/models/black13-watts.json', data: d8 },
    { path: 'factions/cyg/models/black13.json', data: d9 },
    { path: 'factions/cyg/models/caine.json', data: d10 },
    { path: 'factions/cyg/models/deuce.json', data: d11 },
    { path: 'factions/cyg/models/falk.json', data: d12 },
    { path: 'factions/kha/models/hounds-fedyniak.json', data: d18 },
    { path: 'factions/kha/models/hounds-skrobala.json', data: d19 },
    { path: 'factions/kha/models/hounds-tererya.json', data: d20 },
    { path: 'factions/kha/models/hounds.json', data: d21 },
    { path: 'factions/kha/models/lazarenko.json', data: d22 },
    { path: 'factions/kha/models/razor.json', data: d23 },
    { path: 'factions/kha/models/vilkul.json', data: d24 },
  ],
  'spell': [
    { path: 'factions/cyg/spells.json', data: d13 },
    { path: 'factions/kha/spells.json', data: d25 },
  ],
  'weapon': [
    { path: 'factions/cyg/weapons.json', data: d14 },
    { path: 'factions/kha/weapons.json', data: d26 },
  ],
  'list': [
    { path: 'lists/cyg-qs-recon.json', data: d27 },
    { path: 'lists/kha-qs-recon.json', data: d28 },
  ],
  'scenario': [
    { path: 'scenarios/ashwall-divide.json', data: d29 },
    { path: 'scenarios/qs-demo.json', data: d30 },
  ],
  'terrain-layout': [
    { path: 'terrain/layouts/ashwall-divide.json', data: d31 },
  ],
  'terrain': [
    { path: 'terrain/pieces.json', data: d32 },
  ],
}
