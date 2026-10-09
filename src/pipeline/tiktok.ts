// TikTok: divide un video terminado en partes de ~1:30 (cortando en la pausa
// entre frases más cercana), las pasa a vertical 9:16 y las guarda en
// Descargas/<título>/parte 1.mp4 … parte final.mp4.
import { fs, appPaths, resourcePath } from "../lib/ipc";
import { updateVideo, getStages, type Video } from "../lib/repo";
import { skillParams, MONTAGE_DEFAULTS } from "../lib/skills";
import { claudeRun } from "../providers/claude";
import { ffmpeg } from "../providers/ffmpeg";
import { joinPath } from "../lib/util";
import { segInfos, segmentOffsets } from "./timeline";
import { obj, arr, str } from "./prompts";
import type { ScriptOut, VoiceOut, PackageOut, RenderOut } from "./types";

export interface Part { start: number; end: number }
export interface TikTokData { parts: Part[]; hashtags: string[]; caption: string; vertical: boolean; label: boolean; exportedTo?: string; exportedAt?: number }

/**
 * Cortes cada `target` s; cada corte se mueve a la pausa más cercana (±`snap` s).
 * Si la última parte dura menos de `target`, se une a la anterior.
 */
export function splitPlan(total: number, pauses: number[], target = 90, snap = 6): Part[] {
  if (total <= target) return [{ start: 0, end: total }];
  const cuts: number[] = [];
  let t = 0;
  while (total - t > target) {
    const ideal = t + target;
    const near = pauses.filter((p) => p > t + target / 2 && p < total && Math.abs(p - ideal) <= snap).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
    const c = Math.round((near ?? ideal) * 100) / 100;
    cuts.push(c); t = c;
  }
  if (cuts.length && total - cuts[cuts.length - 1] < target) cuts.pop();
  const edges = [0, ...cuts, total];
  return edges.slice(0, -1).map((s, i) => ({ start: s, end: Math.round(edges[i + 1] * 100) / 100 }));
}

/** Nombre de archivo de cada parte. */
export const partName = (i: number, n: number) => (n > 1 && i === n - 1 ? "parte final" : `parte ${i + 1}`);

/** Pausas entre frases (segundos globales del video final). */
export async function sentencePauses(v: Video): Promise<number[]> {
  const st = await getStages(v.id);
  const script = st.find((s) => s.stage === "script")?.output as ScriptOut | undefined;
  const voice = st.find((s) => s.stage === "voice")?.output as VoiceOut | undefined;
  if (!script || !voice) return [];
  const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
  const segs = segInfos(script, voice);
  const off = segmentOffsets(segs, montage.pauseBetweenSegments);
  const out: number[] = [];
  for (const s of segs) {
    for (let i = 0; i < s.spans.length; i++) {
      const next = s.spans[i + 1];
      out.push(off[s.id] + (next ? (s.spans[i].end + next.start) / 2 : s.narration + montage.pauseBetweenSegments / 2));
    }
  }
  return out;
}

export async function planParts(v: Video): Promise<Part[]> {
  const render = (await getStages(v.id)).find((s) => s.stage === "render")?.output as RenderOut | undefined;
  if (!render) throw new Error("El video aún no está montado.");
  return splitPlan(render.duration, await sentencePauses(v));
}

const HASHTAG_SCHEMA = obj({ hashtags: arr(str("Hashtag starting with #, no spaces"), "5-8 hashtags: 2-3 broad + the rest specific to the topic"), caption_en: str("Short TikTok caption (max 120 characters) that hooks the viewer") });

/** Hashtags y texto sugerido para publicar en TikTok (Sonnet, barato). */
export async function suggestHashtags(v: Video): Promise<{ hashtags: string[]; caption: string }> {
  const pkg = (await getStages(v.id)).find((s) => s.stage === "package")?.output as PackageOut | undefined;
  const fallback = () => ({ hashtags: ["#fyp", "#history", ...(pkg?.tags ?? []).slice(0, 5).map((t) => `#${t.replace(/[^a-z0-9]/gi, "")}`)].filter((t) => t.length > 2), caption: v.title });
  try {
    const r = await claudeRun<{ hashtags: string[]; caption_en: string }>({
      stage: "package", label: "Hashtags de TikTok", system: "You are a TikTok growth expert for educational/storytelling content in English (US audience).", schema: HASHTAG_SCHEMA, quiet: true,
      prompt: `Suggest hashtags and a caption for a multi-part TikTok series cut from this YouTube video.\nTitle: ${pkg?.chosen_title ?? v.title}\nDescription: ${(pkg?.description_body_en ?? "").slice(0, 800)}\nTags: ${(pkg?.tags ?? []).join(", ")}`,
      videoId: v.id, channelId: v.channel_id,
    });
    const tags = (r.data.hashtags ?? []).map((t) => `#${t.replace(/^#/, "").replace(/\s+/g, "")}`).filter((t) => t.length > 2).slice(0, 8);
    return tags.length ? { hashtags: tags, caption: r.data.caption_en || v.title } : fallback();
  } catch { return fallback(); }
}

export async function saveTikTok(v: Video, data: TikTokData) {
  await updateVideo(v.id, { data: { tiktok: data } });
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "video";

/** Argumentos de ffmpeg de una parte (vertical con fondo desenfocado, o tal cual). */
export function partArgs(o: { input: string; start: number; dur: number; out: string; vertical: boolean; label: string | null; font: string }): string[] {
  const head = ["-y", "-hide_banner", "-loglevel", "error", "-ss", o.start.toFixed(3), "-t", o.dur.toFixed(3), "-i", o.input];
  const enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", o.out];
  const text = o.label ? `,drawtext=fontfile=${o.font}:text='${o.label.replace(/'/g, "")}':x=(w-tw)/2:y=${o.vertical ? 250 : 60}:fontsize=${o.vertical ? 76 : 54}:fontcolor=white:borderw=5:bordercolor=black@0.55` : "";
  if (!o.vertical) return [...head, ...(text ? ["-vf", text.slice(1)] : []), ...enc];
  const f = `[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.10:saturation=1.1[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2${text}[v]`;
  return [...head, "-filter_complex", f, "-map", "[v]", "-map", "0:a?", ...enc];
}

/** Exporta las partes a Descargas/<título>/. Devuelve la carpeta. */
export async function exportParts(v: Video, data: TikTokData, onProgress: (text: string) => void): Promise<string> {
  const render = (await getStages(v.id)).find((s) => s.stage === "render")?.output as RenderOut | undefined;
  if (!render || !(await fs.exists(render.file))) throw new Error("No encuentro el video final.");
  const dir = joinPath((await appPaths()).downloads, safeName(v.title));
  await fs.mkdir(dir);
  const font = "_fuente.ttf";
  await fs.copy(joinPath(await resourcePath("fonts"), "Poppins-Bold.ttf"), joinPath(dir, font));
  const n = data.parts.length;
  try {
    for (const [i, p] of data.parts.entries()) {
      const name = partName(i, n);
      onProgress(`Exportando ${name} (${i + 1}/${n})…`);
      const label = data.label && n > 1 ? (i === n - 1 ? "Parte final" : `Parte ${i + 1}`) : null;
      await ffmpeg(partArgs({ input: render.file, start: p.start, dur: p.end - p.start, out: `${name}.mp4`, vertical: data.vertical, label, font }), {
        cwd: dir, timeoutS: 1800,
        onSeconds: (sec) => onProgress(`Exportando ${name} (${i + 1}/${n}) · ${Math.min(100, Math.round((sec / (p.end - p.start)) * 100))} %`),
      });
    }
  } finally { await fs.remove(joinPath(dir, font)).catch(() => null); }
  await saveTikTok(v, { ...data, exportedTo: dir, exportedAt: Date.now() });
  return dir;
}
