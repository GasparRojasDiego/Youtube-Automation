// Montaje por capas de la edición v2 (comandos de ffmpeg; funciones puras,
// probadas con ffmpeg real). Por segmento: tomas (imágenes con movimiento de
// cámara, clips de video, animaciones a pantalla completa), etalonaje,
// transiciones por corte, capas animadas con alfa y subtítulos quemados.
// Mezcla final: narración, camas musicales por capítulo con compresión
// lateral, efectos de sonido sincronizados, audio de clips y normalización.
import { encoderArgs, quantize, type EncoderSpec, type Frame, FRAME_1080 } from "./montage";
import type { Grade, ShotMotion, Transition } from "./types";

export interface LayerShot {
  path: string; media: "image" | "video"; dur: number;
  motion?: ShotMotion; focus?: { x: number; y: number }; punchAt?: number | null;
  clipIn?: number; clipLen?: number;   // video: punto de entrada y duración disponible
  grade?: Grade; transitionIn?: Transition; transitionS?: number;
}
export interface LayerOverlay { path: string; start: number; duration: number }

export interface SegmentV2 {
  shots: LayerShot[]; overlays: LayerOverlay[]; out: string;
  fadeIn: boolean; fadeOut: boolean; kenBurns: number;
  captionsAss?: string | null; fontsDir?: string | null;   // rutas relativas al cwd de ffmpeg
  grain?: number; vignette?: boolean; frame?: Frame; encoder: EncoderSpec; upscale?: number;
}

const num = (n: number) => (Math.round(n * 1000) / 1000).toString();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const GRADE_FILTERS: Record<Grade, string> = {
  neutral: "eq=contrast=1.03:saturation=1.02",
  cold: "colorbalance=rs=-0.05:gs=0:bs=0.06:rm=-0.03:bm=0.04,eq=contrast=1.06:saturation=0.9",
  warm: "colorbalance=rs=0.06:bs=-0.05:rm=0.03:bm=-0.03,eq=contrast=1.04:saturation=1.05",
  noir: "hue=s=0,eq=contrast=1.22:brightness=-0.02",
  sepia: "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=1.05",
  desaturated: "eq=saturation=0.62:contrast=1.08",
  punchy: "eq=saturation=1.16:contrast=1.1",
};

/** Expresiones de zoompan con punto de interés, golpe de zoom y deriva. */
export function cameraExpr(m: ShotMotion, amount: number, frames: number, focus = { x: 0.5, y: 0.5 }, punchFrame: number | null = null, fps = 30) {
  const p = `((1-cos(PI*on/${frames}))/2)`;
  const a = num(amount);
  const fx = num(clamp(focus.x, 0, 1)), fy = num(clamp(focus.y, 0, 1));
  let z: string;
  switch (m) {
    case "zoom_in": z = `1+${a}*${p}`; break;
    case "zoom_out": z = `1+${a}*(1-${p})`; break;
    case "pan_left": case "pan_right": z = `1+${a}`; break;
    case "punch_in": z = `1+${num(amount * 0.4)}*${p}`; break;
    case "drift": z = `1+${num(amount * 0.5)}*${p}`; break;
    default: z = "1";
  }
  if (punchFrame != null || m === "punch_in") {
    const P = punchFrame ?? Math.round(frames * 0.35);
    const D = Math.max(4, Math.round(0.3 * fps));
    z = `(${z})+${num(Math.max(0.12, amount * 1.6))}*(1-pow(1-min(1,max(0,(on-${P})/${D})),3))`;
  }
  // Centro en el punto de interés, sin salir de la imagen
  const cx = `max(0,min(iw-iw/zoom,${fx}*iw-iw/zoom/2))`;
  const cy = `max(0,min(ih-ih/zoom,${fy}*ih-ih/zoom/2))`;
  if (m === "pan_left") return { z, x: `(iw-iw/zoom)*${p}`, y: cy };
  if (m === "pan_right") return { z, x: `(iw-iw/zoom)*(1-${p})`, y: cy };
  if (m === "drift") return { z, x: `max(0,min(iw-iw/zoom,${fx}*iw-iw/zoom/2+iw*0.015*sin(2*PI*on/${frames})))`, y: cy };
  if (m === "static" && punchFrame == null) return { z: "1", x: "0", y: "0" };
  return { z, x: cx, y: cy };
}

/** Duraciones extendidas por la transición de salida (para que xfade conserve la sincronía). */
export function shotLengths(shots: LayerShot[], fps: number): { durs: number[]; T: number[]; lens: number[] } {
  const durs = quantize(shots.map((s) => s.dur), fps);
  const T = shots.map((_, i) => {
    if (i === shots.length - 1) return 0;
    const next = shots[i + 1];
    const tr = next.transitionIn ?? "cut";
    if (tr === "cut") return 1 / fps;
    const want = next.transitionS ?? 0.5;
    return Math.max(1 / fps, Math.min(want, durs[i] * 0.45, durs[i + 1] * 0.45));
  }).map((t) => Math.round(t * fps) / fps);
  const lens = durs.map((d, i) => d + T[i]);
  return { durs, T, lens };
}

/** Argumentos de ffmpeg y guion de filtros para el clip (solo video) de un segmento. */
export function segmentV2Args(c: SegmentV2): { args: string[]; filter: string } {
  const f = c.frame ?? FRAME_1080;
  const n = c.shots.length;
  if (!n) throw new Error("Segmento sin tomas");
  const { durs, T, lens } = shotLengths(c.shots, f.fps);
  const up = c.upscale ?? 1.5;
  const W2 = Math.round((f.width * up) / 2) * 2, H2 = Math.round((f.height * up) / 2) * 2;
  const args: string[] = ["-y", "-hide_banner", "-nostats", "-progress", "pipe:1"];
  const filters: string[] = [];
  let input = 0;
  c.shots.forEach((s, i) => {
    const L = lens[i];
    const frames = Math.max(1, Math.round(L * f.fps));
    const grade = GRADE_FILTERS[s.grade ?? "neutral"] ?? GRADE_FILTERS.neutral;
    const vi = input++;
    if (s.media === "video") {
      const avail = Math.max(0.1, (s.clipLen ?? L) - (s.clipIn ?? 0));
      args.push("-ss", num(s.clipIn ?? 0), "-t", num(Math.min(L, avail)), "-i", s.path);
      const fx = clamp(s.focus?.x ?? 0.5, 0, 1), fy = clamp(s.focus?.y ?? 0.5, 0, 1);
      const pad = avail < L ? `,tpad=stop_mode=clone:stop_duration=${num(L - avail + 0.1)}` : "";
      filters.push(`[${vi}:v]fps=${f.fps},scale=${f.width}:${f.height}:force_original_aspect_ratio=increase,` +
        `crop=${f.width}:${f.height}:(iw-${f.width})*${num(fx)}:(ih-${f.height})*${num(fy)},setsar=1${pad},trim=duration=${num(L)},setpts=PTS-STARTPTS,${grade},format=yuv420p,settb=AVTB[s${i}]`);
    } else {
      args.push("-loop", "1", "-framerate", String(f.fps), "-t", num(L), "-i", s.path);
      const punch = s.punchAt != null ? Math.round(s.punchAt * f.fps) : null;
      const me = cameraExpr(s.motion ?? "zoom_in", c.kenBurns, frames, s.focus, punch, f.fps);
      filters.push(`[${vi}:v]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},setsar=1,` +
        `zoompan=z='${me.z}':x='${me.x}':y='${me.y}':d=1:s=${f.width}x${f.height}:fps=${f.fps},` +
        `trim=duration=${num(L)},setpts=PTS-STARTPTS,${grade},format=yuv420p,fps=${f.fps},settb=AVTB[s${i}]`);
    }
  });
  let last = "s0";
  let offset = 0;
  for (let i = 1; i < n; i++) {
    offset += durs[i - 1];
    const tr = c.shots[i].transitionIn ?? "cut";
    const name = tr === "cut" ? "fade" : tr;
    const out = i === n - 1 ? "xv" : `x${i}`;
    filters.push(`[${last}][s${i}]xfade=transition=${name}:duration=${num(T[i - 1])}:offset=${num(offset)}[${out}]`);
    last = out;
  }
  const total = durs.reduce((a, b) => a + b, 0);
  // Capas animadas (MOV con alfa) en su instante
  c.overlays.forEach((o, k) => {
    const oi = input++;
    args.push("-i", o.path);
    const st = clamp(o.start, 0, Math.max(0, total - 0.1));
    const en = Math.min(total, st + o.duration);
    filters.push(`[${oi}:v]format=rgba,fps=${f.fps},setpts=PTS-STARTPTS+${num(st)}/TB[ov${k}]`);
    const outL = `ovo${k}`;
    filters.push(`[${last}][ov${k}]overlay=0:0:eof_action=pass:enable='between(t,${num(st)},${num(en)})'[${outL}]`);
    last = outL;
  });
  const tail: string[] = [];
  if (c.vignette) tail.push("vignette=angle=PI/5");
  if (c.grain && c.grain > 0) tail.push(`noise=alls=${Math.round(clamp(c.grain, 0, 20))}:allf=t`);
  if (c.captionsAss) tail.push(`subtitles=${c.captionsAss}${c.fontsDir ? `:fontsdir=${c.fontsDir}` : ""}`);
  if (c.fadeIn) tail.push("fade=t=in:st=0:d=0.35");
  if (c.fadeOut) tail.push(`fade=t=out:st=${num(Math.max(0, total - 0.35))}:d=0.35`);
  filters.push(`[${last}]${tail.length ? tail.join(",") + "," : ""}format=yuv420p[v]`);
  args.push("-map", "[v]", "-an", ...encoderArgs(c.encoder), "-pix_fmt", "yuv420p", "-r", String(f.fps), "-t", num(total), "-movflags", "+faststart", c.out);
  return { args, filter: filters.join(";\n") };
}

export function segmentV2Duration(shots: LayerShot[], fps = 30): number {
  return quantize(shots.map((s) => s.dur), fps).reduce((a, b) => a + b, 0);
}

// ---------- Mezcla final ----------
export interface SfxPlacement { path: string; at: number; gainDb: number; maxDur?: number }
export interface BedPlacement { path: string; start: number; end: number; gainDb: number; fadeIn: number; fadeOut: number }
export interface ClipAudio { path: string; clipIn: number; at: number; dur: number; gainDb: number }

export interface FinalMixV2 {
  concatListPath: string;
  narration: { path: string; duration: number }[];   // duración = la del clip del segmento
  beds: BedPlacement[]; sfx: SfxPlacement[]; clipAudio: ClipAudio[];
  duck: boolean; out: string; loudnessLufs?: number;
}

export function finalMixV2Args(m: FinalMixV2): { args: string[]; filter: string } {
  const args = ["-y", "-hide_banner", "-nostats", "-progress", "pipe:1", "-f", "concat", "-safe", "0", "-i", m.concatListPath];
  const f: string[] = [];
  let idx = 1;
  const fmt = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  m.narration.forEach((s, i) => {
    args.push("-i", s.path);
    f.push(`[${idx++}:a]${fmt},apad=whole_dur=${num(s.duration)},atrim=duration=${num(s.duration)},asetpts=PTS-STARTPTS[n${i}]`);
  });
  const total = m.narration.reduce((a, s) => a + s.duration, 0);
  f.push(`${m.narration.map((_, i) => `[n${i}]`).join("")}concat=n=${m.narration.length}:v=0:a=1[narr]`);
  const bg: string[] = [];
  m.beds.forEach((b, i) => {
    const len = Math.max(0.5, b.end - b.start);
    args.push("-stream_loop", "-1", "-i", b.path);
    f.push(`[${idx++}:a]${fmt},atrim=duration=${num(len)},asetpts=PTS-STARTPTS,volume=${b.gainDb}dB,afade=t=in:st=0:d=${num(b.fadeIn)},afade=t=out:st=${num(Math.max(0, len - b.fadeOut))}:d=${num(b.fadeOut)},adelay=${Math.round(b.start * 1000)}:all=1[bed${i}]`);
    bg.push(`[bed${i}]`);
  });
  // Efectos: una entrada por archivo distinto, repartida con asplit
  const files = [...new Set(m.sfx.map((s) => s.path))];
  const fx: string[] = [];
  files.forEach((p, fi) => {
    const uses = m.sfx.filter((s) => s.path === p);
    args.push("-i", p);
    const src = `[${idx++}:a]${fmt}`;
    if (uses.length === 1) f.push(`${src}[fxs${fi}_0]`);
    else f.push(`${src},asplit=${uses.length}${uses.map((_, k) => `[fxs${fi}_${k}]`).join("")}`);
    uses.forEach((u, k) => {
      const lab = `fx${fi}_${k}`;
      f.push(`[fxs${fi}_${k}]atrim=duration=${num(u.maxDur ?? 6)},asetpts=PTS-STARTPTS,volume=${u.gainDb}dB,adelay=${Math.round(u.at * 1000)}:all=1[${lab}]`);
      fx.push(`[${lab}]`);
    });
  });
  m.clipAudio.forEach((c, i) => {
    args.push("-ss", num(c.clipIn), "-t", num(c.dur), "-i", c.path);
    f.push(`[${idx++}:a]${fmt},volume=${c.gainDb}dB,afade=t=in:d=0.15,afade=t=out:st=${num(Math.max(0, c.dur - 0.3))}:d=0.3,adelay=${Math.round(c.at * 1000)}:all=1[ca${i}]`);
    fx.push(`[ca${i}]`);
  });
  const lufs = m.loudnessLufs ?? -14;
  const layers: string[] = ["[narr1]"];
  f.push(`[narr]asplit=${bg.length && m.duck ? 3 : 2}[narr1][scfx]${bg.length && m.duck ? "[scbed]" : ""}`);
  if (bg.length) {
    f.push(`${bg.join("")}amix=inputs=${bg.length}:duration=longest:normalize=0,apad,atrim=duration=${num(total)}[beds]`);
    if (m.duck) f.push(`[beds][scbed]sidechaincompress=threshold=0.015:ratio=8:attack=20:release=450[bedsd]`);
    layers.push(m.duck ? "[bedsd]" : "[beds]");
  }
  if (fx.length) {
    f.push(`${fx.join("")}amix=inputs=${fx.length}:duration=longest:normalize=0,apad,atrim=duration=${num(total)}[fxall]`);
    // Los efectos bajan un poco bajo la voz para no taparla
    f.push(`[fxall][scfx]sidechaincompress=threshold=0.03:ratio=3:attack=10:release=250[fxd]`);
    layers.push("[fxd]");
  } else {
    f.push(`[scfx]anullsink`);
  }
  f.push(`${layers.join("")}amix=inputs=${layers.length}:duration=first:normalize=0,alimiter=limit=0.95,loudnorm=I=${lufs}:TP=-1.5:LRA=11[aout]`);
  args.push("-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", num(total), "-movflags", "+faststart", m.out);
  return { args, filter: f.join(";\n") };
}

/** Inserta el guion de filtros según la versión de ffmpeg (≥7: «-/filter_complex archivo»). */
export function withFilterScript(args: string[], scriptPath: string, modern: boolean): string[] {
  const i = args.indexOf("-map");
  const opt = modern ? ["-/filter_complex", scriptPath] : ["-filter_complex_script", scriptPath];
  return [...args.slice(0, i), ...opt, ...args.slice(i)];
}
