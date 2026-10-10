// Ejecución de ffmpeg (incluido con la app como binario auxiliar; también mide duraciones).
import { proc, fs, appPaths, media } from "../lib/ipc";
import { getSettings } from "../lib/settings";
import { UserError } from "../lib/events";
import { uid, joinPath } from "../lib/util";
import { parseProgressSeconds, type EncoderSpec } from "../pipeline/montage";

async function bin(): Promise<string> {
  const found = await proc.which(getSettings().ffmpeg.path || "ffmpeg");
  if (!found) throw new UserError("No encuentro ffmpeg.", "Reinstala ATRIL (lo incluye) o indica su ruta en Ajustes → Montaje.", "ffmpeg", false);
  return found;
}

export async function ffmpeg(args: string[], opts: { jobId?: string; onSeconds?: (s: number) => void; timeoutS?: number; cwd?: string } = {}): Promise<string> {
  const id = opts.jobId ? `${opts.jobId}:${uid("f")}` : uid("ff_");
  let off: (() => void) | null = null;
  if (opts.onSeconds) off = await proc.onLine((e) => { if (e.id === id) { const s = parseProgressSeconds(e.line); if (s != null) opts.onSeconds!(s); } });
  try {
    const r = await proc.run({ id, program: await bin(), args, cwd: opts.cwd, stream: !!opts.onSeconds, timeoutS: opts.timeoutS ?? 6 * 3600 });
    if (r.code !== 0) {
      const tail = r.stderr.split("\n").filter((l) => l.trim()).slice(-12).join("\n");
      throw new UserError(`ffmpeg falló (código ${r.code}).`, tail, "ffmpeg");
    }
    return r.stderr;
  } finally { off?.(); }
}

export interface MediaInfo { width: number; height: number; duration: number; hasVideo: boolean; hasAudio: boolean; codec: string }

const DURATION = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/;
/** Cabecera que ffmpeg imprime al abrir un archivo (sin procesarlo): pistas, tamaño y duración. */
async function header(file: string): Promise<string> {
  const r = await proc.run({ id: uid("fp_"), program: await bin(), args: ["-hide_banner", "-i", file], timeoutS: 60 });
  if (!/Stream #/.test(r.stderr)) throw new UserError(`No se pudo leer ${file}.`, r.stderr.slice(-500), "ffmpeg");
  return r.stderr;
}
const secs = (m: RegExpMatchArray | null) => (m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0);

/** Dimensiones, duración y pistas de un archivo de imagen, video o audio. */
export async function probeMedia(file: string): Promise<MediaInfo> {
  const h = await header(file);
  const v = h.match(/Stream #[^\n]*?: Video: (\w+)[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
  return { width: Number(v?.[2] ?? 0), height: Number(v?.[3] ?? 0), duration: secs(h.match(DURATION)), hasVideo: !!v, hasAudio: /Stream #[^\n]*?: Audio:/.test(h), codec: v?.[1] ?? "" };
}

/** Duración en segundos: exacta para WAV (cabecera), al centésimo para lo demás. */
export async function probeDuration(file: string): Promise<number> {
  if (/\.wav$/i.test(file)) { try { return await media.wavDuration(file); } catch { /* se lee con ffmpeg */ } }
  const d = secs((await header(file)).match(DURATION));
  if (!(d > 0)) throw new UserError(`No se pudo leer la duración de ${file}.`, "", "ffmpeg");
  return d;
}

export async function ffmpegVersion(): Promise<string | null> {
  try {
    const r = await proc.run({ id: uid("fv_"), program: await bin(), args: ["-hide_banner", "-version"], timeoutS: 30 });
    return r.code === 0 ? r.stdout.split("\n")[0] : null;
  } catch { return null; }
}

let encoderCache: EncoderSpec["name"] | null = null;

/** Elige el codificador: Intel Quick Sync si funciona; si no, Media Foundation o x264. */
export async function pickEncoder(): Promise<EncoderSpec> {
  const s = getSettings().ffmpeg;
  if (s.encoder !== "auto") return { name: s.encoder, quality: s.quality };
  if (encoderCache) return { name: encoderCache, quality: s.quality };
  const exe = await bin();
  for (const name of ["h264_qsv", "libx264", "h264_mf"] as const) {
    const r = await proc.run({ id: uid("fe_"), program: exe, timeoutS: 60,
      args: ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=1:r=30", "-pix_fmt", "yuv420p", "-c:v", name, "-f", "null", "-"] });
    if (r.code === 0) { encoderCache = name; break; }
  }
  if (!encoderCache) throw new UserError("Ningún codificador H.264 funcionó en este equipo.", "Revisa Diagnóstico.", "ffmpeg", false);
  return { name: encoderCache, quality: s.quality };
}

let modernCache: boolean | null = null;

/** ¿Acepta ffmpeg «-/filter_complex archivo» (≥ 7)? Si no, se usa «-filter_complex_script». */
export async function filterScriptModern(): Promise<boolean> {
  if (modernCache != null) return modernCache;
  const exe = await bin();
  const tmp = joinPath((await appPaths()).data, "ffmpeg-prueba-filtro.txt");
  await fs.writeText(tmp, "[0:v]null[v]");
  const r = await proc.run({ id: uid("fs_"), program: exe, timeoutS: 30,
    args: ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "nullsrc=s=16x16:d=0.1", "-/filter_complex", tmp, "-map", "[v]", "-f", "null", "-"] });
  modernCache = r.code === 0;
  return modernCache;
}
