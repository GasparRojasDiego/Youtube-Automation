import { describe, it, expect } from "vitest";
import * as L from "./logic";
import { parseSkillFile, parseParamBlocks, stripParamBlocks } from "../lib/skills";
import { splitSentences, extractJson, zonedTimeToUtc, lineDiff, joinPath } from "../lib/util";
import { buildClaudeArgs, parseClaudeOutput, splitArgs } from "../providers/claude";
import { chunkText } from "../providers/tts";
import { buildVideoResource, isoDurationToSeconds } from "../providers/youtube";
import type { ScriptOut, ResearchOut } from "./types";

const research: ResearchOut = {
  summary_es: "", angle_en: "", open_questions_es: [], risks: [],
  sources: [{ id: "S1", url: "https://a.org/r", title: "Report", publisher: "A", date: "2022", type: "primary", reliability: "high", why_es: "" }],
  facts: [{ id: "F1", text_en: "X happened in 1850.", source_ids: ["S1"], quote: "X happened in 1850", quote_location: "p.1", confidence: "high", about_real_person: false, note_es: "" }],
};
const script: ScriptOut = {
  title_options: [{ title: "T", promise_es: "" }], originality_note_es: "",
  segments: [
    { id: "seg1", title: "Intro", purpose_es: "", text_en: "X happened in 1850. Nobody talks about it. Why?", on_screen_sources: ["S1"],
      claims: [{ id: "C1", text_en: "X happened in 1850.", fact_ids: ["F1"], source_ids: ["S1"], kind: "fact" },
        { id: "C2", text_en: "Nobody talks about it.", fact_ids: [], source_ids: [], kind: "fact" }] },
    { id: "seg2", title: "Meaning", purpose_es: "", text_en: "This suggests a pattern. It matters today.", on_screen_sources: [],
      claims: [{ id: "C3", text_en: "This suggests a pattern.", fact_ids: [], source_ids: [], kind: "inference" }] },
  ],
};

describe("guion", () => {
  it("detecta afirmaciones factuales sin respaldo", () => {
    const issues = L.checkScript(script, research);
    expect(issues.some((i) => i.claim_id === "C2" && i.severity === "block")).toBe(true);
    expect(issues.some((i) => i.claim_id === "C3")).toBe(false);
  });
  it("combina verificación del modelo con comprobaciones mecánicas", () => {
    const v = L.mergeVerification({ overall_es: "", title_checks: [], originality: { verdict: "ok", note_es: "" }, unlinked: [], segment_glosses: [], vocab: [],
      claims: [{ claim_id: "C1", verdict: "supported", severity: "ok", issues: [], note_es: "", suggested_fix_en: "", gloss_es: "", quote_gloss_es: "" }] },
      script, L.checkScript(script, research));
    expect(v.claims).toHaveLength(3);
    expect(v.claims.find((c) => c.claim_id === "C2")!.severity).toBe("block");
    expect(L.openBlocks(v)).toBe(1);
    v.claims.find((c) => c.claim_id === "C2")!.resolution = "accepted";
    expect(L.openBlocks(v)).toBe(0);
  });
});

describe("plan visual", () => {
  const segs = L.segmentSentences(script);
  it("cubre todas las oraciones sin huecos y limita las generadas", () => {
    const shots = L.repairPlan([
      { segment_id: "seg1", sentence_from: 1, sentence_to: 1, kind: "generated", prompt_en: "a", motion: "zoom_in" },
      { segment_id: "seg1", sentence_from: 1, sentence_to: 2, kind: "generated", prompt_en: "b", motion: "zoom_in" },
      { segment_id: "seg2", sentence_from: 5, sentence_to: 9, kind: "archival", archival_query: "", motion: "static" },
    ], segs, 1);
    const s1 = shots.filter((s) => s.segment_id === "seg1");
    expect(s1[0].sentence_from).toBe(0);
    expect(s1[s1.length - 1].sentence_to).toBe(2);
    expect(shots.filter((s) => s.kind === "generated")).toHaveLength(1);
    const s2 = shots.filter((s) => s.segment_id === "seg2");
    expect(s2[0].sentence_from).toBe(0); expect(s2[0].sentence_to).toBe(1); expect(s2[0].kind).toBe("text_card");
    expect(shots[1].motion).not.toBe(shots[0].motion);
  });
  it("reparte duraciones y suma la pausa al final del segmento", () => {
    const shots = L.repairPlan([
      { segment_id: "seg1", sentence_from: 0, sentence_to: 0, kind: "text_card", card_text: "a", motion: "zoom_in" },
      { segment_id: "seg1", sentence_from: 1, sentence_to: 2, kind: "text_card", card_text: "b", motion: "zoom_out" },
      { segment_id: "seg2", sentence_from: 0, sentence_to: 1, kind: "text_card", card_text: "c", motion: "pan_left" },
    ], segs, 0);
    const d = L.allocateDurations(shots, segs, { seg1: 6, seg2: 4 }, 0.5);
    const sum1 = d.filter((s) => s.segment_id === "seg1").reduce((a, s) => a + s.dur!, 0);
    expect(sum1).toBeCloseTo(6.5, 5);
    expect(d.find((s) => s.segment_id === "seg2")!.dur).toBeCloseTo(4.5, 5);
  });
});

describe("metadatos", () => {
  it("capítulos, subtítulos y descripción", () => {
    const ch = L.chapters([{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }], { a: 30, b: 5, c: 40 });
    expect(ch[0].t).toBe(0); expect(ch.map((c) => c.title)).toEqual(["A", "B"]);
    const srt = L.buildSrt(L.segmentSentences(script), { seg1: 6, seg2: 4 }, { seg1: 6.5, seg2: 4.5 });
    expect(srt.startsWith("1\n00:00:00,000 --> ")).toBe(true);
    const desc = L.composeDescription({ body: "Body", chapters: [{ t: 0, title: "A" }, { t: 60, title: "B" }, { t: 130, title: "C" }], sources: research.sources, credits: ["Music: x"], disclosure: "AI voice." });
    expect(desc).toContain("0:00 A"); expect(desc).toContain("2:10 C"); expect(desc).toContain("[1] Report — A (2022): https://a.org/r");
    expect(L.sanitizeTags(["a", "a", "b<c"])).toEqual(["a", "bc"]);
  });
  it("repetición espaciada", () => {
    let c = { interval_d: 0, ease: 2.5, reps: 0 };
    const a = L.srsNext(c, 2); expect(a.interval_d).toBe(1);
    c = a; const b = L.srsNext(c, 2); expect(b.interval_d).toBe(3);
    expect(L.srsNext(b, 0).reps).toBe(0);
  });
});

describe("habilidades", () => {
  it("lee frontmatter y bloques de parámetros (los comentados se ignoran)", () => {
    const md = `---\nname: "Voz"\ndescription: "d"\nscopes: [script, verify, nope]\n---\nTexto\n\`\`\`atril:montaje\n{"transition":"cut"}\n\`\`\`\n<!--\n\`\`\`atril:visual\n{"accent":"#fff"}\n\`\`\`\n-->`;
    const f = parseSkillFile(md);
    expect(f.name).toBe("Voz"); expect(f.scopes).toEqual(["script", "verify"]);
    const p = parseParamBlocks(f.body);
    expect(p.params.montaje.transition).toBe("cut"); expect(p.params.visual).toBeUndefined();
    expect(stripParamBlocks(f.body)).toBe("Texto");
  });
});

describe("utilidades", () => {
  it("oraciones, JSON, zonas horarias, rutas y diff", () => {
    expect(splitSentences("Dr. Smith went to Washington. It was 1850! Was it?")).toEqual(["Dr. Smith went to Washington.", "It was 1850!", "Was it?"]);
    expect(extractJson('texto ```json\n{"a":{"b":"}"}}\n``` fin')).toEqual({ a: { b: "}" } });
    expect(zonedTimeToUtc("2026-07-01", "12:00", "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "12:00", "America/New_York").toISOString()).toBe("2026-12-01T17:00:00.000Z");
    expect(joinPath("C:\\Users\\x\\", "a", "b.txt")).toBe("C:\\Users\\x\\a\\b.txt");
    expect(lineDiff("a\nb\nc", "a\nc\nd").map((d) => d.type)).toEqual(["same", "del", "same", "add"]);
  });
  it("trocea texto para TTS respetando el límite", () => {
    const text = "This is a sentence. ".repeat(500);
    const chunks = chunkText(text, 1000);
    expect(chunks.every((c) => new TextEncoder().encode(c).length <= 1000)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(text.replace(/\s+/g, " ").trim());
  });
});

describe("proveedores", () => {
  it("arma los argumentos de Claude Code", () => {
    const args = buildClaudeArgs({ stage: "research", system: "sys", schema: { type: "object" }, tools: ["WebSearch", "WebFetch"] },
      { path: "claude", extraArgs: '--fallback-model "sonnet"', models: { research: "sonnet" } as any, effort: { research: "medium" } as any, timeoutMin: 10 });
    expect(args).toContain("--json-schema"); expect(args[args.indexOf("--tools") + 1]).toBe("WebSearch,WebFetch");
    expect(args.slice(-2)).toEqual(["--fallback-model", "sonnet"]);
    expect(splitArgs(`a "b c" 'd'`)).toEqual(["a", "b c", "d"]);
  });
  it("interpreta la salida de Claude Code", () => {
    const ok = parseClaudeOutput<{ x: number }>(JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: { x: 1 }, total_cost_usd: 0.5, num_turns: 3 }), "", 0);
    expect(ok.data.x).toBe(1); expect(ok.apiEquivUsd).toBe(0.5);
    expect(() => parseClaudeOutput(JSON.stringify({ is_error: true, subtype: "error_during_execution", result: "Usage limit reached" }), "", 1)).toThrow(/límite de uso/);
    expect(() => parseClaudeOutput("", "Please run /login", 1)).toThrow(/sesión/);
  });
  it("recurso de video para YouTube", () => {
    const r = buildVideoResource({ title: "t", description: "d", tags: ["a"], categoryId: "27", defaultLanguage: "en", privacy: "public", publishAt: "2026-10-07T16:00:00Z", containsSyntheticMedia: true });
    expect(r.status.privacyStatus).toBe("private"); expect(r.status.publishAt).toBe("2026-10-07T16:00:00Z"); expect(r.status.containsSyntheticMedia).toBe(true);
    expect(isoDurationToSeconds("PT1H2M3S")).toBe(3723);
  });
});
