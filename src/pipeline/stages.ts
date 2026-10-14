// Implementación de cada etapa. Todas son reanudables: lo ya generado (y
// pagado) se reutiliza comparando huellas (hash) de sus entradas.
import { fs, db } from "../lib/ipc";
import { getSettings } from "../lib/settings";
import { skillParams, MONTAGE_DEFAULTS, THUMBNAIL_DEFAULTS, SCRIPT_DEFAULTS } from "../lib/skills";
import { getStage, saveArtifact, updateVideo, listMusic, type Video, type StageId } from "../lib/repo";
import { UserError, log } from "../lib/events";
import { joinPath, sha256, now, extName, splitSentences, mapLimit, limiter } from "../lib/util";
import { claudeRun } from "../providers/claude";
import { synthesize, chunkText, ttsProviderName, type VoiceOverride } from "../providers/tts";
import { generateImage, imageProvider } from "../providers/images";
import { ffmpeg, probeDuration } from "../providers/ffmpeg";
import { uploadVideo, setThumbnail } from "../providers/youtube";
import { onUploadProgress, onUploadSession } from "../lib/ipc";
import * as P from "./prompts";
import * as L from "./logic";
import { joinAudioArgs } from "./montage";
import { renderThumbnail } from "./cards";
import { parseSilences, alignSentences, alignWords } from "./align";
import { transcribeWords, disableTool } from "../media/toolkit";
import { segInfos, segmentOffsets, segmentLength } from "./timeline";
import { getAssets } from "../media/library";
import { activity } from "../lib/activity";
import { personalOf, systemFor, skillsFor, documentsOf, extractText, voiceFor, visualFor } from "./personal";
import { minutesRangeOf, isVertical, SHORTS_MAX_S, VERTICAL_SCRIPT_EN } from "./format";
import { coversOf, youtubeThumbFile } from "./covers";
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
/** Guarda lo avanzado de una etapa sin cambiar su estado: si algo falla, el reintento retoma desde aquí. */
export const checkpoint = (v: Video, s: StageId, partial: unknown) =>
  db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage=?", [JSON.stringify(partial), v.id, s]).then(() => undefined, () => undefined);
/** Marca de una parte terminada (archivo + huella de sus entradas), independiente de la base de datos. */
export async function readMark<T extends { hash: string }>(file: string, hash: string): Promise<T | null> {
  try { const m = JSON.parse(await fs.readText(file)) as T; return m?.hash === hash ? m : null; } catch { return null; }
}

async function wordsTarget(v: Video): Promise<[number, number, number]> {
  const s = getSettings().production;
  const p = await skillParams(v.channel_id, "guion", SCRIPT_DEFAULTS);
  const [lo, hi] = minutesRangeOf(v, s.targetMinutes);
  return [Math.round(lo * p.wordsPerMinute), Math.round(hi * p.wordsPerMinute), p.wordsPerMinute];
}

/** Duración objetivo para la investigación (minutos), solo si el video tiene una propia. */
function targetMid(v: Video): number | null {
  const [lo, hi] = minutesRangeOf(v, [0, 0]);
  return hi ? Math.round(((lo + hi) / 2) * 10) / 10 : null;
}

// ---------- 2. Investigación ----------
export async function stageResearch(ctx: Ctx): Promise<ResearchOut> {
  const v = ctx.video; const topic = v.data.topic ?? { title: v.title };
  const personal = personalOf(v);
  // Guion propio: no hay nada que investigar (el guion es la base)
  if (personal?.script) return { summary_es: "Guion propio del usuario: no se investiga.", angle_en: "", sources: [], facts: [], open_questions_es: [], risks: [] };
  const docs = personal ? await documentsOf(personal) : { text: "", pdfs: [] };
  const notes = [topic.notes ?? "", docs.text && `MATERIAL PROVIDED BY THE OPERATOR (trusted; base the video on it):\n${docs.text}`,
    docs.pdfs.length ? `Also read these PDF files provided by the operator with the Read tool: ${docs.pdfs.join(" · ")}` : ""].filter(Boolean).join("\n\n");
  await ctx.progress("Investigando…");
  const r = await claudeRun<ResearchOut>({
    stage: "research", label: "Investigación", system: systemFor(v), schema: P.RESEARCH_SCHEMA, tools: docs.pdfs.length ? ["WebSearch", "WebFetch", "Read"] : ["WebSearch", "WebFetch"],
    addDirs: docs.pdfs.length ? [joinPath(v.dir, "entregado")] : undefined,
    prompt: P.researchPrompt({ skills: await skillsFor(v, "research"), topic: topic.title, angle: topic.angle ?? "", notes, seedSources: topic.sources ?? [], minutes: targetMid(v) }),
    videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId, timeoutMin: Math.max(getSettings().claude.timeoutMin, 45),
  });
  const d = r.data;
  // Un video personal puede basarse solo en el material del usuario (sin fuentes web)
  if ((!d.sources?.length || !d.facts?.length) && !(personal && (docs.text || docs.pdfs.length))) throw new UserError("La investigación no encontró fuentes o hechos suficientes.", "Revisa el tema o añade fuentes sugeridas y reintenta.", "investigación");
  await saveArtifact(v.id, "research", d);
  return d;
}

// ---------- 3. Guion ----------
export async function stageScript(ctx: Ctx, revision?: { issues: unknown; notes: string }): Promise<ScriptOut> {
  const v = ctx.video;
  const research = await need<ResearchOut>(v, "research", "Investigación");
  const skills = [await skillsFor(v, "script"), isVertical(v) ? VERTICAL_SCRIPT_EN : ""].filter(Boolean).join("\n\n");
  const [minW, maxW] = await wordsTarget(v);
  const personal = personalOf(v);
  const system = systemFor(v);
  let script: ScriptOut;
  if (!revision && personal?.script) {
    // Guion del usuario: se estructura en segmentos sin reescribirlo
    await ctx.progress("Estructurando tu guion…");
    const text = await extractText(personal.script.path);
    script = (await claudeRun<ScriptOut>({ stage: "script", label: "Estructurar tu guion", system, schema: P.SCRIPT_SCHEMA,
      tools: text ? undefined : ["Read"], addDirs: text ? undefined : [personal.script.path.replace(/[\\/][^\\/]+$/, "")],
      prompt: P.structureScriptPrompt({ skills, text, path: text ? null : personal.script.path, maxWords: maxW }),
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId })).data;
    script.version = 1;
  } else if (revision) {
    const current = await need<ScriptOut>(v, "script", "Guion");
    await ctx.progress("Corrigiendo el guion…");
    script = (await claudeRun<ScriptOut>({ stage: "script", label: "Corrección del guion", system, schema: P.SCRIPT_SCHEMA,
      prompt: P.revisePrompt({ skills, research, script: current, issues: revision.issues, notes: revision.notes, minWords: minW, maxWords: maxW }),
      videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId })).data;
    script.version = (current.version ?? 1) + 1;
  } else {
    // Cada pasada terminada se guarda: si la siguiente falla, el reintento no repite las anteriores
    // (al terminar bien se borra, así «Rehacer» escribe un guion nuevo)
    const topic = v.data.topic?.title ?? v.title;
    const passKey = await sha256(JSON.stringify([topic, research, skills, minW, maxW]));
    const done = (await readMark<{ hash: string; scripts: ScriptOut[] }>(passFile(v), passKey))?.scripts ?? [];
    const keep = (sc: ScriptOut) => { done.push(sc); return fs.writeText(passFile(v), JSON.stringify({ hash: passKey, scripts: done })).catch(() => undefined); };
    if (!done.length) {
      await ctx.progress("Escribiendo el guion…");
      const first = (await claudeRun<ScriptOut>({ stage: "script", label: "Guion", system, schema: P.SCRIPT_SCHEMA,
        prompt: P.scriptPrompt({ skills, topic, research, minWords: minW, maxWords: maxW }),
        videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId })).data;
      first.version = 1;
      await keep(first);
    } else await activity(v.id, "script", "decision", `Se retoma el guion: ${done.length} pasada(s) ya hechas`);
    script = done[done.length - 1];
    const passes = personal ? 1 : getSettings().production.scriptPasses;
    for (let i = done.length; i < passes; i++) {
      checkCancel(ctx);
      await ctx.progress(`Pasada de mejora ${i + 1}/${passes}…`);
      const mech = L.checkScript(script, research);
      script = (await claudeRun<ScriptOut>({ stage: "script", label: "Pasada de mejora del guion", system, schema: P.SCRIPT_SCHEMA,
        prompt: P.revisePrompt({ skills, research, script, issues: mech, minWords: minW, maxWords: maxW,
          notes: "Second pass: sharpen the hook, tighten rhythm, deepen the original analysis, remove filler. Keep every claim sourced." }),
        videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId })).data;
      script.version = i + 1;
      await keep(script);
    }
  }
  if (!script.segments?.length) throw new UserError("El guion llegó vacío.", "", "guion");
  const words = L.scriptWords(script);
  if (words < minW * 0.7 && !personal?.script) await log("warn", "guion", `El guion quedó corto (${words} palabras; objetivo ${minW}–${maxW}).`, "", v.id);
  await saveArtifact(v.id, "script", script, revision ? "corrección" : "inicial");
  // El título fijo de la tarjeta (o del video personal) manda; si no hay, el mejor que propuso el guion
  const fixed = (personal?.title || (v.data?.fixedTitle as string | undefined) || "").trim();
  const best = fixed || script.title_options?.[0]?.title;
  if (best && best !== v.title) await updateVideo(v.id, { title: best });
  if (script.skills_check_es?.length) await activity(v.id, "script", "decision", `Habilidades aplicadas al guion (${script.skills_check_es.length})`, script.skills_check_es.join("\n"));
  if (!revision) await fs.remove(passFile(v)).catch(() => undefined);
  return script;
}
const passFile = (v: Video) => joinPath(v.dir, "guion.pasadas.json");

// ---------- 4. Verificación ----------
export async function stageVerify(ctx: Ctx): Promise<VerifyOut> {
  const v = ctx.video;
  const research = await need<ResearchOut>(v, "research", "Investigación");
  const script = await need<ScriptOut>(v, "script", "Guion");
  const prev = await out<VerifyOut>(v, "verify");
  await ctx.progress("Verificando afirmaciones…");
  const r = await claudeRun<VerifyOut>({
    stage: "verify", label: "Verificación", system: systemFor(v), schema: P.VERIFY_SCHEMA, tools: ["WebFetch"],
    prompt: P.verifyPrompt({ skills: await skillsFor(v, "verify"), research, script }),
    videoId: v.id, channelId: v.channel_id, jobId: ctx.jobId,
  });
  const merged = L.mergeVerification(r.data, script, L.checkScript(script, research));
  merged.rounds = (prev?.rounds ?? 0) + 1;
  await saveArtifact(v.id, "verify", merged);
  return merged;
}

// ---------- 5. Voz ----------
/**
 * Tiempos de cada oración (silencios detectados por ffmpeg) y, si whisper.cpp está instalado, de cada
 * palabra (lo que de verdad se oye): subtítulos resaltados y cortes al ritmo exacto de la voz.
 */
async function alignVoice(seg: VoiceSegmentV2, text: string, videoId: string, o: { language: string; workDir: string; jobId: string }) {
  const sentences = splitSentences(text);
  if (seg.sentences?.length === sentences.length) return;
  const stderr = await ffmpeg(["-hide_banner", "-nostats", "-i", seg.path, "-af", "silencedetect=noise=-38dB:d=0.16", "-f", "null", "-"]);
  const silences = parseSilences(stderr, seg.duration);
  let aligned: ReturnType<typeof alignWords> = null;
  try {
    const asr = await transcribeWords(seg.path, { language: o.language, prompt: text, workDir: o.workDir, jobId: o.jobId });
    if (asr) aligned = alignWords(sentences, asr, seg.duration, silences);
  } catch (e) {
    disableTool("whisper");
    await activity(videoId, "voice", "warn", "whisper.cpp no funcionó; los subtítulos se sincronizan por estimación", e instanceof Error ? e.message.slice(0, 600) : String(e));
  }
  if (aligned) {
    seg.sentences = aligned.spans; seg.words = aligned.words; seg.aligner = "whisper";
    const total = aligned.words.reduce((a, w) => a + w.length, 0);
    await activity(videoId, "voice", "audio", `Voz alineada palabra por palabra con whisper.cpp (${sentences.length} frases, ${aligned.matched}/${total} palabras reconocidas)`, "");
  } else {
    seg.sentences = alignSentences(sentences, seg.duration, silences); seg.aligner = "silences";
    await activity(videoId, "voice", "audio", `Voz alineada (${sentences.length} frases)`, "");
  }
}
export async function stageVoice(ctx: Ctx): Promise<VoiceOut> {
  const v = ctx.video;
  const script = await need<ScriptOut>(v, "script", "Guion");
  const prev = await out<VoiceOut>(v, "voice");
  const base = await skillParams<VoiceOverride>(v.channel_id, "voz", {});
  const provider = ttsProviderName(base);
  // Video personal en español: la misma voz de Google en su versión latinoamericana (Gemini y ElevenLabs ya son multilingües)
  const override = provider === "google" ? { ...base, ...voiceFor(personalOf(v), base.voice || getSettings().tts.google.voice) } : base;
  const dir = joinPath(v.dir, "voice");
  await fs.mkdir(dir);
  const segments: VoiceOut["segments"] = [];
    const st = getSettings().tts;
    const voiceKey = JSON.stringify({ provider, g: st.google, ge: st.gemini, e: st.elevenlabs, override });
    // Varios segmentos a la vez (cada uno espera a la red); el orden se conserva
    let narrated = 0;
    // Cada segmento (y cada trozo de texto) terminado deja una marca: si la voz falla a mitad, el
    // reintento solo narra lo que faltó (la voz se paga por carácter).
    // La alineación (whisper.cpp usa la CPU) avanza de a una mientras se narran los demás (red).
    const lang = (personalOf(v)?.language ?? getSettings().publishing.defaultLanguage ?? "en").slice(0, 2);
    const alignSlot = limiter(1);
    const aligning: Promise<void>[] = [];
    const align = (seg: VoiceSegmentV2, text: string) => { aligning.push(alignSlot(() => alignVoice(seg, text, v.id, { language: lang, workDir: joinPath(dir, "whisper"), jobId: ctx.jobId }))); return seg; };
    segments.push(...await mapLimit(script.segments, 3, async (s) => {
      checkCancel(ctx);
      const hash = await sha256(`${voiceKey}|${s.text_en}`);
      const outPath = joinPath(dir, `${s.id}.wav`);
      const old = prev?.segments.find((x) => x.segment_id === s.id);
      if (old && old.hash === hash && (await fs.exists(outPath))) return old;
      const mark = await readMark<{ hash: string; duration: number }>(joinPath(dir, `${s.id}.json`), hash);
      if (mark && (await fs.exists(outPath))) return align({ segment_id: s.id, path: outPath, duration: mark.duration, hash }, s.text_en);
      const parts: string[] = [];
      for (const [j, chunk] of chunkText(s.text_en).entries()) {
        const base = joinPath(dir, "parts", `${s.id}_${j}`);
        const partHash = await sha256(`${voiceKey}|${chunk}`);
        const done = await readMark<{ hash: string; path: string }>(`${base}.json`, partHash);
        if (done && (await fs.exists(done.path))) { parts.push(done.path); continue; }
        const r = await synthesize({ text: chunk, outPath: base, videoId: v.id, channelId: v.channel_id, override });
        await fs.writeText(`${base}.json`, JSON.stringify({ hash: partHash, path: r.path }));
        parts.push(r.path);
      }
      await ffmpeg(joinAudioArgs(parts, outPath, 0.12));
      const duration = await probeDuration(outPath);
      await fs.writeText(joinPath(dir, `${s.id}.json`), JSON.stringify({ hash, duration }));
      await ctx.progress(`Narración: ${++narrated} segmento(s) listos`);
      return align({ segment_id: s.id, path: outPath, duration, hash }, s.text_en);
    }));
    await Promise.all(aligning);
    for (const seg of segments) await alignVoice(seg, script.segments.find((x) => x.id === seg.segment_id)!.text_en, v.id, { language: lang, workDir: joinPath(dir, "whisper"), jobId: ctx.jobId });
  return { provider, segments, total: segments.reduce((a, s) => a + s.duration, 0) };
}

// ---------- 9. Miniatura y metadatos ----------
export async function stagePackage(ctx: Ctx, opts: { regenerate?: boolean } = {}): Promise<PackageOut> {
  const v = ctx.video;
  const script = await need<ScriptOut>(v, "script", "Guion");
  const verify = await need<VerifyOut>(v, "verify", "Verificación");
  const voice = await need<VoiceOut>(v, "voice", "Voz");
  const polish = await need<PolishOut>(v, "polish", "Retoques");
  const motion = await out<MotionOut>(v, "motion");
  const prev = await out<PackageOut>(v, "package");
  const visual = await visualFor(v);
  const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
  const thumbP = await skillParams(v.channel_id, "miniatura", THUMBNAIL_DEFAULTS);
  // Portadas subidas por el usuario: la de YouTube es la miniatura (tal cual, sin recomponer ni crear fondos con IA)
  const covers = coversOf(v, prev);
  const ownCover = covers.youtube && (await fs.exists(covers.youtube)) ? covers.youtube : null;
  const fixedTitle = (personalOf(v)?.title || (v.data?.fixedTitle as string | undefined) || "").trim();
  const s = getSettings();
  const assetIds = [...new Set(polish.shots.map((x) => x.asset_id).filter(Boolean) as string[])];
  const iconIds = [...new Set((motion?.items ?? []).filter((m) => m.file).flatMap((m) => m.icon_ids ?? []))];
  // Efectos de sonido usados: los de retoques y los que declaran las animaciones (Freesound CC BY exige crédito)
  const sfxIds = [...new Set([...polish.sfx, ...(motion?.items ?? []).filter((m) => m.file).flatMap((m) => m.sfx ?? [])].map((x) => x.asset_id ?? "").filter(Boolean))];
  const assetMap = await getAssets([...assetIds, ...iconIds, ...sfxIds, ...polish.music.map((x) => x.asset_id ?? "").filter(Boolean)]);
  // Mejores imágenes del video para fondos de miniatura (sin personas reales identificables)
  const bgOptions = assetIds.map((id) => assetMap.get(id)!).filter((a) => a && a.kind === "image" && !a.real_person && a.quality >= 3)
    .sort((a, b) => b.quality - a.quality).slice(0, 12);
  let pkg: PackageOut;
  // Borrador de lo pagado (Claude y fondos con IA): si falla lo que sigue, el reintento no lo repite
  const draftFile = joinPath(v.dir, "metadatos.borrador.json");
  const draftKey = await sha256(JSON.stringify([script.title_options, script.segments.map((x) => x.text_en), verify.overall_es, thumbP, s.images.thumbnailCandidates, visual.photorealistic, bgOptions.map((a) => a.id)]));
  const draft = !prev && !opts.regenerate ? await readMark<{ hash: string; pkg: PackageOut }>(draftFile, draftKey) : null;
  if (prev && !opts.regenerate) {
    pkg = { ...prev };
  } else if (draft) {
    pkg = { ...draft.pkg };
  } else {
    await ctx.progress("Títulos, descripción y miniaturas…");
    const r = await claudeRun<Omit<PackageOut, "chosen_title" | "description" | "chosen_thumbnail" | "chapters" | "srt">>({
      stage: "package", label: "Miniatura y metadatos", system: systemFor(v), schema: P.PACKAGE_SCHEMA,
      prompt: P.packagePrompt({ skills: await skillsFor(v, ["thumbnail", "metadata"]),
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
      if (!bg && !ownCover && s.media.allowGenerated && (await imageProvider()) && t.image_prompt_en) {
        try { bg = (await generateImage({ prompt: t.image_prompt_en, outBase: joinPath(tdir, `bg${i}`), videoId: v.id, channelId: v.channel_id, label: "fondo de miniatura" })).path; }
        catch (e) { await log("warn", "miniatura", `Fondo ${i + 1}: ${e instanceof UserError ? e.userMessage : String(e)} Se usa una imagen del video.`, "", v.id); }
      }
      t.image = bg ?? bgOptions[i % Math.max(1, bgOptions.length)]?.path ?? polish.shots.find((x) => x.media === "image" && x.path)?.path ?? undefined;
    }
    await fs.writeText(draftFile, JSON.stringify({ hash: draftKey, pkg })).catch(() => undefined);
  }
  // Título que eligió el usuario en la tarjeta: se usa tal cual (las propuestas quedan como alternativas)
  if (fixedTitle && (!prev || opts.regenerate)) { pkg.titles = [{ title: fixedTitle.slice(0, 100), note_es: "Tu título" }, ...pkg.titles.filter((t) => t.title !== fixedTitle)]; pkg.chosen_title = fixedTitle.slice(0, 100); }
  pkg.thumbnails = pkg.thumbnails.filter((t) => !t.own || t.path === ownCover);
  if (ownCover && !pkg.thumbnails.some((t) => t.own)) {
    pkg.thumbnails = [{ concept_es: "Tu portada", text: "", highlight: "", image_prompt_en: "", layout: "center", image: ownCover, path: ownCover, own: true }, ...pkg.thumbnails];
    pkg.chosen_thumbnail = 0;
  } else if (!ownCover && pkg.chosen_thumbnail >= pkg.thumbnails.length) pkg.chosen_thumbnail = 0;
  if (covers.tiktok) pkg.tiktok_cover = covers.tiktok;
  // Composición de miniaturas (rápida, sin costo): siempre con los parámetros actuales (la portada propia no se toca)
  for (const [i, t] of pkg.thumbnails.entries()) {
    if (t.own) continue;
    t.path = await renderThumbnail({ background: t.image, text: t.text, highlight: t.highlight, layout: t.layout }, thumbP, visual, joinPath(v.dir, "thumbs", `thumb${i}.jpg`));
  }
  // El aviso solo menciona ilustraciones de IA si de verdad las hay
  const generatedUsedNow = polish.shots.some((x) => x.provenance?.kind === "generated");
  // Capítulos y subtítulos con los tiempos reales de la voz
  const segs = segInfos(script, voice);
  const offsets = segmentOffsets(segs, montage.pauseBetweenSegments);
  pkg.chapters = L.chapters(script.segments, Object.fromEntries(segs.map((x) => [x.id, segmentLength(x, montage.pauseBetweenSegments)])));
  pkg.srt = L.buildSrtAligned(segs, offsets);
  // Descripción sin lista de fuentes; los créditos que la licencia exige (CC BY / BY-SA) van aparte y se añaden al subir
  pkg.credits = L.creditLines([...assetMap.values()].filter((a) => assetIds.includes(a.id) || iconIds.includes(a.id) || sfxIds.includes(a.id) || polish.music.some((x) => x.asset_id === a.id)),
    polish.music.filter((b) => b.path && !b.asset_id).map((b) => b.title ?? ""), (await listMusic()).filter((m) => polish.music.some((b) => b.path === m.path)).map((m) => m.attribution).filter(Boolean));
  pkg.description = L.composeDescription({ body: pkg.description_body_en, chapters: pkg.chapters,
    disclosure: L.adaptDisclosure(s.publishing.aiDisclosure, { generatedImages: generatedUsedNow, aiVoice: true }) });
  pkg.tags = L.sanitizeTags(pkg.tags);
  pkg.motion_count = motion?.items.filter((m) => m.file).length ?? 0;
  await fs.writeText(joinPath(v.dir, "captions.en.srt"), pkg.srt);
  return pkg;
}

// ---------- 9. Publicación ----------
/** Un video vertical de hasta 3 min es un Short: se añade #Shorts a la descripción si no está. */
function shortsTag(v: Video, render: RenderOut, description: string): string {
  return isVertical(v) && render.duration <= SHORTS_MAX_S && !/#shorts\b/i.test(description) ? `${description.trim()}\n\n#Shorts` : description;
}

export async function stagePublish(ctx: Ctx): Promise<PublishOut> {
  const v = ctx.video;
  const pkg = await need<PackageOut>(v, "package", "Metadatos");
  const render = await need<RenderOut>(v, "render", "Montaje");
  if (v.status !== "approved" && v.status !== "scheduled") throw new NeedsUser("El video necesita tu aprobación en la revisión final.");
  const s = getSettings().publishing;
  const publishAt = v.scheduled_at && v.scheduled_at > Date.now() + 15 * 60 * 1000 ? new Date(v.scheduled_at).toISOString() : null;
  // Este mismo montaje ya se subió (falló lo que venía después): no se sube dos veces
  const already = v.youtube_id && v.data?.uploaded?.renderedAt === render.renderedAt ? v.youtube_id : null;
  let res: any;
  if (already) res = { id: already, status: v.data.uploaded.status ?? {} };
  else {
    await ctx.progress("Subiendo a YouTube…");
    const offP = await onUploadProgress((p) => { if (p.id === ctx.jobId) void ctx.progress(`Subiendo a YouTube · ${Math.round((p.sent / p.total) * 100)} %`); });
    const offS = await onUploadSession((p) => { if (p.id === ctx.jobId) void updateVideo(v.id, { upload_session: p.session }); });
    try {
      res = await uploadVideo(ctx.jobId, render.file, {
      title: pkg.chosen_title, description: shortsTag(v, render, L.withCredits(pkg.description, pkg.credits ?? [])), tags: pkg.tags, categoryId: s.categoryId,
      defaultLanguage: s.defaultLanguage, privacy: publishAt ? "private" : "public", publishAt, containsSyntheticMedia: pkg.synthetic_media,
      }, v.upload_session);
    } catch (e) {
      // Si la sesión guardada ya no sirve, la próxima vez se inicia una nueva
      if (e instanceof UserError && /expir/.test(e.userMessage)) await updateVideo(v.id, { upload_session: null });
      throw e;
    } finally { offP(); offS(); }
  }
  const ytId = res.id as string;
  await updateVideo(v.id, { youtube_id: ytId, upload_session: null, data: { uploaded: { renderedAt: render.renderedAt, status: res.status ?? {} } } });
  let thumbnail_ok = true; let note = "";
  const chosen = pkg.thumbnails[pkg.chosen_thumbnail];
  // La portada propia se sube tal cual (solo se convierte si no es JPEG/PNG de hasta 2 MB, el límite de YouTube)
  const thumb = chosen?.path ? (chosen.own ? await youtubeThumbFile(chosen.path) : chosen.path) : null;
  if (thumb) {
    try { await setThumbnail(ytId, thumb); }
    catch (e) { thumbnail_ok = false; note = e instanceof UserError ? e.userMessage : String(e); await log("warn", "YouTube", note, e instanceof UserError ? e.detail : "", v.id); }
  }
  if (isVertical(v) && render.duration > SHORTS_MAX_S) note = (note ? note + " " : "") + `Dura más de ${SHORTS_MAX_S / 60} min: YouTube lo trata como video normal, no como Short.`;
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

