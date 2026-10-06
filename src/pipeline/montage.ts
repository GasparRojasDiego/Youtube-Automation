// Construcción de comandos ffmpeg para el montaje (funciones puras, probadas
// con ffmpeg real en montage.test.ts). Estrategia:
//   1) un clip de video por segmento (tomas con Ken Burns + rótulos + transiciones),
//      que permite re-renderizar solo el segmento que cambió;
//   2) unión de clips sin recodificar (concat);
//   3) mezcla final de narración + música con compresión lateral y normalización.
import type { MontageParams } from "../lib/skills";

export type Motion = "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "static";

export interface ShotSpec { image: string; dur: number; motion: Motion; overlay?: string | null }

export interface EncoderSpec { name: "libx264" | "h264_qsv" | "h264_mf"; quality: number }

export interface Frame { width: number; height: number; fps: number }
export const FRAME_1080: Frame = { width: 1920, height: 1080, fps: 30 };

export function encoderArgs(e: EncoderSpec): string[] {
  switch (e.name) {
    case "h264_qsv": return ["-c:v", "h264_qsv", "-preset", "medium", "-global_quality", String(e.quality), "-look_ahead", "0"];
    case "h264_mf": return ["-c:v", "h264_mf", "-rate_control", "quality", "-quality", String(Math.max(40, 100 - e.quality * 2)), "-b:v", "10M"];
    default: return ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(e.quality), "-profile:v", "high"];
  }
}

/** Redondea duraciones a fotogramas exactos conservando el total. */
export function quantize(durs: number[], fps: number): number[] {
  const totalFrames = Math.round(durs.reduce((a, b) => a + b, 0) * fps);
  const frames = durs.map((d) => Math.max(1, Math.round(d * fps)));
  const diff = totalFrames - frames.reduce((a, b) => a + b, 0);
  frames[frames.length - 1] = Math.max(1, frames[frames.length - 1] + diff);
  return frames.map((f) => f / fps);
}

const num = (n: number) => (Math.round(n * 1000) / 1000).toString();

export function motionExpr(m: Motion, amount: number, frames: number): { z: string; x: string; y: string } {
  const p = `((1-cos(PI*on/${frames}))/2)`; // aceleración suave
  const center = { x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" };
  const a = num(amount);
  switch (m) {
    case "zoom_in": return { z: `1+${a}*${p}`, ...center };
    case "zoom_out": return { z: `1+${a}*(1-${p})`, ...center };
    case "pan_left": return { z: `1+${a}`, x: `(iw-iw/zoom)*${p}`, y: center.y };
    case "pan_right": return { z: `1+${a}`, x: `(iw-iw/zoom)*(1-${p})`, y: center.y };
    default: return { z: "1", x: "0", y: "0" };
  }
}

export interface SegmentClip {
  shots: ShotSpec[]; out: string; fadeIn: boolean; fadeOut: boolean;
  params: Pick<MontageParams, "transition" | "transitionSeconds" | "kenBurns">;
  frame?: Frame; encoder: EncoderSpec; upscale?: number;
}

/** Argumentos de ffmpeg para renderizar el clip (solo video) de un segmento. */
export function segmentClipArgs(c: SegmentClip): string[] {
  const f = c.frame ?? FRAME_1080;
  const n = c.shots.length;
  if (!n) throw new Error("Segmento sin tomas");
  const useXfade = c.params.transition !== "cut" && n > 1;
  const durs = quantize(c.shots.map((s) => s.dur), f.fps);
  const minDur = Math.min(...durs);
  const T = useXfade ? Math.min(c.params.transitionSeconds, minDur * 0.45) : 0;
  const up = c.upscale ?? 1.5;
  const W2 = Math.round((f.width * up) / 2) * 2, H2 = Math.round((f.height * up) / 2) * 2;
  const args: string[] = ["-y", "-hide_banner", "-nostats", "-progress", "pipe:1"];
  const filters: string[] = [];
  let input = 0;
  const lens = durs.map((d, i) => (useXfade && i < n - 1 ? d + T : d));
  const labels: string[] = [];
  c.shots.forEach((s, i) => {
    const L = lens[i];
    const frames = Math.max(1, Math.round(L * f.fps));
    args.push("-loop", "1", "-framerate", String(f.fps), "-t", num(L), "-i", s.image);
    const vi = input++;
    const me = motionExpr(s.motion, c.params.kenBurns, frames);
    const base = `[${vi}:v]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},setsar=1,` +
      `zoompan=z='${me.z}':x='${me.x}':y='${me.y}':d=1:s=${f.width}x${f.height}:fps=${f.fps},` +
      `trim=duration=${num(L)},setpts=PTS-STARTPTS,format=yuv420p`;
    if (s.overlay) {
      args.push("-loop", "1", "-framerate", String(f.fps), "-t", num(L), "-i", s.overlay);
      const oi = input++;
      const fin = Math.min(0.35, L / 4), fout = Math.max(0, L - (useXfade && i < n - 1 ? T : 0) - 0.6);
      filters.push(`${base}[b${i}]`);
      filters.push(`[${oi}:v]format=rgba,fade=t=in:st=0.25:d=${num(fin)}:alpha=1,fade=t=out:st=${num(fout)}:d=0.35:alpha=1[o${i}]`);
      filters.push(`[b${i}][o${i}]overlay=0:0:shortest=1,format=yuv420p,fps=${f.fps},settb=AVTB[s${i}]`);
    } else {
      filters.push(`${base},fps=${f.fps},settb=AVTB[s${i}]`);
    }
    labels.push(`s${i}`);
  });
  let last = labels[0];
  if (n > 1) {
    if (useXfade) {
      let offset = 0;
      const tr = c.params.transition === "dissolve" ? "dissolve" : c.params.transition;
      for (let i = 1; i < n; i++) {
        offset += durs[i - 1];
        const out = i === n - 1 ? "xv" : `x${i}`;
        filters.push(`[${last}][${labels[i]}]xfade=transition=${tr}:duration=${num(T)}:offset=${num(offset)}[${out}]`);
        last = out;
      }
    } else {
      filters.push(`${labels.map((l) => `[${l}]`).join("")}concat=n=${n}:v=1:a=0[xv]`);
      last = "xv";
    }
  }
  const total = durs.reduce((a, b) => a + b, 0);
  const tail: string[] = [];
  if (c.fadeIn) tail.push(`fade=t=in:st=0:d=0.35`);
  if (c.fadeOut) tail.push(`fade=t=out:st=${num(Math.max(0, total - 0.35))}:d=0.35`);
  filters.push(`[${last}]${tail.length ? tail.join(",") + "," : ""}format=yuv420p[v]`);
  args.push("-filter_complex", filters.join(";"), "-map", "[v]", "-an", ...encoderArgs(c.encoder),
    "-pix_fmt", "yuv420p", "-r", String(f.fps), "-t", num(total), "-movflags", "+faststart", c.out);
  return args;
}

export function segmentDuration(shots: ShotSpec[], fps = 30): number {
  return quantize(shots.map((s) => s.dur), fps).reduce((a, b) => a + b, 0);
}

/** Contenido del archivo de lista para el demuxer concat. */
export function concatList(files: string[]): string {
  return files.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

export interface FinalMix {
  concatListPath: string;
  narration: { path: string; duration: number }[]; // duración = duración del clip del segmento
  music?: { path: string; volumeDb: number; duck: boolean } | null;
  out: string;
  loudnessLufs?: number;
}

/** Argumentos de ffmpeg para la mezcla final (copia el video, mezcla el audio). */
export function finalMixArgs(m: FinalMix): string[] {
  const args = ["-y", "-hide_banner", "-nostats", "-progress", "pipe:1", "-f", "concat", "-safe", "0", "-i", m.concatListPath];
  const filters: string[] = [];
  m.narration.forEach((s, i) => {
    args.push("-i", s.path);
    filters.push(`[${i + 1}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${num(s.duration)},atrim=duration=${num(s.duration)},asetpts=PTS-STARTPTS[a${i}]`);
  });
  const total = m.narration.reduce((a, s) => a + s.duration, 0);
  filters.push(`${m.narration.map((_, i) => `[a${i}]`).join("")}concat=n=${m.narration.length}:v=0:a=1[narr]`);
  const lufs = m.loudnessLufs ?? -14;
  if (m.music) {
    const mi = m.narration.length + 1;
    args.push("-stream_loop", "-1", "-i", m.music.path);
    filters.push(`[${mi}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${m.music.volumeDb}dB,atrim=duration=${num(total)},afade=t=in:st=0:d=2,afade=t=out:st=${num(Math.max(0, total - 4))}:d=4[mus]`);
    if (m.music.duck) {
      filters.push(`[narr]asplit=2[n1][sc]`);
      filters.push(`[mus][sc]sidechaincompress=threshold=0.015:ratio=8:attack=20:release=400[duck]`);
      filters.push(`[n1][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=${lufs}:TP=-1.5:LRA=11[aout]`);
    } else {
      filters.push(`[narr][mus]amix=inputs=2:duration=first:normalize=0,loudnorm=I=${lufs}:TP=-1.5:LRA=11[aout]`);
    }
  } else {
    filters.push(`[narr]loudnorm=I=${lufs}:TP=-1.5:LRA=11[aout]`);
  }
  args.push("-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[aout]", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", num(total), "-movflags", "+faststart", m.out);
  return args;
}

/** Argumentos para convertir cualquier audio (grabación propia, mp3) a WAV mono 48 kHz. */
export function toWavArgs(input: string, out: string, opts: { denoise?: boolean } = {}): string[] {
  const af = ["highpass=f=70", opts.denoise ? "afftdn=nf=-25" : "", "aresample=48000"].filter(Boolean).join(",");
  return ["-y", "-hide_banner", "-i", input, "-af", af, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", out];
}

/** Une fragmentos de audio de un segmento con pausas cortas entre ellos. */
export function joinAudioArgs(parts: string[], out: string, gapSeconds = 0.15): string[] {
  const args = ["-y", "-hide_banner"];
  parts.forEach((p) => args.push("-i", p));
  const f = parts.map((_, i) => `[${i}:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono${i < parts.length - 1 ? `,apad=pad_dur=${gapSeconds}` : ""}[p${i}]`);
  f.push(`${parts.map((_, i) => `[p${i}]`).join("")}concat=n=${parts.length}:v=0:a=1[a]`);
  return [...args, "-filter_complex", f.join(";"), "-map", "[a]", "-c:a", "pcm_s16le", out];
}

/** Recorta silencios al principio y al final (útil para la voz propia). */
export function trimSilenceArgs(input: string, out: string): string[] {
  return ["-y", "-hide_banner", "-i", input, "-af",
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse",
    "-c:a", "pcm_s16le", out];
}

/** Extrae un cuadro (vista previa) de un video. */
export function frameArgs(video: string, at: number, out: string): string[] {
  return ["-y", "-hide_banner", "-ss", num(at), "-i", video, "-frames:v", "1", "-q:v", "3", out];
}

export function parseProgressSeconds(line: string): number | null {
  const m = line.match(/^out_time_(?:ms|us)=(\d+)/);
  if (m) return Number(m[1]) / 1_000_000;
  const t = line.match(/^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return t ? +t[1] * 3600 + +t[2] * 60 + +t[3] : null;
}
