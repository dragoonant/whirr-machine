// Board overlays: ground picking, ghost path + engine move readout, threat/CTRL/melee rings, ruler, LOS view,
// per-target hit badges and placement ghosts. Every number shown comes from the engine through contract.query*.
import { memo, useMemo, type ReactElement, type ReactNode } from 'react'
import { Html, Line } from '@react-three/drei'
import { baseRadius } from '../../engine/geometry'
import type { ModelId, ModelState, PendingDecision, Vec2 } from '../../engine/index'
import {
  queryAttackPreview, queryDistance, queryLos, queryMoveCheck, queryStat, queryThreat, engineDescribe,
  useHoverId, useMeasure, usePresentedModels, usePresentedState, usePrompt, useSelectedModel, useShowThreat, useUiMode,
} from '../contract'
import { SIDE_COLOURS, losReasonText, moveReasonText, tableOf, threatRings } from '../board/layout'
import { GEO, lineMaterial } from '../figures/kit'
import { useUiStore } from '../store/uiStore'
import { currentPrompt } from './adapter'
import { clampMovePoint, handleGroundClick, PLACEMENT_KINDS, defaultStraightPath, placementIds, TARGET_KINDS, optionsTargeting } from './controller'
import { interactionActions, useInteractionStore } from './store'

const Y = 0.08
const v3 = (p: Vec2, y = Y): [number, number, number] => [p.x, y, p.z]

function Tag({ at, y = 1.2, children, tone = '#e8e6e1' }: { at: Vec2; y?: number; children: ReactNode; tone?: string }): ReactElement {
  return (
    <Html position={[at.x, y, at.z]} center zIndexRange={[15, 5]} style={{ pointerEvents: 'none' }}>
      <div style={{ background: '#1e2127ee', color: tone, border: '1px solid #c9a22788', borderRadius: 6, padding: '2px 7px', font: '600 12px system-ui', whiteSpace: 'nowrap', textAlign: 'center' }}>{children}</div>
    </Html>
  )
}

const circlePoints = (c: Vec2, r: number, n = 72): [number, number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return [c.x + Math.cos(a) * r, Y, c.z + Math.sin(a) * r] as [number, number, number] })

function Circle({ c, r, colour, dashed = false, width = 1.5, opacity = 0.9 }: { c: Vec2; r: number; colour: string; dashed?: boolean; width?: number; opacity?: number }): ReactElement {
  const pts = useMemo(() => circlePoints(c, r), [c.x, c.z, r])
  return <Line points={pts} color={colour} lineWidth={width} dashed={dashed} dashSize={0.5} gapSize={0.35} transparent opacity={opacity} />
}

// ---------- ground picking ----------
export function Ground(): ReactElement {
  const state = usePresentedState()
  const { w, d } = tableOf(state)
  let last = 0
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.002, 0]}
      onPointerMove={(e) => {
        const now = performance.now()
        if (now - last < 33) return // <= 30 Hz
        last = now
        const at = { x: e.point.x, z: e.point.z }
        // in move mode the ghost never leaves the legal move: it sticks to the farthest reachable point
        interactionActions.setGhost(useUiStore.getState().mode === 'move' ? clampMovePoint(currentPrompt(), at) : at)
      }}
      onPointerOut={() => interactionActions.setGhost(null)}
      onClick={(e) => {
        if (e.nativeEvent.button !== 0 || e.delta > 4) return
        handleGroundClick({ x: e.point.x, z: e.point.z }, e.nativeEvent.shiftKey)
      }}
    >
      <planeGeometry args={[w + 6, d + 6]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

// ---------- move: ghost path + engine readout ----------
function MoveOverlayInner({ prompt }: { prompt: PendingDecision }): ReactElement | null {
  const mode = useUiMode()
  const staged = useInteractionStore((s) => s.staged)
  const ghost = useInteractionStore((s) => s.ghost)
  const models = usePresentedModels()
  const c = prompt.constraints
  const m = c ? models?.[c.modelId] : undefined
  const straight = useMemo(() => defaultStraightPath(prompt), [prompt])
  const preview = staged.length === 0 && !straight
  const path: Vec2[] = staged.length ? staged : straight ?? (ghost && mode === 'move' ? [ghost] : [])
  const check = useMemo(() => (m && path.length ? queryMoveCheck(m.id, path) : null), [m?.id, prompt.id, JSON.stringify(path)]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!c || !m) return null
  const r = baseRadius(m.base)
  const end = path[path.length - 1]
  const colour = straight ? '#c9a227' : check ? (check.ok ? '#7fd18b' : '#e0483a') : '#c9a227'
  const pts: [number, number, number][] = [v3(m.pos), ...path.map((p) => v3(p))]
  return (
    <group>
      {Number.isFinite(c.maxDist) && <Circle c={c.from} r={r + c.maxDist} colour="#c9a227" dashed width={1.2} opacity={0.7} />}
      {c.minDist ? <Circle c={c.from} r={r + c.minDist} colour="#c9a227" dashed width={1} opacity={0.5} /> : null}
      {end && (
        <>
          <Line points={pts} color={colour} lineWidth={2.5} transparent opacity={preview ? 0.6 : 1} />
          <mesh geometry={GEO.disc} material={lineMaterial(`ghost:${colour}`, colour, preview ? 0.28 : 0.5)} rotation={[-Math.PI / 2, 0, 0]} position={v3(end, 0.07)} scale={[r, r, 1]} />
          <Circle c={end} r={r} colour={colour} width={2} />
          <Tag at={end} y={1.6} tone={colour}>
            <div>{check ? `${check.distance.toFixed(1)}"` : ''}{Number.isFinite(c.maxDist) ? ` of ${c.maxDist.toFixed(1)}"` : ''}</div>
            <div style={{ fontWeight: 500, fontSize: 11 }}>{straight ? 'Straight-line move' : check ? moveReasonText(check.reason) : ''}</div>
            {!preview && <div style={{ fontWeight: 500, fontSize: 10, opacity: 0.8 }}>Enter to confirm, Esc to clear</div>}
          </Tag>
        </>
      )}
    </group>
  )
}
export function MoveOverlay(): ReactElement | null {
  const prompt = usePrompt()
  if (prompt?.kind !== 'moveModel' || !prompt.constraints) return null
  return <MoveOverlayInner prompt={prompt} />
}

// ---------- placement ghosts (deploy / placeTroopers) ----------
export function PlacementGhosts(): ReactElement | null {
  const prompt = usePrompt()
  const placements = useInteractionStore((s) => s.placements)
  const ghost = useInteractionStore((s) => s.ghost)
  const models = usePresentedModels()
  const selected = useSelectedModel()
  if (!prompt || !PLACEMENT_KINDS.has(prompt.kind) || !models) return null
  const ids = placementIds(prompt)
  const next = selected && ids.includes(selected.id) ? selected.id : ids.find((i) => !placements[i])
  return (
    <group>
      {ids.map((id) => {
        const m = models[id]
        const p = placements[id]
        if (!m || !p) return null
        const r = baseRadius(m.base)
        const col = SIDE_COLOURS[m.owner].ring
        return (
          <group key={id}>
            <mesh geometry={GEO.disc} material={lineMaterial(`pl:${col}`, col, 0.5)} rotation={[-Math.PI / 2, 0, 0]} position={v3(p, 0.07)} scale={[r, r, 1]} />
            <mesh geometry={GEO.cyl} material={lineMaterial(`plb:${col}`, col, 0.8)} position={[p.x, 0.55, p.z]} scale={[r * 0.7, 1.0, r * 0.7]} />
          </group>
        )
      })}
      {ghost && next && models[next] && (
        <mesh geometry={GEO.disc} material={lineMaterial('plg', '#c9a227', 0.3)} rotation={[-Math.PI / 2, 0, 0]} position={v3(ghost, 0.07)} scale={[baseRadius(models[next]!.base), baseRadius(models[next]!.base), 1]} />
      )}
    </group>
  )
}

// ---------- threat / CTRL / melee rings ----------
function RingsFor({ m, full }: { m: ModelState; full: boolean }): ReactElement | null {
  const rings = useMemo(() => threatRings(m, queryThreat(m.id)), [m.id, m.base, m.pos.x, m.pos.z, m.conditions.length, m.crippled.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const melee = useMemo(() => queryThreat(m.id)?.meleeRange ?? 0, [m.id, m.crippled.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const ctrl = useMemo(() => (m.type === 'leader' ? queryStat(m.id, 'CTRL')?.value ?? 0 : 0), [m.id, m.type])
  const r = baseRadius(m.base)
  return (
    <group>
      {full && rings.map((g) => <Circle key={g.key} c={m.pos} r={g.radius} colour={g.colour} dashed={g.dash} width={1.4} opacity={0.8} />)}
      {melee > 0 && <Circle c={m.pos} r={r + melee} colour="#e0483a" width={1.2} opacity={0.6} />}
      {ctrl > 0 && <Circle c={m.pos} r={r + ctrl} colour="#7aa8e0" dashed width={1.2} opacity={0.6} />}
    </group>
  )
}
export function Rings(): ReactElement | null {
  const showThreat = useShowThreat()
  const sel = useSelectedModel()
  const hoverId = useHoverId()
  const models = usePresentedModels()
  const hov = hoverId ? models?.[hoverId] : undefined
  if (!sel && !hov) return null
  return (
    <group>
      {sel && sel.life === 'active' && !sel.offTable && <RingsFor m={sel} full={showThreat} />}
      {hov && hov.id !== sel?.id && hov.life === 'active' && !hov.offTable && <RingsFor m={hov} full={showThreat} />}
    </group>
  )
}

// ---------- ruler ----------
export function Ruler(): ReactElement | null {
  const mode = useUiMode()
  const { from, to } = useMeasure()
  const ghost = useInteractionStore((s) => s.ghost)
  const hoverId = useHoverId()
  const models = usePresentedModels()
  const end = to ?? (hoverId ? { modelId: hoverId } : ghost ? { point: ghost } : null)
  const posOf = (e: typeof from): Vec2 | null => (!e ? null : 'modelId' in e ? models?.[e.modelId]?.pos ?? null : e.point)
  const a = posOf(from), b = posOf(end)
  const dist = useMemo(() => (from && end ? queryDistance('modelId' in from ? from.modelId : from.point, 'modelId' in end ? end.modelId : end.point) : NaN),
    [JSON.stringify(from), JSON.stringify(end)]) // eslint-disable-line react-hooks/exhaustive-deps
  if (mode !== 'measure' || !a || !b) return null
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
  return (
    <group>
      <Line points={[v3(a, 0.15), v3(b, 0.15)]} color="#ffd866" lineWidth={2.5} dashed={!to} dashSize={0.4} gapSize={0.25} />
      {Number.isFinite(dist) && <Tag at={mid} y={0.9} tone="#ffd866">{dist.toFixed(1)}" edge to edge</Tag>}
    </group>
  )
}

// ---------- LOS view ----------
export function LosView(): ReactElement | null {
  const mode = useUiMode()
  const sel = useSelectedModel()
  const hoverId = useHoverId()
  const models = usePresentedModels()
  const t = hoverId && hoverId !== sel?.id ? models?.[hoverId] : undefined
  const verdict = useMemo(() => (sel && t ? queryLos(sel.id, t.id) : null), [sel?.id, sel?.pos.x, sel?.pos.z, t?.id, t?.pos.x, t?.pos.z]) // eslint-disable-line react-hooks/exhaustive-deps
  const state = usePresentedState()
  if (mode !== 'los' || !sel || !t || !verdict) return null
  const colour = verdict.visible ? '#7fd18b' : '#e0483a'
  const mid = { x: (sel.pos.x + t.pos.x) / 2, z: (sel.pos.z + t.pos.z) / 2 }
  const flags = [verdict.mods.cover && 'cover', verdict.mods.concealment && 'concealment', verdict.mods.elevation && 'elevation', verdict.mods.inMelee && 'target in melee', verdict.mods.stealth && 'stealth'].filter(Boolean) as string[]
  return (
    <group>
      <Line points={[v3(sel.pos, 1), v3(t.pos, 1)]} color={colour} lineWidth={3} />
      {verdict.blockers.map((id) => {
        const bm = models?.[id]
        const bt = state?.terrain.find((x) => x.id === id)
        const at = bm?.pos ?? bt?.pos
        if (!at) return null
        return <Circle key={id} c={at} r={bm ? baseRadius(bm.base) + 0.2 : 1} colour="#e0483a" width={2} />
      })}
      <Tag at={mid} y={1.6} tone={colour}>
        <div>{verdict.visible ? 'Line of sight: clear' : 'Line of sight: blocked'}</div>
        {verdict.reasons.map((r) => <div key={r} style={{ fontWeight: 500, fontSize: 11 }}>{losReasonText(r, verdict.blockers)}</div>)}
        {flags.length > 0 && <div style={{ fontWeight: 500, fontSize: 11, color: '#ffd866' }}>{flags.join(', ')}</div>}
      </Tag>
    </group>
  )
}

// ---------- target badges (engine odds per target) ----------
const Badge = memo(function Badge({ attacker, target, weaponId, spell, text }: { attacker: ModelId; target: ModelState; weaponId: string; spell: boolean; text: string | null }): ReactElement {
  const label = useMemo(() => {
    const pv = spell ? queryAttackPreview(attacker, '', target.id, { spellId: weaponId }) : queryAttackPreview(attacker, weaponId, target.id)
    if (!pv) return text ?? ''
    if (pv.legal) return ''
    if (pv.autoMiss) return 'auto-miss'
    return `${engineDescribe.percent(pv.pHit)} hit${pv.pKill > 0 ? `, ${engineDescribe.percent(pv.pKill)} kill` : ''}`
  }, [attacker, target.id, weaponId, spell, text])
  return <Tag at={target.pos} y={2.9} tone="#ffb4a8">{label || 'target'}</Tag>
})

export function TargetBadges(): ReactElement | null {
  const prompt = usePrompt()
  const models = usePresentedModels()
  const weaponId = useInteractionStore((s) => s.weaponId)
  if (!prompt || !TARGET_KINDS.has(prompt.kind) || !models || prompt.kind === 'chargeTarget') return null
  const attacker = prompt.context.modelId
  if (!attacker) return null
  const ids = [...new Set((prompt.options ?? []).map((o) => (o.action as { targetId?: ModelId }).targetId).filter((x): x is ModelId => !!x))].slice(0, 12)
  return (
    <group>
      {ids.map((tid) => {
        const t = models[tid]
        if (!t) return null
        const opts = optionsTargeting(prompt, tid)
        const o = (weaponId ? opts.find((x) => (x.action as { weaponId?: string; spellId?: string }).weaponId === weaponId || (x.action as { spellId?: string }).spellId === weaponId) : null) ?? opts[0]
        const a = o?.action as { weaponId?: string; spellId?: string } | undefined
        const wid = a?.weaponId ?? a?.spellId
        if (!t || !wid) return null
        return <Badge key={tid} attacker={attacker} target={t} weaponId={wid} spell={!!a?.spellId} text={o?.odds?.pHit !== undefined ? `${engineDescribe.percent(o.odds.pHit)} hit` : null} />
      })}
    </group>
  )
}
