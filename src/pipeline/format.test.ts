import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { verticalCaptions, frameOf, minutesRangeOf, VERTICAL_STORY_EN, FRAME_V } from "./format";
import { CAPTION_DEFAULTS, buildAss } from "./captions";
import { motionSystem, polishPrompt, storyboardPrompt, critiquePrompt } from "./prompts2";
import { PIECES } from "../motion/pieces";
import { buildPage } from "../motion/page";
import { segmentV2Args } from "./montage2";
import { withFilterScript } from "./montage2";

// ffmpeg real: con la máquina cargada (CI, otra prueba renderizando) puede pasar de los 5 s por defecto
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe("formato vertical 9:16", () => {
  it("cuadro, duración y subtítulos", () => {
    expect(frameOf({ data: { format: "9:16" } })).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(frameOf({ data: {} })).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(minutesRangeOf({ data: { minutesRange: [1, 2] } }, [10, 13])).toEqual([1, 2]);
    expect(minutesRangeOf({ data: { minutesRange: [3, 1] } }, [10, 13])).toEqual([10, 13]);
    expect(minutesRangeOf({ data: { personal: { minutes: 2 } } }, [10, 13])).toEqual([1.76, 2.16]);
    const c = verticalCaptions(CAPTION_DEFAULTS);
    expect(c.size).toBeGreaterThanOrEqual(84);
    expect([c.lines, c.maxWords, c.marginV]).toEqual([2, 4, 480]);
    const ass = buildAss([{ words: [{ w: "Hola", s: 0, e: 0.5 }], start: 0, end: 0.5 }] as any, c, FRAME_V);
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
  });

  it("instrucciones a Claude: alto 1920, zonas seguras y sin las piezas de 16:9", () => {
    const v = motionSystem({ skills: "", palette: {}, vertical: true });
    const h = motionSystem({ skills: "", palette: {} });
    expect(v).toContain("1080×1920");
    expect(v).not.toContain("1920×1080, 30 fps");
    expect(v).not.toContain("READY-MADE PIECES — global P");
    expect(v).toContain("Safe zones");
    expect(h).toContain("READY-MADE PIECES — global P");
    const pv = polishPrompt({ skills: "", motionBudget: 3, edl: "x", captions: true, palette: {}, vertical: true });
    expect(pv).toContain("not available in this vertical video");
    expect(pv).not.toContain(`- ${PIECES[0].id} [`);
    expect(polishPrompt({ skills: "", motionBudget: 3, edl: "x", captions: true, palette: {} })).toContain(`- ${PIECES[0].id} [`);
    const sb = storyboardPrompt({ skills: "", visual: {}, shotSeconds: [2, 4], motionBudget: 2, minutes: 1, aiImages: false, maxClip: 6, humor: false, segments: [], sources: [], vertical: true,
      libraryFiles: [{ id: "a1", kind: "image", description: "logo" }] });
    expect(sb).toContain(VERTICAL_STORY_EN);
    expect(sb).toContain("OPERATOR LIBRARY");
    expect(sb).toContain("- a1 (image): logo");
    expect(critiquePrompt({ kind: "fullscreen", brief: "b", text: "", vertical: true })).toContain("x 72–1008");
  });

  it("el motor de animaciones recibe el cuadro vertical", () => {
    const html = buildPage({ id: "m1", duration: 2, transparent: false, css: "", html: "", js: "" }, { width: 1080, height: 1920, code: new Proxy({}, { get: () => "" }) as Record<string, string>, fontBase: "./" });
    expect(html).toContain("window.ATRIL={width:1080,height:1920,");
    expect(html).toContain("#stage{position:relative;width:1080px;height:1920px;");
    const kit = nfs.readFileSync(path.resolve(__dirname, "../../src-tauri/resources/motion/kit.js"), "utf8");
    expect(kit).toContain("var W = K.W = (A && A.width) || 1920, H = K.H = (A && A.height) || 1080;");
  });

  it("montaje vertical: foto horizontal recortada alrededor del sujeto (ffmpeg real)", () => {
    const d = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-vertical-"));
    const img = path.join(d, "wide.png");
    // Foto horizontal: mitad izquierda negra, mitad derecha blanca; el sujeto (foco) está a la derecha
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=1600x900", "-vf", "drawbox=x=800:y=0:w=800:h=900:color=white:t=fill", "-frames:v", "1", img]);
    const frame = { width: 216, height: 384, fps: 30 };
    const seg = segmentV2Args({ shots: [{ path: img, media: "image", dur: 1, motion: "static", focus: { x: 0.95, y: 0.5 } }], overlays: [], out: path.join(d, "s.mp4"), fadeIn: false, fadeOut: false, kenBurns: 0, frame, encoder: { name: "libx264", quality: 30 } });
    expect(seg.filter).toContain(`s=${frame.width}x${frame.height}`);
    nfs.writeFileSync(path.join(d, "f.txt"), seg.filter);
    execFileSync("ffmpeg", withFilterScript(seg.args, "f.txt", false), { cwd: d });
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", path.join(d, "s.mp4")]).toString()).streams[0];
    expect([info.width, info.height]).toEqual([216, 384]);
    // Con el foco a la derecha, el cuadro vertical muestra la parte blanca (no el centro, mitad y mitad)
    const px = execFileSync("ffmpeg", ["-loglevel", "error", "-i", path.join(d, "s.mp4"), "-vf", "scale=8:8,format=gray", "-frames:v", "1", "-f", "rawvideo", "-"]);
    expect(px.reduce((a, b) => a + b, 0) / px.length).toBeGreaterThan(200);
  });
});
