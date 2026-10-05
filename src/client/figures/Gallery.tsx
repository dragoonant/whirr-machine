// ?gallery: every figure GLB rotating on a turntable with its name, the procedural stand-in beside it, army-painter
// pickers, status toggles, base ring and LOS cylinder. Owner review and screenshot tests (30-figures section 7).
import { Suspense, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { loadBundle } from '../../data/index'
import type { Group } from 'three'
import { baseRadius } from '../../engine/geometry'
import { GLB_BASE_H, GlbBase, GlbBody, useGlbParts } from './GlbBody'
import { enabledSlugs, glbSlugFor, profileForSlug } from './glbModels'
import { PAINT_PRESETS, paintKey, usePaintStore, type ArmyPaint } from './paintStore'
import { ProceduralBody } from './Procedural'
import { dataArchetype, factionData, factionOf } from './profile'
import { BASE_MATERIAL, GEO, archetypeOf, lineMaterial, meshHeight, shellMaterial } from './kit'

export const galleryRequested = (search = typeof location !== 'undefined' ? location.search : ''): boolean => new URLSearchParams(search).has('gallery')

const LOS_HEIGHT: Record<number, number> = { 30: 1.75, 40: 2.25, 50: 2.75, 80: 3.25, 120: 5 }
const COLS = 4
/** Column spacing: wider when the procedural twin stands beside each GLB. */
const cellX = (twin: boolean) => (twin ? 7 : 4.5)
const CELL_Z = 7
const TIP = 1.4
// The camera sits right of centre so the figures clear the settings panel in the top-right corner.
const GAL_SHIFT = 2.5

interface Rec { id: string; name?: string; base?: number; type?: string }
const recOf = (profileId: string): Rec => (loadBundle().byId[profileId] as Rec | undefined) ?? { id: profileId }

interface Toggles { rotate: boolean; baseRing: boolean; los: boolean; down: boolean; ice: boolean; grey: boolean; procedural: boolean }

function Turntable({ x, z, rotate, children }: { x: number; z: number; rotate: boolean; children: ReactElement }): ReactElement {
  const g = useRef<Group>(null)
  useFrame((_, dt) => { if (rotate && g.current) g.current.rotation.y += dt * 0.7 })
  return <group position={[x, 0, z]}><group ref={g}>{children}</group></group>
}

function GlbFigure({ slug, profileId, r, paint, t }: { slug: string; profileId: string; r: number; paint: ArmyPaint | undefined; t: Toggles }): ReactElement | null {
  const parts = useGlbParts(slug, r)
  if (!parts) return null
  const lift = t.down ? Math.max(0, parts.halfWidth * Math.sin(TIP) - GLB_BASE_H + 0.04) : 0
  return (
    <group>
      <GlbBase parts={parts} />
      <group position={[0, GLB_BASE_H + lift, 0]} rotation={[0, 0, t.down ? TIP : 0]}>
        <group position={[0, -GLB_BASE_H, 0]}><GlbBody parts={parts} faction={factionOf(profileId)} paint={paint} grey={t.grey} /></group>
        {t.ice && <mesh geometry={GEO.sphere} material={shellMaterial} scale={[r * 2.3, parts.height * 1.3, r * 2.3]} position={[0, parts.height * 0.5, 0]} />}
      </group>
    </group>
  )
}

function ProcFigure({ profileId, r, baseMm, paint, t }: { profileId: string; r: number; baseMm: number; paint: ArmyPaint | undefined; t: Toggles }): ReactElement {
  const rec = recOf(profileId)
  const archetype = archetypeOf((rec.type ?? 'trooper') as never, dataArchetype(profileId))
  const h = meshHeight(baseMm, archetype)
  return (
    <group>
      <mesh geometry={GEO.cyl} material={BASE_MATERIAL} scale={[r * 2, GLB_BASE_H, r * 2]} position={[0, GLB_BASE_H / 2, 0]} />
      <group position={[0, GLB_BASE_H, 0]} rotation={[0, 0, t.down ? TIP : 0]}>
        <ProceduralBody archetype={archetype} h={h} r={r} side="A" grey={t.grey} paint={paint} />
      </group>
    </group>
  )
}

function cellPos(index: number, twin = false): { x: number; z: number } {
  const col = index % COLS, row = Math.floor(index / COLS)
  return { x: (col - (COLS - 1) / 2) * cellX(twin), z: row * CELL_Z - 1 }
}

function Cell({ slug, index, t, paint }: { slug: string; index: number; t: Toggles; paint: (f: string) => ArmyPaint | undefined }): ReactElement {
  const profileId = profileForSlug(slug) ?? slug
  const rec = recOf(profileId)
  const baseMm = rec.base ?? 30
  const r = baseRadius(baseMm as 30)
  const { x: cx, z: cz } = cellPos(index, t.procedural)
  const p = paint(factionOf(profileId))
  return (
    <group>
      <Turntable x={t.procedural ? cx - 1.6 : cx} z={cz} rotate={t.rotate}>
        <group>
          <Suspense fallback={null}><GlbFigure slug={slug} profileId={profileId} r={r} paint={p} t={t} /></Suspense>
          {t.baseRing && <mesh geometry={GEO.ring} material={lineMaterial('gal-base', '#c9a227')} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.14, 0]} scale={[r, r, 1]} />}
          {t.los && <mesh geometry={GEO.cyl} material={lineMaterial('gal-los', '#6fd0ff', 0.18)} scale={[r * 2, LOS_HEIGHT[baseMm] ?? 1.75, r * 2]} position={[0, (LOS_HEIGHT[baseMm] ?? 1.75) / 2, 0]} />}
        </group>
      </Turntable>
      {t.procedural && (
        <Turntable x={cx + 1.8} z={cz} rotate={t.rotate}>
          <ProcFigure profileId={profileId} r={r} baseMm={baseMm} paint={p} t={t} />
        </Turntable>
      )}
    </group>
  )
}

/** Keeps the DOM name labels under their figures (no per-label React roots inside the canvas). */
function LabelTracker({ n, refs, twin }: { n: number; refs: React.MutableRefObject<(HTMLDivElement | null)[]>; twin: boolean }): null {
  const v = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    for (let i = 0; i < n; i++) {
      const el = refs.current[i]
      if (!el) continue
      const { x, z } = cellPos(i, twin)
      v.set(x, 0, z + 1.9).project(camera)
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, 0)`
    }
  })
  return null
}

const box: React.CSSProperties = { position: 'fixed', right: 12, top: 12, zIndex: 10, background: '#1b1e24ee', color: '#e8e6e1', border: '1px solid #3a3f49', borderRadius: 10, padding: 12, font: '13px system-ui', maxWidth: 300 }

export default function Gallery(): ReactElement {
  const slugs = useMemo(() => enabledSlugs().filter((s) => glbSlugFor(profileForSlug(s) ?? '') === s), [])
  const [t, setT] = useState<Toggles>({ rotate: true, baseRing: false, los: false, down: false, ice: false, grey: false, procedural: false })
  const byFaction = usePaintStore((s) => s.byFaction)
  const factions = useMemo(() => [...new Set(slugs.map((s) => factionOf(profileForSlug(s) ?? '')))].filter(Boolean), [slugs])
  const paintFor = (f: string) => { const p = byFaction[f]; return p && paintKey(p) ? p : undefined }
  const toggle = (k: keyof Toggles) => setT((o) => ({ ...o, [k]: !o[k] }))
  const rows = Math.ceil(slugs.length / COLS)
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  return (
    <div data-testid="gallery" style={{ position: 'fixed', inset: 0, background: '#14161a' }}>
      <div style={box}>
        <strong>Figure gallery</strong> <span style={{ color: '#9aa0aa' }}>{slugs.length} models</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, margin: '8px 0' }}>
          {(['rotate', 'procedural', 'baseRing', 'los', 'down', 'ice', 'grey'] as const).map((k) => (
            <label key={k}><input type="checkbox" checked={t[k]} onChange={() => toggle(k)} /> {LABELS[k]}</label>
          ))}
        </div>
        {factions.map((f) => {
          const fd = factionData(f)
          const p = byFaction[f] ?? {}
          return (
            <div key={f} style={{ borderTop: '1px solid #3a3f49', paddingTop: 6, marginTop: 6 }}>
              <div style={{ marginBottom: 4 }}>{f.toUpperCase()} paint</div>
              <label>Main <input type="color" value={p.primary ?? fd.palette?.primary ?? '#444444'} onChange={(e) => usePaintStore.getState().setFaction(f, { ...p, primary: e.target.value })} /></label>{' '}
              <label>Trim <input type="color" value={p.secondary ?? fd.palette?.secondary ?? '#888888'} onChange={(e) => usePaintStore.getState().setFaction(f, { ...p, secondary: e.target.value })} /></label>
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <button type="button" onClick={() => usePaintStore.getState().setFaction(f, {})}>Stock</button>
                {PAINT_PRESETS.map((pr) => <button key={pr.id} type="button" onClick={() => usePaintStore.getState().setFaction(f, { primary: pr.primary, secondary: pr.secondary })}>{pr.label}</button>)}
              </div>
            </div>
          )
        })}
      </div>
      {slugs.map((s, i) => {
        const profileId = profileForSlug(s) ?? s
        const rec = recOf(profileId)
        return (
          <div key={s} ref={(el) => { labelRefs.current[i] = el }} style={{ position: 'absolute', left: 0, top: 0, zIndex: 5, pointerEvents: 'none', color: '#e8e6e1', font: '600 13px system-ui', textShadow: '0 1px 3px #000', whiteSpace: 'nowrap', textAlign: 'center' }}>
            {rec.name ?? s}<div style={{ font: '11px system-ui', color: '#9aa0aa' }}>{s} · {rec.base ?? 30} mm</div>
          </div>
        )
      })}
      <Canvas dpr={[1, 1.5]} shadows camera={{ fov: 40, near: 0.5, far: 200 }}>
        <GalleryCamera rows={rows} twin={t.procedural} />
        <LabelTracker n={slugs.length} refs={labelRefs} twin={t.procedural} />
        <color attach="background" args={['#14161a']} />
        <hemisphereLight args={['#e6ebf5', '#4a4c44', 1.5]} />
        <directionalLight position={[10, 24, 12]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, rows * 2]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#2a2d33" roughness={1} />
        </mesh>
        {slugs.map((s, i) => <Cell key={s} slug={s} index={i} t={t} paint={paintFor} />)}
      </Canvas>
    </div>
  )
}

const LABELS: Record<keyof Toggles, string> = { rotate: 'Rotate', procedural: 'Procedural twin', baseRing: 'Base ring', los: 'LOS cylinder', down: 'Knocked down', ice: 'Stationary', grey: 'Disabled grey' }

/** Frames every cell left of the settings panel; pulls back when the procedural twins widen the grid. */
function GalleryCamera({ rows, twin }: { rows: number; twin: boolean }): null {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const s = twin ? 1.5 : 1
    const front = (rows - 1) * CELL_Z - 1
    camera.position.set(GAL_SHIFT * s, 14 * s, front + 14 * s)
    camera.lookAt(GAL_SHIFT * s, 0.8, front - CELL_Z * 0.4)
  }, [camera, rows, twin])
  return null
}
