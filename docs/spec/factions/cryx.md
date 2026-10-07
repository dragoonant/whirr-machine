# Faction: Cryx (Necrofactorium) — Recon starter

- **Sources:** the official MK4 rulebook (abridged digital, `docs/sources/`, core rules only: tokens p97,
  Incorporeal p113, advantages p136) and community MK4 card data (`isorna/wardice-warmachine-data`,
  `mk4/profiles/cryx.necrofactorium.profiles.json`, `abilities.json`, `spells.json`, fetched 2026-10-06). The
  box contents come from retailer listings of the SFG product (Noble Knight, Asmodee Canada, SKU SFIK-CRX055);
  the steamforged.com store page was rate-limited (HTTP 429) during research. The app version of the community
  data is unknown.
- **Nothing here is in the Quick Start.** The QS (Jul 2025) covers Cygnar and Khador only, so no Cryx value can be
  `verified (QS pN)`, and handoff G has no Cryx entry, so nothing can be `V-cd` either. Every card value below is
  `U-cd` until the **open app check** (record the app version, confirm every value). Core-rule citations (RB pN)
  confirm how a rule works, not a card number.
- **Confidence key** (QS beats community data on any conflict):
  - `verified (QS pN)`: printed in the Quick Start on page N (or read from its diagram); data entry may use it;
  - `V-cd`: community data and handoff G agree, not contradicted by the QS;
  - `U-cd`: community data only;
  - `U-guess`: no source; data entry must not trust it.
- All prose is ours. Names are real (Mallet posture). UI names come from `shipName`.

## Chosen box

**Cryx Necrofactorium Command Starter** (SFG, SKU SFIK-CRX055, released with the Necrofactorium wave, pre-orders
Jul–Aug 2024). Retail copy calls it a ready-to-play 30-point force and lists exactly: Wraithbinder Nekane
(warcaster), Hades (character warjack), Master Necrotech Chatterbane (character solo), The Furies (unit of three
character models). This is the same shape as the Cygnar and Khador Recon starters, so no trimming is needed.

RULING: starter box choice | Cryx uses the Necrofactorium Command Starter as-is (Nekane, Hades, Chatterbane, The Furies; 0+16+4+10 = 30) | it is the official 30-point MK4 Cryx starter and already matches the leader / heavy / solo / 3-model unit shape

## Roster (30 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| cry.nekane | Wraithbinder Nekane | Nekane | Leader (warcaster), living | 0 | 30 | 16 | pts, boxes U-cd; base U-guess (product photo) |
| cry.hades | Hades | Hades | Heavy war-engine (warjack), character, construct | 16 | 50 | grid 28 | pts, grid U-cd; base U-guess (product photo, standard heavy) |
| cry.chatterbane | Master Necrotech Chatterbane | Chatterbane | Solo, character, undead | 4 | 40 | 10 | pts, boxes U-cd; base U-guess (product photo) |
| cry.furies | The Furies | Furies | Unit, 3 character troopers, undead, Incorporeal, Wraith | 10 | 40 | per trooper; use 5 each until the app check | pts U-cd; base U-guess (product photo); boxes U-guess (the data has none) |

Points: 0 + 16 + 4 + 10 = **30** (U-cd). Recon needs at least one non-lesser cohort: Hades.

The Furies troopers (ids `cry.furies-a`, `cry.furies-b`, `cry.furies-c`) share one profile in the data. Their
individual names are unknown; shipNames `Fury I`, `Fury II`, `Fury III` until the app check (U-guess). The trooper
letters follow the product photo (see the figure refs): **a** = the open-armed wraith at the left, **b** = the
upright wraith at the back right with arms raised, **c** = the front-right wraith with arms spread low.

Base estimates (U-guess): measured on the official group photo against Hades' heavy base (assumed 50 mm).
Nekane's base is the smallest (30 mm); Chatterbane's and each Fury's are clearly wider than hers and about 0.8×
Hades' (40 mm).

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | conf |
|---|---|---|---|---|---|---|---|---|---|
| cry.nekane | 7 | 7 | 6 | 7 | 16 | 15 | 6 | 12 | U-cd |
| cry.hades | 6 | — | 6 | 6 | 13 | 18 | — | — | U-cd |
| cry.chatterbane | 6 | — | 5 | 5 | 13 | 17 | — | — | U-cd |
| cry.furies (each) | 6 | 7 | 6 | — | 14 | 14 | — | — | U-cd |

- A missing stat is stored as 0 (as Caine's MAT): Hades and Chatterbane have no AAT, the Furies have no ranged
  weapon so RAT 0.
- Hades' ARM is 20 while its Death Claw system (L) works: **Shield** adds +2 ARM (U-cd; quality RB p18).
- Incorporeal models within 10" of Nekane get +3 ARM (**Wraithbinder**): the Furies stand at ARM 17 near her, and
  Hades too while Soul Phase makes it Incorporeal.
- Warcaster and warjack basics are the standard ones: Nekane refills focus to ARC 6, Hades powers up for 1 in her
  CTRL and holds at most 3 focus. Hades' **Soul Generator** can add focus from soul tokens at activation start, still
  capped at 3.

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| cry.nekane | Dual Attack, Pathfinder | **Dodge**: after an enemy attack misses her, she may advance up to 2". **Grappling Hook**: at the end of her activation she may pay 1 focus to be placed anywhere completely within 5". **Vital Magic**: when something would end her upkeep spells, she may keep any of them by taking d3 damage per spell kept. **Wraithbinder**: friendly Incorporeal models within 10" get +3 ARM | U-cd |
| cry.hades | Construct, Dual Attack, Headbutt, Slam, Trample, Unstoppable | **Aggressive**: runs and charges cost it no focus. **Soul Taker: Collector**: holds up to 3 soul tokens, gaining one when a living enemy is destroyed within 10" (nearest eligible taker wins, RB p97); it spends them on the three rules below. **Shadow Gate**: once per turn, right after it hits an enemy with a melee attack in its activation, spend 1 corpse or soul token to be placed completely within 2". **Soul Generator**: at the start of its activation, spend soul tokens for 1 focus each. **Soul Phase**: during its activation, spend a soul token to become Incorporeal for one turn | U-cd; token rules RB p97 |
| cry.chatterbane | Dual Attack, Pathfinder, Undead | **Ancillary Attack** (★Action, RNG 3): a friendly Cryx cohort in range immediately makes one basic melee or ranged attack; each model at most once per turn. **Enliven** (★Action, RNG 3): for one round, the next time the friendly Cryx cohort takes damage from an enemy attack it may make a full advance after the attack, then Enliven ends. **Repair [d3+3]** (★Action, RNG 1): remove d3+3 damage from a friendly Cryx construct. **Exhaust Fumes**: when he advances in his Normal Movement, other friendly models within 3" of him have concealment for one round | U-cd |
| cry.furies | Incorporeal, Undead | **Magic Ability**: their ★Attacks and ★Actions count as casting a spell. **Marionette** (★Attack, arcane, RNG 10, no damage): for one round, the player may make one model attacking the affected enemy model or unit reroll one attack or damage roll, then Marionette ends. **Power of Death** (★Action): for one turn, friendly undead models within 10" of this Fury get +2 on melee damage rolls. **Stygian Abyss** (★Attack, arcane, RNG 10, POW 12): a critical hit makes the target Blind for one round. **Mortal Fear**: living enemy models within 8" take −2 on damage rolls | U-cd |

Keywords: every model is Cryx and Necrofactorium; the Furies are also Wraith; Nekane carries the Scout keyword in the
data (no rule attached). "Faction cohort" in Chatterbane's actions means a Cryx war-engine (Hades).

**Same-name effects don't stack** (RB p10): three Furies give one Mortal Fear (−2), and two Power of Death
activations give one +2. The one-per-unit marker (•) on Marionette, Power of Death and Stygian Abyss means only one
Fury in the unit may use each of them per activation (see RULINGs).

**Blind** (defined only in the Stygian Abyss card text; ours): the model can't make ranged or magic attacks, has −4
MAT and −4 DEF, can't run, charge, slam or trample, and must give up either its Normal Movement or its Combat Action
in its next activation. It can be shaken.

**Incorporeal** (RB p113, ours): not an intervening model; immune to continuous effects and non-magical damage;
can't be pushed, slammed or thrown; moves through obstructions, models and all non-impassable terrain as open;
charges and power attacks don't stop at obstacles, obstructions or models; never forfeits its Combat Action for
leaving melee, and enemies don't forfeit theirs for leaving its melee range; it loses Incorporeal before the attack
roll of any melee or ranged attack it makes, until the start of its next activation. (The Furies' ★Attacks are
arcane attacks; see RULINGs.)

## Ability → descriptor / code hook map

Ops and fields from `hooks.ts` (00 §14). `[A1:n]` = the "after the attack is resolved" tier (R7.18 step 16).
Test ids `FAC-CRY-*` are new.

| Ability | Hook point | Descriptor (or code hook) | Test |
|---|---|---|---|
| Dodge | `attack.resolved` [A1:12] | when `{all:[{not:hit}, isEnemy attacker]}`; `{op:'advance', dist:2, direction:'any'}`; optional | FAC-CRY-001 |
| Grappling Hook | `activation.end` | optional, cost 1 focus; `{op:'place', dist:5}` | FAC-CRY-002 |
| Vital Magic | `spell.expire` (proposed additive WindowId; until then code from the effect-expiry path) | code `hook.vitalMagic` (offer keep per spell; d3 damage each) | FAC-CRY-003 |
| Wraithbinder | passive | scope friendly within 10, filter `{test:'hasAbility', value:'incorporeal'}`; `{op:'modStat', stat:'ARM', value:3}` | FAC-CRY-004 |
| Aggressive | passive | code `hook.aggressive` (run/charge focus cost 0, as the 'jack-marshal waiver) | FAC-CRY-005 |
| Soul Taker: Collector | `death.destroyed` | code `hook.soulTaker` (living enemy destroyed within 10 → nearest eligible taker +1 soul, cap 3; not from friendly attacks) | FAC-CRY-006 |
| Shadow Gate | `attack.resolved` [A1:11] | when `{all:[hit, attackKind melee, isEnemy target]}`; cost 1 corpse or soul token; `{op:'place', dist:2}`; once per turn; optional | FAC-CRY-007 |
| Soul Generator | `activation.start` | optional; code `hook.spendTokens` → `{op:'gainFocus', value:n}` (cap 3) | FAC-CRY-008 |
| Soul Phase | `activation.start`, `movement.start`, `combat.choose` (own activation) | optional, cost 1 soul; `{op:'grantAbility', ability:'incorporeal'}` duration turn | FAC-CRY-009 |
| Unstoppable | passive | existing `unstoppable` movement flag | MOVE-0xx |
| Ancillary Attack | `combat.chooseAttack` (★Action) | target friendly cohort RNG 3; `{op:'makeAttack', target:'target', basic:true}` on the cohort, out of its activation; once per turn per target | FAC-CRY-010 |
| Enliven | ★Action + `attack.resolved` | grant effect on cohort (round); when it took damage from an enemy attack: `{op:'advance', dist:'SPD', direction:'any'}` then expire | FAC-CRY-011 |
| Repair [d3+3] | ★Action | target friendly construct RNG 1; `{op:'heal', value:'d3+3'}` | FAC-CRY-012 |
| Exhaust Fumes | `movement.end` (Normal Movement, advanced) | aura 3", other friendly models; grant concealment, duration round | FAC-CRY-013 |
| Magic Ability | passive | ★Attacks/★Actions marked `magic: true` count as a spell cast (Banishing Ward-style immunity, "cast a spell" triggers) | FAC-CRY-014 |
| Marionette | ★Attack (arcane) | arcane attack roll vs DEF, no damage; on hit apply effect (round) to the model/unit; one reroll for a friendly attacker, then expire | FAC-CRY-015 |
| Power of Death | ★Action | aura 10" friendly undead; `{op:'modRoll', roll:'damage', value:2}` melee only, duration turn | FAC-CRY-016 |
| Stygian Abyss | ★Attack (arcane) | POW 12 magical; on crit `{op:'applyCondition', condition:'blind'}` (new condition) | FAC-CRY-017 |
| Mortal Fear | passive | aura 8" living enemies; `{op:'modRoll', roll:'damage', value:-2}` | FAC-CRY-018 |
| AT/Wraith Shot | `attack.declared` | optional, cost 1 soul; `{op:'ignore', ignore:'cover'}`, `concealment`, LOS; `{op:'boost', roll:'any'}` | FAC-CRY-019 |
| Shadow Fire | `attack.hit` | existing code `hook.shadowFire` (Cygnar) | COND-009 |
| Devour Soul | `death.destroyed` | code `hook.devourSoul` (owner picks which Soul Taker gets it; enemies can't take it) | FAC-CRY-020 |
| Critical Knockdown | `attack.crit` | `{op:'knockDown'}` | existing |
| Volume Fire | `attack.beforeRoll` / `damage.beforeRoll` | target base 40: `{op:'modRoll', roll:'any', value:1}`; base ≥50: value 2 | FAC-CRY-021 |
| Critical Corrosion | `attack.crit` | `{op:'applyCondition', condition:'corrosion'}` | existing |
| Critical Shred | `attack.resolved` | existing pattern (`makeAttack` same weapon vs model hit, Combat Action only) | existing |
| Banish | `attack.resolved` [A1:11] | existing Cygnar pattern (Falk) | FAC-CYG-012 |
| Blood Shadow | `death.boxed` | when target living or undead: optional `{op:'grantAbility', ability:'incorporeal'}` duration round | FAC-CRY-022 |
| Blessed | passive (quality) | attacks ignore spell/animus ARM and DEF bonuses | existing quality |
| Feat Wrath of Lyliss | `feat.used` | code `hook.wrathOfLyliss` (round: pay 1 damage instead of a spell's COST, once per spell; pay 1 damage instead of 1 focus to boost) | FAC-CRY-023 |

## Weapons

`AT` = the weapon's Attack Type options. Locations only on Hades.

| id | Weapon | Qty | Type | Stat | RNG | ROF | AOE | POW | Loc | Qualities | Rules (summary) | conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cry.nekane | Rune Thrower | 1 | ranged | RAT 7 | 10 | d3+1 | — | 10 | — | Blessed, Magical, Pistol | Banish (after it damages a non-Leader enemy, move that model anywhere completely within 1") | U-cd |
| cry.nekane | Hellspike | 1 | melee | MAT 6 | 1 | — | — | 12 | — | Magical | Blood Shadow (if it boxes a living or undead model, Nekane may become Incorporeal for a round) | U-cd |
| cry.hades | Soul Cannon | 1 | ranged | RAT 6 | 12 | 1 | 2 | 15 / blast 8 | R | Magical | AT: Wraith Shot (spend a soul: ignore LOS, cover and concealment, attack and damage boosted) / Shadow Fire (the model hit doesn't block LOS for a turn). Devour Soul (living enemies it kills give their soul to a Soul Taker the player picks; enemies never gain these souls) | U-cd |
| cry.hades | Death Claw | 1 | melee | MAT 6 | 1 | — | — | 17 | L | Shield (+2 ARM while L works), Throw PA | — | U-cd |
| cry.hades | Tusks | 1 | melee | MAT 6 | 1 | — | — | 14 | H | — | Critical Knockdown | U-cd |
| cry.chatterbane | Light Spiker | 1 | ranged | RAT 5 | 11 | d3 | — | 11 | — | Pistol, Critical Corrosion | Volume Fire (+1 attack and damage vs 40 mm bases, +2 vs 50 mm and larger) | U-cd |
| cry.chatterbane | Eviscerator | 1 | melee | MAT 5 | 2 | — | — | 13 | — | — | Critical Shred (on a crit in his Combat Action, one more attack with it at the model hit) | U-cd |
| cry.furies (each) | Wraith Strike | 1 | melee | MAT 6 | 1 | — | — | 12 | — | Magical | — | U-cd |

Whether Shadow Fire and Wraith Shot are alternative Attack Types or separate rules is not marked in the data; we
treat Wraith Shot as an optional add-on paid per attack and Shadow Fire as always on (see RULINGs).

## Hades damage grid (heavy, 28 boxes)

From the community data (U-cd, open app check). `·` = hull box, letter = system box. The engine stores the
column strings below (top box first, filled first, R3.4):

| Column | Boxes (top → bottom) | Data string |
|---|---|---|
| 1 | · · L | `--L` |
| 2 | · · L L M | `--LLM` |
| 3 | · · · H M M | `---HMM` |
| 4 | · · · H C C | `---HCC` |
| 5 | · · R R C | `--RRC` |
| 6 | · · R | `--R` |

Column heights 3/5/6/6/5/3 = 28. Systems: L = 3 (C1#3, C2#3, C2#4), M = 3 (C2#5, C3#5, C3#6), H = 2 (C3#4, C4#4),
C = 3 (C4#5, C4#6, C5#5), R = 3 (C5#3, C5#4, C6#3). Unlike Deuce and Razor, Hades **has an H system** (its
Tusks): H crippled = one fewer die on Tusks attack and damage rolls (core `crippleLocation`, H already in
`core/systems.json`). L crippled also drops the Shield bonus.

As a card draws it (columns bottom-aligned, `x` = no box):

| Row | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| 1 | x | x | · | · | x | x |
| 2 | x | · | · | · | · | x |
| 3 | x | · | · | · | · | x |
| 4 | · | L | H | H | R | · |
| 5 | · | L | M | C | R | · |
| 6 | L | M | M | C | C | R |

## Spells (Nekane)

From the community data (U-cd). `OFF` = offensive (needs a magic attack roll).

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Banishing Ward | 2 | 6 | — | — | UP | no | Enemy upkeep spells and animi on the friendly model or unit end; enemy spells and animi can't target it | U-cd |
| Crimson Veil | 2 | 6 | — | — | UP | no | A friendly Cryx model's melee weapons gain Blood Shadow | U-cd |
| Crippling Grasp | 3 | 8 | — | — | UP | yes | The target model or unit has −2 SPD, −2 DEF and −2 ARM, and −2 on its melee damage rolls | U-cd |
| Mirage | 2 | 6 | — | — | UP | no | The friendly Cryx model or unit gains Apparition: in your Control Phase, each model may be placed completely within 2" of where it stands | U-cd |
| Venom | 2 | SP10 | — | 10 | — | yes | A 10" spray of corrosion damage; models hit also suffer the Corrosion continuous effect | U-cd |

Venom is a **spray spell**: the spell schema allows `rng` number/SELF/CTRL only, so it needs `"SP10"` added (see New
mechanics). OFF for Crippling Grasp is our reading (it targets any model/unit, normally an enemy).

## Feat (Nekane): Wrath of Lyliss (U-cd)

Lasts one round:
- Nekane may take 1 damage point instead of paying a spell's COST in focus; each spell can be cast this way once.
- She may also take 1 damage point instead of spending 1 focus to boost an attack or damage roll.

## Data notes
- Ids: `cry.nekane`, `cry.hades`, `cry.chatterbane`, `cry.furies` (unit), `cry.furies-a|b|c` (troopers);
  weapons `cry.w.rune-thrower`, `cry.w.hellspike`, `cry.w.soul-cannon`, `cry.w.death-claw`, `cry.w.tusks`,
  `cry.w.light-spiker`, `cry.w.eviscerator`, `cry.w.wraith-strike`; abilities `cry.a.<kebab name>` (e.g.
  `cry.a.soul-taker-collector`, `cry.a.wraithbinder`, `cry.a.mortal-fear`); spells `cry.s.banishing-ward`,
  `cry.s.crimson-veil`, `cry.s.crippling-grasp`, `cry.s.mirage`, `cry.s.venom`; feat `cry.f.wrath-of-lyliss`;
  list `cry.l.necro-recon`. Shared rules that are not Cryx-only (Incorporeal, Undead, Unstoppable, Dodge, Blessed,
  Critical Knockdown, Critical Corrosion, Critical Shred, Volume Fire, Banish, Shadow Fire) belong in `core.a.*` /
  `core.q.*`. Engine faction file key: `src/engine/factions/cryx.ts`.
- Figure slugs (`figure.slug`): `wm-nekane`, `wm-hades`, `wm-chatterbane`, `wm-furies` (one GLB for all three, as
  wm-black13 and wm-hounds).
- List: `{id:'cry.l.necro-recon', name:'Necrofactorium Command', faction:'cry', level:'recon', points:30,
  leader:'cry.nekane', entries:[{profile:'cry.hades'},{profile:'cry.chatterbane'},{profile:'cry.furies', size:3}]}`.
  No model has Advance Deployment.
- `faction.json`: `{id:'cry', name:'Cryx', short:'Cryx', appVersion:'community', keywords:['necrofactorium'], …}`.

## Palette and marking

Taken from the official paint scheme in the product photo (blue-black armour, yellow-olive armour plates,
acid-green soul glow), as hex values of our own choosing.

| Key | Hex | Use |
|---|---|---|
| primary | `#1f3a42` | blue-black armour plates and robes |
| secondary | `#a7a443` | yellow-olive trim plates and horns |
| metal | `#7f8b90` | gunmetal pistons, chains, claws |
| base | `#4a3a2e` | dark earth with dead grass |
| ui | `#7ad13a` | soul-light green for the HUD side colour |

`sourceHues`: **[192, 60]** (the teal-black armour band and the olive plate band the hue-band shader remaps; the
green glow near 100° is left alone as an emissive).

Marking name for the army painter: **`grave-lantern`** (an original sigil: a hooded lantern with three teardrop
flames; no SFG iconography).

## New mechanics needed

Per STATUS.md the engine runs the Cygnar and Khador starters only; none of these exist today.

| Mechanic | Used by | Sketch |
|---|---|---|
| Soul and corpse tokens | Hades (Collector, Shadow Gate, Soul Generator, Soul Phase, Wraith Shot, Devour Soul) | `ModelState.tokens:{soul,corpse}` (additive type change) + `death.destroyed` hook: living enemy destroyed → nearest eligible Soul Taker in range with room gains 1 (RB p97); no tokens from friendly-attack deaths; new events `tokenGained/tokenSpent` |
| Living / undead / construct tags | Soul Taker, Mortal Fear, Power of Death, Blood Shadow, Decrepitation | derive `living` = not construct and not undead from advantages; a `{test:'living'}`/`{test:'undead'}` condition |
| Incorporeal | Furies, Hades (Soul Phase), Nekane (Blood Shadow) | ability flag read by LOS (not intervening), movement (pass through obstructions/models, `unstoppable`), damage (immune to non-magical and continuous effects), push/slam/throw (immune); lose it before any melee/ranged attack roll until next activation start; grantable for a duration |
| Arcane ★Attacks on non-casters | Furies (Marionette, Stygian Abyss) | ★Attack spec with `aat:true, rng:10, pow?` resolved through the spell's arcane attack path using the trooper's AAT; `magic: true` marks it as casting a spell |
| ★Actions targeting friendlies | Chatterbane (Ancillary Attack, Enliven, Repair) | a `specialAction` with `rng` and target filter; Ancillary Attack makes the target attack out of its own activation (reuse the Reciprocate `makeAttack` path) |
| Blind condition | Stygian Abyss | new `StoredConditionId 'blind'` (additive): no ranged/magic attacks, −4 MAT/DEF, no run/charge/slam/trample, forfeit Normal Movement or Combat Action next activation, shakeable |
| Spray spells | Venom | allow `rng:"SP<n>"` in the spell schema; route through the existing spray geometry with the caster's AAT |
| Token-cost and HP-cost payments | Shadow Gate, Soul Phase, Wraith Shot, Wrath of Lyliss, Vital Magic | generalise ability `cost` to `{focus?, soul?, corpse?, damage?}`; the payment step deducts or deals damage (damage payment can box the caster) |
| Upkeep-expiry window | Vital Magic, Banishing Ward | a new `spell.expire` WindowId (additive change to frozen `types.ts`, needs a 00 §14 entry) raised before an upkeep spell is removed by an effect (not by the caster dropping it) |
| Apparition | Mirage | `control.upkeep`-time step: each affected model may be placed within 2" (place, not advance) |
| Spell / animus immunity | Banishing Ward, Magic Ability | `{op:'forbid', what:'beTargeted'}` filtered to enemy spells; also strips enemy upkeeps on cast |
| Concealment aura | Exhaust Fumes | round-long aura effect that LOS reads as concealment for friendly models within 3" |
| Free run/charge for a warjack | Aggressive | reuse the focus-cost waiver used for 'jack marshals |
| Volume Fire, Critical Shred, Critical Corrosion | Chatterbane | base-size-scaled roll mod; crit-triggered extra attack (as Critical Shred patterns); crit applies existing `corrosion` |
| Same-name non-stacking | Mortal Fear, Power of Death | enforce "effects with the same name don't stack" (RB p10) in `query.stat` and roll mods if not already done |

## Needs rules check

- RULING: starter box choice | Cryx uses the Necrofactorium Command Starter as-is (Nekane, Hades, Chatterbane, The Furies; 0+16+4+10 = 30) | it is the official 30-point MK4 Cryx starter and already matches the leader / heavy / solo / 3-model unit shape
- RULING: base sizes | Nekane 30 mm, Hades 50 mm, Chatterbane 40 mm, each Fury 40 mm | the community data has no bases; sizes estimated from the official group photo against a 50 mm heavy base
- RULING: Furies health | 5 boxes per Fury | the community data omits it; 5 matches the other starter character troopers until the app check
- RULING: Furies trooper names | `Fury I/II/III` shipNames, one shared profile | the data gives no individual names or profiles
- RULING: one-per-unit (•) ★Attacks and ★Actions | only one Fury per unit activation may use each of Marionette, Power of Death and Stygian Abyss | the • marker in MK4 limits a rule to one model in the unit per activation
- RULING: Furies attacking and Incorporeal | a Fury making a ★Attack (arcane) keeps Incorporeal; making a Wraith Strike melee attack loses it until its next activation | RB p113 strips Incorporeal only for melee or ranged attacks
- RULING: Wraith Shot and Shadow Fire | Wraith Shot is an optional soul-paid add-on per Soul Cannon attack; Shadow Fire always applies | the data lists both as weapon abilities, not as an AT choice
- RULING: Wraith Shot "ignores LOS" | the shot still needs range and a legal target, but no LOS, cover or concealment | the rule removes those three checks only
- RULING: Soul Cannon AOE | stored as `aoe: 2`, `pow: 15`, `blastPow: 8` | the data gives "AOE 2, POW 15/8" with the same AOE scale as the Cygnar Blast AT
- RULING: Crippling Grasp offensive | `offensive: true` | it targets any model/unit and debuffs; friendly use is pointless
- RULING: Mortal Fear stacking | three Furies still give −2 total | same-name effects are not cumulative (RB p10)
- RULING: Shadow Gate token type | Hades may pay with a soul token; it has no way to collect corpse tokens in this list | Collector only gathers souls
- RULING: Wrath of Lyliss spell payment | each distinct spell once per feat round may be paid with 1 damage; upkeeps paid in Maintenance are unaffected | the feat speaks of casting, not upkeep
- RULING: Aggressive | Hades runs and charges for 0 focus with or without a marshal | the rule waives the MK4 1-focus run/charge cost directly
- RULING: Venom range | `SP10` spray from Nekane, using her AAT 7 for each model in the spray | spells use AAT for magic attacks
- RULING: app check open | every card value stays U-cd | the steamforged.com page was rate-limited and the data's app version is unknown
