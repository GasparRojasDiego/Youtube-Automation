// Informe de errores para copiar y pegar en el chat con Claude: versión,
// equipo, configuración, comprobaciones locales (sin gastar créditos), etapas
// que fallaron y los últimos errores con todo su detalle. Sin claves.
import { db, secrets, appPaths, fs } from "./ipc";
import { getSettings, SECRET } from "./settings";
import { redact } from "./events";
import { appVersion } from "./updater";
import { fmtBytes } from "./util";
import { claudeVersion } from "../providers/claude";
import { ffmpegVersion, pickEncoder } from "../providers/ffmpeg";
import { findBrowser } from "../motion/host";
import { STAGES } from "./repo";

export interface ErrorRow { ts: number; level: string; source: string; message: string; detail: string; video_id: string | null }

/** Errores desde la última vez que se marcaron como resueltos. */
export async function openErrors(): Promise<ErrorRow[]> {
  const since = Number((await db.query<{ value: string }>("SELECT value FROM meta WHERE key='errors_cleared'"))[0]?.value ?? 0);
  return db.query<ErrorRow>("SELECT ts, level, source, message, detail, video_id FROM events WHERE level='error' AND ts>? ORDER BY ts DESC LIMIT 40", [since]);
}

export async function clearErrors() {
  await db.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('errors_cleared',?)", [String(Date.now())]);
}

const safe = async <T>(f: () => Promise<T>, fallback: string): Promise<T | string> => { try { return await f(); } catch (e) { return `${fallback} (${e instanceof Error ? e.message : String(e)})`; } };

export async function buildReport(errors: ErrorRow[]): Promise<string> {
  const s = getSettings();
  const p = await appPaths();
  const keys = Object.entries({ "Google Cloud": SECRET.googleApiKey, OpenAI: SECRET.openaiApiKey, Gemini: SECRET.geminiApiKey, ElevenLabs: SECRET.elevenlabsApiKey, Pexels: SECRET.pexelsApiKey, Pixabay: SECRET.pixabayApiKey, Freesound: SECRET.freesoundApiKey, "YouTube conectado": SECRET.youtubeRefreshToken });
  const present: string[] = [];
  for (const [label, k] of keys) present.push(`${label}: ${(await secrets.get(k).catch(() => null)) ? "sí" : "no"}`);
  const failed = await db.query<{ video_id: string; stage: string; error: string; title: string; attempt: number }>(
    "SELECT s.video_id, s.stage, s.error, s.attempt, v.title FROM stages s JOIN videos v ON v.id=s.video_id WHERE s.status='failed' ORDER BY s.finished_at DESC LIMIT 10");
  const enc = await safe(async () => (await pickEncoder()).name, "sin codificador");
  const lines = [
    `INFORME DE ERRORES · ATRIL v${await appVersion()}`,
    `Fecha: ${new Date().toISOString()}`,
    `Equipo: ${navigator.userAgent}`,
    `Espacio libre: ${await safe(async () => fmtBytes(await fs.diskFree(p.data)), "?")}`,
    "",
    "COMPROBACIONES (locales, sin gastar créditos)",
    `- Claude Code: ${(await safe(() => claudeVersion(), "error")) ?? "no encontrado"}`,
    `- ffmpeg: ${(await safe(() => ffmpegVersion(), "error")) ?? "no encontrado"} · codificador: ${enc}`,
    `- Navegador para animaciones: ${(await safe(() => findBrowser(), "error")) ?? "no encontrado"}`,
    `- Claves: ${present.join(" · ")}`,
    "",
    "CONFIGURACIÓN",
    `- Voz: ${s.tts.provider} (${s.tts.provider === "google" ? s.tts.google.voice : s.tts.provider === "gemini" ? s.tts.gemini.voice : s.tts.elevenlabs.voiceId || "sin voz"})`,
    `- Imágenes con IA: ${s.images.provider} · ${s.images.openai.model} / ${s.images.gemini.model} · máx. ${s.images.perVideo} por video`,
    `- Animaciones: ${s.motion.enabled ? `sí, ${s.motion.perVideo} por video, revisión ${s.motion.critique ? "sí" : "no"}` : "no"}`,
    `- Claude (modelo/esfuerzo): ${Object.entries(s.claude.models).map(([k, m]) => `${k}=${m}/${s.claude.effort[k as keyof typeof s.claude.effort] || "def"}`).join(", ")}`,
    `- Montaje: codificador ${s.ffmpeg.encoder}, calidad ${s.ffmpeg.quality}`,
    "",
    `ETAPAS QUE FALLARON (${failed.length})`,
    ...failed.map((f) => `- «${f.title}» · ${STAGES.find((x) => x.id === f.stage)?.label ?? f.stage} (intento ${f.attempt})\n    ${redact(f.error ?? "").replace(/\n/g, "\n    ").slice(0, 4000)}`),
    "",
    `ERRORES (${errors.length}, del más reciente al más antiguo)`,
    ...errors.map((e) => `- ${new Date(e.ts).toISOString()} · ${e.source} · ${e.message}${e.detail ? `\n    ${redact(e.detail).replace(/\n/g, "\n    ").slice(0, 4000)}` : ""}`),
  ];
  return redact(lines.join("\n"));
}
