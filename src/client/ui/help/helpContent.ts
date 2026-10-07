// How to Play guide content. All prose is our own words (unofficial fan project, not affiliated with Steamforged Games).
// Pure data so it can be tested headlessly. Numbers the game itself computes (hit targets, odds, damage) are never
// stated here: the guide tells you where to find them on screen.

export type HelpBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'tip'; text: string }
  | { kind: 'keys'; rows: [string, string][] }

export interface HelpTab { id: string; title: string; blurb: string; blocks: HelpBlock[] }

export const HELP_TABS: HelpTab[] = [
  {
    id: 'goal', title: 'Goal', blurb: 'Two ways to win: take out their leader, or out-score them.',
    blocks: [
      { kind: 'p', text: 'Whirr Machine is a two-player skirmish. You command a small army against the opposing force, and a game ends one of three ways.' },
      { kind: 'list', items: [
        'Assassination: the enemy warcaster is the leader of their army. If theirs falls while yours still stands, you win on the spot, even in the middle of an activation.',
        'Lead by 3: at the end of each turn, once points are counted, the player who did NOT just take the turn wins if they are ahead by 3 or more victory points (VP). Nobody wins this way at the end of their own turn.',
        'Round limit: after round 7 the player with more VP wins. A tie goes to whoever has more of their army holding the scenario objectives.',
      ] },
      { kind: 'h', text: 'How victory points work' },
      { kind: 'p', text: 'The scenario gives you things to hold, such as a low wall. You hold one at the end of your turn when you have enough of your own models near it and the enemy has none contesting it. Each thing you hold scores 1 VP. The top bar always shows both scores.' },
      { kind: 'tip', text: 'Killing models does not score points by itself. It matters because dead models cannot hold walls, and a dead caster ends the game.' },
    ],
  },
  {
    id: 'army', title: 'Your army', blurb: 'The kinds of model you will command.',
    blocks: [
      { kind: 'list', items: [
        'Warcaster: your leader. Fragile for its price, but it holds your focus, casts spells and has a once-per-game feat. Keep it alive.',
        'Focus: the energy a caster generates each turn. It is the currency for boosting dice, casting, extra attacks and shielding.',
        'War-engine: a big steam-powered machine. Tough and hard-hitting, and it can hold up to 3 focus given to it by its caster, as long as it stays close to the caster.',
        'Solo: a lone specialist model. Quick, strong at one job, and good as a flanker or objective holder.',
        'Unit: a group of troopers that activate together and stay close to each other. Individually weak, they win by numbers.',
      ] },
      { kind: 'p', text: 'Each model has a card on the side. Hover or click a model to see its stats, weapons, abilities and damage boxes. The stats you will use most: SPD (movement), MAT and RAT (melee and ranged skill), DEF (how hard it is to hit) and ARM (how hard it is to hurt).' },
      { kind: 'tip', text: 'Your starter army has four entries: a caster, a war-engine, a solo and a unit. That is the whole toolbox, so learn what each is good at.' },
    ],
  },
  {
    id: 'turn', title: 'Turn sequence', blurb: 'Every turn runs the same three phases in order.',
    blocks: [
      { kind: 'steps', items: [
        'Maintenance. Lasting effects are settled. Focus left on war-engines is cleared, and burning or corrosion on your models rolls to see if it keeps going.',
        'Control. Your caster refills its focus, then you allocate it: hand focus to war-engines near the caster (up to 3 each), keep some, and pay for any spells you are keeping up.',
        'Activation. Every model or unit activates exactly once, in any order you choose. An activation is a move first, then one Combat Action: attack, cast a spell, or another option the game offers.',
      ] },
      { kind: 'p', text: 'You cannot end your turn until everything has activated. When you do, scoring happens and the opponent takes their turn. When both have gone, the round counter goes up.' },
      { kind: 'tip', text: 'Choose your activation order deliberately. Move the model that clears the way first, and use the unit that is about to be shot before it is too late.' },
    ],
  },
  {
    id: 'moving', title: 'Moving', blurb: 'Four ways to spend a model\'s movement.',
    blocks: [
      { kind: 'list', items: [
        'Advance: move up to the model\'s SPD in inches, then take your Combat Action as normal.',
        'Run: move much farther (SPD plus 5 inches), but you give up your Combat Action. Great for grabbing an objective.',
        'Charge: pick an enemy and rush it in a straight line, ending in melee range. You need enough room, and the first attack that follows hits harder. The prompt gives exact distances.',
        'Aim: stand still and line up a ranged shot, getting a better attack roll in exchange for not moving.',
      ] },
      { kind: 'h', text: 'Obstacles' },
      { kind: 'list', items: [
        'Rough terrain slows you: every inch moved through it counts extra against your allowance.',
        'You cannot move through other bases, and you cannot end overlapping one.',
        'Engaged: a model with an enemy in melee range is engaged. That complicates shooting, so plan to break away or finish the fight.',
      ] },
      { kind: 'p', text: 'Click the table where the model should stop. The game draws the path, shows the distance against the limit, and turns it red with a reason if the move is not allowed. Click the end point again or press Confirm. Suggested spots and Stay put are one click away in the bottom panel.' },
      { kind: 'p', text: 'Heavy warjacks and warbeasts may also get Slam (a charge that throws the target back and knocks it down) and Trample (stomp straight through small enemies, attacking each one). A knocked-down model gets Stand up instead.' },
      { kind: 'tip', text: 'Rest the pointer on any movement, combat or feat button for a moment and a box explains what it does.' },
      { kind: 'tip', text: 'Press T to show threat rings: how far the selected model can advance, run and charge.' },
    ],
  },
  {
    id: 'attacking', title: 'Attacking', blurb: 'Two rolls: does it hit, then does it hurt.',
    blocks: [
      { kind: 'steps', items: [
        'Pick a weapon and a target. Ranged weapons need line of sight and the target in range; melee weapons need the target in melee range.',
        'Attack roll: roll 2d6 and add the attacker\'s MAT (melee) or RAT (ranged). If the total meets or beats the target\'s DEF, it hits.',
        'Damage roll: roll 2d6 and add the weapon\'s POW. Subtract the target\'s ARM. What is left is damage, filled into the target\'s boxes.',
      ] },
      { kind: 'p', text: 'You never need to do this math yourself. Before you commit, the game shows the number needed to hit, your chance, and the expected damage. Those figures are exact.' },
      { kind: 'h', text: 'Extras' },
      { kind: 'list', items: [
        'Boosting: spend 1 focus to add a die to an attack roll or a damage roll. Boosted hit rolls hit more often, boosted damage rolls hurt more.',
        'Critical hits: rolling doubles on a hit can trigger a bonus effect on the weapon, if it has one.',
        'Power attacks: some war-engines can trade a normal attack for a shove, throw or headbutt. They appear as options when possible.',
        'Cover and melee: a target behind cover, or one that is in melee, can be harder to hit. The LOS view lists each reason.',
      ] },
      { kind: 'tip', text: 'Boost damage when a kill is close, boost the attack roll when the shot is the one that matters. The prompt shows how each choice changes your chances.' },
    ],
  },
  {
    id: 'focus', title: 'Focus and spells', blurb: 'The caster\'s resource, and what it buys.',
    blocks: [
      { kind: 'list', items: [
        'Allocate: during Control, give focus to war-engines inside your caster\'s control range. Each can hold at most 3.',
        'Boost: spend focus to add dice to attack or damage rolls.',
        'Extra attacks: a model with focus can pay for additional attacks beyond its normal ones, when its weapons allow.',
        'Power Field: a caster, or a war-engine holding focus, can spend 1 focus to shield itself and take less damage from a hit. The prompt appears when it is available.',
        'Spells: a caster casts during its Combat Action, paying focus and following the spell\'s range and target rules.',
        'Upkeep: a spell you wish to keep running costs 1 focus each Control phase. If you do not pay, it ends.',
        'Feat: once per game, your caster can unleash a feat that changes the battle for a round. Use it when it will swing the fight.',
      ] },
      { kind: 'tip', text: 'Focus is limited. Every point spent boosting is a point you cannot use to cast, shield, or keep a spell running.' },
    ],
  },
  {
    id: 'fury', title: 'Warlocks and fury', blurb: 'Warlocks, warbeasts and the fire that passes between them.',
    blocks: [
      { kind: 'p', text: 'Some armies are led by a warlock instead of a warcaster. A warlock fights beside a battlegroup of warbeasts, and the resource that matters is fury rather than focus. Flame pips on a card and over a figure show how much fury a model is holding.' },
      { kind: 'list', items: [
        'Warlock fury: a warlock starts the game holding fury equal to its ARC. It spends fury the way a caster spends focus: boosting rolls, casting spells, paying for extra attacks and keeping spells running.',
        'Warbeasts do not spend fury, they gather it. Whenever you ask a beast for something extra (to run, charge, boost a roll, make an extra attack, use a power attack or cast its own animus) it is forced, which piles fury onto it. Forced costs show in red as fury the beast gains.',
        'A beast can only be forced while it is inside its warlock\'s control range, is not wild or already frenzied, has its Spirit intact, and has room left under its FURY limit. The battlegroup strip on the warlock\'s card says why a beast cannot be forced right now.',
        'Rile and shed: a beast can take on extra fury for nothing, and a warlock can throw away its own.',
      ] },
      { kind: 'h', text: 'Control phase: leeching' },
      { kind: 'p', text: 'At the start of Control, each warlock can pull fury off its beasts that are inside its control range, up to its ARC. Use the steppers: every beast row shows its chance of frenzying afterwards. You may also draw fury from the warlock\'s own life at the price of one damage each, but that damage can never be moved to a beast.' },
      { kind: 'h', text: 'Threshold and frenzy' },
      { kind: 'p', text: 'Later in Control, every beast still holding fury rolls 2d6 and adds its fury. If the total is above its THR the beast frenzies at once. It charges the closest model it can see, friend or foe, and attacks it for free. The flash on screen names its target. Afterwards you may vent any of its fury before the next check. Constructs never frenzy. The card badge goes red when the chance passes about a third.' },
      { kind: 'h', text: 'Transferring damage' },
      { kind: 'p', text: 'When a hit is about to land on a warlock that holds fury, you may pay 1 fury to move it onto a beast in control range that has room for more fury. Each candidate card shows how much it takes, how much still hits the warlock, and the chance it goes down or loses an aspect. Pick Keep to take the hit yourself.' },
      { kind: 'h', text: 'The life spiral' },
      { kind: 'p', text: 'A beast tracks damage on a spiral of six branches. Damage lands on the outer box first and works inward. Boxes are tinted by aspect: Mind (blue), Body (orange), Spirit (violet). When every box of an aspect is marked, that aspect is crippled. Mind costs it a die on attacks and its special attacks, Body costs it a die on damage rolls, and Spirit means it can no longer be forced.' },
      { kind: 'tip', text: 'Without its warlock a beast goes wild: it loses its fury and stops acting. A friendly warlock standing next to it can pay 1 fury to take control.' },
    ],
  },
  {
    id: 'feats', title: 'Feats', blurb: 'Each leader’s once-per-game trick, and when to spend it.',
    blocks: [
      { kind: 'p', text: 'Every warcaster and warlock has one feat. It costs nothing to use, but once it is spent it is gone for the rest of the game. Use it from the Spells and feat section of the leader’s panel during its activation. Most feats last until your next turn begins (one round).' },
      { kind: 'h', text: 'Arcane Conflagration (Major Allister Caine, Cygnar)' },
      { kind: 'p', text: 'For one round, Caine’s Spellstorm Pistols snowball. Every pistol shot that hits an enemy adds +1 to the damage of every pistol shot after it, and the bonus keeps stacking. Any model his pistols destroy erupts in a POW 10 magical blast that can hurt the models around it.' },
      { kind: 'tip', text: 'Pop it when Caine can unload many pistol shots in one activation (spend focus on extra attacks) into a tight group of enemies. The later shots hit far harder than the first ones, and kills chain into blasts.' },
      { kind: 'h', text: 'Pall of Ashes (Kapitan Zahara Vilkul, Khador)' },
      { kind: 'p', text: 'Drops d3+3 clouds of ash anywhere inside her control range until her next turn. Living enemies standing in a cloud are easier to hit (-2 DEF), worse at attacking (-2) and lose Tough. Her own models moving through the clouds ignore rough terrain and can pass over other models.' },
      { kind: 'tip', text: 'Use it on the turn you commit to the big fight: the clouds both soften the enemy line and open lanes for your charges.' },
      { kind: 'h', text: 'Fortification (Captain Gunnbjorn, Trollbloods)' },
      { kind: 'p', text: 'For one round, friendly Trollblood models inside Gunnbjorn’s control range count as being in cover against ranged and magic attacks, take no damage from blasts, and cannot be knocked down.' },
      { kind: 'tip', text: 'A defensive feat. Spend it the turn before the enemy’s gunline gets its best shots, or when you need your models to hold a wall under fire.' },
      { kind: 'h', text: 'Rites of the Wurm (Tanith the Feral Song, Circle Orboros)' },
      { kind: 'p', text: 'For one turn, Tanith can cast her spells as if from any warbeast in her battlegroup that is inside her control range. Her spells cost 1 less (never below 1), and so do the animi those beasts cast while in her control range.' },
      { kind: 'tip', text: 'Lets her strike from far forward while she stays safe at the back. Use it when a spell or animus at the front line would swing the fight.' },
      { kind: 'h', text: 'Wrath of Lyliss (Wraithbinder Nekane, Cryx)' },
      { kind: 'p', text: 'For one round, Nekane can pay for things with her own life instead of focus. She may take 1 damage instead of paying a spell’s focus cost (once per spell), and take 1 damage instead of spending a focus to boost an attack or damage roll.' },
      { kind: 'tip', text: 'Turns her health into extra focus for an all-in turn. Use it when the extra spells and boosts can win the game, and she is not in danger of being killed back.' },
      { kind: 'h', text: 'Blessing of the First Gift (Feora, Marshal of the Flameguard, Menoth)' },
      { kind: 'p', text: 'Instantly hits every enemy model inside Feora’s control range with a POW 12 fire damage roll, then sets each of them on fire.' },
      { kind: 'tip', text: 'Strongest against lots of lightly armoured models packed into her control range. Move her up first so the range covers as many enemies as possible.' },
    ],
  },
  {
    id: 'terrain', title: 'Terrain and LOS', blurb: 'What blocks shots and what slows you.',
    blocks: [
      { kind: 'list', items: [
        'Line of sight (LOS): you can only shoot or cast at what you can see. Models and tall terrain can block the view.',
        'Cover: standing behind terrain can make you harder to hit. The game applies and explains this for you.',
        'Rough terrain slows movement, as noted under Moving.',
        'Scenario terrain such as a wall is what you fight over. Stand near it with enough models and keep the enemy away.',
      ] },
      { kind: 'p', text: 'Press L, select a model, then hover an enemy to see the LOS line. Green means a clear view, red means blocked, and a list says exactly what is in the way.' },
      { kind: 'tip', text: 'Check LOS before you move. Premeasuring and checking views is always allowed and costs nothing.' },
    ],
  },
  {
    id: 'controls', title: 'Controls', blurb: 'Mouse, keyboard and where the buttons live.',
    blocks: [
      { kind: 'keys', rows: [
        ['Click', 'Select a model or unit, or choose it when the game asks you to activate one'],
        ['Click table', 'Set where the active model moves, or place a model during deployment'],
        ['Click a target', 'Attack it, once you have chosen a weapon'],
        ['M', 'Ruler: measure edge to edge between models or points'],
        ['L', 'LOS view: from the selected model to the hovered one'],
        ['T', 'Threat rings for the selected model'],
        ['Right-drag', 'Orbit the camera'],
        ['Middle-drag or W A S D', 'Pan the camera'],
        ['Mouse wheel', 'Zoom'],
        ['Enter', 'Confirm the default option'],
        ['Esc', 'Pass or cancel, when the prompt allows it'],
        ['Any click', 'Skip the animation that is playing'],
        ['?', 'Open or close this guide'],
      ] },
      { kind: 'list', items: [
        'End turn sits in the top bar; End attacks and the other activation choices are in the left panel. The game will not let you end a turn while models are still unactivated.',
        'Animation speed (slow, normal, fast, instant) is set on the start screen. Menu (top right) returns there without losing the game.',
        'The panel at the bottom always says what the game is waiting for, with the exact numbers. A short tip appears under the top bar the first time each kind of choice comes up.',
      ] },
    ],
  },
  {
    id: 'first', title: 'Your first turn', blurb: 'A short walk through, start to finish.',
    blocks: [
      { kind: 'steps', items: [
        'Deploy. Click inside your shaded zone to place each model, or press the auto-place button, then Confirm. Keep the caster behind the war-engine.',
        'Control. Allocate your caster\'s focus. A good default is to give the war-engine 2 or 3 and keep the rest.',
        'Activate the war-engine first. Choose Advance or Charge toward the nearest enemy. A charge goes in a straight line: pick the target, then Charge straight in.',
        'Attack. Click an attack in the left panel (each one names the weapon, the target and the hit chance), or click the enemy on the table. Boost when the shot matters.',
        'Activate your unit and solo. Move them toward the objective and shoot if something is in range.',
        'Activate the caster last. Cast a spell if you have focus left, then end the activation.',
        'End your turn. Scores update and the opponent takes theirs. Watch what they do, then answer.',
      ] },
      { kind: 'tip', text: 'Stuck? The bottom panel says what the game wants right now. Press ? any time to come back here.' },
    ],
  },
]

export const HELP_TAB_IDS: string[] = HELP_TABS.map((t) => t.id)
