#!/usr/bin/env node
// Puente stdio ↔ HTTP del servidor MCP de ATRIL (VT Asvent). Claude Desktop lo ejecuta con su Node
// incluido (paquete .mcpb); también sirve para cualquier cliente MCP por stdio. Sin dependencias.
// Lee mcp.json (puerto y token que publica ATRIL), reenvía cada mensaje a http://127.0.0.1:<puerto>/mcp
// y, si ATRIL está cerrado, lo abre y espera; si no hay forma, responde con un aviso claro.
"use strict";
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { spawn } = require("child_process");

const VERSION = "__ATRIL_VERSION__";
const VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

function dataDir() {
  if (process.env.ATRIL_MCP_FILE) return path.dirname(process.env.ATRIL_MCP_FILE);
  const id = "com.vtasvent.atril";
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), id);
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", id);
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), id);
}
const CONF = process.env.ATRIL_MCP_FILE || path.join(dataDir(), "mcp.json");
const CACHE = path.join(dataDir(), "mcp-tools.json");
const log = (...a) => process.stderr.write(`[atril-mcp] ${a.join(" ")}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

function reachable(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(1500, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

let launchedAt = 0;
/** ATRIL listo para atender (abre la app si está cerrada). null si no hay forma. */
async function ensureUp() {
  let conf = readJson(CONF);
  if (conf && conf.enabled && conf.port && (await reachable(conf.port))) return conf;
  if (conf && conf.enabled === false && alive(conf.pid)) return null;   // abierto, pero con el MCP apagado
  if (conf && conf.exe && !alive(conf.pid) && Date.now() - launchedAt > 120000 && fs.existsSync(conf.exe)) {
    launchedAt = Date.now();
    log("abriendo ATRIL:", conf.exe);
    try { spawn(conf.exe, [], { detached: true, stdio: "ignore", windowsHide: false }).unref(); } catch (e) { log("no se pudo abrir:", e.message); }
  }
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    conf = readJson(CONF);
    if (conf && conf.enabled === false) return null;
    if (conf && conf.enabled && conf.port && (await reachable(conf.port))) return conf;
  }
  return null;
}

function headerSafe(v) {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?base64?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function post(conf, body, msg) {
  const headers = {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${conf.token}`,
    "Content-Length": Buffer.byteLength(body), "User-Agent": `atril-mcp-bridge/${VERSION}`,
  };
  const v = msg && msg.params && msg.params._meta && msg.params._meta["io.modelcontextprotocol/protocolVersion"];
  if (typeof v === "string") headers["MCP-Protocol-Version"] = v;
  if (msg && typeof msg.method === "string") headers["Mcp-Method"] = msg.method;
  const name = msg && msg.params && (typeof msg.params.name === "string" ? msg.params.name : typeof msg.params.uri === "string" ? msg.params.uri : null);
  if (name) headers["Mcp-Name"] = headerSafe(name);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: conf.port, path: "/mcp", method: "POST", headers, timeout: 330000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("tiempo agotado")));
    req.on("error", reject);
    req.end(body);
  });
}

const OFFLINE = "ATRIL no está disponible: ábrelo en tu PC y revisa que Ajustes → Claude (MCP) esté activado. Luego vuelve a intentarlo.";
function offline(msg) {
  const caps = { tools: { listChanged: false }, prompts: { listChanged: false } };
  const info = { name: "atril", title: "ATRIL", version: VERSION };
  const result = (r) => ({ jsonrpc: "2.0", id: msg.id, result: r });
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params && msg.params.protocolVersion;
      return result({ protocolVersion: VERSIONS.includes(asked) && asked !== "2026-07-28" ? asked : "2025-11-25", capabilities: caps, serverInfo: info, instructions: OFFLINE });
    }
    case "server/discover":
      return result({ supportedVersions: VERSIONS, capabilities: caps, instructions: OFFLINE, resultType: "complete", ttlMs: 0, cacheScope: "private" });
    case "tools/list": {
      const cached = readJson(CACHE);
      return result({ tools: (cached && cached.tools) || [{ name: "atril_status", title: "Estado de ATRIL", description: OFFLINE, inputSchema: { type: "object", properties: {} } }] });
    }
    case "prompts/list":
      return result({ prompts: [] });
    case "ping":
      return result({});
    case "tools/call":
      return result({ content: [{ type: "text", text: OFFLINE }], isError: true });
    default:
      return { jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: OFFLINE } };
  }
}

const write = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
let pending = 0;

async function handle(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
  const isRequest = msg && msg.method !== undefined && msg.id !== undefined && msg.id !== null;
  const conf = await ensureUp();
  if (!conf) { if (isRequest) write(offline(msg)); return; }
  try {
    const r = await post(conf, line, msg);
    if (!isRequest) return;
    let out = null;
    try { out = r.body ? JSON.parse(r.body) : null; } catch { out = null; }
    // Toda petición recibe respuesta con su id, aunque el servidor conteste sin cuerpo o sin id (401, 403…)
    if (r.status === 401) out = { jsonrpc: "2.0", id: msg.id, error: { code: -32001, message: "ATRIL rechazó el token: vuelve a instalar la extensión desde ATRIL → Ajustes → Claude (MCP)." } };
    if (!out || (out.result === undefined && out.error === undefined)) out = { jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `ATRIL respondió ${r.status} sin datos` } };
    if (out.id === null || out.id === undefined) out.id = msg.id;
    if (r.status === 401) log("token rechazado");
    write(out);
    if (msg.method === "tools/list" && out.result && Array.isArray(out.result.tools)) {
      try { fs.writeFileSync(CACHE, JSON.stringify({ version: VERSION, tools: out.result.tools })); } catch { /* sin caché */ }
    }
  } catch (e) {
    log("error:", e.message);
    if (isRequest) write(offline(msg));
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  pending++;
  handle(line).finally(() => { pending--; });
});
rl.on("close", async () => {
  for (let i = 0; i < 50 && pending > 0; i++) await sleep(100);
  process.exit(0);
});
