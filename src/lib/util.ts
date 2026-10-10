// Utilidades puras (sin dependencias de Tauri) — probadas con vitest.

export const now = () => Date.now();
export const uid = (prefix = "") =>
  prefix + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 16);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Limita cuántas tareas corren a la vez; las demás esperan su turno en orden (el turno pasa directo al siguiente). */
export function limiter(n: number) {
  const max = Math.max(1, Math.floor(n) || 1);
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < max) active++; else await new Promise<void>((r) => waiting.push(r));
    try { return await fn(); } finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
}

/** Aplica fn a cada elemento con hasta n a la vez; los resultados quedan en el orden original. */
export const mapLimit = <T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> => {
  const run = limiter(n);
  return Promise.all(items.map((x, i) => run(() => fn(x, i))));
};

export function safeJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

/** Une segmentos de ruta respetando el separador del sistema (Windows usa "\"). */
export function joinPath(...parts: string[]): string {
  const sep = parts.some((p) => p.includes("\\")) ? "\\" : "/";
  return parts
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .join(sep);
}

export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const extName = (p: string) => { const b = baseName(p); const i = b.lastIndexOf("."); return i >= 0 ? b.slice(i + 1).toLowerCase() : ""; };

export function slugify(s: string, max = 48): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "x";
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function fmtDate(ts: number | null | undefined, withTime = true): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("es-PE", withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"]; let i = -1; let v = n;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

/** Divide un texto narrado en oraciones (conserva abreviaturas comunes). */
export function splitSentences(text: string): string[] {
  const protectedText = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Inc|Ltd|Co|Corp|U\.S|U\.K|No|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./g, "$1\u0000")
    .replace(/\b([A-Z])\./g, "$1\u0000");
  const parts = protectedText.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)/g) ?? [protectedText];
  return parts.map((p) => p.replace(/\u0000/g, ".").trim()).filter((p) => p.length > 0);
}

export const wordCount = (t: string) => (t.trim().match(/\S+/g) ?? []).length;

/** Extrae el primer objeto JSON de un texto (respuesta de un modelo). */
export function extractJson<T = any>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { try { return JSON.parse(candidate.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

/** Diferencia de líneas mínima (LCS) para el historial de habilidades. */
export function lineDiff(a: string, b: string): { type: "same" | "add" | "del"; text: string }[] {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  if (n * m > 4_000_000) return [...A.map((t) => ({ type: "del" as const, text: t })), ...B.map((t) => ({ type: "add" as const, text: t }))];
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { type: "same" | "add" | "del"; text: string }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ type: "same", text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: A[i++] }); }
    else out.push({ type: "add", text: B[j++] });
  }
  while (i < n) out.push({ type: "del", text: A[i++] });
  while (j < m) out.push({ type: "add", text: B[j++] });
  return out;
}

/** Desfase horario (minutos) de una zona IANA en un instante dado. */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Instante UTC correspondiente a una fecha y hora locales de una zona (p. ej. 12:00 en America/New_York). */
export function zonedTimeToUtc(dateYmd: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const off1 = tzOffsetMinutes(timeZone, guess);
  const first = new Date(guess.getTime() - off1 * 60000);
  const off2 = tzOffsetMinutes(timeZone, first);
  return off1 === off2 ? first : new Date(guess.getTime() - off2 * 60000);
}

export function ymdInZone(at: Date, timeZone: string): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(at);
}

export function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

export function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

export function stripHtml(s: string) { return s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim(); }
