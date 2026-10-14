// Formato del video: horizontal 16:9 (YouTube) o vertical 9:16 (TikTok, YouTube Shorts, Reels).
// Todo lo que depende del encuadre (montaje, subtítulos, tarjetas, animaciones, imágenes con IA,
// instrucciones a Claude) pregunta aquí, para que un video vertical sea vertical de punta a punta.
import type { Video } from "../lib/repo";
import type { Frame } from "./montage";
import type { CaptionParams } from "./captions";

export type VideoFormat = "16:9" | "9:16";
export const FORMATS: { id: VideoFormat; label: string; hint: string }[] = [
  { id: "16:9", label: "Horizontal 16:9", hint: "YouTube" },
  { id: "9:16", label: "Vertical 9:16", hint: "TikTok y YouTube Shorts" },
];

export const formatOf = (v: Pick<Video, "data"> | null | undefined): VideoFormat => (v?.data?.format === "9:16" ? "9:16" : "16:9");
export const isVertical = (v: Pick<Video, "data"> | null | undefined) => formatOf(v) === "9:16";

export const FRAME_H: Frame = { width: 1920, height: 1080, fps: 30 };
export const FRAME_V: Frame = { width: 1080, height: 1920, fps: 30 };
export const frameOf = (v: Pick<Video, "data"> | null | undefined): Frame => (isVertical(v) ? FRAME_V : FRAME_H);

/** YouTube trata como Short un video vertical de hasta 3 minutos. */
export const SHORTS_MAX_S = 180;

/**
 * Subtítulos en vertical: más grandes, de 1–2 líneas cortas y por encima de la interfaz de TikTok/Shorts
 * (descripción y botones ocupan el cuarto inferior y la franja derecha).
 */
export function verticalCaptions(p: CaptionParams): CaptionParams {
  return { ...p, size: Math.round(Math.max(p.size, 62) * 1.35), maxWords: Math.min(p.maxWords, 4), maxChars: Math.min(p.maxChars, 16), lines: 2, position: "bottom", marginV: 480 };
}

/** Zonas seguras para las instrucciones a Claude (animaciones y retoques). */
export const VERTICAL_LAYOUT_EN = `FORMAT: this video is VERTICAL 9:16 (1080×1920 px), for TikTok and YouTube Shorts.
- The frame is 1080 wide × 1920 tall. K.W = 1080, K.H = 1920 inside compositions; never assume 1920×1080.
- Safe zones: keep key text and faces inside x 72–1008 and y 220–1180. The top 200 px hold the platform status bar, the band y 1240–1440 holds the burned-in captions and the bottom 420 px plus a 140 px strip on the right hold the app's buttons and description: nothing important there.
- Layout: stack vertically, one idea per screen, centre of mass around y≈700. Big type (headline 110–200 px, labels ≥ 34 px), few words, high contrast.
- FILL THE SAFE AREA: every scene has one dominant visual (icon group, diagram, number, device, image) spanning 70–90 % of the width (≥ 750 px) and most of the band y 220–1180; icons at least 180 px, strokes ≥ 6 px. A few small elements floating in an empty frame is a defect. When adapting a horizontal idea, scale it up about 1.5× and stack its parts instead of placing them side by side.
- The ready-made pieces P.* are designed for 16:9: do NOT use them in this video; build with the K kit (it adapts to the frame).
- These rules override any coordinate, balance rule or example written above for 1920×1080: scale those ideas to the tall frame (e.g. an arrow from [300,820] to [1500,320] becomes one from [160,1000] to [900,420]).`;

export const VERTICAL_SCRIPT_EN = `FORMAT: VERTICAL short-form video (TikTok / YouTube Shorts), watched on a phone with the sound on and a thumb ready to swipe. The first sentence is the hook and must land in under 2 seconds (a surprising fact, a bold claim or a direct question; never "In this video…"). One idea, short punchy sentences, no chapter introductions or recaps, few segments (1–3). End with a payoff that rewards watching to the end (and, if natural, loops back to the hook).`;

export const VERTICAL_STORY_EN = `FORMAT: VERTICAL 9:16 video (1080×1920) for TikTok / YouTube Shorts. Every photo or clip will be cropped to a tall frame around its subject: prefer images with one clear, centred subject (portraits, objects, close-ups, vertical scenes) over wide panoramas or group shots. Hook in the first 2 seconds, faster pacing, cards and motion with very few, very large words.`;

/** Duración objetivo [mín, máx] en minutos: la del video personal, la de su tarjeta de la cola o la de Ajustes. */
export function minutesRangeOf(v: Pick<Video, "data">, fallback: [number, number]): [number, number] {
  const ok = (r: unknown): r is [number, number] => Array.isArray(r) && r.length === 2 && Number(r[0]) > 0 && Number(r[1]) >= Number(r[0]);
  const p = v.data?.personal as { minutes: number; minutesRange?: [number, number] } | undefined;
  if (p) return ok(p.minutesRange) ? p.minutesRange : [p.minutes * 0.88, p.minutes * 1.08];
  return ok(v.data?.minutesRange) ? (v.data!.minutesRange as [number, number]) : fallback;
}
