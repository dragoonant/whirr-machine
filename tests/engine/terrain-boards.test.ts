import { describe, expect, it } from 'vitest'
import { resistsDamageType } from '../../src/engine/code-hooks'
import { defModifiers, losReport } from '../../src/engine/los'
import { resolveAdvance, resolveCharge } from '../../src/engine/movement'
import { elevationAt, insideCoverOf, terrainTraits } from '../../src/engine/terrain'
import type { GameEvent } from '../../src/engine/events'
import type { GameState, TerrainInstance } from '../../src/engine/types'
import { asOut, bundle, choose, place, send, startState } from './action-helpers'
import { mdl, ter, world } from './geometryHelpers'

type Any = Record<string, any>
const piece = (pid: string, id: string, x: number, z: number, rot = 0): TerrainInstance => {
  const t = bundle.byId[pid] as unknown as Any
  return { id, pieceId: pid, rulesType: t.rulesType, pos: { x, z }, rot, footprint: t.footprint, height: t.height, props: t.props ?? {} }
}
const info = { spd: 6 }

/** The Quick Start game at the first activation with `terrain` on the table and only `keep` models near the middle. */
function arena(terrain: TerrainInstance[], keep: Record<string, { x: number; z: number }>) {
  const out = startState()
  let s: GameState = { ...out.state, terrain }
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep[m.id]) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  for (const [id, p] of Object.entries(keep)) s = place(s, id, p)
  return asOut(s)
}
/** Hand the activation to the owner of model id (the first game decision belongs to Khador). */
function asB(out: ReturnType<typeof arena>, id: string) {
  const st = { ...out.state, models: { ...out.state.models, [id]: { ...out.state.models[id]!, activated: false } } }
  const o = asOut({ ...st, activePlayer: id[0] as 'A' | 'B', decisionSeq: 900, pending: { ...st.pending, kind: 'chooseActivation', player: id[0] as 'A' | 'B', id: 'd:900', options: [] } })
  return choose(o, id)
}
/** Damage rolls the hazard made for `id`. */
const hazardRolls = (events: GameEvent[], id: string): number => events.filter((e) => e.type === 'DiceRolled' && (e as Any).purpose === 'damage' && (e as Any).ownerId === id).length

describe('TER terrain boards: rules', () => {
  it('TER-113 Molten Blight Pool: entering costs one POW 10 roll, ending the activation inside one more, Resistance: Fire none', () => {
    const pool = piece('terrain.wasteland-blight-pool', 'hz', 5, 0)
    expect(terrainTraits(pool)).toMatchObject({ hazard: true, hazardSpec: { pow: 10, damageType: 'fire', on: ['enter', 'endActivation'] } })
    const go = (from: { x: number; z: number }, path: { x: number; z: number }[], id = 'B:e1') => {
      let o = asB(arena([pool], { [id]: from }), id)
      o = send(o, { type: 'chooseMovement', option: 'advance', modelId: id })
      return send(o, { type: 'moveModel', modelId: id, path })
    }
    const end = (o: ReturnType<typeof go>, id = 'B:e1') => send(o, { type: 'chooseCombatAction', modelId: id, choice: 'forfeit' })
    // advance into it (stop inside): one entry roll; ending the activation inside is one more
    const entered = go({ x: 0, z: 0 }, [{ x: 4.5, z: 0 }])
    expect(hazardRolls(entered.events, 'B:e1')).toBe(1)
    expect(hazardRolls(end(entered).events, 'B:e1')).toBe(1)
    // across it and out the far side: one entry roll, none at the end (it stands outside)
    const across = go({ x: 5, z: -2.95 }, [{ x: 5, z: 2.95 }])
    expect(hazardRolls(across.events, 'B:e1')).toBe(1)
    expect(hazardRolls(end(across).events, 'B:e1')).toBe(0)
    // already inside: moving within it is not an entry
    expect(hazardRolls(go({ x: 5, z: 0 }, [{ x: 5.5, z: 0.5 }]).events, 'B:e1')).toBe(0)
    // Resistance: Fire (every Khador model) is immune on entry and at the end
    const khador = go({ x: 0, z: 0 }, [{ x: 4.5, z: 0 }], 'A:e1')
    expect(hazardRolls(khador.events, 'A:e1')).toBe(0)
    expect(hazardRolls(end(khador, 'A:e1').events, 'A:e1')).toBe(0)
  })

  it('TER-112 schema props overrides are read by the engine (blocksLos, cover, concealment, impassable, hazard on a plain piece)', () => {
    const wall = ter('w', 'obstacle', 0, 0, 4, 0.75, 0.75)
    expect(terrainTraits(wall)).toMatchObject({ blocksLos: true, cover: 'cover' })
    expect(terrainTraits({ ...wall, props: { cover: false } }).cover).toBe('none')
    expect(terrainTraits({ ...wall, props: { concealment: true } }).cover).toBe('concealment')
    expect(terrainTraits({ ...wall, props: { blocksLos: false } }).blocksLos).toBe(false)
    expect(terrainTraits(ter('o', 'obstruction', 0, 0, 2, 2, 3, { impassable: false })).move).toBe('none')
    expect(terrainTraits(ter('r', 'rough', 0, 0, 2, 2, 0, { cover: true })).insideCover).toBe('cover')
    const hz = terrainTraits(ter('h', 'rough', 0, 0, 2, 2, 0, { hazard: { effect: [{ op: 'damage', pow: 12, damageType: 'corrosion' }], on: ['enter'] } }))
    expect(hz).toMatchObject({ hazard: true, hazardSpec: { pow: 12, damageType: 'corrosion', on: ['enter'] } })
  })

  it('TER-114 Zig-Zag Trench (RULING G2): a model completely inside has cover and Resistance: Blast; partly inside has neither', () => {
    const trench = piece('terrain.outpost-trench', 't', 0, 0)
    expect(terrainTraits(trench)).toMatchObject({ move: 'none', rough: false, blocksLos: false, insideCover: 'cover', resist: ['blast'] })
    const inside = world([mdl('a', 0, 0)], [trench])
    expect(insideCoverOf(inside, { x: 0, z: 0 }, 0.6)).toBe('cover')
    expect(insideCoverOf(inside, { x: 2, z: 0 }, 0.6)).toBe('none') // base half over the edge
    const s = arena([trench], { 'B:e1': { x: 0, z: 0 } }).state
    expect(resistsDamageType(arena([trench], { 'B:e1': { x: 0, z: 0 } }).state, bundle, 'B:e1', ['blast'])).toBe(true)
    expect(resistsDamageType(arena([trench], { 'B:e1': { x: 0, z: 0 } }).state, bundle, 'B:e1', ['fire'])).toBe(false)
    expect(resistsDamageType(place(s, 'B:e1', { x: 2.3, z: 0 }), bundle, 'B:e1', ['blast'])).toBe(false)
  })

  it('TER-115 the Split-Rail Fence gives concealment, the Fieldstone Wall gives cover', () => {
    const at = (pid: string) => world([mdl('a', 0, 0), mdl('b', 8, 0, { owner: 'B' })], [piece(pid, 'x', 7, 0, Math.PI / 2)])
    const fence = defModifiers(at('terrain.village-rail-fence'), 'b', { kind: 'ranged', baseDef: 12, originId: 'a' })
    expect(fence.def - 12).toBe(2)
    const wall = defModifiers(at('terrain.village-stone-wall'), 'b', { kind: 'ranged', baseDef: 12, originId: 'a' })
    expect(wall.def - 12).toBe(4)
  })

  it('TER-116 a model completely on the Mossy Hummock has elevation 1; half on it has none; props.elevation overrides', () => {
    const hill = piece('terrain.bog-hummock', 'h', 0, 0)
    const s = world([], [hill])
    expect(elevationAt(s, { x: 0, z: 0 }, 0.6)).toBe(1)
    expect(elevationAt(s, { x: 3.2, z: 0 }, 0.6)).toBe(0)
    expect(elevationAt(world([], [{ ...hill, props: { elevation: 2 } }]), { x: 0, z: 0 }, 0.6)).toBe(2)
  })

  it('TER-117 Pine Stand: LOS through up to 3" from inside; blocked beyond; props.losThrough overrides; huge targets are never blocked', () => {
    const pines = piece('terrain.village-pines', 'p', 0, 0) // ellipse 6 x 5
    const view = (ax: number, bx: number, o: Partial<TerrainInstance> = {}, base: 30 | 120 = 30) =>
      losReport(world([mdl('a', ax, 0), mdl('b', bx, 0, { owner: 'B', base })], [{ ...pines, ...o }]), 'a', 'b').visible
    expect(view(0.5, 8)).toBe(true) // 2.5" of forest from inside
    expect(view(-8, 8)).toBe(false) // both outside, 6" of forest
    expect(view(-8, 8, {}, 120)).toBe(true)
    expect(view(-1, 8)).toBe(false) // 4" of forest crossed from inside
    expect(view(-1, 8, { props: { losThrough: 5 } })).toBe(true)
    expect(view(0.5, 8, { props: { losThrough: 1 } })).toBe(false)
  })

  it('TER-119 rough ground (Frozen Pond): the advance loses 2"; props.rough false removes it', () => {
    const pond = piece('terrain.outpost-frozen-pond', 'f', 3, 0)
    const s = world([mdl('a', 0, 0)], [pond])
    expect(resolveAdvance(s, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 6, z: 0 }] }).ok).toBe(false)
    expect(resolveAdvance(s, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 4, z: 0 }] }).ok).toBe(true)
    const flat = world([mdl('a', 0, 0)], [{ ...pond, props: { rough: false } }])
    expect(resolveAdvance(flat, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 6, z: 0 }] }).ok).toBe(true)
  })

  it('TER-120 a path through the Crooked Stilt Hut is blocked, a charge stops on the Iron Thorn Palisade, props.impassable is honoured', () => {
    const hut = piece('terrain.bog-stilt-hut', 'h', 4, 0)
    const s = world([mdl('a', 0, 0)], [hut])
    const r = resolveAdvance(s, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 6, z: 0 }] })
    expect(r.ok).toBe(false)
    const around = resolveAdvance(s, { modelId: 'a', kind: 'advance', info, waypoints: [{ x: 4, z: 3.5 }, { x: 6, z: 0 }] })
    expect(around.ok).toBe(false) // 3.5 + 3.9 is more than SPD 6
    const wall = world([mdl('a', 0, 0), mdl('t', 10, 0, { owner: 'B' })], [piece('terrain.wasteland-thorn-palisade', 'w', 5, 0, Math.PI / 2)])
    const c = resolveCharge(wall, { modelId: 'a', targetId: 't', info: { spd: 6, hasMelee: true } })
    expect(c.ok && c.success).toBe(false)
    expect(c.ok && c.sweep.travelled).toBeLessThan(5)
    const passable = world([mdl('a', 0, 0)], [ter('x', 'obstruction', 3, 0, 2, 6, 3, { impassable: false })])
    expect(terrainTraits(passable.terrain[0]!).move).toBe('none')
  })
})
