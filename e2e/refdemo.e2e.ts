// Recreación de los videos de referencia (piezas v2.5 del kit) con Chromium real.
// Ejecutar: REF_OUT=/ruta npx vitest run -c vitest.e2e.config.ts e2e/refdemo.e2e.ts
import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import * as nfs from "node:fs";
import * as path from "node:path";
import { launchBrowser, closeBrowser, renderComposition, type MotionHost } from "../src/motion/engine";
import type { Composition } from "../src/motion/page";

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.CHROME_PATH ?? ""].find((p) => p && nfs.existsSync(p));
const OUT = process.env.REF_OUT ?? "/tmp/claude-0/refdemo";
const IMG = process.env.REF_IMG ?? "/tmp/claude-0/refimg";
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

const PAL = { bg: "#0D0E10", fg: "#E8E2D4", accent: "#E9A23B", muted: "#A3A39E", paper: "#D8CFBC", ink: "#0D0E10", fontTitle: "Archivo", fontBody: "Archivo", fontMono: "Courier Prime" };
const ICON = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  money: ICON('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>'),
  person: ICON('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'),
  bank: ICON('<path d="M3 10l9-6 9 6z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>'),
  doc: ICON('<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5M9 13h8M9 17h6"/>'),
  phone: ICON('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
  clock: ICON('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
};
const assets = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, path.join(IMG, `${k}.jpg`)]));

/** Ejemplo 1: app en un plano inclinado que despierta, cursor con enfoque que lo sigue, giros del plano y logotipo final. */
export const REF_A: Composition = {
  id: "refA", duration: 11, transparent: false, palette: PAL, icons: ICONS, css: "", html: "",
  js: `
const tl = gsap.timeline();
const s = K.scene({ bg: '#0D0E10' }); K.dotGrid(s, { color: 'rgba(232,226,212,.06)', gap: 48, size: 2 }); K.show(tl, s, 0);
const pl = K.plane(s, { w: 1600, h: 1000, quad: [[0,0],[10,3],[13,-3],[3,-6]], fit: { w: 1500 } });
const ui = K.ui(pl.el, { w: 1600, h: 1000, title: 'Ledger', heading: 'Q3 transfers', button: 'Export', labels: ['ACCOUNTS','FLAGGED','TOTAL'], values: ['2,481','64','$1.2M'] });
tl.from(pl.el, { opacity: 0, duration: 0.5 }, 0.1);
const cur = K.cursor(s, { x: 1560, y: 980 });
ui.awaken(tl, 1.0, { step: 0.42 });
cur.path(tl, 0.8, [[1180, 560], [930, 380], [760, 560], [1050, 720]], 3.4);
cur.click(tl, 1.35);
K.focus(ui.cards.concat(ui.rows, [ui.btn, ui.heading]), { cursor: cur, radius: 250, max: 8, from: 0.8, to: 4.5 });
tl.to(cur.el, { opacity: 0, duration: 0.2 }, 4.4);
pl.to(tl, 4.6, { quad: [[0,0],[-10,3],[-13,-3],[-3,-6]], dur: 1.1 });
pl.to(tl, 6.2, { quad: [[0,0],[0,6],[10,8],[10,2]], dur: 1.1 });
K.blackout(tl, 8.0, { hold: 2.5, max: 1 });
const logo = K.title(s, 'LEDGER', { size: 190, weight: 900, color: '#E8E2D4' }); logo.style.zIndex = 60; gsap.set(logo, { opacity: 0 });
tl.set(logo, { opacity: 1 }, 8.4); K.reveal(tl, logo, 8.4, { by: 'chars', fx: 'scale' });
const ring = K.svgLayer(s); ring.style.zIndex = 59; const rc = K.svg('circle', { cx: 960, cy: 540, r: 120, fill: 'none', stroke: '#E9A23B', 'stroke-width': 6 }, ring);
tl.fromTo(rc, { attr: { r: 60 }, opacity: 1 }, { attr: { r: 620 }, opacity: 0, duration: 0.9, ease: 'expo.out' }, 8.75);
ATRIL.register(tl, 11);`,
};

/** Ejemplo 2: pelota que rebota, flecha y cifra, letras que caen y rebotan, foto que late, rodillo 1→4, línea que se vuelve fondo,
    selector con clic, plano que sube, bloque que se separa con texto girado, anillo, onda de audio, corte en diagonal, conector y capas. */
export const REF_B: Composition = {
  id: "refB", duration: 25, transparent: false, palette: PAL, icons: ICONS, assets: assets(["img1", "img2", "img3"]),
  css: `.sel{position:absolute;left:560px;top:470px;width:800px;height:120px;border-radius:24px;background:#FFFFFF;box-shadow:0 20px 60px rgba(0,0,0,.18);display:flex;align-items:center;gap:16px;padding:0 26px;box-sizing:border-box;font:700 30px Archivo;color:#0D0E10}
.sel span{flex:1;opacity:.5}.sel b{padding:14px 26px;border-radius:14px;background:#EFEAE0}
.note{position:absolute;left:560px;top:600px;width:800px;padding:26px 30px;box-sizing:border-box;border-radius:18px;background:#0D0E10;color:#E8E2D4;font:700 46px 'Courier Prime';text-align:center}
.mark{position:absolute;width:150px;height:150px;border-radius:36px;background:#0D0E10;color:#E9A23B;display:flex;align-items:center;justify-content:center;font:900 70px Archivo}`,
  html: "",
  js: `
const tl = gsap.timeline();
const SAND = '#D8CFBC', INK = '#0D0E10', BONE = '#E8E2D4', SOD = '#E9A23B';
const s1 = K.scene({ bg: SAND }); K.paper(s1, { color: SAND, grid: true, gridSize: 90, marks: false });
const ball = K.dot(s1, { x: 960, y: 560, r: 70, color: SOD }); K.show(tl, s1, 0); K.drop(tl, ball, 0.15);
tl.to([ball.el, ball.shadow], { x: -540, scale: 0.35, duration: 0.8, ease: 'expo.inOut' }, 1.4);
const ar = K.arrow(s1, { from: [440, 720], to: [1300, 330], bend: -0.08, color: SOD, color2: INK, width: 16 }); ar.draw(tl, 2.1, 0.8);
const num = K.text(s1, '+340%', { x: 880, y: 800, size: 110, font: 'Courier Prime', weight: 700, color: INK, lines: false }); tl.from(num, { opacity: 0, y: 40, duration: 0.5, ease: 'expo.out' }, 2.8);
const s2 = K.scene({ bg: SAND }); K.paper(s2, { color: SAND, grid: true, gridSize: 90, marks: false }); K.swap(tl, s1, s2, 3.8);
const t2 = K.title(s2, 'THE PIPELINE', { size: 170, weight: 900, color: INK, y: 330 });
const ch = new SplitText(t2, { type: 'chars' }).chars;
tl.fromTo(ch, { y: -420, opacity: 0 }, { keyframes: [{ y: 420, opacity: 1, duration: 0.32, ease: 'power2.in' }, { y: 0, duration: 0.6, ease: 'back.out(2.2)' }], stagger: 0.035 }, 3.85);
const im = K.image(s2, 'img1', { x: 660, y: 520, w: 600, h: 380, radius: 18 }); gsap.set(im, { opacity: 0 });
tl.to(im, { opacity: 1, duration: 0.15 }, 5.2).to(im, { scale: 0.9, duration: 0.16, ease: 'power2.in' }, 5.3).to(im, { scale: 1.05, duration: 0.3, ease: 'back.out(3)' }, 5.46);
const s3 = K.scene({ bg: INK }); K.swap(tl, s2, s3, 6.4);
const roll = K.roll(s3, ['1', '2', '3', '4'], { x: 520, y: 540, size: 260, color: BONE, font: 'Archivo' }); roll.run(tl, 6.7, 0.5);
const ln = K.svgLayer(s3), line = K.svg('line', { x1: 640, y1: 540, x2: 1890, y2: 540, stroke: BONE, 'stroke-width': 6 }, ln), knob = K.svg('circle', { cx: 640, cy: 540, r: 16, fill: BONE }, ln);
tl.fromTo(line, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.7, ease: 'power2.in' }, 8.3).fromTo(knob, { attr: { cx: 640 } }, { attr: { cx: 1890 }, duration: 0.7, ease: 'power2.in' }, 8.3);
const s4 = K.scene({ bg: BONE }); K.swap(tl, s3, s4, 9.5, { fx: 'cover', from: [1890, 540], color: BONE, dur: 0.5 });
const sel = K.el('div', { cls: 'sel', html: '<span>Model</span><b>Fast</b><b>Deep</b><b>Max</b>' }, s4); const opts = sel.querySelectorAll('b');
const cur = K.cursor(s4, { x: 1500, y: 900, color: '#FFFFFF' }); cur.move(tl, 9.6, { x: opts[1].offsetLeft + 560 + 40, y: 530, dur: 0.6 }); cur.click(tl, 10.25);
tl.to(opts[1], { backgroundColor: SOD, color: INK, duration: 0.25 }, 10.3);
const s5 = K.scene({ bg: BONE }); K.swap(tl, s4, s5, 11.0, { fx: 'slide', dir: 'up', dur: 0.38 });
const w5 = K.el('div', { cls: 'k-layer' }, s5);
const tA = K.text(w5, 'Most of it was never filed', { y: 470, size: 64, weight: 800, color: INK, lines: false }); const note = K.el('div', { cls: 'note', text: '$4.0B UNACCOUNTED' }, w5);
tl.to(tA, { y: -70, duration: 0.5, ease: 'expo.inOut' }, 12.0).to(note, { y: 90, duration: 0.5, ease: 'expo.inOut' }, 12.0);
const mid = K.text(w5, 'ON PURPOSE', { y: 560, size: 96, weight: 900, color: SOD, lines: false }); gsap.set(mid, { rotation: -20, opacity: 0, scale: 0.6 });
tl.to(mid, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' }, 12.3);
tl.to(w5, { scale: 0.15, opacity: 0, duration: 0.45, ease: 'expo.in' }, 13.3);
const s6 = K.scene({ bg: INK }); K.swap(tl, s5, s6, 13.8);
const c2 = K.el('div', { css: { position: 'absolute', left: '860px', top: '200px', width: '200px', height: '200px', borderRadius: '50%', background: SOD, color: INK, font: '900 120px Archivo', display: 'flex', alignItems: 'center', justifyContent: 'center' }, text: '2' }, s6);
tl.from(c2, { scale: 0, duration: 0.4, ease: 'back.out(2)' }, 13.9);
const rl = K.svgLayer(s6), rr = K.svg('circle', { cx: 960, cy: 300, r: 100, fill: 'none', stroke: SOD, 'stroke-width': 5 }, rl);
tl.fromTo(rr, { attr: { r: 100 }, opacity: 1 }, { attr: { r: 520 }, opacity: 0, duration: 0.7, ease: 'expo.out' }, 14.2);
const wv = K.wave(s6, { x: 360, y: 600, w: 1200, h: 220, split: 0.15 }); tl.from(wv.el, { opacity: 0, y: 40, duration: 0.4 }, 14.4); tl.to(wv.p, { split: 0.6, duration: 1.5, ease: 'none' }, 14.8);
tl.to(wv.p, { level: 0.06, duration: 0.35, ease: 'power2.in' }, 16.3);
const s7 = K.scene({ bg: '#17110D' }); K.swap(tl, s6, s7, 16.8);
const big = K.title(s7, 'IT WAS <span id="kw" style="color:#E9A23B;font-size:1.25em">DELETED</span>', { size: 140, weight: 900, color: BONE });
K.reveal(tl, big, 16.9, { by: 'words', fx: 'rise' }); K.cut(tl, '#kw', 17.9, { angle: 21.8, color: BONE });
const s8 = K.scene({ bg: SAND }); K.swap(tl, s7, s8, 19.0, { fx: 'whip' });
const m1 = K.el('div', { cls: 'mark', css: { left: '420px', top: '465px' }, text: '◆' }, s8), m2 = K.el('div', { cls: 'mark', css: { left: '1350px', top: '465px' }, text: '●' }, s8);
const cn = K.arrow(s8, { from: [575, 540], to: [1345, 540], head: false, width: 6, color: INK, color2: SOD, dash: '18 16' });
tl.from([m1, m2], { scale: 0, duration: 0.35, ease: 'back.out(2)', stagger: 0.1 }, 19.2);
tl.fromTo(cn.path, { strokeDashoffset: 0 }, { strokeDashoffset: -340, duration: 1.6, ease: 'none' }, 19.4);
tl.to(cn.svg, { opacity: 0, duration: 0.08, repeat: 5, yoyo: true, repeatDelay: 0.14 }, 19.6);
const s9 = K.scene({ bg: INK }); K.swap(tl, s8, s9, 21.2, { fx: 'tiles' === 'x' ? 'cut' : 'cut' });
const sk = K.stack(s9, { n: 6, quad: [[0,0],[8,2],[10,-6],[2,-5]], fit: { w: 1000 }, offset: [-80, 52] });
sk.layers[0].innerHTML = '<div style="position:absolute;inset:0;background:url(' + ATRIL.asset('img2') + ') center/cover"></div>';
sk.layers[1].innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 200px Archivo;color:#E9A23B">FILE</div>';
sk.layers[2].innerHTML = '<div style="position:absolute;left:120px;top:160px;right:120px;font:700 64px Archivo;color:#E8E2D4;line-height:1.2">Five layers, one record</div>';
sk.layers[3].innerHTML = '<div style="position:absolute;inset:0;background:url(' + ATRIL.asset('img3') + ') center/cover;opacity:.7"></div>';
tl.from(sk.layers, { opacity: 0, duration: 0.3, stagger: 0.05 }, 21.3); sk.spread(tl, 21.7, { s: 1, dur: 1.3 }); sk.to(tl, 23.1, { quad: [[0,0],[9,1],[10,-6],[1,-6]], dur: 1.2 });
ATRIL.register(tl, 25);`,
};

/** Ejemplos 3, 5, 6, 7 y 8: paisaje velado con círculos, palabra que cambia cada vez más rápido, escritura con cámara y letras que caen,
    cursor que rompe el texto con tiempo detenido, galería, vidrio, pincel, mosaico diagonal, carrusel curvo, destellos, texto gigante y líneas onduladas. */
export const REF_C: Composition = {
  id: "refC", duration: 30, transparent: false, palette: PAL, icons: ICONS, assets: assets(["img1", "img2", "img3", "img4", "img5", "land"]),
  css: `.btnw{display:inline-block;padding:0 .3em;border-radius:.2em;background:#E9A23B;color:#0D0E10}`,
  html: "",
  js: `
const tl = gsap.timeline();
const SAND = '#D8CFBC', INK = '#0D0E10', BONE = '#E8E2D4', SOD = '#E9A23B';
const s1 = K.scene({ bg: '#000' }); K.image(s1, 'land', { w: 1920, h: 1080 }); K.el('div', { cls: 'k-layer', css: { background: 'rgba(255,255,255,.45)' } }, s1);
const sc = K.scatter(s1, { n: 170, color: '#000000', opacity: 0.55 }); K.show(tl, s1, 0); sc.grow(tl, 0.2, { dur: 1 }); sc.drift(tl, 1.7, { dur: 1.4 });
const phrase = K.text(s1, 'We found the <span class="btnw">same</span> file', { y: 540, size: 92, weight: 900, color: '#FFFFFF', lines: false });
tl.from(phrase, { opacity: 0, y: 30, duration: 0.5 }, 1.2);
const cu = K.cursor(s1, { x: 1500, y: 920 }); cu.move(tl, 1.6, { x: 990, y: 560, dur: 0.6 }); cu.click(tl, 2.3);
const s2 = K.scene({ bg: INK }); K.swap(tl, s1, s2, 2.6, { fx: 'zoom' });
const cy = K.cycle(tl, s2, 'SAME', 2.7, { n: 18, dur: 4, accel: 4, size: 250, bgEl: s2, end: 'COPY' });
const s3 = K.scene({ bg: SAND }); K.swap(tl, s2, s3, cy.end + 0.6);
const ty = K.typeline(s3, 'the archive kept every single version of it', { size: 120, color: INK });
ty.type(tl, cy.end + 0.7, 2.6); ty.fall(tl, cy.end + 3.6, { focus: 4, zoom: 18 });
const T4 = cy.end + 5.6;
const s4 = K.scene({ bg: INK }); K.swap(tl, s3, s4, T4);
const cu2 = K.cursor(s4, { x: 260, y: 900 }); cu2.move(tl, T4 + 0.2, { x: 1650, y: 210, dur: 0.38, ease: 'power3.in' });
const s5 = K.scene({ bg: SAND }); K.swap(tl, s4, s5, T4 + 0.45);
const t5 = K.title(s5, 'EVERY RECORD HAS A PRICE', { size: 130, weight: 900, color: INK });
K.explode(tl, t5, T4 + 0.5, { split: 'words', force: 1100, dur: 3, freeze: { at: 0.1, len: 0.62, speed: 0.1 } });
const T6 = T4 + 3.6;
const s6 = K.scene({ bg: INK }); K.swap(tl, s5, s6, T6, { fx: 'slide' });
const t6 = K.title(s6, 'THE ARCHIVE', { size: 120, weight: 900, color: BONE }); t6.style.zIndex = 5;
const g = K.gallery(s6, ['img1', 'img2', 'img3', 'img4', 'img5'], { n: 24 }); g.fadeIn(tl, T6 + 0.3, { amount: 1.4 }); g.burst(tl, T6 + 2.1);
const T7 = g.cover(tl, T6 + 3.4, 7);
const s7 = K.scene({ bg: INK }); K.swap(tl, s6, s7, T7); K.image(s7, 'img2', { w: 1920, h: 1080 });
[[60, 80, 420, 280, 8], [1440, 700, 420, 280, 8], [300, 760, 260, 170, 0], [1450, 120, 260, 170, 0]].forEach(function (r) { const e = K.image(s7, 'img' + (1 + Math.round(r[0]) % 4), { x: r[0], y: r[1], w: r[2], h: r[3], radius: 14 }); e.style.filter = 'blur(' + r[4] + 'px)'; });
const gl = K.glass(s7, { x: 610, y: 390, w: 700, h: 300, html: '<div style="padding:60px;font:800 64px Archivo;color:#fff">4,812 FILES</div>' }); gl.shine(tl, T7 + 0.5);
const veil = K.el('div', { cls: 'k-layer', css: { background: '#FFFFFF', zIndex: 20 } }, s7); gsap.set(veil, { opacity: 0 }); tl.to(veil, { opacity: 1, duration: 1.1, ease: 'power1.in' }, T7 + 1.6);
const T8 = T7 + 2.8;
const s8 = K.scene({ bg: SAND }); K.swap(tl, s7, s8, T8);
const br = K.brush(s8, { image: 'img4', cover: SOD, points: [[260, 860], [640, 320], [1020, 780], [1420, 300], [1700, 640]] }); br.play(tl, T8 + 0.2, 3.2);
tl.to(br.under, { scale: 1.25, duration: 0.9, ease: 'power2.inOut' }, T8 + 3.5);
const T9 = T8 + 4.5;
const tiles = K.tiles(tl, T9 - 0.75, { color: INK, size: 160 });
const s9 = K.scene({ bg: INK }); K.swap(tl, s8, s9, T9);
K.carousel(tl, s9, ['img1', 'img3', 'img5', 'img2'], T9 + 0.4, { each: 0.55, dur: 2.2 });
ATRIL.register(tl, 30);`,
};


/** Ejemplo 8: destellos, texto gigante que se encoge, casilla de líneas, símbolos expulsados, nube de textos, destello con glitch,
    círculo con línea ondulada, cinco curvas con íconos, cámara que salta entre extremos y puntos que forman un círculo. */
export const REF_D: Composition = {
  id: "refD", duration: 16, transparent: false, palette: PAL, icons: ICONS, css: "", html: "",
  js: `
const tl = gsap.timeline();
const INK = '#0D0E10', BONE = '#E8E2D4', SOD = '#E9A23B';
const s = K.scene({ bg: INK }); K.show(tl, s, 0);
K.flicker(tl, 0.0, { n: 3 });
const gt = K.title(s, 'FOLLOW', { size: 200, weight: 900, color: BONE }); tl.fromTo(gt, { scale: 6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'expo.out' }, 0.05).to(gt, { opacity: 0, duration: 0.2 }, 1.2);
const L = K.svgLayer(s), ln = function (a) { return K.svg('line', Object.assign({ stroke: BONE, 'stroke-width': 4 }, a), L); };
const h1 = ln({ x1: 0, y1: 470, x2: 1920, y2: 470 }), h2 = ln({ x1: 0, y1: 610, x2: 1920, y2: 610 });
tl.fromTo([h1, h2], { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 0.4, ease: 'expo.out' }, 1.5);
const d1 = ln({ x1: 950, y1: 610, x2: 990, y2: 470 }), d2 = ln({ x1: 930, y1: 610, x2: 970, y2: 470 }); gsap.set([d1, d2], { opacity: 0 });
tl.set([d1, d2], { opacity: 1 }, 1.9).to(d1, { attr: { x1: 1150, x2: 1190 }, duration: 0.25, ease: 'expo.out' }, 1.95).to(d2, { attr: { x1: 730, x2: 770 }, duration: 0.25, ease: 'expo.out' }, 1.95).set([d1, d2], { opacity: 0 }, 2.25);
const v1 = ln({ x1: 760, y1: 0, x2: 760, y2: 1080 }), v2 = ln({ x1: 1160, y1: 0, x2: 1160, y2: 1080 });
tl.fromTo([v1, v2], { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 0.3, ease: 'expo.out' }, 2.25);
const word = K.title(s, 'PAID', { size: 110, weight: 900, color: BONE }); tl.from(word, { yPercent: 120, opacity: 0, duration: 0.35, ease: 'expo.out' }, 2.55);
const syms = ['><', '/', '—', ')', '(', '<>', '//', '+'].map(function (t, i) { const a = i / 8 * 6.2832; const e = K.text(s, t, { x: 960 + Math.cos(a) * 330, y: 540 + Math.sin(a) * 190, size: 64, weight: 700, font: 'Courier Prime', color: SOD, lines: false }); gsap.set(e, { opacity: 0 }); return e; });
tl.set(syms, { opacity: 1 }, 3.0);
K.explode(tl, syms, 3.15, { x: 960, y: 540, force: 260, dur: 0.6, freeze: false, blur: 12 });
tl.to([h1, h2, v1, v2], { opacity: 0, duration: 0.15 }, 3.5);
const cloud = ['LEDGER', 'WIRE', 'SHELL', 'TRUST', 'CAYMAN', 'OFFSHORE', 'FEE', 'MEMO'].map(function (t, i) { const sz = [30, 70, 40, 90, 28, 60, 34, 50][i]; const e = K.text(s, t, { x: 960 + Math.cos(i * 0.8) * (320 + (i % 3) * 140), y: 540 + Math.sin(i * 0.8) * (170 + (i % 2) * 120), size: sz, weight: 800, color: BONE, lines: false }); e.style.filter = sz < 45 ? 'blur(3px)' : 'none'; gsap.set(e, { opacity: 0 }); return e; });
tl.to(cloud, { opacity: 0.85, duration: 0.3, stagger: 0.04 }, 3.6);
K.flash(tl, 5.0, { dur: 0.25 }); K.glitch(tl, word, 5.05, { dur: 0.4 }); tl.set(cloud, { opacity: 0 }, 5.1).set(word, { text: 'HIDDEN' }, 5.2).to(word, { opacity: 0, duration: 0.2 }, 6.1);
const cam = K.camera(s); const G = K.svgLayer(cam.world);
const hub = K.svg('circle', { cx: 380, cy: 540, r: 40, fill: SOD }, G); gsap.set(hub, { attr: { r: 0 } }); tl.to(hub, { attr: { r: 40 }, duration: 0.4, ease: 'back.out(2)' }, 6.3);
const ends = [[1480, 220], [1560, 400], [1600, 560], [1540, 740], [1440, 900]], names = ['money', 'bank', 'doc', 'phone', 'clock'];
const w0 = K.arrow(cam.world, { from: [420, 540], to: [1300, 540], d: K.waveD(420, 540, 1300, 540, 26, 5), head: false, width: 5, color: SOD, color2: BONE }); w0.draw(tl, 6.6, 1);
tl.to(w0.svg, { opacity: 0, duration: 0.2 }, 7.6);
ends.forEach(function (e, i) { const a = K.arrow(cam.world, { from: [420, 540], to: e, bend: (i - 2) * 0.12, head: false, width: 4, color: BONE, color2: SOD }); a.draw(tl, 7.7 + i * 0.07, 0.4); const ic = K.icon(cam.world, names[i], { x: e[0] + 70, y: e[1], size: 80, color: SOD }); gsap.set(ic, { scale: 0 }); tl.to(ic, { scale: 1, duration: 0.3, ease: 'back.out(2)' }, 8.0 + i * 0.07); });
cam.to(tl, 8.6, { x: 1520, y: 310, zoom: 2.2, dur: 0.3 }); cam.to(tl, 9.2, { x: 1500, y: 820, zoom: 2.2, dur: 0.3 }); cam.to(tl, 9.8, { x: 1600, y: 560, zoom: 2.6, dur: 0.25 }); cam.to(tl, 10.15, { x: 960, y: 540, zoom: 1, dur: 0.4 });
const dots = ends.map(function (e) { return K.svg('circle', { cx: e[0] + 70, cy: e[1], r: 10, fill: '#FFFFFF' }, G); }); gsap.set(dots, { opacity: 0 });
tl.to(dots, { opacity: 1, duration: 0.2 }, 12.4);
dots.forEach(function (d, i) { const a = i / dots.length * 6.2832 - 1.5708; tl.to(d, { attr: { cx: 960 + Math.cos(a) * 200, cy: 540 + Math.sin(a) * 200 }, duration: 0.7, ease: 'expo.inOut' }, 12.7); });
const end = K.title(s, 'LINKED', { size: 90, weight: 900, color: BONE }); gsap.set(end, { opacity: 0 }); tl.set(end, { opacity: 1 }, 13.4); K.glitch(tl, end, 13.4, { dur: 0.4 });
ATRIL.register(tl, 16);`,
};

describe.skipIf(!CHROME || !nfs.existsSync(IMG))("videos de referencia (kit v2.5)", () => {
  for (const [comp, times] of [
    [REF_A, [0.6, 1.6, 2.4, 3.2, 4.2, 5.2, 5.9, 7.0, 7.8, 8.6, 9.2, 10.5]],
    [REF_B, [1.0, 2.6, 3.4, 4.4, 5.5, 7.6, 9.0, 9.8, 10.4, 11.3, 12.6, 13.6, 14.5, 15.6, 16.6, 17.3, 18.3, 19.8, 21.6, 22.6, 24.4]],
    [REF_C, [0.9, 2.0, 2.4, 3.5, 5.6, 7.6, 9.5, 10.9, 11.6, 12.0, 12.6, 13.2, 13.8, 15.3, 17.6, 18.9, 20.3, 22.5, 24.2, 25.0, 26.3, 28.5, 29.2, 29.8]],
    [REF_D, [0.1, 0.3, 1.0, 1.8, 2.1, 2.4, 2.8, 3.1, 3.3, 4.2, 5.15, 5.6, 6.9, 7.6, 8.3, 8.8, 9.4, 9.95, 11.0, 12.9, 13.6, 15.0]],
  ] as const) {
    it(`renderiza ${comp.id} sin errores`, async () => {
      const dir = path.join(OUT, comp.id);
      nfs.rmSync(dir, { recursive: true, force: true }); nfs.mkdirSync(dir, { recursive: true });
      const b = await launchBrowser(nodeHost(), CHROME!, dir);
      try {
        const r = await renderComposition(b, comp, { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(dir, "w"), out: path.join(dir, `${comp.id}.mp4`), samples: times.map((t) => Math.min(0.999, t / comp.duration)) });
        console.log(comp.id, "errores:", r.errors, r.consoleErrors);
        expect([...r.errors, ...r.consoleErrors]).toEqual([]);
        const cols = 4, inputs = r.samples.flatMap((s) => ["-i", s]);
        const f = r.samples.map((_, i) => `[${i}:v]scale=480:270[t${i}]`).join(";") + ";" + r.samples.map((_, i) => `[t${i}]`).join("") + `xstack=inputs=${r.samples.length}:layout=${r.samples.map((_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join("|")}[v]`;
        execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", f, "-map", "[v]", "-frames:v", "1", path.join(dir, "hoja.jpg")]);
      } finally { await closeBrowser(b); }
    }, 900_000);
  }
});
