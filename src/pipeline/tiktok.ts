// TikTok y descargas: cada video terminado se copia solo a Descargas; «Recortar»
// lo parte en piezas de ~1:30 sin recodificar (copia directa, segundos), con cada
// corte en un fotograma clave que cae, si es posible, en la pausa entre dos frases.
import { fs, appPaths } from "../lib/ipc";
import { UserError } from "../lib/events";
import { updateVideo, getStages, getVideo, type Video } from "../lib/repo";
import { skillParams, MONTAGE_DEFAULTS } from "../lib/skills";
import { ffmpeg } from "../providers/ffmpeg";
import { joinPath } from "../lib/util";
import { getSettings } from "../lib/settings";
import { pickEncoder, probeMedia } from "../providers/ffmpeg";
import { encoderArgs } from "./montage";
import { segInfos, segmentOffsets } from "./timeline";
import type { ScriptOut, VoiceOut, PackageOut, RenderOut } from "./types";

export interface Part { start: number; end: number }
export interface TikTokData { parts: Part[]; exportedTo?: string; exportedAt?: number }
type Pause = number | { start: number; end: number };

const mid = (p: Pause) => (typeof p === "number" ? p : (p.start + p.end) / 2);
const inside = (t: number, p: Pause, tol = 0.05) => (typeof p === "number" ? Math.abs(t - p) <= tol : t >= p.start - tol && t <= p.end + tol);

/**
 * Cortes cada `target` s. Sin fotogramas clave, el corte va a la pausa más
 * cercana (±`snap` s). Con fotogramas clave (copia sin recodificar), el corte
 * es un fotograma clave: primero uno dentro de una pausa, luego el más cercano
 * a una pausa, y si no hay, el más cercano al punto ideal. Si la última parte
 * dura menos de `target`, se une a la anterior.
 */
export function splitPlan(total: number, pauses: Pause[], keys?: number[] | null, target = 90, snap = 8): Part[] {
  if (total <= target) return [{ start: 0, end: total }];
  const cuts: number[] = [];
  let t = 0;
  const pick = (ideal: number, lo: number): number => {
    if (!keys?.length) {
      const near = pauses.map(mid).filter((p) => p > lo && p < total && Math.abs(p - ideal) <= snap).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
      return near ?? ideal;
    }
    for (const w of [snap, snap * 2]) {
      const cand = keys.filter((k) => k > lo && k < total - 1 && Math.abs(k - ideal) <= w);
      if (!cand.length) continue;
      const byIdeal = (a: number, b: number) => Math.abs(a - ideal) - Math.abs(b - ideal);
      const inPause = cand.filter((k) => pauses.some((p) => inside(k, p))).sort(byIdeal)[0];
      if (inPause != null) return inPause;
      const dist = (k: number) => Math.min(...pauses.map((p) => Math.abs(k - mid(p))), Infinity);
      return [...cand].sort((a, b) => dist(a) - dist(b) || byIdeal(a, b))[0];
    }
    return ideal;
  };
  while (total - t > target) {
    const c = Math.round(pick(t + target, t + target / 2) * 1000) / 1000;
    cuts.push(c); t = c;
  }
  if (cuts.length && total - cuts[cuts.length - 1] < target) cuts.pop();
  const edges = [0, ...cuts, total];
  return edges.slice(0, -1).map((s, i) => ({ start: s, end: Math.round(edges[i + 1] * 1000) / 1000 }));
}

/** Nombre de archivo de cada parte. */
export const partName = (i: number, n: number) => (n > 1 && i === n - 1 ? "parte final" : `parte ${i + 1}`);

/** Pausas entre frases y entre segmentos (segundos globales del video final). */
export async function pauseIntervals(v: Video): Promise<{ start: number; end: number }[]> {
  const st = await getStages(v.id);
  const script = st.find((s) => s.stage === "script")?.output as ScriptOut | undefined;
  const voice = st.find((s) => s.stage === "voice")?.output as VoiceOut | undefined;
  if (!script || !voice) return [];
  const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
  const segs = segInfos(script, voice);
  const off = segmentOffsets(segs, montage.pauseBetweenSegments);
  const out: { start: number; end: number }[] = [];
  for (const s of segs) {
    for (let i = 0; i < s.spans.length; i++) {
      const next = s.spans[i + 1];
      out.push(next ? { start: off[s.id] + s.spans[i].end, end: off[s.id] + next.start } : { start: off[s.id] + s.spans[i].end, end: off[s.id] + s.narration + montage.pauseBetweenSegments });
    }
  }
  return out;
}

/** Tiempos de los fotogramas clave (solo se decodifican esos: unos segundos). */
export async function keyframes(file: string): Promise<number[]> {
  const log = await ffmpeg(["-hide_banner", "-nostats", "-skip_frame", "nokey", "-i", file, "-map", "0:v:0", "-vf", "showinfo", "-f", "null", "-"], { timeoutS: 600 });
  return [...log.matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter((x) => isFinite(x)).sort((a, b) => a - b);
}

/**
 * Texto para TikTok en una sola pieza lista para pegar: «Descripción #a #b #c #d #e».
 * La descripción invita a ver el video completo en el canal de YouTube; como mucho 5 hashtags.
 */
export function tiktokText(v: Video, pkg?: PackageOut | null, lang = (getSettings().publishing.defaultLanguage || "en").slice(0, 2)): { text: string; caption: string; hashtags: string[] } {
  const tag = (t: string) => `#${t.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "")}`;
  const fromPkg = (pkg?.tiktok_hashtags ?? []).map(tag).filter((t) => t.length > 2);
  const pool = fromPkg.length ? fromPkg : ["#fyp", ...(pkg?.tags ?? []).slice(0, 6).map(tag)];
  const hashtags = pool.filter((t, i, a) => t.length > 2 && a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i).slice(0, 5);
  const first = (pkg?.description_body_en ?? "").split(/(?<=[.!?])\s/)[0] ?? "";
  const caption = (pkg?.tiktok_caption_en || (first.length > 20 && first.length <= 150 ? first : pkg?.chosen_title || v.title)).replace(/\s+/g, " ").trim();
  const cta = lang === "es" ? "🎬 Mira el video completo en mi canal de YouTube: el enlace está en la descripción de mi perfil." : "🎬 Watch the whole video on my YouTube channel — link in my profile description.";
  return { text: `${caption} ${cta} ${hashtags.join(" ")}`.trim(), caption, hashtags };
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "video";

async function finished(v: Video): Promise<{ render: RenderOut; title: string }> {
  const st = await getStages(v.id);
  const render = st.find((s) => s.stage === "render")?.output as RenderOut | undefined;
  if (!render || !(await fs.exists(render.file))) throw new Error("No encuentro el video final: vuelve a ejecutar el montaje.");
  const pkg = st.find((s) => s.stage === "package")?.output as PackageOut | undefined;
  return { render, title: pkg?.chosen_title || v.title };
}

/** Un archivo abierto en otro programa (reproductor, vista previa del Explorador) no se puede reemplazar ni borrar. */
const inUse = (e: unknown) => /os error (32|33|1224)|being used|utilizado por otro proceso|sección asignada/i.test(String((e as Error)?.message ?? e));
const busyError = (what: string) => new UserError(`No se pudo escribir ${what}: está abierto en otro programa.`, "Cierra el video o sus partes en tu reproductor (o la vista previa del Explorador) y vuelve a intentar.", "TikTok", false);

/** Copia el video terminado a Descargas (lo reemplaza si ya estaba; si está abierto, usa otro nombre). */
export async function downloadVideo(v: Video): Promise<string> {
  const { render, title } = await finished(v);
  const dir = (await appPaths()).downloads;
  for (let n = 1; n <= 5; n++) {
    const dest = joinPath(dir, `${safeName(title)}${n > 1 ? ` (${n})` : ""}.mp4`);
    try {
      await fs.copy(render.file, dest);
      await updateVideo(v.id, { data: { download: dest } });
      return dest;
    } catch (e) { if (!inUse(e)) throw e; }
  }
  throw busyError("el video en Descargas");
}

/** El video en Descargas; si se borró, se vuelve a descargar. */
export async function ensureDownloaded(v: Video): Promise<string> {
  const fresh = (await getVideo(v.id)) ?? v;
  const p = fresh.data.download as string | undefined;
  return p && (await fs.exists(p)) ? p : downloadVideo(fresh);
}

/** Recorta el video descargado en partes de ~1:30 dentro de Descargas/<título>/. Devuelve la carpeta. */
export async function cutParts(v: Video, onProgress: (text: string) => void): Promise<string> {
  const src = await ensureDownloaded(v);
  const { render, title } = await finished(v);
  onProgress("Buscando los puntos de corte…");
  const keys = await keyframes(src).catch(() => null);
  const parts = splitPlan(render.duration, await pauseIntervals(v), keys);
  // Las partes anteriores se reemplazan; si alguna está abierta en otro programa, se recorta en una carpeta nueva
  let dir = "";
  for (let n = 1; n <= 5 && !dir; n++) {
    const d = joinPath((await appPaths()).downloads, `${safeName(title)}${n > 1 ? ` (${n})` : ""}`);
    await fs.mkdir(d);
    try { for (const f of await fs.list(d)) if (/^parte .+\.mp4$/i.test(f.name)) await fs.remove(f.path); dir = d; }
    catch (e) { if (!inUse(e)) throw e; }
  }
  if (!dir) throw busyError("las partes en Descargas");
  // Portada propia de TikTok: cada parte empieza con ella (3 cuadros), así todas comparten la misma portada.
  // Eso obliga a recodificar el video de cada parte; sin portada, se copia sin recodificar (segundos).
  const pkg = (await getStages(v.id)).find((x) => x.stage === "package")?.output as PackageOut | undefined;
  const cover = pkg?.tiktok_cover && (await fs.exists(pkg.tiktok_cover)) ? pkg.tiktok_cover : null;
  const enc = cover ? encoderArgs(await pickEncoder()) : [];
  const dim = cover ? await probeMedia(src).catch(() => null) : null;
  const W = dim?.width || 1920, H = dim?.height || 1080;
  for (const [i, p] of parts.entries()) {
    const name = `${partName(i, parts.length)}.mp4`;
    onProgress(`${cover ? "Preparando" : "Copiando"} ${partName(i, parts.length)} (${i + 1}/${parts.length})…`);
    if (cover) {
      await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", (i ? p.start : 0).toFixed(3), "-i", src, "-loop", "1", "-i", cover, "-t", (p.end - p.start).toFixed(3),
        "-filter_complex", `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[c];[0:v][c]overlay=0:0:enable='lt(n\\,3)':shortest=1,format=yuv420p[out]`,
        "-map", "[out]", "-map", "0:a:0?", ...enc, "-c:a", "copy", "-movflags", "+faststart", name], { cwd: dir, timeoutS: 1800 });
    } else {
      // Copia directa: entra en el fotograma clave del corte y no recodifica nada
      await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", (i ? p.start + 0.02 : 0).toFixed(3), "-i", src, "-t", (p.end - p.start).toFixed(3),
        "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", name], { cwd: dir, timeoutS: 600 });
    }
  }
  const data: TikTokData = { parts, exportedTo: dir, exportedAt: Date.now() };
  await updateVideo(v.id, { data: { tiktok: data } });
  return dir;
}
