# Faction: Trollbloods (United Kriels, Gunnbjorn's gun line) — Recon starter

- **Sources:** listed as S1..S10 with URLs in `trollbloods-sources.md` (audit 2026-10-07). In short: **S1** the
  app data dump in `isorna/wardice-warmachine-data` (commit "app data dump", 2026-07-10); **S2** the Warmachine
  Academy wiki card pages (revisions Feb–Apr 2026); **S3** the MK4 rulebook (abridged digital, `docs/sources/`:
  p65 and p71 base sizes, pp96–97 life spirals and crippled aspects, pp104–107 warlocks, fury and warbeasts,
  pp108–110 animi); **S4** list exports from the official app (Bomber at 17 points); **S5** warmachine.gg store
  pages (current boxes); **S6** the 2017 Trollbloods Army Box contents; **S7** the Academy's United Kriels army
  page; **S8** a fan army-builder data file (base sizes only); **S10** a second, independent dump of the
  official app data (`tate4490/Warmachine`, `data_general.json` split into files, 2026-07-01).
- **Every card value below carries a source tag.** A value tagged with several sources (e.g. `S1+S2+S10`) was
  seen in each of them and they agree. A single tag means only that source showed it (S1 has no field for it). `U-cd` is
  left only where no source showed the value; after the audit none is left (the Bomber's aspect order is a
  RULING, not a gap).
- **Confidence key:**
  - `S1+S2+S10` (or any pair): independent sources agree; data entry may trust it;
  - `Sn`: one source only, nothing contradicts it;
  - `U-cd`: no source shows it; our assumption, flagged in `needs-rules-check.md`.
- All prose is ours. Names are real (Mallet posture). UI names come from `shipName`.
- This is a Hordes faction: a **warlock** runs a battlegroup of **warbeasts** on **fury**, not focus. The
  fury rules are specified in `81-warlocks-fury.md`; this file only states the per-model numbers in plain terms.

## Chosen box and why

There is **no MK4 starter for the Trollbloods faction** (S5, S7). In the official app the Trollbloods faction
holds the United Kriels and Storm of the North armies, built from older Privateer Press kits; the United
Kriels are a "Legend" army, out of print, whose story moved to the separate **Southern Kriels** faction (S7).
Steamforged's current trollkin boxes are all Southern Kriels: Foulblood's Armada (Brinebloods) and, since
April 2026, the **Kithguard Command Starter** (Sergeant Craghorn, Corporal Rhud Felleye, Klangor, Scrappers,
Pvt. Rattles; 30 points by S1's Kithguard file; S5). Those are a different faction with other models, so this
file keeps the Trollbloods faction and its old box (switching is an owner question, see the RULING).

The closest official Trollbloods box is the **Trollbloods Army Box (2017, Privateer Press)**: Captain
Gunnbjorn, Dire Troll Mauler, Dire Troll Bomber, Dozer & Smigg, Trollkin Highwaymen (10), Krielstone Bearer
& Stone Scribes and Braylen Wanderheart (S6). Every model in it is in the MK4 **United Kriels** army (S1).

Trimmed to the Cygnar/Khador shape (leader 0, one heavy beast, one solo, one unit):
Gunnbjorn (0) + **Dire Troll Bomber** (17) + **Braylen Wanderheart** (4) + **Trollkin Highwaymen ×5** (7)
= **28 points** (≤30, and ≥26 as `validate-data` requires). Braylen's Leadership names the Highwaymen
(like Falk and the Black 13th), and the Bomber's gun suits Gunnbjorn's ranged spells and feat.

## Roster (28 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| trl.gunnbjorn | Captain Gunnbjorn | Gunnbjorn | Leader (warlock) | 0 | 40 | 17 | pts, boxes S1+S2+S10; base S10 (40 mm) + S2 (medium) + S8 |
| trl.bomber | Dire Troll Bomber | Bomber | Heavy warbeast | 17 | 50 | spiral 30 | pts S1+S2+S10+S4; boxes S1+S2+S10; base S10 (50 mm) + S3 p65 (heavy warbeast = 50 mm) + S2 |
| trl.braylen | Braylen Wanderheart, Trollkin Outlaw | Braylen | Solo, character | 4 | 40 | 8 | pts, boxes S1+S2+S10; base S10 (40 mm) + S2 (medium) + S8 |
| trl.highwaymen | Trollkin Highwaymen | Highwaymen | Unit, 5 grunts (`trl.highwaymen-grunt`) | 7 | 40 | 1 each (Tough) | pts S1+S2+S10; size 5 S2+S10 ("5 Grunts"; S1 has no size field); boxes 1 S2+S10 (no health track = one box); base S10 (40 mm) + S2 |

Field allowance: Gunnbjorn C, Bomber 4, Braylen C, Highwaymen 2 (S1+S2+S10).
Keywords (S1): all are Trollblood and United Kriels; Gunnbjorn is Trollkin and Scout; Braylen is Trollkin;
the Bomber is a Heavy Warbeast and also Storm of the North (S1+S10). The Highwaymen card lists no Trollkin
keyword in S1 or S10 (we keep it; see the RULING). The old `outlaw` keyword was on no source and is removed.

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | FURY | THR | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|
| trl.gunnbjorn | 6 | — | 6 | 7 | 15 | 16 | 6 | 12 | — | — | S1+S2+S10 (no AAT on any: he has no offensive spell) |
| trl.bomber | 5 | — | 6 | 5 | 12 | 18 | — | — | 4 | 8 | S1+S2+S10 |
| trl.braylen | 6 | — | — | 7 | 14 | 15 | — | — | — | — | S1+S2+S10 (no melee weapon, so no MAT) |
| trl.highwaymen-grunt | 6 | — | — | 6 | 12 | 14 | — | — | — | — | S1+S2+S10 (no melee weapon, so no MAT) |

Fury in plain terms (rulebook pp104–107; details belong to `81-warlocks-fury.md`):
- **Gunnbjorn (ARC 6):** starts the game with 6 fury and never leeches above 6. In his Control Phase he
  takes fury off the Bomber (if it is inside his CTRL 12) and can draw more from his own body at 1 damage
  per point. He spends fury to cast spells, boost, buy extra melee attacks, heal himself or the Bomber,
  shake effects, and pay 1 to move a hit onto the Bomber (transfer). Warlocks have no Power Field.
- **Bomber (FURY 4, THR 8):** gains fury when forced (run, charge, power attack, boost, extra attack,
  Forced Reload, Regeneration, its animus, rile, shake). It can never hold more than 4. After leeching, a
  Bomber still holding fury rolls 2d6 + fury; above 8 it frenzies (charges the nearest model in LOS).
- **Animus (Bomber): Far Strike** — Gunnbjorn may cast it as his own spell while the Bomber is in his CTRL,
  or the Bomber can be forced to cast it (it gains fury equal to the COST).

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| trl.gunnbjorn | Tough | **Field Marshal [Run & Gun]**: warbeasts in his battlegroup gain Run & Gun. **Resourceful**: he keeps upkeep spells running on his battlegroup for free | S1+S2+S10 |
| trl.bomber | Dual Attack, Headbutt, Slam, Trample | **Regeneration [d3]**: once per activation, force it to heal d3; not in an activation it ran. **Snacking**: when it boxes a living model with a melee attack, it may remove that model from play to heal d3 | S1+S2+S10 (S2 gives the three power attacks through its Heavy Warbeast entry) |
| trl.braylen | Advance Deployment, Ambush, Pathfinder, Tough | **Dodge**: after an enemy attack misses her, she may advance up to 2". **Leadership [Trollkin Highwaymen]**: Highwaymen within 10" gain Dodge. **Prowl**. **Run & Gun** | S1+S2+S10 |
| trl.highwaymen | Advance Deployment, Ambush, Pathfinder, Tough | **Prowl**; **Swift Hunter**: after a basic ranged attack destroys an enemy, the model may advance up to 2" | S1+S2+S10, except Advance Deployment: S1+S10 (S2 says Forward Deployment; the two app dumps win) |

## Ability → descriptor / code hook map

Ops and fields from `hooks.ts` (00 §14). `[A1:n]` = the "after the attack is resolved" tier (R7.18 step 16).
Fury ops (`gainFury`, `force`) are **not in `hooks.ts` yet**; they wait for `81-warlocks-fury.md`.

| Ability | Hook point | Descriptor (or code hook) | Test |
|---|---|---|---|
| Field Marshal [Run & Gun] | passive | scope `warEngines` (battlegroup); `{op:'grantAbility', ability:'run-and-gun'}` (reuse cyg `hook.runAndGun`) | FAC-TRL-001 |
| Resourceful | `phase.maintenance` (upkeep step) | code `hook.resourceful` (upkeep cost 0 for spells on battlegroup models) | FAC-TRL-002 |
| Regeneration [d3] | `combat.choose` | code `hook.regeneration` (special: force for 1 fury, `{op:'heal', value:'d3'}`; once per activation; forbidden after run) | FAC-TRL-003 |
| Snacking | `death.boxed` | when `{all:[attackKind melee, {test:'living'}]}`; optional `{op:'removeFromPlay'}` then `{op:'heal', value:'d3'}` on self | FAC-TRL-004 |
| Dodge | `attack.resolved` [A1:12] | when `{all:[{not:hit}, isEnemy attacker]}`; `{op:'advance', dist:2, direction:'any'}`; optional | FAC-TRL-005 |
| Leadership [Trollkin Highwaymen] | passive | scope friendly `trl.highwaymen` within 10; `{op:'grantAbility', ability:'trl.a.dodge'}` | FAC-TRL-006 |
| Prowl | passive | reuse `core.a.prowl` | LOS-016 |
| Run & Gun | `activation.end` | reuse code `hook.runAndGun` | FAC-CYG-005 |
| Swift Hunter | `attack.resolved` [A1:11] | when `{all:[basic, attackKind ranged, {code:'destroyedEnemyThisAttack'}]}`; `{op:'advance', dist:2, direction:'any'}`; optional (shared with kha Razor) | FAC-TRL-007 |
| Critical Devastation | `attack.crit` | code `hook.criticalDevastation` (roll d6 once; throw every model hit directly away from the attacker, farthest first; non-direct-hit models take a POW 8 damage roll instead of blast damage; collateral POW 8) | FAC-TRL-008 |
| Forced Reload [1] | `combat.chooseAttack` | like `Reload [1]` but paid by forcing (1 fury on the Bomber) instead of focus | FAC-TRL-009 |
| Both Barrels (★Attack) | `combat.choose` | reuse cyg Both Barrels (`modRoll damage +4`, no more attacks with that weapon) | ATK-009 |
| Luck | `attack.rolled` | code `hook.luck` (raise a `reroll` decision on a miss; once per attack roll) | FAC-TRL-010 |
| Throw (quality, Claw) | — | engine core throw power attack | PWR-0xx |
| Feat Fortification | `feat.used` | scope friendly faction in CTRL; `{code:'grantCover'}`, `{op:'grantResistance', damageType:'blast'}`, `{op:'forbid', what:'knockDown'}`; duration round | FAC-TRL-011 |

## Weapons

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| trl.gunnbjorn | Bazooka | 1 | ranged | RAT 7 | 12 | 1 | 2 | 14 (blast 8) | — | Magical damage | Critical Devastation (above) | S1+S2+S10 (quality S1+S10) |
| trl.gunnbjorn | Axe | 1 | melee | MAT 6 | 1 | — | — | 11 | — | — | — | S1+S2+S10 |
| trl.bomber | Powder Bomb | 1 | ranged | RAT 5 | 8 | 1 | 3 | 16 (blast 8) | - | — | Forced Reload [1]: force once to make one more shot with it | S1+S2+S10; loc `-` is ours (warbeasts have no locations) |
| trl.bomber | Claw | 2 | melee | MAT 6 | 1 | — | — | 15 | - | Throw PA | — | S1+S2+S10 |
| trl.braylen | Heavy Pistol | 2 | ranged | RAT 7 | 8 | 1 | — | 12 | — | Pistol | Both Barrels (★Attack); Luck (reroll missed attack rolls once each) | S1+S2+S10 |
| trl.highwaymen-grunt | Pistol | 2 | ranged | RAT 6 | 8 | 1 | — | 10 | — | Pistol | Both Barrels (★Attack) | S1+S2+S10 |

Use `location: '-'` on every warbeast weapon: a spiral has no L/R systems; crippled aspects act on all
weapons (Body: −1 damage die; Mind: −1 attack die and no chain, power or special attacks).

Data shims (not card values): the Powder Bomb also lists `core.a.reload-1` so the engine's existing Reload
path offers the extra shot (Forced Reload swaps the focus cost for 1 fury on the Bomber), and the two guns
list `trl.a.guided-fire-die` so Guided Fire's free boost is checked when each attack is rolled.

## Bomber life spiral (heavy, 30 boxes)

Branch sizes 6 / 3 / 7 / 5 / 6 / 3 are **S1** (app dump `health.grid.columns`, layout `spiral`; the total of
30 also S2). **S10** stores the card's three aspect totals, **9 / 12 / 9**, which are exactly branches 1+2,
3+4 and 5+6, so each aspect owns two whole neighbouring branches and every box is an aspect box (S1+S10).
No source names the aspect of each total; we read them in the rulebook order **Mind = branches 1–2 (9 boxes),
Body = 3–4 (12), Spirit = 5–6 (9)** (RULING, same reading as Circle's Pureblood). The rulebook (p96) would
also allow mixed branches, but these totals leave no room for them.

| Branch | Boxes (outer → inner) | Aspect |
|---|---|---|
| 1 | M M M M M M | Mind |
| 2 | M M M | Mind |
| 3 | B B B B B B B | Body |
| 4 | B B B B B | Body |
| 5 | S S S S S S | Spirit |
| 6 | S S S | Spirit |

Recording (rulebook p96): roll d6 for the branch; mark from the outermost unmarked box inward; when the
branch is full continue in the next branch clockwise (6 wraps to 1). An aspect is crippled while all its
boxes are marked, and recovers when any of them is healed. Crippled **Body**: one fewer damage die.
Crippled **Mind**: one fewer attack die, no chain, power or special attacks. Crippled **Spirit**: can't be
forced (so no run, charge, power attack, Regeneration or Forced Reload).

Data shape: `{track:'spiral', branches:[6 strings]}`, each string outer box first, letters `M B S` (or `-`
for a box with no aspect, if a card ever shows some).

## Spells (Gunnbjorn) and animus (Bomber)

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Guided Fire | 3 | SELF | CTRL | — | TURN | no | This turn, models in Gunnbjorn's battlegroup inside his CTRL have their ranged attack rolls boosted for free (Gunnbjorn included; checked when the attack is rolled) | S1+S2+S10 |
| Rock Wall | 2 | CTRL | — | — | UP | no | Put a straight wall piece fully inside his CTRL, clear of bases, obstacles and obstructions; it is an obstacle giving cover; an 80 mm or 120 mm base touching it removes it | S1+S2+S10 (DUR Up in both); wall piece 4" × 3/4" from the rulebook |
| Sentry | 2 | 6 | — | — | UP | no | A friendly Faction model gets Rapid Fire: one basic ranged attack in your Maintenance Phase | S1+S2+S10 |
| Snipe | 2 | 6 | — | — | UP | no | A friendly Faction model's or unit's ranged weapons reach 3" further | S1+S2+S10 |
| Far Strike (animus) | 1 | SELF | — | — | TURN | no | The caster's ranged weapons reach 3" further this turn | S1+S2+S10 |

## Feat (Gunnbjorn): Fortification (S1+S2+S10)

Lasts one round: friendly Faction models inside Gunnbjorn's CTRL count as in cover (+4 DEF against ranged
and arcane attacks, R6), gain Resistance: Blast, and can't be knocked down.

## Id scheme

Faction id `trl` (engine file key `trollbloods`: `src/engine/factions/trollbloods.ts`). Models
`trl.gunnbjorn`, `trl.bomber`, `trl.braylen`, `trl.highwaymen` (unit) with grunt profile
`trl.highwaymen-grunt`. Weapons `trl.w.bazooka`, `trl.w.axe`, `trl.w.powder-bomb`, `trl.w.claw`,
`trl.w.heavy-pistol`, `trl.w.pistol`. Abilities `trl.a.field-marshal-run-and-gun`, `trl.a.resourceful`,
`trl.a.regeneration`, `trl.a.snacking`, `trl.a.dodge`, `trl.a.leadership-highwaymen`,
`trl.a.critical-devastation`, `trl.a.forced-reload`, `trl.a.luck`, `trl.a.swift-hunter` (or promote to
`core.a.swift-hunter` together with Khador). Spells `trl.s.guided-fire`, `trl.s.rock-wall`, `trl.s.sentry`,
`trl.s.snipe`, `trl.s.far-strike` (animus). Feat `trl.f.fortification`. List `trl.l.starter-recon`
(entries: Bomber; Braylen `advanceDeploy`; Highwaymen size 5 `advanceDeploy`).

## Palette and marking

| Key | Hex | Why |
|---|---|---|
| primary | `#4f87a6` | blue-grey troll skin |
| secondary | `#3e6b4c` | green tartan kilts and sashes |
| metal | `#a8743a` | brass and copper fittings |
| base | `#6b5b3e` | peaty earth and dry grass |
| ui | `#3fa0c4` | brighter skin blue for the HUD |

`sourceHues`: `[200, 30]` (skin blue and the tan leather coats the sculpts wear). Marking: **`river-knot`**
(our own name: a three-loop knot stencil for the army painter).

## Data notes
- Bases: Gunnbjorn, Braylen and the Highwaymen are medium (40 mm, S2 + rulebook p71 sizes); the Bomber is a
  heavy warbeast, large (50 mm, rulebook p65).
- Trooper and warbeast damage: Highwaymen have 1 box each with Tough (S2); the Bomber has a 30-box spiral,
  Gunnbjorn 17, Braylen 8.
- No model here has a melee weapon except Gunnbjorn and the Bomber; Braylen and the Highwaymen have no
  melee range (engaging rules as for Caine).
- Gunnbjorn's warlock basics apply to every warlock: Fury Manipulation, Battlegroup Controller, Leader,
  Feat, Spellcaster, Spirit Bond, Reaving, Transfer (rulebook pp104–105).

## New mechanics needed

| Mechanic | Who | Implementation sketch |
|---|---|---|
| Fury economy | Gunnbjorn, Bomber | `ModelState.fury`; Control Phase steps: leech (incl. self-leech at 1 damage each), Spirit Bond, upkeep, threshold checks; spend paths mirror focus (boost, extra attack, heal, shake); warlock fury capped at ARC. Owned by `81-warlocks-fury.md` |
| Forcing warbeasts | Bomber | a `force` cost on run, charge, power attacks, boosts, extra attacks, Forced Reload, Regeneration, animus, rile, shake: +fury on the beast, refused past FURY or outside CTRL or while Spirit is crippled |
| Threshold and frenzy | Bomber | Control Phase 2d6 + fury vs THR; on fail, an auto activation: shake, charge the nearest model in LOS, one boosted attack with the highest-POW melee weapon |
| Life spiral | Bomber | `damage.track:'spiral'` with 6 branch strings; d6 picks the branch, fill outer→inner, spill clockwise; aspects cripple as in the table above (additive to DamageState) |
| Transfer and Reaving | Gunnbjorn | `damage.beforeApply`: pay 1 fury to move the hit onto a battlegroup beast in CTRL below its FURY (overflow back, untransferable); reave fury from a beast destroyed in CTRL (not by friendly attack) |
| Animus | Bomber | a spell list on warbeasts; castable by the beast (forced, gains COST fury) or by its warlock while in CTRL; one friendly animus per model |
| Wild warbeasts | Bomber | on Gunnbjorn's death: fury lost, no forcing or animus (mirrors inert warjacks) |
| Regeneration [d3] | Bomber | special action-like "any time" option costing one force; once per activation; not after running |
| Snacking | Bomber | `death.boxed` option: RFP a living model it boxed in melee and heal d3; needs a `living` test |
| Critical Devastation | Gunnbjorn | `attack.crit` code hook: one d6 throw for every model hit, ordered farthest first; swaps blast damage for a POW-8 damage roll |
| Rock Wall | Gunnbjorn | runtime terrain: add an obstacle piece to `GameState` terrain while the upkeep lasts; removed on contact by 80/120 mm bases |
| Rapid Fire (Sentry) | Gunnbjorn | Maintenance Phase window: one basic ranged attack by the target (out-of-activation attack, like Avenging Force) |
| Range buffs | Snipe, Far Strike | `{op:'modStat', stat:'RNG', value:3}` scoped to ranged weapons |
| Granted cover (feat) | Fortification | a `grantCover` code hook read by `los.ts` cover checks for the round |
| Dodge | Braylen, Highwaymen | Evasive-like hook on any missed enemy attack, 2" advance |
| Luck | Braylen | raise the `reroll` decision (not raised by the starter content today) |
| Ambush choice | Braylen, Highwaymen | `setup.ts` says Ambush choices are not offered yet: offer "hold in reserve" at deployment and an entry at the end of later Control Phases |
| Forced Reload | Bomber | Reload-style extra shot paid in fury on the beast, not focus |

## Needs rules check

- RULING: MK4 Trollbloods starter | kept the 2017 Trollbloods Army Box (Gunnbjorn), trimmed to Gunnbjorn + Dire Troll Bomber + Braylen + Highwaymen ×5 = 28 pts | no MK4 starter exists for the Trollbloods faction (S5, S7); the only current trollkin starter, the Kithguard Command Starter (Craghorn, Felleye, Klangor, Scrappers, Pvt. Rattles), belongs to the separate Southern Kriels faction. Owner question: switch to it?
- RULING: heavy choice | Dire Troll Bomber (17) over Dozer & Smigg (14) or the Mauler (12) | 14+4+7 = 25 and 12+4+7 = 23 fall below the 26-point floor in `validate-data`; the Bomber's gun fits Gunnbjorn's ranged feat and spells.
- RULING: Highwaymen unit size | 5 models at 7 pts, was 3 | S10 (app data) says "5 Grunts" for 7 points and S2 lists 5 models; S1 confirms 7 points but has no size field.
- RULING: Highwaymen deployment | Advance Deployment | S1 and S10 (both app dumps) say Advance Deployment; S2 lists Forward Deployment (8"), a wiki slip.
- RULING: spiral aspects | branches 1–2 Mind, 3–4 Body, 5–6 Spirit, every box an aspect box | S1 branch sizes 6/3/7/5/6/3 pair exactly to S10's aspect totals 9/12/9; only the Mind/Body/Spirit order of the totals is our reading (rulebook order).
- RULING: warbeast weapon location | `-` on the Powder Bomb and Claws | spirals have no L/R/H systems; crippled aspects cover all weapons.
- RULING: base sizes | Gunnbjorn, Braylen, Highwaymen 40 mm; Bomber 50 mm (now sourced) | S10 carries the 40 mm and 50 mm base advantages on the cards; S2 agrees; rulebook p65 puts every heavy warbeast on a large (50 mm) base.
- RULING: Rock Wall duration | Up, wall 4" × 3/4", clear of every base, obstacle and obstruction; 80/120 mm bases remove it | S1 and S2 both say Up; the wall piece size is the rulebook's.
- RULING: Highwaymen keyword | treat as Trollkin | both app dumps (S1, S10) list only United Kriels, Trollblood and Unit on the card; it matters only for keyword-scoped rules, and none in this list uses it.
- RULING: Gunnbjorn AAT | none | S1, S2 and S10 show no arcane attack stat, and all his spells are non-offensive.
- RULING: Fortification cover | +4 DEF against ranged and arcane attacks as normal cover (R6) | the feat grants "cover" with no number; MK4 cover is +4 DEF.

---

# Skirmish section (50 points, WP-D-trl)

List `trl.l.skirmish` (file `src/data/lists/trl-skirmish.json`), spec `90-skirmish.md` B.3. The starter's Gunnbjorn, Bomber, Braylen
and Highwaymen are unchanged (see above). Three entries are new: **Dozer & Smigg**, **Krielstone Bearer & Stone Scribes** and
**Trollkin Runebearer**. Evidence for the picks: the four public Captain Gunnbjorn (United Kriels) lists on Longshanks (Krielstone 4/4,
Runebearer 4/4, Dozer & Smigg 3/4).

## Skirmish sources (tags continue the audit in `trollbloods-sources.md`)

| Tag | Source | Used for |
|---|---|---|
| S1 | `isorna/wardice-warmachine-data` raw `mk4/profiles/trollbloods.united-kriels.profiles.json`, `mk4/spells/spells.json`, `mk4/abilities/abilities.json`, `mk4/advantages/advantages.json` (read 2026-10-07; commit "app data dump", 2026-07-10), https://github.com/isorna/wardice-warmachine-data | every stat, weapon, advantage, ability and spell of the three new entries, points, FA, keywords |
| S10 | `tate4490/Warmachine` `Data_Structure/{cards,models,weapons,model_abilities,model_advantages,weapon_abilities,weapon_qualities,spells,keywords}.json` (read 2026-10-07; last data commit 2026-07-01), https://github.com/tate4490/Warmachine/tree/main/Data_Structure | independent copy of the same cards; unit size line (Stone Bearer and 3 Grunts); 40 mm and 50 mm base advantages; spiral aspect totals 9/12/9 |
| S2 | Warmachine Academy wiki through the MediaWiki API: https://warmachineacademy.miraheze.org/wiki/Dozer_%26_Smigg (rev 2026-02-08), https://warmachineacademy.miraheze.org/wiki/Trollkin_Runebearer (rev 2026-02-21), https://warmachineacademy.miraheze.org/wiki/Kriel_Stone_Bearer_%26_Stone_Scribes_(United_Kriels) (rev 2026-02-21; a second copy exists for Storm of the North) | third copy of Dozer & Smigg and the Runebearer (agree with S1 and S10 except the Bond wording); Krielstone points, FA, unit of 1 + 3, Tough, medium base |
| LS | Longshanks scan in `90-skirmish-sources.md` section 2 (https://warmachine.longshanks.org/) | which add-ons players field |
| WS | Web searches for MK4 card text of the three models (Steamforged, Bell of Lost Souls and similar) | nothing usable: results were MK2/MK3 era or store pages. No Steamforged free card PDF covers the United Kriels (see S5 in the audit) |

Conflicts: (1) Bond on Dozer & Smigg: S1 and S10 say boosted ranged attack **damage** rolls, S2 says attack rolls: app wording kept
(RULING). (2) The S2 Krielstone table shows SPD 3, ARM 14 and DEF 13 grunts, which matches no app copy and looks like a placeholder:
S1 + S10 kept (RULING). (3) S1 and S10 name the Scribe weapon "Hand Weapon", S2 "Axe": both POW 10, app name kept. Every value is in at
least two sources except the Scribe's Tough, which S1 and S10 both show (two sources too).

## New models

| id | Source model | Type | Pts | FA | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| trl.dozer-smigg | Dozer & Smigg | Heavy warbeast, character | 14 | C | 50 | spiral 30 (6/3/7/5/6/3) | pts, FA, stats, spiral S1+S2+S10; base S10 + rulebook p65 |
| trl.krielstone | Krielstone Bearer & Stone Scribes | Unit: 1 Stone Bearer + 3 Stone Scribes | 5 | 1 | 40 | 1 each (Tough) | pts, FA S1+S2+S10; size S10 + S2 |
| trl.stone-bearer | Stone Bearer | Trooper (unit lead) | - | - | 40 | 1 | S1+S10 (S2 values are a placeholder) |
| trl.stone-scribe | Grunt (we call it Stone Scribe) | Trooper | - | - | 40 | 1 | S1+S10 |
| trl.runebearer | Trollkin Runebearer | Solo | 3 | 1 | 40 | 5 | S1+S2+S10 |

Keywords (S1+S10): Dozer & Smigg are United Kriels, Trollblood, Dire Troll, Heavy Warbeast; the Krielstone unit United Kriels,
Trollblood, Trollkin, Unit (Storm of the North on its twin card); the Runebearer Trollblood, Storm of the North, Solo, United Kriels.

| id | SPD | AAT | MAT | RAT | DEF | ARM | FURY | THR | conf |
|---|---|---|---|---|---|---|---|---|---|
| trl.dozer-smigg | 5 | - | 7 | 5 | 12 | 19 | 4 | 10 | S1+S2+S10 |
| trl.stone-bearer | 5 | - | - | - | 12 | 13 | - | - | S1+S10 (no weapon, so no MAT or RAT) |
| trl.stone-scribe | 5 | - | 5 | - | 12 | 13 | - | - | S1+S10 |
| trl.runebearer | 6 | 6 | - | - | 12 | 14 | - | - | S1+S2+S10 (no weapon) |

## Weapons

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|
| trl.dozer-smigg | Bombard (`trl.w.bombard`) | 1 | ranged | RAT 5 | 14 | 1 | 3 | 14 (blast 8) | Arcing Fire (shoot past intervening models); also carries the Guided Fire boost rider | S1+S2+S10 |
| trl.dozer-smigg | Claw (`trl.w.claw`, shared with the Bomber) | 2 | melee | MAT 7 | 1 | - | - | 15 | Throw power attack | S1+S2+S10 |
| trl.stone-scribe | Hand Weapon (`trl.w.hand-weapon`) | 1 | melee | MAT 5 | 1 | - | - | 10 | - | S1+S10 (S2 calls it an Axe) |

## Abilities (our summaries; ids `trl.a.*` unless core)

| Model | Ability | What it does | Built as | conf |
|---|---|---|---|---|
| Dozer & Smigg | Gunfighter, Dual Attack, Headbutt, Slam, Trample (`core.a.*`) | as the core cards | core | S1+S2+S10 |
| Dozer & Smigg | Regeneration [d3], Snacking | as the Bomber's | existing hooks | S1+S2+S10 |
| Dozer & Smigg | Bond [Gunnbjorn] `bond-gunnbjorn` | free boosted damage rolls on ranged attacks while bonded and in his CTRL | `coreFlag bondGunnbjorn`, read by a `beforeHits` plugin that sets the attack's auto-boost | S1+S10 (S2 differs, RULING) |
| Dozer & Smigg | Bulldoze `bulldoze` | shove touched enemies up to 2" at the end of a Normal Movement, once each per turn | `movement.end` code hook `bulldoze` (R5.15 push) | S1+S2+S10 |
| Dozer & Smigg | Animus: Lucky Shot `trl.s.lucky-shot` | COST 1, RNG 6, Turn: a friendly Faction model rerolls its next missed ranged attack roll this turn | turn effect from the spell engine; reroll in the plugin | S1+S10 |
| Stone Bearer | Protective Aura `protective-aura` | friendly Faction (Trollblood) models within 8" gain +2 ARM, itself included | passive aura `modStat ARM +2` | S1+S10 |
| Stone Bearer | Serenity `serenity` | start of Control, before leeching: remove 1 fury from a friendly warbeast within 1" | `coreFlag serenity` + `serenityStep()` | S1+S10 |
| Stone Bearer | Take Up `take-up` | a Scribe within 1" is destroyed instead of the Bearer | `coreFlag takeUp` + `adjustPoints` plugin | S1+S10 |
| Runebearer | Attached `attached` | joins a friendly Leader for the game | `coreFlag attached`; Leader lookups use the owner's Leader | S1+S2+S10 |
| Runebearer | Arcane Repeater `arcane-repeater` | the Leader within 5" has +2 CTRL | passive aura `modStat CTRL +2`, filter Leader | S1+S2+S10 |
| Runebearer | Magic Ability `magic-ability` | its special actions count as casting a spell | `coreFlag magicAbility` | S1+S2+S10 |
| Runebearer | Guidance `guidance` (star action, RNG 6) | a friendly model gains Eyeless Sight and magical weapons for a turn | `combat.choose` code hook; picks its own target | S1+S10 |
| Runebearer | Harmonious Exaltation `harmonious-exaltation` (star action, RNG 5) | the Leader's next spell this turn costs 1 less | marker effect + `harmoniousDiscount` helper | S1+S2+S10 |
| Runebearer | Spell Slave `spell-slave` | casts a COST 3 or less Leader spell that is not Up, SELF or CTRL | flag only: Gunnbjorn has no such spell | S1+S10 |
| (granted) | Eyeless Sight `eyeless-sight` | ignores clouds for line of sight | passive `ignore clouds` | S1 advantage text |

## Dozer & Smigg spiral

Same branch table as the Bomber: 6 / 3 / 7 / 5 / 6 / 3 boxes, branches 1-2 Mind, 3-4 Body, 5-6 Spirit (S1 branch sizes, S10 totals 9/12/9;
the order is a RULING).

## The Skirmish list (50 points)

| Entry | Pts | Notes |
|---|---|---|
| Captain Gunnbjorn | 0 | Leader (warlock) |
| Dire Troll Bomber | 17 | in his battlegroup |
| Dozer & Smigg | 14 | in his battlegroup; bonded to him |
| Braylen Wanderheart (AD) | 4 | |
| Trollkin Highwaymen x5 (AD) | 7 | |
| Krielstone Bearer & Stone Scribes | 5 | 1 + 3 models |
| Trollkin Runebearer | 3 | |
| **Total** | **50** | |

## Tests (`tests/data/trl-skirmish.test.ts`)

SKM-001 and SKM-001b (list cost, Cohort, FA, builds a game on Copperline Crossing); DATA-TRL-010 to 014 (values and ids); FAC-TRL-020
Protective Aura; 021 Arcane Repeater; 022 Bond (a hit boosts for free in CTRL, not outside it); 023 Lucky Shot; 024 Take Up; 025 Bulldoze;
026 Serenity; 027 Harmonious Exaltation and Guidance; 028 Spell Slave has no legal spell on Gunnbjorn's card.

## Not built in the engine

Built by the M12 follow-ups: `control.ts` calls `serenityStep`; `castCost` takes the Harmonious Exaltation discount and spends the marker; an animus with a range (Lucky Shot) is offered with targets; Guidance is a targeted action and its magical weapons are read by core; solos get a controllerId (the Runebearer is in the battlegroup).

- Figures: slugs `wm-dozer-smigg`, `wm-krielstone-bearer`, `wm-stone-scribe`, `wm-runebearer` are WP-FIG's; `src/client/weaponFlavour.ts` has no flavour for `trl.w.bombard` and `trl.w.hand-weapon` (a figures-m9 test fails on the Bombard).
