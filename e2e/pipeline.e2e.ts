// Prueba de extremo a extremo de la edición v2 sobre un video real de la v1:
// migración, biblioteca + visión, storyboard, casting, retoques (Opus),
// animaciones (Opus + Chromium), metadatos y montaje final.
// Ejecutar: npx vitest run -c vitest.e2e.config.ts
import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

vi.mock("../src/lib/ipc", () => import("./node-ipc"));
vi.mock("../src/pipeline/cards", () => import("./node-cards"));

const SRC_DB = "/root/.local/share/com.vtasvent.atril/atril.db";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const IMG = "/tmp/claude-0/e2e/img";
const WORK = "/tmp/claude-0/e2e/run";

describe.skipIf(!nfs.existsSync(SRC_DB))("edición v2 de extremo a extremo", () => {
  it("produce el video final", async () => {
    const ipc = await import("./node-ipc");
    nfs.rmSync(WORK, { recursive: true, force: true });
    nfs.mkdirSync(WORK, { recursive: true });
    for (const ext of ["", "-wal", "-shm"]) if (nfs.existsSync(SRC_DB + ext)) nfs.copyFileSync(SRC_DB + ext, path.join(WORK, "atril.db" + ext));
    ipc.openDb(path.join(WORK, "atril.db"));
    ipc.setPaths({ data: path.join(WORK, "data"), exe_dir: WORK, resources: path.resolve(__dirname, "../src-tauri"), home: WORK, documents: path.join(WORK, "docs") });
    const { migrate } = await import("../src/lib/schema");
    const { loadSettings, saveSettings } = await import("../src/lib/settings");
    const repo = await import("../src/lib/repo");
    await migrate();
    await loadSettings();
    await saveSettings((s) => {
      s.motion = { ...s.motion, enabled: true, browserPath: CHROME, perVideo: { standard: 3, premium: 3 }, critique: true, perCall: 2 };
      s.media = { ...s.media, libraryDir: path.join(WORK, "Biblioteca"), sources: { openverse: false, pexels: false, pixabay: false, wikimedia: false, nasa: false, met: false, freesound: false } };
      s.ffmpeg = { ...s.ffmpeg, encoder: "libx264", path: "", ffprobePath: "" };
      return s;
    });
    // Video de la v1 copiado a la carpeta de trabajo
    const v0 = (await repo.listVideos())[0];
    const vdir = path.join(WORK, "video");
    // Carpeta original del video (si la base apunta a una carpeta de trabajo anterior, se usa la copia del canal)
    const chDir = path.join(path.dirname(SRC_DB), "channels");
    const fallback = nfs.existsSync(chDir) ? nfs.readdirSync(chDir).flatMap((c) => { const d = path.join(chDir, c, "videos"); return nfs.existsSync(d) ? nfs.readdirSync(d).map((x) => path.join(d, x)) : []; })[0] : undefined;
    const srcDir = nfs.existsSync(v0.dir) ? v0.dir : fallback!;
    execFileSync("cp", ["-r", srcDir, vdir]);
    await ipc.db.execute("UPDATE videos SET dir=? WHERE id=?", [vdir, v0.id]);
    const voiceRow = await ipc.db.query<{ output: string }>("SELECT output FROM stages WHERE video_id=? AND stage='voice'", [v0.id]);
    await ipc.db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage='voice'", [voiceRow[0].output.split(v0.dir.replace(/\/$/, "")).join(vdir), v0.id]);
    // Las etapas nuevas aparecen al leer (video ya montado → omitidas); se rehace desde el storyboard
    const st = await repo.getStages(v0.id);
    expect(st.map((s) => s.stage)).toContain("polish");
    expect(["skipped", "done", "pending"]).toContain(st.find((s) => s.stage === "storyboard")!.status);
    await repo.resetFrom(v0.id, "voice");

    // Biblioteca: material propio + descripción por visión (Sonnet)
    const lib = await import("../src/media/library");
    for (const f of ["building.jpg", "home.jpg", "starry_night.jpg", "messi5.jpg", "fruits.jpg", "baboon.jpg"]) await lib.importLocalFile(path.join(IMG, f), "image", { note: "prueba" });
    await lib.importLocalFile(path.join(IMG, "street-pedestrians.mp4"), "video", { note: "prueba" });
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anoisesrc=d=0.8:c=pink,afade=t=in:d=0.3,afade=t=out:st=0.4:d=0.4,highpass=f=600", path.join(WORK, "cinematic-whoosh.wav")]);
    await lib.importLocalFile(path.join(WORK, "cinematic-whoosh.wav"), "sfx");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "aevalsrc='0.2*sin(2*PI*110*t)+0.15*sin(2*PI*164.8*t)+0.1*sin(2*PI*220*t)':d=70", path.join(WORK, "dark-ambient.wav")]);
    await repo.addTrack({ title: "Dark ambient drone", artist: "Prueba", path: path.join(WORK, "dark-ambient.wav"), license: "Propia", attribution: "", duration_s: 70, mood: "dark ambient tense slow documentary" });
    const vision = await import("../src/media/vision");
    const described = await vision.describePending(20);
    expect(described).toBeGreaterThanOrEqual(0);
    const messi = (await lib.listAssets({ q: "football soccer player" }))[0];
    console.log("Visión:", messi?.title, "|", messi?.description?.slice(0, 200), "| persona real:", messi?.real_person);

    // Pipeline v2
    const { runVideo, runningVideoId } = await import("../src/pipeline/runner");
    const t0 = Date.now();
    runVideo(v0.id);
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      const stages = await repo.getStages(v0.id);
      const cur = stages.find((s) => s.status === "running");
      if (cur) console.log(`[${Math.round((Date.now() - t0) / 1000)} s] ${cur.stage}: ${cur.progress ?? ""}`);
      if (!runningVideoId()) break;
    }
    const stages = await repo.getStages(v0.id);
    for (const s of stages) console.log(s.stage, s.status, s.error ? s.error.slice(0, 600) : "");
    const failed = stages.find((s) => s.status === "failed");
    expect(failed?.error ?? null).toBeNull();
    expect(stages.find((s) => s.stage === "final")!.status).toBe("review");
    const render = stages.find((s) => s.stage === "render")!.output;
    expect(nfs.existsSync(render.file)).toBe(true);
    const motion = stages.find((s) => s.stage === "motion")!.output;
    console.log("Animaciones:", JSON.stringify(motion.items.map((m: any) => ({ id: m.id, kind: m.kind, ok: !!m.file, err: m.error, attempts: m.attempts, crit: m.critique_es }))));
    const runs = await ipc.db.query("SELECT stage,label,model,input_tokens,cache_read,cache_write,output_tokens,api_equiv,five_hour,seven_day,five_hour_before FROM claude_runs ORDER BY id");
    console.log("Tareas de Claude:", JSON.stringify(runs));
    const act = await ipc.db.query<{ n: number }>("SELECT COUNT(*) n FROM activity WHERE video_id=?", [v0.id]);
    expect(act[0].n).toBeGreaterThan(20);
    const assets = stages.find((s) => s.stage === "assets")!.output;
    const polish = stages.find((s) => s.stage === "polish")!.output;
    console.log("Tarjetas:", polish.shots.filter((s: any) => s.provenance?.kind === "card" && s.visual !== "motion" && s.visual !== "map").length, "· tomas:", polish.shots.length, "· descargas:", assets.downloaded);
    console.log("Efectos:", JSON.stringify(polish.sfx.map((c: any) => `${c.type}@${c.at}:${c.origin}`)));
    const posters = motion.items.filter((m: any) => m.poster).map((m: any) => m.poster);
    for (const [i, p] of posters.entries()) nfs.copyFileSync(p, path.join(path.dirname(WORK), `poster_${i}.jpg`));
    console.log("Duración final:", render.duration, "s ·", render.file);
  }, 90 * 60_000);
});
