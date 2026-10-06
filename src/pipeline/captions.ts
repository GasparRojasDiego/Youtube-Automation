// Subtítulos quemados en el video (ASS para libass): páginas cortas que
// aparecen con la voz y resaltan la palabra que se está diciendo.
// El estilo se define en una habilidad con el bloque `atril:subtitulos`.
import type { WordTime } from "./align";

export const CAPTION_DEFAULTS = {
  enabled: true,
  font: "Poppins ExtraBold",
  size: 62,                  // px a 1080p
  color: "#FFFFFF",
  highlight: "#FFD400",
  outline: 4,
  outlineColor: "#000000",
  shadow: 1,
  box: false,                // fondo detrás del texto en lugar de contorno
  boxColor: "#000000B0",
  position: "bottom" as "bottom" | "middle" | "top",
  marginV: 96,
  maxWords: 6,
  maxChars: 30,              // por línea
  lines: 1 as 1 | 2,
  uppercase: false,
  mode: "highlight" as "highlight" | "pop" | "plain",
  fadeMs: 90,
};
export type CaptionParams = typeof CAPTION_DEFAULTS;

export interface CaptionPage { words: WordTime[]; start: number; end: number }

/** «#RRGGBB[AA]» → «&HAABBGGRR» (ASS usa alfa invertido: 00 = opaco). */
export function assColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  const a = h.length >= 8 ? (255 - parseInt(h.slice(6, 8), 16)).toString(16).padStart(2, "0") : "00";
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

export function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, " ");

/** Agrupa las palabras de una oración en páginas legibles. */
export function paginate(words: WordTime[], p: Pick<CaptionParams, "maxWords" | "maxChars" | "lines">): CaptionPage[] {
  const pages: CaptionPage[] = [];
  const limit = p.maxChars * p.lines;
  let cur: WordTime[] = [];
  const flush = () => { if (cur.length) pages.push({ words: cur, start: cur[0].s, end: cur[cur.length - 1].e }); cur = []; };
  for (const w of words) {
    const len = cur.reduce((a, x) => a + x.w.length + 1, 0) + w.w.length;
    if (cur.length && (cur.length >= p.maxWords || len > limit)) flush();
    cur.push(w);
    // Cortar después de puntuación fuerte si la página ya tiene contenido suficiente
    if (/[.!?;:]$/.test(w.w) && cur.length >= 3) flush();
  }
  flush();
  // Evitar páginas de una sola palabra al final: unir con la anterior si cabe
  for (let i = pages.length - 1; i > 0; i--) {
    if (pages[i].words.length === 1 && pages[i - 1].words.length < p.maxWords + 1) {
      const merged = [...pages[i - 1].words, ...pages[i].words];
      if (merged.reduce((a, x) => a + x.w.length + 1, 0) <= limit + 6) { pages.splice(i - 1, 2, { words: merged, start: merged[0].s, end: merged[merged.length - 1].e }); }
    }
  }
  return pages;
}

/** Texto de una página con la palabra activa resaltada (y salto de línea si hay 2 líneas). */
function pageText(pg: CaptionPage, active: number, p: CaptionParams): string {
  const words = pg.words.map((w) => esc(p.uppercase ? w.w.toUpperCase() : w.w));
  let breakAt = -1;
  if (p.lines === 2) {
    const total = words.join(" ").length;
    if (total > p.maxChars) {
      let acc = 0;
      for (let i = 0; i < words.length; i++) { acc += words[i].length + 1; if (acc >= total / 2) { breakAt = i; break; } }
    }
  }
  const base = assColor(p.color), hi = assColor(p.highlight);
  return words.map((w, i) => {
    let t = w;
    if (p.mode !== "plain" && i === active) t = p.mode === "pop" ? `{\\c${hi}\\fscx112\\fscy112}${w}{\\c${base}\\fscx100\\fscy100}` : `{\\c${hi}}${w}{\\c${base}}`;
    return t + (i === breakAt && i < words.length - 1 ? "\\N" : i < words.length - 1 ? " " : "");
  }).join("");
}

/** Documento ASS completo para un clip (tiempos relativos al inicio del clip). */
export function buildAss(pages: CaptionPage[], p: CaptionParams, frame = { width: 1920, height: 1080 }): string {
  const align = p.position === "top" ? 8 : p.position === "middle" ? 5 : 2;
  const border = p.box ? 3 : 1;
  const outlineCol = p.box ? assColor(p.boxColor) : assColor(p.outlineColor);
  const style = `Style: Cap,${p.font},${p.size},${assColor(p.color)},${assColor(p.highlight)},${outlineCol},${p.box ? outlineCol : "&H80000000"},0,0,0,0,100,100,0,0,${border},${p.box ? 14 : p.outline},${p.shadow},${align},120,120,${p.marginV},1`;
  const lines: string[] = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${frame.width}`, `PlayResY: ${frame.height}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "YCbCr Matrix: TV.709", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    style, "",
    "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  pages.forEach((pg, pi) => {
    const next = pages[pi + 1];
    const pageEnd = Math.min(pg.end + 0.25, next ? next.start : pg.end + 0.25);
    if (p.mode === "plain") {
      lines.push(`Dialogue: 0,${assTime(pg.start)},${assTime(pageEnd)},Cap,,0,0,0,,{\\fad(${p.fadeMs},0)}${pageText(pg, -1, p)}`);
      return;
    }
    pg.words.forEach((w, wi) => {
      const s = wi === 0 ? pg.start : w.s;
      const e = wi === pg.words.length - 1 ? pageEnd : pg.words[wi + 1].s;
      if (e - s < 0.01) return;
      const fade = wi === 0 ? `{\\fad(${p.fadeMs},0)}` : "";
      lines.push(`Dialogue: 0,${assTime(s)},${assTime(e)},Cap,,0,0,0,,${fade}${pageText(pg, wi, p)}`);
    });
  });
  return lines.join("\n") + "\n";
}
