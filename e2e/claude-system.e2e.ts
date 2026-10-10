// Llamada real a Claude Code con un system prompt de ~80 000 caracteres (más que
// unas directrices visuales extensas): debe funcionar porque viaja en un archivo.
// Ejecutar: npx vitest run -c vitest.e2e.config.ts e2e/claude-system.e2e.ts
import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("../src/lib/ipc", () => import("./node-ipc"));

describe("Claude Code con system prompt largo", () => {
  it("responde con salida estructurada", async () => {
    const ipc = await import("./node-ipc");
    const work = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-claude-"));
    ipc.openDb(path.join(work, "atril.db"));
    ipc.setPaths({ data: work, exe_dir: work, resources: path.resolve(__dirname, "../src-tauri"), home: work, documents: work, downloads: work });
    await (await import("../src/lib/schema")).migrate();
    const { loadSettings, saveSettings } = await import("../src/lib/settings");
    await loadSettings();
    await saveSettings((s) => ({ ...s, claude: { ...s.claude, models: { ...s.claude.models, critique: "haiku" }, effort: { ...s.claude.effort, critique: "low" } } }));
    const { claudeRun } = await import("../src/providers/claude");
    const system = `${"Channel rule: keep compositions balanced and legible. ".repeat(1500)}\nThe secret word is ATRIL.`;
    expect(system.length).toBeGreaterThan(75_000);
    const r = await claudeRun<{ word: string }>({ stage: "critique", label: "Prueba", system, prompt: "What is the secret word?",
      schema: { type: "object", additionalProperties: false, required: ["word"], properties: { word: { type: "string" } } } });
    expect(r.data.word.toUpperCase()).toContain("ATRIL");
  }, 5 * 60_000);
});
