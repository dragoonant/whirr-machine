// One flavour per weapon, read by BOTH the sound and the VFX layers so a gun never plays another gun's sound.
// A weapon id (e.g. "cyg.w.dual-magelock-pistol") maps to the flavour whose slug is the LONGEST slug contained in it.
export interface Flavour {
  id: string
  /** Slugs matched against the weapon id; the longest contained slug wins. */
  slugs: readonly string[]
  /** Sound id in audio-manifest (the shot or strike). */
  sfx: string
  /** Optional alternate sound for blast or special shot modes. */
  sfxAlt?: string
  /** VFX hint for the projectile layer. */
  vfx: 'bolt' | 'spark-burst' | 'spray' | 'shell' | 'lob' | 'rocket' | 'tracer' | 'thrown' | 'slash' | 'smash'
    // M9 looks (vfx/effects.ts FxLook): the new weapons' own impact and projectile styles
    | 'claws' | 'bite' | 'chain' | 'soul' | 'flame' | 'holy-fire' | 'lightning' | 'thorn' | 'thresher'
  melee: boolean
}

export const FLAVOURS: readonly Flavour[] = [
  { id: 'magelock-pistol', slugs: ['magelock-pistol', 'pistol'], sfx: 'gun-magelock-pistol', vfx: 'bolt', melee: false },
  { id: 'dual-pistol', slugs: ['dual-magelock-pistol', 'dual-pistol'], sfx: 'gun-dual-pistol', vfx: 'bolt', melee: false },
  { id: 'spellstorm-pistol', slugs: ['spellstorm-pistol'], sfx: 'gun-spellstorm-pistol', vfx: 'spark-burst', melee: false },
  { id: 'spellstorm-cannon', slugs: ['spellstorm-cannon'], sfx: 'gun-spellstorm-cannon', vfx: 'spark-burst', melee: false },
  { id: 'rifle', slugs: ['magelock-rifle', 'rifle'], sfx: 'gun-magelock-rifle', vfx: 'tracer', melee: false },
  { id: 'scattergun', slugs: ['scattergun'], sfx: 'gun-scattergun', vfx: 'spray', melee: false },
  { id: 'cannon', slugs: ['cannon', 'bombard'], sfx: 'gun-cannon', sfxAlt: 'gun-cannon-blast', vfx: 'shell', melee: false },
  { id: 'slug-cannon', slugs: ['slug-cannon'], sfx: 'gun-slug-cannon', vfx: 'shell', melee: false },
  { id: 'assault-cannon', slugs: ['assault-cannon'], sfx: 'gun-assault-cannon', vfx: 'tracer', melee: false },
  { id: 'grenade-launcher', slugs: ['grenade-launcher', 'powder-bomb'], sfx: 'gun-grenade-launcher', vfx: 'lob', melee: false },
  { id: 'rocket', slugs: ['jack-buster', 'rocket', 'bazooka'], sfx: 'gun-jack-buster', vfx: 'rocket', melee: false },
  { id: 'carbine', slugs: ['carbine', 'spiker'], sfx: 'gun-carbine', vfx: 'tracer', melee: false },
  { id: 'thrown-axe', slugs: ['thrown-axe', 'raven'], sfx: 'gun-thrown-axe', vfx: 'thrown', melee: false },
  { id: 'blade', slugs: ['blade', 'sword'], sfx: 'melee-blade', vfx: 'slash', melee: true },
  { id: 'axe', slugs: ['axe'], sfx: 'melee-axe', vfx: 'slash', melee: true },
  { id: 'knife', slugs: ['knife'], sfx: 'melee-knife', vfx: 'slash', melee: true },
  { id: 'club', slugs: ['rifle-butt', 'butt', 'club', 'staff'], sfx: 'melee-club', vfx: 'smash', melee: true },
  { id: 'shield', slugs: ['shield'], sfx: 'melee-shield', vfx: 'smash', melee: true },
  { id: 'claws', slugs: ['claw', 'wraith-strike'], sfx: 'melee-claws', vfx: 'claws', melee: true },
  { id: 'bite', slugs: ['tusk', 'bite', 'jaw'], sfx: 'melee-bite', vfx: 'bite', melee: true },
  { id: 'chain-weapon', slugs: ['eviscerator', 'chain', 'scythe'], sfx: 'melee-chain', vfx: 'chain', melee: true },
  { id: 'thresher', slugs: ['thresher'], sfx: 'melee-chain', vfx: 'thresher', melee: true },
  { id: 'holy-fire-melee', slugs: ['blazing-star', 'flame-spear', 'pyrrhus-spear'], sfx: 'melee-holy-flame', vfx: 'holy-fire', melee: true },
  { id: 'spear', slugs: ['spear', 'hellspike'], sfx: 'melee-blade', vfx: 'slash', melee: true },
  { id: 'soul-cannon', slugs: ['soul-cannon', 'stygian-abyss', 'marionette', 'rune-thrower'], sfx: 'gun-soul-shot', vfx: 'soul', melee: false },
  { id: 'flame', slugs: ['flame-belcher', 'flamethrower', 'belcher'], sfx: 'gun-flame-jet', vfx: 'flame', melee: false },
  { id: 'holy-fire', slugs: ['truth-consequence-flame', 'holy-fire'], sfx: 'gun-holy-fire', vfx: 'holy-fire', melee: false },
  { id: 'lightning', slugs: ['death-howler', 'lightning'], sfx: 'spell-lightning', vfx: 'lightning', melee: false },
  { id: 'thorn', slugs: ['jaws-of-the-earth', 'thorn'], sfx: 'spell-thorn', vfx: 'thorn', melee: false },
  { id: 'bow', slugs: ['bow'], sfx: 'gun-magelock-rifle', vfx: 'tracer', melee: false },
  { id: 'hammer', slugs: ['hammer', 'maul', 'mace'], sfx: 'melee-hammer', vfx: 'smash', melee: true },
  { id: 'fist', slugs: ['fist'], sfx: 'melee-fist', vfx: 'smash', melee: true },
]

export const FLAVOUR_BY_ID: Readonly<Record<string, Flavour>> = Object.fromEntries(FLAVOURS.map((f) => [f.id, f]))

const FALLBACK_RANGED = FLAVOUR_BY_ID['magelock-pistol']!
const FALLBACK_MELEE = FLAVOUR_BY_ID['blade']!

/** Flavour for a weapon id; `melee` picks the fallback for ids no slug matches. */
export function weaponFlavour(weaponId: string, melee = false): Flavour {
  let best: Flavour | undefined
  let bestLen = 0
  for (const f of FLAVOURS) {
    for (const slug of f.slugs) {
      if (slug.length > bestLen && weaponId.includes(slug)) { best = f; bestLen = slug.length }
    }
  }
  return best ?? (melee ? FALLBACK_MELEE : FALLBACK_RANGED)
}
