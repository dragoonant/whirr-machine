# Protectorate of Menoth: sources

Sources used for the Defenders of the Flame starter (`menoth.md`). All checked 2026-10-07. Nothing below is copied
into the repo: numbers and names only, all prose ours. Community data stays outside git.

| Tag | Source | What it gave |
|---|---|---|
| S1 | Warmachine Academy wiki (community, MediaWiki), Covenant of the Flame pages, created 2026-09-02 to 09-08 right after SFG put the rules in the app (see S4); raw wikitext read with `action=raw` | Every number: stats, health, base (Small Base / Heavy Warjack), weapons, abilities, spells, feat, point costs, unit size, FA |
| S2 | Wargamer, "Warmachine Summer preview reveals stunning new Protectorate of Menoth army" (2026) | Cross-check of names and gists: Truth and Consequence, Blessing of the First Gift, Sacred Paragon, Teleport, Debilitating Heat, Lawgiver's Judgment, Valeria's three arrows and Pathfinder action, Defenders' Set Defense, Shield Wall, Shield Guard, the Four Gifts |
| S3 | Miniature Market listing SFIK-MEN542 (Defenders of the Flame Command Set) and ICv2 "Four 'Warmachine' Boxed Sets Incoming" | Box contents: 9 models (Feora, Crusader with Venerable / Blazing Star / Flame Belcher, Valeria, Pyrrhus, Flameguard Defenders), Command level (30 points), release 2026-10-07 |
| S4 | Frontline Gaming, "Menoth Preview: Covenant of the Flame Expands With Feora…" (2026-10-01) | The rules have been live in the free app since the preview; no numbers |
| S5 | Tabletop Battles Roundtable, "The Big Autumn Preview 2026" | Cross-check of Prophet of the Covenant, Illumination, Marshal, Lawgiver's Judgement, Sacred Paragon, Teleport, Sanctified Hull, Shield Guard on Defenders, Crusader SPD 4 and weak defensive stats |
| S6 | MK4 rulebook, abridged digital edition (`docs/sources/WMH-MK4-Rulebook_Digital_144-OP_Abridged.pdf`) | Core rules only (combined attacks, continuous effects, power attacks) |
| S7 | Community MK4 app data, `isorna/wardice-warmachine-data` (`menoth.temple-guardians`, `mercenaries.rhul-guard`) | Older Crusader chassis grid layout (still U-cd for the new card); ARM convention check (base ARM printed, Shield/Shield Wall apart), compared with S1 |

## URLs

- S1:
  - https://warmachineacademy.miraheze.org/wiki/Feora,_Marshal_of_the_Flameguard
  - https://warmachineacademy.miraheze.org/wiki/Crusader
  - https://warmachineacademy.miraheze.org/wiki/Valeria,_The_Whisper_of_Death
  - https://warmachineacademy.miraheze.org/wiki/Pyrrhus,_Flameguard_Commander
  - https://warmachineacademy.miraheze.org/wiki/Flameguard_Defenders
  - https://warmachineacademy.miraheze.org/wiki/Flameguard_Defender_Standard_Bearer
  - https://warmachineacademy.miraheze.org/wiki/Protectorate_of_Menoth_Covenant_of_the_Flame
  - rule templates under https://warmachineacademy.miraheze.org/wiki/Template: (Prophet_of_the_Covenant, Illumination,
    Marshal, Heroic_Inspiration, Holy_Martyrs, Set_Defense, Shield_Guard, Shield_Wall, Cleansing_Volley,
    Reconnaissance, Swift_Hunter, Armor-Piercing_Arrow, Featherweight_Arrow, Incendiary_Arrow, Heavy_Boiler,
    Sanctified_Hull, Gladiator, Chain_Weapon, Thresher, Blessed, Conflagration, Debilitating_Heat,
    Lawgiver's_Judgement, Sacred_Paragon, Teleport)
- S2: https://www.wargamer.com/warmachine/summer-preview-2026-menoth
- S3: https://www.miniaturemarket.com/Warmachine-Menoth-Covenant-of-the-Flame-Defenders-of-the-Flame-Command-Set-Preorder/SFIK-MEN542 ;
  https://icv2.com/articles/news/view/63278/four-warmachine-boxed-sets-incoming
- S4: https://frontlinegaming.org/2026/10/01/menoth-preview-covenant-of-the-flame-expands-with-feora-new-army-boxes-and-more/
- S5: https://www.tabletopbattles.com/warmachine-tabletop-battles-roundtable-the-big-autumn-preview-2026
- S6: local PDF (gitignored)
- S7: https://github.com/isorna/wardice-warmachine-data (raw `mk4/profiles/*.profiles.json`; last commit 2026-09-15,
  no Covenant of the Flame file yet)

## Tried, no numbers

- warmachine.gg blog and product pages (Big Autumn Preview, Warmachine Wednesday 2026-09-02 and 09-30): HTTP 429 and
  bot block on every try.
- Brückenkopf "Herbst Vorschau – Menoth", Monstrous Makings pre-order post: box and army news only.
- Reddit r/Warmachine search: blocked for scripts; web search found no card thread.
- warmachine-mk4.fandom.com: no Covenant of the Flame pages.
- steamforged.com: no free Covenant of the Flame card or army PDF; rules are in the app and Wartable only.
- isorna community data: no Covenant files (see S7).

## Confidence

S1 is a single community transcription, so every number is single-source. It agrees with every name and gist in S2
and S5, and its point costs (13 + 5 + 4 + 8) add up to the box's 30-point label in S3, which is an independent check
on the costs. A value is tagged `S1` in `menoth.md`; `S1+S2` or `S1+S5` where a second source confirms it.
