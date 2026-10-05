# Handoff: a Warmachine MK4 browser game (sibling to Mallet 42k)

Written 2026-10-04 from the finished Mallet 42k project (https://dragoonant.github.io/mallet-42k/,
repo `dragoonant/mallet-42k`, 132 commits from 2026-09-12 to 2026-10-04).

Goal: a 3D browser tabletop game that ports **Warmachine MK4** mechanics 1:1, with the same SD figure
art, ElevenLabs sound, and dark-and-gold UI as Mallet 42k, and the same polish level.

Read this whole file once. After that, keep your own `HANDOFF.md`, `STATUS.md` and `PLAN.md` in the
new repo, and copy Part B (process rules) into the new repo's `CLAUDE.md` on day one.

Where facts come from:
- Rules facts come from the free MK4 rules-only Core Book (Dec 2025), the Two-Player Quick Start,
  the Steamroller 2025/2026 packets, and the community data repo `isorna/wardice-warmachine-data`
  (Sep 2026).
- Anything marked **(verify)** must be checked against the official free PDF or app before data entry.

---

## Part A: the owner and how they work (read first)

**Priorities**
- **Playable first.** Something the owner can open on Pages and play beats test coverage. Every
  stage ends in something visible: a Pages deploy or screenshots.
- **Metered plan.** Token rules are mandatory, not style advice (see Part B).

**Communication**
- **Check-ins are ≤10 lines**, with a screenshot per milestone. Don't narrate options you won't
  pursue, and don't re-ask settled decisions.
- **Playtest loop.** The owner plays on Pages and gives blunt, specific feedback ("sounds like a
  silenced pistol", "prompts should say what they're about"). Fix it in small commits and push.
- **Rules ambiguities** never block work. The agent records a `RULING:` line (what the rule says,
  what we did, why) in `docs/needs-rules-check.md`, and the owner reconciles them in one sitting.

**Pre-approved actions**
- Pushing to `main` after each stage. Pages deploys from `main`.

**Machines and secrets**
- **The Windows PC with the GPU** does all asset work: Hunyuan3D, Claude in Chrome for Gemini, and
  ElevenLabs. Never route asset work through the Mac.
- **Secrets.** The ElevenLabs key lives only in the untracked `elevenlabs.token.rtf` in the OneDrive
  folder. Pass it through the `ELEVENLABS_API_KEY` env var. Never write, log or commit it, because the
  repo is public. Gitignore `*.token*` in the new repo on day one.

**Settled carryovers (do not re-ask)**
- Mechanics are ported 1:1.
- All prose is in our own words.
- Figures are original SD designs.
- Player vs AI comes first; multiplayer comes later.
- The repo is public on GitHub Pages.

**Open decisions to ask the owner in the first check-in, one message:**
1. **Naming / IP posture.** See Part F. Recommendation: original setting, faction, model and term
   names from day one. Unlike GW, Warmachine's coined words are trademark-like. Mallet 42k kept real
   names and GW iconography as placeholders, and that is a debt to avoid this time.
2. **Working title and repo name**, e.g. a pun in the spirit of "Mallet 42k". Suggest 3 and let
   the owner pick.
3. **Music.** Mallet 42k shipped *no* music tracks, only an ambient loop and stingers. The owner
   asked for "music direction" this time, so propose the music pipeline in Part D.4 and confirm the
   budget.

---

## Part B: process rules (copy into the new `CLAUDE.md`)

These are the rules that worked in Mallet 42k, tightened by its mistakes.

### B.1 Token rules
- **The main loop stays cheap.** It never reads whole source files or hand-writes bulk code. It
  writes Workflow scripts, reads structured JSON results, and checks in with the owner.
- **Model choice.**
  - Implementation and data entry run on Sonnet subagents (`model: 'sonnet'`).
  - Spec writing and adversarial verification run on the session model at `effort: 'high'`.
  - Agents return schema-validated JSON, ≤300 tokens.
- **Stage size and cadence.** One workflow stage at a time, ≤8 agents per stage. Commit and push
  after every stage, so an interrupted run never loses finished work.
- **Resume.** Workflow resume (`resumeFromRunId`) works only in the same session.
- **Prompts point, they don't paste.** Specs live on disk. Prompts say "read spec section X, build
  Y", never with the spec pasted in.
- **Freeze interfaces before fan-out.** This was the number one rework sink.
- **Cap research.** Mallet's biggest token sinks were:
  - rules research inside verify agents;
  - verify agents re-reading whole specs;
  - a blocked-agent probe that wasted about 2M tokens.

  So: at most 3–6 WebFetches per agent, name the exact spec sections, and probe a new setup with
  one cheap agent before fanning out.
- **Lean mode is the default** (`args.lean: true`): implement and commit, with no adversarial verify
  loop and about 10 focused tests. Turn verify loops on only for rules-dense content, such as each
  new faction, or when the owner asks.
- **Token reference points from Mallet:**

  | Stage | Tokens |
  |---|---|
  | Foundation specs | ~1.2M |
  | Engine core | ~0.5M |
  | Data entry with verify | ~2M |
  | Main loops | ~0.35M |

### B.2 Workflow script pattern
This is the pattern behind Mallet's `tools/workflows/*.js`. Copy `w1-stage.js` and `w10-faction.js`
as templates.

- **Header.** `export const meta = {name, description, phases}`, then
  `agent(prompt, {label, phase, schema, model|effort})`, `parallel([...])` and `phase('X')`.
- **Schemas.**
  - `RESULT = {ok, summary, files[], issues[]}`
  - `VERDICT = {verdict: 'ok'|'needs-fix', coverage:{covered,total}, failing:[{id,description,fix}], notes}`
  - `FINDINGS = {ok, findings:[{owner: 'spec'|'data'|'engine'|'client', where, problem, fix}]}`
- **A `COMMON` preamble in every prompt.** It contains:
  - the absolute project root ("use absolute paths, the cwd resets");
  - "orient from STATUS.md only";
  - the IP rule;
  - the frozen-contract rule;
  - **"run long commands in the FOREGROUND"**. Sonnet agents that background `npm test` stall.
- **File ownership.**
  - Every agent prompt says "You own ONLY: …", and concurrent agents own disjoint files.
  - Verify agents never edit.
  - Each finding carries an `owner`, and you route it to the agent that owns that file. Narrow fix
    agents correctly refuse out-of-scope findings, and Mallet lost a round to that.
- **Full build loop** (non-lean): implement on Sonnet, then adversarial verify on the session model
  (high effort; it writes new `*.verify.test.ts`), then ≤2 fix rounds (first Sonnet, then the
  session model), then a Sonnet commit agent. "ok" requires green tests, no major fidelity issue,
  and ≥90% checklist coverage.
- **Shipping a faction** (Mallet's `w10-faction`): checks, then
  `npm run sim -- --games 6 --seed 5`, then an e2e spec plus screenshots, then update STATUS.md,
  append rulings, rebase on origin/main, and push.

### B.3 Concurrency and git hygiene
- **Shared working tree.** Concurrent agents never run `npm install` or `git commit`, and never edit
  `package.json` or `STATUS.md`, unless told to. Concurrent installs corrupted `node_modules`. Only
  commit and integration agents install.
- **Parallel factions run in git worktrees** (`.claude/worktrees/<name>`), one Workflow run each.
  Each agent must call `EnterWorktree` first, because a harness hook refuses Edit/Write into a
  sibling worktree even with a directory grant. Shared registries (STATUS, rulings, checklist, sound
  and figure maps, sim faction lists) merge by keeping both sides.
- **Stage files by exact path** when other sessions share the tree.
- **After an interrupted run:** run `git status`, then
  `npm run typecheck && npm test && npm run validate:data`, and commit by hand. Park
  half-finished work on a `wip/<stage>` branch.
- **Paths.** The repo must sit inside the session's working directory. The Workflow tool rejects a
  `scriptPath` outside it.
- **Commit messages.** `M<n>: <what>`, a blank line, then the Co-Authored-By line for the current model.

### B.4 Verification (automated, lean)
- `npm run typecheck`, `npm test`, `npm run validate:data`, `npm run sim` (headless bot-vs-bot with
  invariant checks), and one Playwright full-game playthrough. Mallet's `play-fast.spec.ts` plays a
  full game in about 7.5 minutes.
- **Name engine tests by checklist ID**, e.g. `it('ATK-012 ...')`. Coverage is measured by test
  names against `docs/spec/12-rules-test-checklist.md`, not by line coverage.
- **Playwright serves the Pages sub-path.** It builds, then runs `vite preview --port 4173` at
  `/<repo>/`, so base-path bugs show up locally.

---

## Part C: tech stack and architecture (reuse Mallet's, nearly verbatim)

### C.1 Stack
- **Libraries:** Vite 8, TypeScript 7, React 19, three 0.186, @react-three/fiber 9, drei 10,
  zustand 5, Vitest 5, Playwright, ajv + ajv-formats, tsx, and `@breezystack/lamejs` for mp3 encoding.
- **Node 22 in CI.** Vitest 5 prints a harmless EBADENGINE warning on Node 25.
- **TS 7 config:** `paths` without `baseUrl`, with `@/` → `src/`.
- **Vite `base`** is `/<repo>/` in production only. Every asset URL uses `import.meta.env.BASE_URL`.
- **Deploy.** `.github/workflows/deploy.yml` runs on push to `main`: `npm ci`, typecheck, test,
  build, `upload-pages-artifact dist`, deploy. Copy it verbatim.

### C.2 Layout (copy the shape)
```
src/engine/        pure rules engine: (GameState, Action) -> events + new state + exactly ONE PendingDecision
  types.ts actions.ts events.ts hooks.ts rng.ts decider.ts index.ts   <- FROZEN after M0
  geometry.ts los.ts measure.ts terrain.ts dice.ts attack.ts damage.ts focus.ts spells.ts
  power-attacks.ts movement.ts scenario.ts effects.ts code-hooks.ts
  phases/{maintenance,control,activation}.ts
  factions/<id>.ts                     per-faction code hooks only
src/data/          core/, scenarios/, terrain/, factions/<id>/{faction,abilities,weapons,spells,feats}.json,
                   models/*.json, lists/*.json   (validated by tools/validate-data.ts against docs/spec/schemas/)
src/ai/            utility decider, closed-form 2d6 expected-damage math, threat maps
src/client/        store/ (zustand, the ONLY caller of engine.step), board/, figures/, interaction/,
                   presentation/ (director + presentedStore + announceStore), ui/, dice/, vfx/, audio/
tools/             sim.ts, sim-core.ts, ai-bench.ts, validate-data.ts, gen-audio.ts, compose-audio.ts,
                   measure-audio.ts, audio-manifest.json, audio-src/, workflows/*.js
docs/spec/         00-architecture 10-rules-core 11-scenarios 12-rules-test-checklist 20-data-schema
                   30-figures 40-ai 50-client 60-testing factions/<id>.md schemas/
docs/needs-rules-check.md
art/unit-concepts/*.png + PROMPTS.md, art/archive/
public/assets/{models,terrain,ui}, public/audio, public/sounds.html
tests/{engine,data,ai,client,e2e,fixtures}
```

### C.3 Engine principles that paid off
- **Pure, seeded, replayable.** The engine has a seeded RNG, an action log, and
  `save/load/replay`. It never imports data; data is passed in as a bundle.
- **Illegal input is rejected, never thrown.** `step` returns a rejection with a code
  (`E_WRONG_DECISION`, …).
- **The same Decider interface for humans and AI.**
- **`legalActions` must never be empty for an open decision.** Feasibility means "some candidate
  passes full validation", not "the planner's preferred arrangement fits". Mallet froze twice on
  this.
- **Data-driven mechanics.** Abilities are declarative JSON (conditions, effects, scopes,
  durations), with `{"code": "<hookName>"}` escape hatches registered in `code-hooks.ts`.
  Warmachine's card density makes this mandatory, not optional.
- **One generic mechanism per concept from the start.** Mallet ended with three duplicate
  deferred-death mechanisms across factions. Warmachine's disabled → boxed → destroyed windows
  (Tough, death triggers) must be **one** core mechanism.
- **The engine owns every number the UI shows.** Hit target, damage target, LOS verdict and scenario
  control all come from the engine. Mallet computed objective control client-side and computed
  save numbers as `Sv − AP`, which silently ignored cover. Both were bugs.
- **Read targets from state, not from events.** A re-roll window opened before the roll event was
  emitted, so the UI showed the *previous* roll's target. Pin this ordering with a test.

### C.4 Client principles that paid off (build these in M3, not retrofitted)
- **A presentation director plus a presented-state store.** The UI shows state as of the animation
  cursor. The bot proceeds only when presentation is idle, with a 5 s no-progress watchdog that
  force-answers bot-owned decisions. A bot acting ahead of animations caused many Mallet fixes.
- **Decision prompts that explain themselves.** Every prompt names the attacker, the target, and the
  exact numbers ("Boost? 2d6+7 vs DEF 14, 58% → 83%"). This was retrofitted across about 8 Mallet
  commits; build it on day one.
- **Generic multi-faction client from day one.** No hard-coded two-faction logic. Mallet had to grep
  for `'orks'` and `'space-marines'` later.
- **Performance from the start**, before the generated GLBs land: a demand frameloop, a dpr cap,
  on-demand shadows at 1024, shared figure geometry and materials, and a Low graphics setting.
  Triangles dominate cost, not draw calls.
- **Test hooks.**
  - `?test=1` exposes `window.__game` (rename of `__mallet`).
  - Invisible DOM proxies `model-<id>` carry `data-x` and `data-z`.
  - `data-testid` follows `<area>-<element>[-id]`.
  - `?gallery` shows the figure gallery, and `?spike=` shows a perf overlay.
- **E2E faction picks match exact text.** A Mallet test that picked "Chaos Space Marines" matched
  "Space Marines".

### C.5 Conventions for Warmachine
- **Units and axes.** 1 world unit = 1 inch, y up, board centred at the origin.
- **Board size.** **Recon (30 points) uses 36"×36"**, the Quick Start table. Standard play is
  **48"×48"**. Build for 48 and test at 36.
- **Bases are circles.** Diameters in inches: 30mm = 1.181, 40mm = 1.575, 50mm = 1.969,
  80mm = 3.150, 120mm = 4.724. Each base carries a **LOS volume height**:

  | Base | Volume height |
  |---|---|
  | 30mm | 1.75" |
  | 40mm | 2.25" |
  | 50mm | 2.75" |
  | 80mm | 3.25" |
  | 120mm | 5" |

- **Measurement.** All distances are measured **base edge to base edge**. Premeasuring is always
  allowed, so the ruler is a first-class tool and not a cheat.

---

## Part D: art, sound and music direction (same look as Mallet 42k)

### D.1 Figure style
- **"Master grade SD."** Gundam SD model-kit proportions, explicitly **not chibi**. About 3 heads
  tall, with the head about a third of total height. Short compact torso, short sturdy legs,
  oversized hands and weapons, crisp hard-surface detail, and a plain round black base.
- **House reference:** `C:\Users\antho\Hunyuan3D-2\refs\librarian.webp`.
- **Warmachine translation.** Steam-powered robots ("war-engines") are the stars, so give them chunky
  boilers, smokestacks, rivets and oversized fists. Make them *heavier* than infantry in silhouette,
  not just bigger. Casters get exaggerated staffs, guns, coats and armour. Iron Kingdoms flavour is
  gaslamp and steampunk-fantasy, so our original factions should read as "industrial blue-and-gold
  republic" vs "frozen red-and-iron empire" archetypes without copying SFG designs, icons or names.
- **Original markings from day one.** No SFG icons, cogs-with-swords or faction symbols. Mallet kept
  GW icons as placeholders and now owes a cleanup pass.

### D.2 Concept images: Gemini via Claude in Chrome
- **Browser.** Use Claude in Chrome on the **Windows PC**, signed into the owner's Google account.
  First run `list_connected_browsers` and confirm a Windows browser is connected, or ask the owner.
  Never use the Mac or the built-in browser, which is not signed in.
- **One Gemini chat per faction**, for style consistency. File name = GLB slug
  (`art/unit-concepts/<slug>.png`).
- **First prompt template:**
  > Generate an image of a [ORIGINAL DESCRIPTION: e.g. "steam-powered heavy war robot with a boiler
  > on its back, a riveted iron hull painted deep blue with brass trim, a huge mechanical fist and a
  > shoulder cannon"], in master grade SD (super deformed) style proportions like a Gundam SD model
  > kit, not chibi: about 3 heads tall, slightly oversized head and limbs, but crisp hard-surface
  > model-kit detail. Full body, neutral standing pose, front three-quarter view, standing on a
  > plain round black base. No background (plain white), even soft lighting, no shadows, no text,
  > no logos or emblems.
- **Follow-up prompts:** "Same style, proportions, framing, base and plain white background: now a …"
- **Reject at generation time** if there are two figures, the figure is cropped, it is too
  realistic, or the base is not round. Regenerate in the same chat with "exactly ONE single figure,
  centred".
- **Write down base size in the prompt context.** Warmachine is base-size-sensitive: a heavy
  war-engine on 50mm must look far bigger than a 30mm trooper.
- **Download images with in-page JS (`javascript_tool`).** The "Download full size" button is
  unreliable.
  - For `blob:` images, draw to a canvas and call `toDataURL('image/png')`.
  - For lh3 images, `fetch(src.split('?')[0] + '?alr=yes', {credentials:'include'})`. The body may
    be text holding another URL (a chain of 2 or more redirects); follow it until the blob type is
    `image/*`.
  - `=s0` and `=s2816` are blocked, so images come out 1024×559. That is fine, because Hunyuan
    downsamples to about 512.
  - Scroll each response into view and wait about 800 ms first. Gemini image N is the Nth
    `model-response` element.
  - Bundle `{slug: dataURL}` into **one** JSON download per tab (Chrome allows one automatic
    download per tab).
  - `javascript_tool` times out at 45 s. Start long loops un-awaited and poll `window._log`.
  - Background tabs are throttled, so screenshot the tab to bring it forward. A stuck "Stop
    response" needs a reload plus a real click on Send.

### D.3 3D figures: local Hunyuan3D pipeline (Windows PC, outside the repo)
- **Folders.**
  - `C:\Users\antho\Hunyuan3D-2`: Python 3.11 venv for SDXL, cutout and texture paint.
  - `C:\Users\antho\Hunyuan3D-2.1`: Python 3.10 venv for shape and bpy finalize.
- **Tools and data files.** `uv` is at `~\.local\bin\uv.exe`, with `UV_SYSTEM_CERTS=1` (the PC
  re-signs HTTPS). Data files sit in the 2.0 folder: `units.json` (prompt, height in inches, base
  mm) and `picks.json` (slug → seed or absolute PNG path).
- **Stages:**
  1. *(optional, skip with Gemini)* `concepts_sdxl.py`. For non-blue factions, use
     `--style 0.2 --avoid "blue armour"` or the librarian reference turns everything blue.
  2. `stage_cutout.py <slugs>` (2.0 venv)
  3. `stage_shape.py --only <slugs> [--nocut <slug>]` (2.1 venv, about 90 s per model). Display
     bases are auto-cut; `--nocut` is for floor-length capes or robes.
  4. `stage_paint.py --only <slugs>` (2.0 venv, about 20 s each)
  5. `..\Hunyuan3D-2.1\.venv\Scripts\python.exe stage_finalize.py <repo>\public\assets\models <slugs>`
     scales to inches, adds a black base cylinder and a matte material, and writes `<slug>.glb` plus
     `outputs\final_contact_*.png`. **Look at the contact sheets before wiring.**
- **Targets and throughput.** About 10k faces and a 1024 texture per figure; terrain is about 15k
  faces. A 5-model batch takes about 12 minutes. Do one faction per batch (≤9 models), then
  finalize, wire, commit and push.
- **Gotchas.**
  - Don't upgrade `transformers` 4.48.3 or `diffusers` 0.32.2 in the 2.0 venv.
  - Weights are plain files under `~\.cache\hy3dgen`, because HF symlinks fail without Developer
    Mode.
  - PowerShell 5.1 writes JSON with a BOM, which breaks `json.load`, so write without a BOM.
  - The viewer is `view_models.bat` (port 8765).
- **Base sizing per model.** Set the finalize height and base from the model's real MK4 base:

  | Model class | Base | Height |
  |---|---|---|
  | Infantry | 30mm | ~1.15–1.3" |
  | Light war-engine | 40mm | ~1.8" |
  | Heavy war-engine | 50mm | ~2.3–2.6" |
  | Colossal | 120mm | ~4.5" |

  Measurement uses the base, not the mesh, so the mesh just has to sit on the right base.
- **Game side** (copy Mallet's `src/client/figures/{glbModels.ts,GlbBody.tsx,glbLoader.ts,glbPaint.ts}`).
  - `GLB_SLUG_BY_MODEL` plus `ENABLED_GLB_SLUGS` map models to GLBs, with a procedural fallback if
    a GLB is missing.
  - Before overwriting GLBs, `git mv` the old ones to `art/archive/` in the same commit, so `main`
    never has a slug enabled without its file.
- **Army painter.** GLB textures are baked, so a fragment shader remaps each faction's two dominant
  hues (`SOURCE_HUES`) to the chosen colours and leaves low-saturation texels (metal, black) alone.
  Materials are cloned per (source, paint) and cached, and the base is recoloured separately.
  **Design for this up front:** pick a clean two-hue scheme per faction in the concept prompt.
- **Warmachine-specific figure needs that Mallet didn't have:**
  - **Weapon loadouts.** War-engine hardpoints let players swap arms and heads. A fused GLB can't
    show that, so either generate one GLB per common loadout or, better, generate arms and weapons
    as separate GLBs on hand and shoulder sockets. Decide in M3; Mallet never solved "weapon matches
    loadout".
  - **Status visuals.**
    - Knocked-down pose: tip the figure onto its side.
    - Stationary: an ice or stun overlay.
    - Crippled systems: sparks or smoke from the arm, legs or head.
    - Focus tokens: glowing orbs orbiting the war-engine, 0–3.
    - Fury counters later.
    - Clouds: 3" translucent smoke domes.

### D.4 Sound and music
**SFX and voice pipeline (copy Mallet's tools verbatim):**
- **Endpoint and voice.** `POST https://api.elevenlabs.io/v1/sound-generation` with
  `{text, duration_seconds, prompt_influence}` and an `xi-api-key` header. Narrator TTS uses
  "Harry - Fierce Warrior" (`SOYHLrjzK2X1ezoPC6cr`, `eleven_flash_v2_5`). Consider a second,
  steampunk-officer voice to set this game apart.
- **Manifest.** `tools/audio-manifest.json` items are `{id, kind: sfx|voice, prompt|text,
  durationSeconds, promptInfluence, loop?}`, mirrored at runtime in `src/client/audio/manifest.ts`.
- **Generation.** `tools/gen-audio.ts` is idempotent and skips existing files. To redo a sound, edit
  the prompt, delete `public/audio/<id>.mp3`, and rerun. It has a per-run budget
  (`RUN_BUDGET_CREDITS = 12000`). The Starter tier is about 29k credits a month; 40 SFX cost about
  470 credits.
- **Audition.** `public/sounds.html` is the audition page (one `<audio>` playing at a time). The
  owner listens on Pages and names the sounds to redo; regenerate only those.
- **Loudness.**
  - `npx tsx tools/measure-audio.ts <prefix>` prints decoded RMS, peak and crest factor.
  - Target RMS is about 0.15–0.18. Gunshots need crest ≥8; about 2 means the transient was
    squashed.
  - Trim with per-asset multipliers (`WEAPON_TRIM`, `DEATH_TRIM`, ≤1) in `eventSounds.ts`.
    Raw files range about 0.05–0.40 RMS, so trims are standard.
  - Re-measure after every regeneration. **Ship the measure tool and trims with the first SFX
    batch**, not after the owner complains: Ork guns were 3× louder than Marine ones.
- **Layer instead of re-prompting.** When the owner likes a sound but wants more of it,
  `tools/compose-audio.ts` layers clips from `tools/audio-src/`. For example, Mallet's boltgun was an
  approved single shot made into a 4-round burst.
- **Weapon flavour classification is the first thing to build.** Mallet's
  `client/weaponFlavour.ts` maps every weapon to one flavour, and **both** sounds and VFX read it.
  Without it every gun played one sound and several generated files were never heard. Match per
  weapon by the longest slug contained in the weapon id.
- **Prompt lessons:**
  - Describe the *mechanism*, not the name. "Bolter" alone sounded like a silenced pistol.
  - State exclusions explicitly ("no music", "no clicks", "no croaking").
  - `promptInfluence` is 0.45–0.75; use 0.7–0.75 when the sound must follow the prompt literally.
  - Durations are 0.5–1.5 s, and deaths 1.2–3 s.
- **Audio manager.** Web Audio, unlocked lazily on the first click. Master, sfx, voice and music
  volumes plus mute are persisted. Throttling turns 20 simultaneous shots into a few layered
  sounds, with detune jitter. Perspective-aware lines ("your turn", victory or defeat).

**Warmachine sound list to plan (first pass, about 60 files):**
- **War-engine footsteps** (heavy iron clank plus hiss) and a **boiler idle and steam vent**.
- **Fist and axe impacts on iron.**
- **Power attacks**, each distinct:
  - slam: iron collision, a body thrown and skidding;
  - throw: a grunt of pistons, then a crash;
  - headbutt: a dull iron clang;
  - trample: rapid stomps and crunches.
- **Guns:** pistols, magelock rifles, carbine, chain gun, slug cannon, grenade launcher thump,
  bombard boom, scattergun spray.
- **Arcane spells:** a crackling arcane bolt, a frost burst, a lightning arc. Also a **focus
  allocate** chime, and a **boost** "charge-up" whine before the dice roll.
- **Damage-grid sounds:** system crippled (sparking, a grinding gear), war-engine wreck (boiler
  rupture and collapse).
- **Deaths:** per-faction trooper deaths, a caster death sting (assassination), and Tough saves
  (a grunt and a stagger).
- **Clouds and fire:** a smoke hiss, fire crackle, corrosion sizzle.
- **Narrator lines in our own words:** control phase, activation, "Boost!", "Critical!",
  "Assassination!", scenario scored, victory, defeat.
- **UI and dice:** clicks, dice rattle (2d6 and 3d6), a turn bell.

**Music, a new pipeline (Mallet had none):**
- **Use ElevenLabs Music** (the `music` endpoint, if the owner's plan includes it). Otherwise use
  another generator the owner approves, or CC0 tracks with credits in `public/audio/CREDITS.md`.
  Confirm cost with the owner first.
- **Tracks:**
  - a title theme (60–90 s, loopable);
  - 2–3 battle loops (2–3 min, seamless, low-mid intensity so SFX sit on top);
  - a tension layer for when a caster is threatened (optional, crossfaded);
  - victory and defeat stingers.
- **Direction:** industrial-orchestral steampunk, with brass, low strings, taiko or anvil
  percussion, and a rhythmic machine pulse. **No vocals.**
- **Mixing:** music bus well under SFX (about −14 dB relative), ducked −6 dB under narrator lines,
  and crossfades ≥1.5 s. Add the music tracks to `sounds.html` for audition and use the existing
  "music" volume slider.
- **Lengths:** keep prompts short and generate 2–3 candidates per track; the owner picks by ear.

### D.5 Board, terrain, lighting and UI
- **Terrain textures.** CC0 Poly Haven at 1k, credited in `public/assets/terrain/CREDITS.md`.
  Mallet's battle-scarred FFT-noise ground generator is `art/board-textures/gen.py`; re-run it at
  36×36 and 48×48 (about 46.5 ppi).
- **Warmachine terrain set:**

  | Piece | Size | Rules type |
  |---|---|---|
  | Walls | about 4–5" long | Obstacle under 1" tall: cover, +2 DEF in melee |
  | Shallow water | | Rough |
  | Forests | | Concealment; LOS through ≤3" |
  | Hills | | Elevation |
  | Trenches | 3"×5" | Cover, Resistance: Blast |
  | Buildings | | Obstructions, 1" or taller |
  | Rubble | | Rough |
  | Hazards | | Burning earth, acid bath |

  The starter box ships 4 walls and 2 shallow-water pieces, which is enough for the first slice.
- **Each piece carries its rules type**, and the engine reads that type, never the mesh.
  - Mallet rendered ruins semi-transparent and height-capped so they never hid units; keep that
    approach.
  - Mallet fitted generated terrain GLBs to engine footprints with `ruinFit.ts`; reuse it.
- **Lighting.** Ambient, fill and a sun key light, so shaded faces keep their colour. Add a
  gaslamp-orange rim or fog for mood. Add distant ambience such as factory whistles and far-off
  cannon.
- **UI theme.** Dark charcoal and gold: `--bg:#14161a; --fg:#e8e6e1; --card:#1e2127;
  --accent:#c9a227`. Consider brass or copper (`#b87333`) as a second accent.
- **Start screen.** Title art (Gemini) that scales by height and fits one screen on wide or short
  windows. The setup panel has 3 columns: faction and list for both sides, bot strength, scenario,
  army painter and a Settings popover. Mallet's last commit fixed exactly this.

---

## Part E: the Warmachine MK4 rules, as the engine must implement them

**Primary sources.** Use the free official PDFs and the free app. Write every word of our docs in our
own words.
- https://steamforged.com/products/warmachine-rules-only-pdf: the core rules plus the timing
  appendix. This is the source of truth.
- https://steamforged.com/products/warmachine-quick-start-guide-pdf: Cygnar vs Khador 30-point
  lists and a worked first turn with real rolls. **Turn that worked turn into a golden replay
  test.**
- https://steamforged.com/collections/warmachine-resources: Steamroller 2025/2026 and the
  templates.
- https://warmachine.gg/pages/warmachine-app: the official cards. **Stat lines come from here.**
- https://github.com/isorna/wardice-warmachine-data: MK4 JSON (stats, grid layouts with system
  letters, hardpoints). Use it only to **cross-check** numbers you enter yourself; never ship its
  files.
- https://home.privateerpress.com/2022/07/27/mkiv-beta-rules-and-change-comparison/: the MK3 → MK4
  delta. Guard against MK3 knowledge leaking in.

steamforged.com rate-limits automated fetches (HTTP 429). If that happens, ask the owner to
download the PDFs into `docs/sources/` (gitignored) and read them locally.

**Balance updates.** MK4 had balance updates in January 2026 and mid-2026: lower MAT, RAT and RNG,
5 dual-mode command cards, Defenses as point-cost items, and reportedly fixed spell lists instead of
spell racks **(verify)**. Keep **all** numbers in data, and record the app version the data was
taken from in each faction file.

### E.1 Format for the first release
- **Recon, 30 points.** The Leader (caster) is free, and the list must contain ≥1 non-lesser
  war-engine. This is the Combat Patrol analogue and matches the official two-player starter box.
- **Table and deployment.**
  - Table: 36"×36". Deployment depth: 6" for the first player and 11" for the second (the QS demo
    values).
  - At 48": 7" and 10" **(verify against scenario diagrams)**.
  - Advance Deployment allows +3".
  - Unit models deploy within 3" of each other.
- **Turn order.** The higher d6 roll chooses first or second player; the other player picks the
  table edge.

| Level | Points | Notes |
|---|---|---|
| Recon | 30 | No battle engines, colossals or gargantuans |
| Skirmish | 50 | Same restrictions as Recon |
| Pitched Battle | 75 | |
| Grand Melee | 100 | |

Lists may come in up to 4 points under the level.

### E.2 Dice
- **Everything is d6, mostly 2d6.** A d3 is a d6 halved and rounded up. Other halving rounds up,
  except distances, which stay exact.
- **Attack roll.** 2d6 + MAT, RAT or AAT, and it hits if the total is ≥ the target's DEF.
  - All 1s always miss. All 6s always hit, unless only one die is rolled.
  - A **critical** is any two dice matching on a hit.
  - Auto-miss beats auto-hit. You may choose to roll anyway to fish for a crit.
- **Damage roll.** 2d6 + POW − ARM, minimum 0. Resistance to a damage type removes one die (only
  one, even for multiple types).
- **Boost.** +1 die, declared **before** rolling, and at most once per roll. Additional dice from
  different rules stack separately.
- **Rerolls** resolve before hit or miss triggers.
- **Stat modifier order.** "Set" applies first, then ×2, then ½, then bonuses, then penalties, with
  a floor of 0. Same-named effects don't stack.
- **AI math is closed form.** The 2d6/3d6 distributions are exact, so expected damage and kill
  probability can be convolved exactly. Mallet's closed-form approach transfers directly.

### E.3 Models, stats and damage
- **Model stats:** SPD, AAT, MAT, RAT, DEF, ARM, ARC (the focus/fury cap and refill), CTRL (control
  range in inches, measured from the base edge), FURY and THR (beasts only, later), and hardpoints.
- **Weapon stats:** RNG (or SP X for spray), ROF (can be "d3+1"), AOE, POW (an AOE weapon shows
  direct/blast, e.g. 14/8), and location (L, R, H, or S).
- **What MK4 removed:** STR, the old FOCUS stat, facing, back arcs, free strikes, coherency, unit
  leaders and AOE scatter.
- **Model types:**
  - Leader: the caster, always a character.
  - Cohort war-engines:
    - light: 40mm;
    - heavy: 50mm;
    - super-heavy: 80mm;
    - colossal: 120mm, with 2 grids.
  - Solos.
  - Units: grunts, plus ≤1 command attachment and ≤3 weapon attachments.
  - Battle engines and structures: 120mm.
- **Damage capacity:**
  - Troopers have 1 box.
  - Casters have a single row (about 15–18 boxes; **verify** Caine and Vilkul).
  - **War-engine grid:**
    - 6 columns; roll d6 for the column and fill top-down.
    - When a column is full, spill into the next column to the right, wrapping 6 → 1.
    - System letters mark subsets of boxes. Filling all boxes of a letter cripples that system, and
      healing any of them un-cripples it.
    - A typical heavy has 30 boxes in columns 4/5/6/6/5/4, with systems in the bottom rows: L in
      columns 1–2, M in 2–3, H in 3–4, C in 4–5, R in 5–6 **(verify per model)**. Big heavies have
      34 boxes (5/6/6/6/6/5).
    - A light has 26 boxes (3/5/5/5/5/3).
- **Crippled effects:**

  | System | Effect |
  |---|---|
  | Arm / weapon (L, R, H weapons) | −1 die on attack and damage with weapons there; no power or special attacks with them; shield ARM is lost |
  | Movement (M) | Base DEF 5; no run, charge, slam or trample |
  | Cortex (C) | Loses all focus; can't gain or spend focus |
  | Head (H) | Loses head-granted rules |
  | Arc Node | Loses Arc Node |

- **Colossals:** the attacker picks which of the two grids takes damage; other damage rolls d6
  (1–3 left, 4–6 right).
- **Death states:** disabled, then boxed, then destroyed, with trigger windows between each. For
  example, **Tough**: on a 5–6, heal 1 and become knocked down.

### E.4 Turn structure
Rounds are made of player turns. Each player turn runs Maintenance → Control → Activation.
Start-of-turn effects resolve before Maintenance.

**Maintenance**
1. Remove all focus from war-engines. Trim casters down to ARC.
2. Continuous effects roll d6 each: on 1–2 the effect expires; otherwise it resolves. Fire is a
   POW 12 damage roll; corrosion is 1 damage.
3. Resolve other maintenance effects.

**Control**
1. Casters refill to ARC.
2. **Power up:** each war-engine with a working cortex inside its caster's CTRL gains 1.
3. **Allocate** focus to war-engines in CTRL. A war-engine can hold at most **3**.
4. Pay upkeeps at 1 each, or the spell ends.
5. **Shake** knockdown, stationary or shakeable effects for 1 focus each.
6. Casters **start the game** with focus equal to ARC.

**Activation**
- Every model and unit activates once, in any order.
- Each activation is **Normal Movement, then Combat Action**. Spells can be cast "any time" in the
  caster's activation, except mid-move or mid-attack.

### E.5 Movement
- **Normal Movement options:**
  - **Forfeit.**
  - **Aim:** no move, +2 to ranged attack rolls; not while engaged.
  - **Full advance:** up to SPD.
  - **Run:** SPD + 5"; forfeits the Combat Action and ends the activation. A war-engine pays 1
    focus to run.
  - **Charge:**
    - Declare a target in LOS, then move up to **SPD + 3"** in a straight line. The model can't stop
      until the target is in melee range, and stops on contacting a model, obstacle or obstruction.
    - If it moved ≥3", the first attack against the target is a **charge attack**: auto-boosted
      damage (cavalry also boost the attack roll).
    - A failed charge ends the activation. A war-engine pays 1 focus to charge.
    - No charging while engaged.
- **Unit movement (an MK4 change):** move **one** chosen trooper, then *place* the rest within 2" of
  it with LOS to it. Troopers that can't be placed are destroyed.
  - On a unit charge, only the chosen trooper charges; the rest are placed.
  - A placed trooper that leaves the melee range of an engager forfeits its Combat Action.
- **Base contact:** bases never pass through bases.
- **Disengaging:** a model that starts engaged and advances out of an engager's range forfeits its
  Combat Action. There are **no free strikes**.
- **Rough terrain:** −2" off the whole advance, minimum 1", if the model starts in or enters it.
  Not applied to involuntary movement.
- **Obstacles:** cross only with enough movement to clear them completely.
- **Obstructions:** impassable except to Flight or Incorporeal.
- **Involuntary movement:**
  - **Push** stops on contacting anything.
  - **Slam:**
    - The model moves directly away and is knocked down. It passes through smaller bases and stops
      at an obstacle, obstruction, or an equal-or-larger base.
    - +1 damage die if it stops against one of those.
    - Equal-or-smaller models it contacts are knocked down and take **collateral** damage
      (unboostable, and not attack damage).
  - **Throw:** as slam, but it flies over smaller bases, then contacts everything at the landing
    point.
  - **Falling** ≥1": knockdown, POW 12, plus 1 die per extra 2".
  - **Table edge:** the model stops, with no extra damage.
- **Rule of least disturbance:** resolves overlaps by moving the fewest models the shortest total
  distance.

### E.6 LOS and targeting (the hardest system, so build it first)
- **Volumes.** Each model is a vertical cylinder of its base diameter and its volume height.
- **LOS.** A line from any part of A's volume to any part of B's volume, blocked by LOS-blocking
  terrain and clouds.
- **Intervening models** block only if their base is **≥ the target's base**, and a unit's own
  troopers never block each other.
- **Elevation exceptions.** An elevated viewer ignores lower intervening models, except those within
  1" of the target. A lower viewer ignores models lower than its target.
- **No facing.** 360° vision.
- **Range.** Measured from the nearest base edge of the point of origin, which is the model or the
  channelling arc node.
- **Ranged and arcane DEF modifiers:**
  - Concealment: +2, from forests, hedges and clouds.
  - Cover: +4, from walls, rubble and buildings. Doesn't stack with concealment.
  - Elevation: +2 against lower attackers.
  - **Target in melee:** +4. Ignored by Pistol weapons and Assault shots.
  - Knocked down or stationary: base DEF 5.
  - 80mm and 120mm bases never get these bonuses.
- **An engaged attacker** may only shoot models engaging it (unless Gunfighter).
- **Stealth:** ranged or arcane attacks from more than 5" automatically miss.
- **Debug overlay.** Build a LOS overlay that shows *why* each LOS or modifier verdict happened. The
  same overlay becomes the player-facing LOS view; Mallet's measure tool and LoS view were among its
  best features.

### E.7 Combat Action
Pick one:
- an initial attack with each melee weapon;
- ROF attacks with each ranged weapon;
- one special attack (★Attack);
- one special action (★Action);
- one power attack;
- forfeit.

**Mixing attacks**
- Melee and ranged can't be mixed unless the model has **Dual Attack**. All war-engines have it,
  but they can't make ranged attacks after a power attack.
- Additional attacks cost 1 focus each.
- Casters may cast spells alongside attacks.

**Melee**
- **Ranges.** Default melee range is **1"**, reach weapons are 2". Each weapon only hits within its
  own range.
- **Engaged and engaging.** Engaged means "inside an enemy's melee range and LOS"; engaging means
  the reverse. An engaged model at the start of its movement can't run, charge or slam.
- **Modifiers.** +2 DEF if the target is partly obscured by an obstacle or obstruction. Auto-hit
  against knocked-down or stationary targets.

**Power attacks** (war-engines pay 1 focus)
- Not allowed in an activation where the model charged, and never as an additional attack.
- POW is **12** if the attacker's base is ≤ the target's base, **14** if it is bigger. Collateral
  damage uses the same comparison against each collateral model.
- **Headbutt:** 1" range (2" for 120mm bases); the target's base can't be larger. On a hit: knocked
  down, then damage.
- **Slam:** uses both movement and the action.
  - Move SPD + 3" directly toward the target, with 1" range.
  - −2 to hit a larger base.
  - The slam effect needs ≥3" of movement; with less, it still hits and deals damage but nobody
    flies.
  - Slam distance is d6", halved if the target's base is larger, +2" from a 120mm base. Then
    knocked down and damage.
  - A failed slam ends the activation.
- **Throw:** needs a non-crippled weapon with the Throw quality; the target's base can't be larger.
  Thrown d6" directly away, knocked down, then damage.
- **Trample:** large bases and up; uses both movement and the action.
  - Move SPD + 3" straight, passing through 30mm bases, stopping at bigger bases or terrain.
  - No disengage forfeit.
  - Then one melee attack roll against each small enemy passed over, resolved simultaneously.

**Ranged**
- **AOE (no templates, no scatter):**
  - On a direct hit, the closest N other models within N" of the target (N = the AOE value) take
    blast damage, with random tie-breaks.
  - On a miss, if the target was in range, only the target takes blast damage.
- **Spray (SP X):**
  - Draw a full-length line from the attacker through the target's centre.
  - Every model whose volume the line crosses gets its own attack roll. Total terrain block
    excludes a model; clouds are ignored.
  - All hits are direct hits, damage is simultaneous, and each roll is boosted separately.
- **Combined attacks:** the primary attacker gets +1 to attack and damage per contributing
  trooper.

### E.8 Focus economy (warcasters; the first release is focus-only)
- **Uses of focus:**
  - **spells:** pay COST; any number per activation if the cost can be paid;
  - **boost:** 1 per roll;
  - **additional melee attacks:** 1 each;
  - **shake:** 1, in the Control Phase;
  - **heal:** 1 focus removes 1 damage, any time in the caster's activation;
  - **Power Field:** when about to take damage, spend up to 1 focus per damage instance to reduce
    it by 5. This is the AI's key defensive reserve.
- **Spells.** Stats are COST, RNG (or SELF/CTRL), AOE, POW, DUR (—, TURN, RND, UP) and OFF.
  - Offensive spells are arcane attacks (2d6 + AAT) and deal magical damage.
  - **Upkeep** costs 1 per Control Phase. Each model or unit can carry ≤1 friendly and ≤1 enemy
    upkeep; a newer one from the same side replaces the older.
- **Channelling** through an Arc Node war-engine in CTRL: the node becomes the point of origin and
  the caster needs no LOS.
  - Not possible if the node is engaged, knocked down or stationary.
  - SELF spells can't be channelled.
- **Feat:** once per game, any time during the caster's activation.
- **Inert war-engine** (its caster died): DEF 5, auto-hit in melee, can't activate.

### E.9 Conditions and continuous effects
- **Knocked down:**
  - no melee range, can't advance, attack or cast;
  - can't engage or be engaged;
  - auto-hit in melee, DEF 5;
  - doesn't block LOS.
  - **Standing up:** forfeit either the Normal Movement or the Combat Action. Forfeiting the Combat
    Action still allows an advance, but no run, charge, slam or trample.
- **Stationary:** like knocked down, but it can't stand up; it expires per its duration or by
  shaking.
- **Disruption** (war-engines): loses focus and can't gain any for a round.
- **Clouds:** 3" templates, giving concealment to a model completely inside. LOS goes into and out
  of a cloud but not through it.
- **Fire and corrosion:** see Maintenance in E.4.

### E.10 Victory and scenario
**Assassination.** You win immediately when the enemy has no Leader left.

**Scenario scoring**
- Scoring happens at the end of each player turn, from the second player's turn 2.
- You **win when you lead by ≥3 VP after scoring on the opponent's turn**. You can't win on your
  own turn.
- **The game lasts 7 rounds.**
- **Tiebreakers:** VP, then "scenario presence" (Leaders count as 10).
- **Kill Box:** from the first player's turn 2, ending your turn with your Leader completely within
  12" of your own edge gives the opponent 2 VP.

**Scenario elements**
- **50mm objective:** secured by a Leader, war-engine or battle engine within 3", with no
  contester.
- **40mm objective:** secured by a Leader, or by a unit with **all** of its remaining models within
  3".
- **Contest:** any enemy within 3", except Leaders, inert, wild or disabled models.
- **Scenario terrain or flags:** held by ≥2 models.
- **First scenario to ship:** a Quick Start-style 30-point scenario. The walls are scenario terrain,
  held by 2 models within 2" and contested within 3". Use **original scenario names**. Add the
  Steamroller-style elements later.

**Chess clock (optional, later).** Steamroller's "deathclock" gives each player 20 minutes at 30
points. It could become a "Timed" setting.

### E.11 MK3 knowledge that must NOT leak in
Agents' training data is full of MK3. Put this list in every rules prompt.

| Rule | MK3 (wrong) | MK4 (right) |
|---|---|---|
| Facing / back arcs / back strikes / free strikes | Present | None |
| Melee range | 0.5" | 1" |
| Run | 2× SPD | SPD + 5" |
| Unit movement | Coherency, unit leader, command range | Move one trooper, place the rest within 2" |
| AOEs | Templates and deviation | Closest-N-models blast; no scatter |
| Stats | STR, FOCUS stat | No STR (weapons have flat POW); ARC replaces the FOCUS stat |
| Power attack POW | STR-based | 12 or 14 by base size |
| Free charge/run for jacks | Yes | Costs 1 focus, unless a 'jack marshal is within 8" |

The Hordes branding is gone; warlocks, beasts and fury live in the same book.

---

## Part F: IP and naming

- **Who owns what.** Steamforged Games (SFG) bought Warmachine and the Iron Kingdoms from Privateer
  Press in June 2024. They own the names (WARMACHINE, Iron Kingdoms, Steamroller, Cygnar, Khador,
  Stryker, Caine…), the card and rules text, the art and the sculpts.
- **Coined terms.** Privateer historically treated warcaster, warjack, warlock, warbeast, steamjack
  and 'jack marshal as trademarks. Treat them as protected.
- **Mechanics and numbers aren't copyrightable.** Expression is: prose, cards, art and sculpts.
- **Recommendation (confirm with the owner):**
  - an original setting, faction, model, ability and scenario names;
  - generic in-game terms ("battle-mage / war-engine / overcharge / arc relay / channel");
  - original figure designs and markings;
  - no SFG logos or trade dress;
  - no "Warmachine-compatible" branding.
- **Internally**, the specs may cross-reference real names in a mapping table
  (`docs/spec/factions/<id>.md` with a "source model" column), so data can be checked against the
  app. The *shipped UI* uses only our names.
- **If the owner chooses Mallet's posture** (real names for units and weapons), apply it
  consistently. Even then, never copy card or rule text and never use SFG art or icons.
- **Community data.** Third-party PDF uploads and the community JSON are research aids only. Never
  commit them.

---

## Part G: the first release content

Mirror the official **Two-Player Starter: "Cygnar vs Khador" at 30 points**. Both armies are
focus-only, and each has one heavy war-engine, a solo and a 3-trooper unit, which exercises grids,
power attacks, AOE, spray, clouds and Tough. Numbers are from community data (Sep 2026, after the
balance update) and are **medium confidence: verify every line in the official app before data
entry.**

**Side A, "blue republic" (Cygnar Storm Legion / Hellslinger cadre)**

| Source model | Pts | Base | Key stats | Notes |
|---|---|---|---|---|
| Major Allister Caine (caster) | 0 | 30 | SPD 7, AAT 6, RAT 9, DEF 17, ARM 13, ARC 6, CTRL 12, ~15 boxes (verify) | Gunfighter, Pathfinder; 2× magic pistols (RNG 12, POW 12); spells Blur, Calamity, Heightened Reflexes, Magic Bullet, Arcane Sight (verify post-2026 list); feat |
| Deuce (character heavy jack) | 17 | 50 | SPD 6, MAT 6, RAT 7, DEF 13, ARM 18, 30-box grid | Cannon L (RNG 12, POW 14, shot types), Crescent Blade R (POW 15, Buckler, Throw), Reposition 3" |
| Capt. Bastian Falk (solo) | 4 | 30? | SPD 6, MAT 6, RAT 7, DEF 15, ARM 12 | Scattergun SP 8, ROF 2, POW 12; Ambush, Advance Deployment |
| The Black 13th (3 troopers) | 9 | 30 | SPD 6, MAT 5, RAT 7, DEF 15, ARM 12 | 2× heavy pistol (RNG 10, POW 12), Gunfighter |

**Side B, "frozen empire" (Khador Winter Korps / SKS-6 cadre)**

| Source model | Pts | Base | Key stats | Notes |
|---|---|---|---|---|
| Kapitan Zahara Vilkul (caster) | 0 | 30? | SPD 7, AAT 6, MAT 7, RAT 7, DEF 16, ARM 15, ARC 6, CTRL 12, ~17 boxes (verify) | Tough, Unstoppable; thrown axe (RNG 8, POW 13), axe (POW 13); spells incl. cloud-maker; feat places clouds |
| Razor (character heavy jack) | 17 | 50 | SPD 5, MAT 6, RAT 6, DEF 11, ARM 19 (+2 shield) | 2× grenade launcher (RNG 10, AOE 2, POW 10/5), slug cannon (RNG 8, POW 16), Ripper Shield (POW 18) |
| Sgt Goran Lazarenko (solo) | 4 | 30? | SPD 6, MAT 5, RAT 7, DEF 14, ARM 16 | 'Jack Buster (RNG 10, AOE 2, POW 14/7), Tough, Ambush |
| The Hounds (3 troopers) | 9 | 30 | SPD 6, MAT 6, RAT 6, DEF 14, ARM 15 | Tough, Shield Wall; carbine (POW 6, armour-piercing), shield (POW 12) |

The Quick Start text is internally inconsistent on some numbers, for example Razor's DEF. The app
wins.

**Next content (Skirmish, 50 points):**
- Blue: a second caster (di Baro or Stryker) plus a light and a heavy (Courser, Stryker chassis),
  and infantry (Stormblades, Tempest Thunderers).
- Red: a second caster (Borisyuk) plus heavies (Dire Wolf, Great Bear) and Winter Korps Infantry.

**Later:**
- 'jack marshals and command cards;
- warlocks and fury (frenzy, transfer, life spirals), probably with Trollbloods or Circle archetypes
  as the third and fourth factions;
- colossals and Execution mode.

Use the faction-at-a-time cadence: owner sign-off gates each next faction.

---

## Part H: milestone plan (ordered by Mallet's hindsight)

Each milestone is one or more lean workflow stages, ending in a push and something visible.

**M0, Foundation (specs + skeleton)**
- Scaffold the repo (copy Mallet's Vite/TS/R3F/Playwright/deploy setup), with a `.gitignore` that
  includes `*.token*` and `docs/sources/`.
- Write `docs/spec/00`–`60`. The frozen contracts (`types`, `actions`, `events`, `hooks`, `rng`,
  `decider`, `index`) must include from day one:
  - focus as a first-class resource;
  - a PendingDecision for every boost, power-field, focus-spend and spell window;
  - the disabled → boxed → destroyed trigger windows;
  - the attack pipeline from the Core Book timing appendix as an explicit event sequence;
  - engine-exported scenario control.
- Write the rules checklist with IDs: `DICE-`, `LOS-`, `MOVE-`, `CHG-`, `ATK-`, `DMG-`, `GRID-`,
  `PWR-`, `AOE-`, `SPR-`, `FOC-`, `SPL-`, `COND-`, `TERR-`, `SCN-`.
- One adversarial review of the specs. **Owner gate:** the naming posture.

**M1, Geometry and LOS engine plus the headless sim, together**
- The circle/sweep collision library: straight-line paths that stop at first contact, pass-through
  rules by base size, place-within-2", and least disturbance.
- Cylinder-volume LOS against terrain prisms, with all the exceptions.
- `validate-data` and `npm run sim` exist from this milestone on.

**M2, Rules core**
- Dice, attack and damage, the turn and phase machine, advance, run, aim, charge, unit placement,
  modifiers, single-row damage, the war-engine grid, focus, spells, feats, power attacks, AOE,
  spray, clouds, continuous effects, Tough, and the scenario plus VP engine.
- Golden test: replay the Quick Start's worked first turn.

**M3, Playable vertical slice on Pages (the most important milestone)**
- Board, terrain, the 8 starter profiles with placeholder procedural figures, and click-to-play.
- From the first client stage:
  - a presentation director and presented store;
  - explanatory decision prompts with exact odds;
  - the ruler, LOS view and threat-range rings (charge = SPD + 3 + reach);
  - a damage-grid card UI;
  - focus-orb allocation;
  - a dice tray.
- A random bot, so the owner can play end to end.
- **Owner gates:**
  - the SD figure look: 2 concept images per side through the full pipeline;
  - the war-engine weapon-loadout approach (sockets or per-loadout GLBs).

**M4, AI opponent**
- A utility decider:
  - activation ordering (buffs, then shooters, then chargers, then scenario movers);
  - sampled move destinations;
  - closed-form expected damage and kill probability;
  - focus allocation as a small knapsack;
  - a threat map.
- **Caster safety as a hard constraint:** keep Power Field focus and stay out of enemy threat
  ranges.
- **Searching for its own assassination lines every turn** is the biggest strength signal.
- Tiers: random, easy, normal. Benchmark with `npm run bench:ai`.

**M5, Art pass**
- Gemini concepts, then Hunyuan GLBs for all 8 profiles, with the army painter, status visuals
  (knockdown tilt, crippled sparks, focus orbs), terrain GLBs and board textures.
- Title art and the start screen.

**M6, Audio and music**
- The weapon-flavour map, about 60 SFX, narrator lines, the measure tool and trims in the same
  stage, and the music pipeline (title plus 2 battle loops plus stingers).
- `sounds.html` audition and owner feedback rounds.

**M7, Polish**
- An event feed with full attack breakdowns: dice, boosts, crits, expected vs actual damage, and
  per-unit damage totals per turn.
- A re-roll tray, an end screen with a VP breakdown, a settings popover, a Low graphics mode, and
  narration pauses (2.4 s per phase, 1.6 s for a turn handover, scaled down by speed, and any click
  skips).

**M8, Skirmish (50 points) content and factions**
- Faction-at-a-time, with **verify loops ON** for faction rules. Each faction ends with an e2e spec
  and screenshots.

**M9+, Later**
- Command cards, warlocks and fury, Steamroller-style scenarios, the chess clock, Execution mode,
  and multiplayer.

---

## Part I: Mallet 42k bug list (avoid repeating these)

**Engine**
- **`legalActions` empty for an open decision**, so the bot froze. Keep an invariant test in the
  sim.
- **The planner's arrangement was used as the feasibility test.** It must be "any candidate passes
  validation".
- **AI deployment crashed in shallow zones.** It needs a chain-deploy fallback. Warmachine's 6–7"
  zones with 50mm bases will hit this immediately.
- **Expiry overwrite instead of max** on stacking durations (MK4: same-named effects don't stack;
  take the right one deliberately).
- **Two of 3,700-decision games hit the 60 s cap without finishing.** Add a per-game decision cap
  and a stall detector to the sim from M1.

**UI**
- **The UI showed the previous roll's target number.** The re-roll window opens before the roll
  event; read from state.
- **UI arithmetic for target numbers ignored cover.** The engine supplies every number.
- **The dice tray sat behind the decision prompt.** It moved to the right rail under the dice log.
- **Some roll types never reached the dice tray.** Every roll type must route there.
- **Deploy panel hid Confirm and Reset.** The panel docks off the zone and sizes to its content.
- **Formation clamp leaked out of the zone.** Clamp the whole group, not its centre.
- **Camera.** Right or middle click and Alt/Space must never start a model nudge. Transitions
  ≤600 ms.

**Audio and art**
- **Every ranged weapon played one sound**, and several generated files were never heard. Build the
  weapon-flavour map first.
- **The Hunyuan style reference turns everything blue** without `--style 0.2 --avoid`.
- **Floor-length capes break the base auto-cut**, so use `--nocut`.
- **GLBs are fused meshes with baked textures**, so recolouring needs the hue-band shader and
  loadouts need sockets.
- **Procedural figures were thrown away and v1 GLBs redone.** Lock the look at M3 with the owner,
  through the full pipeline.

**Bundle**
- **One 1.6 MB JS chunk.** Code-split the client from the engine and data, and move AI search to a
  Web Worker if it blocks the main thread. Warmachine's AI branching is larger than 40k's.

---

## Part J: first actions for the next agent

1. Read this file, then send the owner **one** ≤10-line message with the three open decisions
   (Part A).
2. Create the new repo (outside the Mallet tree, inside the session's working directory), copy
   Mallet's config files, and write `CLAUDE.md` from Part B plus the decided IP rule.
3. Ask the owner to download the free MK4 rules PDF and Quick Start PDF into `docs/sources/`
   (gitignored), since steamforged.com rate-limits bots.
4. Write the M0 workflow script, modelled on Mallet's `tools/workflows/w0-foundation.js` and
   `w1-stage.js`, and run it lean.

**Mallet files worth copying or reading** (all under
`C:\Users\antho\OneDrive\Documents\Mallet-42k\`):
- `CLAUDE.md`
- `tools/workflows/w1-stage.js`, `tools/workflows/w10-faction.js`
- `tools/{gen-audio,compose-audio,measure-audio}.ts`, `tools/audio-manifest.json`
- `src/client/audio/{manager,eventSounds}.ts`, `src/client/weaponFlavour.ts`
- `src/client/figures/{glbModels,glbPaint}.ts`, `src/client/presentation/*`, `src/client/dice/*`
- `art/unit-concepts/PROMPTS.md`, `docs/HANDOFF-sd-figures-v2.md`
- `art/board-textures/gen.py`
- `.github/workflows/deploy.yml`, `playwright.config.ts`, `public/sounds.html`

**Memory notes** (in `~\.claude\projects\C--Users-antho-OneDrive-Documents-Mallet-42k\memory\`):
`hunyuan3d-model-pipeline.md`, `image-generation-browser.md`, `audio-pipeline.md`. A session started
in a new repo folder won't auto-load these, so copy the relevant facts into the new project's
memory.
