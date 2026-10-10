// Tarjetas para la prueba en Node (la app las dibuja en un canvas del WebView).
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as nfs from "node:fs";

const FONT = path.resolve(__dirname, "../src-tauri/resources/fonts/Oswald.ttf");
function card(text: string, out: string, bg = "0x111113", w = 1920, h = 1080) {
  nfs.mkdirSync(path.dirname(out), { recursive: true });
  const tf = out + ".txt"; nfs.writeFileSync(tf, text.slice(0, 120));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${bg}:s=${w}x${h}:d=1`, "-vf",
    `drawtext=fontfile=${FONT}:textfile=${tf}:fontcolor=0xF2EFE9:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2`, "-frames:v", "1", out]);
  nfs.rmSync(tf);
  return out;
}
export const wrap = () => [];
export async function renderSourceCard(o: { publisher: string; title: string }, _v: unknown, out: string) { return card(`${o.publisher}: ${o.title}`, out); }
export async function renderTitleCard(o: { title: string }, _v: unknown, out: string) { return card(o.title, out); }
export async function renderQuoteCard(o: { quote: string }, _v: unknown, out: string) { return card(`"${o.quote}"`, out); }
export async function renderTextCard(o: { text: string }, _v: unknown, out: string) { return card(o.text, out); }
export async function renderThumbnail(o: { background?: string | null; text: string }, _p: unknown, _v: unknown, out: string) {
  nfs.mkdirSync(path.dirname(out), { recursive: true });   // como fs.writeB64 de la app, que crea la carpeta
  if (o.background && nfs.existsSync(o.background)) { execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", o.background, "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720", "-frames:v", "1", out]); return out; }
  return card(o.text, out, "0x222222", 1280, 720);
}
