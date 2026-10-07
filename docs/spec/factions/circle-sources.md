# Circle Orboros: card sources (audit 2026-10-07)

Tags used in `circle.md`. Nothing from these sources is copied into the repo: no data files, images or card text. The
numbers are facts we re-entered by hand, and all prose in our data and docs is our own wording.

| Tag | Source | What it gave | URL |
|---|---|---|---|
| S1 | Official Warmachine app data (`data_general.json`), split into files by a community repo; last data commit 2026-07-01 (after the 2026 mid-year update, since it includes Fane of Nyrro) | Full cards for all four models: stats, base-size advantages, damage (boxes, spiral aspect totals 8/8/12, three Ravager tracks of 8), point costs with "3 Grunts", FA, keywords, weapons, abilities, spells (COST/RNG/AOE/POW/DUR/OFF), feat | https://github.com/tate4490/Warmachine/tree/main/Data_Structure (`cards.json`, `models.json`, `weapons.json`, `model_abilities.json`, `model_advantages.json`, `weapon_abilities.json`, `weapon_qualities.json`, `spells.json`, `keywords.json`) |
| S2 | Community MK4 card data, commit "app data dump" 2026-07-10 | Same values as S1 for every field compared; spiral branch sizes 5/3/5/3/7/5 | https://github.com/isorna/wardice-warmachine-data/blob/main/mk4/profiles/circle-orboros.devourer-s-host.profiles.json (plus `mk4/abilities/abilities.json`, `mk4/spells/spells.json`) |
| S3 | Privateer Press, "WARMACHINE App Update January 10, 2024" | Tanith added to Devourer's Host; Veil of Mists replaced Bleed; Rites of the Wurm lets an animus drop to COST 0; Ravager Chieftain 3 pts | https://home.privateerpress.com/2024/01/10/warmachine-app-update-january-10-2024/ |
| S4 | Warmachine Academy wiki (MK4 community wiki; Ravagers page last edited 2026-04-13) | Base-size tags, unit size 3, 8 boxes, points; Circle has no Prime army, Devourer's Host is a legacy army; six values differ from S1/S2 (see "Conflicts" in `circle.md`) | https://warmachineacademy.miraheze.org/wiki/Tanith_the_Feral_Song , https://warmachineacademy.miraheze.org/wiki/Pureblood_Warpwolf , https://warmachineacademy.miraheze.org/wiki/Lord_of_the_Feast , https://warmachineacademy.miraheze.org/wiki/Tharn_Ravagers , https://warmachineacademy.miraheze.org/wiki/Devourer%27s_Host , https://warmachineacademy.miraheze.org/wiki/Circle_Orboros |
| S5 | Brückenkopf summary of the 2026 mid-year update (released in the app 2026-06-04) | No change to any Circle model | https://www.brueckenkopf-online.com/2026/warmachine-mid-year-update/ |
| S6 | MK4 rulebook (local, gitignored: `docs/sources/WMH-MK4-Rulebook_Digital_144-OP_Abridged.pdf`) | Base sizes p71, life spirals p96, corpse tokens p97, clouds p98 (3"), threshold p107, animi p109 | local file |
| S7 | Store and box listings | The 2017 Circle Orboros Battlegroup box (PIP 72056) and the Devourer's Host theme box (PIP 72109) contents; no MK4 Circle starter | https://abyssgamestore.ca/products/circle-orboros-battlegroup-mkii-pip72056-r , https://abyssgamestore.ca/products/circle-orboros-devourers-host-theme-force-pip72109 |

## How the values were checked

- Every value in `circle.md` was compared field by field between S1 and S2; they agree on all of them.
- The spiral aspect layout: for all 63 Circle spiral cards present in both S1 and S2, branch pairs 1+2, 3+4 and 5+6 equal
  the three aspect totals in S1, with no mismatch. The Mind/Body/Spirit order of those totals is our reading (RULING).
- Recency: S1 and S2 are both newer than the 2026 mid-year update, and S5 lists no Circle change in it.

## Still unverified (U-cd)

None. Values that are our reading rather than a printed number are RULINGs in `circle.md`: the spiral aspect order,
weapon locations (the card has none), the 3" Rift area and Veil of Mists cloud (the cards print AOE "-").

## Tried, nothing usable

- Steamforged mid-year 2026 post (steamforged.com / warmachine.gg): HTTP 429 and 404 during the audit.
- Bell of Lost Souls GameWire copies of the PP app updates: blocked (HTTP 403).
- Frontline Gaming mid-year articles: no per-model changes listed.
- Steamforged store and the PP store: no MK4 Circle product.
- Other GitHub data repos (`kirkbushell/warmachine-data`: Cryx and Cygnar only).
