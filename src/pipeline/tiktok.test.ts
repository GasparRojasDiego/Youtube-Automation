import { describe, it, expect } from "vitest";
import { splitPlan, partName, tiktokText } from "./tiktok";

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
  it("con fotogramas clave, corta en uno que cae dentro de una pausa", () => {
    const keys = Array.from({ length: 400 }, (_, i) => i);   // uno por segundo
    const p = splitPlan(400, [{ start: 86.6, end: 87.4 }, { start: 181.2, end: 182.3 }, { start: 271.5, end: 272.1 }], keys);
    expect(p.map((x) => x.end)).toEqual([87, 182, 272, 400]);
  });
  it("si ningún fotograma clave cae en una pausa, usa el más cercano a una pausa", () => {
    const keys = [0, 84, 88.5, 96, 180, 186, 270, 276];
    const p = splitPlan(400, [{ start: 89.2, end: 89.6 }], keys);
    expect(p[0].end).toBe(88.5);
    for (let i = 1; i < p.length; i++) expect(p[i].start).toBe(p[i - 1].end);
  });
  it("texto y hashtags salen del paquete, sin llamadas extra", () => {
    const v = { title: "T" } as any;
    expect(tiktokText(v, { tiktok_caption_en: "Hook", tiktok_hashtags: ["history", "#Harvard Report"], tags: [] } as any)).toEqual({ caption: "Hook", hashtags: ["#history", "#HarvardReport"] });
    expect(tiktokText(v, { tags: ["slavery", "harvard"], description_body_en: "Short.", chosen_title: "Title" } as any)).toEqual({ caption: "Title", hashtags: ["#fyp", "#slavery", "#harvard"] });
  });
});
