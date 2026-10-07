// Engine events -> sounds. Pure: no audio calls, so it is easy to test. `playEventSounds` is the only function that
// touches the manager. Shots are per weapon (src/client/weaponFlavour.ts), the same classification the VFX read.
// Narrator lines are perspective-aware: "your turn" / "the enemy moves", victory / defeat for the human seat.
import type { GameEvent, GameState, ModelState, PlayerId } from '../../engine/index'
import { weaponFlavour } from '../weaponFlavour'
import { AUDIO_BY_ID } from './manifest'
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
const isBeast = (m: ModelState | undefined): boolean => m?.type === 'beast'
const isWarlock = (m: ModelState | undefined): boolean => m?.type === 'leader' && m.fury !== undefined

/** New factions with their own deaths and narrator lines (M9). Cygnar and Khador keep the original lines. */
const NEW_FACTIONS = ['trl', 'cir', 'cry', 'men'] as const
const DEATH_BY_FACTION: Record<string, string> = { trl: 'death-trl', cir: 'death-cir', cry: 'death-cry', men: 'death-men' }

/** Narrator line naming a new faction ("Cryx."), for the army picker and the first turn. Null for the original two. */
export function factionLine(factionId: string | undefined): string | null {
  return factionId && (NEW_FACTIONS as readonly string[]).includes(factionId) ? `vo-faction-${factionId}` : null
}

/** Narrator line naming a new leader from its profile id ("trl.gunnbjorn"), for selection and the first activation. Null if none exists. */
export function leaderLine(profileId: string | undefined): string | null {
  const slug = profileId?.split('.')[1]
  const id = slug ? `vo-leader-${slug}` : ''
  return id && AUDIO_BY_ID[id] ? id : null
}

/** Footstep for a warbeast by faction and kind: troll thud, warpwolf paws, wold stone grind. */
function beastStep(profileId: string): string {
  if (profileId.startsWith('trl.')) return 'bst-troll-step'
  if (profileId.startsWith('cir.')) return /wolf|pureblood/.test(profileId) ? 'bst-warpwolf-step' : 'bst-wold-grind'
  return 'bst-troll-step'
}

/** Engine step by faction: Cryx bone-jacks clatter, Menoth crusaders clank, the rest are steam engines. */
function engineStep(f: string): string {
  return f === 'cry' ? 'jack-bone-clatter' : f === 'men' ? 'jack-crusader-step' : 'we-step'
}

function factionOf(ctx: SoundContext, m: ModelState | undefined): string {
  return (m && ctx.state?.players?.[m.owner]?.faction) || ''
}

/** Spell sound from the spell id's wording; anything unrecognised is the arcane bolt. */
export function spellSound(spellId: string | undefined): string {
  const s = (spellId ?? '').toLowerCase()
  if (/frost|freez|ice|cold|chill|rime/.test(s)) return 'spell-frost'
  if (/arc-?node/.test(s)) return 'spell-arc-node'
  if (/^men\.s\./.test(s) || /choir|hymn|litany/.test(s)) return 'spell-choir-hum'
  if (/lightning|storm|shock|electr|thunder|arcing/.test(s)) return 'spell-lightning'
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
    case 'TurnStarted': {
      // Round 1: a new faction is named instead of the generic turn line (one narrator line per beat plays)
      const fl = ctx.state && ctx.state.round <= 1 ? factionLine(ctx.state.players?.[e.player]?.faction) : null
      if (fl) return [{ id: fl, opts: VOICE }]
      if (!ctx.perspective) return []
      return [{ id: e.player === ctx.perspective ? 'vo-your-turn' : 'vo-enemy-turn', opts: VOICE }]
    }
    case 'PhaseChanged':
      return e.phase === 'control' ? [{ id: 'vo-control-phase', opts: VOICE }] : []
    case 'ActivationStarted': {
      const m = model(ctx, e.modelIds[0])
      if (isBeast(m)) {
        // a growl on activation: trolls grunt, warpwolves howl, wolds stay silent
        const id = m!.profileId.startsWith('trl.') ? 'bst-troll-grunt' : /wolf|pureblood/.test(m!.profileId) ? 'bst-warpwolf-howl' : ''
        return id ? [{ id, opts: { volume: 0.7 } }] : []
      }
      if (m?.type === 'leader' && (ctx.state?.round ?? 9) <= 1) {
        const l = leaderLine(m.profileId)
        if (l) return [{ id: l, opts: VOICE }]
      }
      return heavy(m) ? [{ id: 'we-steam-vent', opts: { volume: 0.7 } }] : []
    }
    case 'ModelMoved': {
      if (e.kind === 'deploy' || e.kind === 'place' || e.kind === 'push' || e.distance < 0.5) return []
      const m = model(ctx, e.modelId)
      if (isBeast(m)) return [{ id: beastStep(m!.profileId) }]
      return heavy(m) ? [{ id: engineStep(factionOf(ctx, m)) }] : [{ id: 'move-troops', opts: { volume: 0.8 } }]
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
      if (isBeast(m)) return [{ id: 'death-beast' }]
      if (isWarlock(m)) return [{ id: 'death-caster' }, { id: 'vo-warlock-down', opts: VOICE }]
      if (m?.type === 'leader') return [{ id: 'death-caster' }]
      const f = factionOf(ctx, m)
      return [{ id: DEATH_BY_FACTION[f] ?? (f.startsWith('kha') ? 'death-kha' : 'death-cyg') }]
    }
    case 'SpellCast':
      return [{ id: spellSound(e.spellId) }]
    case 'FeatUsed':
      return [{ id: 'boost-whine' }, { id: 'turn-bell', opts: { volume: 0.7 } }]
    case 'CloudCreated':
      return [{ id: 'cloud-hiss' }]
    case 'ConditionAdded':
      return e.condition === 'fire' ? [{ id: 'fire-crackle' }] : e.condition === 'corrosion' ? [{ id: 'corrosion-sizzle' }] : []
    // fury (M9): leech draw, forcing strain, frenzy roar, damage transfer
    case 'FuryLeeched':
      return e.sources.length > 0 || e.selfPoints > 0 ? [{ id: 'fury-leach' }] : []
    case 'BeastForced':
      return e.gained > 0 ? [{ id: 'fury-force', opts: { volume: 0.8 } }] : []
    case 'Frenzied':
      return [{ id: 'fury-frenzy' }, { id: 'vo-frenzy', opts: VOICE }]
    case 'DamageTransferred':
      return e.absorbed > 0 ? [{ id: 'fury-transfer' }, { id: 'vo-fury-transferred', opts: VOICE }] : []
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
