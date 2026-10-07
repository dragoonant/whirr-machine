// Placeholder creatures for the M9 factions (until their GLBs arrive): warbeasts that read as beasts (hunched, big arms
// and claws, no boiler), Circle warpwolf and woldwarden variants, skeletal Cryx bone-jacks and tall robed Menoth
// crusader-jacks, and a wraith. All built from the shared kit parts; front is +z, y up from the top of the base.
import type { ReactElement } from 'react'
import { P, type CreatureProps } from './proceduralPart'

const HALF_PI = Math.PI / 2

/** Three claws at the end of an arm, pointing forward. */
function Claws({ x, y, z, s, side, grey }: { x: number; y: number; z: number; s: number; side: CreatureProps['side']; grey: boolean }): ReactElement {
  return (
    <>
      {[-1, 0, 1].map((i) => (
        <P key={i} geo="cone" part="bone" side={side} pos={[x + i * 0.13 * s, y, z]} rot={[HALF_PI, 0, 0]} scale={[0.07 * s, 0.34 * s, 0.07 * s]} grey={grey} />
      ))}
    </>
  )
}

/** Shared hunched beast frame: hind legs, forward-tilted torso, hump, long arms with big fists and claws. */
function BeastFrame({ h, r, side, grey, long }: CreatureProps & { long?: boolean }): ReactElement {
  const w = r * 1.5
  const g = grey
  const len = long ? 1.0 : 0.8
  return (
    <group>
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <P geo="box" part="fur" side={side} pos={[sx * 0.34 * w, 0.17 * h, -0.34 * w]} scale={[0.3 * w, 0.34 * h, 0.36 * w]} grey={g} />
          <P geo="box" part="dark" side={side} pos={[sx * 0.34 * w, 0.03 * h, -0.2 * w]} scale={[0.32 * w, 0.06 * h, 0.55 * w]} grey={g} />
          {/* long arm hanging forward, big fist, claws */}
          <P geo="capsule" part="fur" side={side} pos={[sx * 0.66 * w, 0.42 * h, 0.42 * w]} rot={[0.3, 0, -sx * 0.12]} scale={[0.3 * w, 0.2 * h, 0.3 * w]} grey={g} />
          <P geo="sphere" part="fur" side={side} pos={[sx * 0.7 * w, 0.12 * h, 0.66 * w]} scale={[0.46 * w, 0.4 * w, 0.46 * w]} grey={g} />
          <Claws x={sx * 0.7 * w} y={0.08 * h} z={0.92 * w} s={w} side={side} grey={g} />
        </group>
      ))}
      <P geo="capsule" part="primary" side={side} pos={[0, 0.5 * h, -0.05 * w]} rot={[HALF_PI - 0.5, 0, 0]} scale={[0.78 * w, len * w, 0.78 * w]} grey={g} />
      <P geo="sphere" part="primary" side={side} pos={[0, 0.74 * h, 0.3 * w]} scale={[0.95 * w, 0.46 * h, 0.78 * w]} grey={g} />
      <P geo="box" part="secondary" side={side} pos={[0, 0.5 * h, -0.5 * w]} rot={[-0.3, 0, 0]} scale={[0.5 * w, 0.06 * h, 0.9 * w]} grey={g} />
    </group>
  )
}

/** A generic warbeast: heavy brow, horns, jaw and glowing eyes on the hunched frame. */
export function Beast({ h, r, side, grey }: CreatureProps): ReactElement {
  const w = r * 1.5
  const g = grey
  return (
    <group>
      <BeastFrame h={h} r={r} side={side} grey={g} />
      <P geo="sphere" part="fur" side={side} pos={[0, 0.62 * h, 0.84 * w]} scale={[0.56 * w, 0.46 * w, 0.54 * w]} grey={g} />
      <P geo="box" part="bone" side={side} pos={[0, 0.5 * h, 1.0 * w]} scale={[0.4 * w, 0.1 * h, 0.3 * w]} grey={g} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <P geo="cone" part="bone" side={side} pos={[sx * 0.26 * w, 0.8 * h, 0.8 * w]} rot={[0, 0, -sx * 0.55]} scale={[0.09 * w, 0.26 * h, 0.09 * w]} grey={g} />
          <P geo="sphere" part="glow" side={side} pos={[sx * 0.14 * w, 0.66 * h, 1.08 * w]} scale={[0.09 * w, 0.09 * w, 0.09 * w]} grey={g} />
        </group>
      ))}
    </group>
  )
}

/** Circle warpwolf: the beast frame with a wolf head (snout, ears), a mane of spines and a tail. */
export function Warpwolf({ h, r, side, grey }: CreatureProps): ReactElement {
  const w = r * 1.5
  const g = grey
  return (
    <group>
      <BeastFrame h={h} r={r} side={side} grey={g} long />
      <P geo="sphere" part="fur" side={side} pos={[0, 0.62 * h, 0.8 * w]} scale={[0.46 * w, 0.4 * w, 0.5 * w]} grey={g} />
      <P geo="box" part="fur" side={side} pos={[0, 0.56 * h, 1.12 * w]} scale={[0.26 * w, 0.2 * w, 0.5 * w]} grey={g} />
      <P geo="box" part="bone" side={side} pos={[0, 0.5 * h, 1.12 * w]} scale={[0.24 * w, 0.05 * h, 0.46 * w]} grey={g} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <P geo="cone" part="dark" side={side} pos={[sx * 0.2 * w, 0.8 * h, 0.7 * w]} rot={[0, 0, -sx * 0.25]} scale={[0.14 * w, 0.26 * h, 0.1 * w]} grey={g} />
          <P geo="sphere" part="ember" side={side} pos={[sx * 0.14 * w, 0.66 * h, 1.04 * w]} scale={[0.09 * w, 0.09 * w, 0.09 * w]} grey={g} />
        </group>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <P key={i} geo="cone" part="dark" side={side} pos={[0, (0.86 - i * 0.05) * h, (0.3 - i * 0.3) * w]} rot={[-0.35, 0, 0]} scale={[0.12 * w, 0.22 * h, 0.12 * w]} grey={g} />
      ))}
      <P geo="cone" part="fur" side={side} pos={[0, 0.34 * h, -0.95 * w]} rot={[-HALF_PI - 0.4, 0, 0]} scale={[0.16 * w, 0.8 * w, 0.16 * w]} grey={g} />
    </group>
  )
}

/** Circle woldwarden: an upright tree-and-stone colossus with branch arms and an ember glow in its hollow face. */
export function Woldwarden({ h, r, side, grey }: CreatureProps): ReactElement {
  const w = r * 1.4
  const g = grey
  return (
    <group>
      <P geo="cyl" part="fur" side={side} pos={[0, 0.2 * h, 0]} scale={[0.9 * w, 0.4 * h, 0.8 * w]} grey={g} />
      <P geo="cyl" part="dark" side={side} pos={[0, 0.55 * h, 0]} scale={[1.2 * w, 0.4 * h, 1.0 * w]} grey={g} />
      <P geo="sphere" part="primary" side={side} pos={[0, 0.84 * h, 0]} scale={[1.5 * w, 0.4 * h, 1.3 * w]} grey={g} />
      <P geo="box" part="ember" side={side} pos={[0, 0.58 * h, 0.5 * w]} scale={[0.4 * w, 0.1 * h, 0.1 * w]} grey={g} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <P geo="cyl" part="fur" side={side} pos={[sx * 0.9 * w, 0.5 * h, 0.2 * w]} rot={[0.25, 0, sx * 0.4]} scale={[0.34 * w, 0.62 * h, 0.34 * w]} grey={g} />
          <P geo="cone" part="bone" side={side} pos={[sx * 1.08 * w, 0.2 * h, 0.5 * w]} rot={[HALF_PI, 0, 0]} scale={[0.14 * w, 0.5 * w, 0.14 * w]} grey={g} />
          <P geo="cone" part="fur" side={side} pos={[sx * 0.7 * w, 0.95 * h, 0]} rot={[0, 0, -sx * 0.9]} scale={[0.14 * w, 0.4 * h, 0.14 * w]} grey={g} />
        </group>
      ))}
    </group>
  )
}

/** Cryx bone-jack: a skeletal frame (skull, ribs, spine, bone claws and tusks) with a glowing soul cannon. */
export function BoneJack({ h, r, side, grey }: CreatureProps): ReactElement {
  const w = r * 1.6
  const g = grey
  return (
    <group>
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <P geo="cyl" part="bone" side={side} pos={[sx * 0.3 * w, 0.2 * h, 0]} scale={[0.12 * w, 0.4 * h, 0.12 * w]} grey={g} />
          <P geo="sphere" part="metal" side={side} pos={[sx * 0.3 * w, 0.4 * h, 0]} scale={[0.2 * w, 0.2 * w, 0.2 * w]} grey={g} />
          <P geo="box" part="bone" side={side} pos={[sx * 0.3 * w, 0.02 * h, 0.14 * w]} scale={[0.26 * w, 0.05 * h, 0.5 * w]} grey={g} />
        </group>
      ))}
      <P geo="box" part="dark" side={side} pos={[0, 0.46 * h, 0]} scale={[0.9 * w, 0.14 * h, 0.5 * w]} grey={g} />
      <P geo="cyl" part="bone" side={side} pos={[0, 0.66 * h, -0.1 * w]} scale={[0.1 * w, 0.4 * h, 0.1 * w]} grey={g} />
      {[0, 1, 2, 3].map((i) => (
        <P key={i} geo="torus" part="bone" side={side} pos={[0, (0.56 + i * 0.08) * h, -0.05 * w]} rot={[HALF_PI, 0, 0]} scale={[(0.62 - i * 0.05) * w, (0.45 - i * 0.04) * w, 2.4]} grey={g} />
      ))}
      <P geo="sphere" part="primary" side={side} pos={[0, 0.7 * h, -0.05 * w]} scale={[0.34 * w, 0.2 * h, 0.3 * w]} grey={g} />
      <P geo="sphere" part="bone" side={side} pos={[0, 0.9 * h, 0.2 * w]} scale={[0.5 * w, 0.4 * w, 0.46 * w]} grey={g} />
      <P geo="box" part="bone" side={side} pos={[0, 0.8 * h, 0.4 * w]} scale={[0.3 * w, 0.08 * h, 0.3 * w]} grey={g} />
      {[-1, 1].map((sx) => (
        <group key={`f${sx}`}>
          <P geo="sphere" part="ember" side={side} pos={[sx * 0.12 * w, 0.93 * h, 0.4 * w]} scale={[0.1 * w, 0.1 * w, 0.1 * w]} grey={g} />
          <P geo="cone" part="bone" side={side} pos={[sx * 0.2 * w, 0.76 * h, 0.5 * w]} rot={[HALF_PI + 0.4, 0, 0]} scale={[0.07 * w, 0.4 * w, 0.07 * w]} grey={g} />
        </group>
      ))}
      {/* left: death claw, right: soul cannon */}
      <P geo="cyl" part="bone" side={side} pos={[-0.62 * w, 0.58 * h, 0.15 * w]} rot={[0.5, 0, 0.2]} scale={[0.12 * w, 0.5 * h, 0.12 * w]} grey={g} />
      {[-1, 0, 1].map((i) => (
        <P key={i} geo="cone" part="bone" side={side} pos={[-0.62 * w + i * 0.12 * w, 0.4 * h, 0.5 * w]} rot={[HALF_PI + 0.2, 0, 0]} scale={[0.07 * w, 0.5 * w, 0.07 * w]} grey={g} />
      ))}
      <P geo="cyl" part="metal" side={side} pos={[0.66 * w, 0.58 * h, 0.35 * w]} rot={[HALF_PI, 0, 0]} scale={[0.3 * w, 0.9 * w, 0.3 * w]} grey={g} />
      <P geo="cyl" part="glow" side={side} pos={[0.66 * w, 0.58 * h, 0.82 * w]} rot={[HALF_PI, 0, 0]} scale={[0.2 * w, 0.1 * w, 0.2 * w]} grey={g} />
    </group>
  )
}

/** Menoth crusader-jack: a tall robed frame (long skirt, cowl, brass pauldrons) with a flame belcher and a star mace. */
export function CrusaderJack({ h, r, side, grey }: CreatureProps): ReactElement {
  const w = r * 1.5
  const g = grey
  return (
    <group>
      <P geo="cone" part="primary" side={side} pos={[0, 0.3 * h, 0]} scale={[1.25 * w, 0.6 * h, 1.05 * w]} grey={g} />
      <P geo="cyl" part="secondary" side={side} pos={[0, 0.08 * h, 0]} scale={[1.2 * w, 0.06 * h, 1.0 * w]} grey={g} />
      <P geo="box" part="primary" side={side} pos={[0, 0.66 * h, 0]} scale={[0.8 * w, 0.34 * h, 0.5 * w]} grey={g} />
      <P geo="box" part="secondary" side={side} pos={[0, 0.62 * h, 0.27 * w]} scale={[0.2 * w, 0.4 * h, 0.04 * w]} grey={g} />
      <P geo="dome" part="metal" side={side} pos={[0, 0.8 * h, 0]} scale={[0.4 * w, 0.4 * w, 0.4 * w]} grey={g} />
      <P geo="cone" part="primary" side={side} pos={[0, 0.9 * h, -0.05 * w]} scale={[0.5 * w, 0.28 * h, 0.5 * w]} grey={g} />
      <P geo="box" part="ember" side={side} pos={[0, 0.84 * h, 0.2 * w]} scale={[0.22 * w, 0.04 * h, 0.04 * w]} grey={g} />
      {[-1, 1].map((sx) => (
        <P key={sx} geo="sphere" part="brass" side={side} pos={[sx * 0.5 * w, 0.78 * h, 0]} scale={[0.34 * w, 0.28 * w, 0.34 * w]} grey={g} />
      ))}
      {/* left: flame belcher; right: blazing star mace */}
      <P geo="cyl" part="metal" side={side} pos={[-0.55 * w, 0.62 * h, 0.4 * w]} rot={[HALF_PI, 0, 0]} scale={[0.22 * w, 0.9 * w, 0.22 * w]} grey={g} />
      <P geo="sphere" part="ember" side={side} pos={[-0.55 * w, 0.62 * h, 0.9 * w]} scale={[0.2 * w, 0.2 * w, 0.2 * w]} grey={g} />
      <P geo="cyl" part="brass" side={side} pos={[0.62 * w, 0.52 * h, 0.2 * w]} rot={[0.3, 0, 0]} scale={[0.1 * w, 0.8 * h, 0.1 * w]} grey={g} />
      <P geo="sphere" part="brass" side={side} pos={[0.62 * w, 0.84 * h, 0.4 * w]} scale={[0.3 * w, 0.3 * w, 0.3 * w]} grey={g} />
      <P geo="sphere" part="ember" side={side} pos={[0.62 * w, 0.84 * h, 0.4 * w]} scale={[0.18 * w, 0.18 * w, 0.18 * w]} grey={g} />
    </group>
  )
}

/** Wraith: a tapering ghostly body with no legs, a skull face and long clawed arms. */
export function Wraith({ h, side, grey }: CreatureProps): ReactElement {
  const w = h * 0.5
  const g = grey
  return (
    <group>
      <P geo="cone" part="primary" side={side} pos={[0, 0.34 * h, 0]} rot={[Math.PI, 0, 0]} scale={[0.5 * w, 0.68 * h, 0.4 * w]} grey={g} />
      <P geo="sphere" part="primary" side={side} pos={[0, 0.7 * h, 0]} scale={[0.6 * w, 0.4 * h, 0.4 * w]} grey={g} />
      <P geo="sphere" part="bone" side={side} pos={[0, 0.84 * h, 0.08 * w]} scale={[0.34 * w, 0.28 * h, 0.32 * w]} grey={g} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <P geo="sphere" part="ember" side={side} pos={[sx * 0.08 * w, 0.86 * h, 0.26 * w]} scale={[0.07 * w, 0.07 * w, 0.07 * w]} grey={g} />
          <P geo="cyl" part="primary" side={side} pos={[sx * 0.46 * w, 0.58 * h, 0.2 * w]} rot={[HALF_PI - 0.4, 0, sx * 0.3]} scale={[0.1 * w, 0.5 * h, 0.1 * w]} grey={g} />
          {[-1, 0, 1].map((i) => (
            <P key={i} geo="cone" part="bone" side={side} pos={[sx * 0.5 * w + i * 0.08 * w, 0.46 * h, 0.52 * w]} rot={[HALF_PI + 0.2, 0, 0]} scale={[0.04 * w, 0.3 * w, 0.04 * w]} grey={g} />
          ))}
        </group>
      ))}
    </group>
  )
}
