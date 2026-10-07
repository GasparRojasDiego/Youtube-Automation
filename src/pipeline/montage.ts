// Utilidades de ffmpeg compartidas (funciones puras): codificador, cuadros
// exactos, lista de concatenación, audio de la voz y progreso. El montaje por
// capas está en montage2.ts.

export type Motion = "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "static";

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

/** Contenido del archivo de lista para el demuxer concat. */
export function concatList(files: string[]): string {
  return files.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n";
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

export function parseProgressSeconds(line: string): number | null {
  const m = line.match(/^out_time_(?:ms|us)=(\d+)/);
  if (m) return Number(m[1]) / 1_000_000;
  const t = line.match(/^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return t ? +t[1] * 3600 + +t[2] * 60 + +t[3] : null;
}
