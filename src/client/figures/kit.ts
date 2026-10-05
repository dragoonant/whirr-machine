// Shared geometries and materials for every procedural figure (50 §11): one BufferGeometry per part type, one
// material per (side, part). Figures only set transforms. Nothing here touches the rules.
import * as THREE from 'three'
import type { ModelState, ModelType, PlayerId } from '../../engine/index'
import { baseRadius } from '../../engine/geometry'
import { SIDE_COLOURS } from '../board/layout'
import { paintKey, type ArmyPaint } from './paintStore'

export type Archetype = 'caster' | 'heavyEngine' | 'lightEngine' | 'solo' | 'trooper' | 'battleEngine' | 'structure'

/** Pick a procedural archetype from the model's rules type (and the profile's figure.archetype when it names one). */
export function archetypeOf(type: ModelType, hint?: string): Archetype {
  switch (hint) {
    case 'heavyEngine': case 'superHeavyEngine': case 'colossal': return 'heavyEngine'
    case 'lightEngine': return 'lightEngine'
    case 'caster': return 'caster'
    case 'battleEngine': return 'battleEngine'
    case 'structure': return 'structure'
    case 'solo': return 'solo'
    case 'infantry': return 'trooper'
    default: break
  }
  switch (type) {
    case 'leader': return 'caster'
    case 'warEngine': return 'heavyEngine'
    case 'battleEngine': return 'battleEngine'
    case 'structure': return 'structure'
    case 'solo': return 'solo'
    default: return 'trooper'
  }
}

/** Mesh heights (30-figures section 2) by base size. */
export const MESH_HEIGHT: Record<number, number> = { 30: 1.25, 40: 1.8, 50: 2.45, 80: 3.2, 120: 4.5 }
export const meshHeight = (baseMm: number, archetype: Archetype): number => {
  const h = MESH_HEIGHT[baseMm] ?? 1.25
  return archetype === 'caster' ? h * 1.05 : h
}
/** Base-disc radius for a model. */
export const baseRadiusOf = (m: Pick<ModelState, 'base'>): number => baseRadius(m.base)

// ---------- geometries (unit-sized; scaled by the mesh transform) ----------
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  cone: new THREE.ConeGeometry(0.5, 1, 14),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  dome: new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  ring: new THREE.RingGeometry(0.92, 1, 40),
  disc: new THREE.CircleGeometry(1, 40),
  torus: new THREE.TorusGeometry(1, 0.035, 6, 36),
  plane: new THREE.PlaneGeometry(1, 1),
}

// ---------- materials ----------
const cache = new Map<string, THREE.Material>()
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = cache.get(key)
  if (!m) { m = make(); cache.set(key, m) }
  return m
}
export type Part = 'primary' | 'secondary' | 'metal' | 'brass' | 'dark' | 'glow' | 'skin' | 'disabled'
const PART_COLOUR = (side: PlayerId, part: Part): string => {
  switch (part) {
    case 'primary': return SIDE_COLOURS[side].primary
    case 'secondary': return SIDE_COLOURS[side].secondary
    case 'metal': return '#8d9199'
    case 'brass': return '#b87333'
    case 'dark': return '#23252a'
    case 'glow': return '#ffd866'
    case 'skin': return '#d8b99a'
    case 'disabled': return '#5a5c60'
  }
}
/** Army-painter colour for a part, or the side's stock colour. Only primary and secondary are repainted. */
const paintedColour = (side: PlayerId, part: Part, paint?: ArmyPaint): string =>
  (part === 'primary' && paint?.primary) || (part === 'secondary' && paint?.secondary) || PART_COLOUR(side, part)
export function partMaterial(side: PlayerId, part: Part, paint?: ArmyPaint): THREE.Material {
  const pk = part === 'primary' || part === 'secondary' ? paintKey(paint) : ''
  return mat(`${side}:${part}:${pk}`, () => new THREE.MeshStandardMaterial({
    color: paintedColour(side, part, paint), roughness: part === 'metal' ? 0.45 : 0.7, metalness: part === 'metal' || part === 'brass' ? 0.6 : 0.1,
    ...(part === 'glow' ? { emissive: '#ffb830', emissiveIntensity: 1.2 } : {}),
  }))
}
export const BASE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.9, metalness: 0 })
export const HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false })
export const shellMaterial = new THREE.MeshBasicMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.22, depthWrite: false })
export const iceMaterial = new THREE.MeshStandardMaterial({ color: '#bfeaff', emissive: '#5fb8e8', emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 })
export function lineMaterial(key: string, color: string, opacity = 1): THREE.MeshBasicMaterial {
  return mat(`line:${key}:${color}:${opacity}`, () => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false })) as THREE.MeshBasicMaterial
}

/** Fraction of damage boxes filled, for the little health bar. Plain counting of the model's own boxes (display only). */
export function damageFraction(m: Pick<ModelState, 'damage'>): number {
  const d = m.damage
  if (d.track === 'single') return d.boxes > 0 ? Math.min(1, d.filled / d.boxes) : 0
  let total = 0, filled = 0
  for (const g of d.grids) for (const col of g.cols) for (const b of col) { total++; if (b) filled++ }
  return total ? filled / total : 0
}
