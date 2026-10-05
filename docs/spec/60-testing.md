# 60: Testing

Lean by default: ~10 focused tests per stage, plus the invariants below, which always run.

## 1. Layout and naming

| Path | Runner | Content |
|---|---|---|
| `tests/engine/*.test.ts` | vitest | rules by checklist ID |
| `tests/data/*.test.ts` | vitest | schema + `validate-data` cross-checks |
| `tests/ai/*.test.ts` | vitest | dice math vs brute force, knapsack, safety constraint |
| `tests/client/*.test.ts` | vitest (node) | director ordering, dice-tray purpose coverage, prompt text |
| `tests/e2e/*.spec.ts` | Playwright | the deployed build on `/whirr-machine/` |
| `tests/fixtures/` | | seeds, saves, golden replays |

- **Checklist-ID naming.** Every rules test title starts with its ID from `12-rules-test-checklist`:
  `it('ATK-03 all ones always miss', …)`. Prefixes: `DICE- LOS- MOVE- CHG- ATK- DMG- GRID- PWR- AOE- SPR- FOC- SPL-
  COND- TERR- SCN-`.
- `tools/checklist-coverage.ts` greps test titles and prints covered / uncovered IDs; M2 done = no uncovered ID marked
  `must`.
- Tests build states through `createGame` + actions or `tests/fixtures/build.ts` helpers, never hand-written state.

## 2. Engine invariants (in every sim game and a vitest fuzz)

| Invariant | Check |
|---|---|
| one decision | every `StepResult.pending` is defined; kind `gameOver` iff phase `ended` |
| non-empty legal | `legalActions(state).length > 0` for every open decision, and every member passes `validate` |
| reject, never throw | random malformed actions give `rejection` with a known code and the same state ref |
| determinism | `replay(setup, seed, log)` reproduces the final state hash |
| save/load | save → load mid-game → same hash and pending |
| focus caps | war-engine ≤ 3; Cortex-crippled engine has 0 |
| life states | `disabled → boxed → destroyed` only in order; no removed model has state |
| numbers from state | the reroll window's target equals the roll that opened it (Mallet bug) |
| no MK3 | no facing fields, no free-strike events, run = SPD + 5, melee default 1" |

## 3. Headless sim (`npm run sim`)

`tsx tools/sim.ts --games 200 --tiers random:random --seed s` (from M1).
- Per-game decision cap 5 000 → fail with the seed.
- Stall detector: 200 consecutive decisions without a change in (round, turn, activations done, total damage, VP)
  → fail with the seed and the last 20 actions.
- 60 s wall cap per game.
- Output: JSON summary (games, finished, winners by type, p95 step ms, invariant failures with seeds).
- A failing seed becomes a fixture test.

## 4. Golden replay

M2: the Quick Start worked first turn as `tests/fixtures/qs-turn1.json` (setup, seed-independent forced dice via a test
RNG override, action log, expected events and end state). Dice come from the QS PDF's printed rolls (now in
`docs/sources/`); it runs on `scn-qs-demo` with the pinned `qs-2025` bundle and authored positions (12 GOLD-001).

## 5. Playwright

- `playwright.config.ts` serves the production build at `http://localhost:4173/whirr-machine/` (Pages sub-path);
  every `page.goto` uses relative URLs (`./?test=1&seed=…`). Asset URLs must use `import.meta.env.BASE_URL`.
- Drive the game through `window.__game` and `data-testid`; assert via DOM proxies (`model-<id>` `data-x`/`data-z`).
- Faction picks match exact text or `setup-faction-<id>`.
- Screenshots for owner check-ins go to `tests/e2e/__shots__/` (not baselines; review only).
- Core specs: `home` (title loads), `play-slice` (bot vs bot to game over at speed 0), `human-turn` (activate,
  charge, boost prompt shows odds, dice tray shows the roll), `gallery`, `save-load`.

## 6. Definition of done per milestone

| Milestone | Done when |
|---|---|
| M0 | specs 00–60 + schemas written and reviewed once; frozen contract files compile; `validate-data` runs; skeleton on Pages; checklist IDs exist |
| M1 | collision/LOS tests for `LOS-` `MOVE-` `TERR-` IDs; LOS debug overlay; `npm run sim` + `validate-data` green; sim invariants live |
| M2 | all `must` checklist IDs covered; golden replay passes (or skipped with reason); 200-game random sim: 0 invariant failures, 0 stalls |
| M3 | Pages build playable end to end vs random bot; prompts with odds, ruler, LOS view, threat rings, grid card, focus orbs, dice tray all exercised by e2e; owner gates (SD look, loadouts) answered |
| M4 | bench targets in `40-ai` §9 met; caster-safety and assassination unit tests; AI p95 ≤500 ms in worker |
| M5 | all 8 profiles have GLBs enabled with files present; painter and status visuals in gallery screenshots |
| M6 | every `DiceRolled.purpose` and weapon flavour has a sound; `sounds.html` audition; no unheard files |
| M7 | event feed breakdowns, end screen, Low mode, narration pauses; perf budgets met on `?spike=army` |
| M8 | per faction: verify loop on rules, data validates, e2e spec + screenshots |

Every stage: `npm run typecheck && npm test && npm run validate:data` green, commit, push, Pages deploy green.
