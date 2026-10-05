# 13 Golden replay: the Quick Start worked turns (GOLD-001)

The Quick Start guide (Jul 2025, printed pp35–47) walks through round 1 and the first half of
Khador's round-2 turn with every die printed. This file turns that walkthrough into a script a test can
replay: a fixed setup, then each decision in order with the forced dice and the expected results.
The fixture `tests/fixtures/qs-turn1.json` (60 §4) is built from it.

The QS prints no coordinates. Every position here was read off the QS diagrams (pp35–47) and then
adjusted, where needed, so that each fact the text states (who is in range, behind which wall, inside
which cloud, which models a blast hits) holds under our rules. Section 6 lists the checked distances.
Values the QS doesn't give are marked **ASSUMED**; anything else is printed in the QS.

## 1. Frame and conventions

- **Units and axes:** inches. The origin is the table centre. `x` runs to the first player's right.
  The forward axis runs from Khador's back edge (−18) to Cygnar's back edge (+18). In engine data it is
  `z` (`Vec2 {x, z}`, +z toward player B; 3D `y` is height), so this file writes positions as
  `(x, z)`. A brief that says "y = forward" means this `z`.
- **Bases:** 30 mm r = 0.5906", 40 mm r = 0.7874", 50 mm r = 0.9843".
- **Distances** are base edge to base edge (10 R1). "B2B" means a gap ≤ 0.01".
- **Tolerance:** derived positions (pushes, follow-ups, Avenging Force, charge) are given to 4
  decimals; compare at ±0.01".
- **Dice:** `dice` lists the forced d6 faces in the order the engine consumes them: the base dice
  first, then each added die (boost, Weapon Master, Brutal Damage, Decrepitation) in the order printed.
  A d3 is `ceil(d6 / 2)`. A crippled weapon system rolls one die fewer before any additions.
- **Model ids:** `kha.vilkul`, `kha.razor`, `kha.lazarenko`, `kha.hounds.{tererya,fedyniak,skrobala}`,
  `cyg.caine`, `cyg.deuce`, `cyg.falk`, `cyg.black13.{ryan,glover,watts}`.

## 2. Setup

- Scenario `scn-qs-demo` (11 S2, layout of S1), bundle `qs-2025`. Khador = player A = first player
  (back edge z = −18); Cygnar = player B = second (back edge z = +18). No roll-off, no command cards.
- Terrain (11 S1):

| id | Kind | Centre | Footprint |
|---|---|---|---|
| W1 | Khador's wall, obstacle, scenario terrain | (−6, −4) | x ∈ [−8, −4], z ∈ [−4.375, −3.625], 0.75" tall |
| W2 | Cygnar's wall, obstacle, scenario terrain | (6, 4) | x ∈ [4, 8], z ∈ [3.625, 4.375], 0.75" tall |
| P1 | Khador's pond, shallow water | (3.25, −2) | capsule 3.5"×2", axis (1, 1): core segment (2.7197, −2.5303)–(3.7803, −1.4697), radius 1 |
| P2 | Cygnar's pond, shallow water | (−3.25, 2) | capsule 3.5"×2", axis (1, 1): core segment (−3.7803, 1.4697)–(−2.7197, 2.5303), radius 1 |

### Deployment (QS p35)

Khador deploys completely within 6" (z ≤ −12), then Cygnar completely within 11" (z ≥ 7). Then
Lazarenko advance-deploys completely within 9" (z ≤ −9), then Falk completely within 14" (z ≥ 4).

| Order | Model | Base | Position | Note |
|---|---|---|---|---|
| 1 | kha.hounds.tererya | 30 | (−5.9, −12.7) | trooper order in the row ASSUMED |
| 1 | kha.hounds.fedyniak | 30 | (−4.6, −12.7) | |
| 1 | kha.hounds.skrobala | 30 | (−3.3, −12.7) | |
| 1 | kha.vilkul | 30 | (−1.8, −12.7) | |
| 1 | kha.razor | 50 | (0.1, −13.1) | |
| 2 | cyg.deuce | 50 | (0.1, 8.1) | |
| 2 | cyg.caine | 30 | (1.9, 7.7) | |
| 2 | cyg.black13.ryan | 30 | (3.4, 7.7) | trooper order in the row ASSUMED |
| 2 | cyg.black13.glover | 30 | (4.75, 7.7) | |
| 2 | cyg.black13.watts | 30 | (6.05, 7.7) | |
| 3 | kha.lazarenko | 40 | (2.1, −9.9) | Advance Deployment |
| 4 | cyg.falk | 30 | (−1.8, 4.7) | Advance Deployment |
| 5 | Prey | — | the Black 13th choose **kha.razor** | QS p43 |

Start state: VP 0–0, no focus anywhere, no damage.

## 3. Script

Each step is one decision (or one automatic phase step) with the expected result. `focus` shows
`before→after`. Damage boxes use `C<col>#<n>` = the n-th box of that column from its top box
(grid in `factions/khador.md`).

```yaml
round1_khador:            # QS pp36–39
  - step: K1.control
    expect:
      focus: {kha.vilkul: 0→6, kha.razor: 0→1}   # refill to ARC 6; Power Up (Razor 0.367" from Vilkul)
      allocate: {}                               # Vilkul keeps all 6
  - step: K1.vilkul
    actions:
      - useFeat: {featId: pall-of-ashes}
        dice: [1]                                 # ASSUMED d6 = 1 (QS prints only "d3 = 1")
        expect: {d3: 1, clouds: 4, duration: until the start of Khador's next turn}
      - placeClouds:                              # 3" clouds, each completely within CTRL 12 from her base edge
          C1: (-6.2, -2.6)
          C2: (-3.3, -1.8)
          C3: (-0.3, -1.8)
          C4: (2.6, -2.6)
      - castSpell: {spellId: superiority, targetId: kha.razor}
        expect: {focus: {kha.vilkul: 6→4}, razor: {SPD: 7, MAT: 8, DEF: 13, knockdownImmune: true}}
      - castSpell: {spellId: avenging-force, targetId: kha.razor}
        expect: {focus: {kha.vilkul: 4→2}}
      - chooseMovement: run                       # 7 + 5 = 12"; activation ends after the move
      - moveModel: {path: [(-1.8, -12.7), (-4.3, -5.0)]}      # 8.096"
        expect: {coverFromW1: true, withinW1: 0.034}
  - step: K1.razor
    actions:
      - chooseMovement: run                       # costs 1 focus; 5 + 2 + 5 = 12"
        expect: {focus: {kha.razor: 1→0}}
      - moveModel: {path: [(0.1, -13.1), (-1.75, -4.0)]}      # 9.286"; stops just short of C3 (0.15")
        expect: {inCloud: false, coverFromW1: false, withinW1: 1.266}
  - step: K1.hounds
    actions:
      - chooseMovement: {option: run, modelId: kha.hounds.fedyniak}    # 6 + 5 = 11"
      - moveModel: {modelId: kha.hounds.fedyniak, path: [(-4.6, -12.7), (-5.49, -6.5), (-5.49, -5.0)]}  # 7.764"; B2B Vilkul
      - placeTroopers:
          kha.hounds.tererya: (-6.68, -5.0)       # B2B fedyniak
          kha.hounds.skrobala: (-7.87, -5.0)      # B2B tererya, 1.199" from fedyniak (≤ 2")
        expect:
          shieldWall: {ARM: 17, knockdownImmune: true}          # every Hound
          girded: [Hounds, kha.vilkul]                          # Resistance: Blast
          coverFromW1: [Hounds]
  - step: K1.lazarenko
    actions:
      - chooseMovement: advance                   # full advance, SPD 6
      - moveModel: {path: [(2.1, -9.9), (1.0, -4.5)]}         # 5.511"; outside every cloud
      - chooseAttack: {weaponId: jack-buster, targetId: cyg.deuce}
        expect: {range: 10.860, rng: 12, losThroughCloud: C3, allowedBy: Alchemical Mask}
      - attackRoll:
        dice: [2, 3]
        expect: {total: 12, vs: {DEF: 13}, hit: false}           # target in range → blast on Deuce only
      - damageRoll: {kind: blast}
        dice: [1, 6]
        expect: {total: 14, vs: {ARM: 19}, damage: 0}            # ARM 18 + Buckler 1
  - step: K1.end
    expect:
      control: {W1: khador, W2: none}             # W1: Vilkul, 3 Hounds, Razor within 2"; no Cygnar within 2"
      vp: {khador: 1, cygnar: 0}
      winner: none

round1_cygnar:            # QS pp40–44
  - step: C1.control
    expect:
      focus: {cyg.caine: 0→6, cyg.deuce: 0→1}     # Deuce 0.269" from Caine
    actions:
      - allocateFocus: {cyg.deuce: 1}
        expect: {focus: {cyg.caine: 6→5, cyg.deuce: 1→2}}
  - step: C1.deuce
    actions:
      - activationStart:
        expect: {accumulator: true, focus: {cyg.deuce: 2→3}}     # Caine within 3" (0.269")
      - chooseMovement: advance
      - moveModel: {path: [(0.1, 8.1), (0.1, 2.1)]}           # 6.0"
      - chooseAttack: {weaponId: spellstorm-cannon, targetId: kha.razor, attackType: beat-back, additional: false}
        expect: {range: 4.406, losThroughCloud: C3, allowedBy: True Sight}
      - powerfulAttack: true
        expect: {focus: {cyg.deuce: 3→2}}
      - attackRoll:
        dice: [1, 3, 4]
        expect: {total: 15, vs: {DEF: 13}, hit: true, crit: false}   # DEF 11 + Superiority 2
      - damageRoll:
        dice: [2, 2, 3]
        expect: {total: 21, vs: {ARM: 21}, damage: 0}            # ARM 19 + Shield 2
      - beatBack:                                 # A1 step 16; the QS narrates it before the damage roll; positions are the same
        expect:
          push: {kha.razor: (-2.0402, -4.9570)}   # 1" directly away from Deuce
          followUp: {cyg.deuce: (-0.1902, 1.1430)}  # optional 1" advance toward Razor: taken
      - chooseAttack: {weaponId: spellstorm-cannon, targetId: kha.razor, attackType: decrepitation, additional: true}
        expect: {reload: 1, focus: {cyg.deuce: 2→1}}
      - powerfulAttack: true
        expect: {focus: {cyg.deuce: 1→0}}
      - attackRoll:
        dice: [4, 5, 6]
        expect: {total: 22, vs: {DEF: 13}, hit: true, crit: false}
      - damageRoll:
        dice: [1, 2, 5, 6]                        # 2 + Decrepitation (construct) + boost
        expect: {total: 28, vs: {ARM: 21}, damage: 7}
      - columnRoll:
        dice: [5]
        expect:
          marked: [C5#1, C5#2, C5#3, C5#4, C5#5, C6#1, C6#2]
          systems: {R: 2/3, C: 1/3}
          crippled: []
      - reposition: decline                       # ASSUMED (the QS doesn't use it)
  - step: C1.caine
    actions:
      - castSpell: {spellId: deflection}
        expect: {focus: {cyg.caine: 5→2}, affected: [cyg.deuce, cyg.falk, cyg.black13.*], DEF: +2 vs ranged and arcane, until: the start of Cygnar's next turn}
      - chooseMovement: run                       # 7 + 5 = 12"; no attack this activation
      - moveModel: {path: [(1.9, 7.7), (1.9, 6.3), (7.57, 5.0)]}   # 7.217"; waypoint avoids the Black 13th
        expect: {coverFromW2: true, withinW2: 0.034}
  - step: C1.falk
    actions:
      - chooseMovement: advance
      - moveModel: {path: [(-1.8, 4.7), (-3.9, -0.5)]}        # 5.608"
        expect:
          crosses: P2
          roughPenalty: 0                         # Pathfinder
          inCloud: C2                             # part of the base under C2, so he can see out
      - chooseAttack: {weaponId: magelock-scattergun, targetId: kha.vilkul, attackType: decrepitation}
        expect:
          spray: {length: 8, modelsOnLine: [kha.vilkul]}   # nearest other: fedyniak, 0.595" clear of the line
          range: 3.337
          lineCrosses: W1                         # cover would apply, spray ignores it
      - attackRoll:
        dice: [5, 6]
        expect: {total: 16, mods: {cloud: -2}, vs: {DEF: 16}, hit: true, crit: false}
      - damageRoll:
        dice: [3, 4]
        expect: {total: 19, vs: {ARM: 15}, damage: 4}            # Decrepitation adds nothing: Vilkul is living
      - powerField: {modelId: kha.vilkul, spend: 1}
        expect: {focus: {kha.vilkul: 2→1}, damage: 4→0}
  - step: C1.black13
    actions:
      - chooseMovement: {option: advance, modelId: cyg.black13.ryan}
      - moveModel: {modelId: cyg.black13.ryan, path: [(3.4, 7.7), (3.4, 6.2), (5.19, 5.0)]}   # 3.655"
      - placeTroopers:
          cyg.black13.glover: (4.0, 5.0)
          cyg.black13.watts: (6.38, 5.0)          # row: Glover, Ryan, Watts, Caine, all 0.034" behind W2
      - chooseAttack: {modelId: cyg.black13.ryan, weaponId: magelock-pistol#1, targetId: kha.lazarenko, attackType: thunderbolt}
        expect: {range: 9.005, losThroughCloud: C4, allowedBy: Granted True Sight}
      - attackRoll:
        dice: [1, 3]
        expect: {total: 11, vs: {DEF: 14}, hit: false}
      - chooseAttack: {modelId: cyg.black13.ryan, weaponId: magelock-pistol#2, targetId: kha.lazarenko, attackType: thunderbolt}
      - attackRoll:
        dice: [4, 4]
        expect: {total: 15, vs: {DEF: 14}, hit: true, crit: true}
      - thunderbolt:
        dice: [1]                                 # ASSUMED d6 = 1 (QS prints only "d3 = 1")
        expect:
          push: {kha.lazarenko: (0.5965, -5.4150)}   # 1" directly away from Ryan
          condition: {kha.lazarenko: knockedDown}
      - damageRoll:
        dice: [1, 2]
        expect: {total: 13, vs: {ARM: 14}, damage: 0}
      - chooseCombatAction: {modelId: cyg.black13.glover, choice: specialAttack, abilityId: both-barrels}
      - chooseAttack: {modelId: cyg.black13.glover, weaponId: dual-magelock-pistol, targetId: kha.lazarenko, attackType: brutal-damage}
        expect: {range: 9.579}
      - attackRoll:
        dice: [1, 5]
        expect: {total: 13, vs: {DEF: 5}, hit: true, crit: false}   # knocked down: base DEF 5, no other modifiers
      - damageRoll:
        dice: [2, 2, 3]                           # 2 + Brutal Damage
        expect: {total: 21, mods: {bothBarrels: +4}, vs: {ARM: 14}, damage: 7, lazarenkoBoxes: 7/8}
      - chooseAttack: {modelId: cyg.black13.watts, weaponId: magelock-rifle, targetId: kha.razor, attackType: brutal-damage}
        expect: {range: 11.465, rng: 14, outOfPistolRange: {glover: 10.071}}
      - attackRoll:
        dice: [2, 5]
        expect: {total: 16, mods: {prey: +2}, vs: {DEF: 13}, hit: true, crit: false}
      - damageRoll:
        dice: [3, 4, 6]                           # 2 + Brutal Damage
        expect: {total: 25, mods: {prey: +2}, vs: {ARM: 21}, damage: 4}
      - columnRoll:
        dice: [6]
        expect:
          marked: [C6#3, C6#4, C1#1, C1#2]
          crippled: [R]                           # SystemCrippled: Slug Cannon and the R grenade launcher
          razorBoxes: 11/30
      - reposition: decline                       # ASSUMED
  - step: C1.end
    expect:
      control: {W1: khador, W2: cygnar}           # Falk is 2.536" from W1, so he doesn't contest
      vp: {khador: 2, cygnar: 1}
      winner: none                                # Khador leads by 1 after Cygnar's turn

round2_khador:            # QS pp45–47 (the QS stops after Vilkul's activation)
  - step: K2.start
    expect:
      cloudsRemoved: [C1, C2, C3, C4]             # before Maintenance
      stillActive: [deflection, superiority, avenging-force]
  - step: K2.maintenance
    expect:
      focus: {kha.razor: 0→0, kha.vilkul: 1→1}    # warcaster keeps up to ARC
    actions:
      - avengingForce:                            # trigger: Lazarenko was damaged in Cygnar's turn
          advance: {kha.razor: [(-2.0402, -4.9570), (-1.1695, -2.0861)]}   # 3" toward Deuce
          basicAttack: {weaponId: slug-cannon, targetId: cyg.deuce}       # range 1.406"; R crippled → 1 die, no boost
        dice: [1]                                 # ASSUMED (the QS says only that it misses)
        expect: {allOnes: true, hit: false}
  - step: K2.control
    expect:
      focus: {kha.vilkul: 1→6, kha.razor: 0→1}
    actions:
      - allocateFocus: {kha.razor: 2}
        expect: {focus: {kha.vilkul: 6→4, kha.razor: 1→3}}
      - payUpkeep: {keep: [superiority, avenging-force]}
        expect: {focus: {kha.vilkul: 4→2}}
  - step: K2.razor
    actions:
      - chooseMovement: advance                   # up to 5 + 2 = 7"
      - moveModel: {path: [(-1.1695, -2.0861), (-0.2, -2.6)]}  # 1.097"; end point ASSUMED (more than 1" from Deuce and Falk)
      - chooseAttack: {weaponId: slug-cannon, targetId: cyg.deuce}
        expect: {range: 1.774}
      - boostAttack: true
        expect: {focus: {kha.razor: 3→2}}
      - attackRoll:
        dice: [5, 5]                              # 2 − 1 (crippled) + 1 (boost)
        expect: {total: 16, vs: {DEF: 15}, hit: true, crit: true, critEffect: none}   # DEF 13 + Deflection 2
      - momentum:
        expect: {condition: {cyg.deuce: knockedDown}}   # 50 mm target: knockdown, no slam
      - boostDamage: true
        expect: {focus: {kha.razor: 2→1}}
      - damageRoll:
        dice: [2, 6]
        expect: {total: 24, vs: {ARM: 19}, damage: 5}     # Buckler still counts while knocked down
      - columnRoll:
        dice: [3]
        expect: {marked: [C3#1, C3#2, C3#3, C3#4, C3#5], systems: {M: 1/3}, crippled: [], deuceBoxes: 5/30}
      - chooseAttack: {weaponId: grenade-launcher-L, targetId: cyg.black13.ryan, additional: false}
        expect: {range: 7.742, lineCrosses: W2}
      - boostAttack: true
        expect: {focus: {kha.razor: 1→0}}
      - attackRoll:
        dice: [3, 6, 6]
        expect: {total: 21, vs: {DEF: 21}, hit: true, crit: true, critEffect: none}   # 15 + Deflection 2 + cover 4
      - blastTargets:
        expect: {aoe: 2, set: [cyg.black13.glover, cyg.black13.watts], excluded: {cyg.caine: 1.199}}
      - damageRoll: {targetId: cyg.black13.ryan}
        dice: [2, 4]
        expect: {total: 16, vs: {ARM: 12}, damage: 4}
      - damageRoll: {targetId: cyg.black13.glover, kind: blast}   # roll order Glover then Watts ASSUMED (QS order)
        dice: [3, 5]
        expect: {total: 13, vs: {ARM: 12}, damage: 1}
      - damageRoll: {targetId: cyg.black13.watts, kind: blast}
        dice: [2, 2]
        expect: {total: 9, vs: {ARM: 12}, damage: 0}
      - endAttacks: {}                            # R launcher crippled and no focus left
      - reposition:
          path: [(-0.2, -2.6), (-0.1961, -1.1000)]   # 1.5" toward Deuce
        expect: {edgeToDeuce: 0.274}              # inside both warjacks' 1" melee range; Deuce is knocked down
  - step: K2.vilkul
    actions:
      - chooseMovement: charge
      - chargeTarget: {targetId: cyg.falk}
      - moveModel: {path: [(-4.3, -5.0), (-4.0344, -2.0118)]}  # 3.0" straight; crosses W1 (Pathfinder: no stop)
        expect: {edgeToFalk: 0.337}
      - chooseAttack: {weaponId: mechanika-axe, targetId: cyg.falk, attackType: ward-breaker}   # attack type ASSUMED (no effect here)
      - attackRoll:
        dice: [1, 1]
        expect: {allOnes: true, hit: false}       # the charge attack's free damage boost is lost
      - chooseAttack: {weaponId: mechanika-axe, targetId: cyg.falk, attackType: ward-breaker, additional: true}
        expect: {focus: {kha.vilkul: 2→1}}
      - boostAttack: true
        expect: {focus: {kha.vilkul: 1→0}}
      - attackRoll:
        dice: [2, 5, 5]
        expect: {total: 19, vs: {DEF: 15}, hit: true, crit: true, critEffect: none}   # no Deflection in melee
      - damageRoll:
        dice: [1, 4, 4]                           # 2 + Weapon Master; not a charge attack, so no free boost
        expect: {total: 22, vs: {ARM: 12}, damage: 10}
        events: [LifeStateChanged disabled, LifeStateChanged boxed, LifeStateChanged destroyed, ModelRemoved cyg.falk]
  - step: STOP                                    # Lazarenko and the Hounds have not activated
```

## 4. End state at STOP

| Item | Expected |
|---|---|
| Round / turn | round 2, Khador's turn, activation phase |
| VP | Khador 2, Cygnar 1 |
| Focus | Vilkul 0, Razor 0, Caine 2 (kept from his turn), Deuce 0 |
| Effects | Superiority and Avenging Force on Razor (upkept); Deflection until Cygnar's next turn starts; no clouds |
| Conditions | Deuce knocked down; Lazarenko knocked down |
| Razor | 11/30: C5#1–5, C6#1–4, C1#1–2; R crippled |
| Deuce | 5/30: C3#1–5; nothing crippled |
| Lazarenko | 7 of 8 boxes marked |
| Ryan / Glover / Watts | 4 / 1 / 0 damage (5 boxes each ASSUMED) |
| Vilkul | 0 damage |
| Falk | destroyed and removed |

| Model | Final position |
|---|---|
| kha.vilkul | (−4.0344, −2.0118) |
| kha.razor | (−0.1961, −1.1000) |
| kha.lazarenko | (0.5965, −5.4150) |
| kha.hounds.fedyniak / tererya / skrobala | (−5.49, −5.0) / (−6.68, −5.0) / (−7.87, −5.0) |
| cyg.deuce | (−0.1902, 1.1430) |
| cyg.caine | (7.57, 5.0) |
| cyg.black13.glover / ryan / watts | (4.0, 5.0) / (5.19, 5.0) / (6.38, 5.0) |

## 5. Assumptions (not printed in the QS)

| What | Our value | Why |
|---|---|---|
| Positions | sections 2–3 | Read off the QS diagrams, then adjusted so every printed fact holds (section 6) |
| Trooper order in each starting row | as listed | The diagrams don't name troopers |
| Pall of Ashes d6 | 1 | The QS prints the d3 only |
| Thunderbolt d6 | 1 | The QS prints the d3 only |
| Avenging Force attack die | 1 | The QS says only that it misses |
| Reposition after Deuce's and the Black 13th's activations | declined | The QS doesn't use it |
| Razor's round-2 advance end point | (−0.2, −2.6) | The QS gives SPD only; it must stay more than 1" from Deuce and Falk so it can shoot freely |
| Vilkul's Mechanika Axe attack type | Ward Breaker | The QS says no special rule triggers when Falk dies, so not Eruption of Ash |
| Blast roll order | Ryan (direct), Glover, Watts | The QS's order; the rolls are simultaneous |
| Weapon ranges the QS doesn't print | Magelock Pistol 10, Dual Magelock Pistol 10, Magelock Rifle 14, Scattergun SP 8, Grenade Launcher 10, Slug Cannon 8 | Community data (`factions/*.md`); every distance here fits them |
| Trooper boxes | 5 each | Open app check |

## 6. Geometry the positions satisfy

Every figure is base edge to base edge (inches) unless marked "centre".

| Fact (QS page) | Check | Value |
|---|---|---|
| Deployment depths (p35) | Hounds/Vilkul far edge z ≤ −12; Razor ≤ −12; Lazarenko ≤ −9; Deuce near edge ≥ 7; Caine/Black 13th ≥ 7; Falk ≥ 4 | −12.109, −12.116, −9.113, 7.116, 7.109, 4.109 |
| Clouds completely within Vilkul's CTRL 12 (p37) | farthest cloud point from her base edge | 11.926 max |
| Vilkul and the Hounds behind W1, in cover (p37–38) | gap to W1 | 0.034 each |
| Razor outside the clouds and out of cover (p38) | gap to C3 / to W1 | 0.151 / 1.266 |
| Lazarenko outside the clouds (p39) | gap to C4 | 0.197 |
| 'Jack Buster reaches Deuce (p39) | Lazarenko–Deuce | 10.860 ≤ 12 |
| W1 held by Khador, W2 by nobody after K1 (p39) | within 2" | Khador: 5 models; Cygnar: none |
| Accumulator (p40) | Caine–Deuce | 0.269 ≤ 3 |
| Deuce in range of Razor (p40) | Deuce–Razor | 4.406 ≤ 12 |
| Caine behind W2, in cover (p42) | gap to W2 | 0.034 |
| Falk crosses P2 and ends partly inside C2 (p42) | path / centre distance to C2 | crosses / 1.432 < 1.5 + 0.591 |
| Spray hits only Vilkul (p43) | clearance of the next model (Fedyniak) | 0.595 |
| Black 13th behind W2 (p43) | gap to W2 | 0.034 each |
| Ryan in range of Lazarenko (p43) | Ryan–Lazarenko | 9.005 ≤ 10 |
| Glover in range of the pushed Lazarenko (p44) | Glover–Lazarenko | 9.579 ≤ 10 |
| Only Watts reaches Razor (p44) | Watts–Razor / Glover–Razor | 11.465 ≤ 14 / 10.071 > 10 |
| Razor not in cover from W1 when shot (p41, p44) | gap to W1 after Beat Back | 1.060 > 1 |
| Falk doesn't contest W1 (p44) | Falk–W1 | 2.536 > 2 |
| Avenging Force Razor not engaged (p45) | Razor–Deuce / Razor–Falk | 1.406 / 1.583 |
| Razor's shots after its advance (p46) | Razor–Deuce / Razor–Falk / Razor–Ryan | 1.774 / 2.680 / 7.742 |
| Ryan in cover from Razor (p46) | line crosses W2; Ryan gap to W2 | yes; 0.034 |
| Blast set (p46) | Ryan–Glover / Ryan–Watts / Ryan–Caine | 0.009 / 0.009 / 1.199 (third, so out with AOE 2) |
| "The entire Cygnar force is in range" (p45) | Razor to Caine / Glover / Watts / Falk | 9.294 / 7.108 / 8.478 / 2.680 ≤ 10 |
| Reposition ends within 1" of Deuce (p46) | Razor–Deuce | 0.274 |
| Charge crosses W1 and ends in melee (p47) | path crosses W1; Vilkul–Falk | yes; 0.337 ≤ 1 |
