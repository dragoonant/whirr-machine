# Whirr Machine: agent orientation

Read these in order, and nothing else up front:
1. `HANDOFF.md`: current state and next steps.
2. `STATUS.md`: what exists.
3. `PLAN.md`: scope, decisions and milestones.
4. `docs/spec/`: read only the sections a task names.

The original brief is `docs/WARMACHINE-HANDOFF.md`. Read a part of it only when a task cites it.

## Owner priority: playable first
- Something the owner can open on Pages and play beats test coverage. Every stage ends in something
  visible: a Pages deploy or screenshots.
- Lean mode is the default (`args.lean: true`): implement and commit with about 10 focused tests and
  no adversarial verify loop. Turn verify loops on only for rules-dense content (each new faction)
  or when the owner asks.
- Check-ins are ≤10 lines with a screenshot per milestone. Rules ambiguities never block work: add a
  `RULING:` line (rule, what we did, why) to `docs/needs-rules-check.md`.

## Token rules (metered plan: mandatory)
- The main loop never reads whole source files or hand-writes bulk code. It writes Workflow scripts
  (`tools/workflows/`), reads structured JSON results, and checks in with the owner.
- Models:
  - Implementation and data entry run on Sonnet (`model: 'sonnet'`).
  - Spec writing and adversarial verification run on the session model at `effort: 'high'`.
  - Agents return schema-validated JSON, ≤300 tokens.
- Stages:
  - One workflow stage at a time, ≤8 agents per stage.
  - Commit and push after every stage.
  - Resume (`resumeFromRunId`) works in the same session only.
- Prompts point at specs on disk ("read spec section X, build Y"); they never paste specs in.
- Freeze interfaces before fan-out.
- Cap research at 3–6 WebFetches per agent and name the exact spec sections. Probe a new setup with
  one cheap agent before fanning out.

## Workflow script pattern
- Every prompt starts with a `COMMON` preamble containing:
  - the absolute project root ("use absolute paths, the cwd resets");
  - "orient from STATUS.md only";
  - the IP rule;
  - the frozen-contract rule;
  - "run long commands in the FOREGROUND".
- Schemas:
  - `RESULT = {ok, summary, files[], issues[]}`
  - `VERDICT = {verdict, coverage, failing[], notes}`
  - `FINDINGS = {ok, findings:[{owner, where, problem, fix}]}`
- Every prompt says "You own ONLY: ...", and concurrent agents own disjoint files. Verify agents
  never edit. Route each finding to the agent that owns the file.
- Shared working tree:
  - Concurrent agents never run `npm install` or `git commit`, and never edit `package.json` or
    `STATUS.md`, unless told to.
  - Parallel factions run in git worktrees, and each agent calls `EnterWorktree` first.
  - Stage files by exact path.
- After an interrupted run: `git status`, then
  `npm run typecheck && npm test && npm run validate:data`, then commit by hand, or park the work on
  `wip/<stage>`.
- Workflow scripts stay LF (see `.gitattributes`). `scriptPath` must be inside this repo.

## Conventions
- 1 world unit = 1 inch, y up, board centred at the origin. Build for 48"×48" and test at 36"×36".
- All measurement is base edge to base edge. Premeasuring is always allowed.
- Engine contracts are frozen after M0: `src/engine/{types,actions,events,hooks,rng,decider,index}.ts`.
  Any change needs a matching edit to `docs/spec/00-architecture.md` and a note in the agent's
  `issues`.
- Name engine tests by checklist ID from `docs/spec/12-rules-test-checklist.md`
  (e.g. `it('ATK-012 ...')`).
- The engine owns every number the UI shows. `legalActions` is never empty for an open decision.
- Commit messages: `M<n>: <what>`, a blank line, then the Co-Authored-By line for the current model.
  Pushing to `main` after each stage is pre-approved. Pages deploys from `main`.
- Guard against MK3 leaking in (no facing, free strikes, STR or templates; melee range 1"; run is
  SPD+5"). The table is in `docs/WARMACHINE-HANDOFF.md` Part E.11. Put it in every rules prompt.

## IP rule (owner decision 2026-10-04: Mallet posture)
- Mechanics are ported 1:1 from Warmachine MK4.
- Unit, weapon and ability names may match the real ones.
- ALL prose is in our own words: ability text, lore, UI copy and docs. Never copy Steamforged card or
  rules text.
- Never use SFG art, logos, icons or trade dress in the repo. Figures are MGSD versions of the real sculpts (owner decision
  2026-10-05). Reference photos stay outside the repo.
- The UI and README state this is an unofficial fan project, not affiliated with Steamforged Games.
- Never commit rules PDFs, community data files or secrets. `docs/sources/` and `*.token*` are
  gitignored.
- The ElevenLabs key is passed only through the `ELEVENLABS_API_KEY` env var.
