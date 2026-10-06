# Handoff

**Current state:** M3 to M8 are done (M4 AI, M5 figures, M6 audio, M7 polish, M8 battlefields). The playable vertical slice is on Pages (https://dragoonant.github.io/whirr-machine/):
pick Cygnar or Khador, a scenario (Ashwall Divide or the Quick Start demo) and an animation speed, read How to Play
(9 tabs), then play a whole game against the sensible random bot: roll-off, edges, deployment, Prey, focus
allocation, activations (advance, run, charge, aim), ranged and melee attacks with boosts, Powerful Attack, spells,
feats, triggered moves (Reposition, Avenging Force), scoring and the game-over screen. The bottom dock always says
what the game is waiting for, with the engine's numbers. `npm run e2e` plays Cygnar to round 3 through UI clicks.

**M4 AI (done):** easy/normal utility bot tiers in `src/ai/` (start screen default Normal), slam/trample and exact previews in the engine; normal beat random 20/20 (`npm run bench:ai -- --games 20 --seed 1`).

**Audio (M6):** owner should audition every clip at /whirr-machine/sounds.html and name the ids to redo.

**M5 figures + M7 polish (done):** eight Hunyuan SD figure GLBs replace the procedural figures (fallback kept), army
painter shader, status visuals and attack VFX; feed breakdowns, end-screen stats, settings popover, narration pauses,
title art. Review the figures at /whirr-machine/?gallery. `tests/e2e/art.spec.ts` plays Khador vs the Normal bot for two
rounds and writes `e2e-out/art-*.png` and `gallery.png`.

**M8 battlefields (done):** five themed boards with generated terrain, a random board per game (or pick one on the
start screen, or `?board=bog|ruins|village|wasteland|outpost`). See STATUS.md "Battlefields (M8)" and
`e2e-out/board-*.png`.

**Owner: veto terrain pieces.** Look at `art/terrain-sheets/<board>.png` (four views per piece) and at the boards in game;
name any slug to redo. Flagged in the integration pass as wrong in context (need a GPU redo, not run here):
`wt-wasteland-ritual-dais` (reads as a sawn log slice), `wt-wasteland-bone-spikes` (bright orange tray under the
spikes), `wt-ruins-grove` (unpainted pale trees). Also worth a decimation pass to about 6k triangles each (all
pieces are about 12k; headless frame time on the overview camera is well over the 21.5 ms budget).
The trench and the ash flats are procedural now (no GLB). Ground mats are rebuilt by
`art/board-textures/gen.py` (Hunyuan venv python: numpy, scipy, Pillow; bases in `%TEMP%/ph` from `fetch.py`).

**Next, in order:**
1. **Owner veto of the terrain pieces** (above), then the **owner playtest.** Play a few games on Pages (desktop browser) and list what is confusing, slow or wrong. Fix the
   top items before new features. For repeatable bug reports, add `?seed=<word>` to the URL before Start.
2. **Owner veto of the figure concept picks.** The candidates for each figure are in
   `C:/Users/antho/Hunyuan3D-2/outputs/wm-<slug>/concepts/` (`s0.png`..`s5.png` plus `sheet.png`). Name any figure
   to redo and which concept to use. Rebuild that GLB, drop it into `public/assets/models/<slug>.glb` (scaled in inches,
   black base) and re-run the art spec.
3. Then: an in-game army painter control (it is on the gallery page only today), and panels that cover less of the
   board at 1280 wide.

**Client map (`src/client/`):**
- `App.tsx` start <-> game routing; `GameScreen.tsx` mounts `board/Board.tsx` (Battlefield) and `ui/Hud.tsx`.
- `contract.ts` is the client's frozen surface (hooks, `game.*`, `query*` helpers, `bootClient`).
- `store/gameStore.ts` is the only caller of `engine.step`; `presentation/director.ts` turns events into beats;
  prompts open only when the presentation is idle.
- `ui/promptView.ts` (prompt text per decision kind), `ui/PromptForms.tsx` (board, focus, upkeep, shake forms),
  `ui/activationView.ts` + `ActivationPanel.tsx` (movement/combat/attack/spell buttons), `interaction/` (board clicks).
- Test hooks: `?test=1` exposes `window.__game`; `?scenario=&lists=&control=bot,bot&seed=` skips the start screen;
  `?gallery` shows the figure gallery.
- `figures/` (GLB loader, models map, painter, procedural fallback, gallery), `vfx/` (beat-driven effects, status FX).

**Engine requests from M3 (not done; the client works around them):**
- `query.attackPreview` should accept `attackType` (shot modes such as a blast shot) and infer `chargeAttack`.

**Contracts:** additive changes since the first freeze are listed in `docs/spec/00-architecture.md` §14 (none in M3).

**Rules sources:** `docs/sources/` (gitignored). Extract with `/mingw64/bin/pdftotext` into the scratchpad.
Agents read them there, because steamforged.com rate-limits bots.
