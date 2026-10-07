// Event batch -> timed beats (50 §2). Pure: no timers, no stores. The director plays the beats.
import type { DiceRolled, GameEvent, GameState, ModelId, Vec2 } from '../../engine/index'

/** An event with its position in the game's event stream (1-based, monotonic for the whole game). */
export interface SeqEvent { seq: number; event: GameEvent }

export type BeatKind = 'apply' | 'move' | 'dice' | 'attack' | 'damage' | 'death' | 'banner' | 'score' | 'spell'
  | 'fury' | 'frenzy' | 'transfer' // M9: leech, force and reave; a beast going berserk; damage moved to a beast
export type BannerKind = 'round' | 'turn' | 'feat' | 'game' | 'info'

export interface TweenSpec { modelId: ModelId; points: Vec2[] } // polyline from the start position to the end
export interface PopSpec { modelId: ModelId; text: string; kind: 'damage' | 'heal' | 'focus' | 'miss' | 'crit' | 'info' }
export interface BannerSpec { text: string; kind: BannerKind }

export interface Beat {
  kind: BeatKind
  events: SeqEvent[]
  /** Duration at speed 1, in ms (0 = instantaneous). */
  baseMs: number
  /** When the beat's events reach the presented state: moves land at the end of their tween, the rest at the start. */
  applyAt: 'start' | 'end'
  tweens?: TweenSpec[]
  roll?: DiceRolled
  pops?: PopSpec[]
  banner?: BannerSpec
}

export const BEAT_MS = {
  moveBase: 150, movePerInch: 110, moveMax: 1400, deploy: 450, place: 500,
  dice: 850, diceBoosted: 1000, attack: 320, damage: 550, death: 750, spell: 500,
  round: 1400, turn: 1000, feat: 1300, game: 2400, score: 900, charge: 300,
  leech: 800, force: 380, threshold: 520, frenzy: 1300, transfer: 750, aspect: 650, wild: 700,
} as const

const ASPECT_WORD = { mind: 'Mind', body: 'Body', spirit: 'Spirit' } as const

const samePoint = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6

/** Polyline for a move: from, the waypoints, to; consecutive duplicates removed. */
export function movePoints(from: Vec2, path: readonly Vec2[], to: Vec2): Vec2[] {
  const out: Vec2[] = [from]
  for (const p of [...path, to]) if (!samePoint(out[out.length - 1]!, p)) out.push(p)
  if (out.length === 1) out.push(to)
  return out
}

export function polylineLength(pts: readonly Vec2[]): number {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z)
  return d
}

/** Position along a polyline at fraction t in [0, 1] (by length). Display interpolation only. */
export function pointAlong(pts: readonly Vec2[], t: number): Vec2 {
  if (pts.length === 0) return { x: 0, z: 0 }
  if (pts.length === 1 || t <= 0) return pts[0]!
  if (t >= 1) return pts[pts.length - 1]!
  const total = polylineLength(pts)
  if (total <= 1e-9) return pts[pts.length - 1]!
  let want = total * t
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!
    const seg = Math.hypot(b.x - a.x, b.z - a.z)
    if (want <= seg) { const f = seg ? want / seg : 1; return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f } }
    want -= seg
  }
  return pts[pts.length - 1]!
}

/** Ease in-out for tweens. */
export const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export interface BeatOptions {
  /** Narration off: turn/info banners become instantaneous (round, feat and game banners always show). */
  narration: boolean
  playerName: (p: 'A' | 'B') => string
  modelName: (id: string) => string
}

/**
 * Group a batch into beats. `before` is the state the batch starts from (positions for tweens of deploy events,
 * which carry no `from`).
 */
export function buildBeats(before: GameState, events: readonly SeqEvent[], opts: BeatOptions): Beat[] {
  const beats: Beat[] = []
  let pending: SeqEvent[] = [] // zero-time events waiting to be flushed as one apply beat
  const flush = () => { if (pending.length) { beats.push({ kind: 'apply', events: pending, baseMs: 0, applyAt: 'start' }); pending = [] } }
  const push = (b: Beat) => { flush(); beats.push(b) }
  const pos = (id: string): Vec2 => before.models[id]?.pos ?? { x: 0, z: 0 }

  for (let i = 0; i < events.length; i++) {
    const se = events[i]!
    const ev = se.event
    switch (ev.type) {
      case 'ModelDeployed': {
        // consecutive deployments share one beat
        const group: SeqEvent[] = [se]
        while (events[i + 1]?.event.type === 'ModelDeployed') group.push(events[++i]!)
        const tweens = group.map((g) => {
          const e = g.event as Extract<GameEvent, { type: 'ModelDeployed' }>
          return { modelId: e.modelId, points: [pos(e.modelId), e.pos] }
        })
        push({ kind: 'move', events: group, baseMs: BEAT_MS.deploy, applyAt: 'end', tweens })
        break
      }
      case 'ModelMoved': {
        const pts = movePoints(ev.from, ev.path, ev.to)
        const len = polylineLength(pts)
        if (len < 0.01) { pending.push(se); break }
        const ms = Math.min(BEAT_MS.moveMax, BEAT_MS.moveBase + BEAT_MS.movePerInch * len)
        push({ kind: 'move', events: [se], baseMs: ms, applyAt: 'end', tweens: [{ modelId: ev.modelId, points: pts }] })
        break
      }
      case 'TroopersPlaced': {
        const tweens = ev.placements.map((p) => ({ modelId: p.modelId, points: [pos(p.modelId), p.pos] }))
        push({ kind: 'move', events: [se], baseMs: BEAT_MS.place, applyAt: 'end', tweens })
        break
      }
      case 'DiceRolled':
        push({ kind: 'dice', events: [se], baseMs: ev.boosted ? BEAT_MS.diceBoosted : BEAT_MS.dice, applyAt: 'start', roll: ev })
        break
      case 'AttackDeclared':
        push({ kind: 'attack', events: [se], baseMs: BEAT_MS.attack, applyAt: 'start' })
        break
      case 'ChargeDeclared':
        push({ kind: 'attack', events: [se], baseMs: BEAT_MS.charge, applyAt: 'start' })
        break
      case 'AttackResolved': {
        // a miss pops over the target; hits are shown by the damage that follows
        if (!ev.hit) {
          const target = findTarget(before, events, ev.attackId)
          if (target) { push({ kind: 'damage', events: [se], baseMs: BEAT_MS.damage * 0.6, applyAt: 'start', pops: [{ modelId: target, text: 'Miss', kind: 'miss' }] }); break }
        }
        if (ev.crit) {
          const target = findTarget(before, events, ev.attackId)
          if (target) { push({ kind: 'damage', events: [se], baseMs: BEAT_MS.damage * 0.6, applyAt: 'start', pops: [{ modelId: target, text: 'Critical!', kind: 'crit' }] }); break }
        }
        pending.push(se)
        break
      }
      case 'DamageApplied':
        push({ kind: 'damage', events: [se], baseMs: BEAT_MS.damage, applyAt: 'start', pops: [{ modelId: ev.targetId, text: ev.points > 0 ? `-${ev.points}` : '0', kind: 'damage' }] })
        break
      case 'Healed':
        push({ kind: 'damage', events: [se], baseMs: BEAT_MS.damage, applyAt: 'start', pops: [{ modelId: ev.modelId, text: `+${ev.points}`, kind: 'heal' }] })
        break
      case 'LifeStateChanged':
        if (ev.to === 'boxed' || ev.to === 'destroyed' || ev.to === 'disabled') push({ kind: 'death', events: [se], baseMs: BEAT_MS.death, applyAt: 'start' })
        else pending.push(se)
        break
      case 'SpellCast':
        push({ kind: 'spell', events: [se], baseMs: BEAT_MS.spell, applyAt: 'start' })
        break
      // ---------- M9 fury beats (81 G): numbers come straight from the event payloads ----------
      case 'FuryLeeched': {
        const total = ev.sources.reduce((a, s) => a + s.points, 0) + ev.selfPoints + ev.spiritBond
        if (total <= 0) { pending.push(se); break }
        const pops: PopSpec[] = ev.sources.filter((s) => s.points > 0).map((s) => ({ modelId: s.modelId, text: `-${s.points} fury`, kind: 'focus' as const }))
        pops.push({ modelId: ev.warlockId, text: `+${total} fury`, kind: 'focus' })
        if (ev.selfPoints > 0) pops.push({ modelId: ev.warlockId, text: `${ev.selfPoints} from itself`, kind: 'damage' })
        push({ kind: 'fury', events: [se], baseMs: BEAT_MS.leech, applyAt: 'start', pops })
        break
      }
      case 'BeastForced':
        push({ kind: 'fury', events: [se], baseMs: BEAT_MS.force, applyAt: 'start', pops: [{ modelId: ev.beastId, text: `+${ev.gained} fury`, kind: 'focus' }] })
        break
      case 'FuryReaved':
        if (ev.points > 0) push({ kind: 'fury', events: [se], baseMs: BEAT_MS.force, applyAt: 'start', pops: [{ modelId: ev.reaverId, text: `+${ev.points} fury (reaved)`, kind: 'focus' }] })
        else pending.push(se)
        break
      case 'ThresholdChecked':
        push({ kind: 'fury', events: [se], baseMs: ev.frenzied ? BEAT_MS.threshold : BEAT_MS.threshold * 0.6, applyAt: 'start', pops: [{ modelId: ev.beastId, text: ev.frenzied ? 'Frenzy!' : 'Holds', kind: ev.frenzied ? 'crit' : 'info' }] })
        break
      case 'Frenzied': {
        const who = opts.modelName(ev.beastId)
        const text = ev.targetId ? `${who} frenzies at ${opts.modelName(ev.targetId)}` : `${who} frenzies with nothing to hit`
        push({ kind: 'frenzy', events: [se], baseMs: BEAT_MS.frenzy, applyAt: 'start', banner: { text, kind: 'info' } })
        break
      }
      case 'FrenzyEnded':
        if (ev.vented > 0) push({ kind: 'fury', events: [se], baseMs: BEAT_MS.force, applyAt: 'start', pops: [{ modelId: ev.beastId, text: `vents ${ev.vented}`, kind: 'info' }] })
        else pending.push(se)
        break
      case 'DamageTransferred':
        push({ kind: 'transfer', events: [se], baseMs: BEAT_MS.transfer, applyAt: 'start', pops: [
          { modelId: ev.warlockId, text: ev.overflow > 0 ? `moves ${ev.absorbed}, ${ev.overflow} stay` : `moves ${ev.absorbed}`, kind: 'info' },
          { modelId: ev.beastId, text: `takes ${ev.absorbed}`, kind: 'info' },
        ] })
        break
      case 'AspectCrippled':
        push({ kind: 'damage', events: [se], baseMs: BEAT_MS.aspect, applyAt: 'start', pops: [{ modelId: ev.modelId, text: `${ASPECT_WORD[ev.aspect]} crippled`, kind: 'crit' }] })
        break
      case 'AspectRestored':
        push({ kind: 'damage', events: [se], baseMs: BEAT_MS.aspect, applyAt: 'start', pops: [{ modelId: ev.modelId, text: `${ASPECT_WORD[ev.aspect]} restored`, kind: 'heal' }] })
        break
      case 'BeastWild':
        push({ kind: 'fury', events: [se], baseMs: BEAT_MS.wild, applyAt: 'start', pops: [{ modelId: ev.modelId, text: 'Wild!', kind: 'crit' }] })
        break
      case 'BeastControlTaken':
        push({ kind: 'fury', events: [se], baseMs: BEAT_MS.wild, applyAt: 'start', pops: [{ modelId: ev.modelId, text: 'Under control', kind: 'heal' }] })
        break
      case 'RoundStarted':
        push({ kind: 'banner', events: [se], baseMs: BEAT_MS.round, applyAt: 'start', banner: { text: `Round ${ev.round}`, kind: 'round' } })
        break
      case 'TurnStarted':
        push({ kind: 'banner', events: [se], baseMs: opts.narration ? BEAT_MS.turn : 0, applyAt: 'start', banner: { text: `${opts.playerName(ev.player)}'s turn`, kind: 'turn' } })
        break
      case 'FeatUsed':
        push({ kind: 'banner', events: [se], baseMs: BEAT_MS.feat, applyAt: 'start', banner: { text: `${opts.modelName(ev.casterId)}: feat!`, kind: 'feat' } })
        break
      case 'ScenarioScored':
        if (ev.delta) push({ kind: 'score', events: [se], baseMs: BEAT_MS.score, applyAt: 'start', banner: { text: `${opts.playerName(ev.player)} +${ev.delta} VP`, kind: 'info' } })
        else pending.push(se)
        break
      case 'GameEnded':
        push({ kind: 'banner', events: [se], baseMs: BEAT_MS.game, applyAt: 'start', banner: { text: ev.winner ? `${opts.playerName(ev.winner)} wins` : 'Draw', kind: 'game' } })
        break
      default:
        pending.push(se)
    }
  }
  flush()
  return beats
}

function findTarget(before: GameState, events: readonly SeqEvent[], attackId: string): ModelId | null {
  for (const se of events) if (se.event.type === 'AttackDeclared' && se.event.attackId === attackId) return se.event.targetId
  // declared in an earlier batch (a boost decision sat in between): the open attack still names its target
  return before.attack?.attackId === attackId ? before.attack.targetId : null
}
