# Status

## What exists
- Scaffold: Vite 8, TS 7, React 19, R3F and drei, zustand, Vitest, Playwright, Pages deploy workflow.
- `src/client/App.tsx`: a 48"×48" board with a 6" grid and the title overlay.
- `tests/engine/smoke.test.ts` and `tests/e2e/home.spec.ts`.
- Stubs for `tools/sim.ts` and `tools/validate-data.ts`.
- Engine contracts, FROZEN (additive only, logged in `docs/spec/00-architecture.md` §14):

| File | Holds | State |
|---|---|---|
| `src/engine/types.ts` | GameState, ModelState, DamageState, EffectInstance, AttackContext, ActivationContext, PendingDecision, WindowId, RejectionCode, StepResult, SaveFile, Cloud (cloud/hazard/flare) | types |
| `src/engine/actions.ts` | `Action` union (34 types: every decision answer + pass/ack/endTurn/endAttacks) | types |
| `src/engine/events.ts` | `GameEvent` union (54 types: dice, movement, damage/boxes/crippled, focus, spells/feats, scoring) | types |
| `src/engine/hooks.ts` | hook points, data descriptor types (32 ops incl. advance/slam/makeAttack/ignore/modRoll), kind/op → hook-point maps, `afterResolveTier`, code-hook registry types | types + stubs |
| `src/engine/rng.ts` | sfc32 + cyrb128, `roll(state, spec)`, `deriveSeed` | implemented |
| `src/engine/decider.ts` | `Decider`, random and replay deciders | implemented |
| `src/engine/index.ts` | `createGame step legalActions validate replay save load view query.* describe.*` | stubs (throw) |

- Data schemas: `src/data/schema/*.schema.json` (11 files, kept identical to `docs/spec/schemas`).

## Spec status

| Spec | State |
|---|---|
| `00-architecture` | done; §5 any-time column and out-of-activation flow; §14 change log |
| `10-rules-core`, `11-scenarios`, `12-rules-test-checklist` | done; checked against the rulebook, QS and SR (2026-10-04). Open points are `(unsourced)`/`(app)` in `docs/needs-rules-check.md` |
| `20-data-schema` + `schemas/` | done |
| `30-figures`, `40-ai`, `50-client`, `60-testing` | done |
| `factions/cygnar.md`, `factions/khador.md` | QS-2025 values marked; ability → descriptor/hook map with test IDs. Open: app version, spell lists and stats, trooper box counts |

Scenario decision: S1 Ashwall Divide uses Quick Start rules (hold 2+ within 2", contest within 2", scoring
from round 1). GOLD-001 runs on `scn-qs-demo` with a pinned `qs-2025` bundle.

Next: M1 (geometry and LOS, headless sim, `validate-data`).
