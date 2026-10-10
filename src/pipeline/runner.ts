// Orquestador: ejecuta todas las etapas sin detenerse hasta la revisión final
// (lo único que espera al usuario), guarda cada resultado y se reanuda donde
// quedó tras un fallo.
import { db, proc } from "../lib/ipc";
import { emit } from "../lib/bus";
import { getSettings } from "../lib/settings";
import { log, logError, errorText, toast } from "../lib/events";
import { STAGES, getVideo, getStages, setStage, updateVideo, resetFrom, listTopics, createVideo, activeChannel, listVideos, type StageId } from "../lib/repo";
import { uid } from "../lib/util";
import * as St from "./stages";
import * as Ed from "./edit";
import { activity, setLive } from "../lib/activity";
import type { VerifyOut, ScriptOut } from "./types";
import { downloadVideo } from "./tiktok";
import { importUploads, personalOf, type PersonalSpec } from "./personal";
import { finishRevision } from "./improve";

interface Running { videoId: string; jobId: string; cancelled: boolean; stage: StageId | null; prepackage?: Promise<void> }
let current: Running | null = null;
const queue: string[] = [];

export const runningVideoId = () => current?.videoId ?? null;
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
    // Videos antiguos detenidos en la revisión del guion: ya no se espera, se sigue
    if (next.status === "review" && next.stage === "verify") { await setStage(video.id, "verify", { status: "approved", progress: null }); continue; }
    if (next.status === "review") return; // espera al usuario (revisión final)
    const stage = next.stage;
    r.stage = stage;
    await updateVideo(video.id, { stage });
    if (stage === "final") {
      // Video terminado: se copia solo a Descargas
      const dest = await downloadVideo(video).catch(async (e) => { await logError(e, video.id, "Descarga del video"); return null; });
      const iterate = personalOf(video)?.iterate;
      await finishRevision(video.id);
      await setStage(video.id, "final", { status: "review", progress: iterate ? "Primera versión lista: pide mejoras o apruébala" : "Lista para tu revisión final" });
      notifyReview(video.id, `${dest ? `Video terminado y guardado en Descargas: ${dest.split(/[\\/]/).pop()}` : "Video listo para la revisión final."}${iterate ? " Puedes pedir mejoras en Producción." : ""}`);
      return;
    }
    if (stage === "publish" && video.status !== "approved" && video.status !== "scheduled") return;

    await setStage(video.id, stage, { status: "running", error: null, startedNow: true, bumpAttempt: true, progress: "Iniciando…" });
    const label = STAGES.find((s) => s.id === stage)?.label ?? stage;
    await activity(video.id, stage, "stage", `Etapa: ${label}`);
    setLive(video.id, { caption: `${label}…`, progress: null });
    const ctx: St.Ctx = {
      video, jobId: r.jobId,
      progress: async (text) => { await db.execute("UPDATE stages SET progress=? WHERE video_id=? AND stage=?", [text, video.id, stage]); emit("stages"); },
      cancelled: () => r.cancelled,
    };
    // Títulos, descripción y miniaturas no dependen de las animaciones: se preparan mientras se crean
    if (stage === "motion" && !r.prepackage && !stages.find((x) => x.stage === "package")?.output) r.prepackage = prepackage(video, r);
    if (stage === "package" && r.prepackage) { await ctx.progress("Terminando los metadatos preparados…"); await r.prepackage; }
    try {
      const t0 = Date.now();
      const output = await runStage(stage, ctx);
      await activity(video.id, stage, "done", `${label} terminada en ${Math.max(1, Math.round((Date.now() - t0) / 1000))} s`);
      await setStage(video.id, stage, { status: "done", output, finishedNow: true, progress: null });
    } catch (e) {
      if (e instanceof St.NeedsUser) {
        await setStage(video.id, stage, { status: "review", progress: e.messageEs });
        notifyReview(video.id, e.messageEs);
        return;
      }
      const { message, detail } = errorText(e);
      await activity(video.id, stage, "warn", r.cancelled ? "Cancelado" : `Falló: ${message}`, detail.slice(0, 1500));
      await setStage(video.id, stage, { status: r.cancelled ? "pending" : "failed", error: r.cancelled ? "Cancelado" : `${message}\n\n${detail}`.trim(), progress: null, finishedNow: true });
      if (!r.cancelled) await logError(e, video.id, `${STAGES.find((s) => s.id === stage)?.label}`);
      return;
    }
  }
}

/** Prepara los metadatos en segundo plano; la etapa «package» luego solo completa créditos y capítulos. */
async function prepackage(video: Awaited<ReturnType<typeof getVideo>> & object, r: Running): Promise<void> {
  const ctx: St.Ctx = { video, jobId: r.jobId, cancelled: () => r.cancelled, progress: async () => { /* sin progreso propio: Motion muestra el suyo */ } };
  try {
    const out = await St.stagePackage(ctx);
    await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage='package' AND output IS NULL", [JSON.stringify(out), video.id]);
    await activity(video.id, "package", "done", "Títulos, descripción y miniaturas preparados mientras se creaban las animaciones");
  } catch (e) {
    if (!r.cancelled) await activity(video.id, "package", "warn", "No se pudieron preparar los metadatos en paralelo; se harán al final", errorText(e).message);
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
    case "verify": return verifyAndFix(ctx);
    case "voice": return St.stageVoice(ctx);
    case "storyboard": return Ed.stageStoryboard(ctx);
    case "assets": return Ed.stageAssets(ctx);
    case "polish": return Ed.stagePolish(ctx);
    case "motion": return Ed.stageMotion(ctx);
    case "package": return St.stagePackage(ctx);
    case "render": return Ed.stageRenderV2(ctx);
    case "publish": return St.stagePublish(ctx);
    default: return null;
  }
}

/**
 * Revisión de datos sin detenerse: si hay marcas rojas, Opus reescribe esas
 * frases una vez y el video sigue. En modo «desactivada» no se revisa.
 */
async function verifyAndFix(ctx: St.Ctx): Promise<VerifyOut> {
  // Guion propio del usuario: no se reescribe (la corrección automática cambiaría sus palabras)
  if (personalOf(ctx.video)?.script) {
    return { overall_es: "Guion propio: se respeta tal cual, sin revisión automática.", title_checks: [], originality: { verdict: "ok", note_es: "" }, claims: [], unlinked: [], segment_glosses: [], rounds: 0 };
  }
  if (getSettings().production.verifyMode === "off") {
    return { overall_es: "Revisión de datos desactivada en Ajustes.", title_checks: [], originality: { verdict: "ok", note_es: "" }, claims: [], unlinked: [], segment_glosses: [], rounds: 0 };
  }
  const v = await St.stageVerify(ctx);
  const issues = scriptIssues(v, await getStages(ctx.video.id), true);
  if (!issues.length) return v;
  await ctx.progress(`Corrigiendo ${issues.length} frase(s) marcadas…`);
  await activity(ctx.video.id, "verify", "decision", `Revisión de datos: ${issues.length} frase(s) a corregir; se corrigen solas`, issues.map((i: any) => `• ${i.claim ?? i.sentence ?? i.title}: ${i.problem}`).join("\n").slice(0, 1500));
  try {
    const revised = await St.stageScript(ctx, { issues, notes: "Automatic fix: rewrite ONLY the flagged sentences so they are accurate (soften, attribute or remove the doubtful detail). Keep everything else, including length and structure." });
    await setStage(ctx.video.id, "script", { status: "done", output: revised });
    for (const c of v.claims) if (c.severity === "block") { c.resolution = "accepted"; c.user_note = "Corregida automáticamente"; }
    for (const u of v.unlinked) if (u.severity === "block") { u.resolution = "accepted"; u.user_note = "Corregida automáticamente"; }
    v.overall_es = `${v.overall_es} Se corrigieron solas ${issues.length} frase(s).`.trim();
  } catch (e) {
    // Si la corrección falla, se sigue con el guion original (no se detiene el video)
    await activity(ctx.video.id, "verify", "warn", "No se pudo corregir el guion; se sigue con el original", errorText(e).message);
  }
  return v;
}

/** Problemas a corregir: marcas rojas (y en revisión manual, también lo pedido por el usuario). */
function scriptIssues(v: VerifyOut, stages: Awaited<ReturnType<typeof getStages>>, autoOnly: boolean) {
  const script = stages.find((s) => s.stage === "script")?.output as ScriptOut;
  const want = (sev: string, res?: string | null) => autoOnly ? sev === "block" : res === "fix" || (sev === "block" && res !== "accepted");
  return [
    ...v.claims.filter((c) => want(c.severity, c.resolution)).map((c) => {
      const claim = script?.segments.flatMap((s) => s.claims).find((x) => x.id === c.claim_id);
      return { claim_id: c.claim_id, claim: claim?.text_en, problem: c.note_es, suggested_fix: c.suggested_fix_en, operator_note: c.user_note ?? "" };
    }),
    ...v.unlinked.filter((u) => want(u.severity, u.resolution)).map((u) => ({ segment_id: u.segment_id, sentence: u.text_en, problem: u.issue_es, operator_note: u.user_note ?? "" })),
    // Los títulos se rehacen en Metadatos: en la corrección automática no justifican reescribir el guion
    ...(autoOnly ? [] : v.title_checks.filter((t) => t.verdict === "overpromise").map((t) => ({ title: t.title, problem: t.note_es }))),
  ];
}

// ---------- Acciones de revisión ----------
export async function retryStage(videoId: string, stage: StageId) {
  await setStage(videoId, stage, { status: "pending", error: null });
  runVideo(videoId);
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
  const v = await getVideo(videoId);
  await setStage(videoId, "final", { status: "approved", progress: null });
  // Un video personal no se publica: queda aprobado (y ya está en Descargas)
  if (v && personalOf(v)) { await updateVideo(videoId, { status: "published", stage: null }); return; }
  await updateVideo(videoId, { status: "approved", scheduled_at: scheduledAt });
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

/** Crea un video a partir de lo que escribas (una idea, un tema o instrucciones) y lo produce hasta la revisión final. */
export async function startFromPrompt(prompt: string): Promise<string | null> {
  const ch = await activeChannel();
  if (!ch) { toast("warn", "Primero crea un canal en Ajustes."); return null; }
  const text = prompt.trim();
  if (!text) return null;
  const first = text.split(/\n/)[0].trim();
  const title = first.length > 90 ? `${first.slice(0, 87)}…` : first;
  const v = await createVideo(ch.id, { id: "", channel_id: ch.id, title, angle: "", notes: text, potential: {}, risk: {}, score: 0, status: "approved", origin: "user", position: 0, sources: [], created_at: Date.now(), used_video_id: null }, {});
  runVideo(v.id);
  return v.id;
}

/** Video personal: brief, duración, idioma, archivos y guion propios. */
export async function startPersonal(o: { prompt: string; description: string; minutes: number; language: "es" | "en"; useLibrary: boolean; iterate: boolean; files: string[]; script: string | null }): Promise<string | null> {
  const ch = await activeChannel();
  if (!ch) { toast("warn", "Primero crea un canal en Ajustes."); return null; }
  const text = o.prompt.trim() || o.description.trim();
  if (!text && !o.script) return null;
  const first = (text.split(/\n/)[0] || "Video personal").trim();
  const title = first.length > 90 ? `${first.slice(0, 87)}…` : first;
  const v = await createVideo(ch.id, { id: "", channel_id: ch.id, title, angle: "", notes: text, potential: {}, risk: {}, score: 0, status: "approved", origin: "user", position: 0, sources: [], created_at: Date.now(), used_video_id: null }, {});
  const files = await importUploads(v, o.files);
  const script = o.script ? (await importUploads(v, [o.script]))[0] ?? null : null;
  const personal: PersonalSpec = { description: o.description.trim(), minutes: o.minutes, language: o.language, useLibrary: o.useLibrary, iterate: o.iterate, files, script: script ? { path: script.path, name: script.name } : null };
  await updateVideo(v.id, { data: { personal } });
  // Un video personal no se sube a YouTube: termina en tu revisión (y en Descargas)
  await setStage(v.id, "publish", { status: "skipped" });
  runVideo(v.id);
  return v.id;
}

/** Inicia el siguiente video con el próximo tema aprobado (si no hay uno en curso). */
export async function startNextVideo(): Promise<string | null> {
  const ch = await activeChannel();
  if (!ch) { toast("warn", "Primero crea un canal en Ajustes."); return null; }
  const topics = await listTopics(ch.id, "approved");
  if (!topics.length) { toast("warn", "No hay temas aprobados.", "Aprueba al menos uno en Temas."); return null; }
  const v = await createVideo(ch.id, topics[0], {});
  runVideo(v.id);
  return v.id;
}

export async function activeVideos(channelId: string) {
  return (await listVideos(channelId, 50)).filter((v) => v.status === "active" || v.status === "approved");
}
