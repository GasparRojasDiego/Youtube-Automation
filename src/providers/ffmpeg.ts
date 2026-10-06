// Ejecución de ffmpeg/ffprobe (incluidos con la app como binarios auxiliares).
import { proc } from "../lib/ipc";
import { getSettings } from "../lib/settings";
import { UserError } from "../lib/events";
import { uid } from "../lib/util";
import { parseProgressSeconds, type EncoderSpec } from "../pipeline/montage";

async function bin(name: "ffmpeg" | "ffprobe"): Promise<string> {
  const s = getSettings().ffmpeg;
  const custom = name === "ffmpeg" ? s.path : s.ffprobePath;
  const found = await proc.which(custom || name);
  if (!found) throw new UserError(`No encuentro ${name}.`, "Reinstala ATRIL (lo incluye) o indica su ruta en Ajustes → Montaje.", "ffmpeg", false);
  return found;
}

export async function ffmpeg(args: string[], opts: { jobId?: string; onSeconds?: (s: number) => void; timeoutS?: number } = {}): Promise<void> {
  const id = opts.jobId ?? uid("ff_");
  let off: (() => void) | null = null;
  if (opts.onSeconds) off = await proc.onLine((e) => { if (e.id === id) { const s = parseProgressSeconds(e.line); if (s != null) opts.onSeconds!(s); } });
  try {
    const r = await proc.run({ id, program: await bin("ffmpeg"), args, stream: !!opts.onSeconds, timeoutS: opts.timeoutS ?? 6 * 3600 });
    if (r.code !== 0) {
      const tail = r.stderr.split("\n").filter((l) => l.trim()).slice(-12).join("\n");
      throw new UserError(`ffmpeg falló (código ${r.code}).`, tail, "ffmpeg");
    }
  } finally { off?.(); }
}

export async function probeDuration(file: string): Promise<number> {
  const r = await proc.run({ id: uid("fp_"), program: await bin("ffprobe"), args: ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], timeoutS: 60 });
  const d = Number(r.stdout.trim());
  if (r.code !== 0 || !isFinite(d)) throw new UserError(`No se pudo leer la duración de ${file}.`, r.stderr.slice(-500), "ffmpeg");
  return d;
}

export async function ffmpegVersion(): Promise<string | null> {
  try {
    const r = await proc.run({ id: uid("fv_"), program: await bin("ffmpeg"), args: ["-hide_banner", "-version"], timeoutS: 30 });
    return r.code === 0 ? r.stdout.split("\n")[0] : null;
  } catch { return null; }
}

let encoderCache: EncoderSpec["name"] | null = null;

/** Elige el codificador: Intel Quick Sync si funciona; si no, Media Foundation o x264. */
export async function pickEncoder(): Promise<EncoderSpec> {
  const s = getSettings().ffmpeg;
  if (s.encoder !== "auto") return { name: s.encoder, quality: s.quality };
  if (encoderCache) return { name: encoderCache, quality: s.quality };
  const exe = await bin("ffmpeg");
  for (const name of ["h264_qsv", "libx264", "h264_mf"] as const) {
    const r = await proc.run({ id: uid("fe_"), program: exe, timeoutS: 60,
      args: ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=1:r=30", "-pix_fmt", "yuv420p", "-c:v", name, "-f", "null", "-"] });
    if (r.code === 0) { encoderCache = name; break; }
  }
  if (!encoderCache) throw new UserError("Ningún codificador H.264 funcionó en este equipo.", "Revisa Diagnóstico.", "ffmpeg", false);
  return { name: encoderCache, quality: s.quality };
}
