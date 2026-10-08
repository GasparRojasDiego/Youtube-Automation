// Cada receta de efecto se sintetiza con ffmpeg real: duración, nivel y sin saturación.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import * as nfs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SFX_KINDS, synthArgs, sfxRecipe, sfxKind } from "./sfx";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"]); return true; } catch { return false; } })();

describe("efectos de sonido", () => {
  it("clasifica descripciones libres", () => {
    expect(sfxKind("cinematic whoosh short")).toBe("whoosh");
    expect(sfxKind("impact", "deep cinematic hit")).toBe("impact");
    expect(sfxKind("bass drop")).toBe("sub drop");
    expect(sfxKind("camera shutter")).toBe("camera shutter");
    expect(sfxKind("something odd")).toBe("whoosh");
  });
  it.skipIf(!hasFfmpeg)("sintetiza todos los tipos", () => {
    const dir = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-sfx-"));
    for (const k of SFX_KINDS) {
      const out = path.join(dir, `${k.replace(/ /g, "_")}.wav`);
      execFileSync("ffmpeg", synthArgs(k, out, 3), { stdio: "pipe" });
      const log = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${out}" -af astats -f null - 2>&1`]).toString();
      const peak = Number(/Overall[\s\S]*?Peak level dB:\s*(-?[\d.]+|-inf)/.exec(log)?.[1] ?? "-inf");
      const rms = Number(/Overall[\s\S]*?RMS level dB:\s*(-?[\d.]+|-inf)/.exec(log)?.[1] ?? "-inf");
      const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
      expect(Math.abs(dur - sfxRecipe(k).d), k).toBeLessThan(0.05);
      expect(peak, `${k} peak`).toBeLessThanOrEqual(-0.5);
      expect(rms, `${k} rms`).toBeGreaterThan(-45);
      console.log(`${k.padEnd(15)} ${dur.toFixed(2)} s  peak ${peak} dB  rms ${rms} dB`);
    }
  }, 120_000);
});
