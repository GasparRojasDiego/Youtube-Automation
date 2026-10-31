// Duración exacta: el video dura lo que se pidió aunque la narración sea más corta. La voz es lo
// complementario: si falta tiempo, primero se da aire entre frases (con tope, para no volverlo lento)
// y lo que sigue faltando se vuelve tramos instrumentales al final de cada segmento y un cierre. El
// storyboard cubre esos tramos con imágenes y animaciones, y la música los sostiene.
import type { Span, WordTime } from "./align";

export interface DurationSeg { id: string; narration: number; spans: Span[] }
export interface DurationPlan {
  /** Rango pedido (s). */
  lo: number; hi: number;
  /** Narración + pausas sin relleno (s). */
  natural: number;
  /** Duración planificada con el relleno (s). */
  total: number;
  /** Aire añadido entre cada par de frases de un segmento (s). */
  breath: Record<string, number>;
  /** Tramo instrumental tras la narración de cada segmento (s); el del último incluye el cierre. */
  tail: Record<string, number>;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Plan de relleno. Solo actúa si narración + pausas no llegan al mínimo pedido. El aire entre
 * frases se limita a `maxBreath` por pausa; el cierre del último segmento, a `maxOutro`; el resto se
 * reparte entre los segmentos según lo que dura su narración (más texto, más imágenes que lo
 * acompañan). La suma cuadra con el mínimo pedido.
 */
export function planDuration(segs: DurationSeg[], pause: number, lo: number, hi: number, o: { vertical?: boolean } = {}): DurationPlan {
  const natural = r2(segs.reduce((a, s) => a + s.narration + pause, 0));
  const plan: DurationPlan = { lo, hi, natural, total: natural, breath: {}, tail: {} };
  for (const s of segs) { plan.breath[s.id] = 0; plan.tail[s.id] = 0; }
  if (!segs.length || !(lo > 0) || natural >= lo - 0.25) return plan;
  let need = lo - natural;
  const maxBreath = o.vertical ? 0.6 : 0.9, maxOutro = o.vertical ? 3 : 5;
  const gaps = segs.reduce((a, s) => a + Math.max(0, s.spans.length - 1), 0);
  // 1) Aire entre frases: como mucho el 45 % de lo que falta y `maxBreath` por pausa
  const breath = gaps ? r2(Math.min(maxBreath, (need * 0.45) / gaps)) : 0;
  for (const s of segs) plan.breath[s.id] = s.spans.length > 1 ? breath : 0;
  need -= breath * gaps;
  // 2) Cierre del último segmento
  const last = segs[segs.length - 1];
  const outro = Math.min(maxOutro, need);
  need -= outro;
  // 3) Lo que sigue faltando, tras cada segmento en proporción a su narración
  const weight = segs.reduce((a, s) => a + Math.max(0.5, s.narration), 0);
  for (const s of segs) plan.tail[s.id] = r2((need * Math.max(0.5, s.narration)) / weight);
  plan.tail[last.id] = r2(plan.tail[last.id] + outro);
  // Redondeo: el último absorbe la diferencia para cuadrar exacto con el mínimo
  const sum = segs.reduce((a, s) => a + s.narration + pause + plan.breath[s.id] * Math.max(0, s.spans.length - 1) + plan.tail[s.id], 0);
  plan.tail[last.id] = r2(Math.max(0, plan.tail[last.id] + (lo - sum)));
  plan.total = r2(segs.reduce((a, s) => a + s.narration + pause + plan.breath[s.id] * Math.max(0, s.spans.length - 1) + plan.tail[s.id], 0));
  return plan;
}

/** Puntos de corte entre frases: en mitad del silencio que las separa (segundos del audio original). */
export function sentenceCuts(spans: Span[]): number[] {
  return spans.slice(0, -1).map((s, i) => r2((s.end + spans[i + 1].start) / 2));
}

/** Tiempos de frases y palabras después de insertar `breath` segundos en cada pausa entre frases. */
export function stretchTimings(spans: Span[], words: WordTime[][] | undefined, breath: number): { spans: Span[]; words?: WordTime[][] } {
  return {
    spans: spans.map((s, i) => ({ start: r2(s.start + breath * i), end: r2(s.end + breath * i) })),
    words: words?.map((ws, i) => ws.map((w) => ({ ...w, s: r2(w.s + breath * i), e: r2(w.e + breath * i) }))),
  };
}

/** Argumentos de ffmpeg: parte el audio en las pausas entre frases e intercala silencios de `breath` s. */
export function stretchAudioArgs(src: string, out: string, cuts: number[], breath: number): string[] {
  const edges = [0, ...cuts];
  const f: string[] = [];
  const n = edges.length;
  f.push(`[0:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono,asplit=${n}${edges.map((_, i) => `[c${i}]`).join("")}`);
  edges.forEach((st, i) => {
    const end = i + 1 < n ? `:end=${edges[i + 1]}` : "";
    f.push(`[c${i}]atrim=start=${st}${end},asetpts=PTS-STARTPTS${i + 1 < n ? `,apad=pad_dur=${breath}` : ""}[p${i}]`);
  });
  f.push(`${edges.map((_, i) => `[p${i}]`).join("")}concat=n=${n}:v=0:a=1[a]`);
  return ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-filter_complex", f.join(";"), "-map", "[a]", "-c:a", "pcm_s16le", out];
}

/** Texto corto para el registro: «19,2 s → 30,0 s (aire 0,4 s entre frases, 6,1 s instrumentales)». */
export function describePlan(p: DurationPlan, gaps: number): string {
  const tails = Object.values(p.tail).reduce((a, b) => a + b, 0);
  const breath = Math.max(0, ...Object.values(p.breath));
  const f = (x: number) => x.toFixed(1).replace(".", ",");
  if (p.total <= p.natural + 0.05) return `${f(p.natural)} s, dentro del rango pedido (${f(p.lo)}–${f(p.hi)} s)`;
  return `${f(p.natural)} s de narración → ${f(p.total)} s pedidos (${breath && gaps ? `aire de ${f(breath)} s entre frases, ` : ""}${f(tails)} s instrumentales con imágenes y música)`;
}
