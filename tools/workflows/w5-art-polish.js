// M5 art wiring + M7 polish. Workflow({ scriptPath: 'tools/workflows/w5-art-polish.js', args: { slugs: [...] } })
export const meta = {
  name: 'w5-art-polish',
  description: 'Whirr Machine M5+M7: wire Hunyuan GLB figures with army painter and status visuals, polish UI and audio levels, ship',
  phases: [
    { title: 'Build', detail: 'GLB figures + painter + status visuals ∥ M7 UI polish ∥ audio gain fixes' },
    { title: 'Ship', detail: 'play through, screenshots, commit, push, Pages' },
  ],
}

const ROOT = 'C:/Users/antho/OneDrive/Documents/WarMForge/whirr-machine'
const MALLET = 'C:/Users/antho/OneDrive/Documents/Mallet-42k'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const SLUGS = (args && args.slugs) || []
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }

const COMMON = `Project root: ${ROOT} (git repo, main, Pages https://dragoonant.github.io/whirr-machine/). Windows; absolute paths, the cwd resets. Run long commands in the FOREGROUND. Orient from ${ROOT}/STATUS.md and docs/spec/30-figures.md / 50-client.md sections named. The engine owns every number the UI shows. All UI copy in our own words. Concurrent agents share the tree: touch only files you own, never git commit or npm install unless told, never edit STATUS.md. Final output is raw JSON.`

phase('Build')
const [figs, polish, audio] = await parallel([
  () => agent(`${COMMON}
You own src/client/figures/**, src/client/vfx/**, tests/client/figures*.test.ts. Read docs/spec/30-figures.md and ${MALLET}/src/client/figures/{glbModels.ts,GlbBody.tsx,glbLoader.ts,glbPaint.ts} (copy their shape).
GLBs now exist in ${ROOT}/public/assets/models/: ${JSON.stringify(SLUGS)} (wm-caine, wm-falk, wm-black13 = every Black 13th trooper, wm-deuce, wm-vilkul, wm-lazarenko, wm-hounds = every Hounds trooper, wm-razor). They are already scaled in inches with a black base. Map model ids from src/data to slugs (GLB_SLUG_BY_MODEL + ENABLED_GLB_SLUGS from the files that exist); keep the procedural figure as fallback when a GLB is missing or fails. Load via import.meta.env.BASE_URL. Share geometry/materials across instances; clone materials per (slug, paint) and cache.
Army painter: a hue-band fragment shader that remaps each faction's two dominant hues (Cygnar: deep blue + gold; Khador: crimson + dark iron) to the side's chosen colours, leaving low-saturation texels (metal, black) alone; keep defaults = original colours. Expose a paint setting through the existing settings store if one exists (note the file in issues if you had to touch it).
Status visuals on GLB figures: knocked-down = tip onto its side; stationary = icy overlay; crippled systems = sparks/smoke puffs at the figure (lightweight sprite particles in vfx/); focus orbs 0-3 orbiting war-engines; selection ring; destroyed = fade out. Add simple VFX: muzzle flash + tracer for ranged attacks, impact sparks for melee, arcane bolt glow for spells, blast ring for AOE, driven by presentation beats (read src/client/presentation/beats.ts).
Also provide ?gallery: a page showing every figure GLB rotating with its name.
Performance: demand frameloop friendly (invalidate on animation), dpr cap honoured, Low graphics setting = procedural or no shadows.
Run typecheck and your tests. Return JSON: ok, summary, files, issues.`, { label: 'figures+vfx', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own src/client/ui/** (except src/client/ui/start/SoundSettings* if present), tests/client/ui*.test.ts. M7 polish:
- Event feed with full attack breakdowns: dice values, boosts, crits, target number, expected vs actual damage (engine numbers), per-model damage totals per turn.
- End screen with result, cause (assassination/scenario/rounds), VP breakdown per round, damage dealt per side, Play again / Menu.
- Settings popover (gear button in the top bar): speed, graphics Low/High, narration pauses on/off, sound volumes (reuse the audio settings component), tips on/off.
- Narration pauses: phase banners 2.4 s, turn handover 1.6 s, scaled by speed; any click skips.
- Bot strength selector on the start screen (random/easy/normal, default normal) if not already there.
- Title art: a CSS/SVG title treatment for "Whirr Machine" (gear-and-steam motif, gold on charcoal, original) that fits one screen at wide and short windows.
Run typecheck and your tests. Return JSON: ok, summary, files, issues.`, { label: 'ui-polish', phase: 'Build', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own src/client/audio/manager.ts, src/client/audio/trims.ts, tools/audio-manifest.json, public/audio/** and may run tools/gen-audio.ts. The ElevenLabs key: file C:/Users/antho/OneDrive/Documents/WarMForge/Tokens.txt has the form EL=<key>; load it only inline: ELEVENLABS_API_KEY="$(sed 's/^EL=//' 'C:/Users/antho/OneDrive/Documents/WarMForge/Tokens.txt' | tr -d '\\r\\n ')" npx tsx tools/gen-audio.ts ... — never print or commit it. Account character_count must stay ≤ 35400 (check GET /v1/user/subscription first).
1. Allow trims > 1 (gain up to 4x) and set gains so these quiet clips reach RMS ~0.15: dice-2d6, dice-3d6, fire-crackle, we-step, turn-bell, ui-click, we-boiler-idle, gun-carbine, focus-allocate (measure with tools/measure-audio.ts; avoid clipping with a soft limiter/compressor node on the sfx bus).
2. Guns with crest < 4 (gun-cannon, gun-grenade-launcher, gun-spellstorm-pistol, gun-scattergun, gun-cannon-blast): regenerate ONCE each with prompts describing a sharp transient attack then decay ("single sharp report, fast attack, no sustained rumble, no music"), promptInfluence 0.7; keep whichever version has the higher crest.
Return JSON: ok, summary (incl credits now), files, issues.`, { label: 'audio-levels', phase: 'Build', schema: RESULT, model: 'sonnet' }),
])

phase('Ship')
const ship = await agent(`${COMMON}
Integrate M5+M7. You may edit any src/client file, tests, STATUS.md, HANDOFF.md, package.json.
1. npm run typecheck, npm test, npm run build green.
2. Play in Playwright (vite preview at /whirr-machine/): start a game as Khador vs normal bot, play 2 rounds through the UI. Fix any crash, missing GLB, z-fighting, unreadable panel, or stuck prompt. Check the frame rate stays reasonable with all GLBs (report ms/frame via ?spike= if available).
3. Screenshots to e2e-out/: art-start.png, art-deploy.png, art-midgame.png (close-up camera on the war-engines), art-attack.png, art-gameover.png, gallery.png.
4. Update STATUS.md + HANDOFF.md (next: owner playtest + veto concept picks; candidates are in C:/Users/antho/Hunyuan3D-2/outputs/wm-*/concepts/). Stage by exact paths: src public/assets public/audio tools/audio-manifest.json tests STATUS.md HANDOFF.md package.json package-lock.json (never docs/sources, Tokens, e2e-out). Commit "M5: Hunyuan SD figures, army painter, VFX; M7: polish" + blank line + "${ATTR}"; git pull --rebase; git push origin main; gh run watch the Pages deploy (fix and retry up to 2 times).
Return JSON: ok, summary (≤120 words), files (absolute screenshot paths), issues.`, { label: 'art-ship', phase: 'Ship', schema: RESULT, effort: 'high' })

const s = r => r && { ok: r.ok, summary: r.summary, files: (r.files || []).slice(0, 8), issues: r.issues.slice(0, 6) }
return { figs: s(figs), polish: s(polish), audio: s(audio), ship: s(ship) }
