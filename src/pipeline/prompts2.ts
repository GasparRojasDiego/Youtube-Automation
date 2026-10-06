// Instrucciones de la edición v2: storyboard y casting (Sonnet), retoques y
// animaciones (Opus), revisión visual de animaciones (Sonnet).
import { obj, str, num, bool, arr, en, wrapSkills } from "./prompts";
import { TRANSITIONS, GRADES } from "./types";
import { FONT_FAMILIES } from "../motion/page";

const VISUALS = ["photo", "archival", "clip", "meme", "motion", "map", "source_card", "quote_card", "title_card", "text_card"];
const SFX_TYPES = "whoosh, swoosh, impact, boom, riser, hit, camera shutter, typewriter, paper rustle, page turn, heartbeat, glitch, drone, low hum, ding, pop, thud, clock ticking, crowd murmur, wind, rain, footsteps, door creak, bell, radio static, record scratch, cash register, gasp";

// ---------- Storyboard ----------
export const STORYBOARD_SCHEMA = obj({
  beats: arr(obj({
    segment_id: str(), from: num("First sentence index (inclusive)"), to: num("Last sentence index (inclusive)"),
    shots: arr(obj({
      visual: en(VISUALS),
      query_en: str("photo/archival/clip/meme: concrete search query (3-7 words, visual nouns). Empty otherwise"),
      alt_queries_en: arr(str(), "1-3 alternative queries, from specific to generic"),
      must_show_es: str("Qué debe verse para que la toma funcione (breve)"),
      avoid_es: str("Qué evitar (p. ej. personas reconocibles, logotipos); vacío si nada"),
      card_text: str("title/quote/text cards: exact short text (from the narration). Empty otherwise"),
      source_id: str("source_card: the source id. Empty otherwise"),
      motion_brief_en: str("motion/map: what the animation shows (data, places, dates, labels). Empty otherwise"),
    }), "1-3 shots that share the beat time, in order"),
    sfx: arr(obj({ at: en(["start", "end"]), type: str(`One of: ${SFX_TYPES}`), query_en: str("Freesound-style query, e.g. 'cinematic whoosh short'") }), "0-2 sound effects; most beats need none"),
  })),
  music: arr(obj({ segment_ids: arr(str()), mood_en: str("Search query for a soft instrumental background bed, e.g. 'dark ambient piano slow'") }), "One bed per chapter group (2-5 total)"),
  emphasis: arr(obj({ segment_id: str(), words: arr(str()) }), "Key words to highlight in captions"),
  notes_es: str("Decisiones de edición importantes, en 2-4 frases"),
});

export function storyboardPrompt(o: {
  skills: string; visual: unknown; shotSeconds: [number, number]; motionBudget: number; maxClip: number; humor: boolean;
  segments: { id: string; title: string; sentences: { i: number; text: string; dur: number }[]; on_screen_sources: string[] }[]; sources: unknown;
}) {
  return `You are the editor building the first cut of this documentary: a storyboard that covers every sentence with visuals, plus sound design.${wrapSkills(o.skills)}

VISUAL PARAMETERS: ${JSON.stringify(o.visual)}

Visual types:
- photo: stock photo (Pexels, Pixabay, Openverse) — places, cities, food, objects, animals, generic people, moods, textures. Query with concrete visual nouns ("abandoned hospital corridor", "1920s New York street"), never with abstract words.
- archival: historical or documentary images that likely exist on Wikimedia Commons, NASA, The Met (real buildings, documents, period photos, paintings, maps, a named public figure ONLY if the narration is about that person).
- clip: short stock video b-roll (max ${o.maxClip} s on screen) for movement: waves, traffic, crowds, fire, rain, timelapses, hands typing.
- meme: ${o.humor ? "a free-licensed reaction image or very short funny clip for a comedic beat (use sparingly, max 1 per chapter, never next to tragic facts)." : "do not use (the channel skills do not ask for humor)."}
- motion: an animated graphic (timeline, number counter, document reveal, comparison, diagram). map: an animated map (locations, routes, borders). Budget: at most ${o.motionBudget} motion+map shots in the whole video, where they explain best.
- source_card: on-screen citation of a listed source when the narration cites it. quote_card / title_card / text_card: typography cards (chapter openings, a key quote, a key phrase).

Rules:
- Group consecutive sentences into beats covering EVERY sentence of every segment in order (no gaps, no overlaps). Sentence indices start at 0 in each segment; durations (s) are given.
- Pacing: a new visual every ${o.shotSeconds[0]}-${o.shotSeconds[1]} s. A long beat gets 2-3 shots that split its time. The first 30 s (hook) should change visuals faster.
- Each shot must illustrate what is being said at that moment, literally or metaphorically; prefer real, specific imagery over generic stock.
- Never use a stock photo of an unknown person to represent a specific real person, a criminal, a victim or a suspect; use places, objects, documents, silhouettes or archival images instead. No logos or brands as the subject.
- On-screen text must never add claims or be more assertive than the narration.
- Sound design: subtle. A whoosh on some transitions, an impact on reveals, a typewriter for documents, a camera shutter for photos. Most beats have no SFX.
- Music: one soft instrumental bed per group of chapters, matching the mood; specify a search query.

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
- It must show what "must_show" asks and nothing that "avoid" forbids. If no candidate fits, return an empty asset_id (an animated card will be used instead) — a wrong image is worse than none.
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
  sfx_add: arr(obj({ at: num("Global time in seconds"), type: str(), query_en: str(), gain_db: num("-30..-6") })),
  sfx_remove: arr(str("SFX id")),
  motion: arr(obj({
    kind: en(["fullscreen", "overlay"]),
    shot_ids: arr(str(), "fullscreen: consecutive shots it replaces; overlay: the shot(s) it appears over"),
    start_s: num("overlay: seconds from the first shot's start; fullscreen: 0"),
    duration_s: num("2-12"),
    brief_en: str("What to animate, precisely (layout, hierarchy, the movement idea)"),
    text: str("Exact on-screen text (taken from the narration; no new claims)"),
    libs: arr(en(["map", "d3"])),
    asset_ids: arr(str(), "Library images to use inside the animation (ids from the shot list)"),
  })),
  notes_es: str("Qué mejoraste y por qué (3-6 frases)"),
});

export function polishPrompt(o: { skills: string; motionBudget: number; edl: string; captions: boolean; palette: unknown }) {
  return `You are a senior documentary editor and motion designer giving the final polish to an existing cut. Do NOT rebuild the edit: improve it surgically where it matters most for retention and clarity.${wrapSkills(o.skills)}

You can:
1. Change the transition into a shot (${TRANSITIONS.join(", ")}). Use "cut" most of the time; save stylised transitions for chapter changes, time jumps and reveals. Match transitions with SFX (a whoosh on smooth/slide transitions).
2. Change camera motion per shot (zoom_in, zoom_out, pan_left, pan_right, static, punch_in = fast push on an emphasis word, drift = slow subtle float) and set punch_at to land a zoom punch exactly on an important word.
3. Colour grade: one overall grade plus per-shot exceptions (sepia/noir for archival, cold for clinical scenes).
4. Sound design: add or remove SFX at exact global times (they must sync with cuts or words), with gains between -30 and -6 dB. Less is more.
5. Unmute a clip's own audio (clip_audio_db) only when its sound adds meaning; narration always stays on top.
6. Motion graphics (max ${o.motionBudget} in total): "fullscreen" animations replace shots (timelines, maps, counters, comparisons, document reveals, chapter titles); "overlay" animations play over a shot with a transparent background (callouts with a date or a name, arrows, highlights, lower thirds, labels on a photo). Choose the moments with the highest explanatory value. Overlay text must be short. Brand palette: ${JSON.stringify(o.palette)}.
${o.captions ? "Burned-in captions occupy the bottom 22% of the frame: keep overlays out of that area.\n" : ""}
Every text you place on screen must come from the narration or the verified facts, never stronger than the narration.

THE CUT (times in seconds; each line = one shot):
${o.edl}`;
}

// ---------- Composiciones de motion (Opus) ----------
export const MOTION_SYSTEM = `You are an elite motion designer who writes broadcast-quality animations as HTML + CSS + JavaScript (GSAP 3), rendered frame by frame by a deterministic headless browser at 1920×1080, 30 fps.

CONTRACT (mandatory):
- You return css, html and js. html goes inside <div id="stage"> (1920×1080, position:relative). js runs after all fonts are loaded.
- Build ONE gsap timeline (gsap.timeline()) containing ALL motion and finish with ATRIL.register(tl, DURATION). Never use setTimeout, setInterval, requestAnimationFrame loops, CSS @keyframes, Date or performance.now: time is controlled only through the timeline. For canvas drawing, use a proxy object tweened on the timeline with onUpdate redrawing, or ATRIL.onRender(t => draw(t), DURATION).
- Math.random is seeded (deterministic); call it during setup only, never inside per-frame code.
- Available globals: gsap with SplitText, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, CustomEase, ScrambleTextPlugin, TextPlugin, Physics2DPlugin (all registered). With libs "d3": d3 v7 and topojson. With libs "map": also ATRIL_WORLD (world-atlas countries-50m TopoJSON; objects.countries with properties.name, objects.land). Use d3.geoMercator/geoNaturalEarth1/geoOrthographic + fitExtent for accurate maps; use real coordinates [lon, lat].
- Images: ATRIL.asset("key") returns the URL of a provided image; use it in <img> or as background-image with background-size:cover.
- Fonts available (exact family names): ${FONT_FAMILIES.map((f) => `"${f}"`).join(", ")}. Use at most two families per composition.
- Helpers: ATRIL.fit(selectorOrEl, maxWidthPx, maxHeightPx) shrinks a text element until it fits its box; call it for every text block of variable length before animating.
- No network, no external URLs, no audio, no video elements.
- Transparent overlays: never paint a full-frame background; keep elements inside safe margins (96 px sides, 64 px top) and out of the caption zone (bottom 240 px) unless told otherwise.

QUALITY BAR:
- Clear hierarchy, generous negative space, aligned to a grid; text sizes: headline 88–150 px, secondary 40–56 px, labels 28–34 px; never smaller than 26 px. Check that every text fits: no overflow, no overlap, no clipping.
- Motion with intent: entrances in the first 0.6–0.9 s with power3.out / expo.out, staggered words or letters (0.03–0.07 s), subtle overshoot only for accents (back.out(1.4)). Hold so viewers can read (≈ 3 words per second). Fullscreen pieces may end with a clean exit in the last 0.4 s; overlays should exit (fade/slide) in their last 0.35 s.
- Cinematic touches: masks and clip-path reveals, SVG line drawing, number counters (tabular-nums), parallax layers, light leaks or soft gradients, subtle grain (static SVG noise), slow continuous drift so frames never freeze.
- Respect the brand palette and the channel skills. Favour elegance over gimmicks.
- Accuracy: the text and data must be exactly the ones given. Dates, numbers and names verbatim.`;

export const MOTION_SCHEMA = obj({
  compositions: arr(obj({
    id: str(), title: str(), duration: num(), css: str(), html: str(), js: str(),
    libs: arr(en(["map", "d3"])),
  })),
});

export function motionPrompt(o: { skills: string; palette: unknown; items: { id: string; kind: string; duration: number; brief: string; text: string; libs: string[]; context: string; assets: { key: string; description: string }[] }[] }) {
  return `Create these ${o.items.length} animation(s). Return one composition per item with the same id.${wrapSkills(o.skills)}

Brand palette and fonts: ${JSON.stringify(o.palette)}

${o.items.map((it) => `### ${it.id} — ${it.kind === "overlay" ? "OVERLAY (transparent background, over footage)" : "FULLSCREEN (opaque, replaces footage)"} — exactly ${it.duration.toFixed(2)} s
Brief: ${it.brief}
On-screen text (verbatim): ${it.text || "(none)"}
Narration at that moment: "${it.context}"
Libraries: ${it.libs.join(", ") || "none"}
Images: ${it.assets.length ? it.assets.map((a) => `ATRIL.asset("${a.key}") = ${a.description}`).join("; ") : "none"}`).join("\n\n")}`;
}

export function motionFixPrompt(o: { item: { id: string; kind: string; duration: number; brief: string; text: string }; code: { css: string; html: string; js: string }; problems: string[] }) {
  return `This animation (${o.item.kind}, ${o.item.duration.toFixed(2)} s, id ${o.item.id}) has problems. Fix them and return the corrected composition (same id). Keep what works.

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

export function critiquePrompt(o: { kind: string; brief: string; text: string }) {
  return `The image shows 6 frames (left→right, top→bottom, in time order) of a ${o.kind === "overlay" ? "transparent overlay shown here over a checkerboard/neutral background" : "fullscreen animation"} for a documentary.
Brief: ${o.brief}
Expected text (verbatim): ${o.text || "(none)"}
Judge it like a strict broadcast designer. Report only real, visible defects. Minor taste issues are not defects.`;
}

