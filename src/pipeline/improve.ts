// Mejora continua: con la primera versión lista, el usuario pide cambios en
// lenguaje natural (como en un chat); Claude mira un resumen del video y
// cuadros del resultado, propone cambios puntuales y ATRIL rehace solo lo
// afectado (lo demás se reutiliza).
import { db, fs } from "../lib/ipc";
import { getVideo, getStages, updateVideo, setStage, resetFrom, STAGES, type StageId } from "../lib/repo";
import { emit } from "../lib/bus";
import { activity } from "../lib/activity";
import { errorText, logError, toast } from "../lib/events";
import { joinPath, uid, fmtDuration } from "../lib/util";
import { claudeRun } from "../providers/claude";
import { ffmpeg } from "../providers/ffmpeg";
import { obj, str, arr, en } from "./prompts";
import { systemFor } from "./personal";
import { segInfos, segmentOffsets } from "./timeline";
import { contactSheet, reshootShot, shotToCard, rescoreMusic } from "./edit";
import type { Ctx } from "./stages";
import type { ScriptOut, VoiceOut, PolishOut, MotionOut, RenderOut } from "./types";

export interface Revision {
  id: string; at: number; request: string;
  status: "planning" | "applying" | "rendering" | "done" | "failed";
  reply_es?: string; changes_es?: string[]; error?: string;
}

const PLAN_SCHEMA = obj({
  reply_es: str("Respuesta breve al usuario, en español: qué vas a cambiar (o por qué no se puede)"),
  ops: arr(obj({
    op: en(["motion", "shot_image", "shot_card", "script", "music"]),
    target: str("motion: animation id (m1…); shot_image/shot_card: shot id (s001…); script: segment id; music: empty"),
    instructions_en: str("motion: the exact visual change to make to that animation (it keeps the rest). Empty otherwise"),
    query_en: str("shot_image: concrete stock search query (2-5 visual nouns, English); music: search query for the new background music mood. Empty otherwise"),
    image_prompt_en: str("shot_image: detailed AI image prompt if a generated image fits better; empty to search stock media"),
    text: str("shot_card: the card text; script: the FULL new text of that segment (only when the narration itself must change). Empty otherwise"),
  }), "Minimal list of changes that fulfil the request"),
});

const listRevisions = (data: Record<string, any>): Revision[] => (data.revisions as Revision[]) ?? [];
async function saveRevision(videoId: string, r: Revision) {
  const v = await getVideo(videoId);
  if (!v) return;
  const all = listRevisions(v.data).filter((x) => x.id !== r.id);
  await updateVideo(videoId, { data: { revisions: [...all, r] } });
}

/** Resumen compacto del video para el planificador (tiempos globales para entender «en el minuto 1:20…»). */
async function videoState(videoId: string) {
  const st = await getStages(videoId);
  const get = <T>(s: StageId) => st.find((x) => x.stage === s)?.output as T | undefined;
  const script = get<ScriptOut>("script"), voice = get<VoiceOut>("voice"), polish = get<PolishOut>("polish"), motion = get<MotionOut>("motion"), render = get<RenderOut>("render");
  if (!script || !voice || !polish || !render) return null;
  const segs = segInfos(script, voice);
  const off = segmentOffsets(segs, 0.6);
  const t = (seg: string, at = 0) => fmtDuration((off[seg] ?? 0) + at);
  const done = new Map((motion?.items ?? []).filter((m) => m.file).map((m) => [m.id, m]));
  return {
    render,
    text: `VIDEO (${fmtDuration(render.duration)})
SEGMENTS:
${script.segments.map((s) => `- ${s.id} @${t(s.id)} «${s.title}»: ${s.text_en}`).join("\n")}

SHOTS (what is on screen):
${polish.shots.map((s) => {
  const m = [...done.values()].find((x) => x.kind === "fullscreen" && x.shot_ids.includes(s.id));
  const what = m ? `animation ${m.id}` : s.visual.endsWith("card") ? `${s.visual} "${s.card_text ?? ""}"` : `${s.visual}: ${(s.cast_note_es || s.query_en || "").slice(0, 90)}`;
  return `- ${s.id} @${t(s.segment_id, s.start ?? 0)} (${(s.dur ?? 0).toFixed(1)} s): ${what}`;
}).join("\n")}

ANIMATIONS:
${[...done.values()].map((m) => `- ${m.id} (${m.kind}) @${t(m.segment_id, m.start)}: ${m.brief_en.slice(0, 220)}${m.text ? ` | text: "${m.text}"` : ""}`).join("\n") || "(none)"}

MUSIC: ${polish.music.map((b) => `${b.title ?? "(none)"} [${b.mood_en}]`).join("; ")}`,
  };
}

/** 12 cuadros del video actual en una hoja, para que Claude «vea» la versión que el usuario revisó. */
async function framesSheet(render: RenderOut, dir: string): Promise<string | null> {
  try {
    await fs.mkdir(dir);
    const frames: string[] = [];
    for (let i = 0; i < 12; i++) {
      const f = joinPath(dir, `c${i}.jpg`);
      await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", ((render.duration * (i + 0.5)) / 12).toFixed(2), "-i", render.file, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "5", f]);
      frames.push(f);
    }
    const sheet = joinPath(dir, "hoja.jpg");
    await contactSheet(frames, sheet, false);
    return sheet;
  } catch { return null; }
}

const ORDER = STAGES.map((s) => s.id);
const earliest = (a: StageId | null, b: StageId) => (a && ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

/**
 * Atiende un pedido de mejora: planifica, aplica los cambios y vuelve a montar
 * desde la etapa más temprana afectada. Devuelve la revisión registrada.
 */
export async function requestImprovement(videoId: string, request: string, run: (id: string) => void): Promise<Revision> {
  const video = await getVideo(videoId);
  if (!video) throw new Error("Video no encontrado");
  const rev: Revision = { id: uid("r"), at: Date.now(), request: request.trim(), status: "planning" };
  await saveRevision(videoId, rev);
  const ctx: Ctx = { video, jobId: uid("job_"), cancelled: () => false, progress: async (t) => { await db.execute("UPDATE stages SET progress=? WHERE video_id=? AND stage='final'", [t, videoId]); emit("stages"); } };
  try {
    await ctx.progress("Entendiendo tu pedido…");
    const state = await videoState(videoId);
    if (!state) throw new Error("El video aún no tiene una versión terminada.");
    const sheet = await framesSheet(state.render, joinPath(video.dir, "mejora"));
    const history = listRevisions(video.data).filter((r) => r.status === "done").slice(-5).map((r) => `- "${r.request}" → ${r.reply_es ?? ""}`).join("\n");
    const r = await claudeRun<{ reply_es: string; ops: { op: string; target: string; instructions_en: string; query_en: string; image_prompt_en: string; text: string }[] }>({
      stage: "polish", activityStage: "final", label: "Mejora continua", system: systemFor(video), schema: PLAN_SCHEMA,
      prompt: `The operator watched the current version of this video and asks for changes. Turn the request into the MINIMAL set of edits.
Prefer cheap, local edits: "motion" changes one animation (its code is corrected, the rest is kept); "shot_image" replaces the picture of one shot; "shot_card" turns a shot into a text card; "music" changes the background music. Use "script" ONLY if the spoken narration itself must change: it re-narrates and rebuilds that part of the edit (slow). If something cannot be done with these edits, say so in reply_es. Times like "1:20" refer to the @ timestamps.
${history ? `\nEARLIER REQUESTS ALREADY APPLIED:\n${history}\n` : ""}
OPERATOR REQUEST: ${rev.request}

${state.text}`,
      images: sheet ? [{ label: "12 frames of the current version, in time order (left→right, top→bottom):", path: sheet }] : undefined,
      videoId, channelId: video.channel_id, jobId: ctx.jobId,
    });
    rev.reply_es = r.data.reply_es; rev.status = "applying";
    await saveRevision(videoId, rev);
    await activity(videoId, "final", "decision", `Mejora continua: ${rev.request}`, r.data.reply_es);
    // Aplicar
    let from: StageId | null = null;
    const changes: string[] = [];
    const stages = await getStages(videoId);
    const polish = stages.find((s) => s.stage === "polish")?.output as PolishOut;
    const script = stages.find((s) => s.stage === "script")?.output as ScriptOut;
    let polishDirty = false, scriptDirty = false;
    for (const op of r.data.ops ?? []) {
      try {
        if (op.op === "motion") {
          const m = polish.motion.find((x) => x.id === op.target);
          if (!m || !op.instructions_en) continue;
          m.revise_en = [m.revise_en, op.instructions_en].filter(Boolean).join(" Then: ");
          polishDirty = true; from = earliest(from, "motion"); changes.push(`Animación ${m.id}: ${op.instructions_en}`);
        } else if (op.op === "shot_image") {
          await ctx.progress(`Buscando otra imagen para ${op.target}…`);
          changes.push(await reshootShot(ctx, op.target, { query_en: op.query_en || op.text, image_prompt_en: op.image_prompt_en || undefined }));
          from = earliest(from, "render");
        } else if (op.op === "shot_card" && op.text) {
          await shotToCard(video, op.target, op.text); from = earliest(from, "render"); changes.push(`${op.target}: tarjeta «${op.text}»`);
        } else if (op.op === "script" && op.text) {
          const seg = script.segments.find((x) => x.id === op.target);
          if (!seg) continue;
          seg.text_en = op.text.trim(); seg.claims = seg.claims.filter((c) => seg.text_en.includes(c.text_en));
          scriptDirty = true; from = earliest(from, "voice"); changes.push(`Narración de «${seg.title}» reescrita`);
        } else if (op.op === "music" && op.query_en) {
          await ctx.progress("Buscando otra música…");
          changes.push(await rescoreMusic(ctx, op.query_en)); from = earliest(from, "render");
        }
      } catch (e) { changes.push(`No se pudo: ${errorText(e).message}`); }
    }
    if (scriptDirty) await setStage(videoId, "script", { output: script });
    // Las animaciones con pedido se leen de Retoques (el resto de su resultado no cambia)
    if (polishDirty) { const fresh = (await getStages(videoId)).find((s) => s.stage === "polish")?.output as PolishOut; await setStage(videoId, "polish", { output: { ...fresh, motion: polish.motion } }); }
    rev.changes_es = changes;
    if (!from) { rev.status = "done"; await saveRevision(videoId, rev); toast("info", "Sin cambios que aplicar", r.data.reply_es); return rev; }
    rev.status = "rendering";
    await saveRevision(videoId, rev);
    await resetFrom(videoId, from);
    run(videoId);
    return rev;
  } catch (e) {
    rev.status = "failed"; rev.error = errorText(e).message;
    await saveRevision(videoId, rev);
    await setStage(videoId, "final", { status: "review", progress: "Primera versión lista: pide mejoras o apruébala" });
    await logError(e, videoId, "Mejora continua");
    return rev;
  }
}

/** Al terminar el nuevo montaje, la revisión en curso queda hecha. */
export async function finishRevision(videoId: string) {
  const v = await getVideo(videoId);
  const cur = v ? listRevisions(v.data).find((r) => r.status === "rendering") : null;
  if (cur) await saveRevision(videoId, { ...cur, status: "done" });
}

export const revisionsOf = (data: Record<string, any>) => listRevisions(data).slice().sort((a, b) => a.at - b.at);
