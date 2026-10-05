# Handoff

**Current state:** M0 is done. Specs, frozen contracts, the rules checklist and the review fixes are on
`main`. Every former `(verify)` was checked against the official PDFs in `docs/sources/` (MK4 rulebook,
Quick Start Jul 2025, Steamroller 2026); what the sources don't settle is tagged `(unsourced)` or `(app)`
and logged in `docs/needs-rules-check.md`.

**Next: M1, geometry + LOS + headless sim + `validate-data`.** Read `10-rules-core` R0, R2 (base table),
R5.0–R5.23, R6, R10, and `12` LOS/TERR/MOVE. LOS essentials that changed in the review:
- Intervening models are a **2D** test: the line passes over a base ≥ the target's (R6.4). Volumes
  (1.75/2.25/2.75/3.25/5") are for terrain only (R6.3).
- Clouds block lines over their 2D footprint unless the viewer or target is in them; never vs 120 mm (R6.5).
- Forests: ≤3" when an end is inside; outside→outside blocks beyond; never vs 120 mm (R10).
- Cover/concealment need the target within 1" of the feature along a line; forest/rubble only when
  completely inside (R6.11).
- Knocked down / stationary: base DEF set to 5, bonuses still add (R6.11).

**Contracts:** additive changes since the first freeze are listed in `docs/spec/00-architecture.md` §14.

**Rules sources:** `docs/sources/` (gitignored). Extract with `/mingw64/bin/pdftotext` into the scratchpad.
Agents read them there, because steamforged.com rate-limits bots.
