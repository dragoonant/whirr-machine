# Trollbloods card sources (audit 2026-10-07)

Sources behind the tags in `trollbloods.md`. Values were read for checking only: no community data file,
card text, art or photo is copied into the repo, and every rules summary in our data is in our own words.

## Used

| Tag | Source | What it gave | URL |
|---|---|---|---|
| S1 | `isorna/wardice-warmachine-data`, commit "app data dump" (2026-07-10, repo last pushed 2026-09-15): `mk4/profiles/trollbloods.united-kriels.profiles.json`, `mk4/spells/spells.json`, `mk4/abilities/abilities.json`, `mk4/advantages/advantages.json`, `mk4/factions.json`, `mk4/profiles/southern-kriels.kithguard.profiles.json` | Every stat, weapon, advantage, ability, spell (COST/RNG/AOE/DUR), feat, points, FA and keywords of all four entries; Bomber spiral branch sizes; Trollbloods armies (Legacy, Storm of the North, United Kriels); Kithguard starter points | https://github.com/isorna/wardice-warmachine-data |
| S2 | Warmachine Academy wiki (MK4 community wiki), card pages, revisions 2026-02-07 to 2026-04-24 | Independent copy of the same cards: stats, weapons, abilities, spells, feat, points, FA; base sizes (Medium Base = 40 mm; Heavy Warbeast = 50 mm plus Headbutt/Slam/Trample); Highwaymen unit of 5 at 7 points, health 1 | https://warmachineacademy.miraheze.org/wiki/Captain_Gunnbjorn , https://warmachineacademy.miraheze.org/wiki/Dire_Troll_Bomber , https://warmachineacademy.miraheze.org/wiki/Braylen_Wanderheart,_Trollkin_Outlaw , https://warmachineacademy.miraheze.org/wiki/Trollkin_Highwaymen , https://warmachineacademy.miraheze.org/wiki/Template:Medium_Base , https://warmachineacademy.miraheze.org/wiki/Template:Heavy_Warbeast |
| S3 | MK4 rulebook, abridged digital (`docs/sources/WMH-MK4-Rulebook_Digital_144-OP_Abridged.pdf`, from the Steamforged free resources) | p65: heavy warbeast = large 50 mm base; p71: base sizes and the base icon on the stat bar; p96: life spirals, aspect damage, crippled aspects | https://warmachine.gg/products/warmachine-rules-only-pdf |
| S4 | List exports from the official Warmachine app ("PC CARD" format) in `Asmoridin/minis_games` | Dire Troll Bomber at 17 points (Storm of the North, 2025-05); Captain Gunnbjorn in United Kriels (2026-03) | https://github.com/Asmoridin/minis_games/tree/main/Warmachine/Lists/Trollbloods |
| S5 | warmachine.gg store (Steamforged): free-resources, armies and Kithguard collections, Kithguard Command Starter product page (published 2026-04-29) | No Trollbloods/United Kriels box or card PDF is sold or offered; current trollkin boxes are Southern Kriels; Kithguard Command Starter contents | https://warmachine.gg/collections/free-resources , https://warmachine.gg/pages/armies , https://warmachine.gg/products/warmachine-southern-kriels-kithguard-command-starter |
| S6 | Trollbloods Army Box (Privateer Press, 2017) contents, from news coverage (search result summaries) | Gunnbjorn, Mauler, Bomber, Dozer & Smigg, Highwaymen (10), Krielstone & Scribes, Braylen | https://spikeybits.com/new-trollblood-army-box-from-privateer-press/ , https://gamewire.belloflostsouls.net/?p=93109 |
| S7 | Warmachine Academy wiki, United Kriels army page | United Kriels: design era Legend, inactive, out of print; story continues in the Southern Kriels | https://warmachineacademy.miraheze.org/wiki/United_Kriels |
| S8 | Fan army-builder data (`murvkins/armybuilder-test`, `assets/json/trollbloods.json`, 2026-02-21) | Base sizes only (Gunnbjorn 40 mm, Bomber 50 mm, Braylen 40 mm). Its stats, weapons and points are a non-MK4 variant (STR, CMD, other weapons), so nothing else was taken | https://github.com/murvkins/armybuilder-test |
| S9 | Steamforged blog, Kithguard and General Gunnbjorn previews | Confirms the 2026 General Gunnbjorn is a separate Southern Kriels Kithguard model, not our Captain Gunnbjorn | https://warmachine.gg/blogs/news/southern-kriels-kithguard-general-gunnbjorn-pre-order , https://warmachine.gg/blogs/news/rock-troll-meet-wroughtmourn-and-her-battlegroup-of-brutes |
| S10 | Official Warmachine app data (`data_general.json`) split into files by a second, independent community repo; last data commit 2026-07-01: `Data_Structure/cards.json`, `models.json`, `weapons.json`, `model_abilities.json`, `model_advantages.json`, `weapon_abilities.json`, `weapon_qualities.json`, `spells.json`, `keywords.json` | Every stat, weapon, advantage, ability, spell, feat, points, FA and keyword again (all agree with S1); base-size advantages (40 mm, 50 mm); Highwaymen "5 Grunts" for 7 points; Bomber spiral aspect totals 9/12/9 | https://github.com/tate4490/Warmachine/tree/main/Data_Structure |

## Still unsourced (U-cd)

- None. The Bomber's aspect split is sourced (S1 branch sizes pair exactly to S10's aspect totals 9/12/9);
  only the Mind/Body/Spirit order of the three totals is our reading (rulebook order; RULING). For that order
  we tried: S1 (box counts per branch only), S2 (total only), S3 (sample spiral is an image), the
  warmachine.gg free resources and Kithguard blog images (no warbeast card shown).

## Single-source values and conflicts

- Points for the Bomber also appear in S4 (17). Every other value is in S1, S2 and S10 or in two of them;
  no value rests on one source. Conflicts: S2 lists Forward Deployment for the Highwaymen where S1 and S10
  say Advance Deployment (we follow the app dumps). MK3 Highwaymen sizes (6 or 10) do not apply.

## Tried, not used

- warmachineuniversity.com (domain now redirects to an unrelated site) and its web.archive.org copies
  (archive offline during the audit; older captures are MK3).
- `regebhart/armybuilder` (same non-MK4 variant as S8), `schlaf/WHAC_by_slaforet` and `CCWargameData` (MK2/MK3),
  `ironcodex/warmahordes-opendata` (no stats).
- Bell of Lost Souls articles (HTTP 403), Reddit search (HTTP 403), web searches for card reviews (MK3 only).
