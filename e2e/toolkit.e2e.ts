// Herramientas del toolkit del usuario, de extremo a extremo (Claude real): un video personal de 30 s
// con rembg instalado (recortes reales para las animaciones) y whisper-cli con el modelo de pruebas
// del repositorio (pesos aleatorios: comprueba la conexión y el respaldo, no la precisión). Después,
// un reintento del montaje sin un segmento: solo se rehace ese.
// Requiere: venv con rembg y whisper.cpp compilado (rutas en REMBG_BIN / WHISPER_BIN).
// Ejecutar: npx vitest run -c vitest.e2e.config.ts e2e/toolkit.e2e.ts
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
const WORK = "/tmp/claude-0/e2e/toolkit";
const IMG = "/tmp/claude-0/e2e/img";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const REMBG_BIN = process.env.REMBG_BIN ?? "";
const WHISPER_BIN = process.env.WHISPER_BIN ?? "";
const TEST_MODEL = process.env.WHISPER_TEST_MODEL ?? "";
const SCRIPT = `Un volcán es una abertura en la corteza de la Tierra. Por ella sale magma, ceniza y gases. Cuando el magma llega a la superficie se llama lava. Algunos volcanes duermen durante siglos y luego despiertan.`;

const waitIdle = async (runningVideoId: () => string | null) => { do { await new Promise((r) => setTimeout(r, 3000)); } while (runningVideoId()); };
const ready = nfs.existsSync(SRC) && !!REMBG_BIN && nfs.existsSync(path.join(REMBG_BIN, "rembg")) && !!WHISPER_BIN && nfs.existsSync(path.join(WHISPER_BIN, "whisper-cli")) && nfs.existsSync(TEST_MODEL);

describe.skipIf(!ready)("toolkit del usuario (rembg, whisper.cpp) y reintento parcial", () => {
  it("usa las herramientas instaladas sin activarlas a mano y un reintento solo rehace lo que falta", async () => {
    process.env.PATH = `${REMBG_BIN}:${WHISPER_BIN}:${process.env.PATH}`;
    nfs.rmSync(WORK, { recursive: true, force: true });
    nfs.mkdirSync(path.join(WORK, "entrada"), { recursive: true });
    nfs.mkdirSync(path.join(WORK, ".cache", "whisper.cpp"), { recursive: true });
    nfs.copyFileSync(TEST_MODEL, path.join(WORK, ".cache", "whisper.cpp", "ggml-base.bin"));
    // rembg guarda sus modelos en ~/.rembg: se reutiliza el ya descargado
    if (nfs.existsSync("/root/.rembg")) nfs.symlinkSync("/root/.rembg", path.join(WORK, ".rembg"));
    nfs.copyFileSync(SRC, path.join(WORK, "atril.db"));
    const ipc = await import("./node-ipc");
    ipc.openDb(path.join(WORK, "atril.db"));
    ipc.setPaths({ data: path.join(WORK, "data"), exe_dir: WORK, resources: path.resolve(__dirname, "../src-tauri"), home: WORK, documents: path.join(WORK, "docs"), downloads: path.join(WORK, "descargas") });
    const { loadSettings, saveSettings } = await import("../src/lib/settings");
    await loadSettings();
    await saveSettings((s) => ({ ...s, motion: { ...s.motion, enabled: true, browserPath: CHROME, perVideo: 2, parallel: 3 }, ffmpeg: { ...s.ffmpeg, encoder: "libx264" },
      media: { ...s.media, libraryDir: path.join(WORK, "Biblioteca") } }));
    for (const f of ["messi5.jpg", "fruits.jpg"]) nfs.copyFileSync(path.join(IMG, f), path.join(WORK, "entrada", f));
    nfs.writeFileSync(path.join(WORK, "entrada", "guion.txt"), SCRIPT);

    const { toolkitStatus } = await import("../src/media/toolkit");
    const st0 = await toolkitStatus();
    console.log("Toolkit:", JSON.stringify(st0));
    expect(st0.every((t) => !!t.found)).toBe(true);

    const { startPersonal, runningVideoId, rerenderFrom } = await import("../src/pipeline/runner");
    const repo = await import("../src/lib/repo");
    const { db } = ipc;
    const t0 = Date.now();
    const id = await startPersonal({
      prompt: "Video corto sobre volcanes", description: "Para niños de 10 años. Usa la foto del jugador en una animación con el texto DETRÁS de él (profundidad).",
      minutes: 0.5, language: "es", useLibrary: false, iterate: false,
      files: ["messi5.jpg", "fruits.jpg"].map((f) => path.join(WORK, "entrada", f)), script: path.join(WORK, "entrada", "guion.txt"),
    });
    expect(id).toBeTruthy();
    await waitIdle(runningVideoId);
    let st = await repo.getStages(id!);
    for (const s of st) console.log(s.stage, s.status, s.error ? s.error.slice(0, 300) : "", s.started_at && s.finished_at ? `${Math.round((s.finished_at - s.started_at) / 1000)} s` : "");
    console.log(`Video en ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    const get = (stage: string) => st.find((s) => s.stage === stage)!;
    expect(get("final").status).toBe("review");
    const acts = async (stage: string, since = 0) => (await db.query<{ title: string; detail: string; ts: number }>("SELECT title, detail, ts FROM activity WHERE video_id=? AND stage=? AND ts>=? ORDER BY id", [id, stage, since]));
    // whisper.cpp corrió (sin error) y, al no reconocer nada con el modelo de pruebas, quedó la alineación por silencios
    const voiceActs = (await acts("voice")).map((a) => a.title);
    console.log("Voz:", voiceActs.join(" | "));
    expect(voiceActs.some((t) => /no funcionó/.test(t))).toBe(false);
    expect((get("voice").output.segments as any[]).every((s) => s.aligner === "silences" && s.sentences?.length)).toBe(true);
    // Recortes de rembg para las imágenes de las animaciones (si Claude les dio imágenes)
    const motion = get("motion").output;
    const withImages = (motion.items as any[]).filter((m) => (m.asset_ids ?? []).length);
    const cuts = nfs.existsSync(path.join(WORK, "data", "recortes")) ? nfs.readdirSync(path.join(WORK, "data", "recortes")).filter((f) => f.endsWith(".png")) : [];
    console.log("Animaciones:", (motion.items as any[]).map((m) => `${m.id}:${m.file ? "ok" : m.error}:${(m.asset_ids ?? []).length} img`).join(" "), "| recortes:", cuts.length);
    if (withImages.length) expect(cuts.length).toBeGreaterThan(0);
    const usesDepth = (motion.items as any[]).some((m) => /K\.depth|_cut/.test(m.code?.js ?? ""));
    console.log("Alguna animación usa el recorte:", usesDepth);
    // Sonoridad final −14 LUFS (dos pasadas)
    const render = get("render").output;
    const ebu = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", render.file, "-af", "ebur128", "-f", "null", "-"]).stderr.toString();
    const I = Number(ebu.match(/Integrated loudness:\s*\n\s*I:\s+(-?[\d.]+) LUFS/)?.[1]);
    console.log("Sonoridad:", I, "LUFS ·", (await acts("render")).filter((a) => /Sonoridad/.test(a.title)).map((a) => a.title).join(""));
    expect(Math.abs(I + 14)).toBeLessThan(1.5);

    // Reintento parcial: falta el clip de un segmento → solo se monta ese
    const segs = Object.keys(render.segmentHashes);
    const doneFile = path.join(path.dirname(render.file), "render", "segmentos.json");
    expect(Object.keys(JSON.parse(nfs.readFileSync(doneFile, "utf8"))).sort()).toEqual(segs.slice().sort());
    nfs.rmSync(path.join(path.dirname(render.file), "render", `${segs[0]}.mp4`));
    const t1 = Date.now();
    await rerenderFrom(id!, "render");
    await waitIdle(runningVideoId);
    st = await repo.getStages(id!);
    expect(st.find((s) => s.stage === "render")!.status).toBe("done");
    expect(st.find((s) => s.stage === "publish")!.status).toBe("skipped");
    const remounted = (await acts("render", t1)).filter((a) => /^Montando «/.test(a.title));
    console.log(`Reintento: ${remounted.length} de ${segs.length} segmento(s) montado(s) en ${((Date.now() - t1) / 1000).toFixed(0)} s`);
    expect(remounted.length).toBe(1);
  }, 90 * 60_000);
});
