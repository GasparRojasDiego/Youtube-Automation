// Prueba real del motor de motion con Chromium sin ventana + ffmpeg.
import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import * as nfs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { launchBrowser, closeBrowser, renderComposition, previewComposition, EngineError, type MotionHost } from "./engine";
import { fileUrlOf, plainPath, type Composition } from "./page";

describe("rutas de Windows", () => {
  it("quita el prefijo de ruta extendida y codifica espacios", () => {
    expect(plainPath("\\\\?\\C:\\Program Files\\ATRIL\\resources")).toBe("C:\\Program Files\\ATRIL\\resources");
    expect(fileUrlOf("\\\\?\\C:\\Program Files\\ATRIL\\resources\\motion\\gsap.min.js")).toBe("file:///C:/Program%20Files/ATRIL/resources/motion/gsap.min.js");
    expect(fileUrlOf("C:\\Users\\Diego Fernando\\AppData\\Roaming\\x.html")).toBe("file:///C:/Users/Diego%20Fernando/AppData/Roaming/x.html");
    expect(fileUrlOf("/home/u/a b.html")).toBe("file:///home/u/a%20b.html");
  });
});

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.CHROME_PATH ?? ""].find((p) => p && nfs.existsSync(p));
const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"]); return true; } catch { return false; } })();
const ROOT = path.resolve(__dirname, "../../src-tauri/resources");

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

const TITLE: Composition = {
  id: "t1", duration: 2, transparent: false, libs: ["map"],
  css: `.bg{position:absolute;inset:0;background:#111} h1{position:absolute;left:120px;top:420px;margin:0;font:700 120px "Oswald";color:#F2EFE9} svg{position:absolute;right:80px;top:80px}`,
  html: `<div class="bg"></div><h1 id="t">THE DARK SECRET</h1><svg width="600" height="400"><path id="land" fill="none" stroke="#C9A227" stroke-width="1.5"></path></svg>`,
  js: `const proj = d3.geoNaturalEarth1().fitSize([600,400], topojson.feature(ATRIL_WORLD, ATRIL_WORLD.objects.land));
document.getElementById('land').setAttribute('d', d3.geoPath(proj)(topojson.feature(ATRIL_WORLD, ATRIL_WORLD.objects.land)));
const split = new SplitText('#t', {type:'chars'});
const tl = gsap.timeline({paused:true});
tl.from(split.chars, {yPercent:110, opacity:0, stagger:0.04, duration:0.6, ease:'power3.out'})
  .from('#land', {drawSVG:'0%', duration:1.2, ease:'power2.inOut'}, 0.2);
ATRIL.register(tl, 2);`,
};

const OVERLAY: Composition = {
  id: "o1", duration: 1, transparent: true,
  css: `.box{position:absolute;left:100px;bottom:120px;padding:20px 40px;background:#C9A227;font:800 56px Poppins;color:#111}`,
  html: `<div class="box" id="b">1889</div>`,
  js: `const tl = gsap.timeline(); tl.fromTo('#b',{x:-400,opacity:0},{x:0,opacity:1,duration:0.5,ease:'expo.out'}); ATRIL.register(tl, 1);`,
};

const BROKEN: Composition = { id: "x", duration: 1, transparent: false, css: "", html: "<div></div>", js: "undefinedFn();" };

const KIT: Composition = {
  id: "k1", duration: 1.5, transparent: false, css: "", html: "", palette: { accent: "#C6F432", fontTitle: "Inter" },
  icons: { police: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>' },
  js: `const tl = gsap.timeline(); const s = K.scene(); K.paper(s); K.hud({ tl: 'ATRIL', tr: 'TC' }, s);
const t = K.title(s, 'Deadline', { font: 'DM Serif Display', italic: true, size: 200 }); const n = K.bigNumber(s, { text: '0', label: 'TEST', y: 800, size: 120 });
const ic = K.icon(s, 'police', { x: 300, y: 300, size: 140, color: '#C6F432' }); K.drawIcon(tl, ic, 0.1);
K.show(tl, s, 0); K.reveal(tl, t, 0.1, { fx: 'blur' }); K.counter(tl, n.num, 0.2, { to: 353, suffix: '+', dur: 0.8 }); K.glitch(tl, s, 1.1, { dur: 0.3 });
const cam = K.camera(s); const card = K.title(cam.world, 'FILE 03', { font: 'Archivo', weight: 900, size: 90, y: 300 }); K.tilt(tl, card, 0.1); K.echo(tl, card, 0.2, { n: 2 }); cam.to(tl, 0.3, { x: 960, y: 300, zoom: 1.4, dur: 0.5 });
const ar = K.arrow(s, { from: [200, 900], to: [900, 600], bend: 0.2 }); ar.draw(tl, 0.1, 0.5); ar.flow(tl, 0.6, 0.4);
const em = K.emitter(s, { x: 1500, y: 300, n: 6 }); em.burst(tl, 0.2); em.morph(tl, 0.7); em.collapse(tl, 1.1);
const pt = K.pattern(s, { cols: 5, rows: 3, gap: 60, x: 1300, y: 700, shape: 'mix' }); pt.enter(tl, 0.1); pt.wave(tl, 0.5); pt.shift(tl, 0.8); pt.dim(tl, 1.0, { keep: [[1, 2]] });
K.slabs(tl, s, ['ONE', 'TWO'], 0.3, { y: 520, h: 60, w: 800 }); K.redact(tl, t, 0.4, { mode: 'pass' }); K.highlight(tl, n.num, 0.5);
const net = K.network(s, { nodes: [{ id: 'a', x: 300, y: 600, label: 'A', icon: 'police' }, { id: 'b', x: 700, y: 600, label: 'B' }], links: [{ from: 'a', to: 'b', label: '$1', accent: true }] }); net.build(tl, 0.2); net.focus(tl, 0.9, 'a');
K.orbit([ic], { r: 100 }); K.marquee(s, 'BREAKING', { y: 1000, size: 40 }); K.spotlight(tl, 0.6, { x: 960, y: 540, r: 200, to: { x: 400, at: 1.0 }, off: 1.3 });
K.slice(tl, n.label, 0.7, { n: 4 }); K.slam(tl, n.num, 0.8); K.blackout(tl, 1.0, { hold: 0.1 }); K.strobe(tl, null, 1.2, { n: 2 }); K.shake(tl, cam.rig, 1.3, { dur: 0.2 });
const s2 = K.scene({ bg: '#111' }); K.swap(tl, s, s2, 1.35, { fx: 'cover', from: 'right' }); const s3 = K.scene(); K.swap(tl, s2, s3, 1.45, { fx: 'whip' });
ATRIL.register(tl, 1.5);`,
};

// Piezas v2.5: plano en perspectiva, capas, interfaz, cursor, foco, ruptura, pincel, ciclo, mosaico, vidrio, carrusel…
const KIT2 = (img: string): Composition => ({
  id: "k2", duration: 1.5, transparent: false, css: "", html: "", assets: { img1: img, img2: img },
  js: `const tl = gsap.timeline(); const s = K.scene(); K.show(tl, s, 0);
const pl = K.plane(s, { quad: [[0,0],[10,3],[13,-3],[3,-6]], fit: { w: 1300 } }); const ui = K.ui(pl.el, { title: 'App', heading: 'Ready', labels: ['A', 'B', 'C'] });
const cues = ui.awaken(tl, 0.05, { step: 0.1 }); pl.to(tl, 0.6, { quad: [[0,0],[0,6],[10,8],[10,2]], dur: 0.4 }); if (!cues.length) throw new Error('awaken sin pasos');
const cur = K.cursor(s, { x: 300, y: 300 }); cur.path(tl, 0.1, [[300,300],[900,500],[1400,400]], 0.8); cur.click(tl, 0.5); K.focus(ui.cards, { cursor: cur, from: 0.1, to: 1 });
const sk = K.stack(s, { n: 5 }); sk.spread(tl, 0.2, { dur: 0.4 }); sk.collapse(tl, 0.9);
const w = K.title(s, 'BREAK THE TEXT', { size: 120, y: 200 }); K.explode(tl, w, 0.6, { split: 'words', dur: 0.8 });
const c = K.title(s, 'CUT', { size: 160, y: 900 }); K.cut(tl, c, 0.3); K.echo(tl, c, 0.4, { n: 2 }); K.slice(tl, c, 0.8, { n: 3 });
const br = K.brush(s, { image: 'img1' }); br.play(tl, 0.1, 1); K.cycle(tl, s, 'SAME', 0.2, { n: 6, dur: 0.6, end: 'END' });
K.tiles(tl, 0.9, { dur: 0.3 }); K.flicker(tl, 1.2, { n: 2 }); const g = K.glass(s, { x: 100, y: 100 }); g.shine(tl, 0.3);
K.carousel(tl, s, ['img1', 'img2'], 0.1, { dur: 0.8, each: 0.2 }); const gl = K.gallery(s, ['img1'], { n: 6 }); gl.fadeIn(tl, 0.1, { amount: 0.2 }); gl.burst(tl, 0.6); gl.cover(tl, 1.1, 0, { dur: 0.2 });
const sc = K.scatter(s, { n: 30 }); sc.grow(tl, 0.1); sc.drift(tl, 0.8); const wv = K.wave(s, { y: 700 }); tl.to(wv.p, { split: 0.8, duration: 1 }, 0.2);
const r = K.roll(s, ['1', '2', '3'], { x: 960, y: 540 }); r.run(tl, 0.1, 0.3); const ty = K.typeline(s, 'typing along a long line', { size: 60 }); ty.type(tl, 0.1, 0.6); ty.fall(tl, 0.8, { dur: 0.6 });
ATRIL.register(tl, 1.5);`,
});

describe.skipIf(!CHROME || !hasFfmpeg)("motor de motion", () => {
  it("renderiza una composición opaca, una con alfa y detecta errores", async () => {
    const host = nodeHost();
    const work = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-motion-"));
    const b = await launchBrowser(host, CHROME!, work);
    try {
      const frames: number[] = [];
      const r1 = await renderComposition(b, TITLE, { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(work, "t1"), out: path.join(work, "t1.mp4"), samples: [0, 0.5, 1], onFrame: (i) => frames.push(i) });
      expect(r1.frames).toBe(60);
      expect(r1.errors).toEqual([]);
      expect(r1.samples.length).toBe(3);
      expect(nfs.statSync(r1.file).size).toBeGreaterThan(10000);
      // El primer y el último cuadro deben ser distintos (hay animación)
      const a = nfs.readFileSync(r1.samples[0]); const z = nfs.readFileSync(r1.samples[2]);
      expect(a.equals(z)).toBe(false);
      const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,nb_frames", "-of", "csv=p=0", r1.file]).toString().trim();
      expect(probe.startsWith("1920,1080")).toBe(true);

      const r2 = await renderComposition(b, OVERLAY, { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(work, "o1"), out: path.join(work, "o1.mov") });
      const pix = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", r2.file]).toString().trim();
      expect(pix).toBe("rgba");

      await expect(renderComposition(b, BROKEN, { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(work, "x"), out: path.join(work, "x.mp4") }))
        .rejects.toThrow(/undefinedFn/);

      // Kit de motion: escenas, HUD, título, contador y glitch sin errores
      const r3 = await renderComposition(b, KIT, { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(work, "k1"), out: path.join(work, "k1.mp4"), samples: [0.9] });
      expect([...r3.errors, ...r3.consoleErrors]).toEqual([]);
      expect(r3.frames).toBe(45);
      const img = path.join(work, "img.jpg");
      execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=640x400:d=1", "-frames:v", "1", img]);
      const r4 = await renderComposition(b, KIT2(img), { resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(work, "k2"), out: path.join(work, "k2.mp4"), samples: [0.5] });
      expect([...r4.errors, ...r4.consoleErrors]).toEqual([]);

      // Recursos ausentes: error del motor (no se le pide a Opus que lo "corrija")
      const b2 = await launchBrowser(host, CHROME!, path.join(work, "sin-recursos"));
      try {
        await expect(renderComposition(b2, OVERLAY, { resources: path.join(work, "no-existe"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(work, "s1"), out: path.join(work, "s1.mov") }))
          .rejects.toBeInstanceOf(EngineError);
      } finally { await closeBrowser(b2); }
    } finally {
      await closeBrowser(b);
      nfs.rmSync(work, { recursive: true, force: true });
    }
  }, 120_000);

  it("vista previa: solo los cuadros de muestra, varias a la vez en el mismo navegador y igual al render", async () => {
    const host = nodeHost();
    const work = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-preview-"));
    const b = await launchBrowser(host, CHROME!, work);
    const opts = (id: string) => ({ resources: path.join(ROOT, "motion"), fontsDir: path.join(ROOT, "fonts"), workDir: path.join(work, id), samples: [0.12, 0.5, 0.98] });
    try {
      const t0 = Date.now();
      const [p1, p2, p3] = await Promise.all([previewComposition(b, TITLE, opts("p1")), previewComposition(b, KIT, opts("p2")), previewComposition(b, OVERLAY, opts("p3"))]);
      const ms = Date.now() - t0;
      expect(p1.samples.length).toBe(3); expect(p2.samples.length).toBe(3); expect(p3.samples.length).toBe(3);
      expect([...p1.errors, ...p1.consoleErrors, ...p2.errors, ...p2.consoleErrors]).toEqual([]);
      expect(p1.duration).toBe(2);
      // Sin render completo: ningún cuadro f_*.jpg en la carpeta
      expect(nfs.readdirSync(path.join(work, "p1")).some((f) => f.startsWith("f_"))).toBe(false);
      expect(ms).toBeLessThan(30_000);
      // La muestra de la vista previa es el mismo cuadro que guarda el render completo
      const r = await renderComposition(b, TITLE, { ...opts("r1"), out: path.join(work, "r1.mp4") });
      expect(nfs.readFileSync(p1.samples[1]).equals(nfs.readFileSync(r.samples[1]))).toBe(true);
      await expect(previewComposition(b, BROKEN, opts("x"))).rejects.toThrow(/undefinedFn/);
      // Constelación del kit: aparece progresivamente y se mueve (cuadros distintos), sin errores
      const CONST: Composition = { id: "c1", duration: 2, transparent: false, css: "", html: "",
        js: `const tl = gsap.timeline(); const s = K.scene({ bg: '#0B0D12' }); K.show(tl, s, 0); const c = K.constellation(s, { n: 80, hidden: true }); c.reveal(tl, 0.1, 1.2); ATRIL.register(tl, 2);` };
      const pc = await previewComposition(b, CONST, opts("c1"));
      expect([...pc.errors, ...pc.consoleErrors]).toEqual([]);
      const [f0, f1, f2] = pc.samples.map((f) => nfs.readFileSync(f));
      expect(f0.equals(f1)).toBe(false); expect(f1.equals(f2)).toBe(false);
      expect(f2.length).toBeGreaterThan(f0.length);   // al final hay más puntos y líneas que al principio
    } finally {
      await closeBrowser(b);
      nfs.rmSync(work, { recursive: true, force: true });
    }
  }, 120_000);
});
