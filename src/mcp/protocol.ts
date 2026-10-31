// Protocolo MCP de ATRIL: despacha mensajes JSON-RPC sin estado. Atiende a los dos tipos de cliente
// que conviven hoy: los que saludan con `initialize` (revisiones 2024-11-05 a 2025-11-25, las del SDK
// oficial) y los de la revisión 2026-07-28, que no saludan: cada petición trae su versión en `_meta`
// y descubren al servidor con `server/discover`. Puro: sin dependencias de la app (se prueba en Node).

export const SUPPORTED_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const LEGACY_LATEST = "2025-11-25";
const MODERN = new Set(["2026-07-28"]);
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT = "io.modelcontextprotocol/clientInfo";
const META_SERVER = "io.modelcontextprotocol/serverInfo";

export type JsonSchema = Record<string, unknown>;
export interface ToolOut { data?: unknown; text?: string; isError?: boolean }
export interface CallCtx { client: string; version: string }
export interface ToolDef {
  name: string; title: string; description: string; inputSchema: JsonSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (args: Record<string, any>, ctx: CallCtx) => Promise<ToolOut>;
}
export interface PromptDef {
  name: string; title: string; description: string; arguments?: { name: string; description: string; required?: boolean }[];
  render: (args: Record<string, string>) => string;
}
export interface ServerSpec {
  name: string; title: string; version: string; instructions: string;
  tools: ToolDef[]; prompts: PromptDef[];
  /** Registro de cada llamada (para la pantalla de Ajustes). */
  onCall?: (e: { tool: string; ok: boolean; ms: number; client: string; summary: string }) => void;
}
export interface RpcReply { status: number; body: string }

const MAX_TEXT = 60_000;
const json = (status: number, msg: object): RpcReply => ({ status, body: JSON.stringify(msg) });
const err = (id: unknown, code: number, message: string, data?: unknown, status = 200): RpcReply =>
  json(status, { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } });

/** Valor de una cabecera Mcp-Name, que puede venir codificada como `=?base64?…?=`. */
function headerValue(v: string): string {
  const m = /^=\?base64\?(.*)\?=$/.exec(v);
  if (!m) return v;
  try { return new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0))); } catch { return v; }
}

// ---------- Validación mínima de argumentos (tipos, enumerados y obligatorios) ----------
function typeOk(v: unknown, t: unknown): boolean {
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => (x === "array" ? Array.isArray(v) : x === "integer" ? Number.isInteger(v) : x === "null" ? v === null
    : x === "object" ? !!v && typeof v === "object" && !Array.isArray(v) : typeof v === x));
}

export function validate(schema: JsonSchema, value: unknown, path = ""): string[] {
  const out: string[] = [];
  const s = schema as { type?: unknown; enum?: unknown[]; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; anyOf?: JsonSchema[] };
  if (s.anyOf) return s.anyOf.some((x) => !validate(x, value, path).length) ? [] : [`${path || "argumentos"}: no coincide con ninguna forma permitida`];
  if (s.type && !typeOk(value, s.type)) return [`${path || "argumentos"}: se esperaba ${Array.isArray(s.type) ? s.type.join(" o ") : s.type}`];
  if (s.enum && !s.enum.includes(value)) out.push(`${path}: valor «${String(value)}» no válido (usa: ${s.enum.join(", ")})`);
  if (s.properties && value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const r of s.required ?? []) if (o[r] === undefined || o[r] === null || o[r] === "") out.push(`${path ? `${path}.` : ""}${r}: es obligatorio`);
    for (const [k, sub] of Object.entries(s.properties)) if (o[k] !== undefined && o[k] !== null) out.push(...validate(sub, o[k], path ? `${path}.${k}` : k));
  }
  if (s.items && Array.isArray(value)) value.forEach((x, i) => out.push(...validate(s.items!, x, `${path}[${i}]`)));
  return out;
}

const textOf = (o: ToolOut) => {
  const t = o.text ?? (typeof o.data === "string" ? o.data : JSON.stringify(o.data ?? null));
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}\n…(recortado: pide menos resultados o usa limit/offset)` : t;
};

/** Atiende un mensaje (el cuerpo de un POST o una línea de stdio). */
export async function handleRpc(spec: ServerSpec, raw: string, headers: Record<string, string> = {}): Promise<RpcReply> {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return err(null, -32700, "Parse error", undefined, 400); }
  if (Array.isArray(msg)) return err(null, -32600, "Batch requests are not supported", undefined, 400);
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") return err(msg?.id, -32600, "Invalid Request", undefined, 400);
  // Notificaciones (initialized, cancelled…) y respuestas del cliente: se aceptan sin cuerpo
  if (msg.method === undefined || msg.id === undefined || msg.id === null) return { status: 202, body: "" };
  const id = msg.id;
  const method = String(msg.method);
  const params = (msg.params ?? {}) as Record<string, any>;
  const meta = (params._meta ?? {}) as Record<string, any>;
  const metaVersion = typeof meta[META_VERSION] === "string" ? meta[META_VERSION] as string : null;
  const hVersion = headers["mcp-protocol-version"];
  // Revisión 2026-07-28: la versión viaja en cada petición; las cabeceras reflejadas deben coincidir
  if (metaVersion) {
    if (!SUPPORTED_VERSIONS.includes(metaVersion)) return err(id, -32022, `Unsupported protocol version: ${metaVersion}`, { supported: SUPPORTED_VERSIONS, requested: metaVersion }, 400);
    if (hVersion && hVersion !== metaVersion) return err(id, -32020, `Header mismatch: MCP-Protocol-Version '${hVersion}' does not match body '${metaVersion}'`, undefined, 400);
  }
  if (headers["mcp-method"] && headers["mcp-method"] !== method) return err(id, -32020, `Header mismatch: Mcp-Method '${headers["mcp-method"]}' does not match body '${method}'`, undefined, 400);
  const target = typeof params.name === "string" ? params.name : typeof params.uri === "string" ? params.uri : null;
  if (headers["mcp-name"] && target !== null && headerValue(headers["mcp-name"]) !== target) return err(id, -32020, `Header mismatch: Mcp-Name does not match body '${target}'`, undefined, 400);
  const version = metaVersion ?? hVersion ?? LEGACY_LATEST;
  const modern = MODERN.has(version);
  const client = String(meta[META_CLIENT]?.name ?? headers["user-agent"] ?? "cliente MCP").slice(0, 60);
  const serverInfo = { name: spec.name, title: spec.title, version: spec.version };
  const capabilities = { tools: { listChanged: false }, prompts: { listChanged: false } };
  const ok = (result: Record<string, unknown>, cacheable = false) => json(200, {
    jsonrpc: "2.0", id,
    result: modern ? { ...result, resultType: "complete", ...(cacheable ? { ttlMs: 300_000, cacheScope: "private" } : {}), _meta: { ...(result._meta as object ?? {}), [META_SERVER]: serverInfo } } : result,
  });

  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      const v = SUPPORTED_VERSIONS.includes(asked) && !MODERN.has(asked) ? asked : LEGACY_LATEST;
      return json(200, { jsonrpc: "2.0", id, result: { protocolVersion: v, capabilities, serverInfo, instructions: spec.instructions } });
    }
    case "server/discover":
      return json(200, { jsonrpc: "2.0", id, result: { supportedVersions: SUPPORTED_VERSIONS, capabilities, instructions: spec.instructions, resultType: "complete", ttlMs: 300_000, cacheScope: "private", _meta: { [META_SERVER]: serverInfo } } });
    case "ping":
      return ok({});
    case "logging/setLevel":
      return ok({});
    case "tools/list":
      return ok({ tools: spec.tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, ...(t.annotations ? { annotations: t.annotations } : {}) })) }, true);
    case "tools/call": {
      const tool = spec.tools.find((t) => t.name === params.name);
      if (!tool) return err(id, -32602, `Unknown tool: ${String(params.name)}`);
      const args = (params.arguments ?? {}) as Record<string, any>;
      const t0 = Date.now();
      const problems = validate(tool.inputSchema, args);
      let out: ToolOut;
      if (problems.length) out = { isError: true, text: `Argumentos no válidos para ${tool.name}:\n- ${problems.join("\n- ")}` };
      else {
        try { out = await tool.run(args, { client, version }); }
        catch (e: any) { out = { isError: true, text: [e?.userMessage ?? e?.message ?? String(e), e?.hint].filter(Boolean).join("\n") }; }
      }
      const text = textOf(out);
      spec.onCall?.({ tool: tool.name, ok: !out.isError, ms: Date.now() - t0, client, summary: text.slice(0, 160) });
      return ok({ content: [{ type: "text", text }], ...(out.isError ? { isError: true } : {}) });
    }
    case "prompts/list":
      return ok({ prompts: spec.prompts.map((p) => ({ name: p.name, title: p.title, description: p.description, arguments: p.arguments ?? [] })) }, true);
    case "prompts/get": {
      const p = spec.prompts.find((x) => x.name === params.name);
      if (!p) return err(id, -32602, `Unknown prompt: ${String(params.name)}`);
      const args = (params.arguments ?? {}) as Record<string, string>;
      const missing = (p.arguments ?? []).filter((a) => a.required && !args[a.name]?.trim()).map((a) => a.name);
      if (missing.length) return err(id, -32602, `Missing prompt arguments: ${missing.join(", ")}`);
      return ok({ description: p.description, messages: [{ role: "user", content: { type: "text", text: p.render(args) } }] });
    }
    default:
      return err(id, -32601, `Method not found: ${method}`, undefined, modern ? 404 : 200);
  }
}
