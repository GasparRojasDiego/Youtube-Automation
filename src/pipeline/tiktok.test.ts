import { describe, it, expect } from "vitest";
import { splitPlan, partName, partArgs } from "./tiktok";

describe("partes de TikTok", () => {
  it("parte cada 1:30 y une la última parte corta a la anterior", () => {
    const p = splitPlan(600, []);
    expect(p.map((x) => [x.start, x.end])).toEqual([[0, 90], [90, 180], [180, 270], [270, 360], [360, 450], [450, 600]]);
  });
  it("si la última parte dura exactamente 1:30 se queda sola", () => {
    expect(splitPlan(270, []).length).toBe(3);
  });
  it("un video corto queda en una sola parte", () => {
    expect(splitPlan(80, [])).toEqual([{ start: 0, end: 80 }]);
    expect(splitPlan(150, [])).toEqual([{ start: 0, end: 150 }]);
  });
  it("corta en la pausa entre frases más cercana (±6 s)", () => {
    const p = splitPlan(400, [87.2, 95, 181.9, 300]);
    expect(p[0].end).toBe(87.2);
    expect(p[1].end).toBe(181.9);
    expect(p.at(-1)!.end).toBe(400);
    for (let i = 1; i < p.length; i++) expect(p[i].start).toBe(p[i - 1].end);
  });
  it("nombres: parte 1 … parte final", () => {
    expect([0, 1, 2].map((i) => partName(i, 3))).toEqual(["parte 1", "parte 2", "parte final"]);
    expect(partName(0, 1)).toBe("parte 1");
  });
  it("vertical con fondo desenfocado y rótulo", () => {
    const a = partArgs({ input: "in.mp4", start: 90, dur: 90, out: "parte 2.mp4", vertical: true, label: "Parte 2", font: "_f.ttf" });
    const f = a[a.indexOf("-filter_complex") + 1];
    expect(f).toContain("crop=1080:1920");
    expect(f).toContain("drawtext=fontfile=_f.ttf:text='Parte 2'");
    expect(a.at(-1)).toBe("parte 2.mp4");
  });
});
