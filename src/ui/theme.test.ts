// Contraste de cada color de la app en los dos temas (WCAG 2.2: texto ≥ 4,5:1; iconos y bordes ≥ 3:1), leído de index.css.
import { describe, it, expect } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";
import { ACCENTS } from "./theme";

const css = nfs.readFileSync(path.resolve(__dirname, "../styles/index.css"), "utf8");

/** Variables de un bloque CSS por su selector exacto. */
function block(selector: string): Record<string, string> {
  const m = new RegExp(`(^|\\n)${selector.replace(/[.[\]"*+?^${}()|\\]/g, "\\$&")}\\s*\\{`).exec(css);
  if (!m) return {};
  const i = m.index + m[0].length;
  const body = css.slice(i, css.indexOf("}", i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const LIGHT = block(":root"), DARK = block(".dark");
const tokens = (dark: boolean, accent: string) => ({ ...(dark ? { ...LIGHT, ...DARK } : LIGHT), ...(accent === "blue" ? {} : block(dark ? `.dark[data-accent="${accent}"]` : `[data-accent="${accent}"]`)) });

function rgb(hsl: string): [number, number, number] {
  const [h, s, l] = hsl.split(/\s+/).map((x) => parseFloat(x));
  const S = s / 100, L = l / 100, k = (n: number) => (n + h / 30) % 12, a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
const lum = (c: [number, number, number]) => {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const WHITE = "0 0% 100%";

describe("colores de la app", () => {
  it("hay seis acentos y cada uno tiene sus valores en los dos temas", () => {
    expect(ACCENTS.map((a) => a.id)).toEqual(["blue", "violet", "green", "orange", "pink", "teal"]);
    for (const a of ACCENTS.slice(1)) {
      expect(Object.keys(block(`[data-accent="${a.id}"]`))).toEqual(expect.arrayContaining(["primary", "primary-strong", "nav-active", "nav-active-foreground", "logo-ring"]));
      expect(Object.keys(block(`.dark[data-accent="${a.id}"]`))).toEqual(expect.arrayContaining(["primary", "primary-strong", "nav-active", "nav-active-foreground", "logo-ring"]));
    }
  });

  for (const dark of [false, true]) {
    for (const a of ACCENTS) {
      it(`${a.name} en ${dark ? "oscuro" : "claro"}: texto de color, texto blanco sobre lo sólido y opción activa del menú`, () => {
        const t = tokens(dark, a.id);
        // Las muestras de Ajustes usan el mismo color que la app
        expect(t.primary).toBe(dark ? a.dark : a.light);
        expect(ratio(t.primary, t.card)).toBeGreaterThanOrEqual(4.5);           // texto de color sobre una tarjeta
        expect(ratio(t.primary, t.background)).toBeGreaterThanOrEqual(3);       // iconos y bordes sobre el fondo
        expect(ratio(WHITE, t["primary-strong"])).toBeGreaterThanOrEqual(4.5);  // botón sólido con texto blanco
        expect(ratio(t["nav-active-foreground"], t["nav-active"])).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`neutros en ${dark ? "oscuro" : "claro"}: texto y texto secundario legibles`, () => {
      const t = tokens(dark, "blue");
      expect(ratio(t.foreground, t.background)).toBeGreaterThanOrEqual(7);
      expect(ratio(t["muted-foreground"], t.card)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t["soft-foreground"], t.soft)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(WHITE, t.destructive)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("ni blanco ni negro puros de fondo (regla de la familia)", () => {
    for (const t of [LIGHT, DARK]) for (const k of ["background", "card"]) expect(t[k]).not.toMatch(/ 0%$| 100%$/);
  });
});
