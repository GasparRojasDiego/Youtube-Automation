import { describe, it, expect } from "vitest";
import { cleanSvg } from "./icons";

describe("íconos", () => {
  it("acepta SVG limpios y fija el tamaño relativo", () => {
    const s = cleanSvg('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M1 1h22"/></svg>');
    expect(s).toContain('width="1em"');
    expect(s).toContain('viewBox="0 0 24 24"');
  });
  it("no toca el tamaño de las figuras internas", () => {
    const s = cleanSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/></svg>')!;
    expect(s).toMatch(/^<svg width="1em" height="1em"/);
    expect(s).toContain('<rect x="2" y="6" width="20" height="12"');
  });
  it("rechaza scripts, recursos externos o archivos que no son SVG", () => {
    expect(cleanSvg('<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>')).toBeNull();
    expect(cleanSvg('<svg viewBox="0 0 24 24" onload="x()"></svg>')).toBeNull();
    expect(cleanSvg('<svg viewBox="0 0 24 24"><image href="https://x.com/a.png"/></svg>')).toBeNull();
    expect(cleanSvg("<html></html>")).toBeNull();
    expect(cleanSvg('<svg width="24"></svg>')).toBeNull();
  });
});
