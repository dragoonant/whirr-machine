# Handoff

**Current state:** M3 is done. The playable vertical slice is on Pages (https://dragoonant.github.io/whirr-machine/):
pick Cygnar or Khador, a scenario (Ashwall Divide or the Quick Start demo) and an animation speed, read How to Play
(9 tabs), then play a whole game against the sensible random bot: roll-off, edges, deployment, Prey, focus
allocation, activations (advance, run, charge, aim), ranged and melee attacks with boosts, Powerful Attack, spells,
feats, triggered moves (Reposition, Avenging Force), scoring and the game-over screen. The bottom dock always says
what the game is waiting for, with the engine's numbers. `npm run e2e` plays Cygnar to round 3 through UI clicks.

**Next, in order:**
1. **Owner playtest feedback.** Play a few games on Pages (desktop browser) and list what is confusing, slow or wrong.
   Fix the top items before new features. Repeatable bug reports: add `?seed=<word>` to the URL before Start.
2. **M4 AI.** Read `40-ai` (all) and `50-client` §2. Add stronger bot tiers behind `chooseBotAction` in
   `src/client/bot/botDriver.ts` (the start screen's Opponent select lists `BOT_TIERS` in `ui/start/startOptions.ts`);
   benchmark with `npm run bench:ai` and `npm run sim`.

**Client map (`src/client/`):**
- `App.tsx` start <-> game routing; `GameScreen.tsx` mounts `board/Board.tsx` (Battlefield) and `ui/Hud.tsx`.
- `contract.ts` is the client's frozen surface (hooks, `game.*`, `query*` helpers, `bootClient`).
- `store/gameStore.ts` is the only caller of `engine.step`; `presentation/director.ts` turns events into beats;
  prompts open only when the presentation is idle.
- `ui/promptView.ts` (prompt text per decision kind), `ui/PromptForms.tsx` (board, focus, upkeep, shake forms),
  `ui/activationView.ts` + `ActivationPanel.tsx` (movement/combat/attack/spell buttons), `interaction/` (board clicks).
- Test hooks: `?test=1` exposes `window.__game`; `?scenario=&lists=&control=bot,bot&seed=` skips the start screen.

**Engine requests from M3 (not done; the client works around them):**
- `query.attackPreview` should accept `attackType` (shot modes such as a blast shot) and infer `chargeAttack`.

**Contracts:** additive changes since the first freeze are listed in `docs/spec/00-architecture.md` §14 (none in M3).

**Rules sources:** `docs/sources/` (gitignored). Extract with `/mingw64/bin/pdftotext` into the scratchpad.
Agents read them there, because steamforged.com rate-limits bots.
