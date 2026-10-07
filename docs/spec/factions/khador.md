# Faction: Khador (Winter Korps, SKS-6 cadre) — Recon starter

- **Sources:** the official Quick Start guide (Jul 2025, `docs/sources/`, printed pages 34–47 plus the template page) and
  community MK4 card data (`isorna/wardice-warmachine-data`, fetched 2026-10-04). The app version of the
  community data is unknown.
- **The Quick Start prints no stat cards.** It gives values only where the worked turns use them
  (pp36–47), one stat bar (Lazarenko, p35), the layout diagram (p35: base sizes) and Razor's damage grid
  (p41, p44). Everything else stays community data until the **open app check**.
- **Confidence key** (QS beats community data on any conflict): `verified (QS pN)` printed in the QS on
  page N (or read from its diagram); `V-cd` community data and handoff G agree, not contradicted by the
  QS; `U-cd` community data only; `U-guess` no source.
- All prose is ours.

The data also has a *solo* Vilkul (18 pts) and a *solo-companion* Razor. They are not used.
Recon uses the warcaster Vilkul (0 pts) and Razor (17 pts).

## Roster (30 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| kha.vilkul | Kapitan Zahara Vilkul | Vilkul | Leader (warcaster) | 0 | 30 | 17 | base verified (QS p35); pts, boxes V-cd |
| kha.razor | Razor | Razor | Heavy war-engine (warjack), character | 17 | 50 | grid 30 | base verified (QS p35); grid verified (QS p41) |
| kha.lazarenko | Sergeant Goran Lazarenko, the Jackal | Lazarenko | Solo, character | 4 | **40** | 8 | base verified (QS p35 stat bar and diagram); boxes U-cd, QS-consistent (survives 7, p44) |
| kha.hounds | The Hounds | Hounds | Unit, 3 character troopers (Tererya, Fedyniak, Skrobala) | 9 | 30 | unknown; use 5 each until the app check | base verified (QS p35); boxes U-guess |

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | conf |
|---|---|---|---|---|---|---|---|---|---|
| kha.vilkul | 7 | 6 | 7 | 7 | 16 | 15 | 6 | 12 | SPD, CTRL verified (QS p37); ARC verified (QS p36); MAT verified (QS p47); DEF, ARM verified (QS p43); AAT, RAT V-cd |
| kha.razor | 5 | — | 6 | 6 | 11 | 19 | — | — | SPD verified (QS p38); DEF, ARM verified (QS p41); RAT verified (QS p46); MAT V-cd |
| kha.lazarenko | 6 | — | **6** | 7 | 14 | 14 | — | — | all verified (QS p35 stat bar; RAT, DEF also p39, ARM p44). The community data's MAT 5 and ARM 16 are wrong |
| kha.hounds (all) | 6 | — | 6 | 6 | 14 | 15 | — | — | SPD verified (QS p38); rest V-cd |

- Razor's ARM is 21 while the Ripper Shield's system works: its **Shield** quality adds +2 ARM
  (verified QS p41, p44).
- A Hound in base contact with another Hound gets +2 ARM and can't be knocked down (Shield Wall,
  verified QS p38).
- Vilkul refills focus to ARC 6; Razor gains 1 focus from Power Up while in her CTRL; a warjack holds at
  most 3 focus (QS p36, p45).

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| kha.vilkul | Dual Attack, Pathfinder, Resist Corrosion, Resist Fire, Unstoppable, Tough | **Field Marshal [Prowl]**; **Prowl**; **Rise**; **Take Down**; **Enhanced Alchemical Mask**; Power Field (every warcaster: 1 focus cuts one damage instance by 5) | Pathfinder verified (QS p47: charges across the wall); Resistance: Fire verified (QS p43); Power Field verified (QS p43); rest U-cd |
| kha.razor | Construct, Dual Attack, Headbutt, Slam, Trample, Pathfinder, Resist Corrosion, Resist Fire | **Anchor**; **Reposition [3"]**: at the end of its activation it may advance up to 3"; **Swift Hunter** | Reposition verified (QS p46); Construct verified (QS p41, p43); rest U-cd |
| kha.lazarenko | Advance Deployment, Pathfinder, Resist Corrosion, Resist Fire, one more (unidentified icon); community data adds Ambush, Tough, Unstoppable | **Alchemical Mask**: ignores clouds (he sees through them); **Marksman**; **Prowl** | The QS stat bar (p35) shows exactly five advantage icons: Advance Deployment, Pathfinder, Resist Fire, Resist Corrosion verified; the fifth icon is not identified, so at most one of Ambush/Tough/Unstoppable is right (open app check). Alchemical Mask verified (QS p39); rest U-cd |
| kha.hounds | Advance Deployment, Dual Attack, Pathfinder, Resist Corrosion, Resist Fire, Tough | Alchemical Mask; **Girded**: the model and friendly models in base contact with it gain Resistance: Blast; Prowl; Reposition [3"]; **Shield Wall**: +2 ARM and no knockdown while in base contact with another member of the unit | Girded, Shield Wall verified (QS p38); rest U-cd |

Unstoppable (R2) only waives the disengage forfeit. Knockdown immunity comes from Shield Wall, Anchor
and Superiority.

## Ability → descriptor / code hook map

Ops and fields from `hooks.ts` (00 §14). `[A1:n]` = the "after the attack is resolved" tier (R7.18 step 16).

| Ability | Hook point | Descriptor (or code hook) | Test |
|---|---|---|---|
| Field Marshal [Prowl] | passive | scope `warEngines` (battlegroup); `{op:'grantAbility', ability:'prowl'}` | FAC-KHA-001 |
| Prowl | passive | when `{test:'concealed'}`; `{op:'grantAbility', ability:'stealth'}` | LOS-016 |
| Rise | `maintenance.start` | when knocked down: `{op:'removeCondition', condition:'knockedDown'}` | COND-004 |
| Take Down | `attack.declared` + `death.boxed` | melee only: `{op:'forbid', what:'tough'}` on the target; at boxed `{op:'removeFromPlay'}` | DMG-005 |
| Enhanced Alchemical Mask | passive | `{op:'ignore', ignore:'gas'}`, `{op:'ignore', ignore:'clouds'}`, `{op:'ignore', ignore:'concealment'}` | FAC-KHA-002 |
| Alchemical Mask | passive | `ignore gas`, `ignore clouds` (LOS and the concealment clouds give) | TERR-009 |
| Anchor | passive | scope friendly warrior models with `{test:'b2b'}`: `{op:'forbid', what:'knockDown'}` | FAC-KHA-003 |
| Reposition [3"] | `activation.end` | `{op:'advance', dist:3, direction:'any'}`; units per trooper | MOVE-021 MOVE-026 |
| Swift Hunter | `attack.resolved` [A1:11] | when a basic ranged attack destroyed an enemy: `{op:'advance', dist:2, direction:'any'}`; optional | MOVE-024 |
| Marksman | `damage.beforeApply` | code `hook.marksmanColumn` (ranged damage to a war-engine: the attacker picks the column) | GRID-010 |
| Girded | passive | scope self + friendly `{test:'b2b'}`: `{op:'grantResistance', damageType:'blast'}` | DMG-011 AOE-005 |
| Shield Wall | passive | when B2B with a unit-mate: `{op:'modStat', stat:'ARM', value:2}`, `{op:'forbid', what:'knockDown'}` | DMG-010 |
| AT Ward Breaker | `attack.declared` | code `hook.grantQuality` (`blessed`) | FAC-KHA-004 |
| AT Eruption of Ash | `death.boxed` | direct hit only: `{op:'cloud', area:'hazard', placement:'centredOnTarget', count:1, hazard:{pow:12, damageType:'fire', on:['enter','endActivation']}}` (enemies only, one round), then `{op:'removeFromPlay'}` | DMG-007 DMG-008 |
| Reload [1] | `combat.chooseAttack` | engine core | ATK-007 |
| Arcing Fire | passive (weapon) | `{op:'ignore', ignore:'interveningModels'}` | AOE-009 |
| Targeting Flare | `combat.choose` (attack option) | `{op:'cloud', area:'flare', placement:'point', aoe:3, blocksLos:false}`, completely within 10", centre in LOS ignoring intervening models; one turn | AOE-012 |
| Momentum (Slug Cannon) | `attack.hit` | target ≤ 40 mm: `{op:'slam', dist:'d3', collateralPow:16}`; larger: `{op:'knockDown'}` (QS p46: Deuce knocked down) | FAC-KHA-005 |
| Siege Weapon | `damage.beforeRoll` | vs 120 mm or a building: `{op:'addDie', roll:'damage'}` | FAC-KHA-006 |
| Critical Shred | `attack.crit` → `attack.resolved` [A1:13] | in its Combat Action: `{op:'makeAttack', target:'target', weaponFilter:'same'}`, no focus; `makesAttack: true`; R7.19 | ATK-012 |
| Beat Back (Ripper Shield) | `attack.resolved` [A1:11] | as Cygnar Beat Back | FAC-CYG-009 |
| Brutal Damage | `damage.beforeRoll` | direct hit only: `{op:'addDie', roll:'damage'}` | DMG-012 |
| Critical Knockdown | `attack.crit` | `{op:'knockDown'}` (before damage; denies Tough) | ATK-013 DMG-018 |
| Armor-Piercing | `damage.beforeRoll` | code `hook.armorPiercing` (halve the target's base ARM) | ATK-015 |
| Volume Fire | `attack.beforeRoll` / `damage.beforeRoll` | target 40 mm: `{op:'modRoll', roll:'any', value:1}`; ≥ 50 mm: value 2 | FAC-KHA-007 |
| Weapon Master | `damage.beforeRoll` | `{op:'addDie', roll:'damage'}` (QS p47) | FAC-KHA-010 |
| Feat Pall of Ashes | `feat.used` | `{op:'cloud', area:'cloud', placement:'ctrl', count:'d3+3', aoe:3}` (one round); in a cloud: living non-gas-immune enemies `{op:'modStat', stat:'DEF', value:-2}`, `{op:'modRoll', roll:'attack', value:-2}`, `{op:'forbid', what:'tough'}` (gas); friendly Faction models code `hook.pallOfAshesMove` (Pathfinder, move through obstructions and models) | COND-011 COND-012 DMG-016 |
| Spell Superiority | `spell.cast` | target war-engine in her battlegroup: `{op:'modStat', stat:'SPD', value:2}`, MAT +2, DEF +2, `{op:'forbid', what:'knockDown'}`; upkeep | FAC-KHA-008 SPL-013 |
| Spell Avenging Force | `spell.cast` + `maintenance.effects` | code `hook.avengingForce`: if a friendly model was damaged in the enemy turn, in her next Maintenance Phase the affected war-engine `{op:'advance', dist:3}` then `{op:'makeAttack', basic:true}` (out of activation, no focus); upkeep | FAC-KHA-009 |

`FAC-KHA-010` (Weapon Master) is new; the checklist owner adds the row.

## Weapons

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kha.vilkul | Thrown Axe | 1 | ranged | RAT 7 | 8 | 1 | — | 13 | — | Magical, Pistol, Weapon Master | AT: Ward Breaker / Eruption of Ash. Reload [1] | V-cd |
| kha.vilkul | Mechanika Axe | 1 | melee | MAT 7 | 1 | — | — | 13 | — | Magical, Weapon Master (+1 damage die) | AT: Ward Breaker / Eruption of Ash | RNG, POW, Weapon Master verified (QS p47); rest V-cd |
| kha.vilkul | Combat Knife | 1 | melee | MAT 7 | 1 | — | — | 10 | — | Magical, Weapon Master | — | U-cd |
| kha.razor | Grenade Launcher | 2 (one in L, one in R) | ranged | RAT 6 | 10 | 1 | 2 | 10/5 | L and R | — | Arcing Fire. Targeting Flare | locations verified (QS p44, p46); ROF, POW 10/5 verified (QS p46); AOE 2 QS-consistent (p46: exactly two blast victims with a third model 1.2" away in our replay); RNG, rest V-cd |
| kha.razor | Slug Cannon | 1 | ranged | RAT 6 | 8 | 1 | — | 16 | R | Pistol | Momentum (hit on a large or bigger base: knockdown; smaller: slam); Siege Weapon; Reload [1] | ROF, POW, R location, Momentum verified (QS p46); RNG, rest V-cd |
| kha.razor | Ripper Shield | 1 | melee | MAT 6 | 1 | — | — | 18 | L | Shield (+2 ARM while its system works) | Critical Shred; Beat Back | Shield verified (QS p41); RNG 1 verified (QS p46); rest V-cd |
| kha.lazarenko | 'Jack Buster | 1 | ranged | RAT 7 | 12 | 1 | 2 | 14/7 | — | — | Brutal Damage; Critical Knockdown | RNG, ROF, AOE, blast POW 7 verified (QS p39); direct POW 14 and rules V-cd |
| kha.lazarenko | Combat Knife | 1 | melee | MAT 6 | 1 | — | — | 9 | — | — | — | MAT verified (QS p35); rest U-cd |
| kha.hounds Tererya | Death Whisper Carbine | 1 | ranged | RAT 6 | 8 | 1 | — | 6 | — | Pistol | Armor-Piercing | V-cd |
| kha.hounds Fedyniak | Grenade Launcher | 1 | ranged | RAT 6 | 12 | 1 | 2 | 12/8 | — | Pistol | Arcing Fire | U-cd |
| kha.hounds Skrobala | Assault Cannon | 1 | ranged | RAT 6 | 12 | d3+1 | — | 12 | — | Pistol | Volume Fire; Critical Knockdown | U-cd |
| kha.hounds (all) | Battle Shield | 1 | melee | MAT 6 | 1 | — | — | 12 | — | — | — | V-cd |

Handoff G gives every Hound a carbine. The data gives a different gun to each trooper (above).

## Razor damage grid (heavy, 30 boxes) — verified (QS p41, p44)

Rows 1–6 run top to bottom as printed. `·` = a hull box, a letter = a system box, `x` = no box.

| Row | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| 1 | x | x | · | · | x | x |
| 2 | · | · | · | · | · | · |
| 3 | · | · | · | · | · | · |
| 4 | · | L | · | · | R | · |
| 5 | L | L | M | C | R | R |
| 6 | x | M | M | C | C | x |

Each column's boxes, top box first (the stored data; damage fills a column from its top box down,
then moves right, R3.4):

| Column | Boxes (top → bottom) |
|---|---|
| 1 | · · · L |
| 2 | · · L L M |
| 3 | · · · · M M |
| 4 | · · · · C C |
| 5 | · · R R C |
| 6 | · · · R |

Systems: L = 3 (C1#4, C2#3, C2#4: Ripper Shield and the L launcher; crippling L also loses the +2 ARM),
M = 3 (C2#5, C3#5, C3#6), C = 3 (C4#5, C4#6, C5#5), R = 3 (C5#3, C5#4, C6#4: Slug Cannon and the R
launcher). No H system. `#n` = the n-th box of the column from its top box.

QS check: 7 damage from column 5 fills C5 (5 boxes) and C6#1–2, leaving R and C partly marked
(p41). 4 more from column 6 fill C6#3–4 and C1#1–2, which cripples R (p44).

## Spells (Vilkul)

The QS shows two spells. The rest of the list is community data; **open app check** for the current
list and every stat.

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Superiority | 2 | ? | — | — | UP | no | Target warjack in her battlegroup gets +2 SPD, MAT and DEF and can't be knocked down | COST, DUR, effect verified (QS p37, p45); RNG U-guess |
| Avenging Force | 2 | ? | — | — | UP | no | Target warjack in her battlegroup: if any friendly model takes damage during the enemy turn, at her next Maintenance Phase the warjack advances 3" and makes one basic attack | COST, DUR, effect verified (QS p37, p45); RNG and target rules U-guess |
| Cyclone | ? | ? | ? | ? | ? | ? | Unknown | U-cd name |
| Cold Front | ? | ? | ? | ? | ? | ? | Unknown | U-cd name |
| Fog of War | ? | CTRL? | — | — | ? | no | Friendly models in her CTRL gain concealment | U-cd name; stats U-guess |

## Feat (Vilkul): Pall of Ashes

Lasts one round (its clouds are removed at the start of her next turn, before Maintenance; verified QS
p37, p45):
- Place d3+3 cloud areas (3" across, QS template page) completely within Vilkul's CTRL (verified QS
  p37: d3 = 1 → 4 clouds).
- Enemy models outside a cloud can't draw LOS through it (verified QS p37; the normal cloud rule, R6.5).
- Living models suffer −2 on attack rolls they make from inside a cloud (verified QS p42 on Falk).
- Living enemies in a cloud also suffer −2 DEF and lose Tough; it's gas, so models that ignore gas are
  exempt (every Khador model here; Razor is a construct) (U-cd).
- Friendly Faction models in a cloud gain Pathfinder and may move through obstructions and other
  models if they have enough movement to end completely clear (U-cd).

## Data notes
- Bases (QS p35 layout diagram, model discs measured against the 36" table; Lazarenko also from his stat
  bar): Vilkul and each Hound 30 mm, Lazarenko 40 mm, Razor 50 mm.
- Each Hound is a named character with a different gun, so the data model needs per-trooper weapons.

---

# Skirmish (50 points): `kha.l.skirmish` (WP-D-kha)

List (49 points, up to 4 under is legal, RB p118): the Recon starter plus the three add-ons Vilkul players actually field
(`90-skirmish.md` B.2).

| Entry | Pts | FA | Status |
|---|---|---|---|
| Kapitan Zahara Vilkul | 0 | C | `kha.vilkul` (starter) |
| Razor | 17 | C | `kha.razor` (starter) |
| Dire Wolf (Accuracy / Cannon / Heavy Chain Gun) | 11 | 4 | **new** `kha.dire-wolf-gun` |
| Sergeant Goran Lazarenko (Advance Deployment) | 4 | C | `kha.lazarenko` (starter) |
| The Hounds x3 (Advance Deployment) | 9 | C | `kha.hounds` (starter) |
| Arkanists x3 | 4 | 4 | **new** `kha.arkanists` (trooper `kha.arkanist`) |
| Winter Korps Snipers x3 (Advance Deployment) | 4 | 3 | **new** `kha.wk-snipers` (trooper `kha.wk-sniper`) |
| **Total** | **49** | | |

## Sources (research standard of 2026-10-07)

| Tag | Source | What it gave |
|---|---|---|
| `CD` | `isorna/wardice-warmachine-data`, `mk4/profiles/khador.winter-korps.profiles.json` (keys `direWolf`, `arkanists`, `winterKorpsSnipers`), `mk4/abilities/abilities.json`, `mk4/advantages/advantages.json`, raw.githubusercontent.com `main` (app dump 2026-07-10), fetched 2026-10-07 | stat lines, health grid, hardpoint costs and weapons, FA, ability wording |
| `WA` | Warmachine Academy wiki, https://warmachineacademy.miraheze.org/wiki/Dire_Wolf (rev 2026-04-13), `/Arkanists` (2026-01-18), `/Winter_Korps_Snipers` (2026-04-13); templates `Template:Volley_Fire` (2025-03-11), `Sniper` (2024-10-18), `Empower` (2024-08-18), `Razor_Wind_MA` (2024-10-02), `Magic_Ability`, `Small_Base` (30 mm), `Anchor`, `Beat_Back`, read through the MediaWiki API | stat tables (with PC, #, FA), loadouts, base templates, ability wording |
| `LS` | Longshanks Vilkul lists (`90-skirmish-sources.md` section 2; event 38172 Utah County Fall Journeyman Stage 2 holds the Accuracy / Cannon / Heavy Chain Gun build at 11) | which add-ons, build and its price |
| `SFG` | Steamforged product pages found by search (Winter Korps Snipers and Hunting Dog: "3 models", Advance Deployment, Sniper; Auxiliary Expansion holds the Arkanists); the pages themselves answered HTTP 429, so only the search snippets were read | unit size 3 and the Snipers' two rules, independent of CD and WA |
| `PP22` | Privateer Press lore article, https://home.privateerpress.com/2022/08/01/khador-winter-korps-lore-kapitan-ekaterina-baranova-dire-wolf-and-great-bear/ | an older preview text of Anchor (also stopped blast dice); superseded by the 2024-2026 text in CD and WA, not used |
| `TL` | https://zachwatsonauthor.com/2026/03/11/winter-korps-tier-list/ | roles only: Arkanists are the focus engine, Snipers a flank and 40 mm contest unit, Dire Wolf a cheap holder |
| `RB` | MK4 rulebook (local, abridged) | Crippled Head loses head rules (p95); boosted rolls (p61); battle engines and structures are not warrior models |

No free Steamforged card PDF for the Winter Korps was found (only the paid rules PDF and the Quick Start). Confidence key as
above plus `V-2src`: CD and WA agree and the rule reads the same in both (both derive from the app, so this is agreement of two
mirrors, not two independent printings); `U-1src`: one source.

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | Boxes | Base | conf |
|---|---|---|---|---|---|---|---|---|---|
| kha.dire-wolf-gun | 5 | n/a | 6 | 4 (+1 Accuracy = 5) | 10 | 19 | grid 30 | 50 | stats, grid V-2src; base 50 by heavy class (U) |
| kha.arkanist | 6 | 4 | 0 | 0 | 13 | 13 | 1 | 30 | V-2src; WA prose elsewhere says AAT 5 (RULING) |
| kha.wk-sniper | 6 | n/a | 4 | 6 | 13 | 13 | 1 | 30 | V-2src; Steamforged search snippet confirms Advance Deployment, Sniper, 3 models |

MAT and RAT 0 on the Arkanist: the card has no weapons, and `model.schema.json` requires both stats.

Dire Wolf grid (CD, top box first; `-` hull): C1 `---L`, C2 `--LLM`, C3 `---HMM`, C4 `---HCC`, C5 `--RRC`, C6 `---R` (30
boxes; systems L 3, M 3, H 2, C 3, R 3). Unlike Razor it has a **Head** system: a crippled Head loses the Accuracy bonus (RB p95).

## Weapons

| id | Weapon | Type | Stat | RNG | ROF | POW | Loc | Abilities | conf |
|---|---|---|---|---|---|---|---|---|---|
| kha.dire-wolf-gun | Cannon | ranged | RAT 4(5) | 12 | 1 | 15 | R | Beat Back, Critical Knockdown | V-2src |
| kha.dire-wolf-gun | Heavy Chain Gun | ranged | RAT 4(5) | 10 | d3+1 | 12 | L | Volley Fire | V-2src |
| kha.wk-sniper | Hunting Rifle | ranged | RAT 6 | 14 | 1 | 10 | n/a | none (Sniper is the model's rule) | V-2src |
| kha.wk-sniper | Hand Weapon | melee | MAT 4 | 1 | n/a | 9 | n/a | none | V-2src |
| kha.arkanist | Razor Wind (star attack) | arcane, printed as a spray | AAT 4 | SP 10 (data 10) | 1 | 12 | n/a | magical; crit fills the last column damaged | V-2src |

## Abilities (our words) and the code behind them

| Ability | Source of it | Hook point | Implementation | Test |
|---|---|---|---|---|
| Accuracy (Dire Wolf head) | `kha.a.accuracy` | passive | data: `modStat RAT +1` while `not systemCrippled H` | FAC-KHA-020 |
| Anchor | `kha.a.anchor` (existing) | passive | data; friendly warriors in base contact cannot be knocked down | FAC-KHA-003 |
| Beat Back, Critical Knockdown | core | attack.resolved / attack.crit | core | FAC-CYG-009 ATK-013 |
| Volley Fire | `kha.a.volley-fire` | attack.beforeRoll (weapon) | code `volleyFire`: the attack roll is boosted for free (as Guided Fire's free die), skipped against battle engines and structures | FAC-KHA-021 |
| Sniper | `kha.a.sniper` | passive flag + `adjustPoints`, `onBoxed` plugin | 1 damage point replaces the roll when 1 beats it; no Tough roll for a model its ranged attack disables | FAC-KHA-022 FAC-KHA-023 |
| Magic Ability | `kha.a.magic-ability` | passive flag `magicAbility` | core reads the flag: the star attack is arcane (AAT) | FAC-KHA-024 |
| Empower (star Action, range 6) | `kha.a.empower` | combat.choose | code `khaEmpower`: a friendly warjack in range loses Disruption and gains 1 focus (lowest focus first) | FAC-KHA-025 |
| Sigil of Power (star Action, range 6) | `kha.a.sigil-of-power` | combat.choose | code `khaSigilOfPower` applies a turn effect to the model (and unit) nearest an enemy; plugin `damageTypes` adds `magical` | FAC-KHA-026 |
| Razor Wind (star attack) | `kha.a.razor-wind` | combat.choose | arcane attack, plugin `adjustPoints` fills the last column on a critical hit against a warjack or warbeast | FAC-KHA-027 |
| Advance Deployment | core | setup | core (list entry `advanceDeploy`) | SKM-001 |

## RULINGs for this package

Copied to `docs/needs-rules-check.md` under M12 Skirmish.

- Sniper timing: the card says "instead of making a damage roll". The engine cannot skip the roll, so the dice are rolled and the
  points are replaced by 1 only when that beats the roll on the odds (the target has one box left, or the roll's expected damage
  is under 1); the choice never looks at the dice. Tough denial applies to every ranged attack by the model.
- Razor Wind spray: the card prints a spray (RNG SP 10). A Magic Ability special attack is resolved by core as a single-target
  arcane attack, so it hits one model. The crit rule fills the unmarked boxes of the last column or branch the hit damaged.
- Empower and Sigil of Power targets: core special actions cannot ask for a target when the effect is a code hook, so the hook
  chooses (Empower: the jack with the least focus; Sigil: the model or unit nearest an enemy).
- Arkanist AAT: CD and the WA table say 4, a WA strategy paragraph says 5; the tables win.
- Dire Wolf Anchor: the 2022 Privateer preview also removed a blast die; the current CD and WA text is knockdown only, so that is
  what `kha.a.anchor` does.
- Volley Fire: "boosted" is the RB p61 extra die on the attack roll. It is free (no focus), so no boost offer follows.
