// Actividad en vivo de cada video: lo que la IA y el motor van haciendo,
// paso a paso (búsquedas, lecturas, imágenes encontradas, cuadros renderizados).
import { db } from "./ipc";
import { emit } from "./bus";
import { now } from "./util";

export type ActivityKind = "stage" | "search" | "fetch" | "read" | "think" | "text" | "asset" | "motion" | "render" | "audio" | "decision" | "usage" | "warn" | "done";

let pending = false;
function flush() { if (pending) return; pending = true; setTimeout(() => { pending = false; emit("activity"); }, 250); }

export async function activity(videoId: string | null | undefined, stage: string, kind: ActivityKind, title: string, detail = "", thumb: string | null = null) {
  if (!videoId) return;
  try {
    await db.execute("INSERT INTO activity(video_id,ts,stage,kind,title,detail,thumb) VALUES(?,?,?,?,?,?,?)",
      [videoId, now(), stage, kind, title.slice(0, 300), detail.slice(0, 2000), thumb]);
    flush();
  } catch { /* la actividad nunca debe romper el pipeline */ }
}

export async function listActivity(videoId: string, limit = 400) {
  const rows = await db.query<{ id: number; ts: number; stage: string; kind: ActivityKind; title: string; detail: string; thumb: string | null }>(
    "SELECT * FROM activity WHERE video_id=? ORDER BY id DESC LIMIT ?", [videoId, limit]);
  return rows.reverse();
}

// Vista previa en vivo (en memoria): último cuadro producido por el motor.
export interface LiveState { videoId: string; frame: string | null; caption: string; progress: number | null; playhead: number | null; ts: number }
const live = new Map<string, LiveState>();

export function setLive(videoId: string | null | undefined, patch: Partial<Omit<LiveState, "videoId">>) {
  if (!videoId) return;
  const cur = live.get(videoId) ?? { videoId, frame: null, caption: "", progress: null, playhead: null, ts: 0 };
  live.set(videoId, { ...cur, ...patch, ts: now() });
  emit("live");
}

export const getLive = (videoId: string) => live.get(videoId) ?? null;
