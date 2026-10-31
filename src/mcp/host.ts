// Anfitrión del servidor MCP dentro de la app: arranca el servidor de Rust, atiende cada petición con el
// protocolo y las herramientas, publica mcp.json (puerto, token y ruta de la app para el puente) y
// conecta a Claude Desktop (paquete .mcpb) y a Claude Code (HTTP) con un clic.
import { mcp, fs, appPaths, proc, inTauri, type AppPaths } from "../lib/ipc";
import { getSettings, saveSettings } from "../lib/settings";
import { emit } from "../lib/bus";
import { uid, joinPath } from "../lib/util";
import { UserError } from "../lib/events";
import { resolveLauncher } from "../providers/claude";
import { zip, toBase64 } from "../lib/zip";
import { handleRpc, type ServerSpec } from "./protocol";
import { TOOLS } from "./tools";
import { PROMPTS, INSTRUCTIONS } from "./prompts";
import BRIDGE from "./bridge.cjs?raw";
import ICON from "../../src-tauri/icons/128x128.png?inline";
import pkg from "../../package.json";

export interface McpCall { at: number; tool: string; ok: boolean; ms: number; client: string; summary: string }
const calls: McpCall[] = [];
const state = { running: false, port: 0, error: "" };
export const mcpState = () => ({ ...state, calls: [...calls].reverse() });

export const SPEC: ServerSpec = {
  name: "atril", title: "ATRIL", version: pkg.version, instructions: INSTRUCTIONS, tools: TOOLS, prompts: PROMPTS,
  onCall: (e) => { calls.push({ at: Date.now(), ...e }); if (calls.length > 50) calls.shift(); emit("mcp"); },
};

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
const confPath = (p: AppPaths) => joinPath(p.data, "mcp.json");

/** Lo que el puente necesita para hablar con ATRIL o para abrirla si está cerrada. */
async function writeConf(live: { port: number; token: string } | null) {
  const p = await appPaths();
  await fs.writeText(confPath(p), JSON.stringify({ enabled: !!live, port: live?.port ?? 0, token: live?.token ?? "", url: live ? `http://127.0.0.1:${live.port}/mcp` : "",
    exe: p.exe ?? "", pid: p.pid ?? 0, version: pkg.version, updated: Date.now() }, null, 2));
}

let listening = false;
export async function startMcp() {
  if (!inTauri) return;
  const s = getSettings().mcp;
  if (!s.enabled) { await writeConf(null).catch(() => undefined); return; }
  let token = s.token;
  if (!token) { token = newToken(); await saveSettings((x) => ({ ...x, mcp: { ...x.mcp, token } })); }
  if (!listening) {
    listening = true;
    await mcp.onRequest(async (r) => {
      const out = await handleRpc(SPEC, r.body, r.headers)
        .catch((e) => ({ status: 500, body: JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(e?.message ?? e) } }) }));
      await mcp.reply(r.key, out.status, out.body);
    });
  }
  try {
    state.port = await mcp.start(s.port, token);
    state.running = true; state.error = "";
    await writeConf({ port: state.port, token });
  } catch (e: any) { state.running = false; state.error = String(e?.message ?? e); }
  emit("mcp");
}

export async function stopMcp() {
  if (!inTauri) return;
  await mcp.stop();
  state.running = false;
  await writeConf(null).catch(() => undefined);
  emit("mcp");
}

export async function setMcpEnabled(on: boolean) {
  await saveSettings((x) => ({ ...x, mcp: { ...x.mcp, enabled: on } }));
  await (on ? startMcp() : stopMcp());
}

/** Token nuevo: los clientes conectados deben volver a instalarse (el paquete y el comando lo llevan). */
export async function rotateToken() {
  const token = newToken();
  await saveSettings((x) => ({ ...x, mcp: { ...x.mcp, token } }));
  if (state.running) { await mcp.start(getSettings().mcp.port, token); await writeConf({ port: state.port, token }); }
  emit("mcp");
}

export const mcpUrl = () => `http://127.0.0.1:${state.port || getSettings().mcp.port}/mcp`;
export const claudeCodeArgs = () => ["mcp", "add", "--scope", "user", "--transport", "http", "atril", mcpUrl(), "--header", `Authorization: Bearer ${getSettings().mcp.token}`];
export const claudeCodeCommand = () => claudeCodeArgs().map((a) => (/[\s:]/.test(a) ? `"${a}"` : a)).join(" ").replace(/^/, "claude ");

/** Registra ATRIL en Claude Code (todos tus proyectos). Si ya estaba, lo reemplaza. */
export async function addToClaudeCode(): Promise<string> {
  const resolved = await proc.which(getSettings().claude.path || "claude");
  if (!resolved) throw new UserError("No encuentro Claude Code.", "Instálalo o copia el comando y ejecútalo donde lo tengas.", "mcp", false);
  const { program, prefix } = await resolveLauncher(resolved);
  await proc.run({ id: uid("mcp_"), program, args: [...prefix, "mcp", "remove", "--scope", "user", "atril"], timeoutS: 60 }).catch(() => null);
  const r = await proc.run({ id: uid("mcp_"), program, args: [...prefix, ...claudeCodeArgs()], timeoutS: 60 });
  if (r.code !== 0) throw new UserError("Claude Code no aceptó el servidor.", (r.stderr || r.stdout).trim().slice(0, 400), "mcp", false);
  return (r.stdout || "Listo").trim();
}

const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Paquete para Claude Desktop (.mcpb): el puente con su Node incluido. Lo deja en Descargas. */
export async function buildMcpb(): Promise<string> {
  const p = await appPaths();
  const manifest = {
    manifest_version: "0.3", name: "atril", display_name: "ATRIL", version: pkg.version,
    description: "Usa ATRIL desde Claude: crea videos, maneja la cola y las campañas, y llena y ordena tu biblioteca.",
    long_description: "Conecta Claude con ATRIL, el estudio de video de VT Asvent, en este equipo. Claude puede crear videos (personales o del canal), seguir su producción, manejar la cola y las campañas, buscar material con licencia libre, importar archivos y ordenar la biblioteca. Publicar en YouTube sigue siendo solo tuyo, desde ATRIL. Si ATRIL está cerrado, se abre solo.",
    author: { name: "VT Asvent", email: "vt.asvent@gmail.com" },
    icon: "icon.png",
    server: { type: "node", entry_point: "server/index.js", mcp_config: { command: "node", args: ["${__dirname}/server/index.js"], env: { ATRIL_MCP_FILE: confPath(p) } } },
    tools: TOOLS.map((t) => ({ name: t.name, description: t.title })),
    keywords: ["atril", "video", "youtube", "tiktok", "vt asvent"],
    compatibility: { platforms: ["win32", "darwin"], runtimes: { node: ">=16.0.0" } },
  };
  const enc = new TextEncoder();
  const data = zip([
    { name: "manifest.json", data: enc.encode(JSON.stringify(manifest, null, 2)) },
    { name: "server/index.js", data: enc.encode(BRIDGE.replace("__ATRIL_VERSION__", pkg.version)) },
    { name: "icon.png", data: b64ToBytes(ICON.split(",")[1] ?? "") },
  ]);
  await fs.mkdir(p.downloads);
  const file = joinPath(p.downloads, "ATRIL.mcpb");
  await fs.writeB64(file, toBase64(data));
  return file;
}

/** Configuración JSON para otros clientes MCP por stdio (necesitan Node): el puente se guarda en la carpeta de datos. */
export async function stdioConfig(): Promise<string> {
  const p = await appPaths();
  const script = joinPath(p.data, "mcp", "atril-mcp.cjs");
  await fs.mkdir(joinPath(p.data, "mcp"));
  await fs.writeText(script, BRIDGE.replace("__ATRIL_VERSION__", pkg.version));
  return JSON.stringify({ mcpServers: { atril: { command: "node", args: [script], env: { ATRIL_MCP_FILE: confPath(p) } } } }, null, 2);
}
