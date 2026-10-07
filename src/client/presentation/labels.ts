// Display names and narration lines, in our own words. Names come from the data bundle; numbers come from events
// (never recomputed here).
import { loadBundle } from '../../data/index'
import type { DiceRolled, GameEvent, GameState, Id, PlayerId, RollPurpose } from '../../engine/index'
import { NEUTRAL_COLOUR, SIDE_COLOURS, type SideColours } from '../board/layout'
import { usePaintStore } from '../figures/paintStore'

const recordName = (id: Id | undefined): string | undefined => {
  if (!id) return undefined
  const r = loadBundle().byId[id] as { name?: string } | undefined
  return r?.name
}

/** Display name of a model or unit (falls back to its id). */
export function modelName(state: GameState | null, id: Id | undefined | null): string {
  if (!id) return '?'
  if (!state) return id
  const m = state.models[id]
  if (m) return recordName(m.profileId) ?? id
  const u = state.units[id]
  if (u) return recordName(u.profileId) ?? id
  return recordName(id) ?? id
}

/** Display name of any data record (weapon, spell, feat, ability, scenario, list, faction). */
export function dataName(id: Id | undefined | null): string { return (id && recordName(id)) || (id ?? '?') }

/** "Khador" / the player's chosen name, falling back to "Player A". */
export function playerName(state: GameState | null, p: PlayerId | null | undefined): string {
  if (!p) return 'Nobody'
  const custom = state?.setup.names?.[p]
  if (custom) return custom
  const fac = state?.players?.[p]?.faction
  const fn = fac ? recordName(fac) : undefined
  return fn ? `${fn} (${p})` : `Player ${p}`
}

/** Every roll purpose has a label, so the dice tray never renders a roll silently (50 §8). */
export const ROLL_PURPOSE_LABELS: Record<RollPurpose, string> = {
  rollOff: 'Roll-off', attack: 'Attack roll', damage: 'Damage roll', column: 'Grid column', tough: 'Toughness check',
  continuous: 'Lingering effect', slamDist: 'Slam distance', throwDist: 'Throw distance', fall: 'Falling damage',
  rof: 'Rate of fire', d3: 'D3 roll', aoeTie: 'Blast tie-break', collateral: 'Collateral damage', spell: 'Spell roll',
  maintenance: 'Upkeep roll', scenario: 'Scenario roll', other: 'Roll',
  threshold: 'Threshold check', frenzyTie: 'Frenzy tie-break', // M9
}

export function rollLabel(state: GameState | null, ev: DiceRolled): string {
  const base = ROLL_PURPOSE_LABELS[ev.purpose] ?? 'Roll'
  return ev.ownerId ? `${modelName(state, ev.ownerId)}: ${base}` : base
}

/** Short result word for a roll against a target (from the event's own target; null when there is none). */
export function rollVerdict(ev: DiceRolled): string | null {
  if (ev.target === undefined) return null
  if (ev.purpose === 'damage') return ev.total > ev.target ? `${ev.total - ev.target} dmg` : 'no damage'
  return ev.total >= ev.target ? 'pass' : 'fail'
}

const moveVerb: Record<string, string> = {
  advance: 'advances', run: 'runs', charge: 'charges', slam: 'is slammed', throw: 'is thrown', push: 'is pushed',
  place: 'is placed', trample: 'tramples', fall: 'falls', reposition: 'repositions', deploy: 'deploys', ambush: 'arrives',
  leastDisturbance: 'is nudged clear',
}

/** One narration line for an event, or null for events not worth a line. `state` supplies names only. */
export function narrate(state: GameState | null, ev: GameEvent): string | null {
  const n = (id: Id | undefined) => modelName(state, id)
  switch (ev.type) {
    case 'RollOffWon': return `${playerName(state, ev.winner)} wins the roll-off`
    case 'TurnOrderChosen': return `${playerName(state, ev.firstPlayer)} will go first`
    case 'EdgeChosen': return `${playerName(state, ev.player)} takes the ${ev.edge} edge`
    case 'RoundStarted': return `Round ${ev.round} begins`
    case 'TurnStarted': return `${playerName(state, ev.player)} takes the field`
    case 'ActivationStarted': return `${n(ev.activeId)} activates`
    case 'ModelMoved': return ev.distance > 0.05 ? `${n(ev.modelId)} ${moveVerb[ev.kind] ?? 'moves'} ${ev.distance.toFixed(1)}"` : null
    case 'ChargeDeclared': return `${n(ev.modelId)} charges toward ${n(ev.targetId)}`
    case 'ChargeResolved': return ev.success ? `The charge connects` : `The charge falls short`
    case 'AttackDeclared': return `${n(ev.attackerId)} attacks ${n(ev.targetId)}${ev.weaponId ? ` with ${dataName(ev.weaponId)}` : ''}`
    case 'AttackResolved': return ev.auto === 'hit' ? 'Automatic hit' : ev.auto === 'miss' ? 'Automatic miss' : ev.crit ? 'Critical hit!' : ev.hit ? 'Hit' : 'Miss'
    case 'DamageApplied': return ev.points > 0 ? `${n(ev.targetId)} takes ${ev.points} damage` : `${n(ev.targetId)} shrugs it off`
    case 'PowerFieldUsed': return `${n(ev.modelId)}'s power field soaks ${ev.reduced}`
    case 'SystemCrippled': return `${n(ev.modelId)}: system ${ev.system} crippled`
    case 'Healed': return `${n(ev.modelId)} recovers ${ev.points}`
    case 'LifeStateChanged':
      if (ev.to === 'disabled') return `${n(ev.modelId)} is down`
      if (ev.to === 'boxed' || ev.to === 'destroyed') return `${n(ev.modelId)} is destroyed`
      if (ev.to === 'active' && ev.from === 'disabled') return `${n(ev.modelId)} gets back up`
      return null
    case 'SpellCast': return `${n(ev.casterId)} casts ${dataName(ev.spellId)}${ev.targetId ? ` on ${n(ev.targetId)}` : ''}`
    case 'FeatUsed': return `${n(ev.casterId)} unleashes ${dataName(ev.featId)}`
    case 'ConditionAdded': return `${n(ev.modelId)} is ${conditionWord(ev.condition)}`
    case 'ScenarioScored': return ev.delta ? `${playerName(state, ev.player)} scores ${ev.delta} VP (${ev.vp.A}–${ev.vp.B})` : null
    case 'KillBoxScored': return `${playerName(state, ev.beneficiary)} gains ${ev.vp} VP from the kill box`
    case 'WarEngineInert': return `${n(ev.modelId)} goes inert`
    case 'GameEnded': return ev.winner ? `${playerName(state, ev.winner)} wins by ${endWord(ev.reason)}` : `The game ends in a draw`
    default: return null
  }
}

function conditionWord(c: string): string {
  switch (c) {
    case 'knockedDown': return 'knocked down'
    case 'stationary': return 'held in place'
    case 'disrupted': return 'disrupted'
    case 'fire': return 'set alight'
    case 'corrosion': return 'corroding'
    case 'inert': return 'inert'
    default: return c
  }
}

export function endWord(reason: string): string {
  switch (reason) {
    case 'assassination': return 'assassination'
    case 'scenario': return 'scenario points'
    case 'roundLimit': return 'points at the round limit'
    case 'tiebreakPresence': return 'board presence'
    case 'concession': return 'concession'
    default: return reason
  }
}

// ---------- side colours (faction palettes) ----------
// Each side wears its faction's palette (faction.json palette.primary/secondary/ui). In a mirror match, or when two
// factions' UI colours are too close to tell apart, side B gets a contrasting alternate: hue turned and darkened.
type Rgb = [number, number, number]
const HEXRE = /^#[0-9a-fA-F]{6}$/
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const toHex = (c: Rgb): string => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
function toHsv([r, g, b]: Rgb): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d > 0) h = mx === r ? (((g - b) / d) % 6 + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, mx ? d / mx : 0, mx / 255]
}
function fromHsv(h: number, s: number, v: number): Rgb {
  const f = (n: number) => { const k = (n + h / 60) % 6; return 255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))) }
  return [f(5), f(3), f(1)]
}
const rgbDistance = (a: string, b: string): number => { const x = toRgb(a), y = toRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }

/** A contrasting alternate of a colour: hue turned 150 degrees, value darkened (never equal to the input). */
export function altColour(hex: string, darken = 0.8): string {
  if (!HEXRE.test(hex)) return hex
  const [h, s, v] = toHsv(toRgb(hex))
  const out = toHex(fromHsv((h + 150) % 360, Math.max(s, 0.35), Math.max(0.2, v * darken)))
  return out.toLowerCase() === hex.toLowerCase() ? toHex(fromHsv((h + 150) % 360, Math.max(s, 0.35), v > 0.5 ? v * 0.6 : Math.min(1, v + 0.4))) : out
}

interface PaletteRec { primary?: string; secondary?: string; ui?: string }
const paletteOf = (faction: string | undefined): PaletteRec => ((faction ? (loadBundle().byId[faction] as { palette?: PaletteRec } | undefined) : undefined)?.palette) ?? {}
const okHex = (c: string | undefined, fallback: string): string => (c && HEXRE.test(c) ? c : fallback)

/** The faction's own colours as side colours (fallback to the neutral gold). */
export function factionSideColours(faction: string | undefined): SideColours {
  const p = paletteOf(faction)
  const ui = okHex(p.ui, NEUTRAL_COLOUR)
  return { primary: okHex(p.primary, ui), secondary: okHex(p.secondary, '#c8c8c8'), ring: ui, zone: ui }
}

/** Same colours with the alternate treatment (side B in a mirror or a clash). */
export function altSideColours(c: SideColours): SideColours {
  return { primary: altColour(c.primary), secondary: altColour(c.secondary), ring: altColour(c.ring, 0.85), zone: altColour(c.zone, 0.85) }
}

/** Colours for both sides. Side A keeps its faction colours; B takes the alternate on a mirror or near-identical UI colours. */
export function sideColoursFor(factionA: string | undefined, factionB: string | undefined): { colours: Record<PlayerId, SideColours>; altB: boolean } {
  const a = factionSideColours(factionA), b = factionSideColours(factionB)
  const altB = (!!factionA && factionA === factionB) || rgbDistance(a.ring, b.ring) < 90
  return { colours: { A: a, B: altB ? altSideColours(b) : b }, altB }
}

/**
 * Point SIDE_COLOURS (rings, zones, procedural figures, objective control) at the factions in this game, and in a
 * mirror give side B's GLB figures the alternate paint too. Called whenever a game starts or loads.
 */
export function applySideColours(state: GameState | null): void {
  const { colours, altB } = sideColoursFor(state?.players?.A?.faction, state?.players?.B?.faction)
  Object.assign(SIDE_COLOURS.A, colours.A)
  Object.assign(SIDE_COLOURS.B, colours.B)
  const paint = usePaintStore.getState()
  paint.setSide('A', undefined)
  paint.setSide('B', altB ? { primary: colours.B.primary, secondary: colours.B.secondary } : undefined)
}
