# 20: Data schema

All game content is JSON under `src/data/`, validated by `tools/validate-data.ts` (ajv 2020-12, `allErrors`) against
`docs/spec/schemas/*.schema.json`. `$id` = `https://whirr-machine.dev/schemas/<name>.schema.json`; cross-refs use
`common.schema.json#/$defs/…`. **Every number lives in data**, never in engine code. **Every prose field is our own
words** (≤400 chars); names of units, weapons and abilities may match the cards.

## 1. Files

| Path | Schema | Content |
|---|---|---|
| `src/data/core/abilities.json` | `ability[]` | shared rules as abilities (Dual Attack, Tough, Stealth, Gunfighter, Pathfinder, Arc Node, …) |
| `src/data/core/qualities.json` | `ability[]` (kind `weaponQuality`) | weapon qualities (Blessed, Buckler, Shield, Magical, Pistol, Throw, Continuous Fire/Corrosion, …) |
| `src/data/core/systems.json` | `{[letter]: System}` | default system letters: L, R, H → `crippleLocation`; M → `crippleMovement`; C → `crippleCortex`; A → `crippleArcNode` |
| `src/data/factions/<id>/faction.json` | `faction` | name, `appVersion`, palette, `sourceHues`, faction rules |
| `src/data/factions/<id>/raw.ts` | | the faction's `RawGroup`: static imports of its own JSON files (and its lists), by record kind; `src/data/raw.ts` spreads every group, so a faction builder edits only this file |
| `src/data/factions/<id>/models/*.json` | `model` | one profile per file (casters, war-engines, solos, troopers, units) |
| `src/data/factions/<id>/weapons.json` | `weapon[]` | |
| `src/data/factions/<id>/abilities.json` | `ability[]` | |
| `src/data/factions/<id>/spells.json` | `spell[]` | |
| `src/data/factions/<id>/feats.json` | `feat[]` | |
| `src/data/lists/*.json` | `list` | fixed lists (Quick Start lists first) |
| `src/data/scenarios/*.json` | `scenario` | |
| `src/data/terrain/pieces.json` | `terrain[]` | piece types |
| `src/data/terrain/layouts/*.json` | `terrain-layout` | placed pieces |
| `src/data/raw.ts` | | core and shared files plus `FACTION_RAW` (cyg, kha, trl, cir, cry, men); tests/data checks every JSON file is listed |
| `src/data/index.ts` | | builds `DataBundle {byId, version}`; throws on duplicate id or dangling ref; `version` = content hash |

Ids: lowercase kebab, dot-namespaced. Faction prefix = faction id; kinds: `<f>.<model>`, `<f>.w.<weapon>`,
`<f>.a.<ability>`, `<f>.s.<spell>`, `<f>.f.<feat>`, `<f>.l.<list>`; core: `core.a.*`, `core.q.*`; `scn.*`,
`terrain.*`, `layout.*`.

## 2. validate-data checks beyond JSON Schema

| Check | Rule |
|---|---|
| refs | every Id resolves (weapons, abilities, spells, feat, profiles, attachments, layout pieces) |
| hooks | every `{code}` in `effect`/`when`/`System` exists in `src/engine/code-hooks.ts` registry |
| grid | exactly 6 columns; letters are in `core/systems.json` or the model's `systems`; heavy/light box totals logged for review |
| spiral | exactly 6 branches of `-MBS` letters (schema); only beasts have spirals; per-aspect box totals logged for review; a model's `animus` (and a hardpoint option's) must be a spell with `animus: true` |
| lists | `points` = recomputed total; ≤ level cap and ≥ cap − 4; leader present, cost 0; Recon/Skirmish: ≥1 non-lesser Cohort model in the Leader's battlegroup (war-engine, or a beast with no `controller`), no battle engines/colossals/gargantuans; FA respected |
| battlegroups | `resource: 'fury'` only on leaders (schema); a beast needs a warlock Leader or a `controller` naming a warlock entry; `controller` only on beasts; no war-engines under a warlock Leader. Not checked yet: Mercenary/Farrow/Gatorman pairing (no such content) |
| units | `size` within composition min..max; ≤1 command and ≤3 weapon attachments |
| weapons | locations L/R/H only on war-engines; `blastPow` iff `aoe` |
| prose | `text` has no run of ≥12 words matching `docs/sources/` text (skipped when sources are absent) |
| MK3 leak | reject keys/values `STR`, `FOCUS` stat, `facing`, `backArc`, `freeStrike`, `template`, `scatter`, `deviation` |

## 3. Shared primitives (`common.schema.json`)

| Def | Shape |
|---|---|
| `Id` | `^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*$` |
| `Text` | string ≤400, our words |
| `Inches` | number ≥0 |
| `DiceExpr` | int ≥0, or `^([1-9]\d*)?d[36]([+-]\d+)?$` (`d3`, `d3+1`, `2d6`) |
| `BaseMm` | `30 \| 40 \| 50 \| 80 \| 120` |
| `Location` | `L \| R \| H \| S \| -` |
| `DamageType` | `blast cold corrosion electricity fire magical` |
| `Stat` | `SPD AAT MAT RAT DEF ARM ARC CTRL FURY THR POW RNG ROF AOE` (no STR, no FOCUS) |
| `Vec2`, `Shape` | `{x,z}`; `{circle:{r}} \| {rect:{w,d}} \| {polygon:[Vec2]}` |
| `WindowId` | same list as `00-architecture` §7, plus `passive` (M9: `control.leech`, `control.threshold`, `spell.expire`) |
| `Cost` | `{focus?, fury?, forced?, soul?, corpse?, damage?}` ints ≥0; `forced` = fury a beast gains (Regeneration-style "force for 1" = `forced: 1`); `damage` = damage the payer takes |
| `TokenKind` | `soul \| corpse` |
| `Scope` | `{who, range?: inches\|'CTRL'\|'melee', filter?: Condition, count?}`; `who` includes `warbeasts` (beasts of the subject's battlegroup) |
| `Duration` | `instant attack activation turn round upkeep continuous game while` |
| `Condition` | `{all}` `{any}` `{not}` `{test, subject?, value?, of?, dist?}` `{code, params?}`; M9 tests `furyAtLeast aspectCrippled frenzied inBattlegroup living undead hasAbility tokensAtLeast` |
| `Effect` | `{op, …}` or `{code, params?}` (§5) |

## 4. Models (`model.schema.json`)

| Field | Notes |
|---|---|
| `type` | `leader warEngine solo trooper unit battleEngine structure beast`; `unit` needs `composition`, all others need `base`, `stats`, `damage` |
| `resource` | `focus` (default) \| `fury`; leaders only; `fury` = a warlock (Fury Manipulation, Battlegroup Controller) |
| `beastClass` | `lesser light heavy superHeavy gargantuan`; beasts only, required |
| `animus` | spell id (beasts only; a spell record with `animus: true`); omitted when a hardpoint option picks it |
| `engineClass` | `light heavy superHeavy colossal` (warEngine only); `lesser: true` for lesser war-engines |
| `base`, `losHeight` | mm; `losHeight` defaults by base (30mm 1.75", 40mm 2.25", 50mm 2.75", 80mm 3.25", 120mm 5") |
| `stats` | `SPD MAT DEF ARM` required; `RAT` required for every type but `beast` (beasts give it only with a ranged weapon); beasts require `FURY THR`; warlocks require `ARC CTRL`; `AAT ARC CTRL` for casters. Warlock AAT is optional (Gunnbjorn has none, factions/trollbloods.md) |
| `damage` | `{track:'single', boxes}` (per card: models without boxes 1; Black 13th troopers several (QS); casters 15–17, factions/*.md) \| `{track:'grid', columns:[6]}` \| `{track:'dualGrid', grids:{left,right}}` \| `{track:'spiral', branches:[6]}` (beasts only) |
| spiral branch | string `^[-MBS]{1,10}$`, outermost box first: `M` Mind, `B` Body, `S` Spirit, `-` no aspect. Index 0 = branch 1. Fill outside-in, spill to the next branch, wrap 6 → 1. At runtime `spiralLayout` maps it to a grid layout with lowercase letters (`m b s`, 81 B.2). Beast weapons use location `-` |
| grid column | string, top box first: `-` blank box, letter = system box. Index 0 = column 1. Fill top-down, spill right, wrap 6 → 1 |
| `systems` | per-model override of `core/systems.json` (`effect: crippleLocation\|crippleMovement\|crippleCortex\|crippleHead\|crippleArcNode\|code`) |
| `weapons` | `[{weapon, location?, count?, socket?}]`; `socket` names the figure attach point (`30-figures` §5) |
| `hardpoints` | `[{slot, location, default?, options:[{id, name, weapons?, abilities?, statMods?, cost?, animus?}]}]` (`animus`: a customizable animus, beasts) |
| `abilities`, `spells`, `feat`, `arcNode` | refs |
| `cost`, `fa` | points (leaders 0); FA int, `C` character, `U` unlimited |
| `composition` | units: `{grunts:{profile,min,max}, extra?, commandAttachments?, weaponAttachments?, costBySize?}` |
| `figure` | `{slug?, archetype, heightIn?}` → `30-figures` |
| `verify` | free note mirrored to `needs-rules-check.md` |

## 5. Weapons, abilities, spells, feats

**Weapon** `{id, name, type: melee|ranged, rng, rof?, aoe?, pow, blastPow?, location?, damageTypes?, qualities?, abilities?}`
- Melee `rng` ∈ {1, 2} (2 = reach); no `rof`/`aoe`. Ranged `rng` = number or `"SP<n>"` (spray); `rof` required
  (`DiceExpr`, e.g. `"d3+1"`). AOE weapons carry `aoe` + `pow` (direct) + `blastPow`.
- No STR anywhere: power attacks use 12/14 from base size in engine code (`10-rules-core`).

**Ability** `{id, name, text, kind, trigger, when?, effect[], scope, duration, optional?, limit?, cost?: Cost, attack?}`
- `kind`: `passive triggered specialAttack specialAction weaponQuality aura`.
- `trigger`: a `WindowId` (`passive` = always-on modifier evaluated by `query.stat`).
- `optional: true` raises a `triggerWindow` decision; mandatory triggers resolve automatically in data order.
- Escape hatch: any `effect` or `when` node may be `{"code": "hookName", "params": {…}}`; hooks live in
  `src/engine/code-hooks.ts` or `src/engine/factions/<id>.ts` and are listed in a registry the validator reads.

| Effect `op` | Params |
|---|---|
| `modStat` | `stat, value, mode?: add\|set\|double\|half` |
| `addDie` / `boost` / `reroll` | `roll: attack\|damage\|any`, `limit?` |
| `autoHit` / `autoMiss` | |
| `applyCondition` / `removeCondition` | `condition: knockedDown stationary disrupted fire corrosion inert shadowBind blind` |
| `damage` | `pow, damageType?` |
| `heal` | `value` |
| `push` / `place` | `dist: DiceExpr, direction?: away\|toward\|any`; `place` also `placeMode?: b2bWithTarget` (Shifter) |
| `knockDown`, `gainFocus`, `loseFocus` | `value?` |
| `gainFury` / `loseFury` | `value?` (M9) |
| `gainToken` / `spendToken` | `token: soul\|corpse`, `value?` (count, default 1) |
| `grantAbility` | `ability` |
| `grantResistance` / `grantImmunity` | `damageType` |
| `preventDamage` | `value` (Power Field-like reductions) |
| `forbid` | `what: run charge slam trample powerAttack cast advance attack beCharged beTargeted gainFocus tough knockDown weaponAttacks gainFury force beTransferred combatAction heal` |
| `cloud` | `aoe` (diameter, default 3), `count?: DiceExpr`, `placement?: ctrl\|centredOnTarget\|point`, `area?: cloud\|hazard\|flare`, `blocksLos?`, `hazard?: {pow, damageType?, on: [enter\|endActivation]}` |
| `addAttack` | `value` (extra initial attacks) |
| `advance` | `dist: DiceExpr, direction?` (an advance outside Normal Movement: Evasive, Beat Back, Reposition) |
| `slam` / `throw` | `dist: DiceExpr, collateralPow?` (Momentum) |
| `endActivation`, `removeFromPlay` | — |
| `removeAbility` | `ability` |
| `modRoll` | `roll: attack\|damage\|any, value` (flat roll bonus that isn't a stat: Prey, Both Barrels, Volume Fire) |
| `discardLowest` | `roll` (Heart Seeker) |
| `makeAttack` | `target?: self\|target\|attacker, weaponFilter?: same\|any\|melee\|ranged\|<weapon id>, basic?` (Reciprocate, Critical Shred, Avenging Force; set the ability's `makesAttack`) |
| `ignore` | `ignore: clouds stealth concealment cover interveningModels targetInMelee gas forest friendlyModels shieldBonuses` |

**Spell** `{id, name, text, cost, rng: n|SELF|CTRL|"SP<n>", aoe?: n|CTRL, pow?, dur: -|TURN|RND|UP, offensive, animus?, when?, effect[], scope}`.
An animus is a spell record with `animus: true`; its `cost` is the fury a beast gains when forced to cast it (its warlock pays
the same in fury). `rng "SP<n>"` is a spray spell (Venom).
**Feat** `{id, name, text, when?, effect[], scope, duration}`.

## 6. Factions and lists
- **Faction** `{id, name, short?, appVersion, source?, keywords?, abilities?, palette:{primary, secondary, metal?, base?, ui?},
  sourceHues:[h1,h2], marking?}`. `appVersion` records the card/app version the numbers came from (balance updates
  Jan 2026 and mid-2026).
- **List** `{id, name, faction, level: recon|skirmish|pitched|grandMelee, points?, leader, entries:[{ref?, profile, size?,
  loadout?: {slot: option}, attachments?, advanceDeploy?, controller?}], source?}`. `controller` (beasts only) is the `ref` of the
  warlock entry whose battlegroup the beast joins; omitted = the Leader's battlegroup.

## 7. Scenarios (`scenario.schema.json`), inches, origin = table centre, +z toward player B

| Field | Meaning |
|---|---|
| `table` | `{w, d}`: 36×36 (Recon) or 48×48 |
| `deployment` | `{first, second, advance=3, unitSpread=3}`: depth from own edge (QS 36": 6 / 11; core default 48": 7 / 10, p117) |
| `rounds` | 7 |
| `scoring` | `{fromRound, fromPlayer, winMargin: 3, winOnOpponentTurnOnly: true, leaderPresence: 10}`; S1 (QS) `1/first`, SR scenarios `2/second` (11 V1.2) |
| `killBox` | `{fromRound: 2, fromPlayer: 'first', depth: 12, vp: 2}` |
| `zones[]` | `{id, pos, rot?, shape}` |
| `elements[]` | `{id, kind: objective50\|objective40\|flag\|scenarioTerrain\|zone, pos, zone?, terrain?, owner?, hold:{within, models, eligible[]}, contest:{within, excludes[]}, vp:{control?, dominate?, destroy?}}` |
| `terrainLayout` | layout id |

Defaults by kind (engine fills when omitted): `objective50` hold within 3 by leader/warEngine/battleEngine;
`objective40` hold within 3 by leader or a unit with all remaining models in 3 (`unitAll`); `flag` and
`scenarioTerrain` held by ≥2 models; contest within 3 excluding leaders, inert, wild, disabled. `query.control`
(00 §8) is the only implementation.

## 8. Terrain (`terrain.schema.json`, `terrain-layout.schema.json`)

Piece `{id, name, rulesType, footprint, height, props?, mesh?}`; layout `{id, name, board?, table, pieces:[{id, terrain, pos, rot?}]}`; board `{id, name, text, pieces[], layouts[], reskin, ground, light, fallback}` (`board.schema.json`, 70 §C). `rulesType` is the engine's `TerrainRulesType`: obstacle, obstruction, building, forest, shallowWater, rough, rubble, hill, trench, hazard, deepWater, scenarioTerrain. An obstacle is under 1" tall and an obstruction or building 1" or taller (checked on load). A layout used with a scenario must carry the scenario's terrain anchors (`scenarioAnchorProblems`).

## 9. Terrain rules-type defaults (`props` overrides)

| rulesType | blocksLos | cover/conceal | movement | other |
|---|---|---|---|---|
| `obstacle` (<1" tall wall) | by height vs volumes | cover (wall) or concealment (hedge, `props.concealment`), within 1" along a line | crossable if the move clears it; never stood on | +2 melee DEF if partly obscured |
| `obstruction` / `building` (≥1") | yes | cover | impassable (Flight/Incorporeal excepted) | |
| `forest` | from inside: through ≤ `losThrough: 3`; outside→outside: blocks beyond; never vs 120 mm | concealment, completely inside only | rough | |
| `shallowWater`, `rough`, `rubble` | no | rubble: cover, completely inside only; others none | rough (−2", min 1") | |
| `hill` | by height | none (elevation +2 only) | open; leaving it is never a fall | `elevation` to models completely within |
| `trench` (RULING G2) | no | cover, completely inside only | open | `resistance: [blast]` while completely inside |
| `hazard` | no | none | open | `hazard: {effect: [{op: damage, pow, damageType?}], on?: [enter, endActivation]}`: one roll on entering and one on ending an activation inside (R9.8) |

Props the engine reads: `blocksLos losThrough cover concealment rough impassable elevation resistance hazard`, plus `feature` (`hedge`), `baseType` and `baseElev`. `crossable` and `meleeDefBonus` do not exist.

## 10. Worked example: a heavy war-engine with a grid (illustrative numbers, not a real card)

```json
{
  "id": "ex.ironhulk", "name": "Ironhulk (example)", "faction": "ex",
  "type": "warEngine", "engineClass": "heavy", "keywords": ["construct"],
  "base": 50,
  "stats": { "SPD": 5, "MAT": 6, "RAT": 4, "DEF": 12, "ARM": 18 },
  "damage": { "track": "grid", "columns": ["---L", "---LM", "----MH", "----HC", "---CR", "---R"] },
  "weapons": [
    { "weapon": "ex.w.piston-fist",   "location": "L", "socket": "hand-l" },
    { "weapon": "ex.w.boiler-cannon", "location": "R", "socket": "hand-r" },
    { "weapon": "ex.w.ram-horn",      "location": "H", "socket": "head" }
  ],
  "abilities": ["core.a.dual-attack"],
  "cost": 17, "fa": 2,
  "figure": { "slug": "ex-ironhulk", "archetype": "heavyEngine", "heightIn": 2.4 },
  "verify": "Illustrative only; not a real profile."
}
```

Grid read-out: columns 1–6 hold 4/5/6/6/5/4 = 30 boxes. Each string lists a column top box first; the card draws
columns bottom-aligned, so short columns start lower (blank cell = no box). L spans columns 1–2, M 2–3, H 3–4, C 4–5,
R 5–6 (illustrative; the real starter grids are in `factions/*.md` and have no H).

| Row | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| 1 | | | - | - | | |
| 2 | | - | - | - | - | |
| 3 | - | - | - | - | - | - |
| 4 | - | - | - | - | - | - |
| 5 | - | L | M | H | C | - |
| 6 | L | M | H | C | R | R |

Engine storage: `cols[c][i]` where `i` = index into the column string (0 = top box, filled first). A d6 picks the
column; damage fills that column's first empty boxes, then the next column right, wrapping 6 → 1. Weapons it references:

```json
[
  { "id": "ex.w.boiler-cannon", "name": "Boiler Cannon", "type": "ranged", "rng": 10, "rof": 1, "aoe": 3,
    "pow": 15, "blastPow": 7, "location": "R", "damageTypes": ["blast"] },
  { "id": "ex.w.piston-fist", "name": "Piston Fist", "type": "melee", "rng": 1, "pow": 16, "location": "L",
    "qualities": ["core.q.throw"] },
  { "id": "ex.w.flame-jet", "name": "Flame Jet", "type": "ranged", "rng": "SP8", "rof": "d3", "pow": 12,
    "location": "S", "damageTypes": ["fire"], "qualities": ["core.q.continuous-fire"] }
]
```

A triggered ability and an optional one with a code hook:

```json
{ "id": "ex.a.steam-vent", "name": "Steam Vent",
  "text": "When an enemy hits this model with a melee attack, the attacker takes a POW 10 steam blast after the attack resolves.",
  "kind": "triggered", "trigger": "attack.resolved",
  "when": { "all": [ { "test": "hit" }, { "test": "attackKind", "value": "melee" }, { "test": "isEnemy", "subject": "attacker" } ] },
  "effect": [ { "op": "damage", "pow": 10, "damageType": "fire" } ],
  "scope": { "who": "attacker" }, "duration": "instant" }

{ "id": "ex.a.overdrive", "name": "Overdrive",
  "text": "Once per activation this model may take +2 SPD for the activation; it then cannot make ranged attacks.",
  "kind": "triggered", "trigger": "activation.start", "optional": true, "limit": "oncePerActivation",
  "effect": [ { "op": "modStat", "stat": "SPD", "value": 2 }, { "code": "forbidRangedThisActivation" } ],
  "scope": { "who": "self" }, "duration": "activation" }
```

All four examples validate against the schemas (checked with ajv at M0).
