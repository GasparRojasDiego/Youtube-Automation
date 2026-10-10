import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as nfs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parseSilences, alignSentences, wordTimings, alignWords, parseWhisperJson, normWord, type AsrWord } from "./align";
import { paginate, buildAss, CAPTION_DEFAULTS, assColor, assTime } from "./captions";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"]); return true; } catch { return false; } })();

describe("alineación de oraciones", () => {
  it("lee silencios de ffmpeg", () => {
    const s = parseSilences("[silencedetect @ 0x1] silence_start: 1.5\n[silencedetect @ 0x1] silence_end: 1.9 | silence_duration: 0.4\nsilence_start: 4.2", 5);
    expect(s).toEqual([{ start: 1.5, end: 1.9 }, { start: 4.2, end: 5 }]);
  });
  it("ajusta las fronteras a los silencios más cercanos", () => {
    const sentences = ["This is the first sentence here.", "A second one, slightly longer than the first.", "Third."];
    const spans = alignSentences(sentences, 10, [{ start: 0, end: 0.2 }, { start: 3.1, end: 3.5 }, { start: 5.0, end: 5.1 }, { start: 8.4, end: 8.8 }, { start: 9.7, end: 10 }]);
    expect(spans[0].start).toBeCloseTo(0.2);
    expect(spans[0].end).toBeCloseTo(3.1);
    expect(spans[1].start).toBeCloseTo(3.5);
    expect(spans[1].end).toBeCloseTo(8.4);
    expect(spans[2]).toEqual({ start: 8.8, end: 9.7 });
  });
  it("sin silencios, reparte proporcionalmente y en orden", () => {
    const spans = alignSentences(["aaaa aaaa.", "bbbb bbbb bbbb bbbb.", "cc."], 6, []);
    expect(spans[0].start).toBe(0);
    expect(spans[2].end).toBe(6);
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
  });
  it("reparte palabras dentro de la oración", () => {
    const w = wordTimings("In 1889, the tower opened.", { start: 2, end: 4 });
    expect(w.length).toBe(5);
    expect(w[0].s).toBe(2);
    expect(w[4].e).toBeCloseTo(4, 2);
  });
  it.skipIf(!hasFfmpeg)("funciona con audio real (tonos y silencios)", () => {
    const dir = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-align-"));
    const wav = path.join(dir, "a.wav");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i",
      "aevalsrc='if(between(t,0.3,2.0)+between(t,2.45,5.2)+between(t,5.6,6.4),0.4*sin(2*PI*220*t),0)':d=6.8:s=48000", wav]);
    const stderr = spawnSync("ffmpeg", ["-hide_banner", "-i", wav, "-af", "silencedetect=noise=-38dB:d=0.15", "-f", "null", "-"]).stderr.toString();
    const sil = parseSilences(stderr, 6.8);
    const spans = alignSentences(["One short sentence here now.", "Then a much longer sentence that keeps going for a while.", "Done now."], 6.8, sil);
    expect(spans[0].start).toBeCloseTo(0.3, 1);
    expect(spans[0].end).toBeCloseTo(2.0, 1);
    expect(spans[1].start).toBeCloseTo(2.45, 1);
    expect(spans[1].end).toBeCloseTo(5.2, 1);
    expect(spans[2].start).toBeCloseTo(5.6, 1);
    expect(spans[2].end).toBeCloseTo(6.4, 1);
    nfs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("alineación por palabra (whisper.cpp)", () => {
  const sentences = ["La fotosíntesis es la forma en que las plantas fabrican su alimento.", "Con la luz del sol, producen glucosa."];
  // Lo que «oyó» whisper: tiempos reales, sin tildes en una palabra, una palabra mal reconocida y otra de más
  const asr: AsrWord[] = [
    ["La", 0.3, 0.42], ["fotosintesis", 0.42, 1.1], ["es", 1.1, 1.2], ["la", 1.2, 1.3], ["forma", 1.3, 1.62], ["en", 1.62, 1.7], ["que", 1.7, 1.82],
    ["las", 1.82, 1.95], ["plantas", 1.95, 2.4], ["fabrican", 2.4, 2.95], ["su", 2.95, 3.05], ["alimento.", 3.05, 3.7],
    ["Con", 4.4, 4.6], ["la", 4.6, 4.7], ["luz", 4.7, 4.95], ["del", 4.95, 5.1], ["sal,", 5.1, 5.5], ["eh", 5.5, 5.7], ["producen", 5.9, 6.5], ["glucosa.", 6.5, 7.2],
  ].map(([w, s, e]) => ({ w: w as string, s: s as number, e: e as number }));
  const silences = [{ start: 0, end: 0.3 }, { start: 3.72, end: 4.38 }, { start: 7.25, end: 7.6 }];
  it("lee el JSON de whisper-cli", () => {
    const j = JSON.stringify({ transcription: [{ offsets: { from: 300, to: 420 }, text: " La" }, { offsets: { from: 420, to: 1100 }, text: " fotosíntesis" }, { offsets: { from: 1100, to: 1100 }, text: " ," }] });
    expect(parseWhisperJson(j)).toEqual([{ w: "La", s: 0.3, e: 0.42 }, { w: "fotosíntesis", s: 0.42, e: 1.1 }]);
    expect(parseWhisperJson("no es json")).toEqual([]);
    // Como lo escribe whisper-cli en Windows: ruta con barras escapadas, tabuladores y un tabulador dentro de un texto
    const win = '{\n\t"params": {\n\t\t"model": "C:\\\\Users\\\\Diego Gaspar\\\\.cache\\\\whisper.cpp\\\\ggml-base.bin"\n\t},\n\t"transcription": [\n\t\t{"offsets": {"from": 0, "to": 500}, "text": " Un\tvolcán"}\n\t]\n}';
    expect(parseWhisperJson(win)).toEqual([{ w: "Un volcán", s: 0, e: 0.5 }]);
    expect(normWord("¡Fotosíntesis!")).toBe("fotosintesis");
  });
  it("usa los tiempos reales, reparte los que no coinciden y respeta las pausas", () => {
    const r = alignWords(sentences, asr, 7.6, silences)!;
    expect(r).not.toBeNull();
    expect(r.matched).toBeGreaterThanOrEqual(17);
    const w0 = r.words[0], w1 = r.words[1];
    expect(w0[1]).toMatchObject({ w: "fotosíntesis", s: 0.42, e: 1.1 });
    expect(w0[11].w).toBe("alimento.");
    // «sol,» no se reconoció («sal»… sí, con una letra distinta) y «producen» llega tarde: todo en orden
    const all = [...w0, ...w1];
    for (let i = 1; i < all.length; i++) expect(all[i].s).toBeGreaterThan(all[i - 1].s);
    expect(w1.find((x) => x.w === "producen")!.s).toBeCloseTo(5.9, 2);
    // Oraciones: la frontera es la pausa entre «alimento.» y «Con»
    expect(r.spans[0]).toEqual({ start: 0.3, end: 3.72 });
    expect(r.spans[1].start).toBeCloseTo(4.38, 2);
    expect(r.spans[1].end).toBeLessThanOrEqual(7.25);
  });
  it("si el audio no se parece al texto, no se usa (queda la estimación)", () => {
    const junk: AsrWord[] = ["hello", "world", "this", "is", "other"].map((w, i) => ({ w, s: i, e: i + 0.5 }));
    expect(alignWords(sentences, junk, 7.6, silences)).toBeNull();
    expect(alignWords(sentences, [], 7.6, silences)).toBeNull();
  });
});

describe("subtítulos ASS", () => {
  it("colores y tiempos en formato ASS", () => {
    expect(assColor("#FFD400")).toBe("&H0000D4FF");
    expect(assColor("#000000B0")).toBe("&H4F000000");
    expect(assTime(62.345)).toBe("0:01:02.35");
  });
  it("pagina sin pasar los límites y sin huérfanas", () => {
    const words = wordTimings("The tower was never meant to stand for more than twenty years, but it survived.", { start: 0, end: 5 });
    const pages = paginate(words, { maxWords: 6, maxChars: 30, lines: 1 });
    for (const p of pages) { expect(p.words.length).toBeLessThanOrEqual(7); }
    expect(pages.flatMap((p) => p.words).length).toBe(words.length);
    expect(pages.at(-1)!.words.length).toBeGreaterThan(1);
  });
  it.skipIf(!hasFfmpeg)("libass renderiza el texto con las fuentes incluidas", () => {
    const dir = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-ass-"));
    const pages = paginate(wordTimings("This is a caption test.", { start: 0.1, end: 1.8 }), CAPTION_DEFAULTS);
    nfs.writeFileSync(path.join(dir, "c.ass"), buildAss(pages, CAPTION_DEFAULTS));
    nfs.mkdirSync(path.join(dir, "fonts"));
    nfs.copyFileSync(path.resolve(__dirname, "../../src-tauri/resources/fonts/Poppins-ExtraBold.ttf"), path.join(dir, "fonts", "Poppins-ExtraBold.ttf"));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=1920x1080:d=2:r=30", "-vf", "subtitles=c.ass:fontsdir=fonts", "-frames:v", "1", "-ss", "1", "out.png"], { cwd: dir });
    // El cuadro ya no es negro puro
    const stats = spawnSync("ffmpeg", ["-hide_banner", "-i", path.join(dir, "out.png"), "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YMAX", "-f", "null", "-"]).stderr.toString();
    const ymax = Number(stats.match(/YMAX=(\d+)/)?.[1] ?? 0);
    expect(ymax).toBeGreaterThan(200);
    nfs.rmSync(dir, { recursive: true, force: true });
  });
});
