# Faction: Cryx (Necrofactorium) — Recon starter

- **Sources:** listed as S1..S7 in `cryx-sources.md` (researched 2026-10-07). S1 is the community dump of the
  official app's card data (July 2026); S2 is the Warmachine Academy wiki (2026 revisions); S3 and S5 are the
  official store pages on warmachine.gg; S7 is the MK4 rulebook for core rules (RB pN).
- **Confidence key:**
  - `S1+S2` (or more tags): two independent sources agree; data may rely on it;
  - `S1` or `S2` alone: one source shows it and nothing contradicts it;
  - `U-cd`: no source showed it; listed in `cryx-sources.md` with what was tried;
  - `ours`: a ruling, not a card value.
- Earlier versions of this file marked every card value `U-cd` (community data only, app check pending). The
  2026-10-07 audit replaced those tags; no card value is left `U-cd`.
- All prose is ours. Names are real (Mallet posture). UI names come from `shipName`.

## Chosen box

**Cryx Necrofactorium Command Starter** (SFG, SKU SFIK-CRX055, released with the Necrofactorium wave, pre-orders
Jul–Aug 2024; still in stock on warmachine.gg, S3). The store calls it a 30-point force and lists exactly: Wraithbinder Nekane
(warcaster), Hades (character warjack), Master Necrotech Chatterbane (character solo), The Furies (unit of three
character models). This is the same shape as the Cygnar and Khador Recon starters, so no trimming is needed.

RULING: starter box choice | Cryx uses the Necrofactorium Command Starter as-is (Nekane, Hades, Chatterbane, The Furies; 0+16+4+10 = 30) | it is the official 30-point MK4 Cryx starter (S3, in stock 2026-10-07) and already matches the leader / heavy / solo / 3-model unit shape; the newer Wraithbinder's Host army box (S5) is larger than 30 points and drops Chatterbane, and the Boneyard Keeper command set (S5) has models no source gives cards for

## Roster (30 points)

| id | Source model | shipName | Type | Pts | Base | Boxes | conf |
|---|---|---|---|---|---|---|---|
| cry.nekane | Wraithbinder Nekane | Nekane | Leader (warcaster), living | 0 | 30 | 16 | pts, boxes S1+S2+S4; base S2+S6 |
| cry.hades | Hades | Hades | Heavy war-engine (warjack), character, construct | 16 | 50 | grid 28 | pts, health S1+S2+S4; grid layout S1; base S2 (Heavy Warjack) |
| cry.chatterbane | Master Necrotech Chatterbane | Chatterbane | Solo, character, undead | 4 | **50** | 10 | pts, boxes S1+S2+S4; base S2 (Large Base; was a 40 mm photo guess) |
| cry.furies | The Furies | Furies | Unit, 3 character troopers, undead, Incorporeal, Wraith | 10 | 40 | **8** per trooper | pts S1+S2+S4; base S2 (Medium Base); boxes S2 (was a 5-box guess) |

Points: 0 + 16 + 4 + 10 = **30** (S1+S2+S4). Recon needs at least one non-lesser cohort: Hades.

The Furies troopers share one profile (S1, S2). S2 names them **Anathan**, **Dogreth** and **Valak**; the ids stay
`cry.furies-a`, `cry.furies-b`, `cry.furies-c` (figure slugs depend on them). The trooper letters follow the product
photo: **a** = the open-armed wraith at the left, **b** = the upright wraith at the back right with arms raised,
**c** = the front-right wraith with arms spread low. Which sculpt carries which name is our pick (a Anathan, b Dogreth,
c Valak): no source ties a name to a sculpt.

Bases (S2 base templates; S7 p71): Nekane small 30 mm, each Fury medium 40 mm, Chatterbane large 50 mm, Hades 50 mm
as every heavy warjack. The old photo estimate (Chatterbane 40 mm) was wrong; a product photo is a composite and
can't fix scale.

## Stat lines

| id | SPD | AAT | MAT | RAT | DEF | ARM | ARC | CTRL | conf |
|---|---|---|---|---|---|---|---|---|---|
| cry.nekane | 7 | 7 | 6 | 7 | 16 | 15 | 6 | 12 | S1+S2 |
| cry.hades | 6 | — | 6 | 6 | 13 | 18 | — | — | S1+S2 |
| cry.chatterbane | 6 | — | 5 | 5 | 13 | 17 | — | — | S1+S2 |
| cry.furies (each) | 6 | 7 | 6 | — | 14 | 14 | — | — | S1+S2 |

- A missing stat is stored as 0 (as Caine's MAT): Hades and Chatterbane have no AAT, the Furies have no ranged
  weapon so RAT 0.
- Hades' ARM is 20 while its Death Claw system (L) works: **Shield** adds +2 ARM (S1+S2; quality RB p18).
- Incorporeal models within 10" of Nekane get +3 ARM (**Wraithbinder**): the Furies stand at ARM 17 near her, and
  Hades too while Soul Phase makes it Incorporeal.
- Warcaster and warjack basics are the standard ones: Nekane refills focus to ARC 6, Hades powers up for 1 in her
  CTRL and holds at most 3 focus. Hades' **Soul Generator** can add focus from soul tokens at activation start, still
  capped at 3.

## Advantages and abilities (our summaries)

| id | Advantages | Abilities | conf |
|---|---|---|---|
| cry.nekane | Dual Attack, Pathfinder | **Dodge**: after an enemy attack misses her, she may advance up to 2". **Grappling Hook**: at the end of her activation she may pay 1 focus to be placed anywhere completely within 5". **Vital Magic**: when something would end her upkeep spells, she may keep any of them by taking d3 damage per spell kept. **Wraithbinder**: friendly Incorporeal models within 10" get +3 ARM | S1+S2 |
| cry.hades | Construct, Dual Attack, Headbutt, Slam, Trample, Unstoppable | **Aggressive**: runs and charges cost it no focus. **Soul Taker: Collector**: holds up to 3 soul tokens, gaining one when a living enemy is destroyed within 10" (nearest eligible taker wins, RB p97); it spends them on the three rules below. **Shadow Gate**: once per turn, right after it hits an enemy with a melee attack in its activation, spend 1 corpse or soul token to be placed completely within 2". **Soul Generator**: at the start of its activation, spend soul tokens for 1 focus each. **Soul Phase**: at any point in its activation, spend a soul token to become Incorporeal for one turn (we offer it at activation start) | S1+S2; Dual Attack S1 only; token rules RB p97 |
| cry.chatterbane | Dual Attack, Pathfinder, Undead | **Ancillary Attack** (★Action, RNG 3): a friendly Cryx cohort in range immediately makes one basic melee or ranged attack; each model at most once per turn. **Enliven** (★Action, RNG 3): for one round, the next time the friendly Cryx cohort takes damage from an enemy attack it may make a full advance after the attack, then Enliven ends. **Repair [d3+3]** (★Action, RNG 1): remove d3+3 damage from a friendly Cryx construct. **Exhaust Fumes**: when he advances in his Normal Movement, other friendly models within 3" of him have concealment for one round | S1+S2 |
| cry.furies | Incorporeal, Undead | **Magic Ability**: their ★Attacks and ★Actions count as casting a spell. **Marionette** (★Attack, arcane, RNG 10, no damage): for one round, the Furies' player may force one affected enemy model to reroll one of its own attack or damage rolls, then Marionette ends (corrected 2026-10-07: it hampers the enemy, it does not help a friendly attacker). **Power of Death** (★Action): for one turn, friendly undead models within 10" of this Fury get +2 on melee damage rolls. **Stygian Abyss** (★Attack, arcane, RNG 10, POW 12): a critical hit makes the target Blind for one round. **Mortal Fear**: living enemy models within 8" take −2 on damage rolls | S1+S2 |

Keywords: every model is Cryx and Necrofactorium; the Furies are also Wraith; Nekane carries the Scout keyword (S1, S2;
no rule attached). "Faction cohort" in Chatterbane's actions means a Cryx war-engine (Hades).

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
| Marionette | ★Attack (arcane) | arcane attack roll vs DEF, no damage; on hit apply effect (round) to the model/unit; the Furies' player may make one affected enemy model reroll one of its own attack or damage rolls, then expire (not offered yet: no reroll engine) | FAC-CRY-015 |
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
| cry.nekane | Rune Thrower | 1 | ranged | RAT 7 | 10 | d3+1 | — | 10 | — | Blessed, Magical, Pistol | Banish (after it damages a non-Leader enemy, move that model anywhere completely within 1") | S1+S2 |
| cry.nekane | Hellspike | 1 | melee | MAT 6 | 1 | — | — | 12 | — | Magical | Blood Shadow (if it boxes a living or undead model, Nekane may become Incorporeal for a round) | S1+S2 |
| cry.hades | Soul Cannon | 1 | ranged | RAT 6 | 12 | 1 | 2 | 15 / blast 8 | R | Magical | AT: Wraith Shot (spend a soul: ignore LOS, cover and concealment, attack and damage boosted) / Shadow Fire (the model hit doesn't block LOS for a turn). Devour Soul (living enemies it kills give their soul to a Soul Taker the player picks; enemies never gain these souls) | S1+S2 |
| cry.hades | Death Claw | 1 | melee | MAT 6 | 1 | — | — | 17 | L | Shield (+2 ARM while L works), Throw PA | — | S1+S2 |
| cry.hades | Tusks | 1 | melee | MAT 6 | 1 | — | — | 14 | H | — | Critical Knockdown | S1+S2 |
| cry.chatterbane | Light Spiker | 1 | ranged | RAT 5 | 11 | d3 | — | 11 | — | Pistol, Critical Corrosion | Volume Fire (+1 attack and damage vs 40 mm bases, +2 vs 50 mm and larger) | S1+S2 |
| cry.chatterbane | Eviscerator | 1 | melee | MAT 5 | 2 | — | — | 13 | — | — | Critical Shred (on a crit in his Combat Action, one more attack with it at the model hit) | S1+S2 |
| cry.furies (each) | Wraith Strike | 1 | melee | MAT 6 | 1 | — | — | 12 | — | Magical | — | S1+S2 |

Whether Shadow Fire and Wraith Shot are alternative Attack Types or separate rules is not marked in the data; we
treat Wraith Shot as an optional add-on paid per attack and Shadow Fire as always on (see RULINGs).

## Hades damage grid (heavy, 28 boxes)

From S1 only (the app data dump; S2 gives the 28 boxes but no layout). `·` = hull box, letter = system box. The engine stores the
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

COST, RNG, AOE, POW and DUR from S1 and S2; OFF from S2. `OFF` = offensive (needs a magic attack roll).

| Spell | COST | RNG | AOE | POW | DUR | OFF | Effect (our words) | conf |
|---|---|---|---|---|---|---|---|---|
| Banishing Ward | 2 | 6 | — | — | UP | no | Enemy upkeep spells and animi on the friendly model or unit end; enemy spells and animi can't target it | S1+S2 (OFF: S2) |
| Crimson Veil | 2 | 6 | — | — | UP | no | A friendly Cryx model's melee weapons gain Blood Shadow | S1+S2 (OFF: S2) |
| Crippling Grasp | 3 | 8 | — | — | UP | yes | The target enemy model or unit has −2 SPD, −2 DEF and −2 ARM, and −2 on its melee damage rolls | S1+S2 (OFF: S2) |
| Mirage | 2 | 6 | — | — | UP | no | The friendly Cryx model or unit gains Apparition: in your Control Phase, each model may be placed completely within 2" of where it stands | S1+S2 (OFF: S2) |
| Venom | 2 | SP10 | — | 10 | — | yes | A 10" spray of corrosion damage; models hit also suffer the Corrosion continuous effect | S1+S2 (OFF: S2) |

Venom is a **spray spell**: the spell schema allows `rng` number/SELF/CTRL only, so it needs `"SP10"` added (see New
mechanics). S2 marks Crippling Grasp OFF yes and its target as an enemy model or unit.

## Feat (Nekane): Wrath of Lyliss (S1+S2+S6)

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
- RULING: base sizes | Nekane 30 mm, Hades 50 mm, Chatterbane 50 mm, each Fury 40 mm | Warmachine Academy base templates (S2: small, heavy warjack, large, medium); Nekane also S6. Replaces the 2026-10-06 photo estimate (Chatterbane 40)
- RULING: Furies health | 8 boxes per Fury | Warmachine Academy (S2) gives 8; the app data dump (S1) has no unit health field. Replaces the 5-box guess
- RULING: Furies trooper names | Anathan, Dogreth, Valak (S2) on troopers a, b, c; one shared profile | S2 names the three; no source ties a name to a sculpt, so the order is ours
- RULING: one-per-unit (•) ★Attacks and ★Actions | only one Fury per unit activation may use each of Marionette, Power of Death and Stygian Abyss | the • marker in MK4 limits a rule to one model in the unit per activation
- RULING: Furies attacking and Incorporeal | a Fury making a ★Attack (arcane) keeps Incorporeal; making a Wraith Strike melee attack loses it until its next activation | RB p113 strips Incorporeal only for melee or ranged attacks
- RULING: Wraith Shot and Shadow Fire | Wraith Shot is an optional soul-paid add-on per Soul Cannon attack; Shadow Fire always applies | the data lists both as weapon abilities, not as an AT choice
- RULING: Wraith Shot "ignores LOS" | the shot still needs range and a legal target, but no LOS, cover or concealment | the rule removes those three checks only
- RULING: Soul Cannon AOE | stored as `aoe: 2`, `pow: 15`, `blastPow: 8` | the data gives "AOE 2, POW 15/8" with the same AOE scale as the Cygnar Blast AT
- RULING: Crippling Grasp offensive | `offensive: true`, enemy targets only | confirmed: S2 lists OFF yes and an enemy target
- RULING: Mortal Fear stacking | three Furies still give −2 total | same-name effects are not cumulative (RB p10)
- RULING: Shadow Gate token type | Hades may pay with a soul token; it has no way to collect corpse tokens in this list | Collector only gathers souls
- RULING: Wrath of Lyliss spell payment | each distinct spell once per feat round may be paid with 1 damage; upkeeps paid in Maintenance are unaffected | the feat speaks of casting, not upkeep
- RULING: Aggressive | Hades runs and charges for 0 focus with or without a marshal | the rule waives the MK4 1-focus run/charge cost directly
- RULING: Venom range | `SP10` spray from Nekane, using her AAT 7 for each model in the spray | spells use AAT for magic attacks
- RULING: card values checked | every card value carries a source tag (cryx-sources.md); single-source values: Hades grid layout and Dual Attack (S1), Chatterbane base, Fury health and names (S2) | 2026-10-07 web audit; the official app itself was not read
- RULING: Nekane spell rack | not modelled: she casts only her five card spells | MK4 lets a warcaster rack extra army spells (RB p101), but no reliable source gives her rack slot count (S6 says 3 on a copied entry) and the starter is played without racks, as the Quick Start does
- RULING: Marionette | the Furies' player makes one affected enemy model reroll one of its own attack or damage rolls; still not offered (no reroll engine) | S1 and S2 word it that way; the 2026-10-06 text had it helping a friendly attacker

## Skirmish (50 points): WP-D-cry (2026-10-07)

List `cry.l.skirmish` ("Necrofactorium Skirmish", level `skirmish`, leader Nekane) is the Recon starter plus the three add-ons Nekane players
field most (90-skirmish.md B.5). Costs recomputed from the data: 0 + 16 + 4 + 10 + **10 + 6 + 4** = **50**.

| Entry | Pts | Notes |
|---|---|---|
| Wraithbinder Nekane | 0 | unchanged |
| Hades | 16 | unchanged |
| Master Necrotech Chatterbane | 4 | unchanged |
| The Furies (3) | 10 | unchanged |
| **Night Terrors** (3) `cry.night-terrors` | 10 | new, FA 2 |
| **Raptor** (Doomspitter head, Arc Node back) `cry.raptor-arc` | 6 | new, FA 6; fixed-loadout profile (head 4 + back 2; chassis 0) |
| **Necrosurgeon Initiates** (3) `cry.initiates` | 4 | new, FA 4 |

Non-lesser Cohort: Hades and the Raptor. Weapon qty and loadout are on the profiles; the list entry has no `loadout` (90 A.2).

### Card values and confidence

Tags: S1 community dump of the app's data (isorna/wardice-warmachine-data, July 2026), S2 Warmachine Academy wiki, S4 Asmoridin's
list data, S8 Wargamer's Cryx preview (2024, pre-release), S9 Steamforged and retailer pages (names, box contents only). The official
app itself was not read; no free card PDF exists for these three models.

| Model | SPD | MAT | RAT | DEF | ARM | Health | Base | FA | conf |
|---|---|---|---|---|---|---|---|---|---|
| Night Terror (x3) | 7 | 6 | - | 14 | 16 | 5 each | 50 | 2 | stats, weapons, abilities S1+S2; 50 mm S2+S8; 5 boxes S2 only; FA S1+S4 (S2 says 3) |
| Necrosurgeon Initiate (x3) | 6 | 4 | - | 14 | 12 | 1 each | 30 | 4 | stats, weapon, abilities S1+S2; base and 1 box S2 only |
| Raptor | 7 | 5 | 5 | 14 | 14 | 20-box grid | 40 | 6 | stats S1+S2; grid letters S1 only; light-warjack base S2 template; hardpoint costs S1+S2+S4 |

- Night Terror weapon: **Scything Blade** x2, MAT 6, RNG 1, POW 12, magical (S1+S2). The 2024 preview (S8) quoted MAT 7; both current
  sources say 6, so 6 stands. Abilities (S1+S2): Incorporeal, Unstoppable, Undead, Cavalry, Apparition, Finisher, Reposition [3"].
- Initiate weapon: **Implement of Death**, MAT 4, RNG 1, POW 11. Abilities (S1+S2): Undead, Anatomical Precision, Grim Returns,
  Magic Ability, Empower, Necrosurgery [d3+1].
- Raptor chassis abilities (S1+S2): Light Warjack (Construct, Headbutt, Slam), Pathfinder, Dodge. **Doomspitter** (head, 4 points):
  RAT 5, RNG 8, ROF 1, AOE 2, POW 14/8, location H, and it grants Eyeless Sight (S1+S2). **Arc Node** (back, 2 points). Other
  options on the chassis (Deathripper 3, Beaked Maw 3, Venom Blaster 4; Heavy Armor 2, Light Spiker 4, Necrovent 3) are not in the list.
- Raptor grid, columns top box first (S1): `-CC`, `-HC`, `--HC`, `--HM`, `-HM`, `-MM`: 4 Cortex, 4 Head, 4 Movement, 8 blank boxes.
  There is no Arc Node box: S2 notes that MK4 offers no way to cripple the node.
- A Raptor with the Doomspitter has no melee weapon (the Deathripper and Beaked Maw heads bring one).

### Rules we wrote (own words)

| Rule | What it does here | Where |
|---|---|---|
| Cavalry | the attack roll of this model's charge attack is boosted for free (charge damage is boosted by the core charge rule already) | `cry.a.cavalry` + code `cryCavalry` at `attack.declared`, `when: charged`; FAC-CRY-045 |
| Finisher | one extra damage die against a model with any damage marked | `cry.a.finisher` (coreFlag `finisher`) + attack plugin `damageDice`; FAC-CRY-046 |
| Anatomical Precision | a melee damage roll that fails to beat a living model's ARM still deals 1; a model its melee attack disables gets no Tough roll | `cry.a.anatomical-precision`: `attack.hit` forbid tough, plugin `adjustPoints`; FAC-CRY-047 |
| Empower (star Action, 6", one per unit activation) | a friendly Cryx warjack loses Disruption and gains 1 focus (cap 3) | `cry.a.empower` + code `cryEmpower`; FAC-CRY-048, 049 |
| Necrosurgery [d3+1] (star Action, 1") | removes d3+1 damage from a friendly undead Cryx model | `cry.a.necrosurgery` reuses code `repair` with `kind: undead`; FAC-CRY-050 |
| Grim Returns (star Action, 5") | a destroyed Grunt of the chosen Grunt's unit returns within 2" with one box unmarked and gives up Normal Movement and Combat Action that turn | `cry.a.grim-returns` + code `cryGrimReturns`; FAC-CRY-051, 052 |
| Eyeless Sight | sees through clouds, ignores concealment and Stealth | `cry.a.eyeless-sight` (three `ignore` ops) |
| Arc Node | carries the flag `arcNode` (see below) | `cry.a.arc-node`, profile `arcNode: true` |
| Apparition, Reposition, Unstoppable, Incorporeal, Dodge | existing records reused (`cry.a.apparition`, `core.a.reposition`, `core.a.unstoppable`, `cry.a.incorporeal`, `cry.a.dodge`) | |

Grim Returns on a Night Terror brings it back Incorporeal (the ability is on its profile). Wraithbinder gives the Night Terrors +3 ARM
within 10" of Nekane while they are Incorporeal, through the existing aura.

### Open points handed to other packages

- **Arc Node channelling is not live.** `spells.ts` looks for the ability id `core.a.arc-node`, which `core/abilities.json` does not define, so
  the profile carries `cry.a.arc-node` (a `coreFlag arcNode`). WP-CORE: add `core.a.arc-node`, put it in `cry.raptor-arc` abilities, drop `cry.a.arc-node`.
- **Targeted star Actions use a marker.** `needsTarget` in `phases/activation.ts` is true only for makeAttack, advance and `repair`; Empower
  and Grim Returns carry a no-op `{op: 'advance', dist: 0}` node so core offers a chosen friendly target, then run their code hook. Replace
  with a real "targeted" notion when core is next touched. Grim Returns is offered even when the unit has no destroyed Grunt (harmless).
- **Headbutt needs a melee weapon.** `combatChoices` offers Headbutt only when the model has a melee weapon, so the Doomspitter Raptor has none.
- **sim invariant.** `tools/sim.ts` flags `destroyed -> active`; Grim Returns emits `LifeStateChanged` with `cause: 'cry.a.grim-returns'` and must be allowed.
- Faction `conditions` in a registry are not read by `evalCond` (only core code conditions are), so Finisher is a plugin and not a `when: {code}`.
- Figures are not made: slugs `wm-night-terror`, `wm-initiate`, `wm-raptor` (procedural stand-ins draw until WP-FIG).

### Sources used (Skirmish pass)

- https://github.com/isorna/wardice-warmachine-data (`mk4/profiles/cryx.necrofactorium.profiles.json`, last change 2026-07-10, "app data dump"): stats, FA, weapons, abilities, Raptor grid and hardpoint costs (S1).
- https://warmachineacademy.miraheze.org/wiki/Night_Terrors (rev 2026-04-13), /wiki/Raptor (2026-01-22), /wiki/Necrosurgeon_Initiates (2026-04-13) and the rule templates Cavalry, Finisher, Eyeless Sight, Reposition, Apparition, Grim Returns, Empower, Necrosurgery, Anatomical Precision, Dodge, Arc Node, Large, Medium, Small Base, Light Warjack, via `/w/api.php?action=query&prop=revisions` (S2).
- https://github.com/Asmoridin/minis_games (`Warmachine/Data/Warmachine MKIV Data.txt`, 2026-04-07): points and FA (Night Terrors 10 / FA 2, Initiates 4 / FA 4, Raptor FA 6) (S4).
- https://www.wargamer.com/warmachine/cryx-iron-liche-and-night-terrors: Night Terrors 50 mm bases, 10 points, ability names; its MAT 7 is a pre-release value (S8).
- Longshanks list scan in `90-skirmish-sources.md` section 2 (Raptor, Night Terrors and Initiates in 20, 18 and 16 of 21 Nekane lists; the 50-point list `[LS-36739]`).
- Tried, no card values: steamforged.com blog and product pages (HTTP 429), brueckenkopf-online.com rules preview (no stat lines), web searches for review text.

### Needs rules check (Skirmish)

See the `RULING:` lines for WP-D-cry in `docs/needs-rules-check.md` (M12 Skirmish section).
