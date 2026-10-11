import { describe, it, expect } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";
import { PIECES, pieceSource, pieceCatalog, pieceUsage } from "./pieces";
import { pickPieces } from "../pipeline/timeline";
import { motionPrompt } from "../pipeline/prompts2";

const JS = nfs.readFileSync(path.resolve(__dirname, "../../src-tauri/resources/motion/pieces.js"), "utf8");

describe("piezas listas", () => {
  it("cada pieza del catálogo tiene su código, y cada código su ficha", () => {
    expect(PIECES.length).toBeGreaterThanOrEqual(30);
    for (const p of PIECES) {
      const src = pieceSource(p.id, JS);
      expect(src, p.id).toBeTruthy();
      expect(src!).toContain(`P.${p.id} = function (tl, at, o)`);
      expect(src!).toContain(`P.${p.id}.dur = ${p.dur};`);
    }
    const marked = [...JS.matchAll(/\/\*@piece (\w+)\*\//g)].map((m) => m[1]);
    expect(marked.sort()).toEqual(PIECES.map((p) => p.id).sort());
    expect(new Set(PIECES.map((p) => p.id)).size).toBe(PIECES.length);
  });

  it("catálogo para el prompt y uso tal cual", () => {
    expect(pieceCatalog().split("\n")).toHaveLength(PIECES.length);
    expect(pieceUsage(PIECES[0])).toMatch(/^const tl = gsap\.timeline\(\);\nP\.\w+\(tl, 0, \{.*\}\);\nATRIL\.register\(tl, \d+\);$/);
  });

  it("Retoques: solo piezas del tipo correcto y que existan", () => {
    expect(pickPieces("fullscreen", ["P.stat", "lower", "nope", "map"], "as_is")).toEqual({ pieces: ["stat", "map"], piece_use: "as_is", libs: ["map"] });
    expect(pickPieces("overlay", ["lower", "callout"], "modify")).toEqual({ pieces: ["lower"], piece_use: "modify", libs: [] });
    expect(pickPieces("fullscreen", ["stat"], "none")).toEqual({ libs: [] });
    expect(pickPieces("overlay", ["stat"], "as_is")).toEqual({ libs: [] });
  });

  it("el código de la pieza solo viaja en el prompt cuando hay que modificarla", () => {
    const base = { id: "m1", kind: "fullscreen", duration: 6, brief: "b", text: "t", libs: [], context: "c", assets: [], icons: [] };
    expect(motionPrompt({ ...base, pieces: ["stat"], pieceUse: "as_is" })).toContain("AS_IS P.stat(tl, at,");
    expect(motionPrompt({ ...base, pieces: ["stat"], pieceUse: "as_is" })).not.toContain("<piece");
    const mod = motionPrompt({ ...base, pieces: ["stat"], pieceUse: "modify" });
    expect(mod).toContain('<piece id="stat">');
    expect(mod).toContain("P.stat = function (tl, at, o)");
    expect(motionPrompt(base)).toContain("from scratch");
  });
});
