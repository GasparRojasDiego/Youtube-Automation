// Portadas propias (YouTube y TikTok): se guardan tal cual las sube el usuario y se usan sin tocarlas:
// miniatura de YouTube, portada incrustada en cada MP4 que llega a Descargas (la que muestran el
// Explorador de Windows y los reproductores) y primeros cuadros de las partes y videos verticales o
// personales (la que toman TikTok y las galerías del teléfono).
import { fs } from "../lib/ipc";
import { getVideo, updateVideo, type Video } from "../lib/repo";
import { joinPath, extName } from "../lib/util";
import { ffmpeg, pickEncoder, probeMedia } from "../providers/ffmpeg";
import { encoderArgs } from "./montage";

export type CoverKind = "youtube" | "tiktok";
export const COVER_EXT = ["jpg", "jpeg", "png", "webp"];
export const COVER_LABEL: Record<CoverKind, string> = { youtube: "Portada de YouTube (16:9)", tiktok: "Portada de TikTok (9:16)" };
const KEEP = new Set(["jpg", "jpeg", "png"]);

/** Portadas guardadas del video (con la de TikTok anterior a la 2.5.8 como respaldo). */
export function coversOf(v: Pick<Video, "data">, pkg?: { tiktok_cover?: string | null } | null): Partial<Record<CoverKind, string>> {
  const c = (v.data?.covers ?? {}) as Partial<Record<CoverKind, string>>;
  return { ...(pkg?.tiktok_cover ? { tiktok: pkg.tiktok_cover } : {}), ...c };
}

/**
 * Guarda la portada tal cual (mismos bytes). Solo una WebP se convierte, sin pérdida, a PNG (los MP4
 * solo admiten JPEG o PNG como portada). Devuelve la ruta guardada.
 */
export async function saveCover(v: Pick<Video, "id" | "dir">, kind: CoverKind, src: string): Promise<string> {
  const ext = extName(src).toLowerCase();
  if (!COVER_EXT.includes(ext)) throw new Error(`Formato de portada no admitido (.${ext}). Usa JPG, PNG o WebP.`);
  const dir = joinPath(v.dir, "portadas");
  await fs.mkdir(dir);
  for (const e of await fs.list(dir).catch(() => [])) if (e.name.startsWith(`${kind}.`)) await fs.remove(e.path).catch(() => undefined);
  const dst = joinPath(dir, `${kind}.${KEEP.has(ext) ? (ext === "jpeg" ? "jpg" : ext) : "png"}`);
  if (KEEP.has(ext)) await fs.copy(src, dst);
  else await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-frames:v", "1", "-c:v", "png", dst]);
  const fresh = await getVideo(v.id);
  await updateVideo(v.id, { data: { covers: { ...((fresh?.data?.covers ?? {}) as object), [kind]: dst } } });
  return dst;
}

export async function removeCover(v: Pick<Video, "id">, kind: CoverKind) {
  const fresh = await getVideo(v.id);
  const c = { ...((fresh?.data?.covers ?? {}) as Record<string, string>) };
  if (c[kind]) await fs.remove(c[kind]).catch(() => undefined);
  delete c[kind];
  await updateVideo(v.id, { data: { covers: c } });
}

/** La portada que corresponde a un archivo según su forma (vertical → TikTok; horizontal → YouTube), o la otra si falta. */
export async function coverForShape(covers: Partial<Record<CoverKind, string>>, vertical: boolean): Promise<string | null> {
  const order: CoverKind[] = vertical ? ["tiktok", "youtube"] : ["youtube", "tiktok"];
  for (const k of order) if (covers[k] && (await fs.exists(covers[k]!).catch(() => false))) return covers[k]!;
  return null;
}

/** Miniatura para la API de YouTube (JPEG o PNG de hasta 2 MB): el original si cumple; si no, una copia que cumpla. */
export async function youtubeThumbFile(path: string): Promise<string> {
  const ext = extName(path).toLowerCase();
  const size = await fs.size(path).catch(() => 0);
  if ((ext === "jpg" || ext === "jpeg" || ext === "png") && size > 0 && size <= 2 * 1024 * 1024) return path;
  const out = path.replace(/\.\w+$/, "") + ".youtube.jpg";
  for (const [w, q] of [[0, 2], [1920, 3], [1280, 4]] as const) {
    await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", path, "-frames:v", "1", ...(w ? ["-vf", `scale='min(${w},iw)':-2`] : []), "-q:v", String(q), out]);
    if ((await fs.size(out).catch(() => Infinity)) <= 2 * 1024 * 1024) return out;
  }
  return out;
}

/** Filtro: la portada cubre el cuadro (si tiene su misma forma, coincide al píxel); si no, entera sobre un fondo desenfocado de sí misma. */
export function coverFilter(W: number, H: number, coverW: number, coverH: number, input = "[1:v]"): string {
  const same = coverW > 0 && coverH > 0 && Math.abs(coverW / coverH - W / H) < 0.02;
  return same
    ? `${input}scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p[cov]`
    : `${input}split[cA][cB];[cA]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:3,eq=brightness=-0.08[cbg];` +
      `[cB]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos[cfg];[cbg][cfg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[cov]`;
}

/**
 * Copia `src` en `dst` con la portada incrustada (mismos bytes que la subida). Con `firstFrames`, además
 * los 3 primeros cuadros muestran la portada (eso obliga a recodificar el video; el audio se copia).
 */
export async function withCover(src: string, dst: string, cover: string, o: { firstFrames: boolean; cwd?: string; jobId?: string }): Promise<string> {
  await fs.mkdir(dst.replace(/[\\/][^\\/]+$/, ""));
  if (!o.firstFrames) {
    await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-i", cover, "-map", "0:v:0", "-map", "0:a:0?", "-map", "1:v:0",
      "-c", "copy", "-disposition:v:0", "default", "-disposition:v:1", "attached_pic", "-movflags", "+faststart", dst], { cwd: o.cwd, jobId: o.jobId, timeoutS: 1800 });
    return dst;
  }
  const [vi, ci] = await Promise.all([probeMedia(src), probeMedia(cover)]);
  const W = vi.width || 1920, H = vi.height || 1080;
  // Las opciones del codificador solo van al video principal (la portada incrustada se copia tal cual)
  const enc = encoderArgs(await pickEncoder()).map((a, i) => (i % 2 === 0 && a.startsWith("-") ? (a.includes(":") ? a.replace(/:v$/, ":v:0") : `${a}:v:0`) : a));
  await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-loop", "1", "-i", cover, "-i", cover,
    "-filter_complex", `${coverFilter(W, H, ci.width, ci.height)};[0:v][cov]overlay=0:0:enable='lt(n\\,3)':shortest=1,format=yuv420p[out]`,
    "-map", "[out]", "-map", "0:a:0?", "-map", "2:v:0", ...enc, "-c:v:1", "copy", "-c:a", "copy",
    "-disposition:v:0", "default", "-disposition:v:1", "attached_pic", "-movflags", "+faststart", dst], { cwd: o.cwd, jobId: o.jobId, timeoutS: 3600 });
  return dst;
}
