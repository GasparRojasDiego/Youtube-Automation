// Tarjetas y rótulos dibujados en un canvas del propio WebView (costo 0):
// fuente en pantalla, título de capítulo, cita, texto y miniatura.
import { fs } from "../lib/ipc";
import type { VisualParams, ThumbnailParams } from "../lib/skills";

const W = 1920, H = 1080;

async function ensureFonts(families: string[]) {
  await Promise.all(families.flatMap((f) => [document.fonts.load(`400 48px "${f}"`), document.fonts.load(`700 48px "${f}"`)]).map((p) => p.catch(() => null)));
}

function canvas(w = W, h = H) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!; ctx.textBaseline = "alphabetic";
  return { c, ctx };
}

async function save(c: HTMLCanvasElement, path: string, type: "image/png" | "image/jpeg" = "image/png") {
  const data = c.toDataURL(type, 0.92).split(",")[1];
  await fs.writeB64(path, data);
  return path;
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Ajusta el tamaño de fuente para que el texto quepa en un recuadro. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, maxH: number, start: number, min: number, lh = 1.2) {
  for (let px = start; px >= min; px -= 2) {
    ctx.font = font(px);
    const lines = wrap(ctx, text, maxW);
    if (lines.length * px * lh <= maxH) return { px, lines };
  }
  ctx.font = font(min);
  return { px: min, lines: wrap(ctx, text, maxW) };
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 0.035) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 255 * alpha; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
}

function background(ctx: CanvasRenderingContext2D, v: VisualParams) {
  ctx.fillStyle = v.background; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.3, H * 0.2, 50, W * 0.5, H * 0.5, W * 0.8);
  g.addColorStop(0, "rgba(255,255,255,0.05)"); g.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

export async function renderSourceCard(o: { publisher: string; title: string; date: string; quote: string; url: string; label?: string }, v: VisualParams, out: string) {
  await ensureFonts([v.fontTitle, v.fontBody, v.fontMono]);
  const { c, ctx } = canvas(); background(ctx, v);
  // "documento"
  const px = 260, py = 150, pw = W - 520, ph = H - 300;
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(px + 14, py + 18, pw, ph);
  ctx.fillStyle = "#F4F1EA"; ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = v.accent; ctx.fillRect(px, py, 10, ph);
  ctx.fillStyle = "#6B665D"; ctx.font = `600 26px "${v.fontMono}"`;
  ctx.fillText(`${(o.label ?? "SOURCE").toUpperCase()}  ·  ${o.publisher.toUpperCase()}${o.date && o.date !== "n.d." ? "  ·  " + o.date : ""}`.slice(0, 90), px + 60, py + 80);
  ctx.fillStyle = "#1C1A17";
  const t = fit(ctx, o.title, (n) => `700 ${n}px "${v.fontTitle}"`, pw - 120, 170, 58, 34, 1.15);
  t.lines.forEach((l, i) => ctx.fillText(l, px + 60, py + 150 + i * t.px * 1.15));
  const qy = py + 170 + t.lines.length * t.px * 1.15;
  ctx.fillStyle = "#3A362F";
  const q = fit(ctx, `“${o.quote.trim()}”`, (n) => `italic 400 ${n}px "${v.fontBody}"`, pw - 160, ph - (qy - py) - 110, 44, 24, 1.35);
  ctx.fillStyle = v.accent; ctx.fillRect(px + 60, qy + 10, 4, q.lines.length * q.px * 1.35);
  ctx.fillStyle = "#3A362F";
  q.lines.forEach((l, i) => ctx.fillText(l, px + 84, qy + q.px + i * q.px * 1.35));
  ctx.fillStyle = "#8A857B"; ctx.font = `400 22px "${v.fontMono}"`;
  let url = o.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  while (url.length > 12 && ctx.measureText(url).width > pw - 120) url = url.slice(0, -2);
  if (url.length < o.url.replace(/^https?:\/\//, "").replace(/\/$/, "").length) url = url.slice(0, -1) + "…";
  ctx.fillText(url, px + 60, py + ph - 50);
  grain(ctx, W, H);
  return save(c, out);
}

export async function renderTitleCard(o: { kicker?: string; title: string }, v: VisualParams, out: string) {
  await ensureFonts([v.fontTitle, v.fontMono]);
  const { c, ctx } = canvas(); background(ctx, v);
  ctx.textAlign = "center";
  if (o.kicker) { ctx.fillStyle = v.accent; ctx.font = `600 30px "${v.fontMono}"`; ctx.fillText(o.kicker.toUpperCase().split("").join(" "), W / 2, H / 2 - 120); }
  ctx.fillStyle = v.foreground;
  const t = fit(ctx, o.title.toUpperCase(), (n) => `700 ${n}px "${v.fontTitle}"`, W - 400, 420, 120, 56, 1.08);
  const top = H / 2 - (t.lines.length * t.px * 1.08) / 2 + t.px * 0.8;
  t.lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * t.px * 1.08));
  ctx.fillStyle = v.accent; ctx.fillRect(W / 2 - 60, top + t.lines.length * t.px * 1.08, 120, 6);
  grain(ctx, W, H);
  return save(c, out);
}

export async function renderQuoteCard(o: { quote: string; attribution?: string }, v: VisualParams, out: string) {
  await ensureFonts([v.fontBody, v.fontMono]);
  const { c, ctx } = canvas(); background(ctx, v);
  ctx.fillStyle = v.accent; ctx.font = `700 260px "${v.fontBody}"`; ctx.fillText("“", 200, 420);
  ctx.fillStyle = v.foreground;
  const q = fit(ctx, o.quote, (n) => `italic 400 ${n}px "${v.fontBody}"`, W - 600, 560, 76, 40, 1.3);
  const top = H / 2 - (q.lines.length * q.px * 1.3) / 2 + q.px;
  q.lines.forEach((l, i) => ctx.fillText(l, 340, top + i * q.px * 1.3));
  if (o.attribution) { ctx.fillStyle = v.muted; ctx.font = `600 30px "${v.fontMono}"`; ctx.fillText(`— ${o.attribution}`.slice(0, 80), 340, top + q.lines.length * q.px * 1.3 + 30); }
  grain(ctx, W, H);
  return save(c, out);
}

export async function renderTextCard(o: { text: string }, v: VisualParams, out: string) {
  await ensureFonts([v.fontTitle]);
  const { c, ctx } = canvas(); background(ctx, v);
  ctx.textAlign = "center"; ctx.fillStyle = v.foreground;
  const t = fit(ctx, o.text, (n) => `700 ${n}px "${v.fontTitle}"`, W - 500, 600, 110, 50, 1.12);
  const top = H / 2 - (t.lines.length * t.px * 1.12) / 2 + t.px * 0.85;
  t.lines.forEach((l, i) => {
    ctx.fillText(l, W / 2, top + i * t.px * 1.12);
  });
  grain(ctx, W, H);
  return save(c, out);
}

async function loadImage(path: string): Promise<HTMLImageElement> {
  const b64 = await fs.readB64(path);
  const mime = /\.jpe?g$/i.test(path) ? "image/jpeg" : "image/png";
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("No se pudo cargar " + path)); img.src = `data:${mime};base64,${b64}`; });
  return img;
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Miniatura 1280x720: fondo, degradado del lado del texto y texto con contorno. */
export async function renderThumbnail(o: { background?: string | null; text: string; highlight?: string; layout: "left" | "right" | "center" }, p: ThumbnailParams, v: VisualParams, out: string) {
  const TW = 1280, TH = 720;
  await ensureFonts([p.font]);
  const { c, ctx } = canvas(TW, TH);
  ctx.fillStyle = v.background; ctx.fillRect(0, 0, TW, TH);
  if (o.background) { try { cover(ctx, await loadImage(o.background), TW, TH); } catch { /* fondo liso */ } }
  const words = o.text.trim() ? o.text.trim().split(/\s+/).slice(0, p.maxWords) : [];
  if (words.length) {
    const g = o.layout === "center" ? ctx.createLinearGradient(0, TH, 0, TH * 0.3) : ctx.createLinearGradient(o.layout === "left" ? 0 : TW, 0, o.layout === "left" ? TW * 0.65 : TW * 0.35, 0);
    g.addColorStop(0, "rgba(0,0,0,0.78)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, TW, TH);
    const boxW = o.layout === "center" ? TW - 160 : TW * 0.52;
    const lines: string[][] = []; let cur: string[] = [];
    const size = (n: number) => `400 ${n}px "${p.font}"`;
    let px = Math.round(150 * p.textScale);
    for (; px > 60; px -= 4) {
      ctx.font = size(px); lines.length = 0; cur = [];
      for (const w of words) { const t = [...cur, w].join(" ").toUpperCase(); if (ctx.measureText(t).width > boxW && cur.length) { lines.push(cur); cur = [w]; } else cur.push(w); }
      if (cur.length) lines.push(cur);
      if (lines.length * px * 1.02 < TH * 0.7) break;
    }
    ctx.font = size(px); ctx.lineJoin = "round"; ctx.textBaseline = "alphabetic";
    const total = lines.length * px * 1.02;
    let y = o.layout === "center" ? TH - 70 - total + px * 0.86 : (TH - total) / 2 + px * 0.86;
    const hl = (o.highlight ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    for (const line of lines) {
      const text = line.join(" ").toUpperCase();
      const lw = ctx.measureText(text).width;
      let x = o.layout === "left" ? 70 : o.layout === "right" ? TW - 70 - lw : (TW - lw) / 2;
      for (const w of line) {
        const t = w.toUpperCase() + " ";
        ctx.lineWidth = Math.max(6, px / 9); ctx.strokeStyle = p.strokeColor; ctx.strokeText(t, x, y);
        ctx.fillStyle = hl && w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === hl ? p.highlightColor : p.textColor;
        ctx.fillText(t, x, y);
        x += ctx.measureText(t).width;
      }
      y += px * 1.02;
    }
  }
  // JPEG: YouTube limita las miniaturas a 2 MB
  return save(c, out, "image/jpeg");
}
