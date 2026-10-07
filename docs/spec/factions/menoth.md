# Faction: Protectorate of Menoth (Covenant of the Flame) — Defenders of the Flame starter

- **Sources:** the SFG product listing for the *Defenders of the Flame Command Set* (SKU MEN542, Covenant of the
  Flame, release 2026-10-07) as carried by retailers (Miniature Market listing and its seven official SFG product
  photos), press previews of the Covenant of the Flame range (Wargamer summer preview 2026, Frontline Gaming
  "Warmachine Wednesday" 2026-09-02, Brückenkopf autumn preview), the MK4 abridged rulebook (`docs/sources/`) for
  core rules, and community MK4 card data (`isorna/wardice-warmachine-data`, fetched 2026-10-06; files
  `menoth.temple-guardians`, `menoth.final-interdiction`, `menoth.legacy`, `spells`, `abilities`, `qualities`).
  The app version of the community data is unknown.
- **No card for any model in this box is public yet.** The box ships tomorrow (2026-10-07). Four of its five
  profiles (Feora, Marshal of the Flameguard; Valeria; Pyrrhus, Flameguard Commander; Flameguard Defenders) are new
  and are not in the community data; the Crusader is new as a fixed-loadout profile. The Quick Start covers only
  Cygnar and Khador. So **no value below is verified**: every number is either community data for the Crusader
  chassis, or a guess built from the nearest older profile of the same character or troop type (the *proxy*).
  The previews give only rules gists (named below), never numbers. Everything waits on the **open app check**.
- **Confidence key** (QS beats community data on any conflict):
  - `verified (QS pN)`: printed in the Quick Start on page N (or read from its diagram); data entry may use it;
  - `V-cd`: community data and handoff G agree, not contradicted by the QS;
  - `U-cd`: community data only;
  - `U-guess`: no source; data entry must not trust it.
  - Local notes inside `U-guess`: `(proxy: <profile>)` = copied from that older community-data profile (itself
    U-cd for the old model); `(preview)` = the rule's gist comes from a press preview, the numbers are ours.
- All prose is ours. Names are real (Mallet posture) where known; names marked **(name U-guess)** are our
  placeholders until the card is seen. UI names come from `shipName`.

## Chosen box

**Defenders of the Flame Command Set** (Menoth, Covenant of the Flame): SFG's official MK4 30-point ("command
level") starter for the faction. Nine plastic models: Feora, Marshal of the Flameguard (warcaster); a Crusader heavy
warjack built as Venerable head, Blazing Star left arm, Flame Belcher right arm; Valeria, the Whisper of Death
(character solo); Pyrrhus, Flameguard Commander (character solo); Flameguard Defenders (unit, five models). The
three 50-point Covenant boxes (Scourge of the Unbeliever, Bastions of Faith, Heralds of Perdition) are larger.

We keep the **whole box** (owner decision: the official 30-point starter) rather than trimming to the Cygnar/Khador
shape; it differs from that shape by a second solo and a five-model unit (RULING below). Points per entry are
guesses that sum to the box's 30.

## Roster (30 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| men.feora | Feora, Marshal of the Flameguard | Feora | Leader (warcaster) | 0 | 30 | 16 | pts by rule (leaders 0); base, boxes U-guess (proxy: Feora, Priestess of the Flame) |
| men.crusader | Crusader (Venerable / Blazing Star / Flame Belcher) | Crusader | Heavy war-engine (warjack) | 15 | 50 | grid 32 | grid U-cd (Crusader chassis); pts, base U-guess |
| men.valeria | Valeria, the Whisper of Death | Valeria | Solo, character | 4 | 30 | 5 | U-guess (proxy: Nicia, Tear of Vengeance; Eiryss profiles) |
| men.pyrrhus | Pyrrhus, Flameguard Commander | Pyrrhus | Solo, character | 4 | 30 | 8 | U-guess (proxy: Pyrrhus, Flameguard Hero) |
| men.defenders | Flameguard Defenders | Defenders | Unit, 5 grunts (one profile; one sculpt carries a pennant, no rules) | 7 | 30 | 1 each | size 5 from the box count (9 models in the box); pts, boxes U-guess (proxy: Temple Flameguard) |

Total 0 + 15 + 4 + 4 + 7 = 30 (all U-guess). Composition for data: `grunts {profile: men.defenders-grunt, min 5,
max 5}` until the card shows the real range.

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | conf |
|---|---|---|---|---|---|---|---|---|---|
| men.feora | 6 | 6 | 7 | 6 | 15 | 17 | 6 | 12 | U-guess (proxy: Feora, Priestess of the Flame) |
| men.crusader | 4 | — | 6 | 5 | 10 | 19 | — | — | SPD, MAT, DEF, ARM U-cd (Crusader chassis); RAT U-guess (the old Crusader had no gun) |
| men.valeria | 7 | — | 6 | 8 | 15 | 12 | — | — | U-guess (proxy: Nicia SPD/DEF; Eiryss RAT 9 lowered to 8) |
| men.pyrrhus | 6 | — | 7 | 5 | 15 | 14 | — | — | U-guess (proxy: Pyrrhus, Flameguard Hero; RAT filler, he has no gun) |
| men.defenders (each) | 6 | — | 6 | 5 | 13 | 13 | — | — | U-guess (proxy: Temple Flameguard; RAT filler) |

- Pyrrhus carries a **Shield** (+2 ARM while it works, `core.q.shield`): effective ARM 16 (U-guess, proxy).
- A Defender in base contact with another model of its unit gets +2 ARM and can't be knocked down (**Shield Wall**,
  the Hounds' rule, reuse `kha.a.shield-wall`; U-guess, proxy).
- Feora has **Resistance: Fire** (never catches fire, `core.a.resist-fire`; U-guess, proxy).
- Warcaster basics as in Cygnar/Khador: Feora refills focus to ARC 6, the Crusader gains 1 focus from Power Up in
  her CTRL, a warjack holds at most 3 focus.

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| men.feora | Dual Attack, Resistance: Fire | **Stoke the Pyre** (name U-guess): friendly Faction models in Feora's CTRL may strip the Fire continuous effect off an enemy model to boost one melee attack roll or one melee damage roll against that model; Feora may instead strip a Fire effect from an enemy in her CTRL to cast one spell without paying its focus | gist U-guess (preview); exact limits, range, timing U-guess |
| men.crusader | Construct, Headbutt, Slam, Trample | **Venerable** (head option, name from the kit): no rule known; data entry gives it none until the card is seen | advantages U-cd (Crusader chassis); head rule U-guess |
| men.valeria | Advance Deployment, Pathfinder, Stealth | **Reposition [3"]** (`core.a.reposition`) | U-guess (proxy: Nicia, Eiryss) |
| men.pyrrhus | Tough | **Set Defense**: charge attack rolls and slam rolls against him take −2. **Steady**: can't be knocked down. **Relentless Charge**: Pathfinder while charging. **Impenetrable Shield**: while in base contact with a friendly Flameguard model, non-magical melee and ranged attacks don't damage him. **Battle Plan**: once in his activation, pick one plan: *Fight to the Last* (a friendly Faction warrior model or unit within 5" gains Tough for a round), *Stir the Blood* (a friendly Faction warrior model or unit within 5" gets +2 on its next melee damage roll this turn), *Precision Strike* (for one turn, friendly models within 10" of him ignore other friendly models for LOS and may move through them if they can end clear) | U-guess (proxy: Pyrrhus, Flameguard Hero). The Commander likely adds a Leadership rule for Flameguard (U-guess) |
| men.defenders | Combined Melee Attack | **Set Defense**; **Shield Wall** | U-guess (proxy: Temple Flameguard) |

Keywords (data): all five carry `flameguard` (U-guess; the box and the Covenant name the Flameguard) except the
Crusader (`construct`). Impenetrable Shield reads that keyword.

## Ability → descriptor / code hook map

Ops and fields from `hooks.ts` (00 §14). `[A1:n]` = the "after the attack is resolved" tier (R7.18 step 16).
**New** marks a mechanic the engine lacks today (see "New mechanics needed").

| Ability | Hook point | Descriptor (or code hook) | Test |
|---|---|---|---|
| Stoke the Pyre (boost) **New** | `attack.beforeRoll`, `damage.beforeRoll` | optional; when `{all:[{test:'attackKind', value:'melee'}, {test:'hasCondition', subject:'target', value:'fire'}, {test:'inCtrl', of:'controller'}]}`; `{op:'removeCondition', condition:'fire'}` on target, then `{op:'boost', roll:'attack'}` (or `damage`) | FAC-MEN-001 |
| Stoke the Pyre (free spell) **New** | `spell.declare` | code `hook.stokeThePyre` (Feora only: strip one enemy Fire in CTRL, the spell's COST becomes 0) | FAC-MEN-002 |
| Resistance: Fire | passive | `core.a.resist-fire` (existing) | COND-007 |
| Set Defense **New (data-only)** | `attack.beforeRoll` | when `{any:[{test:'charged', subject:'attacker'}, {code:'isSlamRoll'}]}`; `{op:'modRoll', roll:'attack', value:-2}` on the attacker | FAC-MEN-003 |
| Steady | passive | `{op:'forbid', what:'knockDown'}` | FAC-MEN-004 |
| Relentless Charge | `movement.charge` (run by `chooseMovementAnswer` as a charge is declared) | `{op:'grantAbility', ability:'core.a.pathfinder'}`, duration activation (no Pathfinder outside a charge) | FAC-MEN-005 |
| Impenetrable Shield | `damage.beforeApply` | when `{all:[{test:'b2b', value:{keyword:'flameguard', friendly:true}}, {not:{test:'damageType', value:'magical'}}, {test:'attackKind', value:['melee','ranged']}]}`; `{op:'preventDamage', value:999}` | FAC-MEN-006 |
| Battle Plan **New** | `activation.start` (optional; RULING: offered with the other optional start abilities) | code `hook.battlePlan`: the core raises an `abilityChoice` (`startTrigger`) whose options are `plan:<planId>\|<group>`, one per plan and eligible group, plus `skip`; the chosen plan is applied by `applyBattlePlan` (menoth.ts), once per activation | FAC-MEN-007 |
| Plan: Fight to the Last | (from Battle Plan) | scope friendly Faction warrior model/unit within 5; `{op:'grantAbility', ability:'core.a.tough'}`, duration round | FAC-MEN-008 |
| Plan: Stir the Blood | (from Battle Plan) | scope as above; `{op:'modRoll', roll:'damage', value:2}` next melee damage roll, duration turn, limit one use | FAC-MEN-009 |
| Plan: Precision Strike **New** | (from Battle Plan) | scope friendly within 10, duration turn; `{op:'ignore', ignore:'friendlyModels'}` (new IgnoreWhat: LOS and move-through) | FAC-MEN-010 |
| Shield Wall | passive | reuse `kha.a.shield-wall` (+2 ARM and `forbid knockDown` while `b2b` unit-mate) | FAC-KHA (existing) |
| Combined Melee Attack **New** | `combat.chooseAttack` | engine core: raise the existing `combinedAttack` decision for melee (MK4 rulebook p91: one attacker, +1 attack and damage per participant in melee range, the primary included, so n contributors give +(n+1), no cap; a charge attack only when the primary charged and so did every contributor) | CORE-034 |
| Reposition [3"] | `activation.end` | `core.a.reposition` (existing) | MOVE-021 |
| Weapon Master | `damage.beforeRoll` | `core.q.weapon-master` (existing) | — |
| Critical Fire **New (data-only)** | `attack.crit` | `{op:'applyCondition', condition:'fire'}` on target (pattern of `core.a.critical-knockdown`); new id `core.a.critical-fire` | COND-007 |
| Continuous Effect: Fire | `attack.hit` | `{op:'applyCondition', condition:'fire'}` (Cygnar Incendiary pattern); new id `core.q.continuous-fire` | SPR-007 COND-007 |
| AT Beat Back (Pyrrhus's Shield) | `attack.resolved` [A1:11] | reuse `core.a.beat-back` | FAC-CYG-009 |
| Chain Weapon (Blazing Star) **New** | `attack.declared` | `{op:'ignore', ignore:'shieldBonuses'}` (new IgnoreWhat: Buckler, Shield, Shield Wall) | FAC-MEN-011 |
| Spell Avenging Force | `spell.cast` | reuse `kha.s.avenging-force` (code `avengingForce`) | existing |
| Spell Convection | `death.destroyed` | code `hook.convection` (a living enemy destroyed by it → give 1 focus to a battlegroup warjack in CTRL, cap 3) | FAC-MEN-012 |
| Spell Fire Step | `spell.cast` | scope enemy within 2 of caster; `{op:'damage', pow:13, damageType:'fire'}`; then `{op:'place', dist:2}` on caster; once per activation | FAC-MEN-013 |
| Spell Hex Hammer **New** | `spell.declare` (enemy caster) | code `hook.hexHammer` (an enemy declaring a cast inside Feora's CTRL takes d3 damage; destroyed → no spell), duration round | FAC-MEN-014 |
| Spell Incite | `spell.cast` | scope friendly Faction; `{op:'modRoll', roll:'any', value:2}` when `{test:'withinInches', subject:'target', of:'controller', dist:10}`, duration turn | FAC-MEN-015 |
| Feat Blessing of the First Gift | `feat.used` | scope enemy in CTRL; `{op:'damage', pow:12, damageType:'fire'}` then `{op:'applyCondition', condition:'fire'}` | FAC-MEN-016 |

## Weapons

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| men.feora | Truth & Consequence (flame) | 2 | ranged | RAT 6 | SP 8 | 1 | — | 12 | — | Continuous Effect: Fire, Damage Type: Fire, Pistol | Spray; hit sets the target on fire | name and "punch-daggers that are also flamethrowers" from the preview; numbers U-guess (proxy: Priestess's Flamethrower ×2) |
| men.feora | Truth & Consequence (blade) | 2 | melee | MAT 7 | 1 | — | — | 13 | — | Critical Fire, Damage Type: Magical | — | U-guess (proxy: Priestess's Truth & Consequence) |
| men.crusader | Blazing Star | 1 | melee | MAT 6 | 2 | — | — | 17 | L | Critical Fire, Chain Weapon | Flail on a chain (reach from the sculpt) | name and location from the listing; numbers, qualities U-guess (proxy: Inferno Mace POW 18 on a mace) |
| men.crusader | Flame Belcher | 1 | ranged | RAT 5 | SP 8 | 1 | — | 12 | R | Continuous Effect: Fire, Damage Type: Fire | Spray; sets targets on fire | name and location from the listing; numbers U-guess |
| men.valeria | Bow (name U-guess) | 1 | ranged | RAT 8 | 12 | 1 | — | 12 | — | Damage Type: Magical, Weapon Master | Weapon Master adds a damage die | U-guess (proxy: Eiryss crossbow RNG 12) |
| men.valeria | Knife (name U-guess) | 1 | melee | MAT 6 | 1 | — | — | 8 | — | — | — | U-guess |
| men.pyrrhus | Flame Spear | 1 | melee | MAT 7 | 2 | — | — | 10 | — | Critical Fire, Weapon Master | — | U-guess (proxy: Pyrrhus, Flameguard Hero) |
| men.pyrrhus | Shield | 1 | melee | MAT 7 | 1 | — | — | 9 | — | Shield (+2 ARM), Weapon Master | Beat Back | U-guess (proxy) |
| men.defenders | Flame Spear | 1 | melee | MAT 6 | 2 | — | — | 10 | — | Critical Fire | — | U-guess (proxy: Temple Flameguard) |
| men.defenders | Shield | 1 | melee | MAT 6 | 1 | — | — | 8 | — | — | (the proxy's shield weapon has no Shield quality) | U-guess (proxy) |

Weapon ids: `men.w.truth-consequence-flame`, `men.w.truth-consequence-blade`, `men.w.blazing-star`,
`men.w.flame-belcher`, `men.w.valeria-bow`, `men.w.valeria-knife`, `men.w.pyrrhus-spear`, `men.w.pyrrhus-shield`,
`men.w.flame-spear`, `men.w.flameguard-shield`.

## Crusader damage grid (heavy, 32 boxes)

Community data for the Crusader chassis (U-cd; the fixed-loadout card may differ, open app check). Rows 1–6 top to
bottom as a card draws them (columns bottom-aligned). `·` = hull box, letter = system box, `x` = no box.

| Row | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| 1 | x | · | · | · | · | x |
| 2 | x | · | · | · | · | x |
| 3 | · | · | · | · | · | · |
| 4 | · | L | · | · | R | · |
| 5 | · | L | M | C | R | · |
| 6 | L | M | M | C | C | R |

Column heights 4/6/6/6/6/4. Engine storage, top box first:

| Column | Boxes (top → bottom) | Data string |
|---|---|---|
| 1 | · · · L | `---L` |
| 2 | · · · L L M | `---LLM` |
| 3 | · · · · M M | `----MM` |
| 4 | · · · · C C | `----CC` |
| 5 | · · · R R C | `---RRC` |
| 6 | · · · R | `---R` |

Systems: L = 3 (C1#4, C2#4, C2#5), M = 3 (C2#6, C3#5, C3#6), C = 3 (C4#5, C4#6, C5#6), R = 3 (C5#4, C5#5, C6#4).
No H system (the Venerable head carries no weapon). Default system effects from `core/systems.json`.

## Spells (Feora)

The new Feora's spell list is not public. We use the MK4 list of Feora, Priestess of the Flame (community data)
as the stand-in: all five are U-guess for this card, the stats are U-cd for the old one.

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Avenging Force | 2 | SELF | CTRL | — | UP | no | If enemy attacks damaged friendly Faction warriors in her CTRL during the opponent's last turn, one battlegroup model in her CTRL may advance 3" and make one basic melee attack in your Maintenance Phase (once per turn) | U-guess (proxy) |
| Convection | 2 | 10 | — | 12 | — | yes | Magical shot; if it destroys a living enemy, give 1 focus to a battlegroup warjack in her CTRL | U-guess (proxy) |
| Fire Step | 2 | SELF | — | 13 | — | no | Enemies within 2" of Feora take a POW 13 fire damage roll, then place her within 2"; once per activation | U-guess (proxy) |
| Hex Hammer | 2 | SELF | CTRL | — | RND | no | An enemy that declares a spell while in her CTRL takes d3 damage first; if that kills it, the spell fails | U-guess (proxy) |
| Incite | 4 | SELF | — | — | TURN | no | Friendly Faction models get +2 to attack and damage rolls against enemies within 10" of Feora | U-guess (proxy) |

## Feat (Feora): Blessing of the First Gift

Name from the preview. The preview says only that she sets everything around her ablaze. Our playable version
(U-guess (preview)): every enemy model in Feora's CTRL takes a POW 12 fire damage roll, then suffers the Fire
continuous effect (models with Resistance: Fire take the roll but don't catch fire). Instant; once per game.

## Data notes

- **Id scheme:** faction id `men` (engine file key `menoth`, code hooks in `src/engine/factions/menoth.ts`).
  Models `men.<slug>`: `men.feora`, `men.crusader`, `men.valeria`, `men.pyrrhus`, `men.defenders` (unit) with
  grunt profile `men.defenders-grunt`. Weapons `men.w.*` (above), abilities `men.a.stoke-the-pyre`,
  `men.a.set-defense`, `men.a.steady`, `men.a.relentless-charge`, `men.a.impenetrable-shield`,
  `men.a.battle-plan`, `men.a.fight-to-the-last`, `men.a.stir-the-blood`, `men.a.precision-strike`,
  `men.a.chain-weapon`; spells `men.s.avenging-force` (or reuse `kha.s.avenging-force`), `men.s.convection`,
  `men.s.fire-step`, `men.s.hex-hammer`, `men.s.incite`; feat `men.f.blessing-of-the-first-gift`; list
  `men.l.defenders-recon` (Recon, 30 points, leader `men.feora`, Valeria and Defenders `advanceDeploy` only if the
  cards give Advance Deployment; Valeria's proxy does). Shared additions: `core.a.critical-fire`,
  `core.q.continuous-fire`, `core.a.steady`, `core.a.set-defense` may live in core instead of `men.a.*`.
- **Bases:** all 30 mm except the Crusader 50 mm (U-guess; the photos show Feora, Valeria and Pyrrhus on the same
  small base as the Defenders, and the Crusader on a large one).
- **Figure slugs** (`30-figures`): `wm-feora`, `wm-crusader`, `wm-valeria`, `wm-pyrrhus`, `wm-defenders` (one GLB
  for all five grunts). Reference photos live outside the repo in `C:/Users/antho/Hunyuan3D-2/refs/wm/menoth/`
  (`refs.json` there lists files, sources and sculpt notes).
- **Palette** (from the studio paint scheme in the photos): primary `#e6d6b0` (ivory armour), secondary `#5c2350`
  (deep purple cloth and trim), metal `#b08d3e` (gold filigree; steel parts read as `#a4a7ab`), base `#4b3e2c`
  (earth), ui `#8c3c7a`. `sourceHues: [43, 315]` (ivory, purple). The gold trim shares the ivory hue band, so a
  repaint of the armour moves the gold too; acceptable for the hue-band shader.
- **Marking** for the army painter: `pyre-ward` (our own design: a flame inside a squared shield outline). It is not
  the faction's real icon and must not copy it.
- **shipName:** Feora, Crusader, Valeria, Pyrrhus, Defenders.
- **Fallback list** if the AI or a balance check needs the Cygnar/Khador shape: drop two Defenders (unit of 3,
  ~5 points) and keep both solos: 15 + 4 + 4 + 5 = 28, inside the 26–30 Recon window.

## New mechanics needed

Measured against STATUS.md (M2 rules modules, conditions, Avenging Force, Shield Wall, Tough, Stealth, Reposition,
Weapon Master and Beat Back already exist).

- **Strip a continuous effect as a cost (Stoke the Pyre):** add `removeCondition` on the target as a paid step
  of an optional trigger at `attack.beforeRoll`/`damage.beforeRoll`, then `boost`; the free-spell half is a
  code hook at `spell.declare` that sets the spell's cost to 0 after removing one enemy Fire in CTRL.
- **Combined Melee Attack:** the `combinedAttack` action exists in `actions.ts` but no rules module raises it;
  implement for melee in `phases/activation`: pick a primary in melee range, each other participant in melee range
  forfeits its attack and adds +1 to the primary's attack and damage rolls, the primary counting too (n contributors = +(n+1), no cap; rulebook p91).
- **Set Defense:** data-only if `attack.beforeRoll` can apply a defender-side `modRoll` to the attacker; needs a
  condition for "this is a slam roll" (`charged` already covers charge attacks), e.g. code `isSlamRoll`.
- **Battle Plan (choose one of three once per activation):** code hook raising an `abilityChoice` (like Prey's
  choice) any time in the activation, then applying the chosen plan's plain effects.
- **Precision Strike:** new `IgnoreWhat` value `friendlyModels` read by `los` (skip friendly intervening models)
  and `movement` (pass through friendly bases if the move ends clear). Additive to `hooks.ts`, needs a 00 §14 line.
- **Chain Weapon:** new `IgnoreWhat` value `shieldBonuses` that drops Buckler, Shield and Shield Wall ARM in
  `query.stat` for that attack. Additive to `hooks.ts`, needs a 00 §14 line.
- **Hex Hammer:** an enemy caster's `spell.declare` window must run triggers owned by the other side (aura in
  CTRL), d3 damage, and cancel the spell if the caster dies.
- **Critical Fire / Continuous Effect: Fire as shared qualities:** data-only (`attack.crit` / `attack.hit` →
  `applyCondition fire`); add `core.a.critical-fire` and `core.q.continuous-fire`.
- **Impenetrable Shield:** data-only if the `b2b` test can filter by friendly keyword (`value:{keyword, friendly}`)
  and `damageType` can test "not magical"; otherwise a small code hook.
- **Area feat damage then condition (Blessing of the First Gift):** existing ops; confirm `damage` with an
  enemy-in-CTRL scope rolls separately per model.

## Needs rules check

- RULING: official MK4 starter for Menoth | used the Defenders of the Flame Command Set (MEN542, Covenant of the Flame, 30 points per SFG's "command level" label), whole box | it is SFG's own 30-point Menoth starter; the owner rule picks the official box over a trimmed one.
- RULING: roster shape | kept two solos and a five-model unit instead of the Cygnar/Khador one-solo, three-trooper shape | the owner rule names the box; the trim rule applies only when no 30-point starter exists. Fallback list in Data notes.
- RULING: no public cards | every stat, cost, spell and rule of Feora, Valeria, Pyrrhus and the Defenders is copied from the nearest older community profile (Feora, Priestess of the Flame; Nicia/Eiryss; Pyrrhus, Flameguard Hero; Temple Flameguard) and marked U-guess | the box releases 2026-10-07 and the community data has no Covenant entries; a playable guess beats an empty profile, and the app check replaces it.
- RULING: points split | Crusader 15, Valeria 4, Pyrrhus 4, Defenders (5) 7 = 30 | the box is sold as 30 points; the split follows MK4 heavy (Deuce, Razor 17) and solo/unit costs in the community data.
- RULING: Crusader fixed loadout | Blazing Star (L, melee RNG 2 POW 17, Critical Fire, Chain Weapon) and Flame Belcher (R, SP 8 POW 12, fire) with RAT 5; chassis stats and grid from the community Crusader | names and arm locations are from the listing; reach 2 because the sculpt swings a flail on a long chain.
- RULING: Venerable head | no rule and no weapon | nothing public says what it does; adding an invented rule would be worse than leaving it blank.
- RULING: Stoke the Pyre (name ours) | strip Fire from an enemy in Feora's CTRL to boost one melee attack or damage roll against it, or (Feora only) to cast a spell for 0 focus; one Fire per use, no other limit | wording paraphrases the preview's gist; per-turn limits unknown.
- RULING: Blessing of the First Gift | POW 12 fire damage roll to every enemy in her CTRL, then Fire | the preview says only that she torches everything near her; POW 12 matches the Fire effect's own roll.
- RULING: Defenders' boxes | 1 box each, 5 grunts, no command attachment | the proxy grunts have no health track; the pennant sculpt has no known rule.
- RULING: Fire on a model with Resistance: Fire | the damage roll still happens, the continuous effect does not | in MK4 the resistance blocks the Fire continuous effect itself (qualities data, Continuous Effect: Fire); whether it also halves or ignores the feat's damage roll is open.
- RULING: bases | 30 mm for every non-warjack, 50 mm for the Crusader | photos show small bases on all four infantry sculpts; standard MK4 sizes.
