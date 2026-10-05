// Engine events -> sounds. Pure: no audio calls, so it is easy to test. `playEventSounds` is the only function that
// touches the manager. Shots are per weapon (src/client/weaponFlavour.ts), the same classification the VFX read.
// Narrator lines are perspective-aware: "your turn" / "the enemy moves", victory / defeat for the human seat.
import type { GameEvent, GameState, ModelState, PlayerId } from '../../engine/index'
import { weaponFlavour } from '../weaponFlavour'
import type { AudioManager, PlayOptions } from './manager'

export interface EventSound { id: string; opts?: PlayOptions }

export interface SoundContext {
  /** The human seat. Omit (bot vs bot, hot seat) for neutral lines. */
  perspective?: PlayerId | undefined
  /** State the event is played against (model type, owner, faction). Optional: unknown models get the generic sound. */
  state?: GameState | null | undefined
}

const model = (ctx: SoundContext, id: string | undefined): ModelState | undefined => (id ? ctx.state?.models?.[id] : undefined)
const heavy = (m: ModelState | undefined): boolean => m?.type === 'warEngine' || m?.type === 'battleEngine'

function factionOf(ctx: SoundContext, m: ModelState | undefined): string {
  return (m && ctx.state?.players?.[m.owner]?.faction) || ''
}

/** Spell sound from the spell id's wording; anything unrecognised is the arcane bolt. */
export function spellSound(spellId: string | undefined): string {
  const s = (spellId ?? '').toLowerCase()
  if (/frost|freez|ice|cold|chill|rime/.test(s)) return 'spell-frost'
  if (/lightning|arc-?node|storm|shock|electr|thunder|arcing/.test(s)) return 'spell-lightning'
  return 'spell-arcane-bolt'
}

const POWER_SOUND = { slam: 'pa-slam', throw: 'pa-throw', headbutt: 'pa-headbutt', trample: 'pa-trample' } as const

/** Sound for an attack declaration: power attacks by kind, spells by wording, weapons by flavour. */
export function attackSound(e: Extract<GameEvent, { type: 'AttackDeclared' }>): EventSound | null {
  if (e.kind === 'trample') return { id: POWER_SOUND.trample }
  if (e.kind === 'power' || e.powerKind) return { id: POWER_SOUND[e.powerKind ?? 'slam'] }
  if (e.kind === 'arcane' || e.spellId) return e.weaponId ? flavourSound(e.weaponId, false, e.kind) : { id: spellSound(e.spellId) }
  if (e.weaponId) return flavourSound(e.weaponId, e.kind === 'melee', e.kind)
  return { id: e.kind === 'melee' ? 'melee-fist' : 'gun-magelock-pistol' }
}

function flavourSound(weaponId: string, melee: boolean, kind: string): EventSound {
  const f = weaponFlavour(weaponId, melee)
  return { id: kind === 'aoe' && f.sfxAlt ? f.sfxAlt : f.sfx }
}

const VOICE: PlayOptions = { detuneJitter: 0 }
const DICE_PURPOSES = new Set(['attack', 'damage', 'spell', 'slamDist', 'throwDist', 'fall', 'collateral'])

/** Sounds for one engine event. */
export function soundsForEvent(e: GameEvent, ctx: SoundContext = {}): EventSound[] {
  switch (e.type) {
    case 'RoundStarted':
      return [{ id: 'turn-bell' }, { id: 'vo-round-start', opts: VOICE }]
    case 'TurnStarted':
      if (!ctx.perspective) return []
      return [{ id: e.player === ctx.perspective ? 'vo-your-turn' : 'vo-enemy-turn', opts: VOICE }]
    case 'PhaseChanged':
      return e.phase === 'control' ? [{ id: 'vo-control-phase', opts: VOICE }] : []
    case 'ActivationStarted':
      return heavy(model(ctx, e.modelIds[0])) ? [{ id: 'we-steam-vent', opts: { volume: 0.7 } }] : []
    case 'ModelMoved': {
      if (e.kind === 'deploy' || e.kind === 'place' || e.kind === 'push' || e.distance < 0.5) return []
      return heavy(model(ctx, e.modelId)) ? [{ id: 'we-step' }] : [{ id: 'move-troops', opts: { volume: 0.8 } }]
    }
    case 'DiceRolled': {
      if (e.purpose === 'tough') return [{ id: 'tough-save' }]
      if (!DICE_PURPOSES.has(e.purpose)) return []
      return [{ id: e.dice.length >= 3 ? 'dice-3d6' : 'dice-2d6', opts: { volume: 0.8 } }]
    }
    case 'FocusChanged':
      return e.delta > 0 && e.reason === 'allocate' ? [{ id: 'focus-allocate' }] : []
    case 'RollBoosted':
      return [{ id: 'boost-whine' }, { id: 'vo-boost', opts: VOICE }]
    case 'AttackDeclared': {
      const s = attackSound(e)
      return s ? [s] : []
    }
    case 'AttackResolved':
      if (!e.hit && e.auto !== 'hit') return [{ id: 'attack-miss', opts: { volume: 0.8 } }]
      return e.crit ? [{ id: 'vo-critical', opts: VOICE }] : []
    case 'DamageApplied': {
      const t = model(ctx, e.targetId)
      return e.points > 0 && t && !heavy(t) && t.type !== 'leader' ? [{ id: 'hit-trooper', opts: { volume: 0.7 } }] : []
    }
    case 'SystemCrippled':
      return [{ id: 'sys-crippled' }]
    case 'LifeStateChanged': {
      if (e.to === 'active') return []
      const m = model(ctx, e.modelId)
      if (heavy(m)) return [{ id: e.to === 'disabled' ? 'sys-crippled' : 'we-wreck' }]
      if (e.to === 'disabled') return []
      if (m?.type === 'leader') return [{ id: 'death-caster' }]
      const f = factionOf(ctx, m)
      return [{ id: f.startsWith('kha') ? 'death-kha' : 'death-cyg' }]
    }
    case 'SpellCast':
      return [{ id: spellSound(e.spellId) }]
    case 'FeatUsed':
      return [{ id: 'boost-whine' }, { id: 'turn-bell', opts: { volume: 0.7 } }]
    case 'CloudCreated':
      return [{ id: 'cloud-hiss' }]
    case 'ConditionAdded':
      return e.condition === 'fire' ? [{ id: 'fire-crackle' }] : e.condition === 'corrosion' ? [{ id: 'corrosion-sizzle' }] : []
    case 'ScenarioScored':
      return e.delta > 0 ? [{ id: 'vo-scenario-scored', opts: VOICE }] : []
    case 'GameEnded': {
      const line = e.reason === 'assassination' && e.winner && e.winner === ctx.perspective ? 'vo-assassination' : null
      const out: EventSound[] = []
      if (line) out.push({ id: line, opts: { ...VOICE, interrupt: true } })
      const verdict = endVoice(e.winner, ctx.perspective)
      if (verdict) out.push({ id: verdict, opts: { ...VOICE, interrupt: true } })
      return out
    }
    default:
      return []
  }
}

/** Victory or defeat line for a finished game from a seat's point of view; null for a draw. */
export function endVoice(winner: PlayerId | null, perspective: PlayerId | undefined): 'vo-victory' | 'vo-defeat' | null {
  if (!winner) return null
  return !perspective || winner === perspective ? 'vo-victory' : 'vo-defeat'
}

/** Music scene a game-over should switch to (a draw is a defeat-toned stinger only if the human did not win). */
export function endScene(winner: PlayerId | null, perspective: PlayerId | undefined): 'victory' | 'defeat' {
  return endVoice(winner, perspective) === 'vo-defeat' || (!winner && !!perspective) ? 'defeat' : 'victory'
}

/** Play every sound mapped from the events (and cue the stinger on game over). */
export function playEventSounds(audio: AudioManager, events: readonly GameEvent[], ctx: SoundContext = {}): void {
  for (const e of events) {
    if (e.type === 'GameEnded') audio.setMusicScene(endScene(e.winner, ctx.perspective))
    for (const s of soundsForEvent(e, ctx)) audio.play(s.id, s.opts)
  }
}
