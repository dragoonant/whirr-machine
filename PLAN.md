# Whirr Machine: plan

## Decisions

Settled 2026-10-04:
- **Title and repo:** Whirr Machine, `dragoonant/whirr-machine`, deployed to
  https://dragoonant.github.io/whirr-machine/.
- **IP posture:** Mallet posture. Real unit, weapon and ability names are allowed; all prose is ours;
  no SFG art or icons; markings are original.
- **Figures (2026-10-05, replaces "original SD designs"):** MGSD versions of the real starter sculpts, one GLB per model including
  each trooper. Concepts are made in Gemini from the official product photos, which are kept outside the repo and never committed.
- **Music:** ElevenLabs Music. Check the credit cost on the first track, and confirm with the owner
  before spending more than ~5k credits.

Settled 2026-10-07:
- Terrain, figures and audio are accepted as they are.
- Tanith must be the real sculpt. Search the web for reference pictures instead of assuming.
- Research the M9 faction stats on the web (rulebooks, stat sites) when the official app does not show them.
  Do not treat the app as the only source.
- Multiplayer is on hold.

Carried over from Mallet:
- Mechanics are ported 1:1.
- Player vs AI comes first; multiplayer comes later.
- The repo is public.

## First release
- Recon, 30 points, on a 36"×36" table.
- Armies from the official two-player starter:
  - Cygnar: Caine, Deuce, Falk, Black 13th.
  - Khador: Vilkul, Razor, Lazarenko, Hounds.
- Both armies are focus-only.
- Content: one Quick Start-style scenario.
- The full brief is `docs/WARMACHINE-HANDOFF.md` Parts E and G.

## Milestones
See `docs/WARMACHINE-HANDOFF.md` Part H for the original detail.

| Milestone | Scope |
|---|---|
| M0 | Specs, frozen contracts, rules checklist, skeleton on Pages |
| M1 | Geometry and LOS engine, plus the headless sim and `validate-data` |
| M2 | Rules core, with the Quick Start golden replay |
| M3 | Playable vertical slice on Pages: procedural figures, prompts with odds, ruler, LOS view, grid card, dice tray, random bot |
| M4 | AI opponent (utility decider, assassination search, caster safety), slam and trample, exact previews |
| M5 | Art pass: MGSD figures (one per model and trooper), army painter, status visuals, VFX, title art |
| M6 | Audio and music (weapon-flavour map, SFX, narrator, music, measure tool and trims) |
| M7 | Polish |
| M8 | Five themed battlefields with generated terrain, decimated to about 6k triangles |
| M9 | Warlocks and fury; Trollbloods, Circle, Cryx and Menoth; army picker, figures, faction audio; late polish (deployment clamp, hover tips, Feats tab, Prey prompt, ambient animation, `?fps`) |
| M10 | Done. Sourced stats for the four M9 factions (per-faction source docs); Tanith redone from the real sculpt. Crusader grid layout still unverified |
| M11 | Done. In-game painter, slimmer collapsible panels, drag and multi-waypoint movement; reroll, rollAnyway, chooseGrid, combinedAttack, channel, out-of-activation and additional attacks; faction abilities match the sourced cards |
| M12 | Done, with gaps. Skirmish 50pt: six lists, 19 new models, Copperline Crossing 48in. Not built: Spell Slave, Hunting Dog, Shield Guard Dire Wolf, Stone Scribe Elder. Weakest figures: dozer-smigg, night-terror, dire-wolf cannon |
| M13 | Partly done. Command cards, 7 Steamroller 2026 scenarios plus Random, deathclock, AI plays them. Not built: Defenses (WP8), Heavy and Light Airdrop and Military Engineering cards, Payload stepper, moved-objective tween |
| Later | Multiplayer (on hold by the owner, 2026-10-07); owner playtest fixes (deferred); the not-built items above; Sniper before the roll, Bulldoze mid-move, spell racking; new sounds for the M12 models |
