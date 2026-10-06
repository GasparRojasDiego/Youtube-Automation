// Registro de eventos y avisos visibles. Ningún fallo debe ser silencioso:
// todo error de un servicio externo pasa por aquí y aparece en la campana.
import { db } from "./ipc";
import { emit } from "./bus";
import { now } from "./util";

export type Level = "info" | "success" | "warn" | "error";

export interface Toast { id: number; level: Level; title: string; detail?: string; action?: { label: string; run: () => void } }
type ToastListener = (t: Toast) => void;
const toastListeners = new Set<ToastListener>();
let toastSeq = 1;

export function onToast(fn: ToastListener): () => void { toastListeners.add(fn); return () => { toastListeners.delete(fn); }; }

export function toast(level: Level, title: string, detail?: string, action?: Toast["action"]) {
  const t = { id: toastSeq++, level, title, detail, action };
  toastListeners.forEach((fn) => fn(t));
}

/** Error con mensaje para el usuario (español) y detalle técnico aparte. */
export class UserError extends Error {
  constructor(public userMessage: string, public detail = "", public source = "app", public retryable = true) {
    super(userMessage);
  }
}

export async function log(level: Level, source: string, message: string, detail = "", videoId: string | null = null, notify = level === "error" || level === "warn") {
  try {
    await db.execute("INSERT INTO events(ts,level,source,message,detail,video_id,read) VALUES(?,?,?,?,?,?,?)",
      [now(), level, source, message, detail.slice(0, 20000), videoId, notify ? 0 : 1]);
    emit("events");
  } catch (e) {
    console.error("No se pudo registrar el evento", e);
  }
  if (notify) toast(level, message, detail ? detail.slice(0, 300) : undefined);
}

export function errorText(e: unknown): { message: string; detail: string; source: string } {
  if (e instanceof UserError) return { message: e.userMessage, detail: e.detail, source: e.source };
  if (e instanceof Error) return { message: e.message, detail: e.stack ?? "", source: "app" };
  return { message: String(e), detail: "", source: "app" };
}

export async function logError(e: unknown, videoId: string | null = null, prefix = "") {
  const { message, detail, source } = errorText(e);
  await log("error", source, prefix ? `${prefix}: ${message}` : message, detail, videoId);
}

export async function unreadCount(): Promise<number> {
  const r = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE read=0");
  return r[0]?.n ?? 0;
}

export async function markAllRead() {
  await db.execute("UPDATE events SET read=1 WHERE read=0");
  emit("events");
}
