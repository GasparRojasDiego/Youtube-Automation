// Registro de eventos y avisos visibles. Ningún fallo debe ser silencioso:
// todo error pasa por aquí, se avisa al momento y queda en el informe de Ajustes.
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

/**
 * Quita claves y tokens de cualquier texto que vaya a registros o informes:
 * parámetros key/token de las URLs, cabeceras Bearer y formatos conocidos de
 * claves (Google, OpenAI, GitHub…). Así un informe copiado nunca las expone.
 */
export function redact(text: string): string {
  return text
    .replace(/([?&](?:key|api_key|apikey|token|access_token|refresh_token|client_secret|code)=)[^&\s"'<>)]+/gi, "$1•••")
    .replace(/(Bearer|Token)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 •••")
    .replace(/("?(?:x-goog-api-key|xi-api-key|authorization|refresh_token|client_secret|access_token)"?\s*[:=]\s*"?)[^",\s}]{6,}/gi, "$1•••")
    .replace(/\b(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|ya29\.[0-9A-Za-z_-]{20,}|1\/\/[0-9A-Za-z_-]{20,})/g, "•••");
}

export async function log(level: Level, source: string, message: string, detail = "", videoId: string | null = null, notify = level === "error" || level === "warn") {
  message = redact(message); detail = redact(detail);
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

