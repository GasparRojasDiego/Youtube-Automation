// Vuelve a montar (sin llamar a Claude) el video de la prueba completa ya ejecutada.
import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

vi.mock("../src/lib/ipc", () => import("./node-ipc"));
vi.mock("../src/pipeline/cards", () => import("./node-cards"));
const WORK = "/tmp/claude-0/e2e/run";

describe.skipIf(!nfs.existsSync(path.join(WORK, "atril.db")))("montaje v2 sobre la prueba previa", () => {
  it("vuelve a montar con imagen y voz sincronizadas", async () => {
    const ipc = await import("./node-ipc");
    ipc.openDb(path.join(WORK, "atril.db"));
    ipc.setPaths({ data: path.join(WORK, "data"), exe_dir: WORK, resources: path.resolve(__dirname, "../src-tauri"), home: WORK, documents: path.join(WORK, "docs") });
    const { loadSettings } = await import("../src/lib/settings");
    const repo = await import("../src/lib/repo");
    await loadSettings();
    const v = (await repo.listVideos())[0];
    await repo.resetFrom(v.id, "render");
    const { runVideo, runningVideoId } = await import("../src/pipeline/runner");
    runVideo(v.id);
    do { await new Promise((r) => setTimeout(r, 2000)); } while (runningVideoId());
    const st = await repo.getStages(v.id);
    const render = st.find((s) => s.stage === "render")!;
    expect(render.error).toBeNull();
    const file = render.output.file;
    const vdur = Number(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "csv=p=0", file]).stdout.toString());
    const adur = Number(spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration", "-of", "csv=p=0", file]).stdout.toString());
    console.log("video", vdur, "audio", adur);
    expect(Math.abs(vdur - adur)).toBeLessThan(0.3);
  }, 30 * 60_000);
});
