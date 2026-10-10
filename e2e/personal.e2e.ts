// Modo Personal de extremo a extremo (Claude real): video de 30 s en español con
// guion propio y SOLO archivos del usuario, y luego un pedido de mejora continua.
// La voz se simula (sin red en la prueba): tonos por frase con pausas reales.
// Ejecutar: npx vitest run -c vitest.e2e.config.ts e2e/personal.e2e.ts
import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

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
const WORK = "/tmp/claude-0/e2e/personal";
const IMG = "/tmp/claude-0/e2e/img";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SCRIPT = `La fotosíntesis es la forma en que las plantas fabrican su propio alimento. Con la luz del sol, el agua y el dióxido de carbono, producen glucosa. Como resultado, liberan oxígeno al aire que respiramos. Sin este proceso, casi no habría vida en la Tierra.`;

const waitIdle = async (runningVideoId: () => string | null) => { do { await new Promise((r) => setTimeout(r, 3000)); } while (runningVideoId()); };

describe.skipIf(!nfs.existsSync(SRC))("modo Personal y mejora continua", () => {
  it("produce un video con guion propio y solo archivos del usuario, y aplica un pedido de mejora", async () => {
    nfs.rmSync(WORK, { recursive: true, force: true });
    nfs.mkdirSync(path.join(WORK, "entrada"), { recursive: true });
    nfs.copyFileSync(SRC, path.join(WORK, "atril.db"));
    const ipc = await import("./node-ipc");
    ipc.openDb(path.join(WORK, "atril.db"));
    ipc.setPaths({ data: path.join(WORK, "data"), exe_dir: WORK, resources: path.resolve(__dirname, "../src-tauri"), home: WORK, documents: path.join(WORK, "docs"), downloads: path.join(WORK, "descargas") });
    const { loadSettings, saveSettings } = await import("../src/lib/settings");
    await loadSettings();
    await saveSettings((s) => ({ ...s, motion: { ...s.motion, enabled: true, browserPath: CHROME, perVideo: 1, parallel: 3 }, ffmpeg: { ...s.ffmpeg, encoder: "libx264" },
      media: { ...s.media, libraryDir: path.join(WORK, "Biblioteca") } }));
    // Archivos del usuario: dos imágenes, un guion y unas notas
    for (const f of ["fruits.jpg", "home.jpg"]) nfs.copyFileSync(path.join(IMG, f), path.join(WORK, "entrada", f));
    nfs.writeFileSync(path.join(WORK, "entrada", "guion.txt"), SCRIPT);
    nfs.writeFileSync(path.join(WORK, "entrada", "notas.txt"), "Clase de Biología, 4to de secundaria. La ecuación: 6CO2 + 6H2O + luz → C6H12O6 + 6O2.");

    const { startPersonal, runningVideoId } = await import("../src/pipeline/runner");
    const repo = await import("../src/lib/repo");
    const t0 = Date.now();
    const id = await startPersonal({
      prompt: "Video corto para mi exposición de Biología", description: "Para compañeros de 15 años; claro, dinámico y con un esquema animado del proceso.",
      minutes: 0.5, language: "es", useLibrary: false, iterate: true,
      files: ["fruits.jpg", "home.jpg", "notas.txt"].map((f) => path.join(WORK, "entrada", f)), script: path.join(WORK, "entrada", "guion.txt"),
    });
    expect(id).toBeTruthy();
    await waitIdle(runningVideoId);
    const minutes1 = (Date.now() - t0) / 60000;
    let st = await repo.getStages(id!);
    for (const s of st) console.log(s.stage, s.status, s.error ? s.error.slice(0, 400) : "", s.started_at && s.finished_at ? `${Math.round((s.finished_at - s.started_at) / 1000)} s` : "");
    console.log(`Primera versión en ${minutes1.toFixed(1)} min`);
    const get = (stage: string) => st.find((s) => s.stage === stage)!;
    expect(get("final").status).toBe("review");
    expect(get("publish").status).toBe("skipped");
    // Guion respetado palabra por palabra
    const script = get("script").output;
    const text = script.segments.map((s: any) => s.text_en).join(" ").replace(/\s+/g, " ");
    console.log("Guion:", text);
    expect(text).toContain("La fotosíntesis es la forma en que las plantas fabrican su propio alimento.");
    expect(text).toContain("Sin este proceso, casi no habría vida en la Tierra.");
    // Solo material del usuario, animaciones o tarjetas (nada de internet ni de la biblioteca)
    const shots = get("polish").output.shots as any[];
    const kinds = shots.map((s) => s.provenance?.kind ?? "-");
    console.log("Tomas:", shots.map((s) => `${s.id}:${s.visual}:${s.provenance?.kind ?? "-"}`).join(" "));
    expect(kinds.every((k) => ["user", "card", "motion", "-"].includes(k))).toBe(true);
    expect(kinds).toContain("user");
    const render = get("render").output;
    expect(render.duration).toBeGreaterThan(15);
    expect(render.duration).toBeLessThan(60);
    const pkg = get("package").output;
    console.log("Título:", pkg.chosen_title);

    // Mejora continua
    const { requestImprovement } = await import("../src/pipeline/improve");
    const { runVideo } = await import("../src/pipeline/runner");
    const t1 = Date.now();
    const rev = await requestImprovement(id!, "En la animación, pon el título más grande y en color amarillo.", runVideo);
    console.log("Plan:", rev.reply_es, "|", (rev.changes_es ?? []).join(" · "), "|", rev.status, rev.error ?? "");
    expect(rev.status === "rendering" || rev.status === "done").toBe(true);
    await waitIdle(runningVideoId);
    console.log(`Mejora aplicada en ${((Date.now() - t1) / 60000).toFixed(1)} min`);
    st = await repo.getStages(id!);
    expect(st.find((s) => s.stage === "final")!.status).toBe("review");
    const v = await repo.getVideo(id!);
    const last = (v!.data.revisions as any[]).at(-1);
    expect(last.status).toBe("done");
    const motion = st.find((s) => s.stage === "motion")!.output;
    console.log("Animaciones:", JSON.stringify(motion.items.map((m: any) => ({ id: m.id, file: !!m.file, revise: m.revise_en ?? null, error: m.error ?? null }))));
  }, 90 * 60_000);
});
