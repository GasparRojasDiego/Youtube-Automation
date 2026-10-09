// Lógica pura del pipeline (sin E/S): validación de guion, reparación del plan
// visual, reparto de tiempos, capítulos, subtítulos y descripción.
import { splitSentences, wordCount, fmtDuration } from "../lib/util";
import type { ScriptOut, ResearchOut, VerifyOut, Source, ClaimCheck } from "./types";

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
        // Avisos, no bloqueos: la revisión del modelo decide si algo es falso
        if (!known.length) issues.push({ segment_id: seg.id, claim_id: c.id, problem_es: "Afirmación factual sin ningún hecho de la investigación que la respalde.", severity: "warn" });
        if (c.fact_ids.some((f) => !factIds.has(f))) issues.push({ segment_id: seg.id, claim_id: c.id, problem_es: "Cita hechos que no existen en la investigación.", severity: "warn" });
        if (c.source_ids.some((s) => !srcIds.has(s))) issues.push({ segment_id: seg.id, claim_id: c.id, problem_es: "Cita fuentes que no existen en la investigación.", severity: "warn" });
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

/** Subtítulos SRT con los tiempos reales de la voz (oraciones alineadas). */
export function buildSrtAligned(segs: { id: string; sentences: string[]; spans: { start: number; end: number }[] }[], offsets: Record<string, number>): string {
  const out: string[] = []; let idx = 1;
  for (const s of segs) {
    const base = offsets[s.id] ?? 0;
    s.sentences.forEach((sen, i) => {
      const sp = s.spans[i]; if (!sp) return;
      const words = sen.split(/\s+/).filter(Boolean);
      // trozos de ≤ 84 caracteres, con tiempo proporcional a su longitud
      const chunks: string[][] = []; let cur: string[] = [];
      for (const w of words) { if ([...cur, w].join(" ").length > 84 && cur.length) { chunks.push(cur); cur = []; } cur.push(w); }
      if (cur.length) chunks.push(cur);
      const total = chunks.reduce((a, c) => a + c.join(" ").length, 0) || 1;
      let t = base + sp.start;
      for (const c of chunks) {
        const d = (sp.end - sp.start) * (c.join(" ").length / total);
        out.push(`${idx++}\n${srtTime(t)} --> ${srtTime(t + Math.max(0.3, d - 0.02))}\n${c.join(" ")}\n`);
        t += d;
      }
    });
  }
  return out.join("\n");
}

// ---------- Créditos ----------
const SRC_NAME: Record<string, string> = { iconify: "Iconify", pexels: "Pexels", pixabay: "Pixabay", wikimedia: "Wikimedia Commons", openverse: "Openverse", nasa: "NASA", met: "The Met Open Access", freesound: "Freesound" };

/**
 * Líneas de créditos: las licencias que exigen atribución (CC BY, CC BY-SA)
 * van completas; el resto (CC0, dominio público, Pexels, Pixabay) se resume.
 */
export function creditLines(assets: { kind: string; source: string; title: string; author: string; license: string; page_url: string | null }[], ownTrackTitles: string[] = [], ownAttributions: string[] = []): string[] {
  const lines: string[] = [];
  const label = (k: string) => (k === "video" ? "Footage" : k === "sfx" ? "Sound" : k === "music" ? "Music" : k === "icon" ? "Icon" : "Image");
  const req = assets.filter((a) => /^CC BY/i.test(a.license));
  for (const a of req) lines.push(`${label(a.kind)}: "${a.title.slice(0, 80)}" by ${a.author.slice(0, 60) || "Unknown"} — ${a.license} — ${a.page_url ?? SRC_NAME[a.source] ?? a.source}`);
  const rest = assets.filter((a) => !/^CC BY/i.test(a.license) && a.source !== "user" && a.source !== "atril" && a.source !== "generated");
  const bySrc = new Map<string, number>();
  for (const a of rest) { const k = `${SRC_NAME[a.source] ?? a.source}${a.kind === "sfx" ? " (sound effects)" : a.kind === "music" ? " (music)" : a.kind === "icon" ? " (icons)" : ""}`; bySrc.set(k, (bySrc.get(k) ?? 0) + 1); }
  if (bySrc.size) lines.push(`Additional public-domain and royalty-free media: ${[...bySrc.entries()].map(([k, n]) => `${k} (${n})`).join(", ")}.`);
  for (const a of ownAttributions) if (a.trim()) lines.push(`Music: ${a.trim()}`);
  void ownTrackTitles;
  return lines;
}

/** Ajusta el aviso de IA a lo que el video realmente contiene (voz e ilustraciones). */
export function adaptDisclosure(text: string, o: { generatedImages: boolean; aiVoice: boolean }): string {
  let t = text;
  if (!o.generatedImages) t = t.replace(/\s*Some illustrations are AI-generated;?\s*/i, " ");
  if (!o.aiVoice) t = t.replace(/\s*Narration in this video uses an AI-generated voice\.?\s*/i, " ");
  return t.replace(/\s+/g, " ").trim().replace(/(^|[.!?] )([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
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
  if (o.disclosure.trim()) parts.push(o.disclosure.trim());
  // Los créditos se ajustan al espacio que queda (límite de YouTube: 5000 caracteres)
  const room = 4900 - parts.join("\n\n").length - 12;
  if (o.credits.length && room > 80) {
    let credits = o.credits.slice();
    const fits = (c: string[]) => ("Credits\n" + c.join("\n")).length <= room;
    if (!fits(credits)) credits = credits.map((c) => c.replace(/ — https?:\/\/\S+$/, ""));
    while (credits.length > 1 && !fits([...credits, "…and 9999 more (full list on request)."])) credits.pop();
    if (credits.length < o.credits.length) credits.push(`…and ${o.credits.length - credits.length} more (full list on request).`);
    parts.splice(parts.length - (o.disclosure.trim() ? 1 : 0), 0, "Credits\n" + credits.join("\n"));
  }
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
