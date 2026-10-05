// M6 audio + music. Workflow({ scriptPath: 'tools/workflows/w6-audio.js' })
export const meta = {
  name: 'w6-audio',
  description: 'Whirr Machine M6: SFX, narrator and music via ElevenLabs, measured and trimmed, wired into the client',
  phases: [
    { title: 'Tools', detail: 'port Mallet audio tools, write manifest + weapon flavour map (frozen ids)' },
    { title: 'Generate', detail: 'SFX+voice generation and loudness trims ∥ client audio manager and event wiring' },
    { title: 'Music', detail: 'ElevenLabs Music candidates, loop prep, music bus' },
    { title: 'Ship', detail: 'integrate, sounds.html, commit, push' },
  ],
}

const ROOT = 'C:/Users/antho/OneDrive/Documents/WarMForge/whirr-machine'
const MALLET = 'C:/Users/antho/OneDrive/Documents/Mallet-42k'
const TOKEN = 'C:/Users/antho/OneDrive/Documents/WarMForge/Tokens.txt'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const CREDIT_CEILING = (args && args.creditCeiling) || 35400 // account character_count must stay below this (25k overnight budget from 10.4k start)
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }

const COMMON = `Project root: ${ROOT} (git repo, main, public on GitHub Pages). Windows; absolute paths, the cwd resets. Run long commands in the FOREGROUND. Orient from ${ROOT}/STATUS.md and docs/WARMACHINE-HANDOFF.md Part D.4 only (plus files named). SECRET: the ElevenLabs key is in ${TOKEN}. Load it only as an env var inside the same shell command, e.g. ELEVENLABS_API_KEY="$(tr -d '\\r\\n ' < '${TOKEN}')" npx tsx tools/gen-audio.ts — NEVER echo, log, write or commit it. CREDIT CEILING: the account's character_count (GET https://api.elevenlabs.io/v1/user/subscription) must never exceed ${CREDIT_CEILING}; check before each batch and stop if it would. Another workflow may be editing src/engine, src/ai and src/client/ui concurrently: touch only files you own, stage commits by exact path, never git add -A. All prompts and narrator lines in our own words. Final output is raw JSON for an orchestrator.`

phase('Tools')
const tools = await agent(`${COMMON}
You own: tools/gen-audio.ts, tools/compose-audio.ts, tools/measure-audio.ts, tools/audio-manifest.json, tools/audio-src/**, src/client/audio/manifest.ts, src/client/weaponFlavour.ts, public/sounds.html, package.json (devDependency @breezystack/lamejs only; npm install allowed).
1. Port ${MALLET}/tools/{gen-audio,compose-audio,measure-audio}.ts (keep the idempotent skip, per-run budget, credit check; add support for kind "music" via the ElevenLabs Music API — check its current request shape with ≤2 WebFetches of elevenlabs.io docs: endpoint, prompt, length in ms, instrumental flag; record cost per call from the subscription delta).
2. Write tools/audio-manifest.json (mirrored by src/client/audio/manifest.ts) with ~60 items following handoff D.4's Warmachine sound list: war-engine footsteps + boiler idle/steam vent, fist/blade impacts on iron, slam/throw/headbutt/trample, each gun type in the starter lists (magelock/spellstorm pistols, scattergun, cannon incl. blast shot, slug cannon, grenade launcher thump, rocket 'jack buster, carbine, heavy pistols), arcane bolt/frost/lightning, focus allocate chime, boost charge-up whine, system crippled, war-engine wreck, trooper deaths per faction, caster death sting, Tough save grunt, cloud hiss, fire crackle, corrosion sizzle, dice rattle 2d6/3d6, UI click, turn bell; narrator lines (voice Harry SOYHLrjzK2X1ezoPC6cr, eleven_flash_v2_5) for round start, your turn/enemy turn, control phase, Boost!, Critical!, Assassination!, scenario scored, victory, defeat. Prompt lessons: describe the mechanism not the name, state exclusions ("no music", "no voices"), promptInfluence 0.45-0.75, SFX 0.5-1.5 s, deaths 1.2-3 s.
3. Music items (kind "music", not generated yet): title theme 75 s loopable; battle loop A 150 s and battle loop B 150 s (low-mid intensity, SFX sit on top); victory stinger 12 s; defeat stinger 12 s. Direction: industrial-orchestral steampunk, brass, low strings, anvil/taiko percussion, rhythmic machine pulse, NO vocals. Two candidates each (ids with -a/-b suffix).
4. src/client/weaponFlavour.ts: map every weapon id in src/data to one flavour (longest slug contained in the weapon id); export flavours list for SFX and VFX.
5. public/sounds.html audition page (one <audio> plays at a time), grouped SFX / voice / music, base-path safe.
Return JSON: ok, summary (≤80 words incl. item counts and the music API shape), files, issues.`, { label: 'audio-tools', phase: 'Tools', schema: RESULT, model: 'sonnet' })

phase('Generate')
const [gen, wire] = await parallel([
  () => agent(`${COMMON}
You own: public/audio/**, tools/audio-src/**, tools/audio-manifest.json (prompt edits only), src/client/audio/trims.ts.
1. Generate all sfx and voice items (not music) with tools/gen-audio.ts (key via env as described).
2. Run npx tsx tools/measure-audio.ts on everything; aim for RMS 0.15-0.18; guns crest ≥8. Regenerate (edit prompt, delete file, rerun) any clip that is clearly wrong (silence, music in an SFX, voices where none wanted, crest ~2 for a gun) — at most 1 regen round. Write per-asset multipliers (≤1) to src/client/audio/trims.ts as export const TRIMS: Record<string, number>.
3. Report credits used.
Return JSON: ok, summary (≤80 words incl credits used), files, issues.`, { label: 'audio-generate', phase: 'Generate', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own: src/client/audio/** (except manifest.ts and trims.ts, which another agent writes; import TRIMS from './trims' and create a placeholder trims.ts ONLY if it does not exist yet). Read ${MALLET}/src/client/audio/{manager,eventSounds,settings,index}.ts and copy their shape.
Build: Web Audio manager unlocked on first click; buses master/sfx/voice/music with persisted volumes + mute; music bus about -14 dB vs SFX, ducked -6 dB under narrator lines, crossfades ≥1.5 s, title theme on the start screen, battle loops alternating in game, victory/defeat stingers at game over. Throttling (many simultaneous shots become a few layered sounds with detune jitter). eventSounds.ts: map presentation beats/engine events (read src/client/presentation/beats.ts and src/engine/events.ts) to sounds using src/client/weaponFlavour.ts; perspective-aware narrator lines. Missing files fail silently. Hook it up with the smallest possible edits: call the audio init from the presentation director's beat playback (one import + one call) and add a sound settings section (volumes, mute) to the existing settings/menu UI. Note the exact files you touched outside src/client/audio in issues.
Run typecheck and tests. Return JSON: ok, summary, files, issues.`, { label: 'audio-wire', phase: 'Generate', schema: RESULT, model: 'sonnet' }),
])

phase('Music')
const music = await agent(`${COMMON}
You own: public/audio/music/** (or wherever the manifest puts music files), tools/audio-manifest.json (music prompt edits only), public/audio/CREDITS.md.
1. Check the subscription; if the plan cannot use the Music API, record that in issues and stop (ok=false).
2. Generate ONE candidate first (title-a), measure its cost from the subscription delta, and compute whether all remaining candidates fit under the credit ceiling; generate as many as fit, in this priority: title-a, battle-a-a, victory-a, defeat-a, battle-b-a, then the -b alternates. Keep each as mp3.
3. Measure loudness; set trims so music RMS sits well under SFX. For loops, add a 1.5 s crossfade-friendly loop point if trivially possible; otherwise rely on runtime crossfade.
4. Note in public/audio/CREDITS.md that the music was generated with ElevenLabs Music for this project.
Return JSON: ok, summary (≤80 words incl. tracks made, credits per track, total credits now), files, issues.`, { label: 'music', phase: 'Music', schema: RESULT, model: 'sonnet' })

phase('Ship')
const ship = await agent(`${COMMON}
Integrate audio. You may now edit any file under src/client/audio, tools, public, and the specific UI files the audio-wire agent listed. npm run typecheck, npm test, npm run build green. Make sure sounds.html lists every generated file and the game plays sounds for moves, shots per weapon flavour, melee, dice, focus, deaths, narrator lines and music (verify headlessly with Playwright: open ?test=1, start a game, count audio buffer loads via a test hook or console; no errors). Update STATUS.md (Audio section only) and HANDOFF.md (one line: owner should audition at /whirr-machine/sounds.html). Stage by exact paths (tools/ public/audio public/sounds.html src/client/audio src/client/weaponFlavour.ts package.json package-lock.json STATUS.md HANDOFF.md + the UI files touched), confirm no token or PDF staged, commit "M6: SFX, narrator and music" + blank line + "${ATTR}", git pull --rebase, git push origin main. Watch the Pages run.
Return JSON: ok, summary (≤100 words), files, issues.`, { label: 'audio-ship', phase: 'Ship', schema: RESULT, effort: 'high' })

const s = r => r && { ok: r.ok, summary: r.summary, issues: r.issues.slice(0, 6) }
return { tools: s(tools), gen: s(gen), wire: s(wire), music: s(music), ship: s(ship) }
