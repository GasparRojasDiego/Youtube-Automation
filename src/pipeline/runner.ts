// Orquestador: ejecuta las etapas en orden hasta el siguiente punto de
// revisión, guarda cada resultado y se reanuda donde quedó tras un fallo.
import { db, proc } from "../lib/ipc";
import { emit } from "../lib/bus";
import { getSettings } from "../lib/settings";
import { log, logError, errorText, toast } from "../lib/events";
import { STAGES, getVideo, getStages, setStage, updateVideo, resetFrom, listTopics, createVideo, activeChannel, listVideos, type StageId } from "../lib/repo";
import { uid } from "../lib/util";
import * as St from "./stages";
import * as L from "./logic";
import type { VerifyOut, ScriptOut } from "./types";

interface Running { videoId: string; jobId: string; cancelled: boolean; stage: StageId | null }
let current: Running | null = null;
const queue: string[] = [];

export const runningVideoId = () => current?.videoId ?? null;
export const runningStage = () => current?.stage ?? null;
export const isQueued = (id: string) => queue.includes(id) || current?.videoId === id;

export function runVideo(videoId: string) {
  if (current?.videoId === videoId || queue.includes(videoId)) return;
  queue.push(videoId);
  emit("jobs");
  if (!current) void drain();
}

async function drain() {
  while (queue.length) {
    const id = queue.shift()!;
    current = { videoId: id, jobId: uid("job_"), cancelled: false, stage: null };
    emit("jobs");
    try { await runOnce(current); } catch (e) { await logError(e, id, "Error del orquestador"); }
    current = null;
    emit("jobs", "videos", "stages");
  }
}

export async function cancelCurrent() {
  if (!current) return;
  current.cancelled = true;
  await proc.kill(current.jobId).catch(() => false);
}

async function runOnce(r: Running) {
  for (;;) {
    if (r.cancelled) return;
    const video = await getVideo(r.videoId);
    if (!video || video.status === "rejected" || video.status === "archived") return;
    const stages = await getStages(video.id);
    const next = stages.find((s) => !["done", "approved", "skipped"].includes(s.status));
    if (!next) { await updateVideo(video.id, { stage: null }); return; }
    if (next.status === "review") return; // espera al usuario
    const stage = next.stage;
    r.stage = stage;
    await updateVideo(video.id, { stage });
    if (stage === "final") { await setStage(video.id, "final", { status: "review", progress: "Lista para tu revisión final" }); notifyReview(video.id, "La revisión final está lista."); return; }
    if (stage === "publish" && video.status !== "approved" && video.status !== "scheduled") return;

    await setStage(video.id, stage, { status: "running", error: null, startedNow: true, bumpAttempt: true, progress: "Iniciando…" });
    const ctx: St.Ctx = {
      video, jobId: r.jobId,
      progress: async (text) => { await db.execute("UPDATE stages SET progress=? WHERE video_id=? AND stage=?", [text, video.id, stage]); emit("stages"); },
      cancelled: () => r.cancelled,
    };
    try {
      const output = await runStage(stage, ctx);
      const gate = stage === "verify";
      await setStage(video.id, stage, { status: gate ? "review" : "done", output, finishedNow: true, progress: null });
      if (gate) { notifyReview(video.id, "El guion verificado espera tu revisión."); return; }
    } catch (e) {
      if (e instanceof St.NeedsUser) {
        await setStage(video.id, stage, { status: "review", progress: e.messageEs });
        notifyReview(video.id, e.messageEs);
        return;
      }
      const { message, detail } = errorText(e);
      await setStage(video.id, stage, { status: r.cancelled ? "pending" : "failed", error: r.cancelled ? "Cancelado" : `${message}\n\n${detail}`.trim(), progress: null, finishedNow: true });
      if (!r.cancelled) await logError(e, video.id, `${STAGES.find((s) => s.id === stage)?.label}`);
      return;
    }
  }
}

function notifyReview(videoId: string, text: string) {
  void log("info", "pipeline", text, "", videoId, true);
  toast("info", text);
}

async function runStage(stage: StageId, ctx: St.Ctx): Promise<unknown> {
  switch (stage) {
    case "research": return St.stageResearch(ctx);
    case "script": return St.stageScript(ctx);
    case "verify": return St.stageVerify(ctx);
    case "voice": return St.stageVoice(ctx);
    case "visuals": return St.stageVisuals(ctx);
    case "package": return St.stagePackage(ctx);
    case "render": return St.stageRender(ctx);
    case "publish": return St.stagePublish(ctx);
    default: return null;
  }
}

// ---------- Acciones de revisión ----------
export async function retryStage(videoId: string, stage: StageId) {
  await setStage(videoId, stage, { status: "pending", error: null });
  runVideo(videoId);
}

export async function saveVerification(videoId: string, v: VerifyOut) {
  await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage='verify'", [JSON.stringify(v), videoId]);
  emit("stages");
}

/** Aprueba el guion (sin bloqueos abiertos) y continúa el pipeline. */
export async function approveScript(videoId: string) {
  const st = (await getStages(videoId)).find((s) => s.stage === "verify");
  const v = st?.output as VerifyOut | null;
  if (!v) throw new Error("No hay verificación");
  if (L.openBlocks(v) > 0) throw new Error("Quedan marcas bloqueantes sin resolver.");
  if (L.pendingFixes(v) > 0) throw new Error("Hay correcciones pedidas: aplícalas antes de aprobar.");
  await setStage(videoId, "verify", { status: "approved" });
  runVideo(videoId);
}

/** Corrige el guion con las marcas y notas, y lo vuelve a verificar. */
export async function applyScriptFixes(videoId: string, notes: string) {
  const stages = await getStages(videoId);
  const v = stages.find((s) => s.stage === "verify")?.output as VerifyOut;
  const script = stages.find((s) => s.stage === "script")?.output as ScriptOut;
  const issues = [
    ...v.claims.filter((c) => c.resolution === "fix" || (c.severity === "block" && c.resolution !== "accepted")).map((c) => {
      const claim = script.segments.flatMap((s) => s.claims).find((x) => x.id === c.claim_id);
      return { claim_id: c.claim_id, claim: claim?.text_en, problem: c.note_es, suggested_fix: c.suggested_fix_en, operator_note: c.user_note ?? "" };
    }),
    ...v.unlinked.filter((u) => u.resolution === "fix" || (u.severity === "block" && u.resolution !== "accepted")).map((u) => ({ segment_id: u.segment_id, sentence: u.text_en, problem: u.issue_es, operator_note: u.user_note ?? "" })),
    ...v.title_checks.filter((t) => t.verdict === "overpromise").map((t) => ({ title: t.title, problem: t.note_es })),
  ];
  const video = await getVideo(videoId);
  if (!video) return;
  // Ejecuta la corrección dentro de la cola para no competir con otro trabajo.
  await setStage(videoId, "verify", { status: "running", progress: "Aplicando correcciones…" });
  const jobId = uid("job_");
  const ctx: St.Ctx = { video, jobId, cancelled: () => false, progress: async (t) => { await db.execute("UPDATE stages SET progress=? WHERE video_id=? AND stage='verify'", [t, videoId]); emit("stages"); } };
  try {
    const revised = await St.stageScript(ctx, { issues, notes });
    await setStage(videoId, "script", { status: "done", output: revised });
    await setStage(videoId, "verify", { status: "pending", progress: null });
    // Las etapas posteriores deben rehacerse con el nuevo guion
    for (const s of ["voice", "visuals", "package", "render", "final", "publish"] as StageId[]) await setStage(videoId, s, { status: "pending" });
    runVideo(videoId);
  } catch (e) {
    await setStage(videoId, "verify", { status: "review", progress: null });
    await logError(e, videoId, "Corrección del guion");
  }
}

/** Rehace la voz de un segmento y, en cadena, tiempos, metadatos y montaje. */
export async function redoVoiceSegment(videoId: string, segmentId: string) {
  const st = (await getStages(videoId)).find((s) => s.stage === "voice");
  const out = st?.output as { segments: { segment_id: string; hash: string }[] } | null;
  if (out) { const seg = out.segments.find((x) => x.segment_id === segmentId); if (seg) seg.hash = "redo"; await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage='voice'", [JSON.stringify(out), videoId]); }
  await resetFrom(videoId, "voice");
  runVideo(videoId);
}

export async function rerenderFrom(videoId: string, stage: StageId) {
  await resetFrom(videoId, stage);
  runVideo(videoId);
}

export async function approveFinal(videoId: string, scheduledAt: number | null) {
  await updateVideo(videoId, { status: "approved", scheduled_at: scheduledAt });
  await setStage(videoId, "final", { status: "approved", progress: null });
  await setStage(videoId, "publish", { status: "pending" });
  runVideo(videoId);
}

export async function rejectVideo(videoId: string, reason: string) {
  await updateVideo(videoId, { status: "rejected", data: { rejected_reason: reason } });
  await log("info", "pipeline", "Video rechazado.", reason, videoId, false);
}

// ---------- Arranque y automatización diaria ----------
export async function recoverOnStartup() {
  // Etapas que quedaron "running" por un cierre inesperado vuelven a pendiente.
  const stale = await db.query<{ video_id: string; stage: string }>("SELECT video_id, stage FROM stages WHERE status='running'");
  for (const s of stale) await setStage(s.video_id, s.stage as StageId, { status: "pending", progress: null, error: "Se interrumpió (la app se cerró). Se reanudará desde aquí." });
  if (!getSettings().production.autoRunToReview) return;
  const active = await db.query<{ id: string }>("SELECT id FROM videos WHERE status IN ('active','approved') ORDER BY created_at");
  for (const v of active) {
    const stages = await getStages(v.id);
    const next = stages.find((s) => !["done", "approved", "skipped"].includes(s.status));
    if (next && next.status !== "review" && next.status !== "failed") runVideo(v.id);
  }
}

/** Inicia el siguiente video con el próximo tema aprobado (si no hay uno en curso). */
export async function startNextVideo(opts: { mode?: "standard" | "premium"; voiceMode?: "ai" | "own" } = {}): Promise<string | null> {
  const ch = await activeChannel();
  if (!ch) { toast("warn", "Primero crea un canal en Ajustes."); return null; }
  const topics = await listTopics(ch.id, "approved");
  if (!topics.length) { toast("warn", "No hay temas aprobados.", "Aprueba al menos uno en Temas."); return null; }
  const v = await createVideo(ch.id, topics[0], { mode: opts.mode, voiceMode: opts.voiceMode });
  runVideo(v.id);
  return v.id;
}

export async function activeVideos(channelId: string) {
  return (await listVideos(channelId, 50)).filter((v) => v.status === "active" || v.status === "approved");
}
