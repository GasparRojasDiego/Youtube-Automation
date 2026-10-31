// Duración exacta de extremo a extremo (Claude real): una tarjeta de campaña vertical con un guion
// propio de 5 palabras y un mínimo de 30 s. El video final debe durar ~30 s (no ~3 s): la voz se
// complementa con aire entre frases y un tramo instrumental cubierto con tomas propias.
// La voz se simula (sin red en la prueba).
// Ejecutar: npx vitest run -c vitest.e2e.config.ts e2e/duration.e2e.ts
import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

vi.mock("../src/lib/ipc", () => import("./node-ipc"));
vi.mock("../src/pipeline/cards", () => import("./node-cards"));
vi.mock("../src/providers/tts", async (orig) => ({
  ...(await orig<typeof import("../src/providers/tts")>()),
  synthesize: async (job: { text: string; outPath: string }) => {
    const sentences = job.text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const out = `${job.outPath}.wav`;
    nfs.mkdirSync(path.dirname(out), { recursive: true });
    const parts = sentences.flatMap((s, i) => [`sine=f=${180 + i * 20}:d=${(s.split(/\s+/).length / 2.6).toFixed(2)}:sample_rate=24000`, "anullsrc=r=24000:cl=mono:d=0.4"]);
    const inputs = parts.flatMap((p) => ["-f", "lavfi", "-i", p]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${parts.map((_, i) => `[${i}:a]`).join("")}concat=n=${parts.length}:v=0:a=1,aformat=channel_layouts=mono[a]`, "-map", "[a]", out]);
    return { path: out, ext: "wav" };
  },
}));

const SRC = "/tmp/claude-0/e2e/run/atril.db";
const WORK = "/tmp/claude-0/e2e/duracion";
const IMG = "/tmp/claude-0/e2e/img";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SHEETS = process.env.SHEETS_DIR ?? WORK;
const SCRIPT = "Nueve megas. Eso pesa Frame.";   // 5 palabras: ~3 s de voz

const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
const probe = (f: string, what: string) => Number(execFileSync("ffprobe", ["-v", "error", ...what.split(" "), "-of", "csv=p=0", f]).toString().trim().split("\n")[0]);
function sheet(file: string, out: string, dur: number, w: number, h: number) {
  const frames = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.97].map((f, i) => { const p = `${out}.${i}.jpg`; ff("-ss", (dur * f).toFixed(2), "-i", file, "-map", "0:v:0", "-frames:v", "1", "-vf", `scale=${w}:${h}`, p); return p; });
  ff(...frames.flatMap((p) => ["-i", p]), "-filter_complex", `${frames.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=8:layout=${frames.map((_, i) => `${(i % 4) * w}_${Math.floor(i / 4) * h}`).join("|")}[v]`, "-map", "[v]", out);
  frames.forEach((p) => nfs.rmSync(p));
}

describe.skipIf(!nfs.existsSync(SRC))("duración exacta", () => {
  it("5 palabras con mínimo de 30 s: el video dura 30 s, con tramo instrumental cubierto", async () => {
    nfs.rmSync(WORK, { recursive: true, force: true });
    nfs.mkdirSync(path.join(WORK, "entrada"), { recursive: true });
    nfs.copyFileSync(SRC, path.join(WORK, "atril.db"));
    const ipc = await import("./node-ipc");
    ipc.openDb(path.join(WORK, "atril.db"));
    ipc.setPaths({ data: path.join(WORK, "data"), exe_dir: WORK, resources: path.resolve(__dirname, "../src-tauri"), home: WORK, documents: path.join(WORK, "docs"), downloads: path.join(WORK, "descargas") });
    await (await import("../src/lib/schema")).migrate();
    const { loadSettings, saveSettings } = await import("../src/lib/settings");
    await loadSettings();
    await saveSettings((s) => ({ ...s, motion: { ...s.motion, enabled: true, browserPath: CHROME, perVideo: 1, parallel: 3 }, ffmpeg: { ...s.ffmpeg, encoder: "libx264" },
      media: { ...s.media, libraryDir: path.join(WORK, "Biblioteca") } }));
    const E = (f: string) => path.join(WORK, "entrada", f);
    for (const f of ["fruits.jpg", "home.jpg", "building.jpg"]) nfs.copyFileSync(path.join(IMG, f), E(f));

    const repo = await import("../src/lib/repo");
    const Q = await import("../src/pipeline/queue");
    const ch = (await repo.activeChannel())!;
    // Campaña con la plantilla (duración, estética, voz) y una tarjeta que solo pone título y guion
    const camp = await Q.createCampaign(ch.id, "Frame · prueba", "personal", "9:16", { minutes: [0.5, 0.6], tone: "llamativo", web: false, language: "es",
      aesthetic: "Fondo casi negro con grano fino, un solo acento azul (#4C7DFF) para cifras, títulos de 2 a 4 palabras, cortes rápidos.", palette: { background: "#0B0D12", accent: "#4C7DFF" },
      cta: "Descarga Frame gratis en Microsoft Store", voice: "es-US-Chirp3-HD-Kore" } as any);
    const it = await Q.addItem(ch.id, "personal", { title: "Nueve megas", about: "Frame, la app de estudio, pesa solo 9 MB.", script: SCRIPT } as any, camp.id);
    const files = [await Q.storeFile(it.id, E("fruits.jpg")), await Q.storeFile(it.id, E("home.jpg")), await Q.storeFile(it.id, E("building.jpg"))];
    await Q.saveCfg(it.id, { ...(await Q.getItem(it.id))!.cfg, files } as any);
    expect((await Q.getItem(it.id))!.overrides.sort()).toEqual(["about", "files", "script", "title"]);

    const t0 = Date.now();
    await Q.startQueue(ch.id, "9:16");
    while ((await Q.getQueueState()).running) await new Promise((r) => setTimeout(r, 3000));
    const item = (await Q.getItem(it.id))!;
    console.log(`Cola terminada en ${((Date.now() - t0) / 60000).toFixed(1)} min · ${item.status} · ${item.error ?? ""}`);
    const v = (await repo.getVideo(item.video_id!))!;
    const st = await repo.getStages(v.id);
    for (const s of st) console.log(s.stage, s.status, s.error ? s.error.slice(0, 300) : "");
    expect(item.status).toBe("done");
    expect(v.data.voice).toBe("es-US-Chirp3-HD-Kore");
    const out = (s: string) => st.find((x) => x.stage === s)!.output;

    // Voz: ~3 s de narración, plan de 30 s
    const voice = out("voice");
    console.log("Plan de duración:", JSON.stringify(voice.plan));
    expect(voice.plan.natural).toBeLessThan(8);
    expect(voice.plan.total).toBeCloseTo(30, 0);
    const tails = Object.values(voice.plan.tail as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(tails).toBeGreaterThan(18);

    // El guion propio se respetó palabra por palabra
    const words = out("script").segments.map((s: any) => s.text_en).join(" ");
    expect(words.replace(/\s+/g, " ")).toContain("Nueve megas.");
    expect(words).toContain("Eso pesa Frame.");

    // Tomas del tramo instrumental (sin narración) que cubren el final. «start» es relativo a su segmento
    const shots = out("polish").shots as any[];
    const { segInfos, segmentOffsets } = await import("../src/pipeline/timeline");
    const { skillParams, MONTAGE_DEFAULTS } = await import("../src/lib/skills");
    const montage = await skillParams(v.channel_id, "montaje", MONTAGE_DEFAULTS);
    const segs = segInfos(out("script"), voice);
    const offs = segmentOffsets(segs, montage.pauseBetweenSegments);
    const abs = (s: any) => (offs[s.segment_id] ?? 0) + (s.start ?? 0);
    console.log("Tomas:", JSON.stringify(shots.map((s) => ({ id: s.id, seg: s.segment_id, visual: s.visual, from: s.from, at: Math.round(abs(s) * 100) / 100, dur: Math.round((s.dur ?? 0) * 100) / 100 }))));
    expect(Math.max(...shots.map((s) => abs(s) + (s.dur ?? 0)))).toBeGreaterThan(29);
    const tailShots = shots.filter((s) => s.from >= (segs.find((x) => x.id === s.segment_id)?.sentences.length ?? 99));
    expect(tailShots.length).toBeGreaterThanOrEqual(Math.ceil(tails / 3.5));
    expect(Math.max(...tailShots.map((s) => s.dur ?? 0))).toBeLessThanOrEqual(3.6);   // ninguna imagen quieta demasiado (vertical: ≤ 3,5 s)

    // Video final: 1080×1920 y ~30 s, con audio (música) hasta el final
    const r = out("render");
    const dur = probe(r.file, "-show_entries format=duration");
    const aDur = probe(r.file, "-select_streams a:0 -show_entries stream=duration");
    console.log(`Render: ${dur.toFixed(2)} s (audio ${aDur.toFixed(2)} s) · ${r.file}`);
    expect(dur).toBeGreaterThan(29);
    expect(dur).toBeLessThan(37);
    expect(aDur).toBeGreaterThan(28);
    // La música suena en el tramo instrumental (no hay silencio absoluto al final)
    const vd = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(Math.max(0, dur - 12)), "-t", "8", "-i", r.file, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"]).stderr.toString();
    const mean = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(vd)?.[1] ?? -91);
    console.log(`Volumen medio del tramo final: ${mean} dB`);
    expect(mean).toBeGreaterThan(-60);
    sheet(r.file, path.join(SHEETS, "duracion-30s.jpg"), dur, 180, 320);
    console.log("Hoja:", path.join(SHEETS, "duracion-30s.jpg"));
    // Nada se publicó
    expect(st.find((x) => x.stage === "publish")?.status).toBe("skipped");
    expect(st.find((x) => x.stage === "final")?.status).toBe("review");
  });
});
