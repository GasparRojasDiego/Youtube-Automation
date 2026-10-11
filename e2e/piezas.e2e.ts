// Piezas listas: las renderiza todas con sus datos de muestra. Por defecto deja una hoja de
// contacto (8 cuadros) por pieza para revisarlas; con FULL=1 escribe además las vistas previas
// que muestra la app (public/piezas/<id>.mp4 y .jpg, 960×540). Falla si alguna pieza da error.
// Ejecutar: npx vitest run -c vitest.e2e.config.ts e2e/piezas.e2e.ts   (PIECES=stat,trend filtra)
import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import * as nfs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { launchBrowser, closeBrowser, renderComposition, previewComposition, type MotionHost } from "../src/motion/engine";
import type { Composition } from "../src/motion/page";
import { PIECES, pieceUsage } from "../src/motion/pieces";
import { VISUAL_DEFAULTS } from "../src/lib/skills";

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.CHROME_PATH ?? ""].find((p) => p && nfs.existsSync(p));
const ROOT = path.resolve(__dirname, "../src-tauri/resources");
const OUT = path.resolve(__dirname, "../public/piezas");
const SHEETS = process.env.SHEETS_DIR ?? path.join(os.tmpdir(), "atril-piezas");
const ONLY = (process.env.PIECES ?? "").split(",").filter(Boolean);
const FULL = process.env.FULL === "1";

function nodeHost(): MotionHost {
  const procs = new Map<string, ChildProcess>();
  return {
    spawn: async (id, program, args) => { procs.set(id, spawn(program, ["--no-sandbox", ...args], { stdio: "ignore" })); },
    stop: async (id) => { procs.get(id)?.kill("SIGKILL"); procs.delete(id); },
    readText: async (p) => (nfs.existsSync(p) ? nfs.readFileSync(p, "utf8") : null),
    writeText: async (p, t) => { nfs.mkdirSync(path.dirname(p), { recursive: true }); nfs.writeFileSync(p, t); },
    writeB64: async (p, b) => { nfs.writeFileSync(p, Buffer.from(b, "base64")); },
    mkdir: async (p) => { nfs.mkdirSync(p, { recursive: true }); },
    remove: async (p) => { nfs.rmSync(p, { recursive: true, force: true }); },
    copy: async (a, b) => { nfs.mkdirSync(path.dirname(b), { recursive: true }); nfs.copyFileSync(a, b); },
    ffmpeg: async (args, cwd) => { execFileSync("ffmpeg", args, { cwd, stdio: "pipe" }); },
    join: (...p) => path.join(...p),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

// Íconos de muestra (trazos simples propios, 24×24): en la app vienen de la biblioteca o de Iconify
const S = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const DEMO_ICONS: Record<string, string> = {
  person: S('<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>'),
  coin: S('<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.1 0 2.9 5.8 1.5 5.8 4.4 0 1.2-1.3 2.2-3 2.2-1.3 0-2.5-.6-3-1.7M12 6v1.6M12 16.3V18"/>'),
  leaf: S('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-12 14"/><path d="M5 19l7-7"/>'),
  ship: S('<path d="M3 15h18l-2.5 4.5h-13z"/><path d="M6 15V9h12v6M9 9V5.5h6V9"/>'),
  factory: S('<path d="M3 20V10l5 3V10l5 3V6h3l1 14z"/><path d="M3 20h18"/>'),
  store: S('<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20"/>'),
  cup: S('<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1.2 1 1.3 1 2.5M12 3.5c0 1.2 1 1.3 1 2.5"/>'),
  globe: S('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z"/>'),
  truck: S('<path d="M2.5 6h11v10h-11zM13.5 9.5h4l3 3.5v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>'),
  scale: S('<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7l-2.5 6a2.8 2.8 0 0 0 5 0zM19 7l-2.5 6a2.8 2.8 0 0 0 5 0z"/>'),
  document: S('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 15.5h6M9 9h2"/>'),
  warning: S('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.2"/>'),
  check: S('<path d="M4.5 12.5l4.5 4.5L19.5 6.5"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'),
  search: S('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>'),
  phone: S('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
};

/** Imágenes de muestra generadas aquí (sin fotos de terceros): paisaje, el mismo con sujeto recortado, y un «después». */
async function demoImages(b: Awaited<ReturnType<typeof launchBrowser>>, dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = { img1: path.join(dir, "img1.png"), img1_cut: path.join(dir, "img1_cut.png"), img2: path.join(dir, "img2.png") };
  if (Object.values(out).every((f) => nfs.existsSync(f))) return out;
  nfs.mkdirSync(dir, { recursive: true });
  const scene = (after: boolean, cutOnly: boolean) => `
    const s = document.getElementById('stage');
    s.innerHTML = \`<svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${after ? "#8C8F96" : "#F3B067"}"/><stop offset=".55" stop-color="${after ? "#B9B6AE" : "#E9786A"}"/><stop offset="1" stop-color="${after ? "#5E5A55" : "#5B3E66"}"/></linearGradient>
      <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE9B8"/><stop offset="1" stop-color="#FFE9B8" stop-opacity="0"/></radialGradient></defs>
      ${cutOnly ? "" : `<rect width="1920" height="1080" fill="url(#sky)"/>${after ? "" : '<circle cx="1320" cy="430" r="260" fill="url(#sun)"/>'}
      <path d="M0 640 L240 520 L420 600 L640 470 L900 610 L1120 500 L1380 620 L1600 520 L1920 600 V1080 H0Z" fill="${after ? "#6E6A64" : "#7A4B6E"}"/>
      <path d="M0 760 L300 660 L560 720 L820 640 L1100 740 L1400 660 L1700 730 L1920 690 V1080 H0Z" fill="${after ? "#55524D" : "#4C3557"}"/>
      ${after ? Array.from({ length: 14 }, (_, i) => `<rect x="${80 + i * 130}" y="${560 - (i * 37) % 160}" width="${70 + (i * 13) % 40}" height="${520 + (i * 37) % 160}" fill="#3F3C39"/>`).join("") : Array.from({ length: 22 }, (_, i) => `<path d="M${40 + i * 88} 800 l26 -${90 + (i * 29) % 70} l26 ${90 + (i * 29) % 70}z" fill="#2E2340"/>`).join("")}
      <rect y="800" width="1920" height="280" fill="${after ? "#3B3936" : "#2A1F38"}"/>`}
      <g transform="translate(560 140)">
        <path d="M150 0 C 230 20 260 110 240 190 C 330 210 380 300 360 400 C 350 470 300 520 250 540 L 270 940 L 40 940 L 70 540 C 0 510 -40 430 -20 350 C 0 260 60 220 110 205 C 70 130 90 30 150 0Z" fill="#1A1424"/>
        <path d="M150 40 C 200 60 220 120 205 180" fill="none" stroke="#3A2E4C" stroke-width="10" stroke-linecap="round"/>
      </g></svg>\`;
    const tl = gsap.timeline(); ATRIL.register(tl, 0.5);`;
  for (const [key, after, cut] of [["img1", false, false], ["img1_cut", false, true], ["img2", true, false]] as const) {
    const comp: Composition = { id: key, duration: 0.5, transparent: cut, css: "", html: "", js: scene(after, cut) };
    const r = await previewComposition(b, comp, { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(dir, `w_${key}`), samples: [0] });
    nfs.copyFileSync(r.samples[0], out[key]);
  }
  return out;
}

const palette = { bg: VISUAL_DEFAULTS.background, fg: VISUAL_DEFAULTS.foreground, accent: VISUAL_DEFAULTS.accent, muted: VISUAL_DEFAULTS.muted, fontTitle: VISUAL_DEFAULTS.fontTitle, fontBody: VISUAL_DEFAULTS.fontBody, fontMono: VISUAL_DEFAULTS.fontMono };

describe.skipIf(!CHROME)("piezas listas", () => {
  it("todas renderizan sin errores", async () => {
    const work = path.join(os.tmpdir(), `atril-piezas-${Date.now().toString(36)}`);
    nfs.mkdirSync(SHEETS, { recursive: true });
    const b = await launchBrowser(nodeHost(), CHROME!, work);
    const failed: string[] = [];
    try {
      const imgs = await demoImages(b, path.join(SHEETS, "_img"));
      for (const p of PIECES.filter((x) => !ONLY.length || ONLY.includes(x.id))) {
        const comp: Composition = { id: p.id, title: p.name, duration: p.dur, transparent: p.kind === "overlay", css: "", html: "", js: pieceUsage(p), libs: p.libs, palette,
          icons: DEMO_ICONS, assets: p.kind === "overlay" || p.images?.length ? imgs : {} };
        const base = { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(work, p.id) };
        const t0 = Date.now();
        try {
          const samples = [0.04, 0.14, 0.26, 0.38, 0.52, 0.66, 0.82, 0.98];
          const r = FULL ? await renderComposition(b, comp, { ...base, out: path.join(work, `${p.id}.${comp.transparent ? "mov" : "mp4"}`), samples })
            : await previewComposition(b, comp, { ...base, samples });
          const errs = [...r.errors, ...r.consoleErrors];
          if (errs.length) throw new Error(errs.join(" | "));
          // Hoja de contacto 4×2 (sobre gris si es capa transparente)
          const inputs = r.samples.flatMap((f) => ["-i", f]);
          const tiles = r.samples.map((_, i) => `[${i}:v]scale=480:270${comp.transparent ? `,format=rgba[t${i}];color=c=0x6b6f75:s=480x270:d=1[g${i}];[g${i}][t${i}]overlay=format=auto` : ""}[v${i}]`).join(";");
          execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${tiles};${r.samples.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${r.samples.length}:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0[o]`, "-map", "[o]", "-frames:v", "1", path.join(SHEETS, `${p.id}.png`)]);
          if (FULL && "file" in r) {
            nfs.mkdirSync(OUT, { recursive: true });
            const src = (r as { file: string }).file;
            // Capas: se muestran sobre un fondo neutro (el navegador de la app no reproduce alfa en MP4)
            const vf = comp.transparent ? "[1:v]scale=960:540,format=rgba[t];[0:v][t]overlay=shortest=1,format=yuv420p" : "scale=960:540:flags=lanczos,format=yuv420p";
            const pre = comp.transparent ? ["-loop", "1", "-i", imgs.img1] : [];
            execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...pre, "-i", src, ...(comp.transparent ? ["-filter_complex", vf.replace("[0:v]", "[0:v]scale=960:540[b];[b]")] : ["-vf", vf]),
              "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-tune", "animation", "-an", "-movflags", "+faststart", "-t", String(p.dur), path.join(OUT, `${p.id}.mp4`)]);
            execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(p.dur * 0.8), "-i", path.join(OUT, `${p.id}.mp4`), "-frames:v", "1", "-q:v", "4", path.join(OUT, `${p.id}.jpg`)]);
          }
          console.log(`${p.id}: ok en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        } catch (e) {
          failed.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 600));
          console.log(`${p.id}: ERROR ${failed[failed.length - 1]}`);
        }
      }
    } finally { await closeBrowser(b); nfs.rmSync(work, { recursive: true, force: true }); }
    expect(failed).toEqual([]);
  }, 60 * 60_000);
});
