import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quantize, joinAudioArgs, parseProgressSeconds } from "./montage";

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

describe.skipIf(!hasFfmpeg)("audio con ffmpeg real", () => {
  const dir = mkdtempSync(join(tmpdir(), "atril-"));
  beforeAll(() => {
    ff(["-y", "-f", "lavfi", "-i", "sine=f=220:d=4.2", "-ar", "24000", join(dir, "n1.wav")]);
    ff(["-y", "-f", "lavfi", "-i", "sine=f=330:d=3.1", "-ar", "24000", join(dir, "n2.wav")]);
  }, 60_000);

  it("une fragmentos de audio", () => {
    const out = join(dir, "joined.wav");
    ff(joinAudioArgs([join(dir, "n1.wav"), join(dir, "n2.wav")], out, 0.2));
    expect(dur(out)).toBeCloseTo(4.2 + 0.2 + 3.1, 1);
  }, 60_000);
});
