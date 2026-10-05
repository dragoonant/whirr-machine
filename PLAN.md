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
See `docs/WARMACHINE-HANDOFF.md` Part H for the detail.

| Milestone | Scope |
|---|---|
| M0 | Specs, frozen contracts, rules checklist, skeleton on Pages |
| M1 | Geometry and LOS engine, plus the headless sim and `validate-data` |
| M2 | Rules core, with the Quick Start golden replay |
| M3 | Playable vertical slice on Pages: procedural figures, prompts with odds, ruler, LOS view, grid card, dice tray, random bot. Owner gates: SD look and the loadout approach |
| M4 | AI opponent (utility decider, assassination search, caster safety) |
| M5 | Art pass (Gemini, then Hunyuan GLBs, army painter, status visuals, title art) |
| M6 | Audio and music (weapon-flavour map, ~60 SFX, narrator, music, measure tool and trims) |
| M7 | Polish |
| M8 | Skirmish, 50 points, faction at a time with verify loops |
| M9+ | Command cards, warlocks and fury, Steamroller scenarios, clock, multiplayer |
