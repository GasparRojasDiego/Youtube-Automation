import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as nfs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { segmentV2Args, finalMixV2Args, withFilterScript, shotLengths, cameraExpr, segmentV2Duration, type LayerShot } from "./montage2";
import { concatList } from "./montage";
import { buildAss, paginate, CAPTION_DEFAULTS } from "./captions";
import { wordTimings } from "./align";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"]); return true; } catch { return false; } })();
const ff = (args: string[], cwd?: string) => execFileSync("ffmpeg", ["-loglevel", "error", ...args], { cwd, stdio: "pipe" });
const probe = (f: string, e = "format=duration") => spawnSync("ffprobe", ["-v", "error", "-show_entries", e, "-of", "csv=p=0", f]).stdout.toString().trim();

describe("montaje v2 (puro)", () => {
  it("las transiciones no rompen la sincronía", () => {
    const shots: LayerShot[] = [
      { path: "a", media: "image", dur: 2 }, { path: "b", media: "image", dur: 3, transitionIn: "smoothleft", transitionS: 0.8 }, { path: "c", media: "image", dur: 1, transitionIn: "cut" },
    ];
    const { durs, T, lens } = shotLengths(shots, 30);
    expect(durs.reduce((a, b) => a + b, 0)).toBeCloseTo(6);
    expect(T[0]).toBeCloseTo(0.8);
    expect(T[1]).toBeCloseTo(1 / 30, 3);
    expect(lens[0]).toBeCloseTo(2.8);
  });
  it("el golpe de zoom se suma al movimiento base", () => {
    const e = cameraExpr("zoom_in", 0.08, 90, { x: 0.3, y: 0.4 }, 30);
    expect(e.z).toContain("on-30");
    expect(e.x).toContain("0.3*iw");
  });
});

describe.skipIf(!hasFfmpeg)("montaje v2 con ffmpeg real", () => {
  it("segmento con imagen, clip, capa con alfa y subtítulos; y mezcla final", () => {
    const d = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-m2-"));
    ff(["-y", "-f", "lavfi", "-i", "testsrc2=s=1280x720", "-frames:v", "1", path.join(d, "img.jpg")]);
    ff(["-y", "-f", "lavfi", "-i", "testsrc=s=640x360:r=25:d=3", "-f", "lavfi", "-i", "sine=f=330:d=3", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(d, "clip.mp4")]);
    ff(["-y", "-f", "lavfi", "-i", "color=c=red@0.6:s=640x360:d=1.5:r=30,format=rgba", "-c:v", "png", "-f", "mov", path.join(d, "ov.mov")]);
    nfs.mkdirSync(path.join(d, "fonts"));
    nfs.copyFileSync(path.resolve(__dirname, "../../src-tauri/resources/fonts/Poppins-ExtraBold.ttf"), path.join(d, "fonts", "Poppins-ExtraBold.ttf"));
    nfs.writeFileSync(path.join(d, "s1.ass"), buildAss(paginate(wordTimings("A quick caption over the montage test.", { start: 0.2, end: 3.5 }), CAPTION_DEFAULTS), CAPTION_DEFAULTS, { width: 640, height: 360 }));
    const shots: LayerShot[] = [
      { path: path.join(d, "img.jpg"), media: "image", dur: 2, motion: "zoom_in", focus: { x: 0.3, y: 0.5 }, grade: "cold", punchAt: 0.8 },
      { path: path.join(d, "clip.mp4"), media: "video", dur: 2.5, clipIn: 0.5, clipLen: 3, transitionIn: "smoothleft", transitionS: 0.4, grade: "sepia" },
      { path: path.join(d, "img.jpg"), media: "image", dur: 1.2, motion: "drift", transitionIn: "cut", grade: "noir" },
    ];
    const seg = segmentV2Args({ shots, overlays: [{ path: path.join(d, "ov.mov"), start: 1, duration: 1.5 }], out: path.join(d, "s1.mp4"), fadeIn: true, fadeOut: true, kenBurns: 0.08,
      captionsAss: "s1.ass", fontsDir: "fonts", grain: 4, vignette: true, frame: { width: 640, height: 360, fps: 30 }, encoder: { name: "libx264", quality: 28 } });
    nfs.writeFileSync(path.join(d, "s1.filter"), seg.filter);
    ff(withFilterScript(seg.args, "s1.filter", false), d);
    expect(Number(probe(path.join(d, "s1.mp4")))).toBeCloseTo(segmentV2Duration(shots), 1);

    // mezcla final
    ff(["-y", "-f", "lavfi", "-i", "sine=f=220:d=5", "-ac", "1", path.join(d, "n1.wav")]);
    ff(["-y", "-f", "lavfi", "-i", "sine=f=110:d=2", path.join(d, "bed.mp3")]);
    ff(["-y", "-f", "lavfi", "-i", "anoisesrc=d=0.4", path.join(d, "fx.wav")]);
    nfs.writeFileSync(path.join(d, "list.txt"), concatList([path.join(d, "s1.mp4")]));
    const total = segmentV2Duration(shots);
    const mix = finalMixV2Args({ concatListPath: path.join(d, "list.txt"), narration: [{ path: path.join(d, "n1.wav"), duration: total }],
      beds: [{ path: path.join(d, "bed.mp3"), start: 0, end: total, gainDb: -20, fadeIn: 1, fadeOut: 1 }],
      sfx: [{ path: path.join(d, "fx.wav"), at: 1, gainDb: -12 }, { path: path.join(d, "fx.wav"), at: 3, gainDb: -12 }],
      clipAudio: [{ path: path.join(d, "clip.mp4"), clipIn: 0.5, at: 2, dur: 2, gainDb: -10 }], duck: true, out: path.join(d, "final.mp4") });
    nfs.writeFileSync(path.join(d, "mix.filter"), mix.filter);
    ff(withFilterScript(mix.args, "mix.filter", false), d);
    expect(Number(probe(path.join(d, "final.mp4")))).toBeCloseTo(total, 1);
    expect(probe(path.join(d, "final.mp4"), "stream=codec_type")).toContain("audio");
    if (!process.env.ATRIL_KEEP) nfs.rmSync(d, { recursive: true, force: true });
  }, 120_000);
});
