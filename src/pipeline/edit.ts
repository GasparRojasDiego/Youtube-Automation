// Edición v2: storyboard (Sonnet) → medios y casting (biblioteca + fuentes
// libres + visión de Sonnet) → retoques (Opus) → animaciones (Opus + motor de
// motion) → montaje por capas. Todo reanudable y visible en el Estudio en vivo.
import { fs, db, fileUrl, appPaths, secrets } from "../lib/ipc";
import { getSettings, SECRET } from "../lib/settings";
import { composeSkills, skillParams, MONTAGE_DEFAULTS, VISUAL_DEFAULTS } from "../lib/skills";
import { listMusic, updateVideo } from "../lib/repo";
import { UserError, log } from "../lib/events";
import { activity, setLive } from "../lib/activity";
import { joinPath, sha256, now, uid } from "../lib/util";
import { claudeRun } from "../providers/claude";
import { generateImage, imageProvider, type Provenance } from "../providers/images";
import { ffmpeg, probeDuration, pickEncoder, filterScriptModern } from "../providers/ffmpeg";
import { searchLibrary, importCandidate, getAssets, markUsed, type Asset } from "../media/library";
import { resolveIcon } from "../media/icons";
import { searchSources, rankCandidates, sourceReady, SOURCE_LABEL, type AssetKind } from "../media/sources";
import { synthSfx, sfxKind } from "../media/sfx";
import { elevenSoundEffect } from "../providers/tts";
import { describeAssets } from "../media/vision";
import { launchBrowser, closeBrowser, renderComposition, MotionError, EngineError, type Browser } from "../motion/engine";
import { tauriHost, requireBrowser, motionResources } from "../motion/host";
import type { Composition } from "../motion/page";
import { renderSourceCard, renderTitleCard, renderQuoteCard, renderTextCard } from "./cards";
import { out, need, checkCancel, type Ctx } from "./stages";
import * as P2 from "./prompts2";
import { SYSTEM_BASE } from "./prompts";
import { segInfos, repairStoryboard, layoutShots, segmentOffsets, beatSfxToCues, buildEdl, applyPolish, repairMusic, shortPhrase, segmentLength, shotNarration, fallbackQueries, keywordsQuery, ensureMotionCadence, iconKey, motionCues, type MotionSfxRaw, type SegInfo, type PolishRaw } from "./timeline";
import { segmentV2Args, finalMixV2Args, withFilterScript, segmentV2Duration, type LayerShot, type LayerOverlay } from "./montage2";
import { concatList } from "./montage";
import { wordTimings } from "./align";
import { paginate, buildAss, CAPTION_DEFAULTS } from "./captions";
import { FONT_FILES } from "../motion/page";
import { resourcePath } from "../lib/ipc";
import type { ScriptOut, ResearchOut, VoiceOut, StoryboardOut, AssetsOut, PolishOut, MotionOut, MotionItem, Shot, SfxCue, MusicBed, RenderOut } from "./types";

const MEDIA_VISUALS = new Set(["photo", "archival", "clip", "meme", "ai_image"]);
/** Sube si cambia la lógica del storyboard (rehace los storyboards guardados). */
const STORYBOARD_VERSION = 3;
const kindFor = (s: Shot): AssetKind => (s.visual === "clip" ? "video" : "image");

/** ¿Se pueden generar imágenes con IA (ajuste activo y clave presente)? */
export async function aiImagesReady(): Promise<boolean> {
  return getSettings().media.allowGenerated && !!(await imageProvider());
}

/** Prompt de imagen: lo que pide la toma, el contexto narrado y el estilo del canal. */
function imagePromptFor(sh: Shot, narration: string, style: string): string {
  return [
    sh.image_prompt_en || sh.query_en || keywordsQuery(narration),
    narration ? `Context (what the narrator says at this moment): "${narration.slice(0, 400)}"` : "",
    style ? `Style: ${style}` : "Style: cinematic, high detail, natural light, documentary look.",
    "Widescreen 16:9 composition. No text, letters, captions, logos or watermarks. No recognisable real people.",
  ].filter(Boolean).join("\n");
}

/** Animaciones por video: el ajuste, pero nunca menos de una por minuto de narración. */
async function motionBudget(totalSeconds = 0) {
  const m = getSettings().motion;
  if (!m.enabled) return 0;
  return Math.max(m.perVideo, Math.ceil(totalSeconds / 60) + 1);
}

// ======================= 5. Storyboard (Sonnet) =======================
export async function stageStoryboard(ctx: Ctx): Promise<StoryboardOut> {
  const v = ctx.video;
  const script = await need<ScriptOut>(v, "script", "Guion");
  const research = await need<ResearchOut>(v, "research", "Investigación");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const prev = await out<StoryboardOut>(v, "storyboard");
  const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
  const visual = await skillParams(v.channel_id, "visual", VISUAL_DEFAULTS);
  const segs = segInfos(script, voice);
  const narrTotal = segs.reduce((a, s) => a + s.narration, 0);
  const budget = await motionBudget(narrTotal);
  const sbSkills = await composeSkills(v.channel_id, ["visuals", "montage"]);
  const key = await sha256(JSON.stringify([segs.map((s) => [s.id, s.sentences, Math.round(s.narration * 10)]), budget, montage, visual, sbSkills, STORYBOARD_VERSION]));
  if (prev?.scriptKey === key && prev.shots?.length) return prev;

  await ctx.progress("Armando el storyboard…");
  const r = await claudeRun<{ beats: any[]; music: any[]; emphasis: { segment_id: string; words: string[] }[]; notes_es: string; skills_check_es?: string[] }>({
    stage: "storyboard", activityStage: "storyboard", label: "Storyboard", system: SYSTEM_BASE, schema: P2.STORYBOARD_SCHEMA,
    prompt: P2.storyboardPrompt({
      skills: sbSkills,
      visual, shotSeconds: montage.shotSeconds, motionBudget: budget, minutes: narrTotal / 60, aiImages: await aiImagesReady(), maxClip: getSettings().media.maxClipSeconds, humor: !!montage.humor,
      segments: segs.map((s) => ({ id: s.id, title: s.title, on_screen_sources: script.segments.find((x) => x.id === s.id)?.on_screen_sources ?? [],
        sentences: s.sentences.map((t, i) => ({ i, text: t, dur: Math.max(0.3, (s.spans[i]?.end ?? 0) - (s.spans[i]?.start ?? 0)) })) })),
      sources: research.sources.map((x) => ({ id: x.id, title: x.title, publisher: x.publisher })),
    }),
    videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
  });
  const { shots: raw, beatSfx } = repairStoryboard(r.data.beats ?? [], segs, budget, new Set(research.sources.map((x) => x.id)), { aiImages: await aiImagesReady(), maxCards: P2.MAX_CARDS });
  const shots = layoutShots(raw, segs, montage.pauseBetweenSegments);
  const offsets = segmentOffsets(segs, montage.pauseBetweenSegments);
  const sfx = beatSfxToCues(beatSfx, shots, offsets);
  const music = repairMusic(r.data.music ?? [], segs.map((s) => s.id));
  const emphasis = Object.fromEntries((r.data.emphasis ?? []).map((e) => [e.segment_id, e.words ?? []]));
  const count = (k: string) => shots.filter((s) => s.visual === k).length;
  await activity(v.id, "storyboard", "decision", `Storyboard: ${shots.length} tomas · ${count("photo") + count("archival")} imágenes · ${count("ai_image")} con IA · ${count("clip")} clips · ${count("motion") + count("map")} animaciones · ${sfx.length} efectos`, r.data.notes_es ?? "");
  if (r.data.skills_check_es?.length) await activity(v.id, "storyboard", "decision", `Habilidades visuales aplicadas (${r.data.skills_check_es.length})`, r.data.skills_check_es.join("\n"));
  return { shots, sfx, music, emphasis, notes_es: r.data.notes_es ?? "", scriptKey: key };
}

// ======================= 6. Medios y casting =======================
export function assetProvenance(a: Asset): Provenance {
  const stock = a.source === "pexels" || a.source === "pixabay";
  return {
    kind: a.source === "user" ? "user" : stock ? "stock" : "archival",
    provider: a.source === "user" ? "Propio" : (SOURCE_LABEL as Record<string, string>)[a.source] ?? a.source,
    license: a.license, attribution: a.attribution, sourceUrl: a.page_url ?? undefined, title: a.title, assetId: a.id,
  };
}

/** Busca candidatos para una toma: primero la biblioteca, luego las fuentes en línea. */
async function huntShot(ctx: Ctx, sh: Shot, exclude: Set<string>): Promise<{ candidates: Asset[]; downloaded: Asset[] }> {
  const v = ctx.video; const m = getSettings().media;
  const kind = kindFor(sh);
  const queries = fallbackQueries(sh.query_en ?? "", sh.alt_queries_en ?? []);
  const found = new Map<string, Asset>();
  if (m.libraryFirst) {
    for (const q of queries.slice(0, 2)) for (const h of await searchLibrary(q, kind, 5, { excludeIds: [...exclude], minDur: kind === "video" ? 1 : undefined })) found.set(h.id, h);
    if (found.size) await activity(v.id, "assets", "search", `Biblioteca: «${queries[0]}» → ${found.size} coincidencia(s)`);
  }
  const downloaded: Asset[] = [];
  const goodLocal = [...found.values()].filter((a) => a.described_at && a.quality >= 3).length;
  if (goodLocal < 2) {
    for (const q of queries) {
      checkCancel(ctx);
      await activity(v.id, "assets", "search", `Buscando ${kind === "video" ? "clips" : "imágenes"} libres: «${q}»`);
      const rep = await searchSources(q, kind, m.candidatesPerBeat);
      for (const e of rep.errors) await activity(v.id, "assets", "warn", `${SOURCE_LABEL[e.source]}: ${e.message.slice(0, 160)}`);
      if (rep.skipped.length) await activity(v.id, "assets", "warn", `Sin cuota: ${rep.skipped.map((x) => SOURCE_LABEL[x]).join(", ")}`);
      const ranked = rankCandidates(rep.candidates, kind, m.maxClipSeconds).filter((c) => kind !== "video" || !c.duration || c.duration <= 90);
      for (const c of ranked.slice(0, m.candidatesPerBeat)) {
        try {
          const a = await importCandidate(c);
          if (exclude.has(a.id)) continue;
          downloaded.push(a); found.set(a.id, a);
          await activity(v.id, "assets", "fetch", `Descargado de ${SOURCE_LABEL[c.source]}: ${c.title.slice(0, 90)}`, `${c.license} · ${c.pageUrl}`, a.thumb);
          if (a.thumb) setLive(v.id, { frame: a.thumb, caption: `Material encontrado: ${c.title.slice(0, 80)}` });
        } catch (e) { await activity(v.id, "assets", "warn", `No se pudo descargar ${c.title.slice(0, 60)}`, e instanceof Error ? e.message : String(e)); }
      }
      if (found.size >= m.candidatesPerBeat) break;
    }
  }
  return { candidates: [...found.values()].slice(0, 6), downloaded };
}

/**
 * Efectos de sonido: para cada uno, la biblioteca → Freesound → ElevenLabs
 * (si está activado) → síntesis propia con ffmpeg. Nunca se omite un efecto.
 */
async function resolveSfx(ctx: Ctx, cues: SfxCue[], stage = "assets"): Promise<SfxCue[]> {
  const st = getSettings();
  const v = ctx.video;
  const cacheDir = joinPath((await appPaths()).data, "efectos");
  await fs.mkdir(cacheDir);
  const elKey = st.sfx.elevenlabs ? await secrets.get(SECRET.elevenlabsApiKey) : null;
  const freesound = await sourceReady("freesound");
  const found = new Map<string, { path: string; duration?: number; origin: NonNullable<SfxCue["origin"]>; asset_id?: string | null; offset: number }>();
  const outCues: SfxCue[] = [];
  const count: Record<string, number> = {};
  let elUsed = 0, variant = 0;
  for (const c of cues) {
    if (c.path && (await fs.exists(c.path))) { outCues.push(c); continue; }
    checkCancel(ctx);
    const kind = sfxKind(c.type, c.query_en);
    const q = (c.query_en || c.type).toLowerCase().trim();
    const lead = kind === "riser" ? -1.8 : kind === "whoosh" ? -0.35 : kind === "swoosh" ? -0.2 : 0; // el pico cae en el corte
    let hit = found.get(q) ?? null;
    if (!hit) {
      const lib = (await searchLibrary(q, "sfx", 1))[0] ?? (await searchLibrary(kind, "sfx", 1))[0];
      if (lib) hit = { path: lib.path, duration: lib.duration ?? undefined, origin: "library", asset_id: lib.id, offset: lead };
    }
    if (!hit && freesound) {
      const rep = await searchSources(q, "sfx", 3, ["freesound"]);
      for (const cand of rankCandidates(rep.candidates, "sfx").slice(0, 2)) {
        try {
          const a = await importCandidate(cand);
          hit = { path: a.path, duration: a.duration ?? cand.duration, origin: "freesound", asset_id: a.id, offset: lead };
          await activity(v.id, stage, "audio", `Efecto de Freesound: ${cand.title.slice(0, 80)}`, `${cand.license} · ${cand.pageUrl}`);
          break;
        } catch { /* siguiente */ }
      }
    }
    if (!hit && elKey && elUsed < st.sfx.maxGenerated) {
      const secs = kind === "riser" ? 2.2 : kind === "drone" || kind === "wind" || kind === "rain" ? 5 : kind === "boom" || kind === "bell" ? 2.5 : 1.2;
      const file = joinPath(cacheDir, `el-${(await sha256(`${q}|${secs}`)).slice(0, 16)}.mp3`);
      try {
        if (!(await fs.exists(file))) { await elevenSoundEffect({ prompt: `${c.query_en || c.type}, ${kind}, clean, isolated sound effect, no music`, seconds: secs, outPath: file, videoId: v.id, channelId: v.channel_id }); elUsed++; }
        hit = { path: file, duration: secs, origin: "elevenlabs", asset_id: null, offset: lead };
        await activity(v.id, stage, "audio", `Efecto creado con ElevenLabs: «${q}»`);
      } catch (e) { await activity(v.id, stage, "warn", `ElevenLabs no creó «${q}»; se sintetiza`, e instanceof UserError ? e.userMessage : String(e)); }
    }
    if (!hit) {
      const vv = variant++ % 4;
      const r = await synthSfx(kind, joinPath(cacheDir, `sint-${kind.replace(/ /g, "-")}-${vv}.wav`), vv);
      hit = { path: r.path, duration: r.duration, origin: "synth", asset_id: null, offset: r.offset };
    }
    found.set(q, hit);
    count[hit.origin] = (count[hit.origin] ?? 0) + 1;
    outCues.push({ ...c, at: Math.max(0, Math.round((c.at + hit.offset) * 100) / 100), asset_id: hit.asset_id ?? null, path: hit.path, duration: hit.duration, origin: hit.origin });
  }
  const names: Record<string, string> = { library: "biblioteca", freesound: "Freesound", elevenlabs: "ElevenLabs", synth: "síntesis propia" };
  if (Object.keys(count).length) await activity(v.id, stage, "audio", `Efectos de sonido: ${Object.entries(count).map(([k, n]) => `${n} de ${names[k] ?? k}`).join(" · ")}`);
  return outCues;
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? []);

async function resolveMusic(ctx: Ctx, beds: MusicBed[]): Promise<MusicBed[]> {
  const tracks = (await listMusic()).filter((t) => t.enabled);
  const usedTrack = new Set<string>();
  const outBeds: MusicBed[] = [];
  for (const b of beds) {
    if (b.path && (await fs.exists(b.path))) { outBeds.push(b); continue; }
    const want = words(b.mood_en);
    // 1) pistas propias (p. ej. Biblioteca de audio de YouTube), las más seguras para monetizar
    const own = tracks.map((t) => ({ t, s: [...words(`${t.mood} ${t.title}`)].filter((w) => want.has(w)).length - (usedTrack.has(t.id) ? 0.5 : 0) }))
      .sort((a, b2) => b2.s - a.s)[0];
    if (own && (own.s > 0 || tracks.length)) {
      usedTrack.add(own.t.id);
      outBeds.push({ ...b, asset_id: null, path: own.t.path, title: own.t.title });
      await activity(ctx.video.id, "assets", "audio", `Música: «${own.t.title}» (${b.mood_en})`);
      continue;
    }
    // 2) biblioteca y 3) fuentes libres
    let a: Asset | null = (await searchLibrary(b.mood_en, "music", 1, { minDur: 40 }))[0] ?? null;
    if (!a) {
      const rep = await searchSources(b.mood_en, "music", 3);
      for (const c of rankCandidates(rep.candidates, "music").filter((c) => !c.duration || c.duration >= 40).slice(0, 2)) {
        try { a = a ?? (await importCandidate(c)); } catch { /* siguiente */ }
      }
    }
    if (a) { outBeds.push({ ...b, asset_id: a.id, path: a.path, title: a.title }); await activity(ctx.video.id, "assets", "audio", `Música: «${a.title}» (${a.license})`); }
    else { outBeds.push({ ...b, path: null }); await activity(ctx.video.id, "assets", "warn", `Sin música para «${b.mood_en}». Agrega pistas propias en Biblioteca → Música.`); }
  }
  return outBeds;
}

/** Tarjeta (o tarjeta de respaldo) para una toma sin archivo. */
async function renderCardFor(ctx: Ctx, sh: Shot, segs: SegInfo[], script: ScriptOut, research: ResearchOut, base: string): Promise<string> {
  const v = ctx.video;
  const visual = await skillParams(v.channel_id, "visual", VISUAL_DEFAULTS);
  const seg = segs.find((x) => x.id === sh.segment_id)!;
  if (sh.visual === "source_card") {
    const src = research.sources.find((x) => x.id === sh.source_id);
    const narr = shotNarration(sh, seg).toLowerCase();
    const claims = script.segments.find((x) => x.id === sh.segment_id)?.claims ?? [];
    const claim = claims.find((c) => c.source_ids.includes(sh.source_id ?? "") && narr.includes(c.text_en.toLowerCase().trim())) ?? claims.find((c) => c.source_ids.includes(sh.source_id ?? ""));
    const fact = (claim && research.facts.find((f) => claim.fact_ids.includes(f.id) && f.source_ids.includes(sh.source_id ?? ""))) ?? research.facts.find((f) => f.source_ids.includes(sh.source_id ?? ""));
    return renderSourceCard({ publisher: src?.publisher ?? "", title: src?.title ?? sh.card_text ?? "", date: src?.date ?? "", quote: fact?.quote ?? seg.sentences[sh.from] ?? "", url: src?.url ?? "" }, visual, base + ".png");
  }
  if (sh.visual === "title_card") return renderTitleCard({ kicker: `Chapter ${script.segments.findIndex((x) => x.id === sh.segment_id) + 1}`, title: sh.card_text || seg.title }, visual, base + ".png");
  if (sh.visual === "quote_card") return renderQuoteCard({ quote: sh.card_text ?? "" }, visual, base + ".png");
  return renderTextCard({ text: sh.card_text || shortPhrase(seg.sentences[sh.from]) }, visual, base + ".png");
}

export async function stageAssets(ctx: Ctx): Promise<AssetsOut> {
  const v = ctx.video;
  const sb = await need<StoryboardOut>(v, "storyboard", "Storyboard");
  const script = await need<ScriptOut>(v, "script", "Guion");
  const research = await need<ResearchOut>(v, "research", "Investigación");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const prev = await out<AssetsOut>(v, "assets");
  const segs = segInfos(script, voice);
  const s = getSettings();
  const dir = joinPath(v.dir, "cards");
  await fs.mkdir(dir);
  const visualP = await skillParams(v.channel_id, "visual", VISUAL_DEFAULTS);
  const shots: Shot[] = sb.shots.map((x) => ({ ...x }));
  const same = (a: Shot, b: Shot) => a.visual === b.visual && a.query_en === b.query_en && a.card_text === b.card_text && a.source_id === b.source_id && (a.image_prompt_en ?? "") === (b.image_prompt_en ?? "");
  let downloaded = 0, reused = 0, fallbacks = 0;
  const allNew: Asset[] = [];
  const pool = new Map<string, Asset[]>();
  const chosen = new Set<string>();
  const narr = (sh: Shot) => shotNarration(sh, segs.find((x) => x.id === sh.segment_id)!);
  const aiReady = await aiImagesReady();
  const aiCap = s.images.perVideo;
  let aiUsed = 0;

  // Imagen con IA para una toma (respeta el tope por video)
  const generate = async (sh: Shot, why: string): Promise<boolean> => {
    if (!aiReady || aiUsed >= aiCap) return false;
    try {
      await ctx.progress(`Creando imagen con IA para ${sh.id}…`);
      const r = await generateImage({ prompt: imagePromptFor(sh, narr(sh), visualP.imageStyle), outBase: joinPath(dir, `${sh.id}-ia-${Date.now().toString(36)}`), videoId: v.id, channelId: v.channel_id, label: `toma ${sh.id}` });
      aiUsed++;
      Object.assign(sh, { path: r.path, media: "image", provenance: r.provenance, asset_id: null, error: null, focus_x: 0.5, focus_y: 0.45 });
      await activity(v.id, "assets", "asset", `${sh.id}: imagen con IA (${why})`, r.provenance.provider, r.path);
      setLive(v.id, { frame: r.path, caption: `Imagen con IA: ${sh.id}` });
      return true;
    } catch (e) {
      await activity(v.id, "assets", "warn", `${sh.id}: no se pudo crear la imagen con IA`, e instanceof UserError ? `${e.userMessage}\n${e.detail.slice(0, 400)}` : String(e));
      return false;
    }
  };

  // 1) Reutilizar lo ya resuelto y buscar candidatos para lo demás
  const media = shots.filter((x) => MEDIA_VISUALS.has(x.visual));
  for (const sh of media) {
    const old = prev?.shots.find((p) => p.id === sh.id && same(p, sh) && p.path && (p.asset_id || p.provenance?.kind === "generated"));
    if (old && (await fs.exists(old.path!))) {
      Object.assign(sh, { asset_id: old.asset_id, path: old.path, media: old.media, focus_x: old.focus_x, focus_y: old.focus_y, clip_in: old.clip_in, provenance: old.provenance });
      if (old.asset_id) chosen.add(old.asset_id);
      if (old.provenance?.kind === "generated") aiUsed++;
      reused++;
    }
  }
  // 2) Tomas pensadas para IA: se crean primero (si falla, se busca material como una foto)
  for (const sh of media.filter((x) => x.visual === "ai_image" && !x.path)) {
    checkCancel(ctx);
    if (!(await generate(sh, "pedida en el storyboard"))) sh.visual = "photo";
  }
  const toHunt = media.filter((x) => !x.path);
  for (const [i, sh] of toHunt.entries()) {
    checkCancel(ctx);
    await ctx.progress(`Buscando material ${i + 1}/${toHunt.length}: ${sh.query_en}`);
    const r = await huntShot(ctx, sh, chosen);
    pool.set(sh.id, r.candidates);
    sh.candidates = r.candidates.map((a) => a.id);
    downloaded += r.downloaded.length;
    allNew.push(...r.downloaded);
  }
  // 3) Visión: describir una sola vez lo descargado (en lotes)
  const toDescribe = [...new Map([...allNew, ...[...pool.values()].flat()].filter((a) => !a.described_at).map((a) => [a.id, a])).values()];
  let described = 0;
  if (toDescribe.length) {
    await ctx.progress(`Describiendo ${toDescribe.length} archivo(s)…`);
    described = await describeAssets(toDescribe, { videoId: v.id, channelId: v.channel_id, stage: "assets", jobId: ctx.jobId });
  }
  // 4) Casting (Sonnet, solo texto): elegir el mejor candidato de cada toma
  const pending = media.filter((sh) => !sh.path && (pool.get(sh.id)?.length ?? 0) > 0);
  if (pending.length) {
    const fresh = await getAssets([...new Set(pending.flatMap((sh) => pool.get(sh.id)!.map((a) => a.id)))]);
    for (let i = 0; i < pending.length; i += 30) {
      checkCancel(ctx);
      const chunk = pending.slice(i, i + 30);
      await ctx.progress(`Eligiendo material (${Math.min(i + 30, pending.length)}/${pending.length})…`);
      const r = await claudeRun<{ picks: { shot_id: string; asset_id: string; focus_x: number; focus_y: number; clip_in: number; note_es: string }[] }>({
        stage: "storyboard", activityStage: "assets", label: "Casting de material", system: SYSTEM_BASE, schema: P2.CASTING_SCHEMA, quiet: true,
        prompt: P2.castingPrompt({ shots: chunk.map((sh) => ({
          id: sh.id, narration: narr(sh), visual: sh.visual, must_show_es: sh.must_show_es ?? "", avoid_es: sh.avoid_es ?? "", dur: sh.dur ?? 3,
          candidates: pool.get(sh.id)!.map((a) => fresh.get(a.id) ?? a).filter((a) => a.usable).map((a) => ({
            id: a.id, kind: a.kind, caption: a.tags.split(",")[0] ?? a.title, description: (a.description || a.title).slice(0, 420), quality: a.quality || 3,
            real_person: !!a.real_person, license: a.license, size: `${a.width ?? "?"}×${a.height ?? "?"}`, duration: a.duration ?? undefined, used_in_video: chosen.has(a.id),
          })),
        })) }),
        videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
      });
      for (const p of r.data.picks ?? []) {
        const sh = chunk.find((x) => x.id === p.shot_id);
        const a = p.asset_id ? fresh.get(p.asset_id) : null;
        if (!sh || !a || !pool.get(sh.id)!.some((c) => c.id === a.id)) continue;
        Object.assign(sh, { asset_id: a.id, path: a.path, media: a.kind === "video" ? "video" : "image", focus_x: clamp01(p.focus_x), focus_y: clamp01(p.focus_y),
          clip_in: a.kind === "video" ? Math.max(0, Math.min((a.duration ?? 0) - 0.5, Number(p.clip_in) || 0)) : undefined, cast_note_es: p.note_es, provenance: assetProvenance(a) });
        chosen.add(a.id);
        await activity(v.id, "assets", "decision", `${sh.id}: ${a.tags.split(",")[0] || a.title}`, p.note_es, a.thumb);
      }
    }
  }
  // 5) Tomas sin material: imagen con IA → material de la biblioteca relacionado → imagen ya usada en el capítulo → (último recurso) tarjeta
  for (const sh of media.filter((x) => !x.path)) {
    checkCancel(ctx);
    fallbacks++;
    if (sh.visual !== "clip" && (await generate(sh, "sin material libre adecuado"))) continue;
    const related = (await searchLibrary(keywordsQuery(narr(sh)) || sh.query_en || "", "image", 6, { excludeIds: [...chosen] })).filter((a) => a.usable !== 0 && !a.real_person)[0];
    if (related) {
      Object.assign(sh, { asset_id: related.id, path: related.path, media: "image", focus_x: 0.5, focus_y: 0.5, provenance: assetProvenance(related), visual: sh.visual === "clip" ? "photo" : sh.visual });
      chosen.add(related.id);
      await activity(v.id, "assets", "decision", `${sh.id}: material relacionado de la biblioteca`, related.title, related.thumb);
      continue;
    }
    const sibling = shots.find((x) => x.segment_id === sh.segment_id && x.id !== sh.id && x.path && x.media === "image" && x.provenance?.kind !== "card");
    if (sibling) {
      Object.assign(sh, { asset_id: sibling.asset_id, path: sibling.path, media: "image", focus_x: 1 - (sibling.focus_x ?? 0.5), focus_y: sibling.focus_y ?? 0.5, provenance: sibling.provenance, motion: "pan_left" });
      await activity(v.id, "assets", "decision", `${sh.id}: reutiliza la imagen de ${sibling.id} con otro encuadre`);
      continue;
    }
    sh.error = `Sin material para «${sh.query_en}»; se usa una tarjeta.`;
    await activity(v.id, "assets", "warn", `${sh.id}: ${sh.error}`);
    sh.visual = "text_card";
    // Dos tarjetas seguidas del mismo beat no repiten el texto: la segunda muestra la otra mitad de la frase
    const words = narr(sh).split(/\s+/).filter(Boolean);
    const prevCard = shots.find((x) => x.beat === sh.beat && x.id < sh.id && x.visual === "text_card" && x.card_text);
    sh.card_text = prevCard && prevCard.card_text === shortPhrase(words.join(" ")) ? shortPhrase(words.slice(Math.ceil(words.length / 2)).join(" ")) : shortPhrase(words.join(" "));
  }
  // 6) Tarjetas y marcadores provisionales de animación
  for (const sh of shots) {
    checkCancel(ctx);
    if (sh.path && (await fs.exists(sh.path))) continue;
    const base = joinPath(dir, `${sh.id}-${Date.now().toString(36)}`);
    sh.error = sh.error ?? null;
    const path = await renderCardFor(ctx, sh, segs, script, research, base);
    Object.assign(sh, { path, media: "image", provenance: { kind: "card", provider: "ATRIL" } as Provenance });
    if (sh.visual !== "motion" && sh.visual !== "map") await activity(v.id, "assets", "asset", `${sh.id}: tarjeta «${(sh.card_text ?? sh.visual).slice(0, 60)}»`, "", path);
  }
  // 7) Sonido: efectos y camas musicales
  await ctx.progress("Efectos de sonido y música…");
  const sfx = await resolveSfx(ctx, sb.sfx);
  const music = await resolveMusic(ctx, sb.music);
  await markUsed(shots.map((x) => x.asset_id).filter(Boolean) as string[]);
  const cards = shots.filter((x) => x.provenance?.kind === "card" && x.visual !== "motion" && x.visual !== "map").length;
  await activity(v.id, "assets", "decision", `Medios: ${downloaded} descargados · ${aiUsed} con IA · ${cards} tarjeta(s) · ${sfx.length} efectos`);
  const key = await sha256(JSON.stringify([shots.map((x) => [x.id, x.path, x.focus_x, x.clip_in]), sfx.map((x) => [x.at, x.path]), music.map((x) => x.path)]));
  return { shots, sfx, music, downloaded, described, reused, fallbacks, key };
}

const clamp01 = (x: number) => (Number.isFinite(Number(x)) ? Math.min(1, Math.max(0, Number(x))) : 0.5);

// ======================= 7. Retoques (Opus) =======================
export async function stagePolish(ctx: Ctx): Promise<PolishOut> {
  const v = ctx.video;
  const assets = await need<AssetsOut>(v, "assets", "Medios");
  const script = await need<ScriptOut>(v, "script", "Guion");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const prev = await out<PolishOut>(v, "polish");
  const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
  const visual = await skillParams(v.channel_id, "visual", VISUAL_DEFAULTS);
  const captions = await skillParams(v.channel_id, "subtitulos", CAPTION_DEFAULTS);
  const polishSkills = await composeSkills(v.channel_id, ["montage", "edit"]);
  const key = `${assets.key}:${(await sha256(JSON.stringify([polishSkills, montage, visual, captions.enabled]))).slice(0, 16)}`;
  if (prev && prev.key === key && !prev.skipped) return prev;
  const segs = segInfos(script, voice);
  const offsets = segmentOffsets(segs, montage.pauseBetweenSegments);
  const total = segs.reduce((a, s) => a + segmentLength(s, montage.pauseBetweenSegments), 0);
  const budget = await motionBudget(total);
  const assetMap = await getAssets(assets.shots.map((x) => x.asset_id).filter(Boolean) as string[]);
  const describe = (s: Shot) => {
    const a = s.asset_id ? assetMap.get(s.asset_id) : null;
    if (a) return `${a.id}: ${(a.tags.split(",")[0] || a.title).slice(0, 90)}${a.kind === "video" ? ` (clip ${Math.round(a.duration ?? 0)}s)` : ""}`;
    if (s.visual === "motion" || s.visual === "map") return `PLACEHOLDER for ${s.visual}: ${s.motion_brief_en ?? ""}`;
    return `${s.visual}: "${(s.card_text ?? "").slice(0, 80)}"`;
  };
  const edl = buildEdl(assets.shots, segs, offsets, assets.sfx, describe);
  await ctx.progress("Opus pule la edición…");
  await activity(v.id, "polish", "think", "Opus revisa el corte");
  const r = await claudeRun<PolishRaw>({
    stage: "polish", activityStage: "polish", label: "Retoques de edición", system: SYSTEM_BASE, schema: P2.POLISH_SCHEMA,
    prompt: P2.polishPrompt({ skills: polishSkills,
      motionBudget: budget, edl, captions: captions.enabled, palette: { background: visual.background, foreground: visual.foreground, accent: visual.accent, muted: visual.muted, fontTitle: visual.fontTitle, fontBody: visual.fontBody } }),
    videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
  });
  const applied = applyPolish(r.data, assets.shots, assets.sfx, offsets, total, budget);
  // Las tomas marcadas como animación que Opus no convirtió reciben una animación con su propio guion
  for (const sh of applied.shots.filter((x) => (x.visual === "motion" || x.visual === "map") && !applied.motion.some((m) => m.shot_ids.includes(x.id)))) {
    if (applied.motion.length >= budget) break;
    applied.motion.push({ id: `m${applied.motion.length + 1}`, kind: "fullscreen", shot_ids: [sh.id], segment_id: sh.segment_id, start: sh.start ?? 0, duration: sh.dur ?? 4,
      brief_en: sh.motion_brief_en ?? "", text: sh.card_text ?? "", libs: sh.visual === "map" ? ["map"] : [], asset_ids: [] });
  }
  applied.motion = ensureMotionCadence(applied.motion, applied.shots, offsets, total, budget, (sh) => shotNarration(sh, segs.find((x) => x.id === sh.segment_id)!));
  // Cada secuencia de motion entra con un efecto (si no hay uno ya en ese instante)
  let fxN = applied.sfx.length + 100;
  for (const m of applied.motion) {
    const at = Math.max(0, offsets[m.segment_id] + m.start - (m.kind === "fullscreen" ? 0.12 : 0));
    if (applied.sfx.some((c) => Math.abs(c.at - at) < 0.6)) continue;
    applied.sfx.push(m.kind === "fullscreen"
      ? { id: `fx${++fxN}`, at, type: "whoosh", query_en: "cinematic whoosh transition", gain_db: -15 }
      : { id: `fx${++fxN}`, at, type: "pop", query_en: "soft ui pop", gain_db: -20 });
  }
  applied.sfx.sort((a, b) => a.at - b.at);
  for (const sh of applied.shots) if (!sh.grade) sh.grade = applied.grade;
  for (const m of applied.motion) await activity(v.id, "polish", "motion", `Animación ${m.id} (${m.kind === "overlay" ? "capa" : "pantalla completa"}, ${m.duration.toFixed(1)} s)`, `${m.brief_en}${m.text ? `\nTexto: ${m.text}` : ""}`);
  const changed = (r.data.shots ?? []).length;
  await activity(v.id, "polish", "decision", `Retoques: ${changed} tomas · ${(r.data.sfx_add ?? []).length} efectos · ${applied.motion.length} animaciones`, [r.data.notes_es ?? "", ...(r.data.skills_check_es ?? []).map((x) => `• ${x}`)].filter(Boolean).join("\n"));
  const verify = (r.data.verify_es ?? []).map((x) => x.trim()).filter(Boolean);
  if (verify.length) {
    await activity(v.id, "polish", "warn", `Comprobar ${verify.length} dato(s) antes de publicar`, verify.join("\n"));
    await log("warn", "retoques", `Opus sugiere comprobar ${verify.length} dato(s) antes de publicar.`, verify.join("\n"), v.id);
  }
  const sfx = await resolveSfx(ctx, applied.sfx);
  return { shots: applied.shots, sfx, music: assets.music, motion: applied.motion, notes_es: r.data.notes_es ?? "", grade: applied.grade, key, verify_es: verify };
}

// ======================= 8. Animaciones (Opus + motor) =======================
async function contactSheet(samples: string[], outPath: string, transparent: boolean) {
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  samples.forEach((s) => args.push("-i", s));
  const n = samples.length;
  const f: string[] = samples.map((_, i) => transparent
    ? `color=c=0x5A5F66:s=1920x1080:d=1[bg${i}];[bg${i}][${i}:v]overlay=0:0,scale=512:288[t${i}]`
    : `[${i}:v]scale=512:288[t${i}]`);
  const cols = Math.min(3, n); const rows = Math.ceil(n / cols);
  f.push(`${samples.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${n}:layout=${Array.from({ length: n }, (_, i) => `${(i % cols) * 512}_${Math.floor(i / cols) * 288}`).join("|")}:fill=black[v]`);
  if (n === 1) f[f.length - 1] = `[t0]null[v]`;
  void rows;
  await ffmpeg([...args, "-filter_complex", f.join(";"), "-map", "[v]", "-frames:v", "1", "-q:v", "3", outPath]);
}

/** Busca o crea el sonido de cada efecto de las animaciones (con la misma cadena que el resto: biblioteca → Freesound → ElevenLabs → síntesis). */
async function resolveMotionSfx(ctx: Ctx, items: MotionItem[]) {
  const pending = items.filter((m) => m.file && (m.sfx ?? []).some((c) => !c.path));
  if (!pending.length) return;
  // Se desplazan 10 s para que el adelanto de un whoosh (su pico cae en el golpe) pueda quedar antes del inicio de la animación
  const all = pending.flatMap((m) => (m.sfx ?? []).map((c) => ({ ...c, id: `${m.id}|${c.id}`, at: c.at + 10 })));
  const done = await resolveSfx(ctx, all, "motion");
  for (const m of pending) m.sfx = done.filter((c) => c.id.startsWith(`${m.id}|`)).map((c) => ({ ...c, id: c.id.slice(m.id.length + 1), at: Math.round((c.at - 10) * 100) / 100 }));
}

export async function stageMotion(ctx: Ctx): Promise<MotionOut> {
  const v = ctx.video;
  const polish = await need<PolishOut>(v, "polish", "Retoques");
  const prev = await out<MotionOut>(v, "motion");
  const cfg = getSettings().motion;
  const items: MotionItem[] = polish.motion.map((m) => ({ ...m }));
  if (!items.length || !cfg.enabled) return { items, rendered: 0, failed: 0 };
  const script = await need<ScriptOut>(v, "script", "Guion");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const segs = segInfos(script, voice);
  const visual = await skillParams(v.channel_id, "visual", VISUAL_DEFAULTS);
  const palette = { background: visual.background, foreground: visual.foreground, muted: visual.muted, accent: visual.accent, fontTitle: visual.fontTitle, fontBody: visual.fontBody, fontMono: visual.fontMono };
  const skills = await composeSkills(v.channel_id, ["motion"]);
  const dir = joinPath(v.dir, "motion");
  await fs.mkdir(dir);
  const assetMap = await getAssets([...new Set(items.flatMap((m) => m.asset_ids ?? []))]);
  const skillsKey = (await sha256(skills)).slice(0, 12);
  for (const m of items) m.hash = await sha256(JSON.stringify([m.kind, m.brief_en, m.text, Math.round(m.duration * 30), m.libs, m.asset_ids, m.icons ?? [], palette, skillsKey]));
  // Reutilizar lo ya renderizado
  for (const m of items) {
    const old = prev?.items.find((p) => p.hash === m.hash && p.file);
    if (old && (await fs.exists(old.file!))) { m.file = old.file; m.code = old.code; m.critique_es = old.critique_es; m.poster = old.poster; m.sfx = old.sfx; }
  }
  const todo = items.filter((m) => !m.file);
  if (!todo.length) { await resolveMotionSfx(ctx, items); return { items, rendered: items.filter((m) => m.file).length, failed: 0 }; }

  const browserPath = await requireBrowser();
  const res = await motionResources();
  // Íconos pedidos por las animaciones: biblioteca → Iconify → creados por Claude
  const iconSvg = new Map<string, string>(); const iconAsset = new Map<string, string>();
  for (const name of [...new Set(todo.flatMap((m) => m.icons ?? []))]) {
    checkCancel(ctx);
    const a = await resolveIcon(name, v.id).catch(() => null);
    if (a) { try { iconSvg.set(iconKey(name), await fs.readText(a.path)); iconAsset.set(iconKey(name), a.id); await activity(v.id, "motion", "asset", `Ícono «${name}»`, `${a.source === "generated" ? "Creado con IA" : a.attribution}`, a.path); } catch { /* ilegible */ } }
  }
  for (const m of todo) m.icon_ids = (m.icons ?? []).map((n) => iconAsset.get(iconKey(n))).filter(Boolean) as string[];
  const iconsFor = (m: MotionItem) => Object.fromEntries((m.icons ?? []).map((n) => [iconKey(n), iconSvg.get(iconKey(n))]).filter((x) => !!x[1])) as Record<string, string>;
  const work = joinPath(v.dir, "motion", "trabajo");
  let browser: Browser | null = null;
  const contextOf = (m: MotionItem) => {
    const seg = segs.find((s) => s.id === m.segment_id);
    const shots = polish.shots.filter((s) => m.shot_ids.includes(s.id));
    return seg ? shots.map((s) => shotNarration(s, seg)).join(" ").slice(0, 600) : "";
  };
  const assetsFor = (m: MotionItem) => (m.asset_ids ?? []).map((id, i) => ({ key: `img${i + 1}`, a: assetMap.get(id) })).filter((x) => x.a && x.a.kind === "image");
  const toComp = (m: MotionItem, c: { css: string; html: string; js: string; libs: ("map" | "d3")[]; duration?: number }): Composition => ({
    id: m.id, duration: m.duration, transparent: m.kind === "overlay", css: c.css, html: c.html, js: c.js, libs: c.libs ?? m.libs,
    assets: Object.fromEntries(assetsFor(m).map((x) => [x.key, x.a!.path])),
    palette: { bg: palette.background, fg: palette.foreground, accent: palette.accent, muted: palette.muted, fontTitle: palette.fontTitle, fontBody: palette.fontBody, fontMono: palette.fontMono },
    icons: iconsFor(m),
  });

  const render = async (m: MotionItem, comp: Composition) => {
    const ext = comp.transparent ? "mov" : "mp4";
    const file = joinPath(dir, `${m.id}-${m.hash!.slice(0, 8)}.${ext}`);
    const r = await renderComposition(browser!, comp, {
      ...res, workDir: joinPath(work, m.id), out: file, samples: [0.12, 0.3, 0.5, 0.7, 0.85, 0.98],
      cancelled: () => ctx.cancelled(),
      onFrame: (i, n, pv) => {
        if (i % 15 === 0 || i === n) void ctx.progress(`Animación ${m.id}: cuadro ${i}/${n}`);
        if (pv) setLive(v.id, { frame: `data:${pv.mime};base64,${pv.b64}`, caption: `Renderizando animación ${m.id} · cuadro ${i}/${n}`, progress: i / n });
      },
    });
    return r;
  };

  const compose = async (batch: MotionItem[]) => {
    const r = await claudeRun<{ compositions: { id: string; title: string; duration: number; css: string; html: string; js: string; libs: ("map" | "d3")[]; sfx?: MotionSfxRaw[] }[] }>({
      stage: "motion", activityStage: "motion", label: `Animaciones ${batch.map((x) => x.id).join(", ")}`, system: P2.MOTION_SYSTEM, schema: P2.MOTION_SCHEMA,
      prompt: P2.motionPrompt({ skills, palette, items: batch.map((m) => ({ id: m.id, kind: m.kind, duration: m.duration, brief: m.brief_en, text: m.text ?? "", libs: m.libs ?? [], context: contextOf(m),
        assets: assetsFor(m).map((x) => ({ key: x.key, description: (x.a!.tags.split(",")[0] || x.a!.title).slice(0, 120) })), icons: Object.keys(iconsFor(m)) })) }),
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
    });
    return r.data.compositions ?? [];
  };

  const fix = async (m: MotionItem, code: { css: string; html: string; js: string }, problems: string[]) => {
    await activity(v.id, "motion", "motion", `Opus corrige la animación ${m.id}`, problems.join("\n"));
    const r = await claudeRun<{ compositions: { id: string; css: string; html: string; js: string; libs: ("map" | "d3")[]; sfx?: MotionSfxRaw[] }[] }>({
      stage: "motion", activityStage: "motion", label: `Corrección de animación ${m.id}`, system: P2.MOTION_SYSTEM, schema: P2.MOTION_SCHEMA,
      prompt: P2.motionFixPrompt({ item: { id: m.id, kind: m.kind, duration: m.duration, brief: m.brief_en, text: m.text ?? "" }, code, problems, skills }),
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
    });
    return r.data.compositions?.[0] ?? null;
  };

  const critique = async (m: MotionItem, samples: string[]): Promise<{ ok: boolean; problems: string[] }> => {
    const sheet = joinPath(work, m.id, "hoja.jpg");
    await contactSheet(samples, sheet, m.kind === "overlay");
    setLive(v.id, { frame: sheet, caption: `Revisión visual de la animación ${m.id}` });
    const r = await claudeRun<{ ok: boolean; problems_en: string[]; severity: string }>({
      stage: "critique", activityStage: "motion", label: `Revisión visual ${m.id}`, system: "You are a strict broadcast design reviewer.", schema: P2.CRITIQUE_SCHEMA, quiet: true,
      prompt: P2.critiquePrompt({ kind: m.kind, brief: m.brief_en, text: m.text ?? "", skills }), images: [{ label: "Frames:", path: sheet }],
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
    });
    const ok = r.data.ok || r.data.severity !== "major";
    await activity(v.id, "motion", ok ? "done" : "warn", `Revisión de ${m.id}: ${ok ? "aprobada" : "con defectos"}`, (r.data.problems_en ?? []).join("\n"));
    return { ok, problems: r.data.problems_en ?? [] };
  };

  let failed = 0;
  let engineFail: string | null = null;
  try {
    await activity(v.id, "motion", "stage", "Abriendo el motor de animaciones");
    browser = await launchBrowser(tauriHost, browserPath, work);
    outer: for (let i = 0; i < todo.length; i += Math.max(1, cfg.perCall)) {
      checkCancel(ctx);
      const batch = todo.slice(i, i + Math.max(1, cfg.perCall));
      await ctx.progress(`Opus diseña ${batch.length === 1 ? "la animación" : "las animaciones"} ${batch.map((x) => x.id).join(", ")}…`);
      let comps: Awaited<ReturnType<typeof compose>> = [];
      try { comps = await compose(batch); }
      catch (e) { for (const m of batch) { m.error = e instanceof Error ? e.message : String(e); failed++; } continue; }
      for (const m of batch) {
        checkCancel(ctx);
        let c = comps.find((x) => x.id === m.id) ?? comps[batch.indexOf(m)];
        if (!c) { m.error = "Opus no devolvió esta animación"; failed++; continue; }
        m.attempts = 0;
        for (;;) {
          m.attempts++;
          try {
            const comp = toComp(m, c);
            const r = await render(m, comp);
            const problems = [...r.errors, ...r.consoleErrors.filter((x) => !/favicon/i.test(x))];
            if (problems.length && m.attempts < 3) { const f = await fix(m, c, problems); if (f) { c = { ...c, ...f }; continue; } }
            if (cfg.critique && m.attempts < 3) {
              const cr = await critique(m, r.samples);
              m.critique_es = cr.problems.join(" · ");
              if (!cr.ok) { const f = await fix(m, c, cr.problems); if (f) { c = { ...c, ...f }; continue; } }
            }
            m.file = r.file; m.error = null;
            m.code = { css: c.css, html: c.html, js: c.js, libs: c.libs ?? [], duration: m.duration };
            m.sfx = motionCues(m, c.sfx);
            // Cuadro de muestra persistente (la carpeta de trabajo se borra al terminar)
            m.poster = r.file.replace(/\.(mp4|mov)$/i, ".jpg");
            try { await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", (r.duration * 0.6).toFixed(2), "-i", r.file, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", m.poster]); }
            catch { m.poster = null; }
            await activity(v.id, "motion", "render", `Animación ${m.id} lista (${r.frames} cuadros)`, m.brief_en, m.poster);
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Un fallo del motor afecta a todas: no se gasta Opus intentando "corregir" el código
            if (e instanceof EngineError) { engineFail = msg; m.error = msg; failed++; break outer; }
            if (e instanceof MotionError && m.attempts < 3) { const f = await fix(m, c, [msg]); if (f) { c = { ...c, ...f }; continue; } }
            m.error = msg; failed++;
            await activity(v.id, "motion", "warn", `La animación ${m.id} falló; se mantiene la toma original`, msg);
            break;
          }
        }
      }
    }
  } finally {
    if (browser) await closeBrowser(browser);
    try { await fs.remove(work); } catch { /* noop */ }
  }
  if (engineFail) {
    for (const m of items) if (!m.file && !m.error) { m.error = engineFail; failed++; }
    await activity(v.id, "motion", "warn", "El motor de animaciones falló; el video sigue sin las animaciones que faltan", engineFail);
    await log("error", "animaciones", "El motor de animaciones falló. Revisa Diagnóstico → Motor de animaciones.", engineFail, v.id, true);
  }
  await resolveMotionSfx(ctx, items);
  return { items, rendered: items.filter((m) => m.file).length, failed };
}

// ======================= 10. Montaje v2 =======================
/** Versión del motor de montaje: si cambia, los segmentos ya montados se rehacen. */
const MONTAGE_ENGINE = "2.0.1";
async function copyFonts(dir: string) {
  const src = await resourcePath("fonts");
  const dst = joinPath(dir, "fonts");
  await fs.mkdir(dst);
  for (const f of FONT_FILES) { const t = joinPath(dst, f.file); if (!(await fs.exists(t))) await fs.copy(joinPath(src, f.file), t); }
}

export async function stageRenderV2(ctx: Ctx): Promise<RenderOut> {
  const v = ctx.video;
  const script = await need<ScriptOut>(v, "script", "Guion");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const polish = await need<PolishOut>(v, "polish", "Retoques");
  const motion = (await out<MotionOut>(v, "motion")) ?? { items: [], rendered: 0, failed: 0 };
  const sb = await out<StoryboardOut>(v, "storyboard");
  const prev = await out<RenderOut>(v, "render");
  const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
  const capP = await skillParams(v.channel_id, "subtitulos", CAPTION_DEFAULTS);
  const encoder = await pickEncoder();
  const modern = await filterScriptModern();
  const dir = joinPath(v.dir, "render");
  await fs.mkdir(dir);
  const free = await fs.diskFree(v.dir).catch(() => Number.MAX_SAFE_INTEGER);
  if (free < 4 * 1024 ** 3) throw new UserError("Queda poco espacio en disco (menos de 4 GB).", "Libera espacio y reintenta.", "montaje", false);
  if (capP.enabled) await copyFonts(dir);
  const segs = segInfos(script, voice);
  const offsets = segmentOffsets(segs, montage.pauseBetweenSegments);
  const assetMap = await getAssets(polish.shots.map((x) => x.asset_id).filter(Boolean) as string[]);
  const motionDone = motion.items.filter((m) => m.file);

  const clips: string[] = []; const hashes: Record<string, string> = {}; const narration: { path: string; duration: number }[] = [];
  const totalAll = segs.reduce((a, s) => a + segmentLength(s, montage.pauseBetweenSegments), 0);
  let done = 0;
  for (const [i, seg] of segs.entries()) {
    checkCancel(ctx);
    const segShots = polish.shots.filter((x) => x.segment_id === seg.id);
    if (!segShots.length) throw new UserError(`El segmento «${seg.title}» no tiene tomas.`, "Rehaz el storyboard.", "montaje");
    const layer: LayerShot[] = [];
    for (let k = 0; k < segShots.length; k++) {
      const sh = segShots[k];
      const full = motionDone.find((m) => m.kind === "fullscreen" && m.shot_ids[0] === sh.id);
      if (full) {
        const run = segShots.filter((x) => full.shot_ids.includes(x.id));
        layer.push({ path: full.file!, media: "video", dur: run.reduce((a, x) => a + (x.dur ?? 0), 0), clipIn: 0, clipLen: full.code?.duration ?? full.duration, grade: "neutral", transitionIn: sh.transition_in, transitionS: sh.transition_s });
        k += run.length - 1;
        continue;
      }
      if (!sh.path) throw new UserError(`Falta el archivo de la toma ${sh.id}.`, "Vuelve a ejecutar «Medios».", "montaje");
      const a = sh.asset_id ? assetMap.get(sh.asset_id) : null;
      layer.push({
        path: sh.path, media: sh.media ?? "image", dur: sh.dur ?? 1, motion: sh.motion ?? (sh.visual.endsWith("card") ? "drift" : "zoom_in"),
        focus: { x: sh.focus_x ?? 0.5, y: sh.focus_y ?? 0.5 }, punchAt: sh.punch_at ?? null, clipIn: sh.clip_in ?? 0, clipLen: a?.duration ?? undefined,
        grade: sh.grade ?? polish.grade, transitionIn: k === 0 ? "cut" : sh.transition_in ?? "cut", transitionS: sh.transition_s,
      });
    }
    const overlays: LayerOverlay[] = motionDone.filter((m) => m.kind === "overlay" && m.segment_id === seg.id).map((m) => ({ path: m.file!, start: m.start, duration: m.code?.duration ?? m.duration }));
    // Subtítulos del segmento (tiempos de la voz)
    let assName: string | null = null;
    if (capP.enabled) {
      const pages = seg.sentences.flatMap((t, si) => paginate(wordTimings(t, seg.spans[si] ?? { start: 0, end: 0.1 }), capP));
      assName = `${seg.id}.ass`;
      await fs.writeText(joinPath(dir, assName), buildAss(pages, capP));
    }
    const clip = joinPath(dir, `${seg.id}.mp4`);
    const fadeIn = montage.segmentTransition === "fadeblack" || i === 0;
    const fadeOut = montage.segmentTransition === "fadeblack" || i === segs.length - 1;
    const spec = { shots: layer, overlays, out: clip, fadeIn, fadeOut, kenBurns: montage.kenBurns, captionsAss: assName, fontsDir: capP.enabled ? "fonts" : null,
      grain: montage.grain, vignette: montage.vignette, encoder };
    const h = await sha256(JSON.stringify({ engine: MONTAGE_ENGINE, spec, cap: capP.enabled ? [capP, seg.spans] : null, q: encoder.quality }));
    hashes[seg.id] = h;
    const segDur = segmentV2Duration(layer);
    const reusable = prev?.segmentHashes?.[seg.id] === h && (await fs.exists(clip)) && Math.abs((await probeDuration(clip).catch(() => 0)) - segDur) < 0.25;
    if (!reusable) {
      const { args, filter } = segmentV2Args(spec);
      const fpath = `${seg.id}.filtros.txt`;
      await fs.writeText(joinPath(dir, fpath), filter);
      await activity(v.id, "render", "render", `Montando «${seg.title}»: ${layer.length} tomas, ${overlays.length} capas animadas${capP.enabled ? ", subtítulos" : ""}`);
      const base = done;
      await ffmpeg(withFilterScript(args, fpath, modern), {
        jobId: ctx.jobId, cwd: dir,
        onSeconds: (sec) => { void ctx.progress(`Montando segmento ${i + 1}/${segs.length} · ${Math.min(100, Math.round(((base + sec) / totalAll) * 100))} %`); },
      });
      // Control: el clip debe durar lo mismo que su narración (si no, la imagen y la voz se desfasan)
      const got = await probeDuration(clip);
      if (Math.abs(got - segDur) > 0.25) {
        await fs.remove(clip);
        throw new UserError(`El segmento «${seg.title}» se montó con ${got.toFixed(2)} s en lugar de ${segDur.toFixed(2)} s.`, "Se borró el clip para no publicar un video desfasado. Reintenta; si se repite, revisa Diagnóstico y el registro de eventos.", "montaje");
      }
      // Vista previa en vivo: un cuadro del segmento recién montado
      try {
        const pv = joinPath(dir, `${seg.id}.preview.jpg`);
        await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", String(Math.min(segDur / 2, 4)), "-i", clip, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", pv]);
        setLive(v.id, { frame: pv, caption: `Segmento ${i + 1}/${segs.length} montado: ${seg.title}`, progress: (done + segDur) / totalAll });
        await activity(v.id, "render", "render", `Segmento ${i + 1}/${segs.length} listo`, seg.title, pv);
      } catch { /* sin vista previa */ }
    }
    done += segDur;
    clips.push(clip);
    const vs = voice.segments.find((x) => x.segment_id === seg.id);
    if (!vs) throw new UserError(`Falta la narración del segmento «${seg.title}».`, "", "montaje");
    narration.push({ path: vs.path, duration: segDur });
  }
  await ctx.progress("Mezcla final: voz, música, efectos…");
  await activity(v.id, "render", "audio", `Mezcla: ${polish.music.filter((b) => b.path).length} cama(s) musical(es), ${polish.sfx.length + motionDone.reduce((a, m) => a + (m.sfx ?? []).length, 0)} efectos`);
  const listPath = joinPath(dir, "list.txt");
  await fs.writeText(listPath, concatList(clips));
  const total = narration.reduce((a, s) => a + s.duration, 0);
  const beds = polish.music.filter((b) => b.path).map((b, i, arr) => {
    const first = b.segment_ids[0]; const last = b.segment_ids[b.segment_ids.length - 1];
    const lastSeg = segs.find((s) => s.id === last)!;
    const start = Math.max(0, offsets[first] - (i > 0 ? 1.5 : 0));
    const end = Math.min(total, offsets[last] + segmentLength(lastSeg, montage.pauseBetweenSegments) + (i < arr.length - 1 ? 1.5 : 0));
    return { path: b.path!, start, end, gainDb: montage.musicVolumeDb + (b.gain_db ?? 0), fadeIn: i === 0 ? 2 : 1.5, fadeOut: i === arr.length - 1 ? 4 : 1.5 };
  });
  // Efectos de las animaciones en su instante global; un efecto de retoques a <0,35 s de uno de ellos se omite (no se duplican)
  const motionSfx = motionDone.flatMap((m) => (m.sfx ?? []).filter((c) => c.path).map((c) => ({ path: c.path!, at: offsets[m.segment_id] + m.start + c.at, gainDb: c.gain_db, maxDur: Math.min(3, c.duration ?? 2) })))
    .filter((c) => c.at >= 0 && c.at < total);
  const sfx = [...polish.sfx.filter((c) => c.path && c.at < total && !motionSfx.some((x) => Math.abs(x.at - c.at) < 0.35)).map((c) => ({ path: c.path!, at: c.at, gainDb: c.gain_db, maxDur: Math.min(8, c.duration ?? 6) })), ...motionSfx];
  const clipAudio = polish.shots.filter((s) => s.media === "video" && s.clip_audio_db != null && s.path && !motionDone.some((m) => m.kind === "fullscreen" && m.shot_ids.includes(s.id)))
    .map((s) => ({ path: s.path!, clipIn: s.clip_in ?? 0, at: offsets[s.segment_id] + (s.start ?? 0), dur: s.dur ?? 1, gainDb: s.clip_audio_db! }));
  const file = joinPath(v.dir, "final.mp4");
  const { args, filter } = finalMixV2Args({ concatListPath: listPath, narration, beds, sfx, clipAudio, duck: montage.musicDuck, out: file });
  await fs.writeText(joinPath(dir, "mezcla.filtros.txt"), filter);
  await ffmpeg(withFilterScript(args, "mezcla.filtros.txt", modern), { jobId: ctx.jobId, cwd: dir, onSeconds: (sec) => { void ctx.progress(`Mezcla final · ${Math.min(100, Math.round((sec / total) * 100))} %`); } });
  await updateVideo(v.id, { data: { edit_version: 2 } });
  void sb;
  const duration = await probeDuration(file);
  const poster = joinPath(v.dir, "poster.jpg");
  try { await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", Math.min(30, duration * 0.2).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", poster]); } catch { /* sin portada */ }
  const r: RenderOut = { file, duration, encoder: encoder.name, segmentHashes: hashes, renderedAt: now(), sizeBytes: await fs.size(file), poster };
  await activity(v.id, "render", "done", `Video final listo (${Math.round(r.duration / 60)} min)`, file);
  return r;
}

/**
 * Cambia el material de una toma desde la revisión, conservando las decisiones
 * de Opus (no se repiten búsquedas ni llamadas). Después basta con volver a
 * montar: solo se rehace el segmento afectado.
 */
export async function replaceShotAsset(videoId: string, shotId: string, assetId: string | null, patch: Partial<Shot> = {}) {
  const asset = assetId ? (await getAssets([assetId])).get(assetId) ?? null : null;
  for (const stage of ["assets", "polish"]) {
    const rows = await db.query<{ output: string }>("SELECT output FROM stages WHERE video_id=? AND stage=?", [videoId, stage]);
    if (!rows[0]?.output) continue;
    const o = JSON.parse(rows[0].output) as { shots: Shot[] };
    const sh = o.shots.find((x) => x.id === shotId);
    if (!sh) continue;
    if (asset) Object.assign(sh, { asset_id: asset.id, path: asset.path, media: asset.kind === "video" ? "video" : "image", provenance: assetProvenance(asset),
      visual: asset.kind === "video" ? "clip" : sh.visual.endsWith("card") || sh.visual === "motion" || sh.visual === "map" ? "photo" : sh.visual, error: null, clip_in: asset.kind === "video" ? 0 : undefined });
    Object.assign(sh, patch);
    await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage=?", [JSON.stringify(o), videoId, stage]);
  }
  if (asset) await markUsed([asset.id]);
}

/** Convierte una toma en tarjeta de texto (sin archivo externo). */
export async function shotToCard(video: { id: string; channel_id: string; dir: string }, shotId: string, text: string) {
  const visual = await skillParams(video.channel_id, "visual", VISUAL_DEFAULTS);
  const path = await renderTextCard({ text }, visual, joinPath(video.dir, "cards", `${shotId}-${Date.now().toString(36)}.png`));
  await replaceShotAsset(video.id, shotId, null, { visual: "text_card", card_text: text, path, media: "image", asset_id: null, provenance: { kind: "card", provider: "ATRIL" } });
}

/** Cambia la música de una cama (pista propia o de la biblioteca). */
export async function setBedTrack(videoId: string, bedIndex: number, track: { path: string; title: string; asset_id?: string | null } | null) {
  for (const stage of ["assets", "polish"]) {
    const rows = await db.query<{ output: string }>("SELECT output FROM stages WHERE video_id=? AND stage=?", [videoId, stage]);
    if (!rows[0]?.output) continue;
    const o = JSON.parse(rows[0].output) as { music: MusicBed[] };
    if (!o.music?.[bedIndex]) continue;
    o.music[bedIndex] = { ...o.music[bedIndex], path: track?.path ?? null, title: track?.title, asset_id: track?.asset_id ?? null };
    await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage=?", [JSON.stringify(o), videoId, stage]);
  }
}

/** Fuerza a rehacer una animación (borra su archivo del resultado). */
export async function redoMotionItem(videoId: string, itemId: string) {
  const rows = await db.query<{ output: string }>("SELECT output FROM stages WHERE video_id=? AND stage='motion'", [videoId]);
  if (!rows[0]?.output) return;
  const o = JSON.parse(rows[0].output) as MotionOut;
  const it = o.items.find((x) => x.id === itemId);
  if (it) { it.file = null; it.hash = `redo-${uid("")}`; }
  await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage='motion'", [JSON.stringify(o), videoId]);
}

export { fileUrl };
