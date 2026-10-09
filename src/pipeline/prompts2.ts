// Instrucciones de la edición v2: storyboard y casting (Sonnet), retoques y
// animaciones (Opus), revisión visual de animaciones (Sonnet).
import { obj, str, num, bool, arr, en, wrapSkills, SKILLS_CHECK } from "./prompts";
import { TRANSITIONS, GRADES } from "./types";
import { FONT_FAMILIES } from "../motion/page";

const VISUALS = ["photo", "archival", "clip", "meme", "ai_image", "motion", "map", "source_card", "quote_card", "title_card", "text_card"];
/** Máximo de tarjetas de texto por video: se ven pobres, solo para énfasis fuerte. */
export const MAX_CARDS = 4;
export const SFX_TYPES = "whoosh, swoosh, riser, impact, boom, hit, thud, sub drop, glitch, click, pop, ding, bell, camera shutter, typewriter, paper, heartbeat, clock ticking, radio static, wind, rain, drone";

// ---------- Storyboard ----------
export const STORYBOARD_SCHEMA = obj({
  beats: arr(obj({
    segment_id: str(), from: num("First sentence index (inclusive)"), to: num("Last sentence index (inclusive)"),
    shots: arr(obj({
      visual: en(VISUALS),
      query_en: str("photo/archival/clip/meme/ai_image: concrete stock search query (2-5 words, visual nouns). Always fill it, even for ai_image (used as fallback)"),
      alt_queries_en: arr(str(), "2-3 alternative queries from specific to very generic (the last one 1-2 words, e.g. 'car engine', 'garage')"),
      image_prompt_en: str("ai_image, photo and archival: detailed image prompt (subject, setting, era, lighting, lens, composition, mood) that applies the image style of the visual skills; used to create the image if no free one fits. Empty for other types"),
      must_show_es: str("Qué debe verse para que la toma funcione (breve)"),
      avoid_es: str("Qué evitar (p. ej. personas reconocibles, logotipos); vacío si nada"),
      card_text: str("title/quote/text cards: exact short text (from the narration). Empty otherwise"),
      source_id: str("source_card: the source id. Empty otherwise"),
      motion_brief_en: str("motion/map: the sequence, scene by scene (what appears, the key words/numbers, how it transitions). Empty otherwise"),
    }), "1-3 shots that share the beat time, in order"),
    sfx: arr(obj({ at: en(["start", "end"]), type: str(`One of: ${SFX_TYPES}`), query_en: str("Freesound-style query, e.g. 'cinematic whoosh short'") }), "0-2 sound effects (every motion sequence, transition and reveal gets one)"),
  })),
  music: arr(obj({ segment_ids: arr(str()), mood_en: str("Search query for a soft instrumental background bed, e.g. 'dark ambient piano slow'") }), "One bed per chapter group (2-5 total)"),
  emphasis: arr(obj({ segment_id: str(), words: arr(str()) }), "Key words to highlight in captions"),
  notes_es: str("Decisiones de edición importantes, en 2-4 frases"),
  skills_check_es: SKILLS_CHECK,
});

export function storyboardPrompt(o: {
  skills: string; visual: unknown; shotSeconds: [number, number]; motionBudget: number; minutes: number; aiImages: boolean; maxClip: number; humor: boolean;
  segments: { id: string; title: string; sentences: { i: number; text: string; dur: number }[]; on_screen_sources: string[] }[]; sources: unknown;
}) {
  const minMotion = Math.max(1, Math.ceil(o.minutes));
  return `You are the editor building the first cut of this video: a storyboard that covers every sentence with strong visuals, plus sound design. The goal is a high-retention, premium-looking YouTube video.${wrapSkills(o.skills)}

VISUAL PARAMETERS: ${JSON.stringify(o.visual)}

Visual types:
- photo: stock photo (Pexels, Pixabay, Openverse) — places, objects, food, animals, generic people, moods, textures. Query with concrete visual nouns ("car engine coolant reservoir", "1920s New York street"), never abstract words.
- archival: historical or documentary images likely on Wikimedia Commons, NASA, The Met (real buildings, documents, period photos, paintings, maps, a named public figure ONLY if the narration is about that person).
- clip: short stock video b-roll (max ${o.maxClip} s on screen) for movement: waves, traffic, crowds, fire, rain, timelapses, hands working.
- ai_image: ${o.aiImages ? "an AI-generated image for scenes stock libraries cannot show well: a specific situation, a reconstruction of a past scene, a concept made visual, a close-up of a specific object in context. Write a detailed image_prompt_en. Never photorealistic fakes of real, identifiable people or of real news events; prefer cinematic illustration or clearly staged scenes. Use it for roughly 15–25% of shots." : "not available (no image API configured): do not use."}
- meme: ${o.humor ? "a free-licensed reaction image or very short funny clip for a comedic beat (sparingly, never next to tragic facts)." : "do not use (the channel skills do not ask for humor)."}
- motion: a motion-design sequence (kinetic typography, counters, timers, diagrams that morph, floating labels, data panels, 3D point fields, glitch/flash transitions). map: an animated map (locations, routes, borders).
- quote_card / title_card / text_card / source_card: STATIC text cards. They look cheap: use at most ${MAX_CARDS} in the whole video, only for moments that need very strong emphasis. Prefer motion for any text-heavy idea.

Rules:
- Group consecutive sentences into beats covering EVERY sentence of every segment in order (no gaps, no overlaps). Sentence indices start at 0 in each segment; durations (s) are given.
- Pacing: a new visual every ${o.shotSeconds[0]}-${o.shotSeconds[1]} s. A long beat gets 2-3 shots that split its time. The hook (first 30 s) changes visuals faster.
- MOTION CADENCE: the video lasts about ${o.minutes.toFixed(1)} min. Use between ${minMotion} and ${o.motionBudget} motion+map shots, spread so that there is at least one every ~60 s (never two minutes without one). A motion shot should own a whole beat of 6–15 s (several sentences) so it can play as a multi-scene sequence; write its motion_brief_en scene by scene with the exact words and numbers from the narration.
- Each shot must illustrate what is being said at that moment, literally or metaphorically; prefer specific imagery over generic stock. Every photo/archival/clip/ai_image needs query_en plus 2-3 alt queries ending in a very generic 1–2 word query so a fallback always exists.
- Never use a stock photo of an unknown person to represent a specific real person, a criminal, a victim or a suspect; use places, objects, documents, silhouettes or archival images instead. No logos or brands as the subject.
- On-screen text never adds claims beyond the narration.
- Sound design is part of the edit: every motion sequence starts with an effect (whoosh, riser, impact or glitch), reveals get an impact or pop, scene changes a whoosh/swoosh, documents a typewriter or paper sound, photos a camera shutter. About 1 effect every 10–20 s overall.
- Music: one soft instrumental bed per group of chapters, matching the mood; give a search query.

SOURCES: ${JSON.stringify(o.sources)}

SEGMENTS:
${o.segments.map((s) => `## ${s.id} — ${s.title}${s.on_screen_sources.length ? ` (on-screen sources: ${s.on_screen_sources.join(", ")})` : ""}\n${s.sentences.map((t) => `[${t.i}] (${t.dur.toFixed(1)} s) ${t.text}`).join("\n")}`).join("\n\n")}`;
}

// ---------- Casting (elegir el mejor archivo para cada toma) ----------
export const CASTING_SCHEMA = obj({
  picks: arr(obj({
    shot_id: str(), asset_id: str("Chosen candidate id, or empty if none fits"),
    focus_x: num("Point of interest 0..1 (left→right) for framing and zoom"), focus_y: num("0..1 (top→bottom)"),
    clip_in: num("For video clips: start second of the best part (0 if unsure)"),
    note_es: str("Por qué (máx. 12 palabras)"),
  })),
});

export function castingPrompt(o: { shots: { id: string; narration: string; visual: string; must_show_es: string; avoid_es: string; dur: number; candidates: { id: string; kind: string; caption: string; description: string; quality: number; real_person: boolean; license: string; size: string; duration?: number; used_in_video: boolean }[] }[] }) {
  return `For each shot, choose the candidate file that best illustrates the narration. Candidates were described by a vision model; trust the descriptions.

Rules:
- Pick the candidate that best matches the narration. If none matches exactly, pick the closest acceptable one (same subject, setting, era or mood). Return an empty asset_id only if every candidate is clearly wrong, misleading or inappropriate (an AI image will be generated instead).
- Prefer quality ≥ 3, no watermarks, landscape framing, and a different file for each shot (used_in_video = already chosen for another shot).
- Never pick an image with an identifiable real person (real_person = true) unless the narration is specifically about that person.
- Video clips: pick clip_in so the best action falls inside the shot duration.
- focus: where the eye should go (faces, the key object); used to frame and zoom.

SHOTS:
${o.shots.map((s) => `### ${s.id} (${s.visual}, ${s.dur.toFixed(1)} s) — "${s.narration}"
must_show: ${s.must_show_es || "-"} | avoid: ${s.avoid_es || "-"}
${s.candidates.map((c) => `- ${c.id} [${c.kind}${c.duration ? ` ${c.duration.toFixed(0)}s` : ""}, ${c.size}, q${c.quality}${c.real_person ? ", REAL PERSON" : ""}${c.used_in_video ? ", USED" : ""}, ${c.license}] ${c.caption} — ${c.description}`).join("\n")}`).join("\n\n")}`;
}

// ---------- Retoques (Opus) ----------
export const POLISH_SCHEMA = obj({
  grade: en(GRADES, "Overall colour grade of the video"),
  shots: arr(obj({
    id: str(), transition_in: en(TRANSITIONS), transition_s: num("0.15-1.2"),
    motion: en(["zoom_in", "zoom_out", "pan_left", "pan_right", "static", "punch_in", "drift"]),
    grade: en(GRADES), punch_at: num("Seconds from shot start for a quick zoom punch on an emphasis word, or -1"),
    clip_audio_db: num("For clips/memes whose own sound matters: gain in dB (-30..0); -99 to mute"),
  }), "Only shots you change"),
  sfx_add: arr(obj({ at: num("Global time in seconds"), type: str(`One of: ${SFX_TYPES}`), query_en: str(), gain_db: num("-30..-6") })),
  sfx_remove: arr(str("SFX id")),
  motion: arr(obj({
    kind: en(["fullscreen", "overlay"]),
    shot_ids: arr(str(), "fullscreen: consecutive shots it replaces; overlay: the shot(s) it appears over"),
    start_s: num("overlay: seconds from the first shot's start; fullscreen: 0"),
    duration_s: num("overlay 2-10; fullscreen = the shots it replaces (up to 20)"),
    brief_en: str("What to animate, scene by scene (layout, hierarchy, the movement idea, transitions)"),
    text: str("Exact on-screen text (taken from the narration; no new claims)"),
    libs: arr(en(["map", "d3"])),
    asset_ids: arr(str(), "Library images to use inside the animation (ids from the shot list)"),
    icons_en: arr(str("Simple icon concept in English, 1-3 words, e.g. 'police officer', 'money', 'arrow up', 'clock', 'smartphone', 'person raising hand'"), "0-6 icons that would make this animation clearer"),
  })),
  notes_es: str("Qué mejoraste y por qué (3-6 frases)"),
  skills_check_es: SKILLS_CHECK,
  verify_es: arr(str(), "Datos de la narración que te parezcan dudosos y conviene volver a comprobar antes de publicar (vacío si ninguno)"),
});

export function polishPrompt(o: { skills: string; motionBudget: number; edl: string; captions: boolean; palette: unknown }) {
  return `You are a senior documentary editor and motion designer giving the final polish to an existing cut. Do NOT rebuild the edit: improve it surgically where it matters most for retention and clarity.${wrapSkills(o.skills)}

You can:
1. Change the transition into a shot (${TRANSITIONS.join(", ")}). Use "cut" most of the time; save stylised transitions for chapter changes, time jumps and reveals. Match transitions with SFX (a whoosh on smooth/slide transitions).
2. Change camera motion per shot (zoom_in, zoom_out, pan_left, pan_right, static, punch_in = fast push on an emphasis word, drift = slow subtle float) and set punch_at to land a zoom punch exactly on an important word.
3. Colour grade: one overall grade plus per-shot exceptions (sepia/noir for archival, cold for clinical scenes).
4. Sound design: add or remove SFX at exact global times (they must sync with cuts or words), with gains between -30 and -6 dB. Less is more.
5. Unmute a clip's own audio (clip_audio_db) only when its sound adds meaning; narration always stays on top.
6. Motion graphics (max ${o.motionBudget} in total, at least one every ~60 s of video): "fullscreen" sequences replace shots — premium motion design with 2–5 scenes (kinetic typography, counters, timers, morphing diagrams, floating labels, data panels, maps, 3D point fields, glitch/flash/wipe transitions); "overlay" animations play over a shot with a transparent background (callouts, arrows, highlights, lower thirds, labels, counters). Replace every remaining static text card (title_card/quote_card/text_card/source_card) with a fullscreen motion sequence when the budget allows. A fullscreen sequence lasts exactly the summed duration of the shots it replaces: keep any scene timings in the brief inside that duration. Overlay text must be short. Brand palette: ${JSON.stringify(o.palette)} (if a channel skill restricts colours or style, the skill wins: never write a colour or style it forbids into a brief).
${o.captions ? "Burned-in captions occupy the bottom 22% of the frame: keep overlays out of that area.\n" : ""}
Every text you place on screen must come from the narration or the verified facts, never stronger than the narration.

THE CUT (times in seconds; each line = one shot):
${o.edl}`;
}

// ---------- Composiciones de motion (Opus) ----------
export const MOTION_SYSTEM = `You are an elite motion designer (think premium "motion reel" work made with code) who writes broadcast-quality animations as HTML + CSS + JavaScript (GSAP 3), rendered frame by frame by a deterministic headless browser at 1920×1080, 30 fps.

CONTRACT (mandatory):
- Return css, html and js. html goes inside <div id="stage"> (1920×1080, position:relative) and may be empty if you build everything with K.*. js runs after fonts load.
- Build ONE gsap timeline (const tl = gsap.timeline()) holding ALL motion and end with ATRIL.register(tl, DURATION). Never use setTimeout, setInterval, requestAnimationFrame, CSS @keyframes/transitions, Date or performance.now. Per-frame drawing only through ATRIL.addRender(t => ...) (t = seconds) or the K generators.
- Math.random is seeded; call it only during setup. K.rand(a,b) is a seeded helper.
- Globals: gsap + SplitText, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, CustomEase, ScrambleTextPlugin, TextPlugin, Physics2DPlugin (registered). libs "d3": d3 v7 + topojson. libs "map": also ATRIL_WORLD (world-atlas countries-50m; objects.countries with properties.name, objects.land); use d3.geoMercator/geoNaturalEarth1/geoOrthographic + fitExtent and real [lon, lat].
- Images: ATRIL.asset("key") → URL of a provided library image (or K.image(parent, key, {...})).
- Icons: K.icon(parent, "key", {x, y, size, color, bg}) inserts a provided vector icon (keys listed per item; they inherit color) and K.drawIcon(tl, el, at) traces its strokes. Use them for people, objects, money, arrows, time, places… instead of drawing them by hand.
- Fonts (exact names): ${FONT_FAMILIES.map((f) => `"${f}"`).join(", ")}. Max two families + the mono per piece. ATRIL.fit(el, maxW, maxH) shrinks variable text to fit.
- No network, no external URLs, no audio/video elements.
- Transparent overlays: never paint a full-frame background; stay inside safe margins (96 px sides, 64 px top) and out of the caption zone (bottom 240 px).

KIT — global K (already themed: CSS vars --bg --fg --accent --muted --paper, --font-title --font-body --font-mono from the brand palette). Use it: it is tested and looks premium.
Scenes: K.scene({bg, fg}) → full-frame container, hidden until shown. K.show(tl, el, at, {fx}) · K.hide(tl, el, at, {fx}) · K.swap(tl, from, to, at, {fx, color, dir}); fx = cut|fade|flash|wipe|iris|zoom|slide|glitch|blur. K.flash(tl, at, {color, dur}) · K.wipe(tl, at, {color, dir}) · K.glitch(tl, el, at, {dur, intensity}).
Backgrounds: K.paper(parent, {color, grid, gridSize, marks, grain}) textured paper + faint grid + camera crop marks · K.field(parent, color, {dots, rings}) flat colour field (optional dot lattice / circular radar grid) · K.dotGrid(parent, {color, gap, size}) · K.rings(parent, {color}) · K.marks(parent) · K.grain(null, {opacity}).
HUD: K.hud({tl, tr, bl, br, color}, parent) corner labels in mono caps; the value 'TC' renders a running timecode (e.g. tr:'TC').
Type: K.title(parent, html, {x, y, size, font, italic, weight, color, align, lines, maxW}) → centred at (x,y), auto-fit · K.text(parent, html, {...}) · K.reveal(tl, el, at, {by:'chars'|'words'|'lines', fx:'rise'|'blur'|'scale'|'drop'|'scramble'|'type'}) · K.counter(tl, el, at, {from, to, dur, decimals, prefix, suffix}) · K.timer(parent, {label, from, x, y, size}) → .run(tl, at, toSeconds, dur) · K.bigNumber(parent, {text, label, x, y, size}) → {num, label}.
Shapes: K.dot(parent, {x, y, r, color}) + K.drop(tl, dot, at) (falls with squash onto a static oval shadow) · K.radial(parent, {x, y, core, rings:[{n, r, size}], colors}) + K.burst / K.implode(tl, rad, at) · K.spin(tl, el, at, dur, deg) · K.shape(parent, d, {fill}) + K.morph(tl, path, toD, at, {dur}) · K.circleD(cx, cy, r), K.starD(cx, cy, R, r, n), K.polyD(cx, cy, r, n).
Pieces: K.tags(tl, parent, labels[], at, {x, y, rx, ry, pill}) floating cards around a point · K.highlight(tl, el, at, {color, label}) translucent marker box · K.columns(parent, [{num, title, note, value}], {x, y, w}) + K.revealColumns(tl, c, at) · K.window(parent, {title, rows:[[label, true|false|'value']], button, x, y, w}) app window · K.code(parent, {title, code, x, y, w}).type(tl, at, dur) · K.bars(parent, {values, labels, accent, x, y, w, h}).grow(tl, at) · K.ring(parent, {pct, r, x, y}).run(tl, at) · K.easeGraphs(tl, parent, ['none','power2.inOut','expo.out','back.out(1.7)','elastic.out(1,0.4)','bounce.out'], at, {y, w, h, color, accent}) · K.lightBar(tl, parent, at, {color, color2, y}).
Generative (canvas; animate their .p on the timeline): K.points3d(parent, {color}) p:{morph 0 grid→1 torus, toSphere, rotX, rotY, wave, zoom, alpha} · K.flow(parent, {color, color2, add}) p:{alpha, speed, spread} · K.particles(parent, {x, y, color, color2}).boom(tl, at, dur) · K.ripples(parent, {color, coreColor}) p:{alpha, speed} · K.blobs(parent, {color, n}) p:{amp} · K.isoGrid(parent, {color, n, size}) p:{pulse}.
Life: K.float(el, {amp, speed}) gentle floating · K.drift(el, {zoom, x, y, dur}) slow camera push.
Skeleton:
const tl = gsap.timeline();
const s1 = K.scene(); K.paper(s1); K.hud({tl:'CHAPTER 02 / THE COST', tr:'TC', bl:'@channel'}, s1);
const t1 = K.title(s1, 'Deadline', {font:'DM Serif Display', italic:true, weight:400, size:220, y:470});
K.show(tl, s1, 0); K.reveal(tl, t1, 0.3, {fx:'blur'});
const s2 = K.scene({bg:'#0B0B0B', fg:'#F4F4F2'}); const n = K.bigNumber(s2, {text:'0', label:'PROJECTS'});
K.swap(tl, s1, s2, 3.2, {fx:'glitch'}); K.counter(tl, n.num, 3.3, {to:353, suffix:'+'});
ATRIL.register(tl, 6);

STYLE — premium motion reel:
- A fullscreen piece is a sequence of 2–5 scenes (≈2–5 s each) linked by snappy transitions (flash, wipe, glitch, slide, iris, morph). Something always moves (float, drift, timecode, generators): never a frozen frame.
- Visual language: textured paper with faint grid and crop marks, or bold flat colour fields (paper #ECE8DF, white #FAFAF8, ink #0B0B0B, signal red #E8352B, electric blue #1F3BFF, lime #C6F432, orange #FF6A1A) — at most 3 per piece, harmonised with the brand palette. Mono caps HUD labels in corners. One hero element per scene.
- Typography is the star: huge elegant italic serif words (DM Serif Display / Playfair Display italic) or heavy grotesk caps (Inter 800–900, Archivo Black, Anton) against small mono labels. Strong scale contrast.
- Show numbers as counters or timers, lists as floating tags or numbered columns, comparisons as bars/rings, processes as diagrams that expand, morph and collapse (dot → radial diagram → dot), abstract ideas with generators (3D points, flow lines, particles, ripples, blobs).
- Easing with intent: entrances 0.5–0.9 s expo.out/power3.out, staggered letters 0.03–0.06 s, back.out only for accents; hold text long enough to read (≈3 words/s).
- Hierarchy and fit: headline 90–240 px, secondary 40–60 px, labels 24–34 px (never smaller than 22 px). No overflow, no overlap, no clipping.
- Accuracy: texts, numbers, dates and names exactly as given; a counter ends on the exact value.

EFFICIENCY: compact code (aim under ~120 lines per composition thanks to K), no comments, no prose outside the structured output.`;

export const MOTION_SCHEMA = obj({
  compositions: arr(obj({
    id: str(), title: str(), duration: num(), css: str(), html: str(), js: str(),
    libs: arr(en(["map", "d3"])),
    skills_check: str("One short line: which visual-skill rules this composition applies (empty if none)"),
  })),
});

export function motionPrompt(o: { skills: string; palette: unknown; items: { id: string; kind: string; duration: number; brief: string; text: string; libs: string[]; context: string; assets: { key: string; description: string }[]; icons: string[] }[] }) {
  return `Create these ${o.items.length} animation(s). Return one composition per item with the same id. Fullscreen items are multi-scene motion-design sequences; overlays are short, clean graphics over footage.${wrapSkills(o.skills)}

Brand palette and fonts: ${JSON.stringify(o.palette)}

${o.items.map((it) => `### ${it.id} — ${it.kind === "overlay" ? "OVERLAY (transparent background, over footage)" : "FULLSCREEN (opaque, replaces footage)"} — exactly ${it.duration.toFixed(2)} s
Brief: ${it.brief}
On-screen text (verbatim): ${it.text || "(none)"}
Narration at that moment: "${it.context}"
Libraries: ${it.libs.join(", ") || "none"}
Images: ${it.assets.length ? it.assets.map((a) => `ATRIL.asset("${a.key}") = ${a.description}`).join("; ") : "none"}
Icons: ${it.icons.length ? it.icons.map((k) => `"${k}"`).join(", ") : "none"}`).join("\n\n")}`;
}

export function motionFixPrompt(o: { item: { id: string; kind: string; duration: number; brief: string; text: string }; code: { css: string; html: string; js: string }; problems: string[]; skills?: string }) {
  return `This animation (${o.item.kind}, ${o.item.duration.toFixed(2)} s, id ${o.item.id}) has problems. Fix them and return the full corrected composition (same id) through the structured output only — no explanations. Keep what works. If a listed problem asks for something that breaks a channel rule below, keep the rule and ignore that problem.${o.skills ? wrapSkills(o.skills) : ""}

Brief: ${o.item.brief}
Text: ${o.item.text || "(none)"}

PROBLEMS:
${o.problems.map((p) => `- ${p}`).join("\n")}

CURRENT CODE:
<css>
${o.code.css}
</css>
<html>
${o.code.html}
</html>
<js>
${o.code.js}
</js>`;
}

// ---------- Revisión visual de una animación (Sonnet) ----------
export const CRITIQUE_SCHEMA = obj({
  ok: bool("true if it is ready for broadcast"),
  problems_en: arr(str(), "Concrete defects: text cut off or overflowing, overlapping elements, illegible text, empty frames, misspellings, wrong text, broken images, ugly composition"),
  severity: en(["none", "minor", "major"]),
});

export function critiquePrompt(o: { kind: string; brief: string; text: string; skills?: string }) {
  return `The image shows 6 frames (left→right, top→bottom, in time order) of a ${o.kind === "overlay" ? "transparent overlay shown here over a checkerboard/neutral background" : "fullscreen animation"} for a documentary.
Brief: ${o.brief}
Expected text (verbatim): ${o.text || "(none)"}
Judge it like a strict broadcast designer. Report only real, visible defects. Minor taste issues are not defects.${o.skills ? `

CHANNEL RULES (they override the brief): following them is correct even where the brief says otherwise (e.g. a colour the brief asks for but a rule forbids) — never report that as a defect. Breaking one of them is a defect.
<channel_rules>
${o.skills.slice(0, 6000)}
</channel_rules>` : ""}`;
}

