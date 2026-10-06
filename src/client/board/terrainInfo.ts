// Terrain tooltip text, in our own words, from the engine's own traits for the piece (never a rules number of ours:
// the +2 / +4 values restate R6.11 and match what query.los reports).
import type { TerrainInstance } from '../../engine/index'
import { terrainTraits } from '../../engine/terrain'

export interface TerrainInfo { kind: string; lines: string[] }

const KIND: Record<string, string> = {
  obstacle: 'Obstacle', obstruction: 'Obstruction', building: 'Building', forest: 'Forest', shallowWater: 'Shallow water', deepWater: 'Deep water',
  rough: 'Rough ground', rubble: 'Rubble', hill: 'Hill', trench: 'Trench', hazard: 'Hazard',
}

export function terrainInfo(t: TerrainInstance): TerrainInfo {
  const tr = terrainTraits(t)
  const lines: string[] = []
  switch (tr.type) {
    case 'obstacle':
      lines.push('Low enough to step over, but a model needs enough movement left to end up fully past it.')
      lines.push(tr.cover === 'concealment'
        ? 'See-through: a model tucked right behind it gains concealment (+2 DEF against ranged and arcane attacks).'
        : 'A model tucked right behind it gains cover (+4 DEF against ranged and arcane attacks).')
      break
    case 'obstruction':
    case 'building':
      lines.push('Impassable, and it blocks line of sight by its height.')
      lines.push('A model standing right beside it can claim cover (+4 DEF against ranged and arcane attacks).')
      break
    case 'forest':
      lines.push('Rough ground: entering it costs 2" of the advance.')
      lines.push('A model completely inside gains concealment (+2 DEF). Thick stands block sight to what lies beyond.')
      break
    case 'shallowWater':
    case 'rough':
      lines.push('Rough ground: entering it costs 2" of the advance. It never blocks sight and gives no cover.')
      break
    case 'rubble':
      lines.push('Rough ground: entering it costs 2" of the advance.')
      lines.push('A model completely inside gains cover (+4 DEF against ranged and arcane attacks).')
      break
    case 'hill':
      lines.push(`Open to walk on. A model completely on it stands ${tr.elevation}" higher: +2 DEF against attackers below.`)
      lines.push('A tall hill can block lines of sight.')
      break
    case 'hazard':
      lines.push(t.props['hazard']
        ? 'Dangerous ground: entering it, or ending an activation inside it, risks damage.'
        : 'Marked as dangerous ground, but its damage is not yet active in the rules.')
      break
    case 'deepWater':
      lines.push('Impassable.')
      break
    case 'trench':
      lines.push('Open ground for now: no movement or cover rules apply yet.')
      break
    default:
      lines.push('Open ground.')
  }
  if (t.rulesType === 'scenarioTerrain') lines.push('Scenario terrain: the scenario gives it a job too.')
  return { kind: KIND[tr.type] ?? 'Terrain', lines }
}
