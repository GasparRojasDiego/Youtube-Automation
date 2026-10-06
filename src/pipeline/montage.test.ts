import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { segmentClipArgs, finalMixArgs, concatList, quantize, joinAudioArgs, segmentDuration, parseProgressSeconds, type ShotSpec } from "./montage";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
const ff = (args: string[]) => execFileSync("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const dur = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

describe("quantize", () => {
  it("conserva el total en fotogramas", () => {
    const q = quantize([1.01, 2.02, 3.03], 30);
    expect(Math.round(q.reduce((a, b) => a + b, 0) * 30)).toBe(Math.round(6.06 * 30));
    q.forEach((d) => expect(Math.abs(d * 30 - Math.round(d * 30))).toBeLessThan(1e-9));
  });
});

describe("parseProgressSeconds", () => {
  it("lee out_time_ms y out_time", () => {
    expect(parseProgressSeconds("out_time_ms=2500000")).toBe(2.5);
    expect(parseProgressSeconds("out_time=00:01:02.500000")).toBeCloseTo(62.5);
    expect(parseProgressSeconds("frame=10")).toBeNull();
  });
});

describe.skipIf(!hasFfmpeg)("render real con ffmpeg", () => {
  const dir = mkdtempSync(join(tmpdir(), "atril-"));
  const img = (n: number) => join(dir, `img${n}.png`);
  beforeAll(() => {
    ["red", "green", "blue", "orange"].forEach((c, i) =>
      ff(["-y", "-f", "lavfi", "-i", `testsrc2=s=1344x768:d=1,drawbox=c=${c}@0.5:t=fill`, "-frames:v", "1", img(i)]));
    ff(["-y", "-f", "lavfi", "-i", "color=c=black@0.0:s=1920x1080,format=rgba,drawbox=x=80:y=880:w=900:h=120:c=white@0.85:t=fill", "-frames:v", "1", join(dir, "ov.png")]);
    ff(["-y", "-f", "lavfi", "-i", "sine=f=220:d=4.2", "-ar", "24000", join(dir, "n1.wav")]);
    ff(["-y", "-f", "lavfi", "-i", "sine=f=330:d=3.1", "-ar", "24000", join(dir, "n2.wav")]);
    ff(["-y", "-f", "lavfi", "-i", "sine=f=110:d=2", "-ar", "44100", join(dir, "music.mp3")]);
  }, 60_000);

  it("renderiza segmentos, los une y mezcla audio con duración exacta", () => {
    const params = { transition: "fade" as const, transitionSeconds: 0.5, kenBurns: 0.08 };
    const seg1: ShotSpec[] = [
      { image: img(0), dur: 2.1, motion: "zoom_in", overlay: join(dir, "ov.png") },
      { image: img(1), dur: 2.7, motion: "pan_left" },
    ];
    const seg2: ShotSpec[] = [
      { image: img(2), dur: 1.9, motion: "zoom_out" },
      { image: img(3), dur: 1.8, motion: "static" },
    ];
    const enc = { name: "libx264" as const, quality: 28 };
    const c1 = join(dir, "c1.mp4"), c2 = join(dir, "c2.mp4");
    ff(segmentClipArgs({ shots: seg1, out: c1, fadeIn: true, fadeOut: true, params, encoder: enc, frame: { width: 640, height: 360, fps: 30 } }));
    ff(segmentClipArgs({ shots: seg2, out: c2, fadeIn: true, fadeOut: false, params: { ...params, transition: "cut" as any }, encoder: enc, frame: { width: 640, height: 360, fps: 30 } }));
    const d1 = segmentDuration(seg1), d2 = segmentDuration(seg2);
    expect(dur(c1)).toBeCloseTo(d1, 1);
    expect(dur(c2)).toBeCloseTo(d2, 1);
    const list = join(dir, "list.txt");
    writeFileSync(list, concatList([c1, c2]));
    const out = join(dir, "final.mp4");
    ff(finalMixArgs({
      concatListPath: list, out,
      narration: [{ path: join(dir, "n1.wav"), duration: d1 }, { path: join(dir, "n2.wav"), duration: d2 }],
      music: { path: join(dir, "music.mp3"), volumeDb: -20, duck: true },
    }));
    expect(existsSync(out)).toBe(true);
    expect(dur(out)).toBeCloseTo(d1 + d2, 1);
  }, 180_000);

  it("une fragmentos de audio", () => {
    const out = join(dir, "joined.wav");
    ff(joinAudioArgs([join(dir, "n1.wav"), join(dir, "n2.wav")], out, 0.2));
    expect(dur(out)).toBeCloseTo(4.2 + 0.2 + 3.1, 1);
  }, 60_000);
});
