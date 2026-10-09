import { describe, it, expect } from "vitest";
import { sectionsFor, headingTags, stageSizes, KIND_SCOPES } from "./skills";

const MD = `# Estilo
Regla global.

## Gancho [guion]
Primera frase concreta.

### Ejemplo
✅ "In 1962…"

## Efectos [animaciones]
Cámara que entra al detalle.

\`\`\`bash
# esto no es un título [guion]
\`\`\`

## Miniatura [paquete, miniatura]
Cuatro palabras.

## Notas [beta]
Sin etiqueta conocida.`;

describe("secciones por etapa", () => {
  it("reconoce etiquetas con o sin tildes y descarta las desconocidas", () => {
    expect(headingTags("Efectos [Animaciones]")?.scopes).toEqual(["motion"]);
    expect(headingTags("Ángulo [temas, investigación, guion]")?.scopes).toEqual(["topics", "research", "script"]);
    expect(headingTags("Notas [beta]")).toBeNull();
    expect(headingTags("Sin etiquetas")).toBeNull();
  });

  it("manda cada sección solo a su etapa y hereda en los subtítulos", () => {
    const script = sectionsFor(MD, KIND_SCOPES.script, ["script"]);
    expect(script).toContain("Regla global.");
    expect(script).toContain("## Gancho\n");
    expect(script).toContain("In 1962");
    expect(script).not.toContain("Cámara que entra");
    expect(script).toContain("## Notas [beta]");
    const motion = sectionsFor(MD, KIND_SCOPES.script, ["motion", "visuals"]);
    expect(motion).toContain("## Efectos");
    expect(motion).toContain("# esto no es un título [guion]");
    expect(motion).not.toContain("Regla global.");
    expect(motion).not.toContain("Primera frase");
  });

  it("una sección etiquetada llega a etapas de otro tipo", () => {
    const pkg = sectionsFor(MD, KIND_SCOPES.visual, ["thumbnail", "metadata"]);
    expect(pkg).toContain("Cuatro palabras.");
    expect(pkg).toContain("Regla global.");
    expect(pkg).not.toContain("Primera frase");
  });

  it("calcula cuánto recibe cada etapa", () => {
    const sizes = Object.fromEntries(stageSizes(MD, KIND_SCOPES.script).map((s) => [s.scope, s.chars]));
    expect(sizes.motion).toBeGreaterThan(0);
    expect(sizes.script).toBeGreaterThan(sizes.motion);
    expect(sizes.edit).toBe(0);
  });
});
