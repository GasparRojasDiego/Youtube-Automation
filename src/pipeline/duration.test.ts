import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { planDuration, stretchTimings, stretchAudioArgs, sentenceCuts, describePlan } from "./duration";
import { repairStoryboard, layoutShots, segmentLength, segmentOffsets, shotNarration, type SegInfo } from "./timeline";

vi.setConfig({ testTimeout: 60_000 });

const sp = (pairs: [number, number][]) => pairs.map(([start, end]) => ({ start, end }));

describe("duración exacta", () => {
  it("no toca nada si la narración ya llega al mínimo", () => {
    const p = planDuration([{ id: "a", narration: 31, spans: sp([[0, 10], [10.4, 20], [20.5, 31]]) }], 0.6, 30, 45);
    expect(p.total).toBe(p.natural);
    expect(p.tail.a).toBe(0); expect(p.breath.a).toBe(0);
  });

  it("5 palabras para un video de 30 s: todo lo que falta es un tramo instrumental y el total cuadra", () => {
    const p = planDuration([{ id: "a", narration: 2, spans: sp([[0.1, 1.9]]) }], 0.6, 30, 45, { vertical: true });
    expect(p.breath.a).toBe(0);                // una sola frase: no hay pausas que alargar
    expect(p.tail.a).toBeCloseTo(27.4, 1);
    expect(p.total).toBeCloseTo(30, 1);
    expect(describePlan(p, 0)).toContain("instrumentales");
  });

  it("varias frases: aire entre frases con tope, cierre y reparto proporcional; suma exacta", () => {
    const segs = [
      { id: "s1", narration: 8, spans: sp([[0, 2.5], [2.8, 5.1], [5.4, 7.9]]) },
      { id: "s2", narration: 6, spans: sp([[0, 2.9], [3.2, 5.9]]) },
    ];
    const p = planDuration(segs, 0.6, 30, 40, { vertical: true });
    expect(p.breath.s1).toBeLessThanOrEqual(0.6);
    expect(p.breath.s1).toBeGreaterThan(0);
    expect(p.tail.s2).toBeGreaterThan(p.tail.s1);   // el último lleva además el cierre
    const total = segs.reduce((a, s) => a + s.narration + 0.6 + p.breath[s.id] * (s.spans.length - 1) + p.tail[s.id], 0);
    expect(total).toBeCloseTo(30, 1);
    expect(p.total).toBeCloseTo(30, 1);
  });

  it("desplaza frases y palabras según el aire insertado", () => {
    const t = stretchTimings(sp([[0, 1], [1.4, 2.4], [2.8, 3.6]]), [[{ w: "a", s: 0, e: 1 }], [{ w: "b", s: 1.4, e: 2.4 }], [{ w: "c", s: 2.8, e: 3.6 }]], 0.5);
    expect(t.spans).toEqual(sp([[0, 1], [1.9, 2.9], [3.8, 4.6]]));
    expect(t.words![2][0]).toMatchObject({ s: 3.8, e: 4.6 });
    expect(sentenceCuts(sp([[0, 1], [1.4, 2.4]]))).toEqual([1.2]);
  });

  it("el audio estirado dura lo previsto (ffmpeg real)", () => {
    const d = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-aire-"));
    const src = path.join(d, "voz.wav"), out = path.join(d, "voz.aire.wav");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=300:d=1", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono:d=0.4", "-f", "lavfi", "-i", "sine=f=500:d=1",
      "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1,aformat=channel_layouts=mono[a]", "-map", "[a]", src]);
    execFileSync("ffmpeg", stretchAudioArgs(src, out, sentenceCuts(sp([[0, 1], [1.4, 2.4]])), 0.8));
    const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
    expect(dur).toBeCloseTo(2.4 + 0.8, 1);
  });

  it("storyboard: el tramo instrumental recibe sus propias tomas (o de respaldo) y la línea de tiempo dura lo pedido", () => {
    const seg: SegInfo = { id: "a", title: "Frame", sentences: ["Nueve megas."], spans: sp([[0.1, 1.9]]), narration: 2, tail: 27.4 };
    // Con plan del storyboard
    const withPlan = repairStoryboard([
      { segment_id: "a", from: 0, to: 0, shots: [{ visual: "photo", query_en: "phone app" }] },
      { segment_id: "a", from: 1, to: 1, shots: [{ visual: "motion", motion_brief_en: "logo reveal" }, { visual: "photo", query_en: "student desk" }, { visual: "photo", query_en: "laptop" }] },
      { segment_id: "a", from: 1, to: 1, shots: [{ visual: "photo", query_en: "library" }, { visual: "text_card", card_text: "Gratis" }] },
    ], [seg], 4, new Set(), { maxTailShot: 3.5 });
    // Las 5 tomas del plan y, como 27,4 s ÷ 3,5 s piden 8, tres más del tema
    const planned = withPlan.shots.filter((s) => s.from === 1);
    expect(planned).toHaveLength(8);
    expect(planned.slice(0, 2).map((s) => s.visual)).toEqual(["motion", "photo"]);
    const laid = layoutShots(withPlan.shots, [seg], 0.6);
    const total = laid.reduce((a, s) => a + (s.dur ?? 0), 0);
    expect(total).toBeCloseTo(segmentLength(seg, 0.6), 2);
    expect(total).toBeCloseTo(30, 1);
    const tail = laid.filter((s) => s.from === 1);
    expect(tail[0].start).toBeCloseTo(2.4, 1);                 // empieza al terminar la voz
    expect(Math.max(...tail.map((s) => s.dur ?? 0))).toBeLessThanOrEqual(3.5);
    expect(shotNarration(tail[0], seg)).toBe("");
    // Sin plan: tomas de respaldo (la primera, una animación de cierre)
    const fallback = repairStoryboard([{ segment_id: "a", from: 0, to: 0, shots: [{ visual: "photo", query_en: "phone" }] }], [seg], 4, new Set());
    const fb = fallback.shots.filter((s) => s.from === 1);
    expect(fb.length).toBeGreaterThanOrEqual(5);
    expect(fb[0].visual).toBe("motion");
    expect(fb[0].motion_brief_en).toMatch(/Closing/);
    expect(segmentOffsets([seg, { ...seg, id: "b", tail: 0 }], 0.6).b).toBeCloseTo(30, 1);
  });
});
