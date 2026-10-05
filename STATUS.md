# Status

## What exists
- Scaffold: Vite 8, TS 7, React 19, R3F and drei, zustand, Vitest, Playwright, Pages deploy workflow.
- `src/client/App.tsx`: a 48"×48" board with a 6" grid and the title overlay.
- `tests/engine/smoke.test.ts` and `tests/e2e/home.spec.ts`.
- Stubs for `tools/sim.ts` and `tools/validate-data.ts`.
- Engine contracts, FROZEN (additive only, log in `docs/spec/00-architecture.md`):

| File | Holds | State |
|---|---|---|
| `src/engine/types.ts` | GameState, ModelState, DamageState, EffectInstance, AttackContext, ActivationContext, PendingDecision, WindowId, RejectionCode, StepResult, SaveFile | types |
| `src/engine/actions.ts` | `Action` union (34 types: every decision answer + pass/ack/endTurn/endAttacks) | types |
| `src/engine/events.ts` | `GameEvent` union (54 types: dice, movement, damage/boxes/crippled, focus, spells/feats, scoring) | types |
| `src/engine/hooks.ts` | hook points, data descriptor types, kind/op → hook-point maps, code-hook registry types | types + stubs |
| `src/engine/rng.ts` | sfc32 + cyrb128, `roll(state, spec)`, `deriveSeed` | implemented |
| `src/engine/decider.ts` | `Decider`, random and replay deciders | implemented |
| `src/engine/index.ts` | `createGame step legalActions validate replay save load view query.* describe.*` | stubs (throw) |

- Data schemas: `src/data/schema/*.schema.json` (11 files, copied from `docs/spec/schemas`).

## Spec status

| Spec | State |
|---|---|
| `00-architecture` | done, M0 code-form note in §3 |
| `10-rules-core`, `11-scenarios`, `12-rules-test-checklist` | done; `(verify)` points in `docs/needs-rules-check.md` |
| `20-data-schema` + `schemas/` | done |
| `30-figures`, `40-ai`, `50-client`, `60-testing`, `factions/` | done |

Next: M1 (geometry and LOS, headless sim, `validate-data`).
