# 90 Skirmish: sources

Every source used for `90-skirmish.md`, fetched 2026-10-07. Nothing here is copied card or rules text; list
contents are given as model names and point costs only (facts), and no community data file is stored in the repo.
Raw downloads stayed in the session scratchpad.

## 1. Rules (local, gitignored `docs/sources/`)

| Tag | File | Used for |
|---|---|---|
| RB | `WMH-MK4-Rulebook_Digital_144-OP_Abridged.pdf` | p116 setup and "typically 4' × 4'"; p117 deployment 7"/10", Advance Deployment +3", unit spread 3"; p112 Cavalry Charge (boosted charge attack rolls); p118 encounter levels (Skirmish 50, ≥1 non-lesser Cohort, no battle engines/colossals/gargantuans, up to 4 points under) and the 50-point sample army; p119–120 characters, FA, battlegroups |
| SR | `WM-Steamroller-2026-JanuaryRules.pdf` (+ printer-friendly copy) | p2 setup order; p3 objectives, scenario terrain, Kill Box; p4 tiebreaks; p5–11 scenario scoring and fixed game length (Defender's 7th turn); p14 clock (50 points = 30 min per player); p15 terrain guide (10–14 pieces, 24" quadrants). The maps are images; their 6"/11" zones are taken from `91-cards-steamroller-clock.md` SR2, which rendered them |
| TF | `WM-Steamroller-2026-TalesFromTheFrontlines_1__compressed_1.pdf` | p3 casual scenarios "most balanced at 50pt games"; p4 Execution Mode recommended at ≤50 points, Kill Box optional for learners; p5 10–12 terrain pieces; p15 journeyman league stages 30 → 50 → 75 → 100 and the note that each Command Starter is exactly 30 points |
| QS | `WM-Quickstart Guide_JUL-2025.pdf` | 6"/11" zones at 36" (already in 11 S1) |

## 2. What players field (Longshanks)

Site: https://warmachine.longshanks.org/ (public tournament records). Method:

1. Event history pages https://warmachine.longshanks.org/events/history/?page=1 to `?page=24` (576 events, dated
   2026-05-06 to 2026-10-05).
2. For each event, the standings panel
   `https://warmachine.longshanks.org/events/detail/panel_standings.php?event=<id>&section=player`; each round row
   names both players' Leader ("Caine 4 - Storm Legion", "Vilkul - Winter Korps", ...). 598 player-events matched one of
   our Leaders, in 299 events.
3. Each matching player's public lists:
   `https://warmachine.longshanks.org/admin/players/pop_info.php?player=<p>&event=<e>&tab=list` (511 had public lists).
4. Lists were split per Leader card name (Major Allister Caine; Kapitan Zahara Vilkul; Captain Gunnbjorn; Tanith the
   Feral Song; Wraithbinder Nekane; Feora, Marshal of the Flameguard), duplicates per player removed, and each model
   counted once per list.
5. A second, shorter pass (pages 1–6) collected Devourer's Host and United Kriels lists of any Leader, because
   Tanith's own lists are not public.

| Tag | Data set | Lists | Events |
|---|---|---|---|
| `[LS-cyg]` | Major Allister Caine | 53 (32 Storm Legion, 20 Gravediggers, 1 other) | 46 |
| `[LS-kha]` | Kapitan Zahara Vilkul | 44 (36 at 100, 3 at 75, 5 at 50) | 38 |
| `[LS-trl]` | Captain Gunnbjorn, United Kriels | 4 | 35719 (100 Pt Grognard's July Steamroller), 35301 (Moscow Summer Fest 2026), 28878 (Welsh Masters), 34532 (Warmachine May Layton Steamroller) |
| — | General Gunnbjorn, Kithguard (a different model; not used) | 48 | — |
| `[LS-cir]` | Devourer's Host, any Leader (7 distinct lists) | 7 | 36461 (September Slam), 36578 (UK Nationals 2026), 34778 (QuestCon 2026 Team), 33346 (QuestCon 2026 Iron Gauntlet), 29828 (Spain Masters Freak Wars 2026: the Tanith player, whose Tanith list is not public), 38172 (Utah County Fall Journeyman Stage 2), 34176 (Lone Star Championship) |
| `[LS-cry]` | Wraithbinder Nekane | 21 (16 at 100, 1 at 75, 1 at 50, 2 at 30, 1 Total War) | 20 |
| `[LS-men]` | Feora, Marshal of the Flameguard | 5 | 37660 (Australian Sheep Stations League September 2026), 37783 (What About Second Tournament!?), 37526 (Nawl Wake Me Up When September Full Sends, 3 lists) |

Event pages are `https://warmachine.longshanks.org/event/<id>/`.

### 2.1 The 50- and 30-point lists found (names and costs only)

| Tag | Event | Size | Entries |
|---|---|---|---|
| `[LS-35900]` | 35900 slow grow tournament | 50 | Caine: Deuce 17, Falk 4, Magnus the Unstoppable 20 (+ Invictus), Black 13th 9 |
| `[LS-34613]` | 34613 New Era | 30 | Caine: Deuce 17, Falk 4, Black 13th 9 |
| `[LS-38172]` | 38172 Utah County 2026 Fall Journeyman's League Stage 2 | 50 | Vilkul: Dire Wolf 11 (Accuracy 1, Cannon 5, Heavy Chain Gun 5), Razor 17, AC-2 Bison 9, Lazarenko 4, Hounds 9 |
| `[LS-34007]` | 34007 I'm Holding Out For A Nyrro | 50 | Vilkul: Dire Wolf 9 (Shield Guard 0, Ice Hammer 5, Flame Fist 4), Great Bear 11 (Slammer 1, Battle Mace 6, Blasting Fist 4), Razor 17, Lazarenko 4, Hounds 9 |
| `[LS-34682]` | 34682 Brigandry League 50 Pt Tournament | 50 | Vilkul: Avalanche 15, Battle Mechanik 2, Magnus the Unstoppable 20 (+ Invictus), Lazarenko 4, Hounds 9 |
| `[LS-34090]` | 34090 Approdo del Re Warmachine 50pt (two lists) | 50 | Vilkul: Avalanche 15, Razor 17, Battle Mechanik 2, Sergei Krol 5, Man-O-War Suppressors 11 / Dire Wolf 9 (Shield Guard, Long Axe, Flame Fist), Razor 17, Battle Mechanik 2, Mortar Team 2, Lazarenko 4, Hounds 9, Winter Korps Infantry 6 + Standard 1 |
| `[LS-36739]` | 36739 2026 GRG Journeyman League Week 3 - 50pts | 50 | Nekane: Hades 16, Raptor 5 (Beaked Maw 3, Arc Node 2), Hellslinger Phantom 4, Maulgreth 4, Mechanithrall Brutes 7, Necrosurgeon Initiates 4, Night Terrors 10 |
| `[LS-35176]` | 35176 2026 GRG Journeyman League Week 1 - 30pts | 30 | Nekane: Hades 16, Maulgreth 4, Night Terrors 10 / Raptor 5, Malfessor 15, Criterions 9 |
| `[LS-38172b]` | 38172 (same event) | 50 | Kromac (Devourer's Host): Warpwolf Stalker 15, Wild Argus 6, Gallows Grove ×2 (1 each), Lord of the Feast 5, Tharn Blood Pack 10, Tharn Ravagers 9 + Ravager Chieftain 3 |
| — | 34532 Warmachine May Layton Steamroller (100, United Kriels) | 100 | Captain Gunnbjorn with Dire Troll Bomber ×2, Dozer & Smigg, Troll Whelps ×2, Gunnery Sergeant ×2, Runebearer, Barrage Team ×2, Fennblades ×2 + Officer & Drummer, Highwaymen |

### 2.2 Top counts per Leader (lists containing the model)

- Caine (53): Black 13th 51, Deuce 37, Tempest Assailers 31, Falk 29, Storm Vanes 29, Eilish Garrity (Dark Traitor) 26,
  Legionnaire Officer 25, Eiryss 22, Carver Ultimus 20, Arcane Mechaniks 20, Storm Lance Legionnaires 19, Courser 17
  (builds: Shield Guard 17, Heavy Stormthrower 14, Arc Node 13, Voltaic Punching Spike 11).
- Vilkul (44): Hounds 42, Arkanists 33, Battle Mechanik 29, Winter Korps Officer 29, Shock Trooper Gunners 29, Winter
  Korps Snipers 28, Hunting Dog 28, Razor 25, Behemoth 19, Lazarenko 18, Avalanche 9, Dire Wolf 12, Great Bear 10.
- Captain Gunnbjorn UK (4): Krielstone 4, Stone Scribe Elder 4, Runebearer 4, Dozer & Smigg 3, Gunnery Sergeant 3,
  Troll Whelps 3, Dire Troll Bomber 3, Mountain King 2, Trollkin Scouts 2.
- Devourer's Host (7): Gallows Grove 6, Ravagers 6, Ravager Chieftain 6, Wolf Riders 5, Ravager Shaman 5, Wolf Rider
  Champion 5, Bloodtrackers 4, Warpwolf Stalker 4, Wild Argus 4, Ghetorix 3.
- Nekane (21): Raptor 20 (Arc Node 32 jack-slots, Doomspitter 15, Beaked Maw 12), Night Terrors 18, Necrosurgeon
  Initiates 16, Furies 15, Machine Wraith Dominator 10, Mechanithrall Brutes 9.
- Feora (5): Cleanser Preceptor 5, Flameguard Defenders 5, Vassals of Menoth 5, Revenger 5 (Repulsor Shield 7,
  Light Immolator 5, Skyhammer 5 jack-slots), Pyrrhus 4, Cleanser Sanctifiers 4, Crusader 4, Eye of Truth 3.

## 3. Card data cross-checks

| Tag | Source | Notes |
|---|---|---|
| WA | Warmachine Academy wiki, https://warmachineacademy.miraheze.org/ (MK4 Prime armies incl. Covenant of the Flame; Legacy armies incl. Devourer's Host and United Kriels). Pages read through the MediaWiki API (`/w/api.php?action=query&prop=revisions&rvprop=content|timestamp&titles=...`): Tempest_Assailers (rev 2026-01-18), Storm_Vanes (2026-09-30), Courser (2026-06-06), Dire_Wolf (2026-04-13), Arkanists (2026-01-18), Winter_Korps_Snipers (2026-04-13), Winter_Korps_Officer (2026-06-16), Dozer_&_Smigg (2026-02-08), Trollkin_Runebearer (2026-02-21), Night_Terrors (2026-04-13), Raptor (2026-01-22), Necrosurgeon_Initiates (2026-04-13), Revenger (2026-09-05), Cleanser_Sanctifiers (2026-09-05), Vassals_of_Menoth (2026-09-09), Tharn_Wolf_Riders (2026-04-13), Tharn_Ravager_Shaman (2026-04-13), Wild_Argus (2025-06-27), Warpwolf_Stalker (2025-06-27), Tharn_Wolf_Rider_Champion (2026-04-13), Gallows_Grove (2025-09-24); index https://warmachineacademy.miraheze.org/wiki/Covenant_of_the_Flame (2026-10-03) | Stat rows, unit sizes, base templates (Small/Medium/Large), cost ranges for jacks. No page found for the Krielstone Bearer & Stone Scribes (three titles tried) |
| CD | https://github.com/isorna/wardice-warmachine-data, `mk4/profiles/{cygnar.storm-legion, khador.winter-korps, trollbloods.united-kriels, circle-orboros.devourer-s-host, cryx.necrofactorium, menoth.final-interdiction, menoth.temple-guardians}.profiles.json` (raw.githubusercontent.com, `main`; last commits 2026-07-10 "app data dump", 2026-09-15) | Points, FA, stats, weapons, ability ids, hardpoint costs. No base sizes, unit sizes or Covenant of the Flame profiles |
| — | Steamforged product pages: https://steamforged.com/blogs/brands/now-available-sks6-and-hellslingers-command-cadres, https://steamforged.com/products/warmachine-cygnar-hellslingers-command-cadre, https://steamforged.com/products/warmachine-khador-winter-korps-sks-6-command-cadre, https://steamforged.com/products/warmachine-cryx-necrofactorium-command-starter, https://steamforged.com/products/warmachine-cryx-necrofactorium-auxiliary-expansion, https://steamforged.com/products/warmachine-cygnar-storm-legion-auxiliary-expansion (the Winter Korps auxiliary page answered HTTP 429) | Starter contents (Hellslingers and SKS-6 cadres are the 30-point starters, also usable in Gravediggers); the auxiliary expansions are 30-point add-on boxes (Dekathus + Brutes, Sludge Thralls, Night Terrors, Iron Lich Commander; Calder + Assailers, Thunderers, Storm Lances, Mechaniks, Brisbane, Sharpshooter) |
| — | Covenant of the Flame: https://www.miniaturemarket.com/Warmachine-Menoth-Covenant-of-the-Flame-Scourge-of-the-Unbeliever-Preorder/SFIK-MEN549 (and SFIK-MEN542, -MEN552, -MEN556, -MEN559 listings), https://www.wargamer.com/warmachine/summer-preview-2026-menoth, https://www.brueckenkopf-online.com/2026/warmachine-herbst-vorschau-menoth/, https://frontlinegaming.org/2026/09/02/warmachine-wednesday-menoth-returns-and-cryx-sets-sail/ | Box contents and dates. The army was playable in the official app and on Wartable before release; no free card PDF was found |
| — | https://blessmywold.home.blog/2018/10/11/theory-week-tanith1-in-devourers-host/ | MK3-era Tanith article; context only, no MK4 value taken from it |

## 4. Conflicts and open points

- **Dire Wolf cost.** CD and the older LS lists price the Shield Guard head at 0 (build 9); WA gives the chassis 10–14.
  The chosen build (Accuracy 1, Cannon 5, Heavy Chain Gun 5 = 11) matches the newest list (Oct 2026) and both sources.
- **RB sample army vs CD.** RB p118 prices a Stryker (True Sight, Electro Bombard, Heavy Mag-Bolter) at 17; CD sums the
  same options to 16. Older printing; the app price wins.
- **Scourge of the Unbeliever contents.** Miniature Market lists a Revenger and a Reclaimer; Wargamer's preview lists a
  fixed Crusader instead. Retail listing preferred. Not used by our lists.
- **Covenant release dates.** Wargamer gives 7 Oct 2026 for the Command Set and the jacks; one search snippet said 27 Oct.
- **Tanith.** Three Tanith appearances in the window, no public list; Circle add-ons come from other Devourer's Host
  Leaders. Reddit and blog searches found no MK4 Tanith list.
- **Captain vs General Gunnbjorn.** Longshanks labels both "Gunnbjorn"; the card name in the list separates them.
- **Thin Menoth evidence.** Five lists, three events, all before the kits shipped.
- **Krielstone size and bases.** No WA page; the app is the source for the unit size and the two base sizes.
