# Handoff

## Morning summary (owner)
- M10 to M13 shipped overnight. 1167 unit tests pass.
- Stats for Trollbloods, Circle, Cryx and Menoth are now sourced. Tanith uses the real sculpt.
- The Paint button is in the top bar. Side rails collapse with `[` and `]`. You can drag models to move them.
- Skirmish (50 points): pick Game size on the start screen, or open `/whirr-machine/?size=skirmish`.
- Steamroller 2026: pick a scenario on the start screen (all 7, or Random). Command cards are in the Cards tray.
- Deathclock is off by default. Turn it on from the start screen.
- Add `&seed=test` to any URL for a repeatable game.
- Screenshots are in `e2e-out/`: `m11-*`, `skirmish-*`, `sr-*`.
- Not built yet: Defenses, three command cards, Payload stepper, four small models. See STATUS.md Known gaps.

## Owner questions
1. Trollbloods: our Gunnbjorn starter has no MK4 box. The only current trollkin starter is the Southern Kriels Kithguard Command Starter (Craghorn, Felleye, Klangor, Scrappers, Pvt. Rattles). Switch?
2. The Circle Skirmish list is 47 points. Add Gallows Grove x2 to reach 49?
3. Dozer and Smigg uses the classic PP sculpt. SFG has a new 2026 Kithguard sculpt. Keep classic?
4. Krielstone Bearer and Stone Scribes: the profiles say 40mm bases, but the sculpts suggest 50mm and 30mm. Which?
5. Values with one source, or sources that disagree. Please check them in the app: Assailer and Storm Vane boxes, Courser blade POW (10 vs 12), Caine's Recon spell list after the June 2026 changelog, Night Terrors FA (2 vs 3), Arkanist AAT (4 vs 5), Crusader grid layout. The spiral aspect order (Mind, Body, Spirit) is a RULING for all warbeasts.
6. Gemini history has two stray abandoned chats from the concept agents (a suggestion-chip image chat and a growth-coach prompt). Delete them if you like.

## Next
- Fix what the owner finds in the questions above.
- Build the not-built items (STATUS.md Known gaps), then the deferred playtest fixes.
- Multiplayer stays on hold.

**Current state:** M3 to M13 are done (M12 and M13 have gaps, see STATUS.md). The game is on Pages (https://dragoonant.github.io/whirr-machine/): pick one of
**six factions** (Cygnar, Khador, Trollbloods, Circle Orboros, Cryx, Protectorate of Menoth), an opponent army (any
of the six or Random), the bot strength, a scenario, a battlefield and an animation speed, then play a whole game
against the bot: roll-off, deployment, focus or fury, activations, attacks, spells, feats, scoring and game over.

**M9 factions (done):** Trollbloods and Circle are led by warlocks: fury, leeching, forcing warbeasts, frenzy,
damage transfer, life spirals (spec `docs/spec/81-warlocks-fury.md`). Cryx and Menoth are warcaster armies with
soul and corpse tokens, Fire and their own feats. Sides take faction colours. The warlock UI (flame pips, battlegroup
strip, spiral card, leech/transfer/shed forms, frenzy flash) is in `src/client/ui/fury/`; the bot plays fury
(`src/ai/fury.ts`). The 21 new figures are Hunyuan GLBs (listed in
`public/assets/models/manifest.json`, contact sheets `art/figure-sheets/m9-*.png`; the procedural fallback still works). See STATUS.md "Factions (M9)" and `e2e-out/m9-*.png`.

**M9 stats:** were all U-cd when made. M10 sourced them (see `docs/spec/factions/*-sources.md`); only the Crusader grid layout is still U-cd. The M9
RULINGs are in `docs/needs-rules-check.md` ("M9 factions" section).

**M4 AI (done):** easy/normal utility bot tiers in `src/ai/` (start screen default Normal), slam/trample and exact previews in the engine; normal beat random 20/20 (`npm run bench:ai -- --games 20 --seed 1`).

**Audio (M6):** owner should audition every clip at /whirr-machine/sounds.html and name the ids to redo.

**M5 figures + M7 polish (done):** Hunyuan MGSD figure GLBs (33 in `public/assets/models/`, one per model and per
trooper; fallback kept) replace the procedural figures, plus army painter shader, status visuals and attack VFX; feed
breakdowns, end-screen stats, settings popover, narration pauses, title art. Review the figures at
/whirr-machine/?gallery. `tests/e2e/art.spec.ts` plays Khador vs the Normal bot for two rounds and writes
`e2e-out/art-*.png` and `gallery.png`.

**M8 battlefields (done):** five themed boards with generated terrain, a random board per game (or pick one on the
start screen, or `?board=bog|ruins|village|wasteland|outpost`). See STATUS.md "Battlefields (M8)" and
`e2e-out/board-*.png`.

**Terrain (accepted 2026-10-07):** the owner accepted the terrain; playtests found some issues (deferred). Commit 8ee9ef5 redid
`wt-wasteland-ritual-dais`, `wt-wasteland-bone-spikes` and `wt-ruins-grove` and decimated all pieces to about 6k
triangles. Contact sheets are in `art/terrain-sheets/<board>.png`.
The trench and the ash flats are procedural now (no GLB). Ground mats are rebuilt by
`art/board-textures/gen.py` (Hunyuan venv python: numpy, scipy, Pillow; bases in `%TEMP%/ph` from `fetch.py`).

**Older note:** The owner accepted terrain, figures and audio on 2026-10-07; owner playtest fixes are deferred and multiplayer
is on hold. For repeatable bug reports, add `?seed=<word>` to the URL before Start.

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

**Contracts:** additive changes since the first freeze are listed in `docs/spec/00-architecture.md` §14 (none in M3).

**Rules sources:** `docs/sources/` (gitignored). Extract with `/mingw64/bin/pdftotext` into the scratchpad.
Agents read them there, because steamforged.com rate-limits bots.
