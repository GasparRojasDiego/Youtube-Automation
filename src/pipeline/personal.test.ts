import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";

vi.mock("../lib/ipc", () => import("../../e2e/node-ipc"));
const { extractText, kindOf, voiceFor, systemFor, personalBrief } = await import("./personal");

/** Zip mínimo (deflate) para simular docx/pptx/odt. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text); const data = zlib.deflateRawSync(raw); const nb = Buffer.from(name); const crc = zlib.crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, data); centrals.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

describe("modo personal", () => {
  const dir = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-personal-"));
  it("lee el texto de docx, pptx, odt, txt y rtf", async () => {
    nfs.writeFileSync(path.join(dir, "a.docx"), zip({ "[Content_Types].xml": "<x/>", "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>Hola &amp; adiós</w:t></w:r></w:p><w:p><w:r><w:t>Segunda línea</w:t></w:r></w:p></w:body></w:document>" }));
    nfs.writeFileSync(path.join(dir, "b.pptx"), zip({ "ppt/slides/slide2.xml": "<p:sld><a:p><a:r><a:t>Dos</a:t></a:r></a:p></p:sld>", "ppt/slides/slide1.xml": "<p:sld><a:p><a:r><a:t>Uno</a:t></a:r></a:p></p:sld>" }));
    nfs.writeFileSync(path.join(dir, "c.odt"), zip({ "content.xml": "<office:text><text:h>Título</text:h><text:p>Cuerpo</text:p></office:text>" }));
    nfs.writeFileSync(path.join(dir, "d.txt"), "  texto plano \n");
    nfs.writeFileSync(path.join(dir, "e.rtf"), "{\\rtf1\\ansi{\\fonttbl\\f0 Arial;}\\f0 Hola\\par Mundo}");
    expect(await extractText(path.join(dir, "a.docx"))).toBe("Hola & adiós\nSegunda línea");
    expect(await extractText(path.join(dir, "b.pptx"))).toBe("[Diapositiva 1]\nUno\n\n[Diapositiva 2]\nDos");
    expect(await extractText(path.join(dir, "c.odt"))).toBe("Título\nCuerpo");
    expect(await extractText(path.join(dir, "d.txt"))).toBe("texto plano");
    expect(await extractText(path.join(dir, "e.rtf"))).toContain("Hola\n Mundo".replace("\n ", "\n").slice(0, 4));
    expect(await extractText(path.join(dir, "x.pdf"))).toBeNull();
  });
  it("clasifica formatos comunes y rechaza los raros", () => {
    expect(kindOf("foto.JPG")).toBe("image"); expect(kindOf("clip.mov")).toBe("video"); expect(kindOf("pista.m4a")).toBe("audio"); expect(kindOf("tarea.docx")).toBe("document");
    expect(kindOf("raro.xyz")).toBeNull(); expect(kindOf("modelo.blend")).toBeNull();
  });
  it("voz e instrucciones en el idioma del video", () => {
    const p = { description: "Para mi clase de biología", minutes: 2, language: "es" as const, useLibrary: true, iterate: false, files: [] };
    expect(voiceFor(p, "en-US-Chirp3-HD-Charon")).toEqual({ voice: "es-US-Chirp3-HD-Charon", languageCode: "es-US" });
    expect(voiceFor({ ...p, language: "en" }, "en-US-Chirp3-HD-Charon")).toEqual({});
    expect(systemFor({ data: { personal: p } })).toContain("Spanish");
    expect(systemFor({ data: {} })).toContain("US audience");
    expect(personalBrief(p)).toContain("2 minute(s)");
    expect(personalBrief({ ...p, minutes: 0.5 })).toContain("30 seconds");
  });
});
