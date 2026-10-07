// Plays FxSpecs: a few pooled meshes (streaks, orbs, rings) plus the sprite particles. Imperative on purpose: nothing
// here re-renders React, and nothing allocates per frame once the pools exist. `lite` (Low graphics) draws only the
// meshes (streak, ring), no particles.
import { AdditiveBlending, BoxGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, Vector3 } from 'three'
import { COLOURS, flash, glowPool, mote, puff, smokePool, sparks } from './particles'
import type { FxLook, FxSpec, TracerStyle, V3 } from './effects'

const STREAK = new BoxGeometry(0.05, 0.05, 1)
const ORB = new SphereGeometry(0.5, 10, 8)
const RING = new RingGeometry(0.9, 1, 48)
const mat = (hex: number, opacity = 1) => new MeshBasicMaterial({ color: hex, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false })

interface Shot { mesh: Mesh; from: V3; to: V3; t0: number; dur: number; style: TracerStyle; arcane: boolean; live: boolean; trailAt: number; look?: FxLook }
interface RingFx { mesh: Mesh; t0: number; dur: number; radius: number; live: boolean }
interface Pending { at: number; spec: FxSpec }

const SHOTS = 10
const RINGS = 8
const ARCANE_HEX = 0x9aa8ff
/** Projectile and lite-ring colour of each M9 look. */
const LOOK_HEX: Record<FxLook, number> = {
  claws: 0xff9a8a, bite: 0xe8e0c8, chain: 0xffd9a0, soul: 0x6bffa0, flame: 0xff7a2a, 'holy-fire': 0xffd24a, lightning: 0x9ae6ff, thorn: 0x8ad04a, thresher: 0xd8c890,
}
const LOOK_RGB: Record<FxLook, readonly [number, number, number]> = {
  claws: [1, 0.55, 0.5], bite: [0.9, 0.88, 0.78], chain: [1, 0.85, 0.6], soul: [0.42, 1, 0.63], flame: COLOURS.flame, 'holy-fire': [1, 0.82, 0.3], lightning: COLOURS.electric, thorn: [0.54, 0.82, 0.3], thresher: [0.85, 0.78, 0.55],
}

export class VfxEngine {
  readonly group = new Group()
  /** True in Low graphics: meshes only, no particles. */
  lite = false
  private shots: Shot[] = []
  private rings: RingFx[] = []
  private pending: Pending[] = []
  private readonly tmp = new Vector3()

  constructor() {
    this.group.name = 'wm-vfx'
    for (let i = 0; i < SHOTS; i++) {
      const mesh = new Mesh(STREAK, mat(0xffe9a8))
      mesh.visible = false
      mesh.renderOrder = 11
      this.group.add(mesh)
      this.shots.push({ mesh, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, t0: 0, dur: 1, style: 'tracer', arcane: false, live: false, trailAt: 0 })
    }
    for (let i = 0; i < RINGS; i++) {
      const mesh = new Mesh(RING, mat(0xffb060))
      mesh.visible = false
      mesh.rotation.x = -Math.PI / 2
      mesh.renderOrder = 11
      this.group.add(mesh)
      this.rings.push({ mesh, t0: 0, dur: 1, radius: 1, live: false })
    }
    this.group.add(glowPool.points, smokePool.points)
  }

  /** Queue specs; speed > 1 plays them faster. Delays and durations in the specs are seconds at speed 1. */
  play(specs: readonly FxSpec[], now: number, speed: number): void {
    const k = 1000 / Math.max(0.25, speed)
    for (const s of specs) {
      const delay = 'delay' in s ? s.delay * k : 0
      const spec: FxSpec = 'dur' in s ? { ...s, dur: s.dur * k } : s
      if (delay > 1) this.pending.push({ at: now + delay, spec: 'delay' in spec ? { ...spec, delay: 0 } : spec })
      else this.start(spec, now)
    }
  }

  /** True while anything is queued or alive (the layer keeps the demand frameloop running). */
  get busy(): boolean {
    return this.pending.length > 0 || this.shots.some((s) => s.live) || this.rings.some((r) => r.live) || glowPool.alive > 0 || smokePool.alive > 0
  }

  private start(spec: FxSpec, now: number): void {
    switch (spec.kind) {
      case 'muzzle': {
        if (this.lite) break
        const { at, dir } = spec
        const ox = at.x + dir.x * 0.4, oy = at.y + dir.y * 0.4, oz = at.z + dir.z * 0.4
        flash(ox, oy, oz, spec.big ? 1.4 : 0.9)
        for (let i = 0; i < (spec.big ? 10 : 5); i++) {
          const sp = 3 + Math.random() * 4
          glowPool.emit({
            x: ox, y: oy, z: oz,
            vx: dir.x * sp + (Math.random() - 0.5) * 2, vy: dir.y * sp + Math.random(), vz: dir.z * sp + (Math.random() - 0.5) * 2,
            life: 0.22, size0: 0.12, size1: 0.02, r: 1, g: 0.8, b: 0.4, drag: 0.3,
          })
        }
        if (spec.big) puff(ox, oy, oz, COLOURS.smoke, 0.6, 0.9, 0.5)
        break
      }
      case 'projectile': {
        const s = this.shots.find((x) => !x.live)
        if (!s) break
        s.live = true
        s.from = spec.from
        s.to = spec.to
        s.t0 = now
        s.dur = Math.max(60, spec.dur)
        s.style = spec.style
        s.arcane = spec.arcane
        s.trailAt = 0
        const m = s.mesh.material as MeshBasicMaterial
        m.color.setHex(spec.look ? LOOK_HEX[spec.look] : spec.arcane ? ARCANE_HEX : spec.style === 'arc' ? 0xffc070 : 0xffe9a8)
        s.look = spec.look
        if (spec.style === 'tracer') {
          s.mesh.geometry = STREAK
          s.mesh.scale.set(1, 1, 0.9)
        } else {
          const k = spec.arcane ? 0.5 : 0.3
          s.mesh.geometry = ORB
          s.mesh.scale.set(k, k, k)
        }
        s.mesh.visible = true
        break
      }
      case 'impact': {
        const { at } = spec
        if (this.lite) {
          this.ringAt(at, spec.mode === 'blast' ? 1.2 : spec.look === 'thresher' ? 1.1 : 0.5, spec.look ? LOOK_HEX[spec.look] : spec.mode === 'arcane' ? ARCANE_HEX : 0xffb060, 300, now)
          break
        }
        if (spec.look) { this.lookImpact(spec.look, at, now); break }
        if (spec.mode === 'arcane') {
          flash(at.x, at.y, at.z, 1.3, COLOURS.arcaneCore, 0.22)
          sparks(at.x, at.y, at.z, 10, COLOURS.arcane, 3)
        } else if (spec.mode === 'blast') {
          flash(at.x, at.y, at.z, 2.2, COLOURS.hot, 0.25)
          sparks(at.x, at.y, at.z, 14, COLOURS.flame, 5)
          puff(at.x, at.y, at.z, COLOURS.smoke, 1.2, 1.2)
        } else if (spec.mode === 'melee') {
          flash(at.x, at.y, at.z, 0.8, COLOURS.hot, 0.1)
          sparks(at.x, at.y, at.z, 12, COLOURS.spark, 5)
        } else {
          flash(at.x, at.y, at.z, 0.5, COLOURS.hot, 0.1)
          sparks(at.x, at.y, at.z, 5, COLOURS.spark, 3)
        }
        break
      }
      case 'ring':
        this.ringAt(spec.at, spec.radius, spec.mode === 'arcane' ? ARCANE_HEX : 0xffa040, spec.dur, now)
        break
      case 'cripple':
        if (this.lite) break
        sparks(spec.at.x, spec.at.y, spec.at.z, 8, COLOURS.electric, 3)
        puff(spec.at.x, spec.at.y + 0.2, spec.at.z, COLOURS.smoke, 0.6, 1.2)
        break
      case 'down':
        if (this.lite) break
        for (let i = 0; i < 3; i++) puff(spec.at.x, spec.at.y - 0.3 + i * 0.2, spec.at.z, COLOURS.smoke, 0.7, 1.3, 0.6)
        break
    }
  }

  /** The impact of an M9 weapon look: claw rakes, a jaw snap, chain sparks, soul wisps, flame, holy fire, lightning, thorns, a thresher sweep. */
  private lookImpact(look: FxLook, at: V3, now: number): void {
    const c = LOOK_RGB[look]
    switch (look) {
      case 'claws':
        for (let i = -1; i <= 1; i++) for (let k = 0; k < 4; k++) {
          glowPool.emit({ x: at.x + i * 0.22 - 0.25 + k * 0.12, y: at.y + 0.3 - k * 0.2, z: at.z, vx: 1.2, vy: -1.6, vz: 0, life: 0.22, size0: 0.14, size1: 0.03, r: c[0], g: c[1], b: c[2], drag: 0.5 })
        }
        flash(at.x, at.y, at.z, 0.6, COLOURS.hot, 0.1)
        break
      case 'bite':
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          glowPool.emit({ x: at.x + Math.cos(a) * 0.5, y: at.y, z: at.z + Math.sin(a) * 0.5, vx: -Math.cos(a) * 3, vy: 0.2, vz: -Math.sin(a) * 3, life: 0.2, size0: 0.14, size1: 0.03, r: c[0], g: c[1], b: c[2] })
        }
        flash(at.x, at.y, at.z, 0.7, COLOURS.hot, 0.1)
        break
      case 'chain':
        sparks(at.x, at.y, at.z, 18, c, 6)
        flash(at.x, at.y, at.z, 0.9, COLOURS.hot, 0.1)
        puff(at.x, at.y, at.z, COLOURS.smoke, 0.5, 0.8, 0.5)
        break
      case 'soul':
        flash(at.x, at.y, at.z, 1.3, c, 0.22)
        for (let i = 0; i < 8; i++) mote(at.x, at.y - 0.2, at.z, c, 0.24, 0.8)
        break
      case 'flame': case 'holy-fire':
        flash(at.x, at.y, at.z, 1.2, look === 'holy-fire' ? COLOURS.hot : COLOURS.flame, 0.2)
        for (let i = 0; i < 10; i++) mote(at.x, at.y - 0.3 + i * 0.05, at.z, c, 0.3, 0.7)
        if (look === 'flame') puff(at.x, at.y + 0.2, at.z, COLOURS.smoke, 0.7, 1.1)
        break
      case 'lightning':
        flash(at.x, at.y, at.z, 1.4, COLOURS.arcaneCore, 0.16)
        sparks(at.x, at.y, at.z, 14, c, 5)
        break
      case 'thorn':
        sparks(at.x, at.y - 0.4, at.z, 12, c, 3.5)
        puff(at.x, at.y - 0.4, at.z, [0.4, 0.33, 0.22], 0.6, 0.9, 0.4)
        break
      case 'thresher':
        this.ringAt(at, 1.2, LOOK_HEX.thresher, 320, now)
        sparks(at.x, at.y, at.z, 12, c, 5)
        break
    }
  }

  private ringAt(at: V3, radius: number, hex: number, dur: number, now: number): void {
    const r = this.rings.find((x) => !x.live)
    if (!r) return
    r.live = true
    r.t0 = now
    r.dur = Math.max(80, dur)
    r.radius = radius
    ;(r.mesh.material as MeshBasicMaterial).color.setHex(hex)
    r.mesh.position.set(at.x, 0.1, at.z)
    r.mesh.visible = true
  }

  /** Advance by dt seconds at clock `now` (ms). */
  update(now: number, dt: number): void {
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= now)
      if (due.length) {
        this.pending = this.pending.filter((p) => p.at > now)
        for (const p of due) this.start(p.spec, now)
      }
    }
    for (const s of this.shots) {
      if (!s.live) continue
      const t = (now - s.t0) / s.dur
      if (t >= 1) { s.live = false; s.mesh.visible = false; continue }
      const x = s.from.x + (s.to.x - s.from.x) * t
      let y = s.from.y + (s.to.y - s.from.y) * t
      const z = s.from.z + (s.to.z - s.from.z) * t
      if (s.style === 'arc') y += Math.sin(t * Math.PI) * Math.min(3, 0.6 + Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z) * 0.12)
      s.mesh.position.set(x, y, z)
      if (s.style === 'tracer') s.mesh.lookAt(this.tmp.set(s.to.x, s.to.y, s.to.z))
      ;(s.mesh.material as MeshBasicMaterial).opacity = s.style === 'tracer' ? 1 - Math.max(0, t - 0.7) / 0.3 : 1
      if (!this.lite) {
        s.trailAt -= dt
        if (s.trailAt <= 0) {
          s.trailAt = 0.025
          if (s.arcane) mote(x, y, z, COLOURS.arcane, 0.22, 0.45)
          else if (s.style === 'arc') puff(x, y, z, COLOURS.smoke, 0.3, 0.6, 0.2)
          else if (s.look) mote(x, y, z, LOOK_RGB[s.look], 0.2, 0.3)
          else if (s.style === 'bolt') mote(x, y, z, COLOURS.hot, 0.14, 0.2)
        }
      }
    }
    for (const r of this.rings) {
      if (!r.live) continue
      const t = (now - r.t0) / r.dur
      if (t >= 1) { r.live = false; r.mesh.visible = false; continue }
      const k = r.radius * (0.25 + 0.75 * (1 - Math.pow(1 - t, 3)))
      r.mesh.scale.set(k, k, 1)
      ;(r.mesh.material as MeshBasicMaterial).opacity = 0.9 * (1 - t)
    }
    if (this.lite) { glowPool.clear(); smokePool.clear() } else { glowPool.update(dt); smokePool.update(dt) }
  }

  clear(): void {
    this.pending = []
    for (const s of this.shots) { s.live = false; s.mesh.visible = false }
    for (const r of this.rings) { r.live = false; r.mesh.visible = false }
    glowPool.clear()
    smokePool.clear()
  }

  dispose(): void {
    this.clear()
    this.group.removeFromParent()
  }
}
