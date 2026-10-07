# 00: Architecture

Source of truth for module boundaries, the engine contract, the decision model and determinism.
Rules semantics live in `10-rules-core` (IDs in `12-rules-test-checklist`); data shapes in `20`; figures `30`; AI `40`;
client `50`; testing `60`. `src/engine/{types,actions,events,hooks,rng,decider,index}.ts` are the code form of §2–§9 and
are FROZEN after M0: changes are additive only (new optional fields, new union members) and need a line in this file.
On a conflict, `10` wins on what a rule does; this file wins on names and shapes. Log the mismatch as a `RULING:`.

## 1. Modules

| Module | Path | May import | Must not | Runtime |
|---|---|---|---|---|
| engine | `src/engine/` | itself; JSON *types* from `src/data/types.ts` | DOM, React, three, timers, `Math.random`, `Date`, data JSON | node, browser, worker |
| data | `src/data/` | schemas (types only) | side effects | JSON, validated by `tools/validate-data.ts` |
| ai | `src/ai/` | engine public API (read-only), data types | client, three, DOM | node, worker |
| client | `src/client/` | engine, ai (via worker), data, assets | mutate `GameState`; compute rules numbers | browser |
| tools | `tools/` | anything | be imported by `src/` | node (`tsx`) |
| tests | `tests/` | everything | | vitest, playwright |

- Dependency direction: `data ← engine ← ai ← client`. Alias `@/` → `src/` (no `baseUrl`).
- Enforced by an import-boundary test (`tests/engine/boundaries.test.ts` greps imports per module).
- Engine and ai run unchanged in `npm run sim`, `npm run bench:ai` and a Web Worker.
- **Code split.** `client` loads `engine+data` and `ai` as separate dynamic chunks (`import()`); the title screen
  renders before either arrives. Faction data is one chunk per faction. Budgets in §12.

## 2. Engine API (`src/engine/index.ts`)

| Function | Returns | Notes |
|---|---|---|
| `createGame(setup: GameSetup, seed: string, bundle: DataBundle)` | `StepResult` | validates lists against level rules; bad setup → `StepResult.rejection` (`E_BAD_SETUP`), never throws. Resolves the roll-off itself (seeded d6s, ties reroll, emits `RollOffWon`); the first pending is `chooseTurnOrder` for the winner. |
| `step(state, action)` | `StepResult` | pure reducer. RNG restored from `state.rng`. Illegal action → same `state` ref, `events=[ActionRejected]`, same `pending`, `rejection`. |
| `legalActions(state)` | `Action[]` | answers to `state.pending`. **Never empty while a decision is open** (§5). Continuous decisions return a finite *sample* that always contains ≥1 fully validated answer. |
| `validate(state, action)` | `Rejection \| null` | exactly the checks `step` runs; no mutation. Used by drag previews at ≤30 Hz. |
| `replay(setup, seed, bundle, actions)` | `StepResult` | folds `step` from `createGame`; asserts no rejections. |
| `save(state)` / `load(file, bundle)` | `SaveFile` / `StepResult` | §10. |
| `view(state, player)` | `PlayerView` | Deciders only ever see a view (no hidden info in the first release; the seam exists for multiplayer). |
| `query.*` | read-only numbers | §8. The ONLY source of numbers the UI or AI displays. |

```ts
interface StepResult {
  state: GameState;            // new state, or the SAME reference when rejected
  events: GameEvent[];         // ordered; [ActionRejected] only, when rejected
  pending: PendingDecision;    // exactly ONE; kind 'gameOver' when the game has ended
  rejection?: Rejection;       // present iff the action was illegal
}
interface Rejection { code: RejectionCode; message: string; detail?: Record<string, unknown> }
```

Reducer rules:
1. Immutable state; structural sharing via hand-written spreads. No I/O, clock or `Math.random`.
2. One action → 0..n events → exactly one `pending`. Forced single-option decisions are auto-resolved inside the step
   and emit `DecisionAutoResolved {kind, optionId}` so logs stay readable; dice are never "confirmed" by the player.
3. Every rule effect emits an event. Client and AI rebuild what they show from `state` + events, never from diffs.
4. **Read targets from state, not events.** The current roll's target and modifiers live in `state.attack` (§7) before
   any reroll window opens; a test pins this ordering.
5. `step` throws only `EngineInvariantError` (corrupt state = programmer error). The sim treats it as a failed game.

## 3. Game state (shape, abridged)

| Field | Type | Notes |
|---|---|---|
| `seed`, `rng` | `string`, `[u32,u32,u32,u32]` | sfc32 state (§9) |
| `dataVersion` | string | hash of the bundle; replay/load refuse a mismatch (`E_DATA_VERSION`) |
| `round`, `turn`, `activePlayer`, `firstPlayer` | int, int, `'A'\|'B'` | round 1..7 |
| `phase` | `'setup'\|'deploy'\|'maintenance'\|'control'\|'activation'\|'ended'` | |
| `models` | `Record<ModelId, ModelState>` | §3.1 |
| `units` | `Record<UnitId, UnitState>` | troopers, attachments, `activated` |
| `effects` | `EffectInstance[]` | continuous effects, spells, feats, ability durations (one list, §6) |
| `upkeeps` | `Record<ModelOrUnitId, {friendly?: EffectId, enemy?: EffectId}>` | ≤1 per side |
| `attack` | `AttackContext \| null` | the in-flight attack (§7) |
| `activation` | `ActivationContext \| null` | who, movement used, combat action used, charge target, moved distance, attacks made, spells cast |
| `scenario` | `ScenarioState` | element control, VP, kill-box flags, scoring log |
| `pending` | `PendingDecision` | also returned in `StepResult` |
| `decisionSeq` | int | ids `d:<n>` |
| `log` | `Action[]` | full action log for save/replay |

M0 code form (`types.ts`) also carries: `setup`, `players` (faction, list, leader, edge, ambush ids), `terrain`, `clouds`,
`window` (current step), `rollSeq`/`attackSeq`/`effectSeq`; ModelState adds `type`, `offTable`; single track adds `boxes`.
Action types beyond the §5 kinds: `pass`, `ack`, `endTurn`, `endAttacks`, `powerAttack`, `heal`. Coordinates: centre origin, `{x,z}`.

### 3.1 ModelState
`{ id, profileId, owner, unitId?, pos:{x,z}, elev, base: mm, focus: int, damage: DamageState, life: LifeState,
conditions: ConditionId[], crippled: SystemLetter[], hardpoints: Record<slot, optionId>, featUsed?: boolean,
activated: boolean, controllerId? (war-engine → its caster), inert?: boolean }`

- `DamageState` = `{track:'single', filled:int}` | `{track:'grid', grids:[{id, cols: boolean[][]}]}` (`true` = filled).
- `LifeState` = `'active' | 'disabled' | 'boxed' | 'destroyed'` (§6.2).

## 4. Focus as a first-class resource

- `ModelState.focus` is the only store. Caps: caster ≤ ARC after Control refill (may exceed via effects until trimmed in
  Maintenance); war-engine ≤ 3 always (`E_FOCUS_CAP`).
- Every change emits `FocusChanged {modelId, delta, after, reason}`; `reason` ∈ `refill | powerUp | allocate | trim |
  maintenanceClear | spend | lose | gain`.
- Every spend goes through one function `spendFocus(state, modelId, n, purpose)` and records `purpose`:

| Purpose | Who | Cost | Window |
|---|---|---|---|
| `boostAttack` / `boostDamage` | caster, war-engine (own focus) | 1 per roll | `attack.beforeRoll` / `damage.beforeRoll` |
| `additionalAttack` | caster, war-engine | 1 each | `combat.chooseAttack` |
| `spell` | caster | COST | any time in own activation, not mid-move/mid-attack |
| `upkeep` | caster | 1 per spell | `control.upkeep` |
| `shake` | the knocked-down/stationary model itself: caster or war-engine, own focus (p101–102) | 1 | `control.shake`, after allocation |
| `heal` | caster, self | 1 per damage point | caster's activation |
| `powerField` | caster (and anyone granted it), own focus, also outside its activation | ≤1 per damage instance, −5 each; the model still counts as damaged at 0 (p101) | `damage.beforeApply` |
| `run` / `charge` | war-engine | 1 | `movement.choose` (waived within 8" of its 'jack marshal, p112; not in Recon) |
| `powerAttack` | war-engine | 1 | `combat.choose` |

- **Focus is spent only in the model's own activation** unless a rule says otherwise (p100, p102). Outside it the engine offers no focus options (boost, additional attack, heal, spell); the exceptions are `upkeep`, `shake` and `powerField`.
- Crippled Cortex: `focus` forced to 0, all gain/spend rejected `E_CRIPPLED`. Disruption: same for one round via an
  `EffectInstance`.

## 5. Decision model

The engine never blocks; when the rules need a choice it returns a `PendingDecision`. The next `Action` must carry
`decisionId === pending.id` and come from `pending.player`.

```ts
interface PendingDecision {
  id: string;                    // "d:<n>"
  player: 'A' | 'B';
  kind: DecisionKind;
  window: WindowId;              // §7
  context: DecisionContext;      // ids + engine-computed numbers (odds, targets) for the prompt
  options?: DecisionOption[];    // finite answers, each {id, label, action, cost?:{focus:number}, odds?}
  constraints?: MoveConstraints; // continuous answers: maxDist, straightLine, mustEndInRange, zone, placeWithin
  canPass: boolean;
}
```

Column **AT** = the decision also accepts the caster's any-time actions (`castSpell`, `useFeat`, `heal`, `channel`)
for the active model (R4.10, A1); after the last attack (`combat.end`) they ride on the `chooseAttack` that offers `endAttacks`. Never inside an attack, the spellcasting sequence, a trigger window, between an
attack and the attack it generated, before required forfeits are resolved, or after running.

| Kind | Who | Raised at | Answer | AT |
|---|---|---|---|---|
| `rollOff` | — | — | **reserved, never raised**: `createGame` rolls it (§2) | — |
| `chooseTurnOrder` | roll-off winner | setup | `first` / `second` | — |
| `chooseEdge` | the **second** player (R11.4) | setup | edge id | — |
| `deploy` | deploying player | deploy | model/unit positions (continuous) | — |
| `advanceDeploy` | owner of Advance Deployment models | deploy | positions within zone +3" | — |
| `maintenanceOrder` | active | maintenance | order of simultaneous maintenance effects (only if a choice exists) | — |
| `allocateFocus` | active | `control.allocate` | `{modelId: n}` map; caster-to-war-engines in CTRL; cap 3 | — |
| `payUpkeep` | active | `control.upkeep` | per upkept effect: keep (1 focus) / drop | — |
| `shake` | active | `control.shake` | per shakeable model/effect: shake (1 of that model's focus) / keep | — |
| `chooseActivation` | active | `activation.choose` | model/unit id; `endTurn` only when none is left | — |
| `chooseMovement` | active | `movement.choose` | `forfeit`/`aim`/`advance`/`run`/`charge`/`slam`/`trample`/`standUp` | yes |
| `moveModel` | active (or trigger owner) | `movement.move` | path end point (straight or advance path); continuous | — |
| `chargeTarget` | active | `movement.charge` | target id (LOS-checked; for slam: LOS at the start of Normal Movement), then `moveModel` with `straightLine` + `toward` | — |
| `placeTroopers` | active | `movement.place` | positions within 2" (base edge) with LOS to the moved trooper | — |
| `chooseCombatAction` | active | `combat.choose` | `melee`/`ranged`/`dual`/`specialAttack`/`specialAction`/`powerAttack`/`forfeit`; after a successful charge only melee or a melee ★Attack | yes |
| `chooseAttack` | active (or trigger owner) | `combat.chooseAttack` | weapon + target; `additionalAttack` options carry `cost.focus=1`; `endAttacks` | yes, before declaring |
| `combinedAttack` | active | `combat.chooseAttack` | contributing trooper ids | — |
| `channel` | active | `spell.declare` | cast from caster or an eligible Arc Node | — |
| `castSpell` | active | `spell.declare` | spell id + target/point | — |
| `useFeat` | active | caster activation | feat id + any feat choices | — |
| `boostAttack` | attacker's controller | `attack.beforeRoll` | boost (1 focus) / no; Powerful Attack option boosts attack + damage for 1; shows both odds | — |
| `rollAnyway` | attacker | `attack.beforeRoll` | auto-hit target: `accept` / `roll` (the roll then decides) | — |
| `reroll` | holder of a reroll | `*.rolled` | reroll (named source) / keep | — |
| `boostDamage` | attacker's controller | `damage.beforeRoll` | boost / no (charge and Powerful Attack skip this) | — |
| `chooseGrid` | attacker | `damage.beforeApply` | colossal grid L/R | — |
| `powerField` | the damaged model's controller | `damage.beforeApply` | spend 0..1 focus (−5) per instance | — |
| `chooseBoxes` | as the effect says | `damage.applied` / heal | box picks when a rule lets a player choose (Marksman column, grid healing); else automatic | — |
| `triggerWindow` | trigger owner | any window incl. `death.disabled` (Tough), `death.boxed`, `death.destroyed`, `attack.resolved` | resolve trigger X next / pass optional ones | — |
| `abilityChoice` | any | any | generic finite choice raised by an ability or code hook; `context.data.code` names it (e.g. `prey`) | — |
| `gameOver` | none | `ended` | no answer; `legalActions` = `[ack]` | — |

**Out-of-activation movement and attacks** (Evasive, Beat Back, Swift Hunter, Banish, Reciprocate,
Critical Shred, Avenging Force in Maintenance):
1. The trigger opens a `triggerWindow` (window `attack.resolved` or `maintenance.effects`) for its owner; choosing
   it resolves its effect list.
2. An `advance` effect raises `moveModel` for that model with `maxDist` = the effect's distance and, for
   `direction: 'toward'|'away'`, `straightLine` + `toward`. It is an advance (rough terrain applies) but never
   Normal Movement (no disengage forfeit, R5.7).
3. A `makeAttack` effect raises `chooseAttack` with `state.activation` unchanged (`null` in Maintenance) and
   `AttackContext.outOfActivation = true`. No focus options are offered unless the rule grants them (§4). The
   attack runs the full pipeline and may itself generate one attack (R7.19).
4. "After the attack is resolved" windows are opened in the three A1 tiers (R7.18 step 16): active non-attack,
   inactive, active attack-making (`TriggerDescriptor.makesAttack`, `afterResolveTier` in `hooks.ts`).

**Power attacks that use movement:** slam = `chooseMovement 'slam'` → `chargeTarget` (target in LOS at the start of
Normal Movement) → `moveModel {straightLine, toward, maxDist: SPD+3, mustEndInRange}`; the attack follows
automatically. Trample = `chooseMovement 'trample'` → `moveModel {straightLine, maxDist: SPD+3}` (the path's
direction is the declared direction) → simultaneous trample attacks.

- `legalActions` invariant: for every open decision the list is non-empty and every member passes `validate`.
  Feasibility = "some candidate passes full validation", never "the planner's arrangement fits". `moveModel` always
  includes the zero-length move (or `forfeit`) when legal; `placeTroopers` includes a validated chain placement or
  the destroy-unplaceable fallback; `deploy` includes a chain-deploy fallback for shallow zones.
- `pass` is legal iff `canPass`.

## 6. One generic mechanism per concept

### 6.1 Effects
All durations (spells, feats, abilities, conditions with expiry, continuous effects) are `EffectInstance
{id, sourceId, name, owner, targetIds, mods, duration: 'attack'|'activation'|'turn'|'round'|'upkeep'|'continuous'|
'game', expires: {round, turn, player} , upkeep?: {casterId}}`. Same-named effects do not stack: re-applying the same
`name` to a target keeps the instance with the later expiry (max, never overwrite). Stat resolution order: set (several sets: the lowest wins) → ×2 → ½
→ bonuses → penalties, floor 0 (`query.stat`).

### 6.2 Disabled → boxed → destroyed
- `damage.applied`: when the last box fills, `life: 'disabled'` and window `death.disabled` opens (Tough, "when
  disabled" triggers). A trigger that heals sets `life: 'active'`.
- Still disabled when the window closes → `life: 'boxed'`, window `death.boxed` ("when boxed" triggers, VP
  bookkeeping) → `life: 'destroyed'`, window `death.destroyed`, then removal from the table (`ModelRemoved`).
- MK4 semantics of each step are owned by `10-rules-core` R3.9 (checked against A1 damage application, p96).
- One implementation (`src/engine/damage.ts: advanceLife`) for every model type and every cause (attack, collateral,
  continuous effect, falling, upkeep). Factions add triggers through ability data or `code-hooks.ts`, never new state.
- Disabled models: no activation, no contest, no LOS blocking; they still occupy their base (unsourced ruling).

### 6.3 Conditions
`knockedDown`, `stationary`, `disrupted`, `fire`, `corrosion`, `inert`, `engaged` (derived, never stored) are
condition ids backed by `EffectInstance` where they expire. One shake path for every shakeable condition.

### 6.4 Areas
`state.clouds` holds every round area: `kind` `cloud` (blocks LOS through it, concealment; Pall of Ashes), `hazard`
(a cloud that also deals `hazard` damage on `enter` (once per advance) and/or `endActivation`; Mage Storm, Eruption of
Ash) and `flare` (no LOS block, no concealment; models in it lose Stealth and clouds don't block LOS to them;
Targeting Flare). Expiry comes from the linked `EffectInstance` or `Cloud.expires`. Data calls them areas, never
"templates" (MK3 lint).

## 7. Windows and the attack sequence

`WindowId` (frozen string union; data triggers use the same ids):

| Group | Ids |
|---|---|
| turn | `turn.start` `maintenance.start` `maintenance.effects` `control.refill` `control.powerUp` `control.allocate` `control.upkeep` `control.shake` `activation.start` `activation.end` `turn.end` `round.end` |
| movement | `movement.choose` `movement.start` `movement.move` `movement.charge` `movement.place` `movement.end` |
| combat | `combat.choose` `combat.chooseAttack` `combat.end` |
| attack | `attack.declared` `attack.beforeRoll` `attack.rolled` `attack.hit` `attack.crit` `attack.miss` `attack.resolved` |
| damage | `damage.beforeRoll` `damage.rolled` `damage.beforeApply` `damage.applied` `damage.crippled` |
| death | `death.disabled` `death.boxed` `death.destroyed` |
| spell/feat | `spell.declare` `spell.cast` `feat.used` |
| scenario | `scenario.score` `game.end` |

Attack pipeline as events (one per step, in order; `10-rules-core` holds the rules for each step):
`AttackDeclared` → (range/LOS verdict stored in `state.attack`) → `boostAttack`/`rollAnyway` decision →
`DiceRolled{purpose:'attack'}` → `reroll` window → `AttackResolved{hit, crit, auto}` → `attack.hit|crit|miss` triggers →
per damage instance (direct target, then blast/collateral targets as one simultaneous batch):
`boostDamage` → `DiceRolled{purpose:'damage'}` → `reroll` → `powerField`/`chooseGrid` → `DamageApplied{boxes, crippled}`
→ `death.*` windows → `attack.resolved` → next attack or `combat.chooseAttack`.

`AttackContext` (in state, read by UI): `{attackerId, weaponId, targetId, kind, dice, mods[], hitTarget, pHit,
pHitBoosted, damageTarget?, powDirect, powBlast?, autoHit?, autoMiss?, losVerdict, rollId?}`.

## 8. The engine owns every displayed number (`query.*`)

| Query | Returns |
|---|---|
| `query.distance(a, b)` | edge-to-edge inches |
| `query.los(viewerId, targetId)` | `{visible, reasons: LosReason[], blockers: id[], mods: {concealment, cover, elevation, inMelee, stealth}}` |
| `query.attackPreview(attacker, weapon, target, opts)` | hit target, dice, `pHit` (base/boosted), crit chance, damage target, expected damage, `pKill` |
| `query.threat(modelId)` | advance, run, charge (SPD+3+reach), slam, ranged reach |
| `query.control(state)` | per scenario element: `{controller, contesters, holders, reason}`; VP now; leader kill-box flags |
| `query.stat(modelId, stat)` | resolved stat with the modifier trace |
| `query.moveCheck(modelId, path)` | `{ok, stopAt, reason}` (collision, rough, obstacle) |

The client never does rules arithmetic (Mallet bugs: control computed client-side, save numbers ignoring cover).

## 9. Determinism, RNG, replay

- `rng.ts`: sfc32 seeded by `cyrb128(seed)`. State lives in `state.rng`. Every roll goes through
  `roll(state, spec: {count, sides:6, purpose, ownerId})` → `DiceRolled {rollId, purpose, dice, kept, total, target?}`.
- `purpose` ∈ `rollOff attack damage column tough continuous slamDist throwDist fall rof d3 aoeTie collateral spell
  maintenance scenario other`. Every purpose must reach the dice tray (`50-client`).
- AI randomness uses its own seed (`hash(gameSeed, decisionId)`), never `state.rng`, so logs replay identically.

## 10. Save, load, undo

`SaveFile = {format: 1, engine: semver, dataVersion, setup, seed, actions: Action[], meta: {savedAt, label}}`.
Load = `replay`. Undo = replay minus the trailing actions back to the human's previous decision (only vs bot or
hotseat). Saves live in `localStorage` (`wm.save.<slot>`) and export as `.json`.

## 11. Decider

```ts
interface Decider { decide(view: PlayerView, pending: PendingDecision, legal: Action[]): Promise<Action> }
```
- One interface for human (resolved by the interaction layer), AI (worker, `40-ai`), random bot, and replay.
- `GameRunner` (`src/client/store/`) is the ONLY caller of `step`; the bot answers only when presentation is idle,
  with a 5 s no-progress watchdog that force-answers bot-owned decisions with `legal[0]`.

## 12. Rejection codes

`E_WRONG_DECISION` `E_NOT_YOUR_DECISION` `E_NOT_AN_OPTION` `E_BAD_PAYLOAD` `E_BAD_SETUP` `E_DATA_VERSION` `E_GAME_OVER`
`E_INSUFFICIENT_FOCUS` `E_FOCUS_CAP` `E_CRIPPLED` `E_OUT_OF_RANGE` `E_NO_LOS` `E_OUT_OF_CTRL` `E_ENGAGED`
`E_KNOCKED_DOWN` `E_STATIONARY` `E_ALREADY_ACTIVATED` `E_ALREADY_USED` `E_TARGET_INVALID` `E_BASE_OVERLAP`
`E_PATH_BLOCKED` `E_TOO_FAR` `E_NOT_STRAIGHT` `E_OUT_OF_ZONE` `E_PLACEMENT` `E_UPKEEP_LIMIT` `E_POWER_ATTACK`
`E_NO_DUAL_ATTACK`. New codes are additive.

## 13. Performance budgets

| Item | Budget |
|---|---|
| `step` | ≤1 ms median, ≤5 ms p99 (node, M1 laptop class) |
| `legalActions` | ≤10 ms p99; continuous samples ≤64 candidates |
| `query.los` | ≤0.2 ms per pair with ≤40 terrain pieces |
| `npm run sim` | random-vs-random 30-pt game ≤2 s; 200-game batch ≤3 min |
| AI decision (normal) | ≤500 ms p95, 2 s hard cap in the worker |
| JS | initial chunk ≤350 KB gz; engine+data ≤250 KB gz; ai ≤150 KB gz |
| Frame | 60 fps at 1080p mid GPU; ≤200 draw calls; ≤400k triangles on board |

## 14. Contract change log (additive only)

| Date | File | Change | Why |
|---|---|---|---|
| 2026-10-04 | `hooks.ts` | `EffectOp` += `advance slam throw endActivation removeFromPlay removeAbility modRoll discardLowest makeAttack ignore`; `ForbidWhat` += `tough knockDown weaponAttacks`; `ConditionTest` += `concealed isPrey b2b`; new `IgnoreWhat`, `AreaKind`, `HazardSpec`; `EffectNode` optional `ignore count placement area blocksLos hazard collateralPow target weaponFilter basic`; `TriggerDescriptor.makesAttack?`; `OP_HOOK_POINTS` entries; `afterResolveTier()` | M0 review: ~15 starter abilities were not expressible; A1 three-tier after-resolution order |
| 2026-10-04 | `common.schema.json` (both copies) | Mirrors the `hooks.ts` additions (ops, forbid values, tests, new effect fields) | Data must express the same vocabulary |
| 2026-10-04 | `types.ts` | `Cloud` += optional `kind blocksLos concealment hazard expires`; `UnitState.preyId?`; `AttackContext` += `generatedBy? outOfActivation?`; `DecisionKind 'rollOff'` documented as reserved (never raised) | Targeting Flare and hazard clouds need state; Prey; R7.19 one generated attack; out-of-activation attacks; roll-off auto-resolved in `createGame` |
| 2026-10-04 | `index.ts` | Bodies wired (M2). Additive: `registerBundle(bundle)`; `step`/`validate`/`legalActions`/`query` read the bundle registered for `state.dataVersion` (createGame/replay/load register it; the default bundle is the fallback) | `step(state, action)` has no bundle parameter |
| 2026-10-04 | engine flow (not a contract file) | `placeTroopers` is now raised after a unit's moved trooper (auto option + validated custom placements); `chargeTarget` is followed by a straight-line `moveModel`; Maintenance can raise `moveModel`/`chooseAttack` (`context.data.code = 'avengingForce'`) before Control; Granted: Prey's `abilityChoice` is raised after deployment | Matches §5's decision table; needed for GOLD-001 |
| 2026-10-05 | `index.ts` | `AttackPreviewOpts.attackType?` (the weapon's Attack Type, as in `ChooseAttackAction.attackType`). `chargeAttack` omitted = inferred from the activation (R5.3: the charger's first melee attack at its charge target after a 3"+ charge); an active ★Attack is inferred too. The damage side now runs the attack's own `damage.beforeRoll` step (additional dice such as Decrepitation, flat bonuses, Armor-Piercing, Resistance, discard-lowest), and an AOE in range adds the blast-on-miss damage (R7.9) | The client showed "standard shot" odds for shot modes and could not tell a charge attack apart |
| 2026-10-05 | `index.ts` | `describe.decision().title` is now a short human title per decision kind in our own words (e.g. "Vilkul: pick an attack"), never the raw kind id | Client fallback heading |
| 2026-10-05 | engine flow (not a contract file) | Slam and trample are offered as Normal Movement options (models with the Slam / Trample power attack, activating alone; a war-engine pays 1 focus on declaring). Slam: `chooseMovement('slam')` → `chargeTarget` with `context.data.mode = 'slam'` (enemies in LOS) → straight `moveModel` (`toward`, `mustEndInRange` = slam range, `data.mode = 'slam'`) → `CombatActionChosen(powerAttack, slam)` then either `chooseAttack` whose only answer is the slam `powerAttack` at the declared target, or `ActivationEnded('failedSlam')`. Trample: `chooseMovement('trample')` → `moveModel` (`straightLine`, `data.mode = 'trample'`) → one `AttackDeclared` (kind `trample`) / `AttackResolved` pair per small enemy moved through → `chooseAttack` (additional melee attacks only) | R7.12, R7.14; the M2 build filtered both out |
| 2026-10-05 | engine flow and data (no contract file changed) | M8 terrain: `terrain.ts` `TerrainTraits` += `hazardSpec losThrough resist` and reads the schema `props` overrides; `terrainResistance()` feeds `resistsDamageType` (trench: blast); hazard pieces fire on entry (`entryHazards` in `phases/activation.ts`, after advance, run, charge, slam, trample, trigger moves and unit placement) and at `finishActivation`; `scenarioAnchorProblems(bundle, scenarioId, layoutId)` in `scenario.ts` makes `createGame` reject a layout that lacks the scenario's terrain anchors with the existing `E_BAD_SETUP`. Data: new record kind `board` (`boards.json`, `board.schema.json`), `terrain-layout.board?`, `terrain.schema.json` props and rulesType reconciled, 37 pieces and 15 layouts. `src/data/battlefields.ts` holds `pickBattlefield`. No type, action or event added | G1 to G7 of 70 §A; the selection rule of 70 §E needs no `GameSetup` change |
| 2026-10-06 | `types.ts` | `ModelType` += `'beast'`; `WINDOW_IDS` += `'control.leech'` (after `control.refill`), `'control.threshold'` (after `control.upkeep`); `ModelState` += `fury? wild? frenzied? bondedTo?`; `GameState.thresholdQueue?`; `ActivationContext.frenzy?`; `DamageInstance` += `noTransfer? transferredFrom?`, `kind` += `'transfer'`; `DecisionKind` += `'leech' 'transferDamage' 'adjustFury' 'reave'`; `DecisionOption.cost` += `fury? forced?`; `RejectionCode` += `'E_INSUFFICIENT_FURY' 'E_FURY_CAP' 'E_CANNOT_FORCE'`; `RollPurpose` += `'threshold' 'frenzyTie'`; new `Aspect`, `ASPECT_LETTER`, `FuryReason`, `FuryPurpose`, `ForcePurpose` | M9 fury (81 B.1, C, D, §E) |
| 2026-10-06 | `types.ts` | Faction additions: `ConditionId` += `'shadowBind' 'blind'`; `WINDOW_IDS` += `'spell.expire'` (last); new `TokenKind = 'soul' \| 'corpse'` and `ModelState.tokens?: Partial<Record<TokenKind, number>>`; `RejectionCode` += `'E_INSUFFICIENT_TOKENS'` | Shadow Bind (Circle), Blind and the upkeep-expiry window (Cryx), corpse and soul tokens (Circle, Cryx) |
| 2026-10-06 | `actions.ts` | New `LeechAction`, `TransferDamageAction`, `AdjustFuryAction`, `ReaveAction`, `TakeControlAction` (union 34 → 39); `HealAction` += `targetId? boxes?`; `CastSpellAction` += `animusOf?` | 81 C.1, C.2 |
| 2026-10-06 | `events.ts` | New `FuryChanged FuryLeeched FuryReaved BeastForced ThresholdChecked Frenzied FrenzyEnded DamageTransferred AspectCrippled AspectRestored BeastWild BeastControlTaken` (81 D.1) and `TokenGained TokenSpent` (faction tokens): union 54 → 68; `SpellCast` += `animus? forced?`; `RollBoosted.source` += `'fury' 'frenzy'`; `ActivationEnded.reason` += `'frenzy'`; `ConditionRemoved.reason` += `'frenzy'`; `CombatActionForfeited.reason` += `'tookControl'` | Every fury and token change emits an event (00 §2 rule 3) |
| 2026-10-06 | `hooks.ts` | `EffectOp` += `gainFury loseFury` (81) and `gainToken spendToken` (faction tokens; `token`, count in `value`); `ForbidWhat` += `gainFury force beTransferred combatAction` (81) and `heal` (Grievous Wounds); `ConditionTest` += `furyAtLeast aspectCrippled frenzied inBattlegroup` (81) and `living undead hasAbility tokensAtLeast` (factions); `IgnoreWhat` += `forest friendlyModels shieldBonuses`; new `PlaceMode = 'b2bWithTarget'` with `EffectNode.placeMode?`; `ScopeNode.who` += `warbeasts`; `DescriptorSource` += `animus`; `TriggerDescriptor.cost` += `fury? forced? soul? corpse? damage?` (`focus` stays required; builders default it to 0); `OP_HOOK_POINTS` for the four new ops | Faction abilities that force, grant or strip fury, pay with tokens or damage, and refuse transfers (81 §E, factions/*.md "New mechanics needed") |
| 2026-10-06 | `index.ts` | `query.fury battlegroup threshold spiral transferPreview frenzyTarget leechPreview` with result types `FuryInfo BattlegroupInfo ThresholdInfo SpiralView TransferPreviewRow FrenzyTargetInfo LeechPlan LeechPreview` (stubs: `query.fury` answers `kind: null` for focus models, everything else throws `not implemented (M9)` until E7); `ThreatRanges.needsForce?`; `describe` titles for the four new decision kinds, lines for the new events, and option costs shown as focus / fury / force. `ENGINE_VERSION` stays 0.2.0 until the bodies land | 81 D.2 |
| 2026-10-06 | `decider.ts`, `rng.ts` | No change | The `Decider` interface and `roll()` already cover the new kinds and purposes |
| 2026-10-06 | schemas (both copies) and `20-data-schema` | model `type 'beast'`, `resource`, `beastClass`, `animus`; spiral `DamageTrack`; beasts need `FURY THR` (RAT only for non-beasts), warlocks `ARC CTRL`; spell `animus?` and `rng "SP<n>"`; shared `Cost` `{focus? fury? forced? soul? corpse? damage?}` for abilities; hardpoint option `animus?`; list entry `controller?`; `common.schema` mirrors the `types.ts`/`hooks.ts` rows above | Data must express warlocks, beasts, spirals, animi and the four M9 factions (81 B.2) |
| 2026-10-06 | data registration (not a contract file) | `src/data/raw.ts` keeps core and shared files and spreads one `RawGroup` per faction from `src/data/factions/<id>/raw.ts` (cyg, kha moved there unchanged, with their lists; trl, cir, cry, men added with `faction.json` only). New faction engine modules `src/engine/factions/{trollbloods,circle,cryx,menoth}.ts` (empty hooks and plugins) are registered in `code-hooks.ts` | Parallel faction builders touch only their own files |
| 2026-10-06 | `actions.ts` | `ChooseCombatActionAction` += `targetId?` (a special action aimed at one friendly model: Repair, Enliven, Ancillary Attack) | M9 core pass: ★Actions of non-casters |
| 2026-10-06 | `types.ts` | `ModelState` += `deathHandled?` (the `death.destroyed` window has run for the model) | M9 core pass: souls from deaths no attack accounted for |
| 2026-10-06 | engine internals (not a contract file) | Effects may carry extra JSON-safe fields the frozen `EffectInstance` does not name (`effects.ts` `EffectExtras`): `grants` (abilities for a while: Soul Phase, Fight to the Last), `resist` (Fortification), `condMods`, `rollMods`, `ignoreFriendly` (Precision Strike), `afterDamageAdvance` (Enliven). `Cloud` may carry `friendlyTransparent` (Veil of Mists). Terrain pieces may carry `props.rockWall` (Rock Wall) and `props.tempRound` (Rift). `index.ts` `step` runs `housekeeping()` after every action (drops a Rock Wall whose upkeep ended or that an 80/120 mm base touches, and Rift ground once its round has passed) | M9 core pass: generic mechanisms for the four factions' effects |
| 2026-10-06 | engine flow (not a contract file) | New decisions that reuse existing kinds: `abilityChoice` with `context.data.code = 'startTrigger'` (an optional `activation.start` ability the model can pay for: Soul Generator, Soul Phase, Trollblood Regeneration; options `use` and `skip`) and `'declOpt'` (an optional `attack.declared` ability with a cost: Wraith Shot; options `use` and `no`); `moveModel` with `context.data.trigger.ctx = 'ward'` (an Admonition ward answers an enemy move, raised for the ward's owner); `placeTroopers` with `context.data.code = 'ambush'` at the end of the Control Phase (Ambush arrivals, from round 2, options `auto` or pass) answered by `answerControl`; `chooseAttack` with `context.data.code = 'sentry'` in the Maintenance Phase (Rapid Fire; pass allowed). `combinedAttack` is now an option of `chooseAttack` (Combined Melee Attack). `chooseCombatAction` answers with `choice: 'specialAction'` are also accepted while attacks are chosen (self abilities such as Regeneration and Blood Rage) | M9 core pass: Ambush, ★Actions, optional triggers with a cost, Sentry, Admonition |
| 2026-10-06 | engine flow (not a contract file) | `abilityChoice` `startTrigger` options may now be `plan:<planId>|<group>` (Menoth Battle Plan: one per plan and group, plus `skip`); `AttackMeasured.dice` and `pHit` now include a boost an `attack.beforeRoll` ability already applied (Stoke the Pyre); abilities with trigger `movement.charge` run when a charge is declared (Relentless Charge); `castSpell` rejects a second Fire Step in an activation with `E_ALREADY_USED`. No contract file changed | Menoth review fixes |
| 2026-10-06 | engine flow (not a contract file) | Deployment: a model or whole unit with Ambush may be left out of a `deploy` / `advanceDeploy` answer (they wait in `PlayerState.ambushIds`; the `ambush` option holds them back); the arrival is checked by `ambush.ts` (completely within 3" of a table edge except the back edge of the opponent's zone) and the arrivals get the `Ambush entry` effect (`forbid moveOrAct`: Normal Movement or Combat Action, not both) | R11.6 |
| 2026-10-06 | engine internals (not a contract file) | `EffectExtras` += `grantedCover` (Fortification: the caster's side counts as in cover inside its CTRL, read by `defFor` through `hasGrantedCover`); `DefModOptions` += `grantedCover` (+4 once, never stacks with terrain cover or concealment, not against spray, ignore-cover beats it); `slideAway` += optional `collateralOverride` (Critical Devastation collateral is POW 8); `blastSet` is exported and an attack may carry `flags.fixedBlast` (blast set fixed before a throw); `flags.freeBoost` marks a free boost (Guided Fire) so `RollBoosted` reports source `effect` | Trollbloods review fixes |
| 2026-10-06 | engine flow (not a contract file) | Special actions: abilities of kind `specialAction` with trigger `combat.choose` are offered by `chooseCombatAction`; a self ability (scope `self`) is used any time and keeps the Combat Action, any other uses it up. Costs (`soul corpse focus fury forced damage`) are checked by `costs.ts`; core pays them except for the hooks that pay for themselves (`SELF_PAYING` in `phases/activation.ts`). `specialAttack` abilities whose weapon is not on the card name it in `attack` (the Furies' Stygian Abyss) | M9 core pass |

### M9 core pass rulings (rules ambiguities decided, in our words)

- RULING: Vital Magic keep prompt | a forced expiry (Banishing Ward) keeps each upkeep automatically for d3 damage while the caster has more than 6 boxes left; an unpaid upkeep in Control is not a forced expiry | the rule text offers a choice we cannot ask mid-spell without a new decision; the guard keeps the caster from boxing herself
- RULING: Wrath of Lyliss payment | a spell is paid with 1 damage (once per spell) when the focus is short, or when it costs 2+ and the caster has 10+ boxes left; a boost is paid with 1 damage when there is no focus; never below 4 boxes for a boost, 7 for a spell | the feat is optional and we have no prompt, so the engine spends damage only where it helps
- RULING: Incorporeal | not an intervening model; ignores bases, obstructions and rough ground when it moves (not when it charges its target); no damage from non-magical sources or continuous effects; cannot be pushed, slammed or thrown; an attack with a weapon (not a spell) removes it until the end of its controller's next turn start | cryx.md; "until its next activation" is approximated by a round effect
- RULING: Blind | -4 MAT and DEF, no ranged or magic attacks, no run, charge, slam or trample; a blind model that advances forfeits its Combat Action (it takes one of the two); it lasts a round and can be shaken | cryx.md
- RULING: Shadow Bind | -3 DEF, cannot advance (so no run, charge, slam or trample either), one round, shakeable | circle.md
- RULING: Admonition | the ward answers the first enemy model that ends a move (advance, run or charge) within 6", optional advance of up to 3" asked of the ward's owner, then the spell ends whether or not the model moved | circle.md; placed models and triggered moves do not wake it
- RULING: Enliven | an effect on the chosen model: after an enemy attack damages it, it may advance up to 6", then the effect ends | cryx.md
- RULING: Marionette is never offered | its reroll rule has no engine yet, and an attack that deals no damage would waste the Furies' Combat Actions | the data stays for later
- RULING: Ancillary Attack target choice | the chosen model attacks with the weapon and target of highest expected value (hit chance times POW less half the target ARM) | no decision for the second model's attack
- RULING: Stoke the Pyre free cast | whenever an enemy on Fire stands in Feora's CTRL and a spell costs focus, the cast is free and the Fire is stripped | the choice would need a prompt; the cost to the other Menoth models is small
- RULING: Sentry and Control ordering | Sentry's Rapid Fire runs after Avenging Force in the Maintenance Phase, once per Sentry per turn, and may be passed | trl.s.sentry
- RULING: Rock Wall | the wall is 4" x 3/4" (rulebook wall piece), refused where it would touch a base or another terrain piece; it is a point spell with no chosen point (the hook places it in front of the caster toward the nearest enemy, as before); its upkeep effect has no target model and is keyed `pt:<caster>:<spell>` | the engine has no point-pick decision yet
- RULING: Veil of Mists | the cloud blocks LOS for everyone except the caster's side; friendly models inside have Pathfinder and pass through models and obstructions | circle.md
- RULING: Combined Melee Attack | every unit mate still to act within the target's melee range may join (no cap); each gives up its Combat Action, and the primary's attack and damage rolls get +1 per participant, itself included (n contributors = +(n+1)); it is a charge attack only if the primary's attack is the charge attack and every contributor charged too | rulebook p91 counts the primary; menoth.md
- RULING: Soul Taker from other deaths | a living model destroyed by anything that is not an attack of the pipeline (fire, hazards, collateral, power attacks) gives the nearest friendly-to-the-enemy Soul Taker within 10" a soul at the next afterDeaths | cryx.md
