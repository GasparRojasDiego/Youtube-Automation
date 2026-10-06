// Alineación de la narración (funciones puras): tiempos de cada oración a
// partir de los silencios detectados por ffmpeg, y de cada palabra por
// reparto proporcional. Sirve para colocar cortes, subtítulos y efectos en el
// instante exacto en que se dice cada frase.

export interface Silence { start: number; end: number }
export interface Span { start: number; end: number }
export interface WordTime { w: string; s: number; e: number }

/** Lee la salida de `-af silencedetect` de ffmpeg. */
export function parseSilences(stderr: string, total?: number): Silence[] {
  const out: Silence[] = [];
  let open: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const a = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (a) { open = Math.max(0, Number(a[1])); continue; }
    const b = line.match(/silence_end:\s*([\d.]+)/);
    if (b && open != null) { out.push({ start: open, end: Number(b[1]) }); open = null; }
  }
  if (open != null && total != null) out.push({ start: open, end: total });
  return out;
}

/** Peso de lectura de una oración: caracteres más pausas por puntuación interna. */
export function readingWeight(s: string): number {
  const commas = (s.match(/[,;:—–]/g) ?? []).length;
  return s.replace(/\s+/g, " ").trim().length + commas * 6 + 4;
}

/**
 * Tiempos de cada oración dentro del audio de un segmento. Cada frontera
 * esperada (proporcional al texto) se ajusta al silencio más cercano.
 */
export function alignSentences(sentences: string[], total: number, silences: Silence[]): Span[] {
  const n = sentences.length;
  if (!n) return [];
  const sil = silences.filter((x) => x.end - x.start >= 0.08 && x.start > 0.05 && x.end < total - 0.05).sort((a, b) => a.start - b.start);
  const lead = silences.find((x) => x.start <= 0.05);
  const tail = silences.find((x) => x.end >= total - 0.05 && x.start > 0.05);
  const speechStart = lead ? Math.min(lead.end, total) : 0;
  const speechEnd = tail ? Math.max(speechStart, tail.start) : total;
  const w = sentences.map(readingWeight);
  const sum = w.reduce((a, b) => a + b, 0);
  const span = speechEnd - speechStart;
  const bounds: Silence[] = [];
  let acc = 0; let used = -1;
  for (let i = 0; i < n - 1; i++) {
    acc += w[i];
    const expected = speechStart + (span * acc) / sum;
    const win = Math.max(1.2, span * 0.12);
    let best = -1; let bestD = Infinity;
    for (let j = used + 1; j < sil.length; j++) {
      const mid = (sil[j].start + sil[j].end) / 2;
      const d = Math.abs(mid - expected) - Math.min(0.25, (sil[j].end - sil[j].start) * 0.5); // preferir pausas largas
      if (Math.abs(mid - expected) <= win && d < bestD) { bestD = d; best = j; }
      if (mid > expected + win) break;
    }
    // Reserva silencios suficientes para las fronteras restantes
    if (best >= 0 && sil.length - best - 1 >= 0) { bounds.push(sil[best]); used = best; }
    else bounds.push({ start: expected, end: expected });
  }
  const spans: Span[] = [];
  for (let i = 0; i < n; i++) {
    const start = i === 0 ? speechStart : bounds[i - 1].end;
    const end = i === n - 1 ? speechEnd : bounds[i].start;
    spans.push({ start: round3(start), end: round3(Math.max(start + 0.05, end)) });
  }
  return spans;
}

/** Reparte el tiempo de una oración entre sus palabras (por longitud, con pausas en comas). */
export function wordTimings(sentence: string, span: Span): WordTime[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const wt = words.map((x) => x.replace(/[^\p{L}\p{N}]/gu, "").length + 2 + (/[,;:—–]$/.test(x) ? 3 : 0));
  const sum = wt.reduce((a, b) => a + b, 0);
  const dur = span.end - span.start;
  let t = span.start;
  return words.map((w, i) => {
    const d = (dur * wt[i]) / sum;
    const r = { w, s: round3(t), e: round3(t + d) };
    t += d;
    return r;
  });
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
