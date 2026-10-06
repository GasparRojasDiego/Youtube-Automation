// Consumo: plan de Claude (ventanas de 5 h y 7 días, según los eventos
// oficiales `rate_limit_event` de Claude Code), tokens por tarea, cuota
// gratuita de voz y llamadas a APIs de medios.
import { db } from "./ipc";
import { emit } from "./bus";
import { now, safeJson } from "./util";

export interface Window { utilization: number; resetsAt: number } // utilization 0..1, resetsAt en ms
export interface ClaudeLimits {
  fiveHour: Window | null; sevenDay: Window | null;
  extra?: Record<string, Window>;   // otras ventanas que informe el plan (p. ej. semanal por modelo)
  status: string; overage?: boolean; updatedAt: number;
}

/** Normaliza la utilización (Claude Code la entrega como fracción 0–1; si llega en %, se convierte). */
export function normUtil(u: unknown): number {
  const n = Number(u ?? 0);
  if (!isFinite(n) || n < 0) return 0;
  return n > 1.5 ? n / 100 : n;
}

export function parseRateLimit(info: any): ClaudeLimits | null {
  const w = info?.unifiedWindows ?? info?.unified_windows;
  if (!w) return null;
  const win = (x: any): Window | null => x ? { utilization: normUtil(x.utilization), resetsAt: Number(x.resetsAt ?? x.resets_at ?? 0) * 1000 } : null;
  const extra: Record<string, Window> = {};
  for (const [k, v] of Object.entries(w)) if (k !== "five_hour" && k !== "seven_day" && v) extra[k] = win(v)!;
  return { fiveHour: win(w.five_hour), sevenDay: win(w.seven_day), extra, status: String(info.status ?? ""), overage: !!info.isUsingOverage, updatedAt: now() };
}

let cache: ClaudeLimits | null = null;

export async function getLimits(): Promise<ClaudeLimits | null> {
  if (cache) return cache;
  const r = await db.query<{ value: string }>("SELECT value FROM meta WHERE key='claude_limits'");
  cache = safeJson<ClaudeLimits | null>(r[0]?.value, null);
  return cache;
}

export async function setLimits(l: ClaudeLimits) {
  cache = l;
  await db.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('claude_limits',?)", [JSON.stringify(l)]);
  emit("usage");
}

export interface ClaudeRun {
  videoId?: string | null; stage: string; label: string; model: string;
  input: number; cacheRead: number; cacheWrite: number; output: number; webSearches: number;
  apiEquiv: number; durationMs: number; before: ClaudeLimits | null; after: ClaudeLimits | null; ok: boolean;
}

export async function recordClaudeRun(r: ClaudeRun) {
  await db.execute(
    `INSERT INTO claude_runs(ts,video_id,stage,label,model,input_tokens,cache_read,cache_write,output_tokens,web_searches,api_equiv,duration_ms,five_hour,seven_day,five_hour_before,seven_day_before,ok)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [now(), r.videoId ?? null, r.stage, r.label, r.model, r.input, r.cacheRead, r.cacheWrite, r.output, r.webSearches, r.apiEquiv, r.durationMs,
      r.after?.fiveHour?.utilization ?? null, r.after?.sevenDay?.utilization ?? null,
      r.before?.fiveHour?.utilization ?? null, r.before?.sevenDay?.utilization ?? null, r.ok ? 1 : 0]);
  emit("usage");
}

/**
 * Cuánto de cada ventana consumió una tarea: diferencia entre la utilización
 * antes y después (si la ventana no se reinició entre medias).
 */
export function windowDelta(before: number | null, after: number | null, sameWindow = true): number | null {
  if (before == null || after == null || !sameWindow) return null;
  return Math.max(0, after - before);
}

// ---------- APIs de medios ----------
export const API_LIMITS: Record<string, { label: string; perHour?: number; perDay?: number; perMonth?: number; perMinute?: number }> = {
  openverse: { label: "Openverse", perHour: 5, perDay: 100 },   // sin registro; con registro: 100/min, 10 000/día
  pexels: { label: "Pexels", perHour: 200, perMonth: 20000 },
  pixabay: { label: "Pixabay", perMinute: 100 },
  freesound: { label: "Freesound", perMinute: 60, perDay: 2000 },
  nasa: { label: "NASA Images", perHour: 1000 },
  met: { label: "The Met", perMinute: 4800 },
  wikimedia: { label: "Wikimedia Commons", perMinute: 200 },
};

export async function recordApiCall(provider: string, ok: boolean, note = "") {
  await db.execute("INSERT INTO api_calls(provider,ts,ok,note) VALUES(?,?,?,?)", [provider, now(), ok ? 1 : 0, note.slice(0, 200)]);
}

export async function apiCount(provider: string, sinceMs: number): Promise<number> {
  const r = await db.query<{ n: number }>("SELECT COUNT(*) n FROM api_calls WHERE provider=? AND ts>=?", [provider, now() - sinceMs]);
  return r[0]?.n ?? 0;
}

export function fmtReset(ms: number | null | undefined): string {
  if (!ms) return "—";
  const d = ms - Date.now();
  if (d <= 0) return "ya se repuso";
  const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000);
  if (h >= 24) return `en ${Math.floor(h / 24)} d ${h % 24} h (${new Date(ms).toLocaleString("es-PE", { weekday: "short", hour: "2-digit", minute: "2-digit" })})`;
  return h > 0 ? `en ${h} h ${m} min` : `en ${m} min`;
}

export const pct = (x: number | null | undefined, digits = 1) => x == null ? "—" : `${(x * 100).toFixed(digits)} %`;

// ---------- Análisis del consumo de Claude ----------
export interface RunRow {
  id: number; ts: number; video_id: string | null; stage: string; label: string; model: string;
  input_tokens: number; cache_read: number; cache_write: number; output_tokens: number; web_searches: number;
  api_equiv: number; duration_ms: number; five_hour: number | null; seven_day: number | null;
  five_hour_before: number | null; seven_day_before: number | null; ok: number;
}

export async function listRuns(o: { videoId?: string; since?: number; limit?: number } = {}): Promise<RunRow[]> {
  const w: string[] = []; const p: unknown[] = [];
  if (o.videoId) { w.push("video_id=?"); p.push(o.videoId); }
  if (o.since) { w.push("ts>=?"); p.push(o.since); }
  p.push(o.limit ?? 200);
  return db.query<RunRow>(`SELECT * FROM claude_runs ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`, p);
}

export interface Calibration { per5h: number | null; per7d: number | null; samples: number }

/**
 * Cuánto % de cada ventana consume, en promedio, 1 USD de «equivalente API».
 * Claude Code informa la utilización con poca resolución; con varias tareas
 * medidas se obtiene una estimación fina por tarea.
 */
export async function calibration(days = 21): Promise<Calibration> {
  const rows = await db.query<RunRow>("SELECT * FROM claude_runs WHERE ts>=? AND api_equiv>0", [now() - days * 86_400_000]);
  let d5 = 0, a5 = 0, d7 = 0, a7 = 0, n = 0;
  for (const r of rows) {
    if (r.five_hour != null && r.five_hour_before != null && r.five_hour >= r.five_hour_before) { d5 += r.five_hour - r.five_hour_before; a5 += r.api_equiv; n++; }
    if (r.seven_day != null && r.seven_day_before != null && r.seven_day >= r.seven_day_before) { d7 += r.seven_day - r.seven_day_before; a7 += r.api_equiv; }
  }
  return { per5h: a5 >= 1 && d5 > 0 ? d5 / a5 : null, per7d: a7 >= 1 && d7 > 0 ? d7 / a7 : null, samples: n };
}

export const totalInput = (r: Pick<RunRow, "input_tokens" | "cache_read" | "cache_write">) => r.input_tokens + r.cache_read + r.cache_write;

export function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)} k`;
  return String(Math.round(n));
}

export const STAGE_NAMES: Record<string, string> = {
  topics: "Banco de temas", research: "Investigación", script: "Guion", verify: "Verificación", voice: "Voz", storyboard: "Storyboard",
  assets: "Medios y casting", polish: "Retoques", motion: "Animaciones", package: "Metadatos", render: "Montaje", analysis: "Referentes",
  usage: "Consulta de límite", vision: "Visión", plan: "Plan visual",
};
