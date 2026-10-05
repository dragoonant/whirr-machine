// Table surface: felt-toned canvas texture with a 1" grid (6" sections in brass) and a charcoal frame.
import { useEffect, useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import { THEME } from './layout'

const PX = 32 // texture pixels per inch

export function makeTableTexture(w: number, d: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = Math.round(w * PX); c.height = Math.round(d * PX)
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = THEME.felt
  g.fillRect(0, 0, c.width, c.height)
  // deterministic speckle so the felt reads as a surface without banding
  let seed = 1337
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.06)'
    g.fillRect(rnd() * c.width, rnd() * c.height, 2 + rnd() * 3, 2 + rnd() * 3)
  }
  for (let i = 0; i <= w; i++) {
    const sec = i % 6 === 0
    g.fillStyle = sec ? 'rgba(201,162,39,0.34)' : 'rgba(232,230,225,0.09)'
    g.fillRect(i * PX - (sec ? 1.5 : 0.5), 0, sec ? 3 : 1, c.height)
  }
  for (let j = 0; j <= d; j++) {
    const sec = j % 6 === 0
    g.fillStyle = sec ? 'rgba(201,162,39,0.34)' : 'rgba(232,230,225,0.09)'
    g.fillRect(0, j * PX - (sec ? 1.5 : 0.5), c.width, sec ? 3 : 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

const FRAME = new THREE.MeshStandardMaterial({ color: '#202329', roughness: 0.8 })
const TRIM = new THREE.MeshStandardMaterial({ color: '#b87333', roughness: 0.5, metalness: 0.6 })
const BOX = new THREE.BoxGeometry(1, 1, 1)

export function Surface({ w, d, onShadows }: { w: number; d: number; onShadows: boolean }): ReactElement {
  const tex = useMemo(() => makeTableTexture(w, d), [w, d])
  useEffect(() => () => tex?.dispose(), [tex])
  const t = 1.2 // frame thickness
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={onShadows}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={tex ?? undefined} color={tex ? '#ffffff' : THEME.felt} roughness={1} />
      </mesh>
      {[
        { p: [0, -0.2, -(d / 2 + t / 2)], s: [w + t * 2, 0.6, t] },
        { p: [0, -0.2, d / 2 + t / 2], s: [w + t * 2, 0.6, t] },
        { p: [-(w / 2 + t / 2), -0.2, 0], s: [t, 0.6, d] },
        { p: [w / 2 + t / 2, -0.2, 0], s: [t, 0.6, d] },
      ].map((f, i) => <mesh key={i} geometry={BOX} material={FRAME} position={f.p as [number, number, number]} scale={f.s as [number, number, number]} />)}
      {[
        { p: [0, 0.12, -(d / 2 + 0.04)], s: [w + 0.2, 0.05, 0.08] },
        { p: [0, 0.12, d / 2 + 0.04], s: [w + 0.2, 0.05, 0.08] },
        { p: [-(w / 2 + 0.04), 0.12, 0], s: [0.08, 0.05, d] },
        { p: [w / 2 + 0.04, 0.12, 0], s: [0.08, 0.05, d] },
      ].map((f, i) => <mesh key={`t${i}`} geometry={BOX} material={TRIM} position={f.p as [number, number, number]} scale={f.s as [number, number, number]} />)}
    </group>
  )
}
