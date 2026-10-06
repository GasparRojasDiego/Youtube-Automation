// Implementación de cada etapa. Todas son reanudables: lo ya generado (y
// pagado) se reutiliza comparando huellas (hash) de sus entradas.
import { fs, db } from "../lib/ipc";
import { getSettings } from "../lib/settings";
import { composeSkills, skillParams, MONTAGE_DEFAULTS, VISUAL_DEFAULTS, THUMBNAIL_DEFAULTS, SCRIPT_DEFAULTS } from "../lib/skills";
import { getStage, saveArtifact, updateVideo, listMusic, type Video, type StageId } from "../lib/repo";
import { UserError, log } from "../lib/events";
import { emit } from "../lib/bus";
import { joinPath, sha256, wordCount, now, uid, extName } from "../lib/util";
import { claudeRun } from "../providers/claude";
import { synthesize, chunkText, ttsProviderName, type VoiceOverride } from "../providers/tts";
import { generateImage, searchCommons, downloadCommons } from "../providers/images";
import { ffmpeg, probeDuration, pickEncoder } from "../providers/ffmpeg";
import { uploadVideo, setThumbnail } from "../providers/youtube";
import * as P from "./prompts";
import * as L from "./logic";
import { segmentClipArgs, finalMixArgs, concatList, joinAudioArgs, toWavArgs, trimSilenceArgs, segmentDuration, type ShotSpec } from "./montage";
import { renderSourceCard, renderTitleCard, renderQuoteCard, renderTextCard, renderLowerThird, renderThumbnail } from "./cards";
import type { ResearchOut, ScriptOut, VerifyOut, VoiceOut, VisualsOut, PackageOut, RenderOut, PublishOut, PlannedShot } from "./types";

export interface Ctx {
  video: Video;
  jobId: string;
  progress: (text: string) => Promise<void>;
  cancelled: () => boolean;
}

/** Señal: la etapa necesita una acción del usuario (no es un error). */
export class NeedsUser extends Error { constructor(public messageEs: string) { super(messageEs); } }

const out = async <T>(v: Video, s: StageId) => (await getStage(v.id, s))?.output as T | null;
const need = async <T>(v: Video, s: StageId, label: string) => {
  const o = await out<T>(v, s);
  if (!o) throw new UserError(`Falta el resultado de «${label}».`, "Vuelve a ejecutar esa etapa.", "pipeline", false);
  return o;
};
const checkCancel = (ctx: Ctx) => { if (ctx.cancelled()) throw new UserError("Proceso cancelado.", "", "pipeline", true); };

async function wordsTarget(v: Video): Promise<[number, number, number]> {
  const s = getSettings().production;
  const p = await skillParams(v.channel_id, "guion", SCRIPT_DEFAULTS);
  const [lo, hi] = s.targetMinutes[v.mode];
  return [Math.round(lo * p.wordsPerMinute), Math.round(hi * p.wordsPerMinute), p.wordsPerMinute];
}

// ---------- 2. Investigación ----------
export async function stageResearch(ctx: Ctx): Promise<ResearchOut> {
  const v = ctx.video; const topic = v.data.topic ?? { title: v.title };
  await ctx.progress("Buscando y leyendo fuentes (puede tardar varios minutos)…");
  const r = await claudeRun<ResearchOut>({
    stage: "research", label: "Investigación", system: P.SYSTEM_BASE, schema: P.RESEARCH_SCHEMA, tools: ["WebSearch", "WebFetch"],
    prompt: P.researchPrompt({ skills: await composeSkills(v.channel_id, "research"), topic: topic.title, angle: topic.angle ?? "", notes: topic.notes ?? "", seedSources: topic.sources ?? [] }),
    videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId, timeoutMin: Math.max(getSettings().claude.timeoutMin, 45),
  });
  const d = r.data;
  if (!d.sources?.length || !d.facts?.length) throw new UserError("La investigación no encontró fuentes o hechos suficientes.", "Revisa el tema o añade fuentes sugeridas y reintenta.", "investigación");
  await saveArtifact(v.id, "research", d);
  return d;
}

// ---------- 3. Guion ----------
export async function stageScript(ctx: Ctx, revision?: { issues: unknown; notes: string }): Promise<ScriptOut> {
  const v = ctx.video;
  const research = await need<ResearchOut>(v, "research", "Investigación");
  const skills = await composeSkills(v.channel_id, "script");
  const [minW, maxW] = await wordsTarget(v);
  let script: ScriptOut;
  if (revision) {
    const current = await need<ScriptOut>(v, "script", "Guion");
    await ctx.progress("Corrigiendo el guion…");
    script = (await claudeRun<ScriptOut>({ stage: "script", label: "Corrección del guion", system: P.SYSTEM_BASE, schema: P.SCRIPT_SCHEMA,
      prompt: P.revisePrompt({ skills, research, script: current, issues: revision.issues, notes: revision.notes, minWords: minW, maxWords: maxW }),
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId })).data;
    script.version = (current.version ?? 1) + 1;
  } else {
    await ctx.progress("Escribiendo el guion…");
    script = (await claudeRun<ScriptOut>({ stage: "script", label: "Guion", system: P.SYSTEM_BASE, schema: P.SCRIPT_SCHEMA,
      prompt: P.scriptPrompt({ skills, topic: v.data.topic?.title ?? v.title, research, minWords: minW, maxWords: maxW, premium: v.mode === "premium" }),
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId })).data;
    script.version = 1;
    const passes = getSettings().production.scriptPasses[v.mode];
    for (let i = 1; i < passes; i++) {
      checkCancel(ctx);
      await ctx.progress(`Pasada de mejora ${i + 1}/${passes}…`);
      const mech = L.checkScript(script, research);
      script = (await claudeRun<ScriptOut>({ stage: "script", label: "Pasada de mejora del guion", system: P.SYSTEM_BASE, schema: P.SCRIPT_SCHEMA,
        prompt: P.revisePrompt({ skills, research, script, issues: mech, minWords: minW, maxWords: maxW,
          notes: "Second pass: sharpen the hook, tighten rhythm, deepen the original analysis, remove filler. Keep every claim sourced." }),
        videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId })).data;
      script.version = i + 1;
    }
  }
  if (!script.segments?.length) throw new UserError("El guion llegó vacío.", "", "guion");
  const words = L.scriptWords(script);
  if (words < minW * 0.7) await log("warn", "guion", `El guion quedó corto (${words} palabras; objetivo ${minW}–${maxW}).`, "", v.id);
  await saveArtifact(v.id, "script", script, revision ? "corrección" : "inicial");
  const best = script.title_options?.[0]?.title;
  if (best) await updateVideo(v.id, { title: best });
  return script;
}

// ---------- 4. Verificación ----------
export async function stageVerify(ctx: Ctx): Promise<VerifyOut> {
  const v = ctx.video;
  const research = await need<ResearchOut>(v, "research", "Investigación");
  const script = await need<ScriptOut>(v, "script", "Guion");
  const prev = await out<VerifyOut>(v, "verify");
  await ctx.progress("Verificando cada afirmación contra sus fuentes…");
  const r = await claudeRun<VerifyOut>({
    stage: "verify", label: "Verificación", system: P.SYSTEM_BASE, schema: P.VERIFY_SCHEMA, tools: ["WebFetch"],
    prompt: P.verifyPrompt({ skills: await composeSkills(v.channel_id, "verify"), research, script }),
    videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
  });
  const merged = L.mergeVerification(r.data, script, L.checkScript(script, research));
  merged.rounds = (prev?.rounds ?? 0) + 1;
  // vocabulario para la función de aprendizaje
  const t = now();
  for (const w of merged.vocab ?? []) {
    if (!w.term?.trim()) continue;
    await db.execute("INSERT OR IGNORE INTO vocab(id,term,meaning_es,example_en,note,video_id,due,created_at) VALUES(?,?,?,?,?,?,?,?)",
      [uid("vo_"), w.term.trim(), w.meaning_es, w.example_en, w.note_es, v.id, t, t]);
  }
  emit("vocab");
  await saveArtifact(v.id, "verify", merged);
  return merged;
}

// ---------- 5. Voz ----------
export function ownVoiceDir(v: Video) { return joinPath(v.dir, "voice", "own"); }

export async function stageVoice(ctx: Ctx): Promise<VoiceOut> {
  const v = ctx.video;
  const script = await need<ScriptOut>(v, "script", "Guion");
  const prev = await out<VoiceOut>(v, "voice");
  const override = await skillParams<VoiceOverride>(v.channel_id, "voz", {});
  const provider = v.voice_mode === "own" ? "own" : ttsProviderName(override);
  const dir = joinPath(v.dir, "voice");
  await fs.mkdir(dir);
  const segments: VoiceOut["segments"] = [];
  if (provider === "own") {
    const files = await fs.list(ownVoiceDir(v));
    const missing = script.segments.filter((s) => !files.some((f) => f.name.startsWith(`${s.id}.`)));
    if (missing.length) throw new NeedsUser(`Graba tu narración: faltan ${missing.length} de ${script.segments.length} segmentos.`);
    for (const s of script.segments) {
      const f = files.find((x) => x.name.startsWith(`${s.id}.`))!;
      const hash = await sha256(`own|${f.size}|${f.modified}`);
      const outPath = joinPath(dir, `${s.id}.wav`);
      const old = prev?.segments.find((x) => x.segment_id === s.id);
      if (old && old.hash === hash && (await fs.exists(outPath))) { segments.push(old); continue; }
      await ctx.progress(`Procesando tu grabación: ${s.title}`);
      const tmp = joinPath(dir, `${s.id}.raw.wav`);
      await ffmpeg(toWavArgs(f.path, tmp, { denoise: true }));
      await ffmpeg(trimSilenceArgs(tmp, outPath));
      await fs.remove(tmp);
      segments.push({ segment_id: s.id, path: outPath, duration: await probeDuration(outPath), hash });
    }
  } else {
    const st = getSettings().tts;
    const voiceKey = JSON.stringify({ provider, g: st.google, ge: st.gemini, e: st.elevenlabs, override });
    for (const [i, s] of script.segments.entries()) {
      checkCancel(ctx);
      const hash = await sha256(`${voiceKey}|${s.text_en}`);
      const outPath = joinPath(dir, `${s.id}.wav`);
      const old = prev?.segments.find((x) => x.segment_id === s.id);
      if (old && old.hash === hash && (await fs.exists(outPath))) { segments.push(old); continue; }
      await ctx.progress(`Narrando segmento ${i + 1}/${script.segments.length}: ${s.title}`);
      const parts: string[] = [];
      for (const [j, chunk] of chunkText(s.text_en).entries()) {
        const r = await synthesize({ text: chunk, outPath: joinPath(dir, "parts", `${s.id}_${j}`), videoId: v.id, channelId: v.channel_id, override });
        parts.push(r.path);
      }
      await ffmpeg(joinAudioArgs(parts, outPath, 0.12));
      segments.push({ segment_id: s.id, path: outPath, duration: await probeDuration(outPath), hash });
    }
  }
  return { provider, segments, total: segments.reduce((a, s) => a + s.duration, 0) };
}

// ---------- 6. Imágenes ----------
async function shotHash(s: PlannedShot, visualKey: string) {
  return sha256(JSON.stringify([s.kind, s.prompt_en, s.archival_query, s.source_id, s.card_text, s.overlay_text, visualKey]));
}

export async function stageVisuals(ctx: Ctx, opts: { replan?: boolean } = {}): Promise<VisualsOut> {
  const v = ctx.video;
  const script = await need<ScriptOut>(v, "script", "Guion");
  const research = await need<ResearchOut>(v, "research", "Investigación");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const prev = await out<VisualsOut>(v, "visuals");
  const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
  const visual = await skillParams(v.channel_id, "visual", VISUAL_DEFAULTS);
  const segs = L.segmentSentences(script);
  const segDur = Object.fromEntries(voice.segments.map((s) => [s.segment_id, s.duration]));
  const s = getSettings();
  const maxGenerated = s.images.provider === "none" ? 0 : s.images.maxGenerated[v.mode];
  const dir = joinPath(v.dir, "images");
  await fs.mkdir(dir);

  let shots: PlannedShot[];
  const scriptKey = await sha256(JSON.stringify(segs));
  if (prev?.shots?.length && !opts.replan && v.data.visualsScriptKey === scriptKey) {
    shots = prev.shots;
  } else {
    await ctx.progress("Planificando las tomas del video…");
    const words = script.segments.reduce((a, x) => a + wordCount(x.text_en), 0);
    const wps = words / Math.max(1, voice.total);
    const plan = await claudeRun<{ shots: Omit<PlannedShot, "id">[] }>({
      stage: "plan", label: "Plan visual", system: P.SYSTEM_BASE, schema: P.PLAN_SCHEMA,
      prompt: P.planPrompt({
        skills: [await composeSkills(v.channel_id, "visuals"), await composeSkills(v.channel_id, "montage")].filter(Boolean).join("\n\n"),
        visual, maxGenerated, shotSeconds: montage.shotSeconds, wps,
        segments: segs.map((x) => ({ ...x, on_screen_sources: script.segments.find((y) => y.id === x.id)?.on_screen_sources ?? [] })),
        sources: research.sources.map((x) => ({ id: x.id, title: x.title, publisher: x.publisher })),
      }),
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
    });
    shots = L.repairPlan(plan.data.shots, segs, maxGenerated);
    // conservar imágenes ya hechas si la toma es idéntica
    const visualKey0 = JSON.stringify(visual);
    for (const sh of shots) {
      const h = await shotHash(sh, visualKey0);
      const same = prev?.shots.find((p) => p.hash === h && p.image);
      if (same) { sh.image = same.image; sh.provenance = same.provenance; sh.overlay = same.overlay; sh.hash = h; }
    }
    await updateVideo(v.id, { data: { visualsScriptKey: scriptKey } });
  }

  const visualKey = JSON.stringify(visual);
  const usedCommons = new Set(shots.map((x) => x.provenance?.sourceUrl).filter(Boolean) as string[]);
  let usd = prev?.usd ?? 0;
  const persist = async () => {
    await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage='visuals'", [JSON.stringify({ shots, generated: 0, archival: 0, cards: 0, usd }), v.id]);
  };
  const nameSrc = (id?: string) => research.sources.find((x) => x.id === id);

  for (const [i, sh] of shots.entries()) {
    checkCancel(ctx);
    const h = await shotHash(sh, visualKey);
    if (sh.image && sh.hash === h && (await fs.exists(sh.image))) continue;
    await ctx.progress(`Imagen ${i + 1}/${shots.length} (${sh.kind})`);
    const base = joinPath(dir, sh.id);
    const seg = segs.find((x) => x.id === sh.segment_id)!;
    sh.error = null;
    try {
      if (sh.kind === "generated") {
        const prompt = [sh.prompt_en, visual.imageStyle].filter(Boolean).join("\n\nStyle: ");
        const r = await generateImage({ prompt, outBase: base, videoId: v.id, channelId: v.channel_id, label: `toma ${sh.id}` });
        sh.image = r.path; sh.provenance = r.provenance; usd += r.usd;
      } else if (sh.kind === "archival") {
        const hits = (await searchCommons(sh.archival_query ?? "")).filter((x) => !usedCommons.has(x.descriptionUrl));
        if (!hits.length) throw new UserError(`Sin resultados libres en Wikimedia para «${sh.archival_query}».`, "", "Wikimedia", false);
        const r = await downloadCommons(hits[0], base);
        usedCommons.add(hits[0].descriptionUrl);
        sh.image = r.path; sh.provenance = r.provenance;
      } else if (sh.kind === "source_card") {
        const src = nameSrc(sh.source_id);
        const fact = research.facts.find((f) => f.source_ids.includes(sh.source_id ?? ""));
        sh.image = await renderSourceCard({ publisher: src?.publisher ?? "", title: src?.title ?? sh.card_text ?? "", date: src?.date ?? "", quote: fact?.quote ?? seg.sentences[sh.sentence_from] ?? "", url: src?.url ?? "" }, visual, base + ".png");
        sh.provenance = { kind: "card", provider: "ATRIL", sourceUrl: src?.url };
      } else if (sh.kind === "title_card") {
        sh.image = await renderTitleCard({ kicker: `Chapter ${script.segments.findIndex((x) => x.id === sh.segment_id) + 1}`, title: sh.card_text || seg.title }, visual, base + ".png");
        sh.provenance = { kind: "card", provider: "ATRIL" };
      } else if (sh.kind === "quote_card") {
        sh.image = await renderQuoteCard({ quote: sh.card_text ?? "" }, visual, base + ".png");
        sh.provenance = { kind: "card", provider: "ATRIL" };
      } else {
        sh.image = await renderTextCard({ text: sh.card_text || L.shortPhrase(seg.sentences[sh.sentence_from]) }, visual, base + ".png");
        sh.provenance = { kind: "card", provider: "ATRIL" };
      }
    } catch (e) {
      // Respaldo: tarjeta de texto (costo 0) y aviso visible
      const msg = e instanceof UserError ? e.userMessage : String(e);
      sh.error = msg;
      await log("warn", "imágenes", `Toma ${sh.id}: ${msg} Se usó una tarjeta de texto.`, e instanceof UserError ? e.detail : "", v.id);
      sh.image = await renderTextCard({ text: sh.card_text || L.shortPhrase(seg.sentences[sh.sentence_from]) }, visual, base + "_fallback.png");
      sh.provenance = { kind: "card", provider: "ATRIL (respaldo)" };
    }
    sh.overlay = sh.overlay_text?.trim() && montage.lowerThirds ? await renderLowerThird({ text: sh.overlay_text }, visual, base + "_ov.png") : null;
    sh.hash = h;
    await persist();
  }
  shots = L.allocateDurations(shots, segs, segDur, montage.pauseBetweenSegments);
  const count = (k: (x: PlannedShot) => boolean) => shots.filter(k).length;
  return { shots, usd, generated: count((x) => x.provenance?.kind === "generated"), archival: count((x) => x.provenance?.kind === "archival"), cards: count((x) => x.provenance?.kind === "card") };
}

/** Re-genera una sola toma (desde la revisión final). */
export async function redoShot(v: Video, shotId: string, patch: Partial<PlannedShot>) {
  const vis = await need<VisualsOut>(v, "visuals", "Imágenes");
  const sh = vis.shots.find((x) => x.id === shotId);
  if (!sh) return;
  Object.assign(sh, patch, { hash: undefined, image: undefined });
  await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage='visuals'", [JSON.stringify(vis), v.id]);
}

// ---------- 7. Miniatura y metadatos ----------
export async function stagePackage(ctx: Ctx, opts: { regenerate?: boolean } = {}): Promise<PackageOut> {
  const v = ctx.video;
  const script = await need<ScriptOut>(v, "script", "Guion");
  const research = await need<ResearchOut>(v, "research", "Investigación");
  const verify = await need<VerifyOut>(v, "verify", "Verificación");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const visuals = await need<VisualsOut>(v, "visuals", "Imágenes");
  const prev = await out<PackageOut>(v, "package");
  const visual = await skillParams(v.channel_id, "visual", VISUAL_DEFAULTS);
  const thumbP = await skillParams(v.channel_id, "miniatura", THUMBNAIL_DEFAULTS);
  const s = getSettings();
  let pkg: PackageOut;
  if (prev && !opts.regenerate) {
    pkg = { ...prev };
  } else {
    await ctx.progress("Creando títulos, descripción y miniaturas…");
    const r = await claudeRun<Omit<PackageOut, "chosen_title" | "description" | "chosen_thumbnail" | "chapters" | "srt">>({
      stage: "package", label: "Miniatura y metadatos", system: P.SYSTEM_BASE, schema: P.PACKAGE_SCHEMA,
      prompt: P.packagePrompt({ skills: [await composeSkills(v.channel_id, "thumbnail"), await composeSkills(v.channel_id, "metadata")].filter(Boolean).join("\n\n"),
        script: { titles: script.title_options, segments: script.segments.map((x) => ({ title: x.title, text: x.text_en })) },
        verify: { overall: verify.overall_es, titles: verify.title_checks }, params: thumbP, count: s.images.thumbnailCandidates, photorealistic: visual.photorealistic }),
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
    });
    const d = r.data;
    pkg = { ...d, chosen_title: d.titles[0]?.title ?? v.title, chosen_thumbnail: 0, description: "", chapters: [], srt: "",
      synthetic_media: d.synthetic_media || (visual.photorealistic && visuals.generated > 0) };
    // Fondos de miniatura
    const tdir = joinPath(v.dir, "thumbs");
    for (const [i, t] of pkg.thumbnails.entries()) {
      checkCancel(ctx);
      await ctx.progress(`Miniatura ${i + 1}/${pkg.thumbnails.length}`);
      let bg: string | null = null;
      if (s.images.provider !== "none" && t.image_prompt_en) {
        try { bg = (await generateImage({ prompt: t.image_prompt_en, outBase: joinPath(tdir, `bg${i}`), videoId: v.id, channelId: v.channel_id, label: "fondo de miniatura" })).path; }
        catch (e) { await log("warn", "miniatura", `Fondo ${i + 1}: ${e instanceof UserError ? e.userMessage : String(e)} Se usa una imagen del video.`, "", v.id); }
      }
      if (!bg) bg = visuals.shots.find((x) => x.provenance?.kind === "generated" || x.provenance?.kind === "archival")?.image ?? null;
      t.image = bg ?? undefined;
    }
  }
  // Composición de miniaturas (rápida, sin costo): siempre con los parámetros actuales
  for (const [i, t] of pkg.thumbnails.entries()) {
    t.path = await renderThumbnail({ background: t.image, text: t.text, highlight: t.highlight, layout: t.layout }, thumbP, visual, joinPath(v.dir, "thumbs", `thumb${i}.jpg`));
  }
  // Capítulos, subtítulos y descripción (dependen de las duraciones actuales)
  const segs = L.segmentSentences(script);
  const segClip: Record<string, number> = {};
  for (const sg of script.segments) segClip[sg.id] = segmentDuration(visuals.shots.filter((x) => x.segment_id === sg.id).map((x) => ({ image: "", dur: x.dur ?? 0, motion: x.motion })));
  const narr = Object.fromEntries(voice.segments.map((x) => [x.segment_id, x.duration]));
  pkg.chapters = L.chapters(script.segments, segClip);
  pkg.srt = L.buildSrt(segs, narr, segClip);
  const credits: string[] = [];
  const seen = new Set<string>();
  for (const sh of visuals.shots) {
    const p = sh.provenance;
    if (p?.kind === "archival" && p.sourceUrl && !seen.has(p.sourceUrl)) { seen.add(p.sourceUrl); credits.push(`Image: "${p.title}" by ${p.attribution} — ${p.license} — ${p.sourceUrl}`); }
  }
  const music = (await listMusic()).find((m) => m.id === v.data.music_id);
  if (music?.attribution) credits.push(`Music: ${music.attribution}`);
  pkg.description = L.composeDescription({ body: pkg.description_body_en, chapters: pkg.chapters, sources: L.usedSources(script, research), credits, disclosure: s.publishing.aiDisclosure });
  pkg.tags = L.sanitizeTags(pkg.tags);
  await fs.writeText(joinPath(v.dir, "captions.en.srt"), pkg.srt);
  return pkg;
}

// ---------- 8. Montaje ----------
export async function stageRender(ctx: Ctx): Promise<RenderOut> {
  const v = ctx.video;
  const script = await need<ScriptOut>(v, "script", "Guion");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const visuals = await need<VisualsOut>(v, "visuals", "Imágenes");
  const prev = await out<RenderOut>(v, "render");
  const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
  const encoder = await pickEncoder();
  const dir = joinPath(v.dir, "render");
  await fs.mkdir(dir);
  const free = await fs.diskFree(v.dir).catch(() => Number.MAX_SAFE_INTEGER);
  if (free < 4 * 1024 ** 3) throw new UserError("Queda poco espacio en disco (menos de 4 GB).", "Libera espacio y reintenta.", "montaje", false);

  const clips: string[] = []; const hashes: Record<string, string> = {}; const narration: { path: string; duration: number }[] = [];
  const total = visuals.shots.reduce((a, x) => a + (x.dur ?? 0), 0);
  let doneSeconds = 0;
  for (const [i, sg] of script.segments.entries()) {
    checkCancel(ctx);
    const shots: ShotSpec[] = visuals.shots.filter((x) => x.segment_id === sg.id).map((x) => ({ image: x.image!, dur: x.dur ?? 1, motion: x.motion, overlay: x.overlay ?? null }));
    if (!shots.length || shots.some((x) => !x.image)) throw new UserError(`Faltan imágenes en el segmento «${sg.title}».`, "Vuelve a ejecutar la etapa Imágenes.", "montaje");
    const segDur = segmentDuration(shots);
    const clip = joinPath(dir, `${sg.id}.mp4`);
    const fadeIn = montage.segmentTransition === "fadeblack" || i === 0;
    const fadeOut = montage.segmentTransition === "fadeblack" || i === script.segments.length - 1;
    const h = await sha256(JSON.stringify({ shots, segDur, fadeIn, fadeOut, montage, encoder: encoder.name, q: encoder.quality }));
    hashes[sg.id] = h;
    if (prev?.segmentHashes?.[sg.id] === h && (await fs.exists(clip))) {
      doneSeconds += segDur;
    } else {
      const base = doneSeconds;
      await ffmpeg(segmentClipArgs({ shots, out: clip, fadeIn, fadeOut, params: montage, encoder }), {
        jobId: ctx.jobId,
        onSeconds: (sec) => { void ctx.progress(`Montando segmento ${i + 1}/${script.segments.length} · ${Math.min(100, Math.round(((base + sec) / total) * 100))} %`); },
      });
      doneSeconds += segDur;
    }
    clips.push(clip);
    const vs = voice.segments.find((x) => x.segment_id === sg.id);
    if (!vs) throw new UserError(`Falta la narración del segmento «${sg.title}».`, "", "montaje");
    narration.push({ path: vs.path, duration: segDur });
  }
  await ctx.progress("Mezclando narración y música…");
  const listPath = joinPath(dir, "list.txt");
  await fs.writeText(listPath, concatList(clips));
  const tracks = (await listMusic()).filter((m) => m.enabled);
  let music = tracks.find((m) => m.id === v.data.music_id) ?? null;
  if (!music && tracks.length && v.data.music_id !== "none") {
    music = tracks[Math.floor(Math.random() * tracks.length)];
    await updateVideo(v.id, { data: { music_id: music.id } });
  }
  const file = joinPath(v.dir, "final.mp4");
  await ffmpeg(finalMixArgs({ concatListPath: listPath, narration, out: file,
    music: music ? { path: music.path, volumeDb: montage.musicVolumeDb, duck: montage.musicDuck } : null }), { jobId: ctx.jobId });
  return { file, duration: await probeDuration(file), encoder: encoder.name, segmentHashes: hashes, renderedAt: now(), sizeBytes: await fs.size(file) };
}

// ---------- 9. Publicación ----------
export async function stagePublish(ctx: Ctx): Promise<PublishOut> {
  const v = ctx.video;
  const pkg = await need<PackageOut>(v, "package", "Metadatos");
  const render = await need<RenderOut>(v, "render", "Montaje");
  if (v.status !== "approved" && v.status !== "scheduled") throw new NeedsUser("El video necesita tu aprobación en la revisión final.");
  const s = getSettings().publishing;
  const publishAt = v.scheduled_at && v.scheduled_at > Date.now() + 15 * 60 * 1000 ? new Date(v.scheduled_at).toISOString() : null;
  await ctx.progress("Subiendo a YouTube…");
  const res = await uploadVideo(ctx.jobId, render.file, {
    title: pkg.chosen_title, description: pkg.description, tags: pkg.tags, categoryId: s.categoryId,
    defaultLanguage: s.defaultLanguage, privacy: publishAt ? "private" : "public", publishAt, containsSyntheticMedia: pkg.synthetic_media,
  }, v.upload_session);
  const ytId = res.id as string;
  await updateVideo(v.id, { youtube_id: ytId, upload_session: null });
  let thumbnail_ok = true; let note = "";
  const thumb = pkg.thumbnails[pkg.chosen_thumbnail]?.path;
  if (thumb) {
    try { await setThumbnail(ytId, thumb); }
    catch (e) { thumbnail_ok = false; note = e instanceof UserError ? e.userMessage : String(e); await log("warn", "YouTube", note, e instanceof UserError ? e.detail : "", v.id); }
  }
  const privacy = res.status?.privacyStatus ?? (publishAt ? "private" : "public");
  if (!publishAt && privacy === "private") {
    note = (note ? note + " " : "") + "YouTube dejó el video en privado: si tu proyecto de API no está auditado, todas las subidas quedan privadas. Cámbialo a público en YouTube Studio mientras se aprueba la auditoría.";
    await log("warn", "YouTube", "El video quedó en privado (proyecto de API sin auditar).", note, v.id);
  }
  await updateVideo(v.id, { status: publishAt ? "scheduled" : "published", published_at: publishAt ? null : now() });
  return { youtube_id: ytId, url: `https://youtu.be/${ytId}`, privacy, publish_at: publishAt, thumbnail_ok, note_es: note };
}

/** Exporta un paquete para subida manual (video, miniatura, textos, subtítulos). */
export async function exportPackage(v: Video, targetDir: string): Promise<string> {
  const pkg = await need<PackageOut>(v, "package", "Metadatos");
  const render = await need<RenderOut>(v, "render", "Montaje");
  const dir = joinPath(targetDir, `ATRIL-${(v.title || "video").replace(/[\\/:*?"<>|]+/g, "").slice(0, 60)}`);
  await fs.mkdir(dir);
  await fs.copy(render.file, joinPath(dir, "video.mp4"));
  const thumb = pkg.thumbnails[pkg.chosen_thumbnail]?.path;
  if (thumb) await fs.copy(thumb, joinPath(dir, `miniatura.${extName(thumb) || "jpg"}`));
  await fs.writeText(joinPath(dir, "subtitulos.en.srt"), pkg.srt);
  await fs.writeText(joinPath(dir, "metadatos.txt"),
    `TÍTULO\n${pkg.chosen_title}\n\nDESCRIPCIÓN\n${pkg.description}\n\nETIQUETAS\n${pkg.tags.join(", ")}\n\nCONTENIDO ALTERADO O SINTÉTICO: ${pkg.synthetic_media ? "SÍ (marcar en YouTube Studio → Detalles → Uso de IA)" : "no requerido"}\n`);
  return dir;
}

