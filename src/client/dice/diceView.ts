// Dice tray view model (50 section 8). Every RollPurpose has a renderer (the Record type forces it and a test checks it);
// an unknown purpose still renders generically. The target number is read from the presented STATE when the roll belongs
// to the attack in progress, and falls back to the event's own target only once the state no longer holds the attack.
import type { DiceRolled, GameEvent, GameState, Mod, RollPurpose } from '../../engine/index'
import type { ShownRoll } from '../contract'

export type Tone = 'good' | 'bad' | 'neutral'
export interface Verdict { word: string; tone: Tone }
export interface FeedEntryLike { seq: number; event: GameEvent }

export interface RollCtx {
  ev: DiceRolled
  target: number | null
  /** AttackResolved for this roll said crit. */
  crit: boolean
}

const passFail = (c: RollCtx): Verdict => (c.target === null ? total(c) : c.ev.total >= c.target ? { word: 'PASS', tone: 'good' } : { word: 'FAIL', tone: 'bad' })
const total = (c: RollCtx): Verdict => ({ word: `${c.ev.total}`, tone: 'neutral' })
const damageLike = (c: RollCtx): Verdict => {
  if (c.target === null) return total(c)
  const d = Math.max(0, c.ev.total - c.target)
  return d > 0 ? { word: `${d} dmg`, tone: 'good' } : { word: 'no damage', tone: 'bad' }
}

/** One renderer per roll purpose. Adding a purpose to the engine fails typecheck here until it is handled. */
export const PURPOSE_RENDERERS: Record<RollPurpose, (c: RollCtx) => Verdict> = {
  rollOff: total,
  attack: (c) => (c.target === null ? total(c) : c.ev.total >= c.target ? (c.crit ? { word: 'CRIT', tone: 'good' } : { word: 'HIT', tone: 'good' }) : { word: 'MISS', tone: 'bad' }),
  damage: damageLike,
  column: (c) => ({ word: `column ${c.ev.total}`, tone: 'neutral' }),
  tough: passFail,
  continuous: passFail,
  slamDist: (c) => ({ word: `${c.ev.total}"`, tone: 'neutral' }),
  throwDist: (c) => ({ word: `${c.ev.total}"`, tone: 'neutral' }),
  fall: damageLike,
  rof: total,
  d3: total,
  aoeTie: total,
  collateral: damageLike,
  spell: passFail,
  maintenance: passFail,
  scenario: passFail,
  other: passFail,
}

export const TARGET_WORD: Partial<Record<RollPurpose, string>> = { attack: 'DEF', damage: 'ARM', collateral: 'ARM', fall: 'ARM' }

/** Target number for a roll: from the live attack in the state when it is that attack's roll, else the event's own. */
export function rollTarget(state: GameState | null, ev: DiceRolled): number | null {
  const atk = state?.attack
  if (atk) {
    if (atk.rollId === ev.rollId && ev.purpose === 'attack') return atk.hitTarget
    const inst = atk.damageQueue.find((d) => d.rollId === ev.rollId)
    if (inst?.arm !== undefined) return inst.arm
  }
  return ev.target ?? null
}

export interface DieFace { value: number; kept: boolean }
export interface RollView {
  rollId: string
  seq: number
  purpose: RollPurpose
  label: string
  dice: DieFace[]
  mods: string[]
  total: number
  target: number | null
  targetWord: string
  verdict: Verdict
  boosted: boolean
  added: string[]
  removed: string[]
  rerolls: { source: string; before: number[]; after: number[] }[]
}

/** Which dice survived a keep-highest rule (multiset match, so equal faces are handled). */
export function keptFlags(dice: readonly number[], kept: readonly number[]): DieFace[] {
  const pool = [...kept]
  return dice.map((v) => {
    const i = pool.indexOf(v)
    if (i >= 0) { pool.splice(i, 1); return { value: v, kept: true } }
    return { value: v, kept: false }
  })
}

const modText = (m: Mod): string => `${m.label} ${m.mode === 'set' ? `=${m.value}` : m.value >= 0 ? `+${m.value}` : `−${Math.abs(m.value)}`}`

export function viewRoll(shown: Pick<ShownRoll, 'seq' | 'event' | 'label'>, state: GameState | null, feed: readonly FeedEntryLike[] = []): RollView {
  const ev = shown.event
  const target = rollTarget(state, ev)
  let crit = false
  const rerolls: RollView['rerolls'] = []
  for (const f of feed) {
    const e = f.event
    if (e.type === 'AttackResolved' && e.rollId === ev.rollId && e.crit) crit = true
    else if (e.type === 'DiceRerolled' && e.rollId === ev.rollId) rerolls.push({ source: e.sourceId, before: e.before, after: e.after })
  }
  const render = PURPOSE_RENDERERS[ev.purpose] ?? total
  return {
    rollId: ev.rollId, seq: shown.seq, purpose: ev.purpose, label: shown.label, dice: keptFlags(ev.dice, ev.kept), mods: (ev.mods ?? []).map(modText),
    total: ev.total, target, targetWord: TARGET_WORD[ev.purpose] ?? 'needs', verdict: render({ ev, target, crit }), boosted: !!ev.boosted,
    added: (ev.addedDice ?? []).map((a) => `+${a.count}d6 ${a.source}`), removed: (ev.removedDice ?? []).map((a) => `−${a.count}d6 ${a.source}`), rerolls,
  }
}
