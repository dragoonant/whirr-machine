# Cryx starter: sources (research 2026-10-07)

Every source below was read on 2026-10-07. Nothing from them is copied into the repo: values are numbers and
names only, all prose in `cryx.md` and the data is ours. Community files were read in the session scratchpad
and are not committed.

| Tag | Source | What it gave | Strength |
|---|---|---|---|
| S1 | Community card data `isorna/wardice-warmachine-data`, `mk4/profiles/cryx.necrofactorium.profiles.json` (last changed 2026-07-10, commit "app data dump"), plus `mk4/abilities/abilities.json` and `mk4/spells/spells.json`. https://github.com/isorna/wardice-warmachine-data | every stat, health, Hades' grid, weapons, abilities, spells (COST/RNG/DUR/POW), feat name, points, FA. No base sizes, no Fury health, no spell OFF field | strong: a dump of the official app's data |
| S2 | Warmachine Academy wiki (Miraheze): [Wraithbinder Nekane](https://warmachineacademy.miraheze.org/wiki/Wraithbinder_Nekane) (rev 2026-01-20), [Hades](https://warmachineacademy.miraheze.org/wiki/Hades) (rev 2026-08-06), [Master Necrotech Chatterbane](https://warmachineacademy.miraheze.org/wiki/Master_Necrotech_Chatterbane) (rev 2026-04-13), [The Furies](https://warmachineacademy.miraheze.org/wiki/The_Furies) (rev 2026-04-13), [Cryx Necrofactorium](https://warmachineacademy.miraheze.org/wiki/Cryx_Necrofactorium) (rev 2026-06-27), and the rule templates (Small/Medium/Large Base, Heavy Warjack, each ability, each spell table with COST/RNG/AOE/POW/DUR/OFF) | full stat lines, base sizes, Fury names and health (8), points, spell OFF flags, feat, every rule | independent of S1, player-maintained, current to 2026 |
| S3 | Official store page, Cryx Necrofactorium Command Starter, SKU SFIK-CRX055: https://warmachine.gg/products/warmachine-cryx-necrofactorium-command-starter (product JSON read 2026-10-07; in stock) | box contents (Nekane, Chatterbane, Hades, The Furies) and "30-point games" | official |
| S4 | `Asmoridin/minis_games`, `Warmachine/Data/Warmachine MKIV Data.txt` (2026-04-07) and `WMMKIV-MKIVBoxes.txt`: https://github.com/Asmoridin/minis_games | points (Nekane 0, Hades 16, Chatterbane 4, Furies 10), spell list, box contents | weak alone; agrees with S1 and S2 |
| S5 | Official store, Army Box "Wraithbinder's Host" (published 2026-09-08): https://warmachine.gg/products/warmachine-cryx-necrofactorium-army-box-wraithbinders-host ; Command Set "Boneyard Keeper": https://warmachine.gg/products/warmachine-cryx-necrofactorium-command-set-boneyard-keeper | newer boxes. Wraithbinder's Host has Nekane, Hades and the Furies but no Chatterbane (and adds a Raptor, Initiates, Dominator, Night Terrors); Boneyard Keeper is Eviscerus, Chatterbane, Raptor, Grendel, Initiates | official |
| S6 | `kirkbushell/warmachine-data`, `data/units/cryx.json` (2025-03-29): https://github.com/kirkbushell/warmachine-data | Nekane base 30 and the feat; its Nekane stats and spells are a copy of Sepsira's entry (same AAT 6, health 17, spells), so only the base is used | weak |
| S7 | MK4 rulebook (abridged digital, `docs/sources/`): racking spells p101, tokens p97, Incorporeal p113, base sizes p71 | core rules only | official |

Sources tried that gave no card values: steamforged.com product and blog pages (HTTP 429 to scripts; the store
now redirects to warmachine.gg, whose free-resources page has no card PDFs), the official app's S3 bucket (not
listable), the app bundles mirrored in `isorna/wardice` (encrypted), Reddit (blocked), the Privateer Press
community forum (domain gone), Brueckenkopf rules article (Core Expansion only), jtswargaming.com "Getting
started with Cryx" (2024-08 preview text, pre-release values, not used), tabletopbattles.com (empty page).

## Value check

| Value | S1 | S2 | Other | Result |
|---|---|---|---|---|
| Nekane SPD/AAT/MAT/RAT/DEF/ARM/ARC/CTRL/health | 7/7/6/7/16/15/6/12/16 | same | S6 AAT 6, health 17 (copied entry) | kept, verified |
| Nekane base | — | Small (30) | S6 30 | 30, verified |
| Nekane spells, feat, weapons, abilities | match | match | S4 spell names | verified |
| Nekane rack slots | none | none | S6 3 (copied from Sepsira) | unknown; not modelled (RULING) |
| Hades stats, health 28, weapons, abilities, 16 pts | match | match | S4 16 pts | verified |
| Hades Dual Attack | yes | not listed | — | kept (S1) |
| Hades grid layout | given | not given | — | S1 only |
| Hades base | — | Heavy Warjack = 50 | S7 | 50, verified |
| Chatterbane stats, health 10, weapons, abilities, 4 pts | match | match | S4 4 pts | verified |
| Chatterbane base | — | Large (50) | — | **corrected 40 → 50** (S2 only) |
| Furies stats, weapon, abilities, 10 pts for 3 | match | match | S4 10 pts | verified |
| Fury health | none | 8 | — | **corrected 5 → 8** (S2 only) |
| Fury names | none | Anathan, Dogreth, Valak | — | **corrected** (S2 only) |
| Fury base | — | Medium (40) | — | 40, verified (S2) |
| Spell COST/RNG/POW/DUR | match | match | — | verified |
| Spell OFF | none | Crippling Grasp yes, Venom yes, others no | — | verified (S2) |
| Marionette effect | the affected enemy rerolls | same | — | **text corrected** |
