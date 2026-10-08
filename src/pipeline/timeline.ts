// Línea de tiempo de la edición v2 (funciones puras): reparación del
// storyboard, tiempos exactos de cada toma según la voz, efectos de sonido,
// lista de edición legible para Opus y aplicación de sus retoques.
import { splitSentences } from "../lib/util";
import type { Span } from "./align";
import type { Shot, SfxCue, MusicBed, MotionItem, Transition, Grade, ScriptOut, VisualType } from "./types";
import { TRANSITIONS, GRADES } from "./types";

export interface SegInfo { id: string; title: string; sentences: string[]; spans: Span[]; narration: number }

export function segInfos(script: ScriptOut, voice: { segments: { segment_id: string; duration: number; sentences?: Span[] }[] }): SegInfo[] {
  return script.segments.map((s) => {
    const v = voice.segments.find((x) => x.segment_id === s.id);
    const sentences = splitSentences(s.text_en);
    const narration = v?.duration ?? 0;
    // Sin alineación (voz antigua): reparto proporcional al texto
    let spans = v?.sentences && v.sentences.length === sentences.length ? v.sentences : null;
    if (!spans) {
      const tot = sentences.reduce((a, t) => a + t.length + 1, 0) || 1; let t = 0;
      spans = sentences.map((x) => { const d = (narration * (x.length + 1)) / tot; const r = { start: t, end: t + d }; t += d; return r; });
    }
    return { id: s.id, title: s.title, sentences, spans, narration };
  });
}

interface RawShot { visual: string; query_en?: string; alt_queries_en?: string[]; must_show_es?: string; avoid_es?: string; card_text?: string; source_id?: string; motion_brief_en?: string; image_prompt_en?: string }
interface RawBeat { segment_id: string; from: number; to: number; shots: RawShot[]; sfx?: { at: "start" | "end"; type: string; query_en: string }[] }

const VISUAL_TYPES: VisualType[] = ["photo", "archival", "clip", "meme", "ai_image", "motion", "map", "source_card", "quote_card", "title_card", "text_card"];
const CARDS = new Set<string>(["source_card", "quote_card", "title_card", "text_card"]);
const STOP = new Set("the a an and or but of to in on at for with from by as is are was were be been being it its this that these those there their they them he she his her we our you your i my me not no so than then into over under about after before more most very just also can could would should will what which who whom when where why how all any some such only own same other one two three first last new old because while though still even ever never really did does done had has have get got make made".split(" "));

/** Consulta de búsqueda a partir de una frase: las palabras con más contenido. */
export function keywordsQuery(sentence = "", max = 3): string {
  const w = (sentence.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter((x) => !STOP.has(x));
  return [...new Set(w)].sort((a, b) => b.length - a.length).slice(0, max).join(" ");
}

/** Consultas de respaldo cada vez más genéricas (para que siempre aparezca material). */
export function fallbackQueries(q = "", alts: string[] = []): string[] {
  const words = q.toLowerCase().split(/\s+/).filter((x) => x && !STOP.has(x));
  const out = [q, ...alts];
  if (words.length > 2) out.push(words.slice(-2).join(" "), words.slice(0, 2).join(" "));
  if (words.length > 1) out.push(words[words.length - 1]);
  return [...new Set(out.map((x) => x.trim()).filter(Boolean))];
}

export interface RepairOpts { aiImages?: boolean; maxCards?: number }

/** Cubre todas las oraciones en orden; corrige índices, huecos y solapes; limita animaciones y tarjetas. */
export function repairStoryboard(raw: RawBeat[], segs: SegInfo[], motionBudget: number, sourceIds: Set<string>, opts: RepairOpts = {}): { shots: Shot[]; beatSfx: { shotId: string; at: "start" | "end"; type: string; query_en: string }[] } {
  const shots: Shot[] = []; const beatSfx: { shotId: string; at: "start" | "end"; type: string; query_en: string }[] = [];
  let n = 0, beatN = 0, motionUsed = 0, cardsUsed = 0;
  const maxCards = opts.maxCards ?? 4;
  for (const seg of segs) {
    const last = seg.sentences.length - 1;
    if (last < 0) continue;
    const mine = raw.filter((b) => b.segment_id === seg.id)
      .map((b) => ({ ...b, from: clampI(b.from, 0, last), to: clampI(b.to, 0, last) }))
      .sort((a, b) => a.from - b.from || a.to - b.to);
    let next = 0;
    const beats: RawBeat[] = [];
    for (const b of mine) {
      if (b.to < next) continue;
      beats.push({ ...b, from: next, to: Math.max(b.to, next) });
      next = Math.max(b.to, next) + 1;
      if (next > last) break;
    }
    if (next <= last) {
      if (beats.length) beats[beats.length - 1].to = last;
      else beats.push({ segment_id: seg.id, from: 0, to: last, shots: [{ visual: "photo", query_en: keywordsQuery(seg.sentences.join(" ")) }] });
    }
    for (const b of beats) {
      beatN++;
      const list = (b.shots?.length ? b.shots : [{ visual: "photo" }]).slice(0, 3);
      const beatText = seg.sentences.slice(b.from, b.to + 1).join(" ");
      list.forEach((r, k) => {
        let visual = (VISUAL_TYPES.includes(r.visual as VisualType) ? r.visual : "photo") as VisualType;
        let query = r.query_en?.trim() || "";
        let brief = r.motion_brief_en?.trim() || "";
        if (visual === "source_card" && !sourceIds.has(r.source_id ?? "")) visual = "text_card";
        // Tarjetas: solo unas pocas; las demás pasan a animación (si cabe) o a imagen
        if (CARDS.has(visual)) {
          if (cardsUsed < maxCards) cardsUsed++;
          else if (motionUsed < motionBudget) { visual = "motion"; brief = `Kinetic typography sequence for: "${r.card_text?.trim() || shortPhrase(beatText, 14)}"`; }
          else visual = "photo";
        }
        if (visual === "motion" || visual === "map") {
          if (motionUsed >= motionBudget) visual = "photo";
          else { motionUsed++; if (!brief) brief = `Motion-design sequence illustrating: "${shortPhrase(beatText, 24)}"`; }
        }
        if (visual === "ai_image" && !opts.aiImages) visual = "photo";
        if (["photo", "archival", "clip", "meme", "ai_image"].includes(visual) && !query) query = keywordsQuery(beatText) || keywordsQuery(seg.title) || "abstract background";
        const sh: Shot = {
          id: `s${String(++n).padStart(3, "0")}`, segment_id: seg.id, beat: beatN, from: b.from, to: b.to, visual,
          query_en: query || undefined, alt_queries_en: (r.alt_queries_en ?? []).filter(Boolean).slice(0, 3),
          must_show_es: r.must_show_es ?? "", avoid_es: r.avoid_es ?? "", card_text: r.card_text?.trim() || undefined,
          source_id: r.source_id || undefined, motion_brief_en: brief || undefined,
          image_prompt_en: visual === "ai_image" ? (r.image_prompt_en?.trim() || query) : r.image_prompt_en?.trim() || undefined,
        };
        if ((visual === "title_card" || visual === "quote_card" || visual === "text_card") && !sh.card_text) sh.card_text = visual === "title_card" ? seg.title : shortPhrase(seg.sentences[b.from]);
        shots.push(sh);
        if (k === 0) for (const s of (b.sfx ?? []).slice(0, 2)) if (s.type?.trim()) beatSfx.push({ shotId: sh.id, at: s.at === "end" ? "end" : "start", type: s.type.trim(), query_en: (s.query_en || s.type).trim() });
      });
    }
  }
  return { shots, beatSfx };
}

const clampI = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(x) || 0)));

export function shortPhrase(sentence = "", maxWords = 8): string {
  const w = sentence.replace(/["“”]/g, "").split(/\s+/).filter(Boolean);
  return w.slice(0, maxWords).join(" ") + (w.length > maxWords ? "…" : "");
}

/** Duración del clip de un segmento: la narración más la pausa final, en cuadros exactos. */
export function segmentLength(seg: SegInfo, pause: number, fps = 30): number {
  return Math.round((seg.narration + pause) * fps) / fps;
}

/**
 * Tiempos de cada toma dentro de su segmento: cada beat empieza cuando se
 * dice su primera oración; las tomas de un beat se reparten su tiempo.
 */
export function layoutShots(shots: Shot[], segs: SegInfo[], pause: number, fps = 30, minShot = 1.0): Shot[] {
  const out: Shot[] = [];
  for (const seg of segs) {
    const mine = shots.filter((s) => s.segment_id === seg.id);
    if (!mine.length) continue;
    const total = segmentLength(seg, pause, fps);
    const beats = [...new Set(mine.map((s) => s.beat))];
    // Cada corte cae en mitad de la pausa anterior a la primera oración del beat
    const starts = beats.map((b, i) => {
      if (i === 0) return 0;
      const f = mine.find((s) => s.beat === b)!.from;
      const cur = seg.spans[f]; const prev = seg.spans[f - 1];
      return cur ? (prev ? (prev.end + cur.start) / 2 : cur.start) : 0;
    });
    for (let i = 0; i < beats.length; i++) {
      const b0 = starts[i];
      const b1 = i + 1 < beats.length ? Math.max(b0 + minShot, starts[i + 1]) : total;
      const list = mine.filter((s) => s.beat === beats[i]);
      const k = Math.max(1, Math.min(list.length, Math.floor((b1 - b0) / minShot)));
      const used = list.slice(0, k);
      used.forEach((s, j) => {
        const st = b0 + ((b1 - b0) * j) / k;
        const en = b0 + ((b1 - b0) * (j + 1)) / k;
        out.push({ ...s, start: st, dur: en - st });
      });
    }
    // Cuadros exactos y continuidad (sin huecos ni solapes), terminando en `total`
    const segShots = out.filter((s) => s.segment_id === seg.id);
    let t = 0;
    segShots.forEach((s, idx) => {
      const endRaw = idx === segShots.length - 1 ? total : Math.max(t + 1 / fps, s.start! + s.dur!);
      const end = Math.round(Math.min(endRaw, total) * fps) / fps;
      s.start = t; s.dur = Math.max(1 / fps, end - t); t = end;
    });
  }
  return out;
}

/** Inicio global de cada segmento en el video final. */
export function segmentOffsets(segs: SegInfo[], pause: number, fps = 30): Record<string, number> {
  const out: Record<string, number> = {}; let t = 0;
  for (const s of segs) { out[s.id] = t; t += segmentLength(s, pause, fps); }
  return out;
}

export function beatSfxToCues(beatSfx: { shotId: string; at: "start" | "end"; type: string; query_en: string }[], shots: Shot[], offsets: Record<string, number>): SfxCue[] {
  const cues: SfxCue[] = []; let n = 0;
  for (const b of beatSfx) {
    const sh = shots.find((s) => s.id === b.shotId);
    if (!sh || sh.start == null) continue;
    const beatShots = shots.filter((s) => s.beat === sh.beat);
    const end = Math.max(...beatShots.map((s) => (s.start ?? 0) + (s.dur ?? 0)));
    const local = b.at === "start" ? sh.start : Math.max(sh.start, end - 0.6);
    cues.push({ id: `fx${++n}`, at: round2(offsets[sh.segment_id] + local), type: b.type, query_en: b.query_en, gain_db: -18 });
  }
  return cues;
}

/** Texto de cada toma (lo que se narra mientras está en pantalla). */
export function shotNarration(sh: Shot, seg: SegInfo): string {
  const t0 = sh.start ?? 0, t1 = t0 + (sh.dur ?? 0);
  const idx = seg.spans.map((sp, i) => ({ i, sp })).filter(({ sp }) => sp.end > t0 + 0.05 && sp.start < t1 - 0.05).map((x) => x.i);
  return (idx.length ? idx : [sh.from]).map((i) => seg.sentences[i]).filter(Boolean).join(" ");
}

/** Lista de edición compacta para Opus. */
export function buildEdl(shots: Shot[], segs: SegInfo[], offsets: Record<string, number>, sfx: SfxCue[], describe: (s: Shot) => string): string {
  const lines: string[] = [];
  for (const seg of segs) {
    lines.push(`\n## ${seg.id} "${seg.title}" (starts ${fmtT(offsets[seg.id])})`);
    for (const s of shots.filter((x) => x.segment_id === seg.id)) {
      const g0 = offsets[seg.id] + (s.start ?? 0);
      const fx = sfx.filter((c) => c.at >= g0 - 0.05 && c.at < g0 + (s.dur ?? 0) - 0.05).map((c) => `${c.id}:${c.type}@${fmtT(c.at)}`);
      lines.push(`${s.id} ${fmtT(g0)} ${(s.dur ?? 0).toFixed(1)}s [${s.visual}${s.media === "video" ? " video" : ""}] ${describe(s)} | in:${s.transition_in ?? "cut"} cam:${s.motion ?? "zoom_in"}${fx.length ? ` | sfx ${fx.join(" ")}` : ""} | "${truncateWords(shotNarration(s, seg), 40)}"`);
    }
  }
  return lines.join("\n");
}

const fmtT = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const round2 = (x: number) => Math.round(x * 100) / 100;
function truncateWords(s: string, n: number) { const w = s.split(/\s+/); return w.length > n ? w.slice(0, n).join(" ") + "…" : s; }

export interface PolishRaw {
  grade: string;
  shots: { id: string; transition_in: string; transition_s: number; motion: string; grade: string; punch_at: number; clip_audio_db: number }[];
  sfx_add: { at: number; type: string; query_en: string; gain_db: number }[];
  sfx_remove: string[];
  motion: { kind: "fullscreen" | "overlay"; shot_ids: string[]; start_s: number; duration_s: number; brief_en: string; text: string; libs: ("map" | "d3")[]; asset_ids: string[] }[];
  notes_es: string;
  verify_es?: string[];
}

const MOTIONS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "static", "punch_in", "drift"];

/** Aplica los retoques de Opus con validación estricta (nada fuera de rango llega al montaje). */
export function applyPolish(p: PolishRaw, shots: Shot[], sfx: SfxCue[], offsets: Record<string, number>, totalDur: number, motionBudget: number): { shots: Shot[]; sfx: SfxCue[]; motion: MotionItem[]; grade: Grade } {
  const byId = new Map(shots.map((s) => [s.id, { ...s }]));
  for (const c of p.shots ?? []) {
    const s = byId.get(c.id); if (!s) continue;
    if (TRANSITIONS.includes(c.transition_in as Transition)) s.transition_in = c.transition_in as Transition;
    s.transition_s = clamp(Number(c.transition_s) || 0.5, 0.15, 1.2);
    if (MOTIONS.includes(c.motion)) s.motion = c.motion as Shot["motion"];
    if (GRADES.includes(c.grade as Grade)) s.grade = c.grade as Grade;
    s.punch_at = c.punch_at != null && c.punch_at >= 0 && c.punch_at < (s.dur ?? 0) - 0.2 ? c.punch_at : null;
    s.clip_audio_db = c.clip_audio_db != null && c.clip_audio_db > -60 ? clamp(c.clip_audio_db, -30, 0) : null;
  }
  const removed = new Set(p.sfx_remove ?? []);
  let n = sfx.length;
  const outSfx = sfx.filter((c) => !removed.has(c.id));
  for (const a of p.sfx_add ?? []) {
    if (!(a.at >= 0 && a.at < totalDur) || !a.type?.trim()) continue;
    outSfx.push({ id: `fx${++n}`, at: Math.round(a.at * 100) / 100, type: a.type.trim(), query_en: (a.query_en || a.type).trim(), gain_db: clamp(Number(a.gain_db) || -18, -30, -6) });
  }
  const list = [...byId.values()];
  const motion: MotionItem[] = []; let m = 0;
  const usedFull = new Set<string>();
  for (const it of p.motion ?? []) {
    if (motion.length >= motionBudget) break;
    const ids = (it.shot_ids ?? []).filter((id) => byId.has(id));
    if (!ids.length || !it.brief_en?.trim()) continue;
    const first = byId.get(ids[0])!;
    const seg = first.segment_id;
    const segShots = list.filter((s) => s.segment_id === seg);
    if (it.kind === "fullscreen") {
      // tomas consecutivas del mismo segmento, sin repetir
      const idx = ids.map((id) => segShots.findIndex((s) => s.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
      const run: string[] = [];
      for (let i = idx[0]; i <= idx[idx.length - 1]; i++) run.push(segShots[i].id);
      if (run.some((id) => usedFull.has(id))) continue;
      run.forEach((id) => usedFull.add(id));
      const start = byId.get(run[0])!.start ?? 0;
      const end = run.reduce((a, id) => Math.max(a, (byId.get(id)!.start ?? 0) + (byId.get(id)!.dur ?? 0)), 0);
      motion.push({ id: `m${++m}`, kind: "fullscreen", shot_ids: run, segment_id: seg, start, duration: Math.min(20, end - start), brief_en: it.brief_en, text: it.text ?? "", libs: (it.libs ?? []).filter((l) => l === "map" || l === "d3"), asset_ids: it.asset_ids ?? [] });
    } else {
      const start = (first.start ?? 0) + clamp(Number(it.start_s) || 0, 0, Math.max(0, (first.dur ?? 0) - 0.5));
      const segEnd = segShots.reduce((a, s) => Math.max(a, (s.start ?? 0) + (s.dur ?? 0)), 0);
      const duration = clamp(Number(it.duration_s) || 4, 1.5, Math.max(1.5, Math.min(12, segEnd - start)));
      motion.push({ id: `m${++m}`, kind: "overlay", shot_ids: ids, segment_id: seg, start, duration, brief_en: it.brief_en, text: it.text ?? "", libs: (it.libs ?? []).filter((l) => l === "map" || l === "d3"), asset_ids: it.asset_ids ?? [] });
    }
  }
  void offsets;
  return { shots: list, sfx: outSfx.sort((a, b) => a.at - b.at), motion, grade: GRADES.includes(p.grade as Grade) ? (p.grade as Grade) : "neutral" };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Garantiza al menos una secuencia de motion a pantalla completa por cada
 * ventana de `every` segundos: si una ventana no tiene, convierte una racha de
 * tomas consecutivas (6–15 s, preferentemente tarjetas) en una secuencia.
 */
export function ensureMotionCadence(motion: MotionItem[], shots: Shot[], offsets: Record<string, number>, total: number, budget: number, narration: (s: Shot) => string, every = 60): MotionItem[] {
  const out = [...motion];
  const used = new Set(out.filter((m) => m.kind === "fullscreen").flatMap((m) => m.shot_ids));
  let n = out.reduce((a, m) => Math.max(a, Number(m.id.replace(/\D/g, "")) || 0), 0);
  const g0 = (s: Shot) => (offsets[s.segment_id] ?? 0) + (s.start ?? 0);
  for (let w = 0; w + 20 < total && out.length < budget; w += every) {
    const has = out.some((m) => m.kind === "fullscreen" && (offsets[m.segment_id] ?? 0) + m.start < w + every && (offsets[m.segment_id] ?? 0) + m.start + m.duration > w);
    if (has) continue;
    let best: { ids: string[]; score: number; start: number; dur: number; seg: string } | null = null;
    const inWin = shots.filter((s) => g0(s) >= w && g0(s) < w + every && !used.has(s.id));
    for (const first of inWin) {
      const segShots = shots.filter((s) => s.segment_id === first.segment_id);
      const run: Shot[] = [];
      let dur = 0;
      for (let i = segShots.indexOf(first); i < segShots.length && dur < 15; i++) {
        const sh = segShots[i];
        if (used.has(sh.id) || (dur > 0 && dur + (sh.dur ?? 0) > 15.5)) break;
        run.push(sh); dur += sh.dur ?? 0;
      }
      if (dur < 5) continue;
      const score = run.filter((x) => CARDS.has(x.visual)).length * 4 + run.filter((x) => x.visual === "motion" || x.visual === "map").length * 6 - Math.abs(dur - 10) * 0.3 - run.filter((x) => x.media === "video").length;
      if (!best || score > best.score) best = { ids: run.map((x) => x.id), score, start: first.start ?? 0, dur, seg: first.segment_id };
    }
    if (!best) continue;
    best.ids.forEach((id) => used.add(id));
    const text = best.ids.map((id) => narration(shots.find((s) => s.id === id)!)).join(" ");
    out.push({ id: `m${++n}`, kind: "fullscreen", shot_ids: best.ids, segment_id: best.seg, start: best.start, duration: Math.min(20, best.dur),
      brief_en: `Premium motion-design sequence (2-4 scenes) that visualises this narration with kinetic typography, numbers, diagrams or generative visuals, using only words and figures from it: "${text.slice(0, 500)}"`, text: "", libs: [], asset_ids: [] });
  }
  return out;
}

/** Agrupa segmentos en camas musicales válidas (todas cubiertas, en orden). */
export function repairMusic(raw: { segment_ids: string[]; mood_en: string }[], segIds: string[]): MusicBed[] {
  const beds: MusicBed[] = [];
  const assigned = new Set<string>();
  for (const r of raw ?? []) {
    const ids = (r.segment_ids ?? []).filter((id) => segIds.includes(id) && !assigned.has(id));
    if (!ids.length || !r.mood_en?.trim()) continue;
    ids.forEach((id) => assigned.add(id));
    beds.push({ segment_ids: ids, mood_en: r.mood_en.trim() });
  }
  // segmentos sin cama: se unen a la cama anterior (o a la primera)
  for (const id of segIds) {
    if (assigned.has(id)) continue;
    const i = segIds.indexOf(id);
    const prev = beds.find((b) => b.segment_ids.includes(segIds[i - 1]));
    (prev ?? beds[0] ?? (beds[beds.length] = { segment_ids: [], mood_en: "soft ambient documentary background" })).segment_ids.push(id);
    assigned.add(id);
  }
  for (const b of beds) b.segment_ids.sort((a, c) => segIds.indexOf(a) - segIds.indexOf(c));
  return beds.sort((a, b) => segIds.indexOf(a.segment_ids[0]) - segIds.indexOf(b.segment_ids[0]));
}
