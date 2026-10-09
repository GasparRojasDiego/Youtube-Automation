import { describe, it, expect } from "vitest";
import { repairStoryboard, layoutShots, segmentOffsets, beatSfxToCues, applyPolish, repairMusic, buildEdl, ensureMotionCadence, keywordsQuery, fallbackQueries, motionCues, type SegInfo } from "./timeline";
import { buildSrtAligned, creditLines, composeDescription, adaptDisclosure } from "./logic";
import { normLicense, rankCandidates, type Candidate } from "../media/sources";
import { ftsQuery } from "../media/library";

const segs: SegInfo[] = [
  { id: "seg1", title: "Intro", sentences: ["One.", "Two two.", "Three three three.", "Four."], spans: [{ start: 0.2, end: 1.5 }, { start: 1.8, end: 3.4 }, { start: 3.8, end: 6.0 }, { start: 6.3, end: 7.5 }], narration: 7.8 },
  { id: "seg2", title: "Body", sentences: ["Five.", "Six."], spans: [{ start: 0.1, end: 2 }, { start: 2.3, end: 4.6 }], narration: 4.8 },
];

describe("cadencia de animaciones", () => {
  it("añade una secuencia en cada minuto que no tiene", () => {
    const long: SegInfo[] = [{ id: "a", title: "A", sentences: Array.from({ length: 40 }, (_, i) => `S${i}.`), spans: Array.from({ length: 40 }, (_, i) => ({ start: i * 4, end: i * 4 + 3.6 })), narration: 160 }];
    const raw = Array.from({ length: 40 }, (_, i) => ({ segment_id: "a", from: i, to: i, shots: [{ visual: "photo", query_en: "q" }] }));
    const laid = layoutShots(repairStoryboard(raw as any, long, 0, new Set()).shots, long, 0.6);
    const off = segmentOffsets(long, 0.6);
    const m = ensureMotionCadence([], laid, off, 160.6, 10, () => "narration");
    expect(m.length).toBe(3);                                   // minutos 0, 1 y 2
    for (const it of m) { expect(it.kind).toBe("fullscreen"); expect(it.duration).toBeGreaterThanOrEqual(5); expect(it.duration).toBeLessThanOrEqual(16); }
    expect(new Set(m.flatMap((x) => x.shot_ids)).size).toBe(m.flatMap((x) => x.shot_ids).length); // sin tomas repetidas
    expect(ensureMotionCadence(m, laid, off, 160.6, 10, () => "").length).toBe(3);   // ya cumple
    expect(ensureMotionCadence([], laid, off, 160.6, 1, () => "").length).toBe(1);   // respeta el tope
  });
});

describe("storyboard y línea de tiempo", () => {
  const raw = [
    { segment_id: "seg1", from: 0, to: 0, shots: [{ visual: "photo", query_en: "old tower" }], sfx: [{ at: "start" as const, type: "whoosh", query_en: "whoosh" }] },
    { segment_id: "seg1", from: 2, to: 3, shots: [{ visual: "motion", motion_brief_en: "timeline 1889" }, { visual: "archival", query_en: "" }] },
    { segment_id: "seg2", from: 1, to: 5, shots: [{ visual: "source_card", source_id: "S9" }] },
  ];
  it("cubre todas las oraciones, sin huecos, y respeta el presupuesto de animaciones", () => {
    const { shots, beatSfx } = repairStoryboard(raw as any, segs, 0, new Set(["S1"]));
    // seg1: beat 0-0, beat 1-3 (hueco en 1 cubierto); seg2: 0-1
    expect(shots.filter((s) => s.segment_id === "seg1").map((s) => [s.from, s.to])).toEqual([[0, 0], [1, 3], [1, 3]]);
    expect(shots.find((s) => s.visual === "motion")).toBeUndefined();        // presupuesto 0
    expect(shots.filter((s) => s.visual === "text_card").length).toBe(1);    // fuente inválida → tarjeta (dentro del tope)
    expect(shots.every((s) => !["photo", "archival", "clip"].includes(s.visual) || !!s.query_en)).toBe(true); // sin consulta → se deduce de la narración
    expect(beatSfx.length).toBe(1);
  });
  it("limita las tarjetas y convierte las demás en animación o imagen", () => {
    const many = [0, 1, 2, 3].map((i) => ({ segment_id: "seg1", from: i, to: i, shots: [{ visual: "text_card", card_text: `T${i}` }, { visual: "quote_card", card_text: `Q${i}` }] }));
    const { shots } = repairStoryboard(many as any, segs, 1, new Set(), { maxCards: 4 });
    const seg1 = shots.filter((s) => s.segment_id === "seg1");
    expect(seg1.filter((s) => s.visual.endsWith("_card")).length).toBe(4);
    expect(seg1.filter((s) => s.visual === "motion").length).toBe(1);
    expect(seg1.filter((s) => s.visual === "photo").length).toBe(3);
    expect(seg1.filter((s) => s.visual === "photo").every((s) => !!s.query_en)).toBe(true);
  });
  it("imágenes con IA solo si hay proveedor", () => {
    const r = [{ segment_id: "seg1", from: 0, to: 3, shots: [{ visual: "ai_image", query_en: "coolant jug engine", image_prompt_en: "close-up of coolant" }] }];
    expect(repairStoryboard(r as any, segs, 0, new Set(), { aiImages: true }).shots[0].visual).toBe("ai_image");
    expect(repairStoryboard(r as any, segs, 0, new Set(), { aiImages: false }).shots[0].visual).toBe("photo");
  });
  it("consultas de respaldo cada vez más genéricas", () => {
    expect(fallbackQueries("antifreeze coolant jug car engine", ["coolant bottle"])).toEqual(["antifreeze coolant jug car engine", "coolant bottle", "car engine", "antifreeze coolant", "engine"]);
    expect(keywordsQuery("The engine overheated because the coolant was gone.")).toBe("overheated coolant engine");
  });
  it("asigna tiempos exactos y continuos por segmento", () => {
    const { shots, beatSfx } = repairStoryboard(raw as any, segs, 2, new Set(["S9"]));
    const laid = layoutShots(shots, segs, 0.6);
    for (const id of ["seg1", "seg2"]) {
      const ss = laid.filter((s) => s.segment_id === id);
      expect(ss[0].start).toBe(0);
      for (let i = 1; i < ss.length; i++) expect(ss[i].start).toBeCloseTo(ss[i - 1].start! + ss[i - 1].dur!, 5);
      const seg = segs.find((s) => s.id === id)!;
      expect(ss.at(-1)!.start! + ss.at(-1)!.dur!).toBeCloseTo(Math.round((seg.narration + 0.6) * 30) / 30, 5);
    }
    // el segundo beat empieza en mitad de la pausa entre la oración 0 y la 1
    expect(laid.find((s) => s.from === 1)!.start).toBeCloseTo((1.5 + 1.8) / 2, 1);
    const off = segmentOffsets(segs, 0.6);
    expect(off.seg2).toBeCloseTo(8.4, 5);
    const cues = beatSfxToCues(beatSfx, laid, off);
    expect(cues[0].at).toBe(0);
    const edl = buildEdl(laid, segs, off, cues, (s) => s.visual);
    expect(edl).toContain("seg2");
  });
  it("valida los retoques de Opus", () => {
    const { shots } = repairStoryboard(raw as any, segs, 2, new Set(["S9"]));
    const laid = layoutShots(shots, segs, 0.6);
    const ids = laid.map((s) => s.id);
    const r = applyPolish({
      grade: "cold", notes_es: "",
      shots: [{ id: ids[1], transition_in: "smoothleft", transition_s: 9, motion: "punch_in", grade: "sepia", punch_at: 0.5, clip_audio_db: -99 }, { id: "nope", transition_in: "x", transition_s: 1, motion: "x", grade: "x", punch_at: -1, clip_audio_db: 0 }],
      sfx_add: [{ at: 3, type: "impact", query_en: "impact", gain_db: -50 }, { at: 999, type: "x", query_en: "", gain_db: -10 }],
      sfx_remove: [],
      motion: [
        { kind: "fullscreen", shot_ids: [ids[1], ids[2]], start_s: 0, duration_s: 5, brief_en: "timeline", text: "1889", libs: ["map"], asset_ids: [] },
        { kind: "overlay", shot_ids: [ids[0]], start_s: 0.2, duration_s: 30, brief_en: "date callout", text: "1889", libs: [], asset_ids: [] },
        { kind: "overlay", shot_ids: [ids[0]], start_s: 0, duration_s: 3, brief_en: "over budget", text: "", libs: [], asset_ids: [] },
      ],
    }, laid, [], segmentOffsets(segs, 0.6), 13, 2);
    const s1 = r.shots.find((s) => s.id === ids[1])!;
    expect(s1.transition_in).toBe("smoothleft");
    expect(s1.transition_s).toBe(1.2);
    expect(s1.clip_audio_db).toBeNull();
    expect(r.sfx.length).toBe(1);
    expect(r.sfx[0].gain_db).toBe(-30);
    expect(r.motion.length).toBe(2);
    expect(r.motion[1].duration).toBeLessThanOrEqual(12);
    expect(r.grade).toBe("cold");
  });
  it("todas las secciones reciben una cama musical", () => {
    const beds = repairMusic([{ segment_ids: ["seg2", "bad"], mood_en: "dark" }], ["seg1", "seg2"]);
    expect(beds.flatMap((b) => b.segment_ids).sort()).toEqual(["seg1", "seg2"]);
  });
});

describe("subtítulos, créditos y licencias", () => {
  it("SRT con los tiempos alineados", () => {
    const srt = buildSrtAligned(segs, { seg1: 0, seg2: 8.4 });
    expect(srt).toContain("00:00:00,200 --> ");
    expect(srt).toContain("00:00:08,500 --> ");
  });
  it("créditos: atribución completa para CC BY y resumen para el resto", () => {
    const lines = creditLines([
      { kind: "image", source: "wikimedia", title: "Tower", author: "Ann", license: "CC BY-SA 4.0", page_url: "https://commons.wikimedia.org/x" },
      { kind: "image", source: "pexels", title: "City", author: "Bob", license: "Licencia de Pexels", page_url: "https://pexels.com/1" },
      { kind: "sfx", source: "freesound", title: "whoosh", author: "c", license: "CC0", page_url: "" },
    ]);
    expect(lines[0]).toContain("CC BY-SA 4.0");
    expect(lines[1]).toContain("Pexels (1)");
    expect(lines[1]).toContain("Freesound (sound effects) (1)");
    const many = Array.from({ length: 200 }, (_, i) => `Image: "T${i}" by A — CC BY 4.0 — https://commons.wikimedia.org/wiki/File:${"x".repeat(40)}${i}`);
    const d = composeDescription({ body: "Body", chapters: [], sources: [], credits: many, disclosure: "AI voice." });
    expect(d.length).toBeLessThanOrEqual(4900);
    expect(d.trim().endsWith("AI voice.")).toBe(true);
  });
  it("el aviso de IA describe lo que el video contiene", () => {
    const t = "Narration in this video uses an AI-generated voice. Some illustrations are AI-generated; every factual claim is sourced below.";
    expect(adaptDisclosure(t, { generatedImages: false, aiVoice: true })).toBe("Narration in this video uses an AI-generated voice. Every factual claim is sourced below.");
    expect(adaptDisclosure(t, { generatedImages: false, aiVoice: false })).toBe("Every factual claim is sourced below.");
    expect(adaptDisclosure(t, { generatedImages: true, aiVoice: true })).toBe(t);
  });
  it("normaliza licencias y descarta NC/ND", () => {
    expect(normLicense("cc0")?.rank).toBe(3);
    expect(normLicense("by-sa", "4.0")?.license).toBe("CC BY-SA 4.0");
    expect(normLicense("CC BY 2.0")?.license).toBe("CC BY 2.0");
    expect(normLicense("CC BY-NC 4.0")).toBeNull();
    expect(normLicense("by-nd")).toBeNull();
    expect(normLicense("Public domain")?.rank).toBe(3);
    expect(normLicense("fair use")).toBeNull();
  });
  it("prefiere licencias sin atribución e intercala fuentes", () => {
    const c = (source: any, licenseRank: number, w = 1920): Candidate => ({ source, sourceId: Math.random().toString(), kind: "image", title: "", author: "", license: "", licenseUrl: "", attribution: "", pageUrl: "", downloadUrl: "", previewUrl: "", width: w, tags: [], query: "", licenseRank });
    const r = rankCandidates([c("wikimedia", 1), c("wikimedia", 1), c("pexels", 3), c("openverse", 2)], "image");
    expect(r[0].source).toBe("pexels");
    expect(r.at(-1)!.licenseRank).toBe(1);
  });
  it("consulta FTS segura", () => {
    expect(ftsQuery("The \"abandoned\" hospital, 1920s!")).toBe('"abandoned"* OR "hospital"* OR "1920s"*');
    expect(ftsQuery("a of")).toBe("");
  });
});

describe("efectos de sonido de las animaciones", () => {
  const m = { id: "m1", kind: "fullscreen" as const, shot_ids: ["s1"], start: 0, duration: 6, segment_id: "seg1", brief_en: "" };
  it("ordena, descarta lo que cae fuera, separa ≥0,25 s y gradúa el volumen", () => {
    const cues = motionCues(m, [
      { at: 2.0, type: "click", query_en: "ui click" }, { at: 0.4, type: "whoosh", query_en: "fast whoosh" },
      { at: 2.1, type: "pop", query_en: "soft pop" }, { at: 9, type: "impact", query_en: "deep impact" }, { at: Number.NaN, type: "pop", query_en: "" },
    ]);
    expect(cues.map((c) => [c.at, c.type])).toEqual([[0.4, "whoosh"], [2, "click"]]);
    expect(cues.map((c) => c.gain_db)).toEqual([-18, -21]);
    expect(motionCues(m, [{ at: -1, type: "impact", query_en: "deep impact" }]).map((c) => [c.at, c.gain_db])).toEqual([[0, -16]]);
    expect(cues[0].id).toBe("m1-fx1");
  });
  it("una capa superpuesta lleva como máximo 3", () => {
    const raw = Array.from({ length: 8 }, (_, i) => ({ at: i * 0.5, type: "pop", query_en: "pop" }));
    expect(motionCues({ ...m, kind: "overlay" }, raw)).toHaveLength(3);
    expect(motionCues(m, undefined)).toEqual([]);
  });
});
