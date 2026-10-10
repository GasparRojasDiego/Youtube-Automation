// Mejora continua sobre el video de la prueba del modo Personal (Claude real):
// un pedido que contradice el estilo del canal debe aplicarse igual.
// Ejecutar después de personal.e2e.ts: npx vitest run -c vitest.e2e.config.ts e2e/improve.e2e.ts
import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";

vi.mock("../src/lib/ipc", () => import("./node-ipc"));
vi.mock("../src/pipeline/cards", () => import("./node-cards"));
const WORK = "/tmp/claude-0/e2e/personal";

describe.skipIf(!nfs.existsSync(path.join(WORK, "atril.db")))("mejora continua", () => {
  it("aplica un pedido explícito aunque contradiga el estilo del canal", async () => {
    const ipc = await import("./node-ipc");
    ipc.openDb(path.join(WORK, "atril.db"));
    ipc.setPaths({ data: path.join(WORK, "data"), exe_dir: WORK, resources: path.resolve(__dirname, "../src-tauri"), home: WORK, documents: path.join(WORK, "docs"), downloads: path.join(WORK, "descargas") });
    await (await import("../src/lib/settings")).loadSettings();
    const repo = await import("../src/lib/repo");
    const { runVideo, runningVideoId } = await import("../src/pipeline/runner");
    const { requestImprovement } = await import("../src/pipeline/improve");
    const v = (await repo.listVideos())[0];
    const t0 = Date.now();
    const rev = await requestImprovement(v.id, "El título final debe ser amarillo entero (todas las palabras) y bastante más grande.", runVideo);
    console.log("Plan:", rev.reply_es, "|", (rev.changes_es ?? []).join(" · "));
    do { await new Promise((r) => setTimeout(r, 3000)); } while (runningVideoId());
    console.log(`Mejora en ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    const st = await repo.getStages(v.id);
    expect(st.find((s) => s.stage === "final")!.status).toBe("review");
    expect(st.find((s) => s.stage === "publish")!.status).toBe("skipped");
    const last = ((await repo.getVideo(v.id))!.data.revisions as any[]).at(-1);
    expect(last.status).toBe("done");
  }, 30 * 60_000);
});
