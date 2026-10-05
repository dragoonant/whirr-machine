# 50: Client

React 19 + R3F 9 + drei + zustand. The client never mutates `GameState` and never computes a rules number; every
hit target, damage target, LOS verdict, odds and control state comes from `engine.query.*` or `pending.context`.
Generic over factions from day one (no faction id literals outside `src/data/`).

## 1. Modules

```
src/client/
  store/          GameRunner (the ONLY caller of engine.step), gameStore, presentedStore, uiStore, settingsStore
  presentation/   director.ts (event → timed beats), announceStore (banner/narration queue)
  board/          Board, Terrain, Zones, ScenarioElements, Lights, Camera
  figures/        see 30-figures
  interaction/    per-decision controllers, picking, drag, keyboard
  ui/             panels, prompts, GridCard, FocusOrbs, Settings, StartScreen
  dice/           DiceTray, DiceLog
  vfx/            pooled particles (muzzle, impact, sparks, smoke)
  audio/          (M6)
  testing/        window.__game API, DOM proxies
```

## 2. Presentation director and presented store

- `gameStore` holds the true engine state, pending decision and event log (ring buffer 2 000).
- `director` turns each `GameEvent` batch into beats (move tween, attack, dice, damage pips, banner) with durations
  scaled by the speed setting; any click skips the current beat.
- `presentedStore` holds state **as of the animation cursor**. Everything on screen renders from it; panels never
  show a number ahead of its animation.
- The bot decides only when `director.idle`; a 5 s no-progress watchdog force-answers bot-owned decisions.
- Human prompts open only when idle, so a prompt never refers to an un-shown event.

## 3. Decision prompts that explain themselves

Every prompt names the actor, the target and the exact numbers, read from `pending.context` / `state.attack`.

| Kind | Example text |
|---|---|
| `boostAttack` | `Boost attack? Caine → Grenadier: 2d6+7 vs DEF 13 — 72% → 91% (1 focus, 4 left)` |
| `boostDamage` | `Boost damage? POW 12 vs ARM 15: 2d6−3, avg 4.0 → 3d6−3 avg 7.5; kill 8% → 41%` |
| `rollAnyway` | `Auto-hit (knocked down). Roll anyway for a critical? Crit chance 17%` |
| `reroll` | `Re-roll (Gunfighter)? Rolled 6 vs needed 9 — re-roll hits 72%` (needed read from state) |
| `powerField` | `Power Field: 9 damage incoming to Vilkul (7 boxes left). Spend 1 focus to take 4?` |
| `allocateFocus` | orb drag UI (§7) with per-engine hint `Razor: charge (1) + boost (1)` |
| `chargeTarget` | `Charge Black 13th? Needs 6.2" of 8" (SPD 5 + 3); first attack boosted damage` |
| `castSpell` | `Cast Arc Bolt (2) at Grenadier: 2d6+7 vs DEF 13 = 72%; POW 12 vs ARM 15 avg 2.4` |
| `triggerWindow` | `Tough: Gunslinger disabled. Roll d6 — 5+ heals 1 and knocks down` |
| `payUpkeep` / `shake` | one row per effect with its cost and remaining focus |

Prompts dock bottom-centre, never cover the dice tray, and support Enter (default option) / Esc (pass if allowed).

## 4. Ruler, LOS view, threat rings

| Tool | Key | Shows |
|---|---|---|
| Ruler | `M` | edge-to-edge distance from `query.distance`, drag from a model or any point; premeasuring always allowed |
| LOS view | `L` | from the selected model to hovered model: green/red line, blockers outlined, reason list from `query.los` (`blocked by Wall-2`, `cover +4`, `target in melee +4`, `stealth: >5" auto-miss`) |
| Threat rings | `T` | per selected/hovered model: advance (SPD), charge (SPD + 3 + reach), run (SPD + 5), ranged reach; from `query.threat` |
| CTRL ring | auto | caster CTRL range when a caster or its war-engine is selected |
| Melee range | auto | 1" / 2" ring on hover; engaged arcs red |

The same LOS overlay is the debug overlay (`?test=1` shows reasons on every check).

## 5. Interaction per decision

| Decision | Controller | Preview | Commit |
|---|---|---|---|
| `deploy` | drag ghosts into zone; units as a chain within 3" | zone highlight; red when invalid (`validate` at ≤30 Hz) | Confirm / Reset docked beside the zone, sized to content |
| `chooseActivation` | click a ready model/unit | activated models dimmed | `chooseActivation` |
| `chooseMovement` | button row: Advance, Run, Charge, Aim, Slam, Trample, Stand up, Forfeit + caster Cast/Feat/Heal | rings for each choice on hover | option |
| `moveModel` | drag; straight-line lock for charge/slam | path, stop point and reason from `query.moveCheck` | release + Enter |
| `placeTroopers` | auto-place button + per-trooper drag | 2" placement discs, LOS check lines | Confirm |
| `chooseAttack` | weapon chips + click target | per-target hit% badges from `query.attackPreview` | option |
| `allocateFocus` | §7 | | Confirm |

Camera input (right/middle drag, Alt, Space) never starts a model nudge or drag.

## 6. Grid card

- Opens on select/hover (right rail). Single-track models: a row of boxes. Grids: 6 columns drawn bottom-aligned
  (`20-data-schema` §10), system letters inside boxes, crippled systems highlighted with the system name and effect.
- Last damage flashes; during `damage.beforeApply` the incoming fill is previewed (column from the engine).
- Shows stats (resolved via `query.stat`, modified values in gold with a hover trace), weapons with location
  crippled state, abilities (our text), focus, active effects and upkeeps.
- `data-testid="card-grid-<modelId>"`, each box `card-box-<c>-<i>` with `data-filled`, `data-system`.

## 7. Focus orbs

- Control phase: caster's orbs float above it; drag an orb onto a war-engine inside CTRL (cap 3, invalid targets
  greyed). Shift-click = auto (AI knapsack suggestion). Orbs orbit war-engines (`30-figures` §5).
- Every spend animates an orb flying to its use (boost die, spell, Power Field shield).

## 8. Dice tray

- Right rail, under the dice log. Never behind a prompt.
- **Every roll type routes here**: all `DiceRolled.purpose` values (`00-architecture` §9). A unit test asserts every
  purpose has a renderer; unknown purposes render generically, never silently.
- Each roll shows dice, mods, total vs target (target from the event/state, never recomputed), result word
  (HIT / MISS / CRIT / 4 dmg), boost marker and re-roll history.
- Dice log keeps the full game; click a row to replay its beat.

## 9. Camera

Orbit with right drag, pan with middle drag or WASD, zoom with wheel; presets: top-down, player edge, follow active.
Transitions ≤600 ms, eased. No auto-camera during a human drag. Auto-focus on the active model only when it is off
screen.

## 10. Test hooks

| Hook | Contract |
|---|---|
| `?test=1` | exposes `window.__game = {state(), pending(), legal(), dispatch(action), presentedIdle(), seed, load(save), speed(n)}` |
| DOM proxies | invisible `<div data-testid="model-<id>" data-x data-z data-life data-focus>` per model, updated from the presented store |
| `data-testid` | `<area>-<element>[-<id>]`: `prompt-boost-yes`, `tray-roll-<rollId>`, `setup-faction-<factionId>`, `card-grid-<id>` |
| `?gallery` | figure gallery (`30-figures` §7) |
| `?spike=<name>` | perf overlay + named spike scene (`?spike=army` = 40 figures, `?spike=terrain`) |
| `?seed=` `?scenario=` `?lists=a,b` `?bot=easy` | fast setup for e2e |

E2E selects factions by exact text / testid, never substring.

## 11. Performance

- `<Canvas frameloop="demand">`; invalidate on presented-state change, tweens and camera input.
- `dpr={[1, 1.5]}` (Low: 1); shadows on demand, 1024 map (Low: off).
- Shared geometries and materials for figures, bases, rings, orbs; instancing for terrain props.
- Particles pooled; Low replaces them with icons.
- Settings: Graphics Low/High, animation speed, narration on/off; persisted in `localStorage` (`wm.settings`).
- Budgets per `00-architecture` §13; triangles dominate cost, not draw calls.

## 12. Start screen and setup

Title art scales by height and fits one screen on wide or short windows. Setup panel, 3 columns: faction + list for
both sides; bot tier and scenario; army painter and Settings popover. Theme: `--bg:#14161a; --fg:#e8e6e1;
--card:#1e2127; --accent:#c9a227; --accent2:#b87333`.
