// Lógica pura del pipeline (sin E/S): validación de guion, reparación del plan
// visual, reparto de tiempos, capítulos, subtítulos y descripción.
import { splitSentences, wordCount, fmtDuration } from "../lib/util";
import type { ScriptOut, ResearchOut, VerifyOut, PlannedShot, Source, ClaimCheck } from "./types";
import type { Motion } from "./montage";

// ---------- Guion ----------
export interface ScriptIssue { segment_id: string; claim_id?: string; problem_es: string; severity: "warn" | "block" }

export function checkScript(script: ScriptOut, research: ResearchOut): ScriptIssue[] {
  const issues: ScriptIssue[] = [];
  const factIds = new Set(research.facts.map((f) => f.id));
  const srcIds = new Set(research.sources.map((s) => s.id));
  const seen = new Set<string>();
  for (const seg of script.segments) {
    if (!seg.text_en.trim()) issues.push({ segment_id: seg.id, problem_es: "Segmento vacío.", severity: "block" });
    for (const c of seg.claims) {
      if (seen.has(c.id)) issues.push({ segment_id: seg.id, claim_id: c.id, problem_es: `Identificador de afirmación repetido (${c.id}).`, severity: "warn" });
      seen.add(c.id);
      if (!seg.text_en.includes(c.text_en) && !seg.text_en.toLowerCase().includes(c.text_en.toLowerCase().trim()))
        issues.push({ segment_id: seg.id, claim_id: c.id, problem_es: "El texto de la afirmación no aparece literalmente en la narración.", severity: "warn" });
      if (c.kind === "fact") {
        const known = c.fact_ids.filter((f) => factIds.has(f));
        if (!known.length) issues.push({ segment_id: seg.id, claim_id: c.id, problem_es: "Afirmación factual sin ningún hecho de la investigación que la respalde.", severity: "block" });
        if (c.fact_ids.some((f) => !factIds.has(f))) issues.push({ segment_id: seg.id, claim_id: c.id, problem_es: "Cita hechos que no existen en la investigación.", severity: "block" });
        if (c.source_ids.some((s) => !srcIds.has(s))) issues.push({ segment_id: seg.id, claim_id: c.id, problem_es: "Cita fuentes que no existen en la investigación.", severity: "block" });
      }
    }
  }
  return issues;
}

export function scriptWords(script: ScriptOut): number {
  return script.segments.reduce((a, s) => a + wordCount(s.text_en), 0);
}

/** Combina la verificación del modelo con las comprobaciones mecánicas. */
export function mergeVerification(v: VerifyOut, script: ScriptOut, mech: ScriptIssue[]): VerifyOut {
  const byId = new Map(v.claims.map((c) => [c.claim_id, c]));
  const claims: ClaimCheck[] = [];
  for (const seg of script.segments) for (const c of seg.claims) {
    const found = byId.get(c.id);
    claims.push(found ?? {
      claim_id: c.id, verdict: "unsupported", severity: "warn", issues: ["other"],
      note_es: "El verificador no revisó esta afirmación; revísala tú.", suggested_fix_en: "", gloss_es: "", quote_gloss_es: "",
    });
  }
  for (const m of mech) {
    if (!m.claim_id) continue;
    const c = claims.find((x) => x.claim_id === m.claim_id);
    if (!c) continue;
    if (m.severity === "block" && c.severity !== "block") c.severity = "block";
    else if (m.severity === "warn" && c.severity === "ok") c.severity = "warn";
    c.note_es = c.note_es ? `${c.note_es} · ${m.problem_es}` : m.problem_es;
    if (!c.issues.includes("unsourced") && /respalde|no existen/.test(m.problem_es)) c.issues.push("unsourced");
  }
  return { ...v, claims };
}

export function openBlocks(v: VerifyOut): number {
  const c = v.claims.filter((x) => x.severity === "block" && x.resolution !== "accepted").length;
  const u = v.unlinked.filter((x) => x.severity === "block" && x.resolution !== "accepted").length;
  return c + u;
}

export function pendingFixes(v: VerifyOut): number {
  return v.claims.filter((x) => x.resolution === "fix").length + v.unlinked.filter((x) => x.resolution === "fix").length;
}

// ---------- Plan visual ----------
export interface SegSentences { id: string; title: string; sentences: string[] }

export function segmentSentences(script: ScriptOut): SegSentences[] {
  return script.segments.map((s) => ({ id: s.id, title: s.title, sentences: splitSentences(s.text_en) }));
}

const MOTIONS: Motion[] = ["zoom_in", "pan_left", "zoom_out", "pan_right"];

/**
 * Repara el plan: cubre todas las oraciones en orden, sin huecos ni solapes,
 * y limita las imágenes generadas al máximo permitido.
 */
export function repairPlan(raw: Omit<PlannedShot, "id">[], segs: SegSentences[], maxGenerated: number): PlannedShot[] {
  const out: PlannedShot[] = [];
  let generated = 0, n = 0;
  for (const seg of segs) {
    const last = seg.sentences.length - 1;
    if (last < 0) continue;
    const mine = raw.filter((s) => s.segment_id === seg.id)
      .map((s) => ({ ...s, sentence_from: Math.max(0, Math.min(last, Math.round(s.sentence_from))), sentence_to: Math.max(0, Math.min(last, Math.round(s.sentence_to))) }))
      .sort((a, b) => a.sentence_from - b.sentence_from || a.sentence_to - b.sentence_to);
    let next = 0;
    const segShots: PlannedShot[] = [];
    for (const s of mine) {
      if (s.sentence_to < next) continue;            // solapado por completo
      const from = next;                              // cubre huecos previos
      const to = Math.max(s.sentence_to, from);
      segShots.push({ ...s, id: "", sentence_from: from, sentence_to: to });
      next = to + 1;
      if (next > last) break;
    }
    if (next <= last) {
      if (segShots.length) segShots[segShots.length - 1].sentence_to = last;
      else segShots.push({ id: "", segment_id: seg.id, sentence_from: 0, sentence_to: last, kind: "title_card", card_text: seg.title, motion: "static" });
    }
    for (const s of segShots) {
      if (s.kind === "generated") {
        if (generated >= maxGenerated || !s.prompt_en?.trim()) {
          s.kind = "text_card";
          s.card_text = s.card_text || shortPhrase(seg.sentences[s.sentence_from]);
        } else generated++;
      }
      if (s.kind === "archival" && !s.archival_query?.trim()) { s.kind = "text_card"; s.card_text = s.card_text || shortPhrase(seg.sentences[s.sentence_from]); }
      if (s.kind === "source_card" && !s.source_id) s.kind = "text_card";
      if ((s.kind === "title_card" || s.kind === "quote_card" || s.kind === "text_card") && !s.card_text?.trim()) s.card_text = s.kind === "title_card" ? seg.title : shortPhrase(seg.sentences[s.sentence_from]);
      if (!MOTIONS.includes(s.motion) && s.motion !== "static") s.motion = MOTIONS[n % 4];
      s.id = `sh${String(++n).padStart(3, "0")}`;
      out.push(s);
    }
  }
  // evitar el mismo movimiento dos veces seguidas
  for (let i = 1; i < out.length; i++) if (out[i].motion === out[i - 1].motion && out[i].motion !== "static") out[i].motion = MOTIONS[(MOTIONS.indexOf(out[i].motion) + 1) % 4];
  return out;
}

export function shortPhrase(sentence = "", maxWords = 8): string {
  const w = sentence.replace(/["“”]/g, "").split(/\s+/).filter(Boolean);
  return w.slice(0, maxWords).join(" ") + (w.length > maxWords ? "…" : "");
}

/** Reparte la duración de la narración de cada segmento entre sus tomas (por caracteres). */
export function allocateDurations(shots: PlannedShot[], segs: SegSentences[], segDurations: Record<string, number>, pause: number): PlannedShot[] {
  return shots.map((s) => {
    const seg = segs.find((x) => x.id === s.segment_id)!;
    const total = seg.sentences.reduce((a, t) => a + t.length + 1, 0) || 1;
    const mine = seg.sentences.slice(s.sentence_from, s.sentence_to + 1).reduce((a, t) => a + t.length + 1, 0);
    const segShots = shots.filter((x) => x.segment_id === s.segment_id);
    const isLast = segShots[segShots.length - 1]?.id === s.id;
    const d = (segDurations[s.segment_id] ?? 0) * (mine / total) + (isLast ? pause : 0);
    return { ...s, dur: Math.max(0.6, d) };
  });
}

// ---------- Capítulos y subtítulos ----------
export function chapters(segs: { id: string; title: string }[], segClipDur: Record<string, number>): { t: number; title: string }[] {
  let t = 0; const out: { t: number; title: string }[] = [];
  for (const s of segs) { out.push({ t, title: s.title }); t += segClipDur[s.id] ?? 0; }
  // YouTube: el primero en 0:00, al menos 3 capítulos de ≥10 s
  return out.filter((c, i) => i === 0 || c.t - out[i - 1].t >= 10);
}

const srtTime = (s: number) => {
  const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};

export function buildSrt(segs: SegSentences[], narrationDur: Record<string, number>, segClipDur: Record<string, number>): string {
  let base = 0, idx = 1; const out: string[] = [];
  for (const s of segs) {
    const nd = narrationDur[s.id] ?? 0;
    const total = s.sentences.reduce((a, t) => a + t.length + 1, 0) || 1;
    let t = base;
    for (const sen of s.sentences) {
      const d = nd * ((sen.length + 1) / total);
      // líneas de máx. ~84 caracteres
      const chunks = sen.length > 84 ? sen.match(/.{1,84}(\s|$)/g) ?? [sen] : [sen];
      const per = d / chunks.length;
      for (const ch of chunks) { out.push(`${idx++}\n${srtTime(t)} --> ${srtTime(t + per - 0.05)}\n${ch.trim()}\n`); t += per; }
    }
    base += segClipDur[s.id] ?? nd;
  }
  return out.join("\n");
}

// ---------- Descripción ----------
export function usedSources(script: ScriptOut, research: ResearchOut): Source[] {
  const ids = new Set<string>();
  for (const seg of script.segments) { seg.claims.forEach((c) => c.source_ids.forEach((s) => ids.add(s))); seg.on_screen_sources.forEach((s) => ids.add(s)); }
  return research.sources.filter((s) => ids.has(s.id));
}

export function composeDescription(o: {
  body: string; chapters: { t: number; title: string }[]; sources: Source[];
  credits: string[]; disclosure: string;
}): string {
  const parts = [o.body.trim()];
  if (o.chapters.length >= 3) parts.push("Chapters\n" + o.chapters.map((c) => `${fmtDuration(c.t)} ${c.title}`).join("\n"));
  if (o.sources.length) parts.push("Sources\n" + o.sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.publisher}${s.date && s.date !== "n.d." ? ` (${s.date})` : ""}: ${s.url}`).join("\n"));
  if (o.credits.length) parts.push("Credits\n" + o.credits.join("\n"));
  if (o.disclosure.trim()) parts.push(o.disclosure.trim());
  let text = parts.join("\n\n");
  if (text.length > 4900) text = text.slice(0, 4890) + "…";
  return text.replace(/[<>]/g, "");
}

export function sanitizeTags(tags: string[]): string[] {
  const out: string[] = []; let len = 0;
  for (const t of tags.map((x) => x.replace(/[<>,"]/g, "").trim()).filter(Boolean)) {
    if (out.includes(t)) continue;
    if (len + t.length + 2 > 480) break;
    out.push(t); len += t.length + 2;
  }
  return out;
}

// ---------- Vocabulario (repetición espaciada SM-2 simplificada) ----------
export function srsNext(card: { interval_d: number; ease: number; reps: number }, grade: 0 | 1 | 2): { interval_d: number; ease: number; reps: number; dueInDays: number } {
  // grade: 0 = no lo sabía, 1 = con dudas, 2 = lo sabía
  let { interval_d, ease, reps } = card;
  if (grade === 0) { reps = 0; interval_d = 0; ease = Math.max(1.3, ease - 0.2); return { interval_d, ease, reps, dueInDays: 0.007 }; }
  reps += 1;
  ease = Math.max(1.3, ease + (grade === 2 ? 0.1 : -0.05));
  interval_d = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval_d * ease * (grade === 1 ? 0.8 : 1));
  return { interval_d, ease, reps, dueInDays: interval_d };
}
