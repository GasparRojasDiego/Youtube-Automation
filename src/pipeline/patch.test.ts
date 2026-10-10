import { describe, it, expect } from "vitest";
import { applyPatch, motionSystem, motionPrompt } from "./prompts2";

const code = { css: ".a{color:red}\n.b{left:10px}", html: "<div id=\"t\">Hi</div>", js: "const tl = gsap.timeline();\ntl.to('#t', {x: 100});\nATRIL.register(tl, 2);" };

describe("correcciones por parches", () => {
  it("aplica cambios exactos y únicos en orden", () => {
    const r = applyPatch(code, [{ part: "js", find: "{x: 100}", replace: "{x: 400, duration: 0.6}" }, { part: "css", find: "color:red", replace: "color:#fff" }]);
    expect(r?.js).toContain("{x: 400, duration: 0.6}");
    expect(r?.css).toBe(".a{color:#fff}\n.b{left:10px}");
    expect(r?.html).toBe(code.html);
  });
  it("rechaza un texto que no está o que es ambiguo (se pedirá la versión completa)", () => {
    expect(applyPatch(code, [{ part: "js", find: "tl.from", replace: "x" }])).toBeNull();
    expect(applyPatch(code, [{ part: "css", find: "{", replace: "[" }])).toBeNull();
    expect(applyPatch(code, [])).toBeNull();
  });
  it("no modifica el original", () => {
    applyPatch(code, [{ part: "html", find: "Hi", replace: "Bye" }]);
    expect(code.html).toContain("Hi");
  });
});

describe("prompts de animación", () => {
  it("las reglas del canal y la paleta van en el system prompt (idéntico en todas las llamadas del video)", () => {
    const sys = motionSystem({ skills: "RULE: never use red", palette: { accent: "#C9A227" } });
    expect(sys).toContain("RULE: never use red");
    expect(sys).toContain("#C9A227");
    const p = motionPrompt({ id: "m1", kind: "fullscreen", duration: 6, brief: "x", text: "", libs: [], context: "", assets: [], icons: [] });
    expect(p).not.toContain("RULE: never use red");
    expect(p).toContain('id "m1"');
  });
});
