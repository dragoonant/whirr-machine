# Status

## What exists
- Scaffold: Vite 8, TS 7, React 19, R3F and drei, zustand, Vitest, Playwright, Pages deploy workflow.
- `src/client/App.tsx`: a 48"×48" board with a 6" grid and the title overlay (no game wiring yet).
- Engine contracts, FROZEN (additive only, logged in `docs/spec/00-architecture.md` §14):

| File | Holds | State |
|---|---|---|
| `src/engine/types.ts` | GameState, ModelState, DamageState, EffectInstance, AttackContext, ActivationContext, PendingDecision, WindowId, RejectionCode, StepResult, SaveFile, Cloud | types |
| `src/engine/actions.ts` | `Action` union (34 types) | types |
| `src/engine/events.ts` | `GameEvent` union (54 types) | types |
| `src/engine/hooks.ts` | hook points, data descriptor types, code-hook registry types | types + stubs |
| `src/engine/rng.ts` | sfc32 + cyrb128, `roll(state, spec)`, `deriveSeed` | implemented |
| `src/engine/decider.ts` | `Decider`, random and replay deciders | implemented |
| `src/engine/index.ts` | `createGame step legalActions validate replay save load view registerBundle query.* describe.*` | **implemented (M2)** |

- Rules modules (M1+M2): `geometry los measure terrain dice attack damage` (M1); `setup turnflow pending focus effects scenario
  movement power-attacks spells code-hooks factions/{cygnar,khador} phases/{maintenance,control,activation,avenging}` (M2).
  Whole games run: setup, roll-off, deployment, Prey, Maintenance (incl. Avenging Force), Control, activations with unit
  placement, charges, attacks, spells, feats, scoring, assassination, round limit and tiebreaks.
- `legalActions` returns only answers that pass full validation, and is never empty for an open decision.
- `query.*`: distance, LOS verdict with cover/concealment/stealth flags, attack preview (hit target, dice, pHit/boosted,
  crit, ARM, expected damage, pKill), threat ranges, scenario control, stat trace, move check, power-attack POW.
- `src/ai/random.ts`: `createSensibleRandomDecider(seed)` / `pickSensible`: random over legal actions, weighted toward
  charging, attacking and moving toward enemies/objectives (leaders hang back). Seeded by (seed, decision id).
- `tools/sim.ts` (`npm run sim -- --games N --seed S [--scenario id] [--json]`): bot vs bot on the starter lists; checks
  60 §2 invariants after every step, a 5000-decision cap, a 200-decision stall detector, save/load mid-game and replay
  determinism. `npm run sim -- --games 50 --seed 1`: 50/50 games end, 0 violations, mean 4.4 rounds.
- Tests: 127 in 16 files, including `tests/engine/golden.test.ts` (GOLD-001: the QS worked turns replayed through
  `step` with forced dice, 18 steps, all passing) and `tests/engine/index.test.ts` (API, invariants, a short sim).
- Starter data in `src/data/`; `npm run validate:data` checks the code-hook registry directly.

## Spec status

| Spec | State |
|---|---|
| `00-architecture` | done; §14 logs `registerBundle` and the M2 flow additions |
| `10-rules-core`, `11-scenarios`, `12-rules-test-checklist` | done; open points in `docs/needs-rules-check.md` |
| `20-data-schema` + `schemas/` | done |
| `30-figures`, `40-ai`, `50-client`, `60-testing` | done |
| `13-golden-first-turn` | done; GOLD-001 passes with 3 recorded deviations (R8.6 one upkeep per model, Take Down, see RULINGs) |
| `factions/cygnar.md`, `factions/khador.md` | QS-2025 values marked; open: app version, spell stats, trooper box counts |

## Known gaps (engine)
- Slam and trample movement options are not offered (`chooseMovement` filters them); headbutt/throw work as power attacks.
- `reroll`, `rollAnyway`, `chooseGrid`, `combinedAttack`, `channel` decisions are not raised by the starter content.
- Out-of-activation attacks other than Avenging Force (Reciprocate etc.) are not needed by the starter lists.
- Additional attacks while initial attacks remain are accepted but not listed as options.

Next: M3 playable client (see HANDOFF.md).
