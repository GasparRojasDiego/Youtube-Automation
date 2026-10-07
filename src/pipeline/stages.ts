// Implementación de cada etapa. Todas son reanudables: lo ya generado (y
// pagado) se reutiliza comparando huellas (hash) de sus entradas.
import { fs } from "../lib/ipc";
import { getSettings } from "../lib/settings";
import { composeSkills, skillParams, MONTAGE_DEFAULTS, VISUAL_DEFAULTS, THUMBNAIL_DEFAULTS, SCRIPT_DEFAULTS } from "../lib/skills";
import { getStage, saveArtifact, updateVideo, listMusic, type Video, type StageId } from "../lib/repo";
import { UserError, log } from "../lib/events";
import { joinPath, sha256, now, extName, splitSentences } from "../lib/util";
import { claudeRun } from "../providers/claude";
import { synthesize, chunkText, ttsProviderName, type VoiceOverride } from "../providers/tts";
import { generateImage } from "../providers/images";
import { ffmpeg, probeDuration } from "../providers/ffmpeg";
import { uploadVideo, setThumbnail } from "../providers/youtube";
import { onUploadProgress, onUploadSession } from "../lib/ipc";
import * as P from "./prompts";
import * as L from "./logic";
import { joinAudioArgs, toWavArgs, trimSilenceArgs } from "./montage";
import { renderThumbnail } from "./cards";
import { parseSilences, alignSentences } from "./align";
import { segInfos, segmentOffsets, segmentLength } from "./timeline";
import { getAssets } from "../media/library";
import { activity } from "../lib/activity";
import type { ResearchOut, ScriptOut, VerifyOut, VoiceOut, VoiceSegmentV2, PackageOut, RenderOut, PublishOut, PolishOut, MotionOut } from "./types";

export interface Ctx {
  video: Video;
  jobId: string;
  progress: (text: string) => Promise<void>;
  cancelled: () => boolean;
}

/** Señal: la etapa necesita una acción del usuario (no es un error). */
export class NeedsUser extends Error { constructor(public messageEs: string) { super(messageEs); } }

export const out = async <T>(v: Video, s: StageId) => (await getStage(v.id, s))?.output as T | null;
export const need = async <T>(v: Video, s: StageId, label: string) => {
  const o = await out<T>(v, s);
  if (!o) throw new UserError(`Falta el resultado de «${label}».`, "Vuelve a ejecutar esa etapa.", "pipeline", false);
  return o;
};
export const checkCancel = (ctx: Ctx) => { if (ctx.cancelled()) throw new UserError("Proceso cancelado.", "", "pipeline", true); };

async function wordsTarget(v: Video): Promise<[number, number, number]> {
  const s = getSettings().production;
  const p = await skillParams(v.channel_id, "guion", SCRIPT_DEFAULTS);
  const [lo, hi] = s.targetMinutes[v.mode];
  return [Math.round(lo * p.wordsPerMinute), Math.round(hi * p.wordsPerMinute), p.wordsPerMinute];
}

// ---------- 2. Investigación ----------
export async function stageResearch(ctx: Ctx): Promise<ResearchOut> {
  const v = ctx.video; const topic = v.data.topic ?? { title: v.title };
  await ctx.progress("Investigando…");
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
  await ctx.progress("Verificando afirmaciones…");
  const r = await claudeRun<VerifyOut>({
    stage: "verify", label: "Verificación", system: P.SYSTEM_BASE, schema: P.VERIFY_SCHEMA, tools: ["WebFetch"],
    prompt: P.verifyPrompt({ skills: await composeSkills(v.channel_id, "verify"), research, script }),
    videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
  });
  const merged = L.mergeVerification(r.data, script, L.checkScript(script, research));
  merged.rounds = (prev?.rounds ?? 0) + 1;
  await saveArtifact(v.id, "verify", merged);
  return merged;
}

// ---------- 5. Voz ----------
/** Tiempos de cada oración (silencios detectados por ffmpeg). Se guarda en el segmento de voz. */
async function alignVoice(seg: VoiceSegmentV2, text: string, videoId: string) {
  const sentences = splitSentences(text);
  if (seg.sentences?.length === sentences.length) return;
  const stderr = await ffmpeg(["-hide_banner", "-nostats", "-i", seg.path, "-af", "silencedetect=noise=-38dB:d=0.16", "-f", "null", "-"]);
  seg.sentences = alignSentences(sentences, seg.duration, parseSilences(stderr, seg.duration));
  await activity(videoId, "voice", "audio", `Voz alineada (${sentences.length} frases)`, "");
}
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
    for (const seg of segments) await alignVoice(seg, script.segments.find((x) => x.id === seg.segment_id)!.text_en, v.id);
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
    for (const seg of segments) await alignVoice(seg, script.segments.find((x) => x.id === seg.segment_id)!.text_en, v.id);
  }
  return { provider, segments, total: segments.reduce((a, s) => a + s.duration, 0) };
}

// ---------- 9. Miniatura y metadatos ----------
export async function stagePackage(ctx: Ctx, opts: { regenerate?: boolean } = {}): Promise<PackageOut> {
  const v = ctx.video;
  const script = await need<ScriptOut>(v, "script", "Guion");
  const research = await need<ResearchOut>(v, "research", "Investigación");
  const verify = await need<VerifyOut>(v, "verify", "Verificación");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const polish = await need<PolishOut>(v, "polish", "Retoques");
  const motion = await out<MotionOut>(v, "motion");
  const prev = await out<PackageOut>(v, "package");
  const visual = await skillParams(v.channel_id, "visual", VISUAL_DEFAULTS);
  const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
  const thumbP = await skillParams(v.channel_id, "miniatura", THUMBNAIL_DEFAULTS);
  const s = getSettings();
  const assetIds = [...new Set(polish.shots.map((x) => x.asset_id).filter(Boolean) as string[])];
  const assetMap = await getAssets([...assetIds, ...polish.sfx.map((x) => x.asset_id ?? "").filter(Boolean), ...polish.music.map((x) => x.asset_id ?? "").filter(Boolean)]);
  // Mejores imágenes del video para fondos de miniatura (sin personas reales identificables)
  const bgOptions = assetIds.map((id) => assetMap.get(id)!).filter((a) => a && a.kind === "image" && !a.real_person && a.quality >= 3)
    .sort((a, b) => b.quality - a.quality).slice(0, 12);
  let pkg: PackageOut;
  if (prev && !opts.regenerate) {
    pkg = { ...prev };
  } else {
    await ctx.progress("Títulos, descripción y miniaturas…");
    const r = await claudeRun<Omit<PackageOut, "chosen_title" | "description" | "chosen_thumbnail" | "chapters" | "srt">>({
      stage: "package", label: "Miniatura y metadatos", system: P.SYSTEM_BASE, schema: P.PACKAGE_SCHEMA,
      prompt: P.packagePrompt({ skills: [await composeSkills(v.channel_id, "thumbnail"), await composeSkills(v.channel_id, "metadata")].filter(Boolean).join("\n\n"),
        script: { titles: script.title_options, segments: script.segments.map((x) => ({ title: x.title, text: x.text_en })) },
        verify: { overall: verify.overall_es, titles: verify.title_checks }, params: thumbP, count: s.images.thumbnailCandidates, photorealistic: visual.photorealistic,
        images: bgOptions.map((a) => ({ id: a.id, description: (a.tags.split(",")[0] || a.title).slice(0, 140) })) }),
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
    });
    const d = r.data;
    const generatedUsed = polish.shots.some((x) => x.provenance?.kind === "generated");
    pkg = { ...d, chosen_title: d.titles[0]?.title ?? v.title, chosen_thumbnail: 0, description: "", chapters: [], srt: "",
      synthetic_media: d.synthetic_media || (visual.photorealistic && generatedUsed) };
    const tdir = joinPath(v.dir, "thumbs");
    for (const [i, t] of pkg.thumbnails.entries()) {
      checkCancel(ctx);
      await ctx.progress(`Miniatura ${i + 1}/${pkg.thumbnails.length}`);
      let bg: string | null = t.background_asset_id ? assetMap.get(t.background_asset_id)?.path ?? null : null;
      if (!bg && s.media.allowGenerated && s.images.provider !== "none" && t.image_prompt_en) {
        try { bg = (await generateImage({ prompt: t.image_prompt_en, outBase: joinPath(tdir, `bg${i}`), videoId: v.id, channelId: v.channel_id, label: "fondo de miniatura" })).path; }
        catch (e) { await log("warn", "miniatura", `Fondo ${i + 1}: ${e instanceof UserError ? e.userMessage : String(e)} Se usa una imagen del video.`, "", v.id); }
      }
      t.image = bg ?? bgOptions[i % Math.max(1, bgOptions.length)]?.path ?? polish.shots.find((x) => x.media === "image" && x.path)?.path ?? undefined;
    }
  }
  // Composición de miniaturas (rápida, sin costo): siempre con los parámetros actuales
  for (const [i, t] of pkg.thumbnails.entries()) {
    t.path = await renderThumbnail({ background: t.image, text: t.text, highlight: t.highlight, layout: t.layout }, thumbP, visual, joinPath(v.dir, "thumbs", `thumb${i}.jpg`));
  }
  // El aviso solo menciona ilustraciones de IA si de verdad las hay
  const generatedUsedNow = polish.shots.some((x) => x.provenance?.kind === "generated");
  // Capítulos y subtítulos con los tiempos reales de la voz
  const segs = segInfos(script, voice);
  const offsets = segmentOffsets(segs, montage.pauseBetweenSegments);
  pkg.chapters = L.chapters(script.segments, Object.fromEntries(segs.map((x) => [x.id, segmentLength(x, montage.pauseBetweenSegments)])));
  pkg.srt = L.buildSrtAligned(segs, offsets);
  // Créditos: atribución obligatoria (CC BY / BY-SA) completa; el resto, resumido
  pkg.description = L.composeDescription({ body: pkg.description_body_en, chapters: pkg.chapters, sources: L.usedSources(script, research),
    credits: L.creditLines([...assetMap.values()].filter((a) => assetIds.includes(a.id) || polish.sfx.some((x) => x.asset_id === a.id) || polish.music.some((x) => x.asset_id === a.id)),
      polish.music.filter((b) => b.path && !b.asset_id).map((b) => b.title ?? ""), (await listMusic()).filter((m) => polish.music.some((b) => b.path === m.path)).map((m) => m.attribution).filter(Boolean)),
    disclosure: L.adaptDisclosure(s.publishing.aiDisclosure, { generatedImages: generatedUsedNow, aiVoice: voice.provider !== "own" }) });
  pkg.tags = L.sanitizeTags(pkg.tags);
  pkg.motion_count = motion?.items.filter((m) => m.file).length ?? 0;
  await fs.writeText(joinPath(v.dir, "captions.en.srt"), pkg.srt);
  return pkg;
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
  const offP = await onUploadProgress((p) => { if (p.id === ctx.jobId) void ctx.progress(`Subiendo a YouTube · ${Math.round((p.sent / p.total) * 100)} %`); });
  const offS = await onUploadSession((p) => { if (p.id === ctx.jobId) void updateVideo(v.id, { upload_session: p.session }); });
  let res: any;
  try {
    res = await uploadVideo(ctx.jobId, render.file, {
    title: pkg.chosen_title, description: pkg.description, tags: pkg.tags, categoryId: s.categoryId,
    defaultLanguage: s.defaultLanguage, privacy: publishAt ? "private" : "public", publishAt, containsSyntheticMedia: pkg.synthetic_media,
    }, v.upload_session);
  } catch (e) {
    // Si la sesión guardada ya no sirve, la próxima vez se inicia una nueva
    if (e instanceof UserError && /expir/.test(e.userMessage)) await updateVideo(v.id, { upload_session: null });
    throw e;
  } finally { offP(); offS(); }
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

