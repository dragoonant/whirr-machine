import { describe, expect, it } from 'vitest'
import { attackSound, endScene, endVoice, soundsForEvent, spellSound } from '../../src/client/audio/eventSounds'
import { AUDIO_BY_ID } from '../../src/client/audio/manifest'
import { BATTLE_ORDER } from '../../src/client/audio/music'
import { TRIMS } from '../../src/client/audio/trims'
import { sanitizeAudioSettings } from '../../src/client/audio/settings'
import type { GameEvent } from '../../src/engine/index'

const ids = (evs: ReturnType<typeof soundsForEvent>) => evs.map((s) => s.id)

describe('audio event mapping', () => {
  it('only names sounds that exist in the manifest', () => {
    const samples: GameEvent[] = [
      { type: 'RoundStarted', round: 1 },
      { type: 'TurnStarted', round: 1, turn: 1, player: 'A' },
      { type: 'RollBoosted', roll: 'attack', modelId: 'm', source: 'focus' },
      { type: 'SpellCast', casterId: 'c', spellId: 'x.s.frost-bite', originId: 'c', cost: 2 },
      { type: 'GameEnded', winner: 'A', reason: 'assassination', vp: { A: 0, B: 0 } },
    ] as GameEvent[]
    for (const e of samples) for (const s of soundsForEvent(e, { perspective: 'A' })) expect(AUDIO_BY_ID[s.id], s.id).toBeDefined()
  })

  it('picks a shot by weapon flavour and a power attack by kind', () => {
    const base = { type: 'AttackDeclared', attackId: 'a', attackerId: 'm', originId: 'm', targetId: 't', additional: false } as const
    expect(attackSound({ ...base, kind: 'ranged', weaponId: 'kha.w.slug-cannon' })?.id).toBe('gun-slug-cannon')
    expect(attackSound({ ...base, kind: 'melee', weaponId: 'kha.w.mechanika-axe' })?.id).toBe('melee-axe')
    expect(attackSound({ ...base, kind: 'power', powerKind: 'throw' })?.id).toBe('pa-throw')
    expect(spellSound('x.s.hoarfrost')).toBe('spell-frost')
    expect(spellSound('x.s.deflection')).toBe('spell-arcane-bolt')
  })

  it('plays a footstep for every real move, heavy or not, and every trim names a manifest asset', () => {
    const state = { models: { j: { type: 'warEngine', owner: 'A' }, t: { type: 'trooper', owner: 'A' } }, players: {} } as never
    const mv = (modelId: string): GameEvent => ({ type: 'ModelMoved', modelId, kind: 'normal', distance: 3 }) as unknown as GameEvent
    expect(ids(soundsForEvent(mv('j'), { state }))).toEqual(['we-step'])
    expect(ids(soundsForEvent(mv('t'), { state }))).toEqual(['move-troops'])
    for (const id of Object.keys(TRIMS)) expect(AUDIO_BY_ID[id], id).toBeDefined()
  })

  it('narrates from the human seat', () => {
    const turn = (player: 'A' | 'B'): GameEvent => ({ type: 'TurnStarted', round: 1, turn: 1, player })
    expect(ids(soundsForEvent(turn('A'), { perspective: 'A' }))).toEqual(['vo-your-turn'])
    expect(ids(soundsForEvent(turn('B'), { perspective: 'A' }))).toEqual(['vo-enemy-turn'])
    expect(soundsForEvent(turn('B'))).toEqual([])
    expect(endVoice('B', 'A')).toBe('vo-defeat')
    expect(endScene('B', 'A')).toBe('defeat')
    expect(endScene('A', 'A')).toBe('victory')
    expect(endVoice(null, 'A')).toBeNull()
  })

  it('has battle themes alternating and sanitises settings', () => {
    expect(BATTLE_ORDER.map((id) => AUDIO_BY_ID[id]?.kind)).toEqual(['music', 'music', 'music', 'music'])
    expect(sanitizeAudioSettings({ master: 5, music: -1, muted: true })).toMatchObject({ master: 1, music: 0, muted: true })
    expect(sanitizeAudioSettings(null).sfx).toBe(1)
  })
})
