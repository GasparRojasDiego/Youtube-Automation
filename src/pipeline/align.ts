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

// ---------- Alineación por palabra con whisper.cpp (si está instalado) ----------
export interface AsrWord { w: string; s: number; e: number }

/** Forma comparable de una palabra: minúsculas, sin tildes ni signos. */
export const normWord = (w: string) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Lee el JSON de whisper-cli (`-oj -ml 1 -sow`: un elemento por palabra, offsets en ms). */
export function parseWhisperJson(text: string): AsrWord[] {
  let j: any;
  // whisper.cpp escapa comillas y barras, pero no los caracteres de control dentro del texto
  try { j = JSON.parse(text.replace(/[\u0000-\u001f]+/g, " ")); } catch { return []; }
  const out: AsrWord[] = [];
  for (const t of Array.isArray(j?.transcription) ? j.transcription : []) {
    const w = String(t?.text ?? "").trim();
    const s = Number(t?.offsets?.from) / 1000, e = Number(t?.offsets?.to) / 1000;
    if (!normWord(w) || !Number.isFinite(s) || !Number.isFinite(e)) continue;
    out.push({ w, s, e: Math.max(e, s) });
  }
  return out;
}

/** Distancia de edición ≤ 1 (una letra cambiada, de más o de menos). */
function nearlySame(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}

const wordWeight = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 2 + (/[,;:—–]$/.test(w) ? 3 : 0);

/**
 * Tiempos reales de cada palabra del guion a partir de lo que oyó whisper: las que coinciden
 * toman su tiempo y las demás se reparten entre sus vecinas. Los tiempos se ajustan a los
 * silencios de ffmpeg (una palabra no empieza dentro de una pausa). Devuelve null si el audio
 * no se parece al texto (menos de la mitad de las palabras): entonces se usa la estimación.
 */
export function alignWords(sentences: string[], asr: AsrWord[], total: number, silences: Silence[] = []): { words: WordTime[][]; spans: Span[]; matched: number } | null {
  const flat = sentences.flatMap((s, si) => s.split(/\s+/).filter(Boolean).map((w) => ({ w, si, n: normWord(w) })));
  const A = asr.map((a) => normWord(a.w));
  const n = flat.length, m = A.length;
  if (!n || !m || n > 4000 || m > 4000) return null;
  // Subsecuencia común más larga (programación dinámica)
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  const eq = (i: number, j: number) => !!flat[i].n && nearlySame(flat[i].n, A[j]);
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
    dp[i][j] = eq(i - 1, j - 1) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const at: (AsrWord | null)[] = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 && j > 0;) {
    if (eq(i - 1, j - 1) && dp[i][j] === dp[i - 1][j - 1] + 1) { at[i - 1] = asr[j - 1]; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
  }
  const matched = at.filter(Boolean).length;
  if (matched < Math.max(2, n * 0.5)) return null;
  // Segundos por unidad de peso (con las palabras reconocidas), para estimar las que faltan en los bordes
  let wsum = 0, dsum = 0;
  at.forEach((a, i) => { if (a) { wsum += wordWeight(flat[i].w); dsum += Math.max(0.05, a.e - a.s); } });
  const rate = dsum / Math.max(1, wsum);
  const S = new Array<number>(n), E = new Array<number>(n);
  for (let k = 0; k < n;) {
    const a = at[k];
    if (a) { S[k] = a.s; E[k] = a.e; k++; continue; }
    let r = k; while (r < n && !at[r]) r++;
    const ws = flat.slice(k, r).map((x) => wordWeight(x.w));
    const need = ws.reduce((x, y) => x + y, 0) * rate;
    let from = k > 0 ? E[k - 1] : Math.max(0, (r < n ? at[r]!.s : 0) - need);
    let to = r < n ? at[r]!.s : Math.min(total, from + need);
    if (to - from < 0.04 * (r - k)) to = Math.min(total, from + 0.04 * (r - k));
    if (to <= from) from = Math.max(0, to - 0.04 * (r - k));
    const sum = ws.reduce((x, y) => x + y, 0) || 1;
    let t = from;
    for (let q = k; q < r; q++) { const d = ((to - from) * ws[q - k]) / sum; S[q] = t; E[q] = t + d; t += d; }
    k = r;
  }
  // Ajuste a los silencios y orden estricto
  const sil = silences.filter((x) => x.end - x.start >= 0.08);
  for (let i = 0; i < n; i++) {
    for (const x of sil) {
      if (S[i] > x.start && S[i] < x.end) S[i] = x.end;
      if (E[i] > x.start && E[i] < x.end && E[i] - x.start < x.end - S[i]) E[i] = x.start;
    }
    if (i > 0) S[i] = Math.max(S[i], S[i - 1] + 0.01);
    S[i] = Math.min(S[i], Math.max(0, total - 0.05));
    E[i] = Math.min(total, Math.max(E[i], S[i] + 0.04));
  }
  const words: WordTime[][] = sentences.map(() => []);
  flat.forEach((x, i) => words[x.si].push({ w: x.w, s: round3(S[i]), e: round3(E[i]) }));
  // Oraciones: de su primera a su última palabra; la frontera cae en la pausa que las separa
  const spans: Span[] = [];
  words.forEach((ws) => { const prev = spans.length ? spans[spans.length - 1].end : 0; spans.push(ws.length ? { start: ws[0].s, end: ws[ws.length - 1].e } : { start: prev, end: prev + 0.05 }); });
  for (let i = 0; i < spans.length - 1; i++) {
    const a = spans[i].end, b = spans[i + 1].start;
    const gap = sil.filter((x) => x.end > Math.min(a, b) - 0.15 && x.start < Math.max(a, b) + 0.15).sort((x, y) => (y.end - y.start) - (x.end - x.start))[0];
    if (gap && gap.start >= spans[i].start && gap.end <= (spans[i + 1].end || total)) { spans[i].end = gap.start; spans[i + 1].start = gap.end; }
    else if (a > b) { const mid = (a + b) / 2; spans[i].end = mid; spans[i + 1].start = mid; }
  }
  for (const sp of spans) { sp.start = round3(sp.start); sp.end = round3(Math.max(sp.start + 0.05, sp.end)); }
  // Las palabras quedan dentro de su oración
  words.forEach((ws, i) => ws.forEach((w) => { w.s = round3(Math.min(Math.max(w.s, spans[i].start), spans[i].end - 0.02)); w.e = round3(Math.min(Math.max(w.e, w.s + 0.02), spans[i].end)); }));
  return { words, spans, matched };
}
