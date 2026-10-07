// Data bundle loader (20-data-schema section 1). Pure, browser-safe: no fs, no ajv.
// Schema validation lives in tools/validate-data.ts; this file only builds the bundle and checks ids and refs.
import type { DataBundle, DataRecord } from '../engine/types'
import { RAW } from './raw'

export type RecordType =
  | 'ability' | 'weapon' | 'spell' | 'feat' | 'faction' | 'model' | 'list' | 'scenario' | 'terrain' | 'terrain-layout' | 'board' | 'systems'

export interface TypedRecord extends DataRecord { recordType: RecordType }

const asObj = (v: unknown): Record<string, unknown> => v as Record<string, unknown>
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Flatten RAW into [recordType, record, sourcePath] triples. */
export function rawRecords(): Array<[RecordType, Record<string, unknown>, string]> {
  const out: Array<[RecordType, Record<string, unknown>, string]> = []
  for (const [type, files] of Object.entries(RAW)) {
    for (const f of files) {
      if (type === 'systems') { out.push(['systems', { id: 'core.systems', systems: f.data }, f.path]); continue }
      const items = Array.isArray(f.data) ? f.data : [f.data]
      for (const it of items) out.push([type as RecordType, asObj(it), f.path])
    }
  }
  return out
}

function walkEffects(node: unknown, found: string[]): void {
  if (Array.isArray(node)) { node.forEach(n => walkEffects(n, found)); return }
  if (node && typeof node === 'object') {
    const o = asObj(node)
    if (o.op === 'grantAbility' || o.op === 'removeAbility') if (typeof o.ability === 'string') found.push(o.ability)
    for (const v of Object.values(o)) walkEffects(v, found)
  }
}

/** Reference check: returns one message per dangling id. */
export function checkRefs(byId: Record<string, TypedRecord>): string[] {
  const errs: string[] = []
  const need = (from: string, id: unknown, types: RecordType[] | null, what: string) => {
    if (typeof id !== 'string') return
    const r = byId[id]
    if (!r) errs.push(`${from}: ${what} '${id}' does not exist`)
    else if (types && !types.includes(r.recordType)) errs.push(`${from}: ${what} '${id}' is a ${r.recordType}, expected ${types.join('/')}`)
  }
  for (const r of Object.values(byId)) {
    const o = r as Record<string, unknown>
    switch (r.recordType) {
      case 'model': {
        for (const m of arr(o.weapons)) need(r.id, asObj(m).weapon, ['weapon'], 'weapon')
        for (const a of arr(o.abilities)) need(r.id, a, ['ability'], 'ability')
        for (const s of arr(o.spells)) need(r.id, s, ['spell'], 'spell')
        need(r.id, o.feat, ['feat'], 'feat')
        need(r.id, o.animus, ['spell'], 'animus') // M9: warbeast animus
        const comp = o.composition as { grunts: { profile: string }; extra?: { profile: string }[]; commandAttachments?: string[]; weaponAttachments?: string[] } | undefined
        if (comp) {
          need(r.id, comp.grunts.profile, ['model'], 'trooper')
          for (const e of comp.extra ?? []) need(r.id, e.profile, ['model'], 'trooper')
          for (const a of [...(comp.commandAttachments ?? []), ...(comp.weaponAttachments ?? [])]) need(r.id, a, ['model'], 'attachment')
        }
        for (const h of arr(o.hardpoints)) for (const opt of arr(asObj(h).options)) {
          for (const m of arr(asObj(opt).weapons)) need(r.id, asObj(m).weapon, ['weapon'], 'weapon')
          for (const a of arr(asObj(opt).abilities)) need(r.id, a, ['ability'], 'ability')
          need(r.id, asObj(opt).animus, ['spell'], 'animus')
        }
        need(r.id, o.faction, ['faction'], 'faction')
        break
      }
      case 'weapon':
        for (const q of arr(o.qualities)) need(r.id, q, ['ability'], 'quality')
        for (const a of arr(o.abilities)) need(r.id, a, ['ability'], 'ability')
        break
      case 'faction':
        for (const a of arr(o.abilities)) need(r.id, a, ['ability'], 'ability')
        break
      case 'list':
        need(r.id, o.faction, ['faction'], 'faction')
        need(r.id, o.leader, ['model'], 'leader')
        for (const e of arr(o.entries)) need(r.id, asObj(e).profile, ['model'], 'entry')
        break
      case 'scenario': {
        need(r.id, o.terrainLayout, ['terrain-layout'], 'layout')
        const lay = byId[String(o.terrainLayout)]
        const pieceIds = new Set(arr(lay ? (lay as Record<string, unknown>).pieces : []).map(p => asObj(p).id))
        for (const e of arr(o.elements)) {
          const t = asObj(e).terrain
          if (typeof t === 'string' && !pieceIds.has(t)) errs.push(`${r.id}: element terrain '${t}' is not a piece of layout '${String(o.terrainLayout)}'`)
        }
        break
      }
      case 'terrain-layout': {
        for (const p of arr(o.pieces)) need(r.id, asObj(p).terrain, ['terrain'], 'terrain piece')
        const seen = new Set<unknown>()
        for (const p of arr(o.pieces)) { const pid = asObj(p).id; if (seen.has(pid)) errs.push(`${r.id}: duplicate piece id '${String(pid)}'`); seen.add(pid) }
        if (o.board !== undefined) {
          need(r.id, o.board, ['board'], 'board')
          const bd = byId[String(o.board)] as Record<string, unknown> | undefined
          if (bd && !arr(bd.layouts).includes(r.id)) errs.push(`${r.id}: board '${String(o.board)}' does not list this layout`)
        }
        break
      }
      case 'terrain': {
        const h = Number(o.height ?? 0)
        // R5.13 / R5.14: an obstacle is under 1" tall, an obstruction or building is 1" or taller (G5)
        if (o.rulesType === 'obstacle' && h >= 1) errs.push(`${r.id}: an obstacle must be under 1" tall (height ${h})`)
        if ((o.rulesType === 'obstruction' || o.rulesType === 'building') && h < 1) errs.push(`${r.id}: an obstruction or building must be 1" or taller (height ${h})`)
        break
      }
      case 'board':
        for (const p of arr(o.pieces)) need(r.id, p, ['terrain'], 'piece')
        for (const l of arr(o.layouts)) {
          need(r.id, l, ['terrain-layout'], 'layout')
          const lo = byId[String(l)] as Record<string, unknown> | undefined
          if (lo && lo.board !== r.id) errs.push(`${r.id}: layout '${String(l)}' names board '${String(lo.board)}'`)
          const own = new Set(arr(o.pieces))
          for (const p of arr(lo?.pieces)) { const t = asObj(p).terrain; if (typeof t === 'string' && !own.has(t) && t !== 'terrain.low-wall' && t !== 'terrain.pond') errs.push(`${String(l)}: piece type '${t}' is not in board '${r.id}'`) }
        }
        break
      default:
        break
    }
    if (r.recordType === 'ability' || r.recordType === 'spell' || r.recordType === 'feat') {
      const found: string[] = []
      walkEffects(o.effect, found)
      for (const f of found) need(r.id, f, ['ability'], 'granted ability')
      if (r.recordType === 'ability') need(r.id, o.attack, ['weapon'], 'attack weapon')
    }
  }
  return errs
}

/** cyrb53 over the stable JSON of every record: a cheap, synchronous content hash. */
export function contentHash(byId: Record<string, DataRecord>): string {
  const s = JSON.stringify(Object.keys(byId).sort().map(k => byId[k]))
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

let cached: DataBundle | null = null

/** Build the bundle the engine takes. Throws on a duplicate id or a dangling reference. Cached per process. */
export function loadBundle(): DataBundle {
  if (cached) return cached
  const byId: Record<string, TypedRecord> = {}
  for (const [type, rec, path] of rawRecords()) {
    const id = rec.id as string
    if (byId[id]) throw new Error(`data: duplicate id '${id}' (${path})`)
    byId[id] = { ...rec, id, recordType: type }
  }
  const errs = checkRefs(byId)
  if (errs.length) throw new Error(`data: ${errs.length} dangling reference(s):\n${errs.join('\n')}`)
  cached = { version: contentHash(byId), byId }
  return cached
}

/** Typed lookup helper; throws when missing. */
export function getRecord<T = TypedRecord>(bundle: DataBundle, id: string, type?: RecordType): T {
  const r = bundle.byId[id] as TypedRecord | undefined
  if (!r || (type && r.recordType !== type)) throw new Error(`data: no ${type ?? 'record'} '${id}'`)
  return r as unknown as T
}

/** Weapon quality ids and other core rules are ordinary ability records; this lists a model's resolved weapons. */
export function modelWeapons(bundle: DataBundle, modelId: string): Array<{ weapon: TypedRecord; location?: string; count: number; socket?: string }> {
  const m = getRecord<Record<string, unknown>>(bundle, modelId, 'model')
  return arr(m.weapons).map(w => {
    const o = asObj(w)
    const weapon = getRecord(bundle, o.weapon as string, 'weapon')
    return { weapon, location: (o.location ?? (weapon as Record<string, unknown>).location) as string | undefined, count: (o.count as number) ?? 1, socket: o.socket as string | undefined }
  })
}

export { RAW } from './raw'
