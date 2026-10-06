// Table: the board's ground mat (albedo / normal / roughness from public/assets/terrain/boards/<board>/), a dark wood
// surround 8" wide on every side with a bevelled lip, and a brass edge trim with 6" ticks. Missing textures leave the
// board's fallback colour. Low graphics: albedo only, shrunk to 1024 px, and a flat wood colour.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { BoardDef } from './boards'
import { useBoard } from './boardStore'
import { useSettings } from '../contract'

export const SURROUND = 8 // inches of table past the play edge
const WOOD_TILE = 12 // inches per wood texture tile
const WOOD_FLAT = '#2a1d14'
const assetUrl = (rel: string): string => `${import.meta.env.BASE_URL}assets/terrain/${rel}`

type Kind = 'albedo' | 'normal' | 'rough'
export interface MatSet { albedo?: THREE.Texture; normal?: THREE.Texture; rough?: THREE.Texture }

/** Load one texture; resolves null when the file is missing or broken. `max` shrinks it (Low graphics). */
function loadTexture(url: string, kind: Kind, anisotropy: number, max?: number, repeat?: [number, number]): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (tex) => {
      let out: THREE.Texture = tex
      const img = tex.image as HTMLImageElement | undefined
      if (max && img && Math.max(img.width, img.height) > max && typeof document !== 'undefined') {
        const k = max / Math.max(img.width, img.height)
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
        const g = c.getContext('2d')
        if (g) { g.drawImage(img, 0, 0, c.width, c.height); tex.dispose(); out = new THREE.CanvasTexture(c) }
      }
      if (kind === 'albedo') out.colorSpace = THREE.SRGBColorSpace
      out.anisotropy = anisotropy
      if (repeat) { out.wrapS = out.wrapT = THREE.RepeatWrapping; out.repeat.set(repeat[0], repeat[1]) }
      out.needsUpdate = true
      resolve(out)
    }, undefined, () => resolve(null))
  })
}

/** The textures of a folder, loaded after the first frame; null entries stay undefined (fallback colour shows). */
function useMatSet(folder: string, low: boolean, enabled: boolean, repeat?: [number, number]): MatSet {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const [set, setSet] = useState<MatSet>({})
  const rx = repeat?.[0], rz = repeat?.[1]
  useEffect(() => {
    if (!enabled) { setSet({}); return }
    let alive = true
    const created: THREE.Texture[] = []
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy())
    const rep = rx !== undefined && rz !== undefined ? ([rx, rz] as [number, number]) : undefined
    const kinds: Kind[] = low ? ['albedo'] : ['albedo', 'normal', 'rough']
    void Promise.all(kinds.map((k) => loadTexture(assetUrl(`${folder}/${k}.jpg`), k, aniso, low ? 1024 : undefined, rep))).then((texs) => {
      texs.forEach((t) => { if (t) created.push(t) })
      if (!alive) { created.forEach((t) => t.dispose()); return }
      const next: MatSet = {}
      kinds.forEach((k, i) => { const t = texs[i]; if (t) next[k] = t })
      setSet(next)
      invalidate()
    })
    return () => { alive = false; created.forEach((t) => t.dispose()) }
  }, [folder, low, enabled, gl, invalidate, rx, rz])
  return set
}

const BOX = new THREE.BoxGeometry(1, 1, 1)
const TRIM = new THREE.MeshStandardMaterial({ color: '#b87333', roughness: 0.5, metalness: 0.6 })
const TICK = new THREE.MeshStandardMaterial({ color: '#e0c28a', roughness: 0.6, metalness: 0.4 })
const LIP = 0.17 // chamfered rail: a square rotated 45 degrees

function Ticks({ w, d }: { w: number; d: number }): ReactElement {
  const ref = useRef<THREE.InstancedMesh>(null)
  const spots = useMemo(() => {
    const out: { x: number; z: number; alongX: boolean }[] = []
    for (let x = -w / 2; x <= w / 2 + 1e-6; x += 6) { out.push({ x, z: -(d / 2 + 0.1), alongX: false }, { x, z: d / 2 + 0.1, alongX: false }) }
    for (let z = -d / 2; z <= d / 2 + 1e-6; z += 6) { out.push({ x: -(w / 2 + 0.1), z, alongX: true }, { x: w / 2 + 0.1, z, alongX: true }) }
    return out
  }, [w, d])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 0.135, s.z), new THREE.Quaternion(), s.alongX ? new THREE.Vector3(0.22, 0.03, 0.07) : new THREE.Vector3(0.07, 0.03, 0.22))
      ref.current?.setMatrixAt(i, m)
    })
    if (ref.current) { ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere() }
  }, [spots])
  return <instancedMesh key={spots.length} ref={ref} args={[BOX, TICK, spots.length]} />
}

export function Surface({ w, d, onShadows, board: boardProp }: { w: number; d: number; onShadows: boolean; board?: BoardDef }): ReactElement {
  const stored = useBoard()
  const board = boardProp ?? stored
  const { graphics } = useSettings()
  const low = graphics === 'low'
  const mat = useMatSet(`boards/${board.short}`, low, true)
  const wood = useMatSet('boards/table', low, !low, [(w + SURROUND * 2) / WOOD_TILE, (d + SURROUND * 2) / WOOD_TILE])
  const sw = w + SURROUND * 2, sd = d + SURROUND * 2
  const woodMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: wood.albedo ? '#ffffff' : WOOD_FLAT, map: wood.albedo ?? null, normalMap: wood.normal ?? null, roughnessMap: wood.rough ?? null, roughness: wood.rough ? 1 : 0.7,
  }), [wood])
  useEffect(() => () => woodMat.dispose(), [woodMat])
  const lipMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.55 }), [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={onShadows}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={mat.albedo ? '#ffffff' : board.fallback.ground} map={mat.albedo ?? null} normalMap={mat.normal ?? null} roughnessMap={mat.rough ?? null}
          roughness={mat.rough ? 1 : 0.95} key={`${board.id}:${mat.albedo?.uuid ?? 'flat'}:${mat.normal?.uuid ?? ''}:${mat.rough?.uuid ?? ''}`}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} material={woodMat} receiveShadow={onShadows}>
        <planeGeometry args={[sw, sd]} />
      </mesh>
      {[
        { p: [0, 0, -(d / 2 + LIP * 0.2)], s: [w + LIP * 2, LIP, LIP], r: [Math.PI / 4, 0, 0] },
        { p: [0, 0, d / 2 + LIP * 0.2], s: [w + LIP * 2, LIP, LIP], r: [Math.PI / 4, 0, 0] },
        { p: [-(w / 2 + LIP * 0.2), 0, 0], s: [LIP, LIP, d], r: [0, 0, Math.PI / 4] },
        { p: [w / 2 + LIP * 0.2, 0, 0], s: [LIP, LIP, d], r: [0, 0, Math.PI / 4] },
      ].map((f, i) => <mesh key={`lip${i}`} geometry={BOX} material={lipMat} position={f.p as [number, number, number]} scale={f.s as [number, number, number]} rotation={f.r as [number, number, number]} />)}
      {[
        { p: [0, 0.1, -(d / 2 + 0.1)], s: [w + 0.4, 0.05, 0.08] },
        { p: [0, 0.1, d / 2 + 0.1], s: [w + 0.4, 0.05, 0.08] },
        { p: [-(w / 2 + 0.1), 0.1, 0], s: [0.08, 0.05, d] },
        { p: [w / 2 + 0.1, 0.1, 0], s: [0.08, 0.05, d] },
      ].map((f, i) => <mesh key={`t${i}`} geometry={BOX} material={TRIM} position={f.p as [number, number, number]} scale={f.s as [number, number, number]} />)}
      <Ticks w={w} d={d} />
    </group>
  )
}
