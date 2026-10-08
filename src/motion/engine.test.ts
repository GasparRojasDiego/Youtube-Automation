// Prueba real del motor de motion con Chromium sin ventana + ffmpeg.
import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import * as nfs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { launchBrowser, closeBrowser, renderComposition, EngineError, type MotionHost } from "./engine";
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
  js: `const tl = gsap.timeline(); const s = K.scene(); K.paper(s); K.hud({ tl: 'ATRIL', tr: 'TC' }, s);
const t = K.title(s, 'Deadline', { font: 'DM Serif Display', italic: true, size: 200 }); const n = K.bigNumber(s, { text: '0', label: 'TEST', y: 800, size: 120 });
K.show(tl, s, 0); K.reveal(tl, t, 0.1, { fx: 'blur' }); K.counter(tl, n.num, 0.2, { to: 353, suffix: '+', dur: 0.8 }); K.glitch(tl, s, 1.1, { dur: 0.3 });
ATRIL.register(tl, 1.5);`,
};

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
});
