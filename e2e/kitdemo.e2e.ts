// Demo del kit de motion (K.*): renderiza una pieza de varias escenas con
// Chromium real y guarda una hoja de cuadros para revisarla a ojo.
// Ejecutar: KIT_OUT=/ruta npx vitest run -c vitest.e2e.config.ts e2e/kitdemo.e2e.ts
import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import * as nfs from "node:fs";
import * as path from "node:path";
import { launchBrowser, closeBrowser, renderComposition, type MotionHost } from "../src/motion/engine";
import type { Composition } from "../src/motion/page";

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.CHROME_PATH ?? ""].find((p) => p && nfs.existsSync(p));
const OUT = process.env.KIT_OUT ?? "/tmp/claude-0/kitdemo";
const ROOT = path.resolve(__dirname, "../src-tauri/resources");

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

export const DEMO: Composition = {
  id: "demo", duration: 20, transparent: false,
  palette: { bg: "#0E0E10", fg: "#141414", accent: "#C6F432", muted: "#8A8A8A", fontTitle: "Inter", fontBody: "Inter", fontMono: "JetBrains Mono" },
  css: `.lab{position:absolute;top:150px;padding:10px 18px;border-radius:10px;background:#F4F4F2;border:1px solid #e3e3e3;font:600 26px Inter;color:#333}`,
  html: ``,
  js: `
const tl = gsap.timeline();
// 1) papel + punto que cae
const s1 = K.scene({ bg: 'transparent' }); K.paper(s1); const hud = K.hud({ tl: 'ATRIL / MOTION REEL \\'26', tr: 'TC', bl: '@atril.studio', color: '#1a1a1a' }, s1);
const dot = K.dot(s1, { r: 64, color: '#C6F432' });
K.show(tl, s1, 0); K.drop(tl, dot, 0.3);
// 2) el punto se convierte en diagrama radial y se contrae
const rad = K.radial(s1, { core: 64, colors: ['#141414', '#C6F432'] }); gsap.set(rad.svg, { opacity: 0 });
tl.set(rad.svg, { opacity: 1 }, 3.4).set(dot.el, { opacity: 0 }, 3.4); K.burst(tl, rad, 3.4); K.spin(tl, rad.g, 3.4, 3, 40); K.implode(tl, rad, 6.2);
// 3) interfaz blanca: "Deadline" + cronómetro + etiquetas
const s3 = K.scene({ bg: '#FAFAF8' }); K.dotGrid(s3, { color: 'rgba(0,0,0,.08)', gap: 40, size: 2 });
K.el('div', { cls: 'lab', text: 'Tubes Java OOP', css: { left: '640px' } }, s3); K.el('div', { cls: 'lab', text: 'Dashboard Next.js', css: { left: '1000px' } }, s3);
const title = K.title(s3, 'Deadline', { font: 'DM Serif Display', italic: true, weight: 400, size: 230, y: 470, color: '#141414' });
const timer = K.timer(s3, { label: 'TIME LEFT', from: 70 * 3600 + 8 * 60, y: 700, color: '#141414' });
K.swap(tl, s1, s3, 7.0, { fx: 'flash' });
K.reveal(tl, title, 7.3, { fx: 'blur' }); tl.from(timer, { y: 30, opacity: 0, duration: 0.5, ease: 'power3.out' }, 7.9);
K.tags(tl, s3, ['Regression Analysis', 'Telegram Bot', 'Weekly Tasks', 'ERD + DFD', 'Internship Report'], 8.3, { rx: 690, ry: 340 });
timer.run(tl, 9.2, 3 * 3600 + 12 * 60 + 8, 0.9, 'expo.inOut');
// 4) glitch + número grande
const s4 = K.scene({ bg: '#0B0B0B', fg: '#F4F4F2' }); K.field(s4, '#0B0B0B', { dots: 'rgba(255,255,255,.12)' });
const big = K.bigNumber(s4, { text: '0', label: 'SUCCESSFUL PROJECTS', color: '#F4F4F2' });
K.glitch(tl, s3, 10.1, { dur: 0.45 }); K.swap(tl, s3, s4, 10.55, { fx: 'cut' });
K.counter(tl, big.num, 10.6, { from: 0, to: 353, suffix: '+', dur: 1.3 }); tl.from(big.label, { opacity: 0, y: 20, duration: 0.5 }, 11.2);
// 5) rejilla 3D de puntos que se vuelve toroide
const s5 = K.scene({ bg: '#000' }); K.field(s5, '#000', { rings: 'rgba(255,255,255,.08)' }); const p3 = K.points3d(s5, { color: '#fff' });
K.hud({ tl: '<span style="color:#E8352B">CLAUDE / MOTION REEL</span>', tr: '05 — DEPTH', color: '#fff' }, s5);
K.swap(tl, s4, s5, 12.6, { fx: 'wipe', color: '#E8352B' }); tl.fromTo(p3.p, { morph: 0, rotX: 1.1 }, { morph: 1, rotX: 0.5, duration: 2.2, ease: 'expo.inOut' }, 13.6);
// 6) curvas de aceleración
const s6 = K.scene({ bg: '#E8352B', fg: '#111' }); K.field(s6, '#E8352B');
K.title(s6, 'Six ways to get from A to B', { size: 64, y: 120, color: '#111', weight: 800 });
K.swap(tl, s5, s6, 16.0, { fx: 'slide' });
K.easeGraphs(tl, s6, ['none', 'power2.inOut', 'expo.out', 'back.out(1.7)', 'elastic.out(1,0.4)', 'bounce.out'], 16.2, { y: 220, w: 440, h: 250, color: '#111', accent: '#fff', dur: 1.8 });
// 7) líneas de energía + explosión
const s7 = K.scene({ bg: '#050505' }); const fl = K.flow(s7, { color: '#E8352B', color2: '#FF8A1A', add: true }); const px = K.particles(s7, { color: '#FF6A1A' });
K.swap(tl, s6, s7, 18.3, { fx: 'glitch' }); px.boom(tl, 18.6, 1.3);
K.grain(null, { opacity: 0.06 });
ATRIL.register(tl, 20);`,
};

describe.skipIf(!CHROME)("kit de motion", () => {
  it("renderiza la demo sin errores", async () => {
    const host = nodeHost();
    nfs.rmSync(OUT, { recursive: true, force: true }); nfs.mkdirSync(OUT, { recursive: true });
    const b = await launchBrowser(host, CHROME!, OUT);
    try {
      const samples = Array.from({ length: 24 }, (_, i) => (i + 0.5) / 24);
      const r = await renderComposition(b, DEMO, { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(OUT, "demo"), out: path.join(OUT, "demo.mp4"), samples });
      console.log("errores:", r.errors, r.consoleErrors);
      expect(r.errors).toEqual([]);
      // hoja de cuadros 6×4
      const inputs = r.samples.flatMap((s) => ["-i", s]);
      const f = r.samples.map((_, i) => `[${i}:v]scale=480:270[t${i}]`).join(";") + ";" + r.samples.map((_, i) => `[t${i}]`).join("") + `xstack=inputs=${r.samples.length}:layout=${r.samples.map((_, i) => `${(i % 6) * 480}_${Math.floor(i / 6) * 270}`).join("|")}[v]`;
      execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", f, "-map", "[v]", "-frames:v", "1", path.join(OUT, "hoja.jpg")]);
      for (const [i, s] of r.samples.entries()) nfs.copyFileSync(s, path.join(OUT, `cuadro_${String(i).padStart(2, "0")}.jpg`));
    } finally { await closeBrowser(b); }
  }, 600_000);
});
