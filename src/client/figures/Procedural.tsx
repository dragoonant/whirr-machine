// Procedural SD figures (30-figures section 3): ~3 heads tall, oversized hands and weapons, heavier engines.
// Built only from the shared geometries/materials in kit.ts. Local units: y up from the top of the base disc.
import { createContext, useContext, type ReactElement } from 'react'
import type { PlayerId } from '../../engine/index'
import { GEO, partMaterial, type Archetype, type Part } from './kit'
import type { ArmyPaint } from './paintStore'

/** The army paint the bodies below wear (set by ProceduralBody). */
const PaintContext = createContext<ArmyPaint | undefined>(undefined)

interface PartProps {
  geo: keyof typeof GEO
  part: Part
  side: PlayerId
  pos: [number, number, number]
  scale: [number, number, number]
  rot?: [number, number, number]
  grey?: boolean
}
function P({ geo, part, side, pos, scale, rot, grey }: PartProps): ReactElement {
  const paint = useContext(PaintContext)
  return <mesh geometry={GEO[geo]} material={partMaterial(side, grey ? 'disabled' : part, paint)} position={pos} scale={scale} rotation={rot} castShadow />
}

export interface BodyProps { archetype: Archetype; h: number; r: number; side: PlayerId; grey: boolean; paint?: ArmyPaint }

function Trooper({ h, side, grey, withProp }: { h: number; side: PlayerId; grey: boolean; withProp?: boolean }): ReactElement {
  const g = grey
  return (
    <group>
      <P geo="box" part="dark" side={side} pos={[-0.1 * h, 0.14 * h, 0]} scale={[0.15 * h, 0.28 * h, 0.17 * h]} grey={g} />
      <P geo="box" part="dark" side={side} pos={[0.1 * h, 0.14 * h, 0]} scale={[0.15 * h, 0.28 * h, 0.17 * h]} grey={g} />
      <P geo="box" part="primary" side={side} pos={[0, 0.45 * h, 0]} scale={[0.42 * h, 0.3 * h, 0.27 * h]} grey={g} />
      <P geo="box" part="secondary" side={side} pos={[0, 0.5 * h, 0.14 * h]} scale={[0.26 * h, 0.14 * h, 0.03 * h]} grey={g} />
      <P geo="sphere" part="skin" side={side} pos={[0, 0.77 * h, 0]} scale={[0.33 * h, 0.33 * h, 0.33 * h]} grey={g} />
      <P geo="dome" part="metal" side={side} pos={[0, 0.8 * h, 0]} scale={[0.37 * h, 0.37 * h, 0.37 * h]} grey={g} />
      <P geo="sphere" part="primary" side={side} pos={[-0.29 * h, 0.45 * h, 0.04 * h]} scale={[0.17 * h, 0.17 * h, 0.17 * h]} grey={g} />
      <P geo="sphere" part="metal" side={side} pos={[0.3 * h, 0.4 * h, 0.14 * h]} scale={[0.2 * h, 0.2 * h, 0.2 * h]} grey={g} />
      <P geo="box" part="metal" side={side} pos={[0.3 * h, 0.42 * h, 0.4 * h]} scale={[0.09 * h, 0.1 * h, 0.55 * h]} grey={g} />
      {withProp && <P geo="box" part="brass" side={side} pos={[0, 0.5 * h, -0.2 * h]} scale={[0.3 * h, 0.34 * h, 0.14 * h]} grey={g} />}
      {withProp && <P geo="cyl" part="brass" side={side} pos={[0.1 * h, 0.78 * h, -0.2 * h]} scale={[0.07 * h, 0.3 * h, 0.07 * h]} grey={g} />}
    </group>
  )
}

function Caster({ h, side, grey }: { h: number; side: PlayerId; grey: boolean }): ReactElement {
  return (
    <group>
      <Trooper h={h} side={side} grey={grey} />
      <P geo="cone" part="primary" side={side} pos={[0, 0.26 * h, 0]} scale={[0.62 * h, 0.5 * h, 0.5 * h]} grey={grey} />
      <P geo="box" part="secondary" side={side} pos={[-0.3 * h, 0.58 * h, 0]} scale={[0.2 * h, 0.07 * h, 0.3 * h]} grey={grey} />
      <P geo="box" part="secondary" side={side} pos={[0.3 * h, 0.58 * h, 0]} scale={[0.2 * h, 0.07 * h, 0.3 * h]} grey={grey} />
      <P geo="cyl" part="brass" side={side} pos={[-0.38 * h, 0.55 * h, 0.1 * h]} scale={[0.05 * h, 1.05 * h, 0.05 * h]} grey={grey} />
      <P geo="sphere" part="glow" side={side} pos={[-0.38 * h, 1.1 * h, 0.1 * h]} scale={[0.14 * h, 0.14 * h, 0.14 * h]} grey={grey} />
    </group>
  )
}

function HeavyEngine({ h, r, side, grey }: { h: number; r: number; side: PlayerId; grey: boolean }): ReactElement {
  const w = r * 1.6 // hull width follows the base so heavy engines read as heavier, not just bigger
  const g = grey
  return (
    <group>
      <P geo="box" part="dark" side={side} pos={[-0.28 * w, 0.13 * h, 0]} scale={[0.34 * w, 0.26 * h, 0.4 * w]} grey={g} />
      <P geo="box" part="dark" side={side} pos={[0.28 * w, 0.13 * h, 0]} scale={[0.34 * w, 0.26 * h, 0.4 * w]} grey={g} />
      <P geo="cyl" part="primary" side={side} pos={[0, 0.5 * h, -0.05 * w]} scale={[0.82 * w, 0.46 * h, 0.82 * w]} grey={g} />
      <P geo="cyl" part="brass" side={side} pos={[0, 0.38 * h, -0.05 * w]} scale={[0.86 * w, 0.06 * h, 0.86 * w]} grey={g} />
      <P geo="cyl" part="brass" side={side} pos={[0, 0.62 * h, -0.05 * w]} scale={[0.86 * w, 0.06 * h, 0.86 * w]} grey={g} />
      <P geo="cyl" part="metal" side={side} pos={[-0.22 * w, 0.88 * h, -0.28 * w]} scale={[0.16 * w, 0.4 * h, 0.16 * w]} grey={g} />
      <P geo="cyl" part="metal" side={side} pos={[0.22 * w, 0.84 * h, -0.28 * w]} scale={[0.14 * w, 0.32 * h, 0.14 * w]} grey={g} />
      <P geo="dome" part="secondary" side={side} pos={[0, 0.7 * h, 0.3 * w]} scale={[0.4 * w, 0.4 * w, 0.4 * w]} grey={g} />
      <P geo="box" part="glow" side={side} pos={[0, 0.74 * h, 0.5 * w]} scale={[0.26 * w, 0.05 * h, 0.04 * w]} grey={g} />
      <P geo="box" part="primary" side={side} pos={[-0.62 * w, 0.42 * h, 0.2 * w]} scale={[0.34 * w, 0.4 * h, 0.5 * w]} grey={g} />
      <P geo="box" part="primary" side={side} pos={[0.62 * w, 0.42 * h, 0.2 * w]} scale={[0.34 * w, 0.4 * h, 0.5 * w]} grey={g} />
      <P geo="sphere" part="metal" side={side} pos={[-0.62 * w, 0.58 * h, -0.02 * w]} scale={[0.3 * w, 0.3 * w, 0.3 * w]} grey={g} />
      <P geo="sphere" part="metal" side={side} pos={[0.62 * w, 0.58 * h, -0.02 * w]} scale={[0.3 * w, 0.3 * w, 0.3 * w]} grey={g} />
    </group>
  )
}

function LightEngine({ h, r, side, grey }: { h: number; r: number; side: PlayerId; grey: boolean }): ReactElement {
  const w = r * 1.5
  return (
    <group>
      <P geo="box" part="dark" side={side} pos={[0, 0.15 * h, 0]} scale={[0.7 * w, 0.3 * h, 0.5 * w]} grey={grey} />
      <P geo="box" part="primary" side={side} pos={[0, 0.5 * h, 0]} scale={[0.9 * w, 0.4 * h, 0.8 * w]} grey={grey} />
      <P geo="cyl" part="metal" side={side} pos={[-0.2 * w, 0.88 * h, -0.2 * w]} scale={[0.16 * w, 0.4 * h, 0.16 * w]} grey={grey} />
      <P geo="box" part="metal" side={side} pos={[-0.55 * w, 0.45 * h, 0.2 * w]} scale={[0.2 * w, 0.2 * h, 0.5 * w]} grey={grey} />
      <P geo="box" part="metal" side={side} pos={[0.55 * w, 0.45 * h, 0.2 * w]} scale={[0.2 * w, 0.2 * h, 0.5 * w]} grey={grey} />
      <P geo="sphere" part="glow" side={side} pos={[0, 0.55 * h, 0.4 * w]} scale={[0.14 * w, 0.14 * w, 0.14 * w]} grey={grey} />
    </group>
  )
}

function Chassis({ h, r, side, grey }: { h: number; r: number; side: PlayerId; grey: boolean }): ReactElement {
  const w = r * 1.6
  return (
    <group>
      <P geo="box" part="primary" side={side} pos={[0, 0.2 * h, 0]} scale={[1.1 * w, 0.4 * h, 0.9 * w]} grey={grey} />
      <P geo="cyl" part="metal" side={side} pos={[0, 0.55 * h, 0]} scale={[0.3 * w, 0.3 * h, 0.3 * w]} grey={grey} />
      <P geo="cyl" part="brass" side={side} pos={[0, 0.65 * h, 0.4 * w]} scale={[0.14 * w, 0.8 * w, 0.14 * w]} rot={[Math.PI / 2, 0, 0]} grey={grey} />
    </group>
  )
}

export function ProceduralBody({ paint, ...props }: BodyProps): ReactElement {
  return <PaintContext.Provider value={paint}><Body {...props} /></PaintContext.Provider>
}

function Body({ archetype, h, r, side, grey }: BodyProps): ReactElement {
  switch (archetype) {
    case 'caster': return <Caster h={h} side={side} grey={grey} />
    case 'heavyEngine': return <HeavyEngine h={h} r={r} side={side} grey={grey} />
    case 'lightEngine': return <LightEngine h={h} r={r} side={side} grey={grey} />
    case 'battleEngine': case 'structure': return <Chassis h={h} r={r} side={side} grey={grey} />
    case 'solo': return <Trooper h={h} side={side} grey={grey} withProp />
    default: return <Trooper h={h} side={side} grey={grey} />
  }
}
