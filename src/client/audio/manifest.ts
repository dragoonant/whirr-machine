// Runtime mirror of tools/audio-manifest.json (ids, kinds, groups, loop flags, narrator text). Prompts stay in the tools file.
// SFX and voice live at audio/<id>.mp3, music at audio/music/<id>.mp3 (relative to the site base).
export type AudioKind = 'sfx' | 'voice' | 'music'

export interface AudioAsset {
  id: string
  kind: AudioKind
  group: string
  loop?: boolean
  durationSeconds?: number
  text?: string
}

export const AUDIO_ASSETS: readonly AudioAsset[] = [
  { id: 'we-step', kind: 'sfx', group: 'engine' },
  { id: 'we-boiler-idle', kind: 'sfx', group: 'engine', loop: true },
  { id: 'we-steam-vent', kind: 'sfx', group: 'engine' },
  { id: 'move-troops', kind: 'sfx', group: 'engine' },
  { id: 'melee-fist', kind: 'sfx', group: 'melee' },
  { id: 'melee-blade', kind: 'sfx', group: 'melee' },
  { id: 'melee-axe', kind: 'sfx', group: 'melee' },
  { id: 'melee-knife', kind: 'sfx', group: 'melee' },
  { id: 'melee-club', kind: 'sfx', group: 'melee' },
  { id: 'melee-shield', kind: 'sfx', group: 'melee' },
  { id: 'hit-trooper', kind: 'sfx', group: 'melee' },
  { id: 'attack-miss', kind: 'sfx', group: 'melee' },
  { id: 'pa-slam', kind: 'sfx', group: 'power' },
  { id: 'pa-throw', kind: 'sfx', group: 'power' },
  { id: 'pa-headbutt', kind: 'sfx', group: 'power' },
  { id: 'pa-trample', kind: 'sfx', group: 'power' },
  { id: 'gun-magelock-pistol', kind: 'sfx', group: 'gun' },
  { id: 'gun-dual-pistol', kind: 'sfx', group: 'gun' },
  { id: 'gun-spellstorm-pistol', kind: 'sfx', group: 'gun' },
  { id: 'gun-spellstorm-cannon', kind: 'sfx', group: 'gun' },
  { id: 'gun-magelock-rifle', kind: 'sfx', group: 'gun' },
  { id: 'gun-scattergun', kind: 'sfx', group: 'gun' },
  { id: 'gun-cannon', kind: 'sfx', group: 'gun' },
  { id: 'gun-cannon-blast', kind: 'sfx', group: 'gun' },
  { id: 'gun-slug-cannon', kind: 'sfx', group: 'gun' },
  { id: 'gun-grenade-launcher', kind: 'sfx', group: 'gun' },
  { id: 'gun-jack-buster', kind: 'sfx', group: 'gun' },
  { id: 'gun-carbine', kind: 'sfx', group: 'gun' },
  { id: 'gun-assault-cannon', kind: 'sfx', group: 'gun' },
  { id: 'gun-thrown-axe', kind: 'sfx', group: 'gun' },
  { id: 'spell-arcane-bolt', kind: 'sfx', group: 'spell' },
  { id: 'spell-frost', kind: 'sfx', group: 'spell' },
  { id: 'spell-lightning', kind: 'sfx', group: 'spell' },
  { id: 'focus-allocate', kind: 'sfx', group: 'ui' },
  { id: 'boost-whine', kind: 'sfx', group: 'ui' },
  { id: 'sys-crippled', kind: 'sfx', group: 'damage' },
  { id: 'we-wreck', kind: 'sfx', group: 'damage' },
  { id: 'death-cyg', kind: 'sfx', group: 'death' },
  { id: 'death-kha', kind: 'sfx', group: 'death' },
  { id: 'death-caster', kind: 'sfx', group: 'death' },
  { id: 'tough-save', kind: 'sfx', group: 'death' },
  { id: 'cloud-hiss', kind: 'sfx', group: 'env' },
  { id: 'fire-crackle', kind: 'sfx', group: 'env' },
  { id: 'corrosion-sizzle', kind: 'sfx', group: 'env' },
  { id: 'dice-2d6', kind: 'sfx', group: 'ui' },
  { id: 'dice-3d6', kind: 'sfx', group: 'ui' },
  { id: 'ui-click', kind: 'sfx', group: 'ui' },
  { id: 'turn-bell', kind: 'sfx', group: 'ui' },
  { id: 'vo-round-start', kind: 'voice', group: 'voice', text: "A new round begins." },
  { id: 'vo-your-turn', kind: 'voice', group: 'voice', text: "Your turn. Take command." },
  { id: 'vo-enemy-turn', kind: 'voice', group: 'voice', text: "The enemy moves." },
  { id: 'vo-control-phase', kind: 'voice', group: 'voice', text: "Control phase. Check the objectives." },
  { id: 'vo-boost', kind: 'voice', group: 'voice', text: "Boost!" },
  { id: 'vo-critical', kind: 'voice', group: 'voice', text: "Critical!" },
  { id: 'vo-assassination', kind: 'voice', group: 'voice', text: "Assassination!" },
  { id: 'vo-scenario-scored', kind: 'voice', group: 'voice', text: "The scenario is scored." },
  { id: 'vo-victory', kind: 'voice', group: 'voice', text: "Victory is yours. Well fought." },
  { id: 'vo-defeat', kind: 'voice', group: 'voice', text: "Defeat. The field is lost." },
  { id: 'music-title-a', kind: 'music', group: 'music', loop: true, durationSeconds: 75 },
  { id: 'music-battle-a-a', kind: 'music', group: 'music', loop: true, durationSeconds: 150 },
  { id: 'music-battle-b-a', kind: 'music', group: 'music', loop: true, durationSeconds: 150 },
  { id: 'music-victory-a', kind: 'music', group: 'music', durationSeconds: 12 },
  { id: 'music-defeat-a', kind: 'music', group: 'music', durationSeconds: 12 },
  { id: 'music-title-b', kind: 'music', group: 'music', loop: true, durationSeconds: 75 },
  { id: 'music-battle-a-b', kind: 'music', group: 'music', loop: true, durationSeconds: 150 },
  { id: 'music-battle-b-b', kind: 'music', group: 'music', loop: true, durationSeconds: 150 },
  { id: 'music-victory-b', kind: 'music', group: 'music', durationSeconds: 12 },
  { id: 'music-defeat-b', kind: 'music', group: 'music', durationSeconds: 12 },
]

/** Path relative to the site base, e.g. audio/we-step.mp3 or audio/music/music-title-a.mp3. */
export const audioPath = (a: Pick<AudioAsset, 'id' | 'kind'>): string =>
  a.kind === 'music' ? `audio/music/${a.id}.mp3` : `audio/${a.id}.mp3`

export const AUDIO_BY_ID: Readonly<Record<string, AudioAsset>> = Object.fromEntries(AUDIO_ASSETS.map((a) => [a.id, a]))
