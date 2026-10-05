# Handoff

**Current state:** M2 is done. The rules engine is integrated behind `src/engine/index.ts`: whole Quick Start games run
headless (`npm run sim -- --games 50 --seed 1`: every game ends, zero invariant violations), the Quick Start worked
turns replay exactly through `step` (GOLD-001), and a sensible random bot (`src/ai/random.ts`) can play either side.

**Next: M3, the playable client on Pages.** Read `50-client` (all), `30-figures` §1–3 and `40-ai` §8. Build:
- `GameRunner` store (`src/client/store/`): the only caller of `step`; the bot answers via `pickSensible` when
  presentation is idle; 5 s watchdog answers bot decisions with `legal[0]`.
- One prompt per `PendingDecision.kind`, text from `pending.context`, `state.attack` and `query.*` (never client math).
  Continuous answers: `moveModel` (drag with `query.moveCheck`; charges are straight-line with `constraints.toward`),
  `placeTroopers` (within 2" of the moved trooper, LOS), `deploy`/`advanceDeploy` (zone in `context.data.zone`).
  The engine always offers a valid default option (`auto`, `full`, sampled moves) for each of these.
- Ruler, LOS view, threat rings from `query.distance/los/threat`; scenario control from `query.control`.
- Grid card, focus orbs, dice tray (every `DiceRolled`), save/load via `save`/`load` in `localStorage`.
- Start screen: Quick Start demo (`scn-qs-demo`) vs the bot; Ashwall Divide (`scn-ashwall-divide`) with roll-off.

**Engine notes for the client:**
- `createGame(setup, seed, loadBundle())` registers the bundle; `step(state, action)` finds it by `state.dataVersion`.
- Model ids: `A:L` / `B:L` leaders, `A:e<n>` list entries, `A:u<n>.<k>` troopers of unit `A:u<n>`.
- Maintenance can raise decisions (Avenging Force: `context.data.code === 'avengingForce'`); Prey is an
  `abilityChoice` after deployment (`context.data.code === 'prey'`).
- Known gaps are listed in `STATUS.md`; rules deviations from the QS are RULINGs in `docs/needs-rules-check.md`.

**Contracts:** additive changes since the first freeze are listed in `docs/spec/00-architecture.md` §14.

**Rules sources:** `docs/sources/` (gitignored). Extract with `/mingw64/bin/pdftotext` into the scratchpad.
Agents read them there, because steamforged.com rate-limits bots.
