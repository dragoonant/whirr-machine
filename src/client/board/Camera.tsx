// Camera: right-drag orbit, middle-drag / WASD pan, wheel zoom; left button is reserved for the board.
// Preset transitions are eased and <= 600 ms. No auto-camera while a move is staged (a human is mid-drag).
import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { interactionActions, useInteractionStore } from '../interaction/store'
import { CAMERA_TRANSITION_MS, cameraPose, tableOf, zoneViews } from './layout'
import { usePresentedState, useSelectedModel } from '../contract'

const PAN_KEYS: Record<string, [number, number]> = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
export const TRANSITION_MS = Math.min(600, CAMERA_TRANSITION_MS)

export function CameraRig(): ReactElement {
  const controls = useRef<OrbitImpl>(null)
  const { camera, invalidate } = useThree()
  const cam = useInteractionStore((s) => s.cam)
  const state = usePresentedState()
  const selected = useSelectedModel()
  const table = tableOf(state)
  const tween = useRef<{ t0: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null>(null)
  const keys = useRef(new Set<string>())
  const sideA = useMemo(() => {
    const a = zoneViews(state).find((z) => z.player === 'A')
    return a && (a.rect.z0 + a.rect.z1) / 2 < 0 ? -1 : 1
  }, [state?.players.A.edge, state?.players.B.edge, state?.firstPlayer, state?.scenario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // once the edges are known, look from behind player A's own zone
  useEffect(() => { interactionActions.cameraPreset('edgeA') }, [sideA])

  // preset requests
  useEffect(() => {
    const c = controls.current
    if (!cam || !c) return
    const pose = cameraPose(cam.preset, table, selected?.pos, sideA)
    tween.current = { t0: performance.now(), fromP: camera.position.clone(), toP: new THREE.Vector3(...pose.position), fromT: c.target.clone(), toT: new THREE.Vector3(...pose.target) }
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam?.nonce])

  // WASD pan (ignored while typing)
  useEffect(() => {
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) }
    const down = (e: KeyboardEvent) => { if (typing(e) || e.ctrlKey || e.metaKey) return; const k = e.key.toLowerCase(); if (k in PAN_KEYS) { keys.current.add(k); invalidate() } }
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key.toLowerCase()) }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [invalidate])

  const fwd = useRef(new THREE.Vector3()), right = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const tw = tween.current
    if (tw) {
      const f = Math.min(1, (performance.now() - tw.t0) / TRANSITION_MS)
      const e = easeInOut(f)
      camera.position.lerpVectors(tw.fromP, tw.toP, e)
      c.target.lerpVectors(tw.fromT, tw.toT, e)
      c.update()
      if (f >= 1) tween.current = null
      invalidate()
    }
    if (keys.current.size) {
      camera.getWorldDirection(fwd.current); fwd.current.y = 0; fwd.current.normalize()
      right.current.crossVectors(fwd.current, camera.up).normalize()
      const speed = 22 * Math.min(dt, 0.05)
      for (const k of keys.current) {
        const [dx, dz] = PAN_KEYS[k]!
        const move = right.current.clone().multiplyScalar(dx * speed).addScaledVector(fwd.current, -dz * speed)
        camera.position.add(move); c.target.add(move)
      }
      c.update()
      invalidate()
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={false}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={8}
      maxDistance={Math.max(table.w, table.d) * 2.4}
      mouseButtons={{ LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      screenSpacePanning={false}
    />
  )
}
