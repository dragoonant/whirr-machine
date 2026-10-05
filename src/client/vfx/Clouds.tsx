// Cloud effects as translucent smoke domes (30-figures section 5). Diameter comes from the engine's Cloud.
import { useRef, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePresentedState } from '../contract'
import { GEO } from '../figures/kit'

const SMOKE = new THREE.MeshStandardMaterial({ color: '#b9bcc2', transparent: true, opacity: 0.32, roughness: 1, depthWrite: false })
const HAZARD = new THREE.MeshStandardMaterial({ color: '#d1603a', transparent: true, opacity: 0.3, roughness: 1, depthWrite: false })
const FLARE = new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.25, depthWrite: false })
const RIM = new THREE.MeshBasicMaterial({ color: '#c9a227', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })

export function Clouds(): ReactElement | null {
  const state = usePresentedState()
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = group.current
    if (!g) return
    const t = performance.now() / 1200
    g.children.forEach((c, i) => { const k = 1 + Math.sin(t + i) * 0.025; c.scale.setScalar(k) })
  })
  if (!state || state.clouds.length === 0) return null
  return (
    <group ref={group}>
      {state.clouds.map((c) => {
        const r = c.diameter / 2
        const mat = c.kind === 'hazard' ? HAZARD : c.kind === 'flare' ? FLARE : SMOKE
        return (
          <group key={c.id} position={[c.pos.x, 0, c.pos.z]}>
            <mesh geometry={GEO.dome} material={mat} scale={[r * 2, r * 2, r * 2]} />
            <mesh geometry={GEO.ring} material={RIM} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[r, r, 1]} />
          </group>
        )
      })}
    </group>
  )
}
