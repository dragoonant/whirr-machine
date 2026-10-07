// The shared building block of the procedural figures: one mesh from the shared geometry and (side, part) material kit.
import { createContext, useContext, type ReactElement } from 'react'
import type { PlayerId } from '../../engine/index'
import { GEO, partMaterial, type Part } from './kit'
import type { ArmyPaint } from './paintStore'

/** The army paint the bodies wear (set by ProceduralBody). */
export const PaintContext = createContext<ArmyPaint | undefined>(undefined)

export interface PartProps {
  geo: keyof typeof GEO
  part: Part
  side: PlayerId
  pos: [number, number, number]
  scale: [number, number, number]
  rot?: [number, number, number]
  grey?: boolean
}
export function P({ geo, part, side, pos, scale, rot, grey }: PartProps): ReactElement {
  const paint = useContext(PaintContext)
  return <mesh geometry={GEO[geo]} material={partMaterial(side, grey ? 'disabled' : part, paint)} position={pos} scale={scale} rotation={rot} castShadow />
}

export interface CreatureProps { h: number; r: number; side: PlayerId; grey: boolean }
