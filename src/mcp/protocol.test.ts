import { describe, it, expect } from "vitest";
import { handleRpc, validate, SUPPORTED_VERSIONS, type ServerSpec } from "./protocol";

const calls: string[] = [];
const spec: ServerSpec = {
  name: "atril", title: "ATRIL", version: "9.9.9", instructions: "Usa atril_status primero.",
  tools: [
    { name: "eco", title: "Eco", description: "Devuelve lo que recibe", inputSchema: { type: "object", properties: { texto: { type: "string" }, n: { type: "integer" }, modo: { type: "string", enum: ["a", "b"] } }, required: ["texto"] },
      run: async (a) => ({ data: { eco: a.texto, n: a.n ?? null } }) },
    { name: "falla", title: "Falla", description: "Siempre falla", inputSchema: { type: "object", properties: {} }, run: async () => { throw Object.assign(new Error("No se pudo"), { hint: "Prueba otra cosa" }); } },
  ],
  prompts: [{ name: "saludo", title: "Saludo", description: "Saluda", arguments: [{ name: "nombre", description: "Quién", required: true }], render: (a) => `Hola, ${a.nombre}` }],
  onCall: (e) => calls.push(`${e.tool}:${e.ok}`),
};
const rpc = (method: string, params: Record<string, unknown> = {}, id: number | null = 1) => JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params });
const call = async (body: string, headers: Record<string, string> = {}) => { const r = await handleRpc(spec, body, headers); return { status: r.status, msg: r.body ? JSON.parse(r.body) : null }; };
const modern = (extra: Record<string, unknown> = {}) => ({ ...extra, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "claude-test" } } });

describe("protocolo MCP (dos generaciones de clientes)", () => {
  it("saludo clásico: negocia la versión pedida si la conoce; si no, la más reciente de esa generación", async () => {
    let r = await call(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } }));
    expect(r.msg.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "atril", version: "9.9.9" }, instructions: "Usa atril_status primero.", capabilities: { tools: { listChanged: false } } });
    r = await call(rpc("initialize", { protocolVersion: "2099-01-01" }));
    expect(r.msg.result.protocolVersion).toBe("2025-11-25");
    // initialized y otras notificaciones: 202 sin cuerpo
    expect(await handleRpc(spec, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))).toEqual({ status: 202, body: "" });
  });

  it("revisión 2026-07-28: server/discover, versión por petición, resultType y cabeceras reflejadas", async () => {
    let r = await call(rpc("server/discover", modern()));
    expect(r.msg.result).toMatchObject({ supportedVersions: SUPPORTED_VERSIONS, resultType: "complete", cacheScope: "private", instructions: "Usa atril_status primero." });
    expect(r.msg.result._meta["io.modelcontextprotocol/serverInfo"]).toMatchObject({ name: "atril" });
    r = await call(rpc("tools/list", modern()), { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" });
    expect(r.msg.result.resultType).toBe("complete");
    expect(r.msg.result.ttlMs).toBeGreaterThan(0);
    expect(r.msg.result.tools.map((t: any) => t.name)).toEqual(["eco", "falla"]);
    // Versión desconocida → 400 con las soportadas
    r = await call(rpc("tools/list", { _meta: { "io.modelcontextprotocol/protocolVersion": "2030-01-01" } }));
    expect(r.status).toBe(400);
    expect(r.msg.error).toMatchObject({ code: -32022, data: { requested: "2030-01-01", supported: SUPPORTED_VERSIONS } });
    // Cabeceras que no coinciden con el cuerpo → 400 HeaderMismatch
    r = await call(rpc("tools/list", modern()), { "mcp-method": "tools/call" });
    expect([r.status, r.msg.error.code]).toEqual([400, -32020]);
    r = await call(rpc("tools/call", modern({ name: "eco", arguments: { texto: "hola" } })), { "mcp-name": "otra" });
    expect([r.status, r.msg.error.code]).toEqual([400, -32020]);
    r = await call(rpc("tools/call", modern({ name: "eco", arguments: { texto: "hola" } })), { "mcp-name": `=?base64?${btoa("eco")}?=` });
    expect(r.status).toBe(200);
    r = await call(rpc("tools/list", modern()), { "mcp-protocol-version": "2025-11-25" });
    expect([r.status, r.msg.error.code]).toEqual([400, -32020]);
    // Método desconocido: 404 en la revisión nueva; 200 con error JSON-RPC en la clásica
    expect((await call(rpc("nada/x", modern()))).status).toBe(404);
    expect((await call(rpc("nada/x"))).msg.error.code).toBe(-32601);
  });

  it("herramientas: valida argumentos, devuelve texto compacto y convierte excepciones en isError", async () => {
    let r = await call(rpc("tools/call", { name: "eco", arguments: { texto: "hola", n: 3 } }));
    expect(r.msg.result.isError).toBeUndefined();
    expect(JSON.parse(r.msg.result.content[0].text)).toEqual({ eco: "hola", n: 3 });
    r = await call(rpc("tools/call", { name: "eco", arguments: { n: 2.5, modo: "z" } }));
    expect(r.msg.result.isError).toBe(true);
    expect(r.msg.result.content[0].text).toMatch(/texto: es obligatorio/);
    expect(r.msg.result.content[0].text).toMatch(/n: se esperaba integer/);
    expect(r.msg.result.content[0].text).toMatch(/modo: valor «z» no válido/);
    r = await call(rpc("tools/call", { name: "falla", arguments: {} }));
    expect(r.msg.result).toMatchObject({ isError: true, content: [{ type: "text", text: "No se pudo\nPrueba otra cosa" }] });
    r = await call(rpc("tools/call", { name: "no-existe" }));
    expect(r.msg.error.code).toBe(-32602);
    expect(calls).toContain("eco:true");
    expect(calls).toContain("falla:false");
  });

  it("prompts, ping y mensajes mal formados", async () => {
    let r = await call(rpc("prompts/get", { name: "saludo", arguments: { nombre: "Diego" } }));
    expect(r.msg.result.messages[0].content.text).toBe("Hola, Diego");
    r = await call(rpc("prompts/get", { name: "saludo", arguments: {} }));
    expect(r.msg.error.message).toMatch(/nombre/);
    expect((await call(rpc("ping"))).msg.result).toEqual({});
    expect((await call("{no json")).status).toBe(400);
    expect((await call(JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }]))).status).toBe(400);
  });

  it("validador: tipos, enumerados, obligatorios, listas y alternativas", () => {
    const s = { type: "object", properties: { d: { anyOf: [{ type: "number" }, { type: "array", items: { type: "number" } }] }, l: { type: "array", items: { type: "string" } } }, required: ["l"] };
    expect(validate(s, { l: ["a"], d: 30 })).toEqual([]);
    expect(validate(s, { l: ["a"], d: [30, 45] })).toEqual([]);
    expect(validate(s, { l: [1], d: "x" })).toEqual(["d: no coincide con ninguna forma permitida", "l[0]: se esperaba string"]);
  });
});
