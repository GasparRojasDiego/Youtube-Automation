import { describe, it, expect } from "vitest";
import { videoNote, indexNote, noteName } from "./vault";
import { cleanMemory } from "../lib/obsidian";

const v = { id: "v1", channel_id: "c", topic_id: null, title: "Borrador", mode: "standard", voice_mode: "ai", status: "ready", stage: null, dir: "/x", created_at: Date.UTC(2026, 9, 11), updated_at: 0, scheduled_at: null, published_at: null, youtube_id: null, upload_session: null, data: {} } as any;

describe("notas de Obsidian", () => {
  it("nota de video: metadatos, capítulos y piezas usadas", () => {
    const md = videoNote(v, 7, {
      pkg: { chosen_title: "El precio del café", description: "Texto.", chapters: [{ t: 0, title: "Inicio" }, { t: 75, title: "La ruta" }] } as any,
      render: { duration: 600, file: "/x/final.mp4" } as any,
      motion: { items: [{ pieces: ["stat", "map"], piece_use: "as_is", file: "a" }, { pieces: ["stat"], piece_use: "modify", file: "b" }, { file: null }] } as any,
    });
    expect(md).toContain('titulo: "El precio del café"');
    expect(md).toContain('estado: "Aceptado (sin publicar)"');
    expect(md).toContain("modo: Automatización");
    expect(md).toContain("- 1:15 La ruta");
    expect(md).toContain("3 en total · 2 renderizadas · 1 desde cero.");
    expect(md).toContain("- Cifra protagonista (`P.stat`) ×2");
    expect(md).toContain("[[Memoria para Claude]]");
  });

  it("índice con enlaces a cada nota y nombres de archivo seguros", () => {
    expect(noteName(3, 'Qué: "¿precio?" / taza')).toBe("003 - Qué ¿precio taza");
    const md = indexNote([v], new Map([["v1", 7]]), new Map([["v1", "El precio | del café"]]));
    expect(md).toContain("[[007 - El precio del café\\|El precio / del café]]");
  });

  it("memoria: sin plantilla ni comentarios y con tope de longitud", () => {
    expect(cleanMemory("# Memoria para Claude\n\nEscribe aquí, en pocas líneas, lo que…\n\n<!-- nota -->\nNo repetir temas de café.")).toBe("No repetir temas de café.");
    expect(cleanMemory("x ".repeat(2000)).length).toBeLessThanOrEqual(1501);
  });
});
