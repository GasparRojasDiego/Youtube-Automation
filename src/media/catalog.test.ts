import { describe, it, expect } from "vitest";
import { libraryMarkdown } from "./catalog";
import type { Asset } from "./library";

const a = (o: Partial<Asset>): Asset => ({ id: "x", kind: "image", source: "pexels", source_id: "", url: null, page_url: null, title: "", author: "", license: "", license_url: "", attribution: "",
  path: "C:\\Bib\\x.jpg", thumb: null, width: null, height: null, duration: null, bytes: null, sha: null, query: "", description: "", tags: "", mood: "", quality: 0, real_person: 0,
  usable: 1, issues: "", described_at: null, created_at: 0, used_count: 0, last_used: null, favorite: 0, ...o });

describe("catálogo .md de la biblioteca", () => {
  it("separa personal y automatización, explica el acceso de cada modo y describe cada recurso", () => {
    const md = libraryMarkdown(
      [a({ source: "personal", title: "Pantalla de inicio de Frame", path: "C:\\Bib\\Personal\\Clips\\frame-inicio.mp4", kind: "video", width: 1080, height: 1920, duration: 12.34, description: "Grabación de la pantalla principal." })],
      [a({ title: "Montañas", description: "Cordillera al amanecer.", tags: "montaña, amanecer", width: 1920, height: 1080, quality: 4, author: "Ana", license: "Licencia de Pexels" }), a({ kind: "sfx", title: "Whoosh", usable: 0 })],
      new Date("2026-10-14T12:00:00Z"));
    expect(md).toContain("## Biblioteca personal (1)");
    expect(md).toContain("## Biblioteca de automatización (2)");
    expect(md).toContain("**toda la biblioteca**");
    expect(md).toContain("**solo la biblioteca de automatización**");
    expect(md).toContain("- **Pantalla de inicio de Frame** — `frame-inicio.mp4` · 1080×1920 (vertical) · 12.3 s");
    expect(md).toContain("  - Descripción: Grabación de la pantalla principal.");
    expect(md).toContain("  - Origen: pexels · Ana · Licencia de Pexels");
    expect(md).toContain("### Efectos de sonido (1)");
    expect(md).toContain("**no utilizable**");
    expect(md).toContain("_(sin describir: pulsa «Describir» en Biblioteca)_");
    expect(md.indexOf("## Biblioteca personal")).toBeLessThan(md.indexOf("## Biblioteca de automatización"));
    expect(libraryMarkdown([], [])).toContain("_(vacía)_");
  });
});
