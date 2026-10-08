// A text tag drawn into the 3D scene: a pill on a canvas texture, shown as a sprite that keeps a fixed screen size. Used for board
// labels that sit inside Suspense (drei <Html> roots can go blank when the board suspends and remounts while models load).
import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'

const PX = 2 // canvas pixels per CSS pixel, for crisp text
const CACHE = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>()

function labelTexture(text: string, border: string, fontPx: number): { tex: THREE.CanvasTexture; aspect: number } {
  const key = `${text}|${border}|${fontPx}`
  const hit = CACHE.get(key)
  if (hit) return hit
  const font = `700 ${fontPx * PX}px system-ui, sans-serif`
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  ctx.font = font
  const padX = fontPx * 0.8 * PX, padY = fontPx * 0.45 * PX, line = 2 * PX
  const w = Math.ceil(ctx.measureText(text).width + padX * 2 + line * 2)
  const h = Math.ceil(fontPx * PX + padY * 2 + line * 2)
  c.width = w; c.height = h
  ctx.font = font
  const r = h / 2 - line
  ctx.beginPath()
  ctx.roundRect(line, line, w - line * 2, h - line * 2, r)
  ctx.fillStyle = 'rgba(16,18,22,0.82)'
  ctx.fill()
  ctx.lineWidth = line
  ctx.strokeStyle = border
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = '#000'; ctx.shadowBlur = 2 * PX
  ctx.fillText(text, w / 2, h / 2 + PX)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const out = { tex, aspect: w / h }
  CACHE.set(key, out)
  return out
}

/** `size` is the label height as a fraction of the viewport height. */
export function LabelSprite({ text, border, position, size = 0.028, fontPx = 13 }: { text: string; border: string; position: [number, number, number]; size?: number; fontPx?: number }): ReactElement {
  const { tex, aspect } = useMemo(() => labelTexture(text, border, fontPx), [text, border, fontPx])
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }), [tex])
  return <sprite material={mat} position={position} scale={[size * aspect, size, 1]} renderOrder={20} />
}
