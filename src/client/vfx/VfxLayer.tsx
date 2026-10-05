// The beat-driven effects layer: watches the presented event feed, plans effects for what was just shown (effects.ts)
// and plays them (engine.ts). Mounted once per canvas through <VfxHost/> (the first figure to mount hosts it), or
// directly with <VfxLayer/>. Demand-frameloop friendly: asks for frames only while something is playing.
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { PerspectiveCamera } from 'three'
import type { GameEvent } from '../../engine/index'
import { getSettings, useSettingsStore } from '../store/settingsStore'
import { usePresentedStore } from '../presentation/presentedStore'
import { VfxEngine } from './engine'
import { planEvents, type AttackMemos } from './effects'
import { glowPool, smokePool } from './particles'

export function VfxLayer(): ReactElement {
  const engine = useMemo(() => new VfxEngine(), [])
  const memos = useRef<AttackMemos>(new Map())
  const invalidate = useThree((s) => s.invalidate)
  const graphics = useSettingsStore((s) => s.graphics)

  useEffect(() => { engine.lite = graphics === 'low'; invalidate() }, [engine, graphics, invalidate])

  useEffect(() => {
    const seqOf = (feed: readonly { seq: number }[]) => feed[feed.length - 1]?.seq ?? 0
    let last = seqOf(usePresentedStore.getState().feed)
    const off = usePresentedStore.subscribe((s, prev) => {
      if (s.feed === prev.feed) return
      const top = seqOf(s.feed)
      if (top < last || s.feed.length < prev.feed.length) { last = top; memos.current.clear(); engine.clear(); return } // new game or reload
      if (top === last || !s.state) return
      const fresh: GameEvent[] = []
      for (let i = s.feed.length - 1; i >= 0 && s.feed[i]!.seq > last; i--) fresh.push(s.feed[i]!.event)
      last = top
      fresh.reverse()
      const speed = getSettings().speed
      if (speed <= 0) { memos.current.clear(); return } // instant: nothing plays
      const specs = planEvents(fresh, s.state, memos.current)
      if (specs.length) { engine.play(specs, performance.now(), speed); invalidate() }
    })
    return () => { off(); engine.dispose() }
  }, [engine, invalidate])

  useFrame((st, delta) => {
    const cam = st.camera as PerspectiveCamera
    const fov = cam.isPerspectiveCamera ? (cam.fov * Math.PI) / 180 : 0.7
    const scale = (st.size.height * st.viewport.dpr) / (2 * Math.tan(fov / 2))
    glowPool.material.uniforms.uScale!.value = scale
    smokePool.material.uniforms.uScale!.value = scale
    engine.update(performance.now(), Math.min(0.05, delta))
    if (engine.busy) invalidate()
  })

  return <primitive object={engine.group} />
}

// One layer per canvas: the first mounted host renders it (into the scene, so figure transforms never move it).
let hostSeq = 0
const hosts: number[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function VfxHost(): ReactElement | null {
  const scene = useThree((s) => s.scene)
  const [id] = useState(() => ++hostSeq)
  const [owner, setOwner] = useState(false)
  useEffect(() => {
    hosts.push(id)
    const l = () => setOwner(hosts[0] === id)
    listeners.add(l)
    notify()
    return () => { hosts.splice(hosts.indexOf(id), 1); listeners.delete(l); notify() }
  }, [id])
  return owner ? createPortal(<VfxLayer />, scene) : null
}
