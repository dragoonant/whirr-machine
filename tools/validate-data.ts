// Validates src/data/** against src/data/schema/*.schema.json (ajv 2020-12) plus the extra checks of 20-data-schema section 2.
// Run: npm run validate:data. Exit code 1 on any error.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { layoutFit } from '../src/data/battlefields'
import { checkRefs, derivedLayouts, rawRecords, type RecordType, type TypedRecord } from '../src/data/index'
import { CARD_CODES } from '../src/engine/cards'
import { codeHooks, knownCodeConditions } from '../src/engine/code-hooks'
import { baseRadius } from '../src/engine/geometry'
import { distToShape, terrainTraits, worldShape } from '../src/engine/terrain'
import type { DataBundle, TerrainInstance } from '../src/engine/types'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaDir = path.join(root, 'src/data/schema')

export interface ValidationReport { errors: string[]; warnings: string[]; stats: Record<string, number>; codeHooks: string[] }

const MK3_KEYS = ['STR', 'facing', 'backArc', 'freeStrike', 'template', 'scatter', 'deviation']
const LEVEL_CAP: Record<string, number> = { recon: 30, skirmish: 50, pitched: 75, grandMelee: 100 }

/** Names the engine code-hook registry knows: effect hooks, condition hooks and code conditions. */
export function hookNames(): Set<string> | null {
  const reg = codeHooks()
  return new Set<string>([...Object.keys(reg.effects ?? {}), ...Object.keys(reg.conditions ?? {}), ...knownCodeConditions()])
}

function collectCodes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) { node.forEach(n => collectCodes(n, out)); return }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (typeof o.code === 'string') out.add(o.code)
    Object.values(o).forEach(v => collectCodes(v, out))
  }
}

function scanMk3(node: unknown, where: string, errs: string[]): void {
  if (Array.isArray(node)) { node.forEach(n => scanMk3(n, where, errs)); return }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (MK3_KEYS.includes(k)) errs.push(`${where}: MK3 key '${k}'`)
      scanMk3(v, where, errs)
    }
  }
}

const words = (s: string): string[] => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean)

type Any = Record<string, any>

/** Objective base size by element kind (mm). Flags and caches are 30 mm, scenario terrain and zones have no base. */
const ELEMENT_MM: Record<string, number> = { objective50: 50, objective40: 40, flag: 30, cache: 30 }

/** `fitted` (M13): the scenario is an SR one (attacker frame); setup drops the pieces that crowd an objective or cache (battlefields.ts layoutFit), so the row only reports. */
export interface ClearanceRow { scenario: string; layout: string; element: string; piece: string; pieceType: string; impassable: boolean; gap: number; fitted?: boolean }
/** Gap (base edge to footprint edge, 0 = overlapping) of every objective of every 48" scenario to every piece of every layout it can be played on. */
export function objectiveClearances(byId: Record<string, TypedRecord>): ClearanceRow[] {
  const rows: ClearanceRow[] = []
  const layoutsOf = (sc: Any): string[] => {
    // the scenario's own layout plus every board layout's 48" twin (E3 eligibleLayouts)
    const ids = new Set<string>([sc.terrainLayout])
    for (const r of Object.values(byId)) if (r.recordType === 'terrain-layout' && /-48$/.test(r.id)) ids.add(r.id)
    return [...ids]
  }
  for (const r of Object.values(byId)) {
    if (r.recordType !== 'scenario') continue
    const sc = r as unknown as Any
    if (sc.table?.w !== 48 || sc.table?.d !== 48) continue
    for (const lid of layoutsOf(sc)) {
      const lay = byId[lid] as unknown as Any | undefined
      if (!lay) continue
      const pieces: { id: string; t: TerrainInstance }[] = (lay.pieces as Any[]).map((pc) => {
        const tp = (byId[pc.terrain] ?? {}) as unknown as Any
        return { id: pc.id, t: { id: pc.id, pieceId: pc.terrain, rulesType: tp.rulesType, pos: pc.pos, rot: pc.rot ?? 0, footprint: tp.footprint, height: tp.height ?? 0, props: tp.props ?? {} } as TerrainInstance }
      })
      const fit = sc.frame ? layoutFit({ byId } as unknown as DataBundle, sc.id, lid) : null // SR: the drop set over every edge choice (SR5)
      for (const el of sc.elements as Any[]) {
        const mm = ELEMENT_MM[el.kind as string]
        if (mm === undefined || (fit && el.kind === 'flag')) continue // a flag moves onto the piece it picks (SR10)
        for (const pc of pieces) {
          if (fit?.drop.includes(pc.id)) continue
          const gap = Math.max(0, distToShape(el.pos, worldShape(pc.t)) - baseRadius(mm))
          rows.push({ scenario: sc.id, layout: lid, element: el.id, piece: pc.id, pieceType: pc.t.rulesType, impassable: terrainTraits(pc.t).move === 'impassable', gap, ...(fit ? { fitted: true } : {}) })
        }
      }
    }
  }
  return rows
}
/** TER-110: an objective on a 48" table keeps at least 1" from every impassable footprint and sits on no other footprint. */
export function objectiveClearanceProblems(byId: Record<string, TypedRecord>): string[] {
  return objectiveClearances(byId).flatMap((c) =>
    c.impassable ? (c.gap < 1 - 1e-9 ? [`${c.scenario}: ${c.element} is ${c.gap.toFixed(2)}" from impassable ${c.piece} (${c.pieceType}) in ${c.layout}, needs 1"`] : [])
      : c.gap <= 0 && !c.fitted ? [`${c.scenario}: ${c.element} overlaps ${c.piece} (${c.pieceType}) in ${c.layout}`] : [])
}

export function validateAll(): ValidationReport {
  const errors: string[] = []
  const warnings: string[] = []
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  for (const f of fs.readdirSync(schemaDir).filter(n => n.endsWith('.schema.json'))) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, f), 'utf8')))
  }
  const get = (name: string) => ajv.getSchema(`https://whirr-machine.dev/schemas/${name}`)

  // 1. schema validation, duplicate ids
  const byId: Record<string, TypedRecord> = {}
  const stats: Record<string, number> = {}
  const triples = rawRecords()
  for (const [type, rec, p] of triples) {
    stats[type] = (stats[type] ?? 0) + 1
    if (type === 'systems') {
      const sub = get('model.schema.json#/$defs/System')
      for (const [letter, sys] of Object.entries(rec.systems as Record<string, unknown>)) {
        if (!/^[A-Z]$/.test(letter)) errors.push(`${p}: bad system letter '${letter}'`)
        if (sub && !sub(sys)) errors.push(`${p}[${letter}]: ${ajv.errorsText(sub.errors)}`)
      }
    } else {
      const v = get(`${type}.schema.json`)
      if (!v) { errors.push(`${p}: no schema for type ${type}`); continue }
      if (!v(rec)) for (const e of v.errors ?? []) errors.push(`${p} (${String(rec.id)}) ${e.instancePath || '/'}: ${e.message}`)
    }
    const id = String(rec.id)
    if (byId[id]) errors.push(`${p}: duplicate id '${id}'`)
    byId[id] = { ...(rec as { id: string }), recordType: type as RecordType }
  }

  // 2. references. E2: the 48" twin of every board layout joins the records first (the engine loader does the same), so a scenario can name one
  const derived = derivedLayouts(byId)
  const vLayout = get('terrain-layout.schema.json')
  for (const rec of Object.values(derived)) {
    const { recordType: _rt, ...plain } = rec as unknown as Any
    if (vLayout && !vLayout(plain)) for (const e of vLayout.errors ?? []) errors.push(`derived layout ${rec.id} ${e.instancePath || '/'}: ${e.message}`)
  }
  Object.assign(byId, derived)
  stats['derived-layout'] = Object.keys(derived).length
  errors.push(...checkRefs(byId))
  // E5: a scenario's table is its layout's table, and (TER-110) its objectives stand clear of terrain
  for (const r of Object.values(byId)) {
    if (r.recordType !== 'scenario') continue
    const sc = r as unknown as Any
    const lay = byId[sc.terrainLayout] as unknown as Any | undefined
    if (lay && (lay.table.w !== sc.table.w || lay.table.d !== sc.table.d)) errors.push(`${r.id}: table ${sc.table.w}x${sc.table.d} differs from layout ${sc.terrainLayout} (${lay.table.w}x${lay.table.d})`)
  }
  errors.push(...objectiveClearanceProblems(byId))

  // 3. code hooks
  const codes = new Set<string>()
  for (const r of Object.values(byId)) {
    if (r.recordType !== 'card') { collectCodes(r, codes); continue }
    // M13: a command card's option `code` names an effect in src/engine/cards.ts, not a code hook
    for (const o of ((r as unknown as Any).options ?? []) as Any[]) if (!CARD_CODES.has(o.code)) errors.push(`${r.id}: card option '${o.id}' code '${o.code}' is not in cards.ts`)
  }
  const registry = hookNames()
  if (!registry) warnings.push(`src/engine/code-hooks.ts not present yet: ${codes.size} code hooks unchecked`)
  else for (const c of codes) if (!registry.has(c)) errors.push(`code hook '${c}' not in the registry`)

  // 4. models and weapons
  const sysDefault = Object.keys((byId['core.systems'] as unknown as { systems: object }).systems)
  for (const r of Object.values(byId)) {
    const o = r as unknown as Any
    if (r.recordType === 'model') {
      if (o.damage?.track === 'grid') {
        const letters = new Set<string>()
        let boxes = 0
        for (const col of o.damage.columns as string[]) for (const ch of col) { boxes++; if (ch !== '-') letters.add(ch) }
        const allowed = new Set([...sysDefault, ...Object.keys(o.systems ?? {})])
        for (const l of letters) if (!allowed.has(l)) errors.push(`${r.id}: grid letter '${l}' has no system`)
        warnings.push(`${r.id}: grid ${boxes} boxes, systems ${[...letters].sort().join('')}`)
      }
      // M9 (81 B.2): life spirals (6 branches and the -MBS letters are schema-checked); animus refs must be animus spells
      if (o.damage?.track === 'spiral') {
        const count: Record<string, number> = { M: 0, B: 0, S: 0, '-': 0 }
        for (const br of o.damage.branches as string[]) for (const ch of br) count[ch] = (count[ch] ?? 0) + 1
        const total = Object.values(count).reduce((a, n) => a + n, 0)
        warnings.push(`${r.id}: spiral ${total} boxes, M${count.M} B${count.B} S${count.S} blank ${count['-']}`)
      }
      const animi = [o.animus, ...(o.hardpoints ?? []).flatMap((h: Any) => (h.options ?? []).map((x: Any) => x.animus))].filter(Boolean)
      for (const a of animi) { const sp = byId[a] as unknown as Any | undefined; if (sp && sp.animus !== true) errors.push(`${r.id}: animus ${a} is not marked animus: true`) }
      if (o.type !== 'warEngine') {
        for (const m of o.weapons ?? []) if (m.location && m.location !== '-') errors.push(`${r.id}: weapon location '${m.location}' on a non-war-engine`)
        for (const m of o.weapons ?? []) {
          const w = byId[m.weapon] as unknown as Any | undefined
          if (w?.location && ['L', 'R', 'H'].includes(w.location)) errors.push(`${r.id}: weapon ${m.weapon} has war-engine location ${w.location}`)
        }
      }
      if (o.type === 'unit') {
        const c = o.composition
        const slots = [c.grunts, ...(c.extra ?? [])]
        const min = slots.reduce((a: number, s: Any) => a + s.min, 0)
        const max = slots.reduce((a: number, s: Any) => a + s.max, 0)
        for (const sizeStr of Object.keys(c.costBySize ?? {})) if (+sizeStr < min || +sizeStr > max) errors.push(`${r.id}: costBySize ${sizeStr} outside ${min}..${max}`)
        if ((c.commandAttachments ?? []).length > 1) errors.push(`${r.id}: more than one command attachment`)
        if ((c.weaponAttachments ?? []).length > 3) errors.push(`${r.id}: more than three weapon attachments`)
      }
    }
    if (r.recordType === 'weapon' && ('blastPow' in o) !== ('aoe' in o)) errors.push(`${r.id}: blastPow iff aoe`)
  }

  // 5. lists
  for (const r of Object.values(byId)) {
    if (r.recordType !== 'list') continue
    const o = r as unknown as Any
    const leader = byId[o.leader] as unknown as Any | undefined
    if (!leader || leader.type !== 'leader') errors.push(`${r.id}: leader '${o.leader}' is not a leader`)
    else if (leader.cost !== 0) errors.push(`${r.id}: leader cost must be 0`)
    let total = 0
    let engines = 0 // war-engines and warbeasts (Cohort models) in the Leader's battlegroup, lesser ones excluded
    const isWarlock = leader?.resource === 'fury'
    const refs = new Map<string, Any>((o.entries as Any[]).map((e: Any) => [e.ref ?? e.profile, e]))
    const used: Record<string, number> = {}
    for (const e of o.entries as Any[]) {
      const m = byId[e.profile] as unknown as Any | undefined
      if (!m) continue
      if (m.faction !== o.faction) errors.push(`${r.id}: ${e.profile} belongs to ${m.faction}`)
      total += m.cost
      if (m.type === 'unit') {
        const c = m.composition
        const slots = [c.grunts, ...(c.extra ?? [])]
        const min = slots.reduce((a: number, s: Any) => a + s.min, 0)
        const max = slots.reduce((a: number, s: Any) => a + s.max, 0)
        const size = e.size ?? min
        if (size < min || size > max) errors.push(`${r.id}: ${e.profile} size ${size} outside ${min}..${max}`)
        const bySize = c.costBySize?.[size]
        if (bySize !== undefined) total += bySize - m.cost
      }
      if (m.type === 'warEngine' && !m.lesser) engines++
      if (m.type === 'beast') {
        // M9 (81 B.2): a beast joins the Leader's battlegroup unless `controller` names another warlock entry
        const ctl = e.controller !== undefined ? refs.get(e.controller) : undefined
        const ctlProfile = ctl ? (byId[ctl.profile] as unknown as Any | undefined) : undefined
        if (e.controller !== undefined && ctlProfile?.resource !== 'fury') errors.push(`${r.id}: ${e.profile} controller '${e.controller}' is not a warlock entry`)
        if (e.controller === undefined && !isWarlock) errors.push(`${r.id}: ${e.profile} is a warbeast but the Leader is not a warlock`)
        if (e.controller === undefined && m.beastClass !== 'lesser') engines++
        if (m.beastClass === 'gargantuan' && (o.level === 'recon' || o.level === 'skirmish')) errors.push(`${r.id}: no gargantuan at ${o.level}`)
      } else if (e.controller !== undefined) errors.push(`${r.id}: ${e.profile} has a controller but is not a warbeast`)
      if (m.type === 'warEngine' && isWarlock) errors.push(`${r.id}: ${e.profile} is a war-engine but the Leader is a warlock`)
      used[e.profile] = (used[e.profile] ?? 0) + 1
    }
    for (const [id, n] of Object.entries(used)) {
      const m = byId[id] as unknown as Any
      const cap = m.fa === 'C' ? 1 : typeof m.fa === 'number' ? m.fa : Infinity
      if (n > cap) errors.push(`${r.id}: ${id} exceeds FA ${m.fa}`)
    }
    if (o.points !== undefined && o.points !== total) errors.push(`${r.id}: declared ${o.points} points, computed ${total}`)
    const cap = LEVEL_CAP[o.level]
    if (total > cap || total < cap - 4) errors.push(`${r.id}: ${total} points outside ${cap - 4}..${cap}`)
    if ((o.level === 'recon' || o.level === 'skirmish') && engines < 1) errors.push(`${r.id}: needs at least one war-engine or warbeast in the Leader's battlegroup`)
  }

  // 6. MK3 leak and prose copy check
  for (const [type, rec, p] of triples) if (type !== 'systems') scanMk3(rec, `${p} (${String(rec.id)})`, errors)
  const srcDir = path.join(root, 'docs/sources')
  const txts = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter(n => n.endsWith('.txt')) : []
  if (txts.length) {
    const src = txts.map(n => words(fs.readFileSync(path.join(srcDir, n), 'utf8')).join(' ')).join(' ')
    for (const r of Object.values(byId)) {
      const t = (r as unknown as { text?: string }).text
      if (!t) continue
      const w = words(t)
      for (let i = 0; i + 12 <= w.length; i++) if (src.includes(w.slice(i, i + 12).join(' '))) { errors.push(`${r.id}: text shares a 12-word run with the sources`); break }
    }
  }
  return { errors, warnings, stats, codeHooks: [...codes].sort() }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const rep = validateAll()
  console.log('records:', JSON.stringify(rep.stats))
  for (const w of rep.warnings) console.log('warn:', w)
  console.log('code hooks used:', rep.codeHooks.join(', '))
  for (const e of rep.errors) console.error('ERROR:', e)
  console.log(rep.errors.length ? `validate-data: ${rep.errors.length} error(s)` : 'validate-data: ok')
  process.exit(rep.errors.length ? 1 : 0)
}
