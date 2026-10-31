// Cola de producción: hasta 50 videos seguidos (Automatización o Personal), uno tras otro y sin
// supervisión hasta la revisión final de cada uno; nunca se publica nada sin tu aprobación.
// Refuerzos: si se agota el límite del plan, lee cuándo se repone, espera y sigue sola; reintenta los
// fallos pasajeros con esperas crecientes; si un video falla de verdad, lo marca y pasa al siguiente;
// se detiene antes de llenar el disco; retoma donde iba al volver a abrir la app; y evita que Windows
// suspenda el equipo mientras trabaja.
import { db, fs, proc, appPaths } from "../lib/ipc";
import { emit, subscribe } from "../lib/bus";
import { log } from "../lib/events";
import { getSettings } from "../lib/settings";
import { getVideo, getStages, setStage, updateVideo, createVideo, listTopics, activeChannel, type Video, type Topic, type StageRow } from "../lib/repo";
import { uid, joinPath, extName, safeJson } from "../lib/util";
import { UsageLimitError } from "../providers/claude";
import { UserError } from "../lib/events";
import { runVideo, isQueued, cancelCurrent, runningVideoId, lastFailure, createPersonal } from "./runner";
import { saveCover, COVER_EXT, type CoverKind } from "./covers";
import { kindOf, type ToneId } from "./personal";
import type { VideoFormat } from "./format";

export const QUEUE_MAX = 50;
export type QueueMode = "auto" | "personal";
export type QueueStatus = "pending" | "running" | "waiting" | "done" | "attention" | "failed" | "skipped";
export type Covers = Partial<Record<CoverKind, string | null>>;

/** Textos para publicar a mano (los da el chat de marketing): se copian desde la app con un clic. */
export interface PublishPack { tiktok?: string; shortsTitle?: string; shortsDescription?: string }

export interface AutoCfg {
  /** Siguiente tema aprobado, uno de los temas propuestos o una idea propia. */
  topic: { kind: "next" } | { kind: "topic"; id: string; title: string } | { kind: "idea"; text: string };
  title: string;            // título fijo (opcional)
  notes: string;            // enfoque o indicaciones para la IA
  minutes: [number, number];
  format: VideoFormat;
  covers: Covers;
  /** Voz del video (null = la de Ajustes en su idioma). */
  voice: string | null;
  publish: PublishPack | null;
}

export interface PersonalCfg {
  title: string; about: string; description: string; audience: string; cta: string;
  tone: ToneId | null; toneCustom: { name: string; description: string } | null;
  aesthetic: string;
  palette: { background?: string; foreground?: string; accent?: string } | null;
  font: string | null;
  script: string;           // guion escrito en la tarjeta (o vacío)
  scriptFile: string | null;
  minutes: [number, number];
  language: "es" | "en";
  format: VideoFormat;
  covers: Covers;
  library: { mode: "all" | "pick" | "none"; ids: string[] };
  files: string[];
  /** Buscar material en internet y crear imágenes con IA (además de tus archivos). */
  web: boolean;
  /** Voz del video (null = la de Ajustes en su idioma). */
  voice: string | null;
  publish: PublishPack | null;
}

/** Campaña: la configuración común de muchas tarjetas (cada tarjeta guarda solo lo que cambia). */
export interface Campaign {
  id: string; channel_id: string; name: string; mode: QueueMode; format: VideoFormat;
  cfg: AutoCfg | PersonalCfg; created_at: number; updated_at: number;
}

export interface QueueItem {
  id: string; channel_id: string; position: number; mode: QueueMode; cfg: AutoCfg | PersonalCfg; status: QueueStatus;
  video_id: string | null; error: string | null; attempts: number; wait_until: number | null;
  created_at: number; updated_at: number; started_at: number | null; finished_at: number | null;
  /** Campaña de la que hereda (null = tarjeta suelta) y campos que cambia respecto de ella. */
  campaign_id: string | null; overrides: string[];
}

export interface QueueState {
  running: boolean; channelId: string | null;
  /** Plataformas en marcha (YouTube 16:9, TikTok 9:16); cada estudio inicia y pausa la suya. */
  formats?: VideoFormat[];
  /** Por qué se detuvo sola (disco, sesión de Claude…) o cómo terminó. */
  note: string | null;
  startedAt: number | null;
}

export const isAuto = (i: QueueItem): i is QueueItem & { cfg: AutoCfg } => i.mode === "auto";
const ACTIVE: QueueStatus[] = ["pending", "running", "waiting"];
export const isActive = (i: QueueItem) => ACTIVE.includes(i.status);

export function defaultCfg(mode: QueueMode): AutoCfg | PersonalCfg {
  const tm = getSettings().production.targetMinutes;
  if (mode === "auto") return { topic: { kind: "next" }, title: "", notes: "", minutes: [tm[0], tm[1]], format: "16:9", covers: {}, voice: null, publish: null };
  return { title: "", about: "", description: "", audience: "", cta: "", tone: null, toneCustom: null, aesthetic: "", palette: null, font: null,
    script: "", scriptFile: null, minutes: [2, 3], language: "es", format: "16:9", covers: {}, library: { mode: "all", ids: [] }, files: [], web: true, voice: null, publish: null };
}

// ---------- Datos ----------
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Configuración base de una campaña (lo que heredan sus tarjetas). */
export const campaignBase = (c: Pick<Campaign, "mode" | "format" | "cfg">): AutoCfg | PersonalCfg => ({ ...defaultCfg(c.mode), ...c.cfg, format: c.format });

function rowToItem(r: any, campaigns: Map<string, Campaign>): QueueItem {
  const raw = safeJson<Record<string, unknown>>(r.cfg, {});
  const c = r.campaign_id ? campaigns.get(r.campaign_id) : undefined;
  const base = c ? campaignBase(c) : defaultCfg(r.mode);
  const cfg = { ...base, ...raw, ...(c ? { format: c.format } : {}) } as AutoCfg | PersonalCfg;
  return { ...r, cfg, attempts: Number(r.attempts ?? 0), campaign_id: c ? r.campaign_id : null, overrides: c ? Object.keys(raw).filter((k) => !same(raw[k], (base as any)[k])) : [] };
}

const rowToCampaign = (r: any): Campaign => ({ ...r, cfg: { ...defaultCfg(r.mode), ...safeJson(r.cfg, {}), format: r.format } });

export async function listCampaigns(channelId: string): Promise<Campaign[]> {
  return (await db.query("SELECT * FROM campaigns WHERE channel_id=? ORDER BY created_at", [channelId])).map(rowToCampaign);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const r = await db.query("SELECT * FROM campaigns WHERE id=?", [id]);
  return r[0] ? rowToCampaign(r[0]) : null;
}

export async function listQueue(channelId: string): Promise<QueueItem[]> {
  const camps = new Map((await listCampaigns(channelId)).map((c) => [c.id, c]));
  return (await db.query("SELECT * FROM queue_items WHERE channel_id=? ORDER BY position, created_at", [channelId])).map((r) => rowToItem(r, camps));
}

export async function getItem(id: string): Promise<QueueItem | null> {
  const r = await db.query("SELECT * FROM queue_items WHERE id=?", [id]);
  if (!r[0]) return null;
  const c = r[0].campaign_id ? await getCampaign(String(r[0].campaign_id)) : null;
  return rowToItem(r[0], new Map(c ? [[c.id, c]] : []));
}

/** Crea una campaña. Su plantilla parte de `cfg` (por ejemplo, la de una tarjeta ya configurada). */
export async function createCampaign(channelId: string, name: string, mode: QueueMode, format: VideoFormat, cfg?: Partial<AutoCfg | PersonalCfg>): Promise<Campaign> {
  const id = uid("cp_"); const t = Date.now();
  const clean = name.trim() || "Campaña sin nombre";
  await db.execute("INSERT INTO campaigns(id,channel_id,name,mode,format,cfg,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    [id, channelId, clean, mode, format, JSON.stringify({ ...defaultCfg(mode), ...(cfg ?? {}), format }), t, t]);
  emit("queue");
  return (await getCampaign(id))!;
}

export async function saveCampaign(id: string, p: { name?: string; cfg?: AutoCfg | PersonalCfg }) {
  const c = await getCampaign(id);
  if (!c) return;
  await db.execute("UPDATE campaigns SET name=?, cfg=?, updated_at=? WHERE id=?",
    [p.name?.trim() || c.name, JSON.stringify({ ...(p.cfg ?? c.cfg), format: c.format }), Date.now(), id]);
  emit("queue");
}

/** Campos propios de cada video: no pasan a la plantilla cuando una tarjeta se vuelve campaña. */
export const PER_CARD = ["title", "topic", "script", "scriptFile", "about", "publish", "covers"];

/**
 * Convierte una tarjeta suelta en la primera de una campaña: su configuración (salvo lo propio de cada
 * video) pasa a ser la plantilla, y la tarjeta queda dentro guardando solo lo suyo.
 */
export async function campaignFromItem(itemId: string, name: string): Promise<Campaign | null> {
  const it = await getItem(itemId);
  if (!it || it.campaign_id) return null;
  const tpl: Record<string, unknown> = Object.fromEntries(Object.entries(it.cfg).filter(([k]) => !PER_CARD.includes(k)));
  const c = await createCampaign(it.channel_id, name, it.mode, it.cfg.format);
  // Los archivos comunes pasan a la carpeta de la campaña (la tarjeta podría borrarse después)
  if (Array.isArray(tpl.files)) tpl.files = await Promise.all((tpl.files as string[]).map((f) => storeFile(c.id, f).catch(() => f)));
  await saveCampaign(c.id, { cfg: { ...c.cfg, ...tpl } as AutoCfg | PersonalCfg });
  const fresh = (await getCampaign(c.id))!;
  await db.execute("UPDATE queue_items SET campaign_id=?, cfg=?, updated_at=? WHERE id=?", [c.id, JSON.stringify(diffFrom(campaignBase(fresh), it.cfg)), Date.now(), it.id]);
  emit("queue");
  return fresh;
}

/** Borra la campaña: sus tarjetas quedan sueltas con la configuración que tenían (nada se pierde). */
export async function deleteCampaign(id: string) {
  const c = await getCampaign(id);
  if (!c) return;
  for (const it of (await listQueue(c.channel_id)).filter((x) => x.campaign_id === id))
    await db.execute("UPDATE queue_items SET campaign_id=NULL, cfg=?, updated_at=? WHERE id=?", [JSON.stringify(it.cfg), Date.now(), it.id]);
  await db.execute("DELETE FROM campaigns WHERE id=?", [id]);
  emit("queue");
}

async function patchItem(id: string, p: Partial<Omit<QueueItem, "id" | "cfg">> & { cfg?: AutoCfg | PersonalCfg }) {
  const keys = Object.keys(p) as (keyof typeof p)[];
  if (!keys.length) return;
  await db.execute(`UPDATE queue_items SET ${keys.map((k) => `${k}=?`).join(",")}, updated_at=? WHERE id=?`,
    [...keys.map((k) => (k === "cfg" ? JSON.stringify(p.cfg) : (p[k] as unknown))), Date.now(), id]);
  emit("queue");
}

/**
 * Añade una tarjeta. En una campaña, `cfg` son solo sus cambios (lo demás se hereda); suelta, su
 * configuración completa (o la predeterminada del modo).
 */
export async function addItem(channelId: string, mode: QueueMode, cfg?: Partial<AutoCfg | PersonalCfg>, campaignId?: string | null): Promise<QueueItem> {
  const items = await listQueue(channelId);
  if (items.filter(isActive).length >= QUEUE_MAX) throw new UserError(`La cola admite hasta ${QUEUE_MAX} videos pendientes.`, "Espera a que avance o quita alguno.", "cola", false);
  const camp = campaignId ? await getCampaign(campaignId) : null;
  const id = uid("q_");
  const t = Date.now();
  const stored = camp ? diffFrom(campaignBase(camp), cfg ?? {}) : { ...defaultCfg(mode), ...(cfg ?? {}) };
  await db.execute("INSERT INTO queue_items(id,channel_id,position,mode,cfg,status,attempts,created_at,updated_at,campaign_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
    [id, channelId, (items.at(-1)?.position ?? 0) + 1, camp?.mode ?? mode, JSON.stringify(stored), "pending", 0, t, t, camp?.id ?? null]);
  emit("queue");
  return (await getItem(id))!;
}

/** Solo los campos que difieren de la base (lo que una tarjeta de campaña cambia). */
function diffFrom(base: AutoCfg | PersonalCfg, cfg: Partial<AutoCfg | PersonalCfg>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(cfg)) if (k !== "format" && !same(val, (base as any)[k])) out[k] = val;
  return out;
}

/** Guarda la configuración de una tarjeta (en una campaña, solo lo que difiere de su plantilla). */
export async function saveCfg(id: string, cfg: AutoCfg | PersonalCfg) {
  const it = await getItem(id);
  const camp = it?.campaign_id ? await getCampaign(it.campaign_id) : null;
  if (!camp) { await patchItem(id, { cfg }); return; }
  await db.execute("UPDATE queue_items SET cfg=?, updated_at=? WHERE id=?", [JSON.stringify(diffFrom(campaignBase(camp), cfg)), Date.now(), id]);
  emit("queue");
}

export async function duplicateItem(id: string): Promise<QueueItem | null> {
  const it = await getItem(id);
  if (!it) return null;
  const copy = await addItem(it.channel_id, it.mode, it.campaign_id ? Object.fromEntries(it.overrides.map((k) => [k, (it.cfg as any)[k]])) : it.cfg, it.campaign_id);
  // Las portadas y archivos se copian a la carpeta de la nueva tarjeta (cada una es dueña de lo suyo)
  const cfg = structuredClone(it.cfg) as AutoCfg | PersonalCfg;
  const own = (k: string) => !it.campaign_id || it.overrides.includes(k);
  if (own("covers")) for (const k of ["youtube", "tiktok"] as CoverKind[]) if (cfg.covers[k]) cfg.covers[k] = await storeFile(copy.id, cfg.covers[k]!, k).catch(() => null);
  if (!isAuto(it) && own("files")) {
    const p = cfg as PersonalCfg;
    p.files = await Promise.all(p.files.map((f) => storeFile(copy.id, f).catch(() => f)));
    if (p.scriptFile) p.scriptFile = await storeFile(copy.id, p.scriptFile).catch(() => p.scriptFile);
  }
  await saveCfg(copy.id, cfg);
  // Justo debajo de la original
  await db.execute("UPDATE queue_items SET position=? WHERE id=?", [it.position + 0.5, copy.id]);
  await renumber(it.channel_id);
  return getItem(copy.id);
}

export async function removeItem(id: string) {
  const it = await getItem(id);
  if (!it || it.status === "running") return;
  await db.execute("DELETE FROM queue_items WHERE id=?", [id]);
  await fs.remove(await itemDir(id)).catch(() => undefined);
  emit("queue");
}

export async function moveItem(id: string, delta: -1 | 1) {
  const it = await getItem(id);
  if (!it) return;
  const items = await listQueue(it.channel_id);
  const i = items.findIndex((x) => x.id === id), j = i + delta;
  if (j < 0 || j >= items.length) return;
  await db.batch([
    { sql: "UPDATE queue_items SET position=? WHERE id=?", params: [items[j].position, items[i].id] },
    { sql: "UPDATE queue_items SET position=? WHERE id=?", params: [items[i].position, items[j].id] },
  ]);
  emit("queue");
}

async function renumber(channelId: string) {
  const items = await listQueue(channelId);
  await db.batch(items.map((x, i) => ({ sql: "UPDATE queue_items SET position=? WHERE id=?", params: [i + 1, x.id] })));
  emit("queue");
}

/** Quita de la lista lo terminado (los videos siguen en Videos). */
export async function clearFinished(channelId: string, format?: VideoFormat) {
  for (const it of (await listQueue(channelId)).filter((x) => !isActive(x) && x.status !== "attention" && (!format || x.cfg.format === format))) await removeItem(it.id);
}

/** Vuelve a poner en la cola una tarjeta fallida u omitida (retoma su video donde quedó). */
export async function retryItem(id: string) {
  await patchItem(id, { status: "pending", error: null, attempts: 0, wait_until: null, finished_at: null });
}

export async function skipItem(id: string) {
  const it = await getItem(id);
  if (!it || it.status === "running") return;
  await patchItem(id, { status: "skipped", wait_until: null, finished_at: Date.now() });
}

// ---------- Archivos de las tarjetas ----------
async function itemDir(id: string) { return joinPath((await appPaths()).data, "cola", id); }

/**
 * Copia un archivo a la carpeta de la tarjeta (mismos bytes), para que siga ahí aunque el original se
 * mueva antes de que llegue su turno. Las portadas se guardan como «youtube.jpg» / «tiktok.png».
 */
export async function storeFile(itemId: string, src: string, cover?: CoverKind): Promise<string> {
  const dir = await itemDir(itemId);
  await fs.mkdir(dir);
  const ext = extName(src).toLowerCase();
  if (cover && !COVER_EXT.includes(ext)) throw new UserError(`Formato de portada no admitido (.${ext}).`, "Usa JPG, PNG o WebP.", "cola", false);
  if (src.startsWith(dir)) return src;
  const name = cover ? `${cover}.${ext}` : `${Date.now().toString(36)}-${src.split(/[\\/]/).pop()}`;
  if (cover) for (const e of await fs.list(dir).catch(() => [])) if (e.name.startsWith(`${cover}.`)) await fs.remove(e.path).catch(() => undefined);
  const dst = joinPath(dir, name);
  await fs.copy(src, dst);
  return dst;
}

// ---------- Validación ----------
const okRange = (r: [number, number]) => Array.isArray(r) && r[0] >= 0.25 && r[1] >= r[0] && r[1] <= 60;

/** Lo que impide producir la tarjeta (vacío = lista). `warnings` no bloquean. */
export function checkItem(it: QueueItem, ctx: { topics: Topic[]; items: QueueItem[] }): { problems: string[]; warnings: string[] } {
  const problems: string[] = []; const warnings: string[] = [];
  const c = it.cfg;
  if (!okRange(c.minutes)) problems.push("El rango de minutos no es válido (de 0,25 a 60, mínimo ≤ máximo).");
  if (c.format === "9:16" && c.minutes[1] > 3) warnings.push("Vertical de más de 3 min: YouTube no lo tratará como Short (TikTok sí lo acepta).");
  if (!c.covers.youtube && !c.covers.tiktok) warnings.push("Sin portada propia: se usará la miniatura que proponga la IA.");
  if (isAuto(it)) {
    const t = it.cfg.topic;
    if (t.kind === "idea" && !t.text.trim()) problems.push("Escribe la idea del video o elige un tema.");
    if (t.kind === "topic") {
      const topic = ctx.topics.find((x) => x.id === t.id);
      if (!topic || topic.status === "rejected") problems.push("El tema elegido ya no existe.");
      else if (topic.status === "used" && !it.video_id) problems.push("Ese tema ya se usó en otro video.");
      const dup = ctx.items.find((x) => x.id !== it.id && isActive(x) && isAuto(x) && x.cfg.topic.kind === "topic" && x.cfg.topic.id === t.id);
      if (dup && isActive(it)) problems.push("Otra tarjeta de la cola usa el mismo tema.");
    }
    if (t.kind === "next" && !it.video_id) {
      const approved = ctx.topics.filter((x) => x.status === "approved").length;
      const before = ctx.items.filter((x) => x.position < it.position && isActive(x) && !x.video_id && isAuto(x) && x.cfg.topic.kind === "next").length;
      if (approved <= before) warnings.push("Hoy no hay un tema aprobado para esta tarjeta: apruébalo en Temas antes de que le llegue el turno.");
    }
  } else {
    const p = it.cfg as PersonalCfg;
    if (!p.title.trim() && !p.about.trim() && !p.script.trim() && !p.scriptFile) problems.push("Escribe al menos el título, de qué trata o el guion.");
    if (p.tone === "custom" && !p.toneCustom?.description.trim()) problems.push("Describe tu modo propio (o elige uno de la lista).");
    if (p.library.mode === "pick" && !p.library.ids.length) problems.push("Elige al menos un recurso de tu biblioteca (o usa la biblioteca completa).");
    if (!p.web && p.library.mode === "none" && !p.files.length) warnings.push("Sin internet, sin biblioteca y sin archivos: el video será solo animaciones y tarjetas.");
    if (!p.aesthetic.trim() && !p.tone) warnings.push("Sin modo ni descripción estética: se usará el estilo visual del canal.");
  }
  return { problems, warnings };
}

// ---------- Estado de la cola ----------
const STATE_KEY = "queue_state";
let stateCache: QueueState | null = null;

export async function getQueueState(): Promise<QueueState> {
  if (stateCache) return stateCache;
  const r = await db.query<{ value: string }>("SELECT value FROM meta WHERE key=?", [STATE_KEY]);
  stateCache = { running: false, channelId: null, note: null, startedAt: null, ...safeJson<Partial<QueueState>>(r[0]?.value, {}) };
  return stateCache;
}

async function setQueueState(p: Partial<QueueState>) {
  stateCache = { ...(await getQueueState()), ...p };
  await db.execute("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)", [STATE_KEY, JSON.stringify(stateCache)]);
  emit("queue");
}

// ---------- Clasificación de fallos ----------
export type FailureKind = "limit" | "setup" | "disk" | "transient" | "fatal";

/** Qué hacer con un fallo: esperar el límite, pausar (algo que debe arreglar el usuario), reintentar o seguir con el siguiente. */
export function classifyFailure(e: unknown): FailureKind {
  if (e instanceof UsageLimitError) return "limit";
  const msg = e instanceof UserError ? `${e.userMessage}\n${e.detail}` : e instanceof Error ? e.message : String(e ?? "");
  if (/no tiene una sesión iniciada|No encuentro Claude Code|not logged in|please run \/login/i.test(msg)) return "setup";
  if (/poco espacio en disco|no space left|disk (is )?full|os error (28|39|112)|ENOSPC/i.test(msg)) return "disk";
  if (/límite de uso del plan/i.test(msg)) return "limit";
  if (/tard[óo] demasiado|timed? ?out|ECONN|ETIMEDOUT|EAI_AGAIN|network|conexión|socket|fetch failed|overloaded|HTTP 5\d\d|\b(429|500|502|503|504|529)\b|temporar/i.test(msg)) return "transient";
  if (e instanceof UserError && !e.retryable) return "fatal";
  return "transient";
}

/** Espera tras el intento n (1, 2, 3…) de un fallo pasajero: 2, 10 y 30 minutos. */
export const backoffMs = (attempt: number) => [2, 10, 30][Math.min(2, Math.max(0, attempt - 1))] * 60_000;
export const QUEUE_TIMING = {
  /** Margen tras la hora en que se repone el límite (el reloj del plan y el del equipo pueden diferir un poco). */
  limitMarginMs: 3 * 60_000,
  /** Sin hora conocida, se vuelve a probar a los 30 min (si sigue agotado, se espera otra vez). */
  limitUnknownMs: 30 * 60_000,
  /** Cada cuánto se mira el reloj durante una espera. */
  tickMs: 15_000,
};
const DISK_MIN = 6 * 1024 ** 3;

/** Siguiente paso tras el fallo de una tarjeta. */
export function nextAfterFailure(kind: FailureKind, attempts: number, now: number, resetAt: number | null):
  { action: "wait"; until: number } | { action: "pause" } | { action: "fail" } {
  // Hora conocida: hasta entonces (más un margen). Ya pasada: se prueba en 10 min. Desconocida: en 30 min.
  if (kind === "limit") return { action: "wait", until: resetAt == null ? now + QUEUE_TIMING.limitUnknownMs : resetAt > now ? resetAt + QUEUE_TIMING.limitMarginMs : now + Math.min(10 * 60_000, QUEUE_TIMING.limitUnknownMs) };
  if (kind === "setup" || kind === "disk") return { action: "pause" };
  if (kind === "transient" && attempts <= 3) return { action: "wait", until: now + backoffMs(attempts) };
  // Un fallo «definitivo» se reintenta una vez (a veces no lo es); después se pasa al siguiente video
  if (kind === "fatal" && attempts <= 1) return { action: "wait", until: now + 60_000 };
  return { action: "fail" };
}

const reachedReview = (v: Video | null, stages: StageRow[]) =>
  !!v && (["ready", "published", "approved", "scheduled"].includes(v.status) || ["review", "approved"].includes(stages.find((s) => s.stage === "final")?.status ?? ""));
const hhmm = (t: number) => `el ${new Date(t).toLocaleString("es-PE", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}`;

// ---------- Creación del video de una tarjeta ----------
export async function videoForItem(it: QueueItem): Promise<Video> {
  const ch = await activeChannel();
  const channelId = it.channel_id || ch?.id;
  if (!channelId) throw new UserError("No hay canal.", "Crea un canal en Ajustes.", "cola", false);
  let v: Video | null;
  if (isAuto(it)) {
    const c = it.cfg;
    const topics = await listTopics(channelId);
    let topic: Topic | null = null;
    if (c.topic.kind === "topic") {
      const id = c.topic.id;
      topic = topics.find((t) => t.id === id) ?? null;
      if (!topic || topic.status === "used" || topic.status === "rejected") throw new UserError("El tema de esta tarjeta ya no está disponible.", "Elige otro tema en la tarjeta y pulsa «Reintentar».", "cola", false);
    } else if (c.topic.kind === "next") {
      topic = topics.find((t) => t.status === "approved") ?? null;
      if (!topic) throw new UserError("No hay temas aprobados para esta tarjeta.", "Aprueba un tema en Temas (o elige uno en la tarjeta) y pulsa «Reintentar».", "cola", false);
    } else {
      const text = c.topic.text.trim();
      const first = text.split(/\n/)[0].trim();
      topic = { id: "", channel_id: channelId, title: first.length > 90 ? `${first.slice(0, 87)}…` : first, angle: "", notes: text, potential: {}, risk: {}, score: 0, status: "approved", origin: "user", position: 0, sources: [], created_at: Date.now(), used_video_id: null };
    }
    const notes = [topic.notes, c.notes.trim() && `Operator's focus for this video: ${c.notes.trim()}`, c.title.trim() && `Title fixed by the operator (use it exactly): ${c.title.trim()}`].filter(Boolean).join("\n\n");
    v = await createVideo(channelId, topic.id ? topic : null, { title: c.title.trim() || topic.title });
    await updateVideo(v.id, { data: { topic: { title: topic.title, angle: topic.angle, notes, sources: topic.sources }, format: c.format, minutesRange: c.minutes, fixedTitle: c.title.trim() || null,
      queue: { item: it.id, campaign: it.campaign_id }, voice: c.voice || null, publish: c.publish || null } });
  } else {
    const p = it.cfg as PersonalCfg;
    const files = p.files.filter((f) => kindOf(f));
    for (const f of files) if (!(await fs.exists(f))) throw new UserError(`No encuentro el archivo «${f.split(/[\\/]/).pop()}» de esta tarjeta.`, "Vuelve a añadirlo en la tarjeta y pulsa «Reintentar».", "cola", false);
    v = await createPersonal({
      channelId, prompt: "", description: p.description, minutes: (p.minutes[0] + p.minutes[1]) / 2, language: p.language, useLibrary: p.web, iterate: false,
      files, script: p.scriptFile && !p.script.trim() ? p.scriptFile : null, scriptText: p.script.trim() || null, format: p.format,
      extra: { title: p.title.trim() || undefined, about: p.about.trim() || undefined, audience: p.audience.trim() || undefined, cta: p.cta.trim() || undefined,
        tone: p.tone ?? undefined, toneCustom: p.tone === "custom" ? p.toneCustom : null, aesthetic: p.aesthetic.trim() || undefined, minutesRange: p.minutes,
        palette: p.palette, font: p.font, library: p.library },
    });
    if (!v) throw new UserError("No se pudo crear el video de esta tarjeta.", "Revisa que tenga título, descripción o guion.", "cola", false);
    await updateVideo(v.id, { data: { queue: { item: it.id, campaign: it.campaign_id }, voice: p.voice || null, publish: p.publish || null } });
  }
  // Portadas: tal cual las subiste (miniatura de YouTube, portada incrustada en las descargas y en las partes de TikTok)
  for (const k of ["youtube", "tiktok"] as CoverKind[]) {
    const src = it.cfg.covers[k];
    if (src && (await fs.exists(src))) await saveCover(v, k, src);
  }
  return (await getVideo(v.id))!;
}

// ---------- Bucle ----------
let loop: Promise<void> | null = null;
let wake: (() => void) | null = null;
const tick = (ms: number) => new Promise<void>((res) => { const t = setTimeout(() => { wake = null; res(); }, ms); wake = () => { clearTimeout(t); wake = null; res(); }; });

/** Espera hasta `until` mirando el reloj cada 15 s (los temporizadores largos se atrasan si el equipo se suspende). */
async function sleepUntil(until: number) {
  while (Date.now() < until && (await getQueueState()).running) await tick(Math.min(QUEUE_TIMING.tickMs, Math.max(200, until - Date.now())));
}

/** Espera a que el orquestador suelte el video (terminó, falló, espera al usuario o se canceló). */
const waitIdle = (videoId: string) => new Promise<void>((res) => {
  let done = false;
  const check = () => { if (done || isQueued(videoId)) return; done = true; clearInterval(t); off(); res(); };
  const t = setInterval(check, 3000);
  const off = subscribe("jobs", () => setTimeout(check, 50));
  check();
});

const notify = (text: string, detail = "", videoId: string | null = null, level: "info" | "warn" | "error" = "info") => log(level, "cola", text, detail, videoId, true);

/** Plataformas en marcha (sin dato, todas: así seguía la cola de la 2.5.8). */
export const runningFormats = (st: QueueState): VideoFormat[] => (st.running ? (st.formats?.length ? st.formats : ["16:9", "9:16"]) : []);

/** Inicia la cola de una plataforma (o de todas). Los videos se producen de a uno, en el orden de la lista. */
export async function startQueue(channelId: string, format?: VideoFormat) {
  const st = await getQueueState();
  const formats: VideoFormat[] = format ? [...new Set([...(st.running && st.channelId === channelId ? runningFormats(st) : []), format])] : ["16:9", "9:16"];
  await setQueueState({ running: true, channelId, formats, note: null, startedAt: st.running ? st.startedAt : Date.now() });
  await proc.keepAwake(true);
  ensureLoop();
}

/**
 * Pausa la cola de una plataforma (o toda): termina el video en curso y se detiene. Con `now`, además
 * cancela el video en curso de esa plataforma (queda guardado para retomarlo).
 */
export async function pauseQueue(now = false, format?: VideoFormat) {
  const st = await getQueueState();
  const left = format ? runningFormats(st).filter((f) => f !== format) : [];
  await setQueueState(left.length ? { formats: left } : { running: false, formats: [], note: now ? "Detenida por ti." : "En pausa: se detiene al terminar el video en curso." });
  wake?.();
  if (now) {
    const items = await listQueue(st.channelId ?? "");
    const cur = items.find((i) => i.status === "running" && (!format || i.cfg.format === format));
    if (cur?.video_id && runningVideoId() === cur.video_id) await cancelCurrent();
  }
  // Con un video en curso, el equipo sigue despierto hasta que termine (lo apaga el bucle al salir)
  if (!loop) await proc.keepAwake(false);
}

/** Deja de esperar (límite o reintento) y prueba ahora. */
export async function retryNow() {
  const st = await getQueueState();
  for (const it of (await listQueue(st.channelId ?? "")).filter((i) => i.status === "waiting")) await patchItem(it.id, { wait_until: Date.now() });
  wake?.();
}

/** Al abrir la app: lo que quedó «en curso» vuelve a pendiente (su video se retoma donde iba) y, si la cola corría, sigue sola. */
export async function resumeQueueOnStartup() {
  await db.execute("UPDATE queue_items SET status='pending' WHERE status='running'").catch(() => undefined);
  const st = await getQueueState();
  if (!st.running || !st.channelId) return;
  await log("info", "cola", "La cola sigue donde iba.", "", null, false);
  await proc.keepAwake(true);
  ensureLoop();
}

function ensureLoop() {
  if (loop) { wake?.(); return; }
  loop = runLoop().catch(async (e) => { await notify("La cola se detuvo por un error inesperado.", e instanceof Error ? e.message : String(e), null, "error"); await setQueueState({ running: false, note: "Se detuvo por un error inesperado: pulsa «Reanudar»." }); })
    .finally(() => { loop = null; void getQueueState().then((s) => { if (!s.running) void proc.keepAwake(false); }); emit("queue"); });
}

async function runLoop() {
  for (;;) {
    const st = await getQueueState();
    if (!st.running || !st.channelId) return;
    const items = await listQueue(st.channelId);
    const formats = runningFormats(st);
    const next = items.find((i) => isActive(i) && formats.includes(i.cfg.format));
    if (!next) {
      const done = items.filter((i) => i.status === "done").length, bad = items.filter((i) => i.status === "failed" || i.status === "attention").length;
      await setQueueState({ running: false, note: `Cola terminada: ${done} video(s) listos para tu revisión${bad ? ` · ${bad} con problemas` : ""}.` });
      await notify(`Cola terminada: ${done} video(s) listos para tu revisión${bad ? `, ${bad} con problemas` : ""}.`);
      return;
    }
    if (next.status === "waiting" && next.wait_until && next.wait_until > Date.now()) { await sleepUntil(next.wait_until); continue; }
    const topics = await listTopics(st.channelId);
    const { problems } = checkItem(next, { topics, items });
    if (problems.length) { await patchItem(next.id, { status: "failed", error: problems.join(" "), finished_at: Date.now() }); continue; }
    const free = await fs.diskFree((await appPaths()).data).catch(() => Number.MAX_SAFE_INTEGER);
    if (free < DISK_MIN) {
      await setQueueState({ running: false, note: "En pausa: queda poco espacio en disco (menos de 6 GB). Libera espacio y pulsa «Reanudar»." });
      await notify("La cola se pausó: queda poco espacio en disco.", "Libera al menos 6 GB y pulsa «Reanudar».", null, "warn");
      return;
    }
    await runItem(next);
  }
}

async function runItem(it: QueueItem) {
  let v = it.video_id ? await getVideo(it.video_id) : null;
  if (it.video_id && (!v || v.status === "rejected" || v.status === "archived")) {
    await patchItem(it.id, { status: "skipped", error: "El video se rechazó o se borró.", finished_at: Date.now() });
    return;
  }
  await patchItem(it.id, { status: "running", error: null, wait_until: null, started_at: it.started_at ?? Date.now() });
  if (!v) {
    try { v = await videoForItem(it); await patchItem(it.id, { video_id: v.id }); }
    catch (e) { await settle(it, e); return; }
  }
  // Lo que falló antes se reintenta desde ese paso (lo ya hecho se conserva)
  const before = await getStages(v.id);
  for (const s of before.filter((x) => x.status === "failed")) await setStage(v.id, s.stage, { status: "pending", error: null });
  if (!reachedReview(v, before)) {
    runVideo(v.id);
    await waitIdle(v.id);
  }
  const fresh = await getVideo(v.id);
  const stages = await getStages(v.id);
  if (reachedReview(fresh, stages)) {
    await patchItem(it.id, { status: "done", error: null, finished_at: Date.now() });
    await notify(`Cola: «${fresh?.title ?? it.id}» listo para tu revisión.`, "", v.id);
    return;
  }
  if (!runningFormats(await getQueueState()).includes(it.cfg.format)) { await patchItem(it.id, { status: "pending" }); return; }
  const waiting = stages.find((s) => s.status === "review" && s.stage !== "final");
  if (waiting) {
    await patchItem(it.id, { status: "attention", error: waiting.progress || "Necesita tu atención en Producción.", finished_at: Date.now() });
    await notify(`Cola: «${fresh?.title}» necesita tu atención; sigo con el siguiente.`, waiting.progress ?? "", v.id, "warn");
    return;
  }
  const f = lastFailure(v.id);
  const failed = stages.find((s) => s.status === "failed");
  await settle(it, f?.error ?? new Error(failed?.error ?? "El video se detuvo sin terminar."));
}

/** Decide tras un fallo: esperar el límite, reintentar más tarde, pausar la cola o seguir con el siguiente. */
async function settle(it: QueueItem, e: unknown) {
  const kind = classifyFailure(e);
  const attempts = (it.attempts ?? 0) + (kind === "limit" ? 0 : 1);
  const msg = e instanceof UserError ? e.userMessage : e instanceof Error ? e.message : String(e);
  const next = nextAfterFailure(kind, attempts, Date.now(), e instanceof UsageLimitError ? e.resetAt : null);
  if (next.action === "wait") {
    const why = kind === "limit" ? `Límite del plan agotado: sigue sola ${hhmm(next.until)}.` : `${msg.slice(0, 200)} — reintento ${attempts} ${hhmm(next.until)}.`;
    await patchItem(it.id, { status: "waiting", attempts, wait_until: next.until, error: why });
    if (kind === "limit") await notify(`Se agotó el límite del plan. La cola sigue sola ${hhmm(next.until)}.`, "No cierres ATRIL; el equipo no se suspenderá mientras espera.", it.video_id, "warn");
    return;
  }
  if (next.action === "pause") {
    await patchItem(it.id, { status: "pending", attempts, error: msg });
    const note = kind === "disk" ? "En pausa: queda poco espacio en disco. Libera espacio y pulsa «Reanudar»." : `En pausa: ${msg} Arréglalo y pulsa «Reanudar».`;
    await setQueueState({ running: false, note });
    await notify("La cola se pausó.", note, it.video_id, "warn");
    return;
  }
  await patchItem(it.id, { status: "failed", attempts, error: msg, finished_at: Date.now() });
  await notify(`Cola: falló «${it.video_id ? (await getVideo(it.video_id))?.title ?? "un video" : "una tarjeta"}»; sigo con el siguiente.`, msg, it.video_id, "warn");
}

/** Resumen para la interfaz. */
export function queueSummary(items: QueueItem[]) {
  const n = (s: QueueStatus) => items.filter((i) => i.status === s).length;
  return { pending: n("pending") + n("waiting") + n("running"), done: n("done"), failed: n("failed"), attention: n("attention"), waitingUntil: items.find((i) => i.status === "waiting")?.wait_until ?? null };
}
