// MCP de ATRIL con un Claude real (Claude Code en modo -p): las herramientas de verdad, sobre una copia de
// la base de datos de prueba, por las dos vías de conexión: el puente stdio (como Claude Desktop) y HTTP
// directo con token (como Claude Code). La producción de videos se simula (ya se prueba aparte).
// Ejecutar: npx vitest run -c vitest.e2e.config.ts e2e/mcp-claude.e2e.ts
import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";

vi.mock("../src/lib/ipc", () => import("./node-ipc"));
const started: string[] = [];
vi.mock("../src/pipeline/runner", async (orig) => ({ ...(await orig<typeof import("../src/pipeline/runner")>()), runVideo: (id: string) => { started.push(id); } }));

const SRC = "/tmp/claude-0/e2e/run/atril.db";
const WORK = "/tmp/claude-0/e2e/mcp";
const TOKEN = "e2e-token-0123456789abcdef";

function claude(prompt: string, mcpConfig: object, maxTurns = 14): Promise<{ result: string; raw: any }> {
  const cfg = path.join(WORK, `mcp-${Date.now()}.json`);
  nfs.writeFileSync(cfg, JSON.stringify(mcpConfig));
  return new Promise((resolve, reject) => {
    execFile("claude", ["-p", prompt, "--mcp-config", cfg, "--strict-mcp-config", "--allowedTools", "mcp__atril", "--output-format", "json", "--max-turns", String(maxTurns)],
      { cwd: WORK, timeout: 8 * 60_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NO_PROXY: `127.0.0.1,localhost,${process.env.NO_PROXY ?? ""}` } },
      (err, stdout, stderr) => {
        try { const raw = JSON.parse(stdout); resolve({ result: String(raw.result ?? ""), raw }); }
        catch { reject(new Error(`claude falló: ${err?.message ?? ""}\n${stderr.slice(-2000)}\n${stdout.slice(-2000)}`)); }
      });
  });
}

describe.skipIf(!nfs.existsSync(SRC))("MCP de ATRIL con Claude real", () => {
  it("un chat nuevo usa ATRIL: estado, una tarjeta en la cola de TikTok y el plan para ordenar la biblioteca", async () => {
    nfs.rmSync(WORK, { recursive: true, force: true });
    nfs.mkdirSync(WORK, { recursive: true });
    nfs.copyFileSync(SRC, path.join(WORK, "atril.db"));
    const ipc = await import("./node-ipc");
    ipc.openDb(path.join(WORK, "atril.db"));
    ipc.setPaths({ data: path.join(WORK, "data"), exe_dir: WORK, resources: path.resolve(__dirname, "../src-tauri"), home: WORK, documents: WORK, downloads: path.join(WORK, "descargas"), pid: process.pid });
    await (await import("../src/lib/schema")).migrate();
    const { loadSettings } = await import("../src/lib/settings");
    await loadSettings();
    const { SPEC } = await import("../src/mcp/host");
    const log: string[] = [];
    const spec = { ...SPEC, onCall: (e: { tool: string; ok: boolean }) => { log.push(`${e.tool}:${e.ok ? "ok" : "error"}`); } };
    const { startTestServer } = await import("./mcp-server");
    const srv = await startTestServer(spec, TOKEN);
    const conf = path.join(WORK, "mcp.json");
    nfs.writeFileSync(conf, JSON.stringify({ enabled: true, port: srv.port, token: TOKEN, pid: process.pid }));
    const repo = await import("../src/lib/repo");
    const ch = (await repo.activeChannel())!;

    // 1) Como Claude Desktop: el puente por stdio
    const viaBridge = await claude(
      "Usa las herramientas de ATRIL. 1) Mira su estado. 2) Crea en la cola de TikTok (no lo produzcas ahora) un video personal titulado «Prueba MCP» con el guion «Hola desde Claude.» y una duración de 20 a 30 segundos. 3) Revisa cómo ordenar la biblioteca sin aplicar ningún cambio. Al final responde en español en tres líneas: el nombre del canal, el id de la tarjeta creada y el plan para la biblioteca.",
      { mcpServers: { atril: { command: process.execPath, args: [path.resolve(__dirname, "../src/mcp/bridge.cjs")], env: { ATRIL_MCP_FILE: conf } } } });
    console.log("Respuesta (puente):", viaBridge.result);
    nfs.writeFileSync(path.join(WORK, "respuesta-puente.txt"), `${viaBridge.result}\n\nHerramientas: ${log.join(", ")}\nTurnos: ${viaBridge.raw.num_turns}\n`);
    console.log("Herramientas usadas:", log.join(", "), "· turnos:", viaBridge.raw.num_turns);
    expect(log).toContain("atril_status:ok");
    expect(log.some((x) => /^(video_create|queue_add):ok$/.test(x))).toBe(true);
    expect(log).toContain("library_organize:ok");
    const { listQueue } = await import("../src/pipeline/queue");
    const card = (await listQueue(ch.id)).find((i) => (i.cfg as { title?: string }).title === "Prueba MCP");
    expect(card).toBeTruthy();
    expect(card!.cfg).toMatchObject({ format: "9:16", script: "Hola desde Claude." });
    expect(card!.cfg.minutes[0]).toBeCloseTo(20 / 60, 3);
    expect(card!.cfg.minutes[1]).toBeCloseTo(0.5, 3);
    expect(viaBridge.result).toContain(card!.id);
    expect(viaBridge.result).toContain(ch.name);
    expect(started).toEqual([]);   // pedido «en la cola»: no se produjo nada

    // 2) Como Claude Code: HTTP directo con token
    log.length = 0;
    const viaHttp = await claude(
      "Con ATRIL: lista los 3 videos más recientes y dime el título y el estado de cada uno, en español y en una línea por video.",
      { mcpServers: { atril: { type: "http", url: `http://127.0.0.1:${srv.port}/mcp`, headers: { Authorization: `Bearer ${TOKEN}` } } } }, 8);
    console.log("Respuesta (HTTP):", viaHttp.result);
    nfs.writeFileSync(path.join(WORK, "respuesta-http.txt"), `${viaHttp.result}\n\nHerramientas: ${log.join(", ")}\n`);
    console.log("Herramientas usadas:", log.join(", "));
    expect(log).toContain("video_list:ok");
    const first = (await repo.listVideos(ch.id, 1))[0];
    if (first) expect(viaHttp.result).toContain(first.title.slice(0, 20));
    await srv.close();
  });
});
