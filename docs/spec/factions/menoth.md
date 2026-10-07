# Faction: Protectorate of Menoth (Covenant of the Flame) — Defenders of the Flame starter

- **Sources:** `menoth-sources.md` (S1..S7). Every card value below comes from S1, the Warmachine Academy
  transcription of the app cards (rules live in the app since 2026-09-02, S4). Names and rule gists are cross-checked
  with the Wargamer and Tabletop Battles previews (S2, S5); the box contents and its 30-point label with the retailer
  listing (S3). Core rules from the MK4 rulebook (S6).
- **Confidence key:** `S<n>` = value read from that source; `S1+S2` = confirmed by a second source; `U-cd` = only
  community data for an older model (no source shows the new card's value). Earlier proxy guesses (`U-guess`) are all
  gone: the 2026-10-06 build had copied Feora, Priestess of the Flame, Nicia/Eiryss, Pyrrhus, Flameguard Hero and
  Temple Flameguard; those values were replaced 2026-10-07.
- All prose is ours. Names are the card names (Mallet posture). UI names come from `shipName`.

## Chosen box

**Defenders of the Flame Command Set** (MEN542, Covenant of the Flame), SFG's official MK4 30-point ("Command
level") starter, released 2026-10-07 (S3). Nine plastic models: Feora, Marshal of the Flameguard (warcaster); a
Crusader heavy warjack built as Venerable head, Blazing Star left arm, Flame Belcher right arm; Valeria, the Whisper of
Death (character solo); Pyrrhus, Flameguard Commander (character solo); Flameguard Defenders (unit of five). The
pennant on one Defender sculpt is decoration: the Flameguard Defender Standard Bearer is a separate command attachment
(2 points, S1) and is not in the box. We keep the whole box.

## Roster (30 points)

| id | Source model | shipName | Type | Pts | FA | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|---|
| men.feora | Feora, Marshal of the Flameguard | Feora | Leader (warcaster) | 0 | — | 30 | 17 | S1 (leaders cost 0 by rule) |
| men.crusader | Crusader (Venerable / Blazing Star / Flame Belcher) | Crusader | Heavy warjack | 13 | 4 | 50 | grid 32 | S1 (chassis 0 + head 2 + left 5 + right 6; range 9–13) |
| men.valeria | Valeria, the Whisper of Death | Valeria | Solo, character | 5 | C | 30 | 8 | S1 |
| men.pyrrhus | Pyrrhus, Flameguard Commander | Pyrrhus | Solo, character | 4 | C | 30 | 8 | S1 |
| men.defenders | Flameguard Defenders | Defenders | Unit, 5 grunts | 8 | 4 | 30 | 1 each | S1; 5 models matches the 9-model box (S3) |

Total 0 + 13 + 5 + 4 + 8 = 30, the box's label (S3). Composition: `grunts {profile: men.defenders-grunt, min 5,
max 5}, costBySize {5: 8}`.

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | conf |
|---|---|---|---|---|---|---|---|---|---|
| men.feora | 6 | 6 | 7 | 6 | 15 | 17 | 6 | 12 | S1 |
| men.crusader | 4 | — | 7 | 5 | 10 | 19 | — | — | S1 (chassis MAT 6, +1 from the Venerable head); SPD 4 also S5 |
| men.valeria | 7 | — | 0 | 8 | 16 | 15 | — | — | S1 (no melee weapon: MAT 0, the Braylen convention) |
| men.pyrrhus | 6 | — | 7 | 0 | 15 | 16 | — | — | S1 (no gun: RAT 0); ARM is the printed stat, his Shield adds +2 in play (RULING) |
| men.defenders (each) | 6 | — | 6 | 0 | 13 | 16 | — | — | S1 (no gun: RAT 0); Shield Wall adds +2 in play |

Warcaster basics as in Cygnar/Khador: Feora refills focus to ARC 6, the Crusader gains 1 focus from Power Up in her
CTRL, a warjack holds at most 3 focus.

## Advantages and abilities (our summaries)

| id | Abilities | conf |
|---|---|---|
| faction | **The Four Gifts of Menoth** (army rule): each Maintenance Phase the Leader takes one Gift for the round: Flame (enemy warriors can't charge or special-attack friendly Faction models in her CTRL), Law (no enemy spells at them), Sheaf (enemy cohorts in her CTRL can't spend focus or essence or be forced), Wall (no enemy ranged attacks at them); no Gift again until all four have been taken | S1+S2+S5 |
| men.feora | Small Base, Resistance: Fire, Dual Attack; **Prophet of the Covenant** (friendly Faction models in her CTRL may put out a burning enemy's fire to boost a melee attack or damage roll against it); **Illumination** (once per turn in her activation, put out a fire on an enemy in her CTRL to cast a spell for 0 focus); **Marshal [Covenant of the Flame]** (friendly Covenant models don't block her LOS and she may advance through them if she gets fully past) | S1+S5 |
| men.crusader | Heavy Warjack (50 mm, Construct, Headbutt, Slam, Trample), Dual Attack, **Heavy Boiler** (+2 SPD when it runs), **Sanctified Hull** (inside its Leader's CTRL, models within 3" of it share the round's Gift); Venerable head: **Gladiator** (+2 on power attack damage and collateral damage rolls), MAT +1 | S1; Sanctified Hull also S5 |
| men.valeria | Small Base, Unstoppable, Pathfinder, Ambush, Advance Deployment, **Cleansing Volley** (once per turn in her combat action, after a ranged attack directly hits a burning enemy she may put the fire out to shoot once more at once), **Reconnaissance** (★Action, RNG 8: a friendly warrior model or unit gains Pathfinder for a turn), **Swift Hunter** (after a basic ranged attack kills, advance 2") | S1; arrows, fire-spending extra shot and Pathfinder action also S2 |
| men.pyrrhus | Small Base, **Heroic Inspiration [Flameguard Defender]** (a friendly Defender attacking in melee an enemy in his melee range rolls an extra damage die), **Set Defense**, **Marshal [Flameguard Defender]**, **Holy Martyrs [Flameguard Defender]** (when an enemy attack would disable him, a friendly Defender within 5" may be destroyed instead; he then removes 1 damage) | S1 |
| men.defenders | Small Base, Combined Melee Attack, **Set Defense** (charge and slam power attack rolls against it take −2), **Shield Guard** (once per round, take a friendly model's non-spray direct ranged hit within 3"), **Shield Wall** (+2 ARM and can't be knocked down while touching a unit-mate) | S1; Set Defense, Shield Wall, Shield Guard also S2/S5 |

Keywords (data): all but the Crusader carry `flameguard`, the Crusader carries `construct`; all carry `menoth`.
These are ours (S1 shows no keyword line); Heroic Inspiration, Marshal and Holy Martyrs name the Flameguard Defender
profile, which the engine can match by profile id.

## Ability → data / engine map

**Runs now** = existing engine support. **Engine** = entered as data (a `coreFlag` or ops core ignores, with a
`verify` note) and waiting on engine work, listed under "New mechanics needed".

| Ability | Data id | Status |
|---|---|---|
| Prophet of the Covenant | `men.a.stoke-the-pyre` (aura) granting `men.a.stoke-boost-attack` / `-damage` | Runs now (codes `stokeStripAttack`, `stokeStripDamage`) |
| Illumination | `men.a.illumination` (coreFlag `illumination`) | Partly: core casts for 0 via `stokeFreeVictim`, which keys on `men.a.stoke-the-pyre` and has no once-per-turn limit |
| Marshal [Covenant of the Flame] / [Flameguard Defender] | `men.a.marshal-covenant`, `men.a.marshal-defenders` | Engine |
| Resistance: Fire, Dual Attack, Pathfinder, Unstoppable, Ambush, Advance Deployment | `core.a.*` | Runs now |
| Heavy Boiler | `men.a.heavy-boiler` | Engine |
| Sanctified Hull, Four Gifts | `men.a.sanctified-hull`, faction `men.a.four-gifts` | Engine |
| Gladiator | `men.a.gladiator` | Engine |
| Chain Weapon | `men.a.chain-weapon` (plugin keyed on `men.w.blazing-star`) | Runs now |
| Thresher | `men.a.thresher` (weapon quality, coreFlag) | Engine (not offered) |
| Critical Fire / Continuous Effect: Fire | `men.a.critical-fire`, `men.a.continuous-fire` | Runs now |
| Set Defense | `men.a.set-defense` (coreFlag `setDefense`) | Runs now |
| Combined Melee Attack | `men.a.combined-melee-attack` | Runs now (CORE-034) |
| Shield Wall | `kha.a.shield-wall` | Runs now |
| Shield Guard | `men.a.shield-guard` | Engine |
| Heroic Inspiration, Holy Martyrs | `men.a.heroic-inspiration`, `men.a.holy-martyrs` | Engine |
| Blessed (Pyrrhus's weapon) | `cry.a.blessed` | Runs now |
| Swift Hunter | `kha.a.swift-hunter` | Runs now |
| Reconnaissance | `men.a.reconnaissance` (specialAction, grant Pathfinder, RNG 8, turn) | Runs now for one model; the unit form is engine |
| Cleansing Volley | `men.a.cleansing-volley` (attack.hit, removeCondition + addAttack) | Engine (core ignores both ops there) |
| Idrian Bow arrows | attack-type group on `men.w.valeria-bow` | Incendiary runs (`blastShot` + fire on hit); Armor-Piercing halves ARM but keeps POW 12 (needs POW 8); Featherweight makes one shot (needs two) |
| Conflagration | offensive spell, `applyCondition fire` on hit | Runs now (damage type stays magical only) |
| Debilitating Heat | offensive, no POW, RND | Engine (needs a hook like `cryCripplingGrasp`, plus the +2 friendly melee damage) |
| Lawgiver's Judgement | SELF, CTRL, UP marker on Feora | Engine (strip Resistance: Fire from enemies in her CTRL) |
| Sacred Paragon | SELF, RND: SPD +2, MAT +4, melee damage +4, no knockdown | Runs now |
| Teleport | SELF, instant | Engine (core runs no plain ops for instant spells) |
| Feat: Blessing of the First Gift | code `blessingOfTheFirstGift` | Partly: the hook also rolls POW 12 fire damage, which the card does not have |

## Weapons

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|
| men.feora | Flamethrower (`men.w.truth-consequence-flame`) | 2 | ranged | RAT 6 | SP 8 | 1 | — | 12 | — | Pistol, Damage Type: Magical, Damage Type: Fire, Continuous Effect: Fire | S1+S2 |
| men.feora | Truth & Consequence (`men.w.truth-consequence-blade`) | 2 | melee | MAT 7 | 1 | — | — | 13 | — | Damage Type: Magical, Continuous Effect: Fire | S1+S2 |
| men.crusader | Blazing Star | 1 | melee | MAT 7 | 2 | — | — | 18 | L | Chain Weapon, Thresher (★Attack) | S1 |
| men.crusader | Flame Belcher | 1 | ranged | RAT 5 | 10 | 1 | 3 | 15/9 | R | Damage Type: Fire, Continuous Effect: Fire | S1 (blast 9 single-source, RULING) |
| men.valeria | Idrian Bow | 1 | ranged | RAT 8 | 10 | 1 | — | 12 | — | Attack Type: Armor-Piercing Arrow (POW 8, halve base ARM), Featherweight Arrow (two simultaneous shots at different models), Incendiary Arrow (AOE 2, POW 12, fire, Continuous Effect: Fire) | S1+S2 |
| men.pyrrhus | Spear & Shield (`men.w.pyrrhus-spear`) | 1 | melee | MAT 7 | 2 | — | — | 13 | — | Weapon Master, Shield, Damage Type: Magical, Continuous Effect: Fire, Blessed | S1 |
| men.defenders | Spear (`men.w.flame-spear`) | 1 | melee | MAT 6 | 2 | — | — | 12 | — | Critical Fire | S1 |

Removed 2026-10-07 (proxy weapons the cards don't have): `men.w.valeria-knife`, `men.w.pyrrhus-shield`,
`men.w.flameguard-shield`. Weapon ids kept for the rest so engine plugins and tests still find them.

## Crusader damage grid (heavy, 32 boxes)

32 boxes is S1. The layout is **U-cd**: S1 gives no grid, so we keep the older Crusader chassis from community data
(S7). Rows 1–6 top to bottom as a card draws them (columns bottom-aligned). `·` = hull box, letter = system box,
`x` = no box.

| Row | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| 1 | x | · | · | · | · | x |
| 2 | x | · | · | · | · | x |
| 3 | · | · | · | · | · | · |
| 4 | · | L | · | · | R | · |
| 5 | · | L | M | C | R | · |
| 6 | L | M | M | C | C | R |

Engine storage, top box first: `---L`, `---LLM`, `----MM`, `----CC`, `---RRC`, `---R`. Systems L, M, C, R three
boxes each; no H (the Venerable head has no weapon).

## Spells (Feora)

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Conflagration | 2 | 10 | — | 12 | — | yes | Fire damage; the model hit catches fire | S1 |
| Debilitating Heat | 3 | 10 | — | — | RND | yes | Target model or unit: −2 DEF, −2 on its damage rolls; friendly Faction melee damage rolls against it +2 | S1+S2 |
| Lawgiver's Judgement | 2 | SELF | CTRL | — | UP | no | Enemies in her CTRL lose Resistance: Fire and can't gain it | S1+S2+S5 |
| Sacred Paragon | 2 | SELF | — | — | RND | no | +2 SPD, +4 MAT, +4 melee damage rolls, can't be knocked down | S1+S2+S5 |
| Teleport | 2 | SELF | — | — | — | no | Place her anywhere fully within 6", then her activation ends | S1+S2+S5 |

Removed 2026-10-07 (the Priestess's list, not this card): Avenging Force, Convection, Fire Step, Hex Hammer, Incite.

## Feat (Feora): Blessing of the First Gift

Every enemy model and unit in Feora's CTRL catches fire (Fire continuous effect). No damage roll. Instant, once per
game. S1+S2+S5.

## Data notes

- **Id scheme:** faction `men` (engine file `src/engine/factions/menoth.ts`). Models `men.feora`, `men.crusader`,
  `men.valeria`, `men.pyrrhus`, `men.defenders` (unit) with grunt `men.defenders-grunt`. List `men.l.starter-recon`
  (`src/data/lists/men-starter-recon.json`, Recon, 30 points, Valeria `advanceDeploy`). Abilities, weapons and spells
  as in the tables above; `men.a.stoke-the-pyre` keeps its old id but is named Prophet of the Covenant, because core
  keys on it.
- **Bases:** Small Base (30 mm) on Feora, Valeria, Pyrrhus and each Defender; Heavy Warjack (50 mm) on the
  Crusader. S1.
- **Figure slugs** (`30-figures`): `wm-feora`, `wm-crusader`, `wm-valeria`, `wm-pyrrhus`, `wm-defenders` (one GLB for
  all five grunts). Reference photos live outside the repo in `C:/Users/antho/Hunyuan3D-2/refs/wm/menoth/`.
- **Palette** (studio paint scheme): primary `#e6d6b0` (ivory armour), secondary `#5c2350` (deep purple), metal
  `#b08d3e` (gold), base `#4b3e2c`, ui `#8c3c7a`. `sourceHues: [43, 315]`.
- **Marking:** `pyre-ward` (our own design: a flame inside a squared shield outline), not the faction's real icon.
- **shipName:** Feora, Crusader, Valeria, Pyrrhus, Defenders.

## New mechanics needed (engine owner; data is ready)

- **Four Gifts of Menoth** (faction rule) and **Sanctified Hull**: a Maintenance-Phase choice on the Leader, no
  repeats until all four are used; Flame/Law/Wall as targeting bans for enemy charges and special attacks, spells and
  ranged attacks against friendly Faction models in the Leader's CTRL (or within 3" of a Sanctified Hull warjack in
  CTRL); Sheaf blocks focus, essence and forcing for enemy cohorts there.
- **Illumination:** key the free cast on `men.a.illumination`, once per turn, only in Feora's own activation.
- **Marshal [X]:** passive ignore-friendly for LOS and advancing (the Precision Strike `ignoreFriendly` effect
  already does it for a turn), filtered by Covenant keyword or the Defender profile.
- **Heavy Boiler:** +2 SPD only for a run.
- **Gladiator:** +2 on power attack damage and collateral rolls.
- **Thresher:** a ★Attack sweeping every model in melee range and LOS, friend or foe, at once.
- **Shield Guard:** redirect a non-spray direct ranged hit within 3", once per round.
- **Heroic Inspiration:** +1 damage die for a Defender's melee attack against an enemy in Pyrrhus's melee range.
- **Holy Martyrs:** at `death.disabled`, destroy a Defender within 5" instead and heal 1.
- **Cleansing Volley:** at `attack.hit`, remove fire from the target and queue one more ranged attack (once per turn).
- **Reconnaissance on a unit:** grant to the whole unit when a trooper is picked.
- **Arrows:** a POW override for Armor-Piercing (POW 8); two simultaneous shots at different targets for
  Featherweight; fire damage type on the Incendiary blast.
- **Debilitating Heat:** an offensive-spell hit hook applying −2 DEF, −2 damage rolls and +2 friendly melee damage
  against the target for a round.
- **Lawgiver's Judgement:** strip and block Resistance: Fire on enemies in the caster's CTRL while upkept.
- **Teleport:** a placement choice within 6", then end the activation.
- **Blessing of the First Gift:** drop the POW 12 damage roll from `blessingOfTheFirstGift`.
- **Conflagration:** add the fire damage type to the spell's damage roll.
- **Dead code:** `inciteAttack`, `fireStep`, `hexHammer`, `battlePlan`, Impenetrable Shield, Stir the Blood and
  the Convection plugin in `menoth.ts` no longer have data that uses them.

## Needs rules check

Menoth lines in `docs/needs-rules-check.md` (M9 factions section) are updated 2026-10-07: starter choice, roster
shape, points split, bases, Crusader loadout, Venerable head, Defenders' boxes, feat, Prophet/Illumination are
RESOLVED; new lines cover missing stats (MAT/RAT 0), Pyrrhus's printed ARM, the Flame Belcher blast POW and the rules
the engine cannot run yet. Spiral aspects do not apply (no warbeasts).

# Skirmish (50 points): `men.l.skirmish` (WP-D-men, 2026-10-07)

Spec: `docs/spec/90-skirmish.md` B.6 and C. Plays on the Skirmish scenario (Copperline Crossing, 48" table).

## Sources for this section

- **Confidence key:** `WA1` the Warmachine Academy wiki page of the model (the app transcribed by the community, MediaWiki `action=raw`),
  `WA-T` the same wiki's rule template for the named ability, `LS1` Longshanks public lists of Feora players (cost check), `CD2` community
  app data for the old Revenger grid, `S2` the Wargamer preview and `S3` the retail listings (gists and box contents only). `U-cd` = old
  community data, no current card shows it. A tag with a plus means two sources agree.
- WA1 pages (all read 2026-10-07; revisions 2026-09-05 to 2026-09-09):
  - https://warmachineacademy.miraheze.org/wiki/Revenger
  - https://warmachineacademy.miraheze.org/wiki/Cleanser_Sanctifiers (the wiki marks it WIP)
  - https://warmachineacademy.miraheze.org/wiki/Vassals_of_Menoth
  - the starter pages again for the re-check: /wiki/Crusader, /wiki/Feora,_Marshal_of_the_Flameguard, /wiki/Valeria,_The_Whisper_of_Death,
    /wiki/Pyrrhus,_Flameguard_Commander, /wiki/Flameguard_Defenders
- WA-T rule templates: `https://warmachineacademy.miraheze.org/w/index.php?title=Template:<name>&action=raw` for Righteous_Intervention,
  Penance_of_the_Corrupted, Enliven, Ancillary_Attack, Repair, Repel, Arc_Node, Chain, Decapitation, Chain_Weapon, Ashen_Veil, Light_Warjack,
  Medium_Base, Shield_Wall, Shield, Weapon_Master, Magic_Ability, Critical_Fire, Pistol, Sanctified_Hull.
- LS1: Feora lists at Longshanks event 37526 (https://warmachine.longshanks.org/event/37526/), players 6555, 8784, 23922, 33096, 62504 and
  63506, read as https://warmachine.longshanks.org/admin/players/pop_info.php?player=ID&event=37526&tab=list. Every list is 100 points;
  the prices are what matter and they agree with WA1 everywhere (below).
- CD2: https://raw.githubusercontent.com/isorna/wardice-warmachine-data/main/mk4/profiles/menoth.temple-guardians.profiles.json (the old
  Revenger: 26 boxes, the grid shape; community data, not committed).
- S2: https://www.wargamer.com/warmachine/summer-preview-2026-menoth (gists: Sanctifiers' once-per-game payback advance and melee attack;
  Vassals feed focus to warjacks and have buff actions; Revenger has four heads and four arms per side).
- S3: https://www.miniaturemarket.com/Warmachine-Menoth-Covenant-of-the-Flame-Bastions-of-Faith-Preorder/SFIK-MEN552 (Bastions of Faith box:
  Stallos, Crusader, Revenger, Cleanser Preceptor, Cleanser Sanctifiers, Cleanser Skyhammers, Vassals of Menoth; 15 plastic models).
- Tried, no numbers: Reddit and the official blog (blocked, see `menoth-sources.md`), Brueckenkopf preview (box news only), On Tabletop
  (box list only), the Steamforged site (no free card PDF; the rules live in the app and Wartable).

## The list (50 points)

| Entry | Pts | FA | Size | conf |
|---|---|---|---|---|
| Feora, Marshal of the Flameguard (Leader) | 0 | | | |
| Crusader (Venerable, Blazing Star, Flame Belcher) | 13 | 4 | | WA1; LS1 prices the parts: Venerable 2, Blazing Star 5, Flame Belcher 6 (and Battle Shield 5, Flame Pike 6, Heavy Purifier 4) |
| Revenger (Arc Node, Repulsor Shield, Light Immolator) | 7 | 4 | | WA1+LS1: head 1, shield 3, flail arm 3 (seen at 7 in three lists) |
| Valeria, the Whisper of Death (Advance Deployment) | 5 | C | | WA1+LS1 |
| Pyrrhus, Flameguard Commander | 4 | C | | WA1+LS1 |
| Flameguard Defenders | 8 | 4 | 5 | WA1+LS1 |
| Cleanser Sanctifiers | 9 | 2 | 3 | WA1+LS1 (9 in every list) |
| Vassals of Menoth | 4 | 2 | 3 | WA1+LS1 (4 in every list) |
| **Total** | **50** | | | |

The starter 30 (Crusader, Valeria, Pyrrhus, Defenders) plus 20 points of the three most-fielded add-ons of the five Feora lists in the spec
(Revenger, Sanctifiers, Vassals). The Cleanser Preceptor (5 of 5 lists) does not fit: it would make 55. Skirmish rule: the Leader's
battlegroup needs one non-lesser Cohort model; the list has two (Crusader, Revenger). The Revenger build is the one most Feora lists run:
Arc Node head (also the cheapest at 1), Repulsor Shield, Light Immolator. Loadout choice is not an option in the engine, so it is a
fixed profile (RULING, `needs-rules-check.md` M12 Skirmish).

## New models

| id | Source | Type | Base | Boxes | Pts | FA | conf |
|---|---|---|---|---|---|---|---|
| `men.revenger-arc` | Revenger | light warjack | 40 | grid 26 | 7 | 4 | WA1 (stats, boxes, FA, head and arm costs); grid shape U-cd (CD2) |
| `men.cleanser-sanctifiers` / `men.cleanser-sanctifier` | Cleanser Sanctifiers | unit of 3 | 40 | 8 each | 9 | 2 | WA1 (a WIP page, so single-source for the numbers; the gists of S2 agree) |
| `men.vassals` / `men.vassal` | Vassals of Menoth | unit of 3 | 30 | 5 each | 4 | 2 | WA1 |

| id | SPD | MAT | RAT | DEF | ARM | conf |
|---|---|---|---|---|---|---|
| `men.revenger-arc` | 5 | 6 | 5 | 12 | 17 | WA1 (chassis; every arm and head here keeps MAT 6) |
| `men.cleanser-sanctifier` | 5 | 7 | 5 | 12 | 18 | WA1 (Shield Wall adds +2 next to a unit-mate, as for the Defenders) |
| `men.vassal` | 5 | 0 | 0 | 13 | 13 | WA1 (the card prints neither MAT nor RAT; 0, the Valeria convention) |

Revenger grid (top box first, `-` hull, letter = system; boxes 3, 5, 5, 5, 5, 3): `--L`, `--LLM`, `---MM`, `---CC`, `--RRC`, `--R`. Three of
each of L, M, C, R. The community grid also has two Arc Node boxes (A) in the middle columns; they are plain hull here because the Arc Node
is now a head option and cannot be crippled (the same call as the Cryx Raptor). U-cd.

## Weapons (our summaries)

| Model | Weapon | Stat | RNG | POW | Qualities | conf |
|---|---|---|---|---|---|---|
| Revenger, left arm L | Repulsor Shield | MAT 6 | 1 | 12 | Shield (+2 ARM), Repel | WA1 |
| Revenger, right arm R | Flail (Light Immolator) | MAT 6 | 1 | 14 | Critical Fire, Chain | WA1 |
| Sanctifier | Holy Flame Jet | RAT 5 | SP 8 | 12 | Pistol, Magical, Fire damage, Continuous Effect: Fire | WA1 |
| Sanctifier | Flame Halberd | MAT 7 | 2 | 13 | Weapon Master, Magical, Critical Fire | WA1 |
| Vassal | none | | | | | WA1 |

## Abilities

| Rule | Where | Our reading | Runs now? |
|---|---|---|---|
| Repel (WA-T) | Repulsor Shield | A hit by the shield pushes the model hit 1" straight away; a melee weapon attack that hits the Revenger pushes the attacker 1" straight away from it once the attack is done; lost with the crippled left arm | **Yes** (`men.a.repel`, `repelResolved` in `menoth.ts`) |
| Chain (Decapitation, WA-T) | Flail | Damage left after ARM is doubled; a model it disables gets no Tough roll | **Yes** (`men.a.chain`, adjustPoints and onBoxed seams) |
| Repair [d3+1] | Vassals | ★Action, range 1, heal d3+1 on a friendly construct | **Yes** (`men.a.repair`, the shared `repair` hook) |
| Enliven | Vassals | ★Action, range 3, round-long: after an enemy attack damages that cohort model it may make a full advance | **Yes**, with a flat 5" advance (RULING) |
| Ancillary Attack | Vassals | ★Action, range 3: a friendly warjack makes one basic attack now, once per turn each | **Yes** (`men.a.ancillary-attack`) |
| Shield Wall, Resistance: Fire, Shield | Sanctifiers, Revenger | as on the Defenders and Feora | **Yes** |
| Sanctified Hull | Revenger | as on the Crusader | **Yes** |
| Arc Node | Revenger | the Leader may channel a spell through it | **No**: `spells.ts` looks for `core.a.arc-node`, which core does not define; the model carries `arcNode: true` and `men.a.arc-node` (flag `arcNode`) for WP-CORE |
| Ashen Veil | Light Immolator arm | concealment for the carrier; living enemies without Resistance: Fire within 2" take -2 on attack rolls | **No**: no attack-roll seam for an aura on enemy models, no granted concealment (WP-CORE) |
| Righteous Intervention | Sanctifiers | once per game, in activation: for a round, when an enemy attack destroys a friendly non-Sanctifier within 6", a Sanctifier advances 2" and attacks in melee | **No**: an inert passive (no empty action offered); needs a once-per-game unit action and a reaction to a friendly death (WP-CORE) |
| Penance of the Corrupted | Vassals | in the Control Phase, in the Leader's CTRL, take damage to give a friendly warjack that much focus | **No**: an inert passive; needs a damage-for-focus step in `focus.ts` (WP-CORE) |

## Tests

`tests/data/men-skirmish.test.ts`: SKM-001 (the list), SKM-002 (men: the mirror starts on Copperline Crossing, refused on a Recon
scenario), FAC-MEN-032 (card values of the three new models), FAC-MEN-033 (the starter re-check against WA1), FAC-MEN-034 (Repel),
FAC-MEN-035 (Chain), FAC-MEN-036 (Vassals' actions through the real pipeline), FAC-MEN-037 (Sanctifiers' Shield Wall and fire resistance).

## Starter re-check against WA1 (2026-10-07)

Every starter stat line, box count, weapon, cost and FA in this file was compared with the live wiki page; nothing changed. The M10 values
were not proxies any more (they came from the same pages). The Crusader grid layout is still U-cd, and the point costs are now checked
against two independent sources (WA1 and LS1). Figure slugs for the new models are `wm-revenger`, `wm-sanctifier` and `wm-vassal` (WP-FIG).
