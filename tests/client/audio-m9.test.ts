import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { factionLine, leaderLine, soundsForEvent, spellSound } from '../../src/client/audio/eventSounds'
import { AUDIO_ASSETS, AUDIO_BY_ID } from '../../src/client/audio/manifest'
import { TRIMS } from '../../src/client/audio/trims'
import { weaponFlavour } from '../../src/client/weaponFlavour'
import type { GameEvent } from '../../src/engine/index'

const ev = (e: unknown) => e as GameEvent
const ids = (e: GameEvent, ctx = {}) => soundsForEvent(e, ctx).map((s) => s.id)

describe('M9 audio', () => {
  it('every manifest clip exists on disk and has a trim', () => {
    for (const a of AUDIO_ASSETS.filter((x) => x.kind !== 'music')) {
      expect(existsSync(join(__dirname, '../../public/audio', `${a.id}.mp3`)), a.id).toBe(true)
      expect(TRIMS[a.id], a.id).toBeGreaterThan(0)
    }
  })
  it('maps fury events to sounds that exist', () => {
    const out = [
      ev({ type: 'Frenzied', beastId: 'b', targetId: null, tiedIds: [] }),
      ev({ type: 'DamageTransferred', warlockId: 'w', beastId: 'b', points: 3, absorbed: 3, overflow: 0 }),
      ev({ type: 'FuryLeeched', warlockId: 'w', sources: [{ modelId: 'b', points: 2 }], selfPoints: 0, spiritBond: 0, after: 3 }),
      ev({ type: 'BeastForced', beastId: 'b', controllerId: 'w', purpose: 'run', gained: 1, after: 1 }),
    ].flatMap((e) => ids(e))
    expect(out).toEqual(['fury-frenzy', 'vo-frenzy', 'fury-transfer', 'vo-fury-transferred', 'fury-leach', 'fury-force'])
    for (const id of out) expect(AUDIO_BY_ID[id], id).toBeDefined()
    expect(ids(ev({ type: 'DamageTransferred', warlockId: 'w', beastId: 'b', points: 0, absorbed: 0, overflow: 0 }))).toEqual([])
  })
  it('names new factions and leaders, and skips the original two', () => {
    expect(factionLine('cry')).toBe('vo-faction-cry')
    expect(factionLine('cyg')).toBeNull()
    expect(leaderLine('trl.gunnbjorn')).toBe('vo-leader-gunnbjorn')
    expect(leaderLine('cyg.caine')).toBeNull()
  })
  it('gives new weapons and spells their own sounds', () => {
    expect(weaponFlavour('cry.w.tusks', true).sfx).toBe('melee-bite')
    expect(weaponFlavour('men.w.flame-belcher').sfx).toBe('gun-flame-jet')
    expect(weaponFlavour('cry.w.soul-cannon').sfx).toBe('gun-soul-shot')
    expect(spellSound('men.s.incite')).toBe('spell-choir-hum')
    expect(spellSound('cry.s.arc-node')).toBe('spell-arc-node')
  })
  it('plays per-faction footsteps, beast deaths and warlock down', () => {
    const m = (id: string, type: string, profileId: string, owner: string, extra = {}) => ({ id, type, profileId, owner, ...extra })
    const state = {
      round: 2,
      players: { A: { faction: 'cry' }, B: { faction: 'cir' } },
      models: { j: m('j', 'warEngine', 'cry.hades', 'A'), w: m('w', 'beast', 'cir.pureblood', 'B'), l: m('l', 'leader', 'cir.tanith', 'B', { fury: 3 }), t: m('t', 'trooper', 'cir.ravager-1', 'B') },
    } as never
    const mv = (modelId: string) => ev({ type: 'ModelMoved', modelId, kind: 'move', distance: 3 })
    expect(ids(mv('j'), { state })).toEqual(['jack-bone-clatter'])
    expect(ids(mv('w'), { state })).toEqual(['bst-warpwolf-step'])
    const dead = (modelId: string) => ev({ type: 'LifeStateChanged', modelId, from: 'active', to: 'dead' })
    expect(ids(dead('w'), { state })).toEqual(['death-beast'])
    expect(ids(dead('l'), { state })).toEqual(['death-caster', 'vo-warlock-down'])
    expect(ids(dead('t'), { state })).toEqual(['death-cir'])
  })
})
