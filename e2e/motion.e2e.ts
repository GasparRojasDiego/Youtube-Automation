// Rehace retoques y animaciones (con Claude real) del video de la prueba completa,
// usando las habilidades de docs/habilidades, para revisar el estilo visual a ojo.
// Ejecutar: npx vitest run -c vitest.e2e.config.ts e2e/motion.e2e.ts
import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";

vi.mock("../src/lib/ipc", () => import("./node-ipc"));
vi.mock("../src/pipeline/cards", () => import("./node-cards"));
const WORK = "/tmp/claude-0/e2e/run";
const DOCS = path.resolve(__dirname, "../docs/habilidades");

describe.skipIf(!nfs.existsSync(path.join(WORK, "atril.db")))("animaciones con las habilidades de Atril", () => {
  it("rehace retoques y animaciones sin errores", async () => {
    const ipc = await import("./node-ipc");
    ipc.openDb(path.join(WORK, "atril.db"));
    ipc.setPaths({ data: path.join(WORK, "data"), exe_dir: WORK, resources: path.resolve(__dirname, "../src-tauri"), home: WORK, documents: path.join(WORK, "docs"), downloads: path.join(WORK, "descargas") });
    const { loadSettings } = await import("../src/lib/settings");
    const repo = await import("../src/lib/repo");
    const sk = await import("../src/lib/skills");
    await loadSettings();
    const v = (await repo.listVideos())[0];
    // Solo las habilidades de Atril (las de prueba se desactivan)
    for (const s of await sk.listSkills(v.channel_id)) await sk.setSkillEnabled(s.id, false);
    for (const [file, name, kind] of [["atril-visual.md", "Atril · Visual", "visual"], ["atril-referentes.md", "Atril · Referentes", "script"]] as const) {
      const content = nfs.readFileSync(path.join(DOCS, file), "utf8");
      const prev = (await sk.listSkills(v.channel_id)).find((s) => s.name === name);
      await sk.saveSkill({ id: prev?.id, name, content, scopes: sk.KIND_SCOPES[kind], enabled: true, channel_id: v.channel_id });
    }
    await repo.resetFrom(v.id, "polish");
    const { runVideo, runningVideoId } = await import("../src/pipeline/runner");
    runVideo(v.id);
    do { await new Promise((r) => setTimeout(r, 3000)); } while (runningVideoId());
    const st = await repo.getStages(v.id);
    const motion = st.find((s) => s.stage === "motion")!;
    console.log("motion:", JSON.stringify((motion.output?.items ?? []).map((m: any) => ({ id: m.id, file: !!m.file, error: m.error ?? null }))));
    expect(motion.error).toBeNull();
    expect((motion.output?.items ?? []).filter((m: any) => m.file).length).toBeGreaterThan(0);
  }, 60 * 60_000);
});
