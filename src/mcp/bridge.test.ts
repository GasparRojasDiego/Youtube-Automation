import { describe, it, expect, afterAll } from "vitest";
import * as nfs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { startTestServer } from "../../e2e/mcp-server";
import type { ServerSpec } from "./protocol";

const spec: ServerSpec = {
  name: "atril", title: "ATRIL", version: "9.9.9", instructions: "Hola",
  tools: [{ name: "eco", title: "Eco", description: "Eco", inputSchema: { type: "object", properties: { t: { type: "string" } } }, run: async (a) => ({ data: { eco: a.t } }) }],
  prompts: [],
};
const dir = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-puente-"));
const conf = path.join(dir, "mcp.json");
const BRIDGE = path.resolve(__dirname, "bridge.cjs");
const procs: ChildProcessWithoutNullStreams[] = [];

/** Abre el puente y devuelve una función que envía un mensaje y espera la respuesta con su id. */
function bridge() {
  const p = spawn(process.execPath, [BRIDGE], { env: { ...process.env, ATRIL_MCP_FILE: conf } });
  procs.push(p);
  const waiting = new Map<number, (m: any) => void>();
  let buf = "";
  p.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); waiting.get(m.id)?.(m); }
  });
  let id = 0;
  const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
    const my = ++id;
    waiting.set(my, resolve);
    setTimeout(() => reject(new Error(`sin respuesta a ${method}`)), 15_000);
    p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: my, method, params })}\n`);
  });
  const notify = (method: string) => p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  return { send, notify };
}

afterAll(() => { for (const p of procs) p.kill(); });

describe("puente stdio ↔ HTTP (el de Claude Desktop)", () => {
  it("reenvía el saludo, la lista y las llamadas a ATRIL con el token, y guarda la lista para cuando ATRIL esté cerrado", async () => {
    const srv = await startTestServer(spec, "tok123");
    nfs.writeFileSync(conf, JSON.stringify({ enabled: true, port: srv.port, token: "tok123", pid: process.pid }));
    const b = bridge();
    const init = await b.send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-desktop", version: "1" } });
    expect(init.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "atril", version: "9.9.9" } });
    b.notify("notifications/initialized");
    const list = await b.send("tools/list");
    expect(list.result.tools.map((t: any) => t.name)).toEqual(["eco"]);
    const call = await b.send("tools/call", { name: "eco", arguments: { t: "hola" } });
    expect(JSON.parse(call.result.content[0].text)).toEqual({ eco: "hola" });
    // Cliente de la revisión 2026-07-28: el puente refleja versión, método y nombre en las cabeceras y el servidor los acepta
    const modern = await b.send("tools/call", { name: "eco", arguments: { t: "ñandú" }, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } });
    expect(modern.result).toMatchObject({ resultType: "complete" });
    const disc = await b.send("server/discover", { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } });
    expect(disc.result.supportedVersions).toContain("2026-07-28");
    expect(JSON.parse(nfs.readFileSync(path.join(dir, "mcp-tools.json"), "utf8")).tools[0].name).toBe("eco");
    // Token cambiado: respuesta clara (con su id), no un cuelgue
    nfs.writeFileSync(conf, JSON.stringify({ enabled: true, port: srv.port, token: "viejo", pid: process.pid }));
    const denied = await b.send("tools/call", { name: "eco", arguments: { t: "x" } });
    expect(denied.error.message).toMatch(/token/);
    await srv.close();
  });

  it("con ATRIL abierto pero el MCP apagado, responde enseguida con un aviso y la lista guardada", async () => {
    nfs.writeFileSync(conf, JSON.stringify({ enabled: false, port: 0, token: "", pid: process.pid }));
    const b = bridge();
    const t0 = Date.now();
    const init = await b.send("initialize", { protocolVersion: "2025-11-25" });
    expect(init.result.instructions).toMatch(/Claude \(MCP\)/);
    const list = await b.send("tools/list");
    expect(list.result.tools.map((t: any) => t.name)).toEqual(["eco"]);
    const call = await b.send("tools/call", { name: "eco", arguments: {} });
    expect(call.result.isError).toBe(true);
    expect(call.result.content[0].text).toMatch(/ATRIL no está disponible/);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
