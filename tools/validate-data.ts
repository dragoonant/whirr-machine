// Validates src/data/** against src/data/schema/*.schema.json (ajv 2020-12) plus the extra checks of 20-data-schema section 2.
// Run: npm run validate:data. Exit code 1 on any error.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { checkRefs, rawRecords, type RecordType, type TypedRecord } from '../src/data/index'
import { codeHooks, knownCodeConditions } from '../src/engine/code-hooks'

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

  // 2. references
  errors.push(...checkRefs(byId))

  // 3. code hooks
  const codes = new Set<string>()
  for (const r of Object.values(byId)) collectCodes(r, codes)
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
