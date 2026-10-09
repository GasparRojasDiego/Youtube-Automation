// Demo de las piezas de impacto del kit (v2.4): recrea una secuencia «wow»
// con Chromium real y guarda una hoja de cuadros para revisarla a ojo.
// Ejecutar: KIT_OUT=/ruta npx vitest run -c vitest.e2e.config.ts e2e/impactdemo.e2e.ts
import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import * as nfs from "node:fs";
import * as path from "node:path";
import { launchBrowser, closeBrowser, renderComposition, type MotionHost } from "../src/motion/engine";
import type { Composition } from "../src/motion/page";

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.CHROME_PATH ?? ""].find((p) => p && nfs.existsSync(p));
const OUT = process.env.KIT_OUT ?? "/tmp/claude-0/impactdemo";
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

const MONEY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>`;
const PERSON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>`;
const BANK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/></svg>`;

export const IMPACT: Composition = {
  id: "impact", duration: 24, transparent: false,
  palette: { bg: "#0D0E10", fg: "#E8E2D4", accent: "#E9A23B", muted: "#A3A39E", fontTitle: "Archivo", fontBody: "Archivo", fontMono: "Courier Prime" },
  icons: { money: MONEY, person: PERSON, bank: BANK },
  css: `.card{position:absolute;left:660px;top:330px;width:600px;height:400px;border-radius:28px;background:#17181B;border:2px solid rgba(232,226,212,.28);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#E8E2D4;font:900 150px/1 Archivo;letter-spacing:-.03em}
.card small{font:700 26px/1 "Courier Prime";letter-spacing:.18em;color:#E9A23B;margin-bottom:18px}`,
  html: ``,
  js: `
const tl = gsap.timeline();
const BG = '#0D0E10', BONE = '#E8E2D4', SOD = '#E9A23B', RED = '#C8102E';
// 1) recuadro central → se inclina → ecos arriba/abajo → deriva diagonal + cámara
const s1 = K.scene({ bg: BG }); K.dotGrid(s1, { color: 'rgba(232,226,212,.07)', gap: 48, size: 2 });
const cam1 = K.camera(s1);
const card = K.el('div', { cls: 'card', html: '<small>FILE 03</small><b>$2.1B</b>' }, cam1.world);
K.hud({ tl: 'FILE 03 / THE ENDOWMENT', tr: 'TC', color: '#A3A39E' }, s1);
K.show(tl, s1, 0); tl.from(card, { scale: 0.55, opacity: 0, duration: 0.6, ease: 'expo.out' }, 0.1);
K.tilt(tl, card, 0.8, { rx: 50, z: -120 });
const ech = K.echo(tl, card, 1.3, { n: 3, dy: 115, opacity: 0.5 });
tl.to([card].concat(ech), { x: '+=240', y: '-=140', duration: 1.1, ease: 'expo.inOut' }, 2.0);
cam1.to(tl, 2.0, { zoom: 1.1, x: 1040, y: 430, dur: 1.4 });
// 2) círculo desde la izquierda tapa todo → flecha con color que corre
const s2 = K.scene({ bg: BG });
K.swap(tl, s1, s2, 3.7, { fx: 'cover', from: 'left', color: SOD });
const ar = K.arrow(s2, { from: [260, 800], to: [1640, 300], bend: 0.16, color: SOD, color2: RED, width: 16 });
ar.draw(tl, 4.0, 1.0); ar.flow(tl, 4.8, 1.1, 1);
tl.to(ar.svg, { opacity: 0, duration: 0.3 }, 6.0);
// 3) núcleo que suelta figuras que giran y se transforman
const em = K.emitter(s2, { n: 12, colors: [SOD, BONE, RED] });
tl.from(em.core, { attr: { r: 0 }, duration: 0.5, ease: 'back.out(2)' }, 6.0);
em.burst(tl, 6.4); em.morph(tl, 7.3); em.morph(tl, 8.0); em.collapse(tl, 8.8);
// 4) patrón geométrico → ola → filas que se cruzan → casi todo se apaga → texto que crece
const s3 = K.scene({ bg: BG });
K.swap(tl, s2, s3, 9.5, { fx: 'whip' });
const pt = K.pattern(s3, { cols: 15, rows: 8, gap: 112, size: 15, shape: 'mix', color: 'rgba(232,226,212,.85)', color2: SOD });
pt.enter(tl, 9.6); pt.wave(tl, 10.3); pt.shift(tl, 10.9, { dist: 112 });
pt.dim(tl, 11.6, { keep: [[3, 7]], to: 0.08 });
const t3 = K.title(s3, 'FOLLOW THE <span style="color:#E9A23B">MONEY</span>', { size: 150, y: 540, weight: 900 });
tl.fromTo(t3, { scale: 0.6, opacity: 0 }, { scale: 1.06, opacity: 1, duration: 1.4, ease: 'expo.out' }, 12.0);
K.redact(tl, t3, 13.4, { mode: 'pass', color: BONE });
// 5) ícono de dinero → flecha de crecimiento con texto → zoom a la punta → láminas alternas
const s4 = K.scene({ bg: BG }); const cam4 = K.camera(s4);
K.swap(tl, s3, s4, 14.2, { fx: 'cut' });
const money = K.icon(cam4.world, 'money', { x: 420, y: 650, size: 230, color: SOD }); K.drawIcon(tl, money, 14.3);
const ar2 = K.arrow(cam4.world, { from: [560, 720], to: [1480, 300], bend: -0.06, color: SOD, color2: BONE, width: 18 }); ar2.draw(tl, 14.8, 0.9);
const lab = K.text(cam4.world, '+340%', { x: 1120, y: 380, size: 96, font: 'Courier Prime', weight: 700, color: BONE, lines: false });
tl.from(lab, { opacity: 0, y: 40, duration: 0.5, ease: 'expo.out' }, 15.4);
cam4.to(tl, 16.0, { x: 1480, y: 300, zoom: 2.4, dur: 0.9 });
tl.to(cam4.world, { opacity: 0.12, duration: 0.3 }, 16.8);
K.slabs(tl, s4, ['2019 · $1.2 BILLION', '2021 · $2.1 BILLION', '2023 · $4.0 BILLION'], 17.0, { h: 100, w: 1320, colors: [BONE, SOD, BONE], textColor: BG });
K.blackout(tl, 18.6, { hold: 0.4 });
// 6) red: quién paga a quién + foco + sello
const s5 = K.scene({ bg: BG });
K.swap(tl, s4, s5, 19.7, { fx: 'cover', from: 'right', color: BONE });
const net = K.network(s5, { nodes: [{ id: 'd', x: 420, y: 420, label: 'DONORS', icon: 'person' }, { id: 'u', x: 960, y: 640, label: 'UNIVERSITY', icon: 'bank' }, { id: 'f', x: 1500, y: 420, label: 'FUND', icon: 'money' }],
  links: [{ from: 'd', to: 'u', label: '$1.2B', accent: true }, { from: 'u', to: 'f', label: '$4.0B' }] });
net.build(tl, 20.0);
K.spotlight(tl, 21.6, { x: 960, y: 620, r: 230 });
const st = K.text(s5, 'DOCUMENTED', { x: 960, y: 900, size: 54, font: 'Courier Prime', weight: 700, color: SOD, lines: false });
st.style.border = '4px solid ' + SOD; st.style.padding = '8px 22px';
K.slam(tl, st, 22.2, { shakeEl: s5 });
K.strobe(tl, null, 23.2, { n: 2 });
K.grain(null, { opacity: 0.05 });
ATRIL.register(tl, 24);`,
};

describe.skipIf(!CHROME)("piezas de impacto del kit", () => {
  it("renderiza la secuencia sin errores", async () => {
    const host = nodeHost();
    nfs.rmSync(OUT, { recursive: true, force: true }); nfs.mkdirSync(OUT, { recursive: true });
    const b = await launchBrowser(host, CHROME!, OUT);
    try {
      const times = [0.6, 1.2, 1.9, 2.9, 3.5, 4.3, 5.2, 6.7, 7.6, 8.4, 9.9, 10.6, 11.2, 12.3, 13.1, 13.7, 15.0, 15.7, 16.6, 17.8, 18.9, 20.6, 22.0, 22.8];
      const samples = times.map((t) => t / 24);
      const r = await renderComposition(b, IMPACT, { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(OUT, "w"), out: path.join(OUT, "impact.mp4"), samples });
      console.log("errores:", r.errors, r.consoleErrors);
      expect(r.errors).toEqual([]);
      const inputs = r.samples.flatMap((s) => ["-i", s]);
      const f = r.samples.map((_, i) => `[${i}:v]scale=480:270[t${i}]`).join(";") + ";" + r.samples.map((_, i) => `[t${i}]`).join("") + `xstack=inputs=${r.samples.length}:layout=${r.samples.map((_, i) => `${(i % 6) * 480}_${Math.floor(i / 6) * 270}`).join("|")}[v]`;
      execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", f, "-map", "[v]", "-frames:v", "1", path.join(OUT, "hoja.jpg")]);
    } finally { await closeBrowser(b); }
  }, 900_000);
});
