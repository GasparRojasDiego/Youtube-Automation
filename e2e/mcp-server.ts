// Servidor HTTP de prueba con las mismas reglas que src-tauri/src/mcp.rs (127.0.0.1, Host local, sin
// Origin, token, solo POST /mcp) que atiende con el protocolo real. Sirve para probar el puente y para
// que un Claude real use las herramientas sin la ventana de la app.
import * as http from "node:http";
import { handleRpc, type ServerSpec } from "../src/mcp/protocol";

export async function startTestServer(spec: ServerSpec, token: string): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const port = (server.address() as { port: number }).port;
    const end = (status: number, body = "") => { res.writeHead(status, body ? { "Content-Type": "application/json" } : {}); res.end(body); };
    const host = req.headers.host ?? "";
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) return end(403);
    if (req.headers.origin) return end(403);
    if ((req.url ?? "").split("?")[0] !== "/mcp") return end(404);
    if (req.method !== "POST") return end(405);
    if (req.headers.authorization !== `Bearer ${token}`) return end(401);
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const headers: Record<string, string> = {};
      for (const k of ["mcp-protocol-version", "mcp-method", "mcp-name", "user-agent"]) if (typeof req.headers[k] === "string") headers[k] = req.headers[k] as string;
      const out = await handleRpc(spec, Buffer.concat(chunks).toString("utf8"), headers);
      end(out.status, out.body);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return { port: (server.address() as { port: number }).port, close: () => new Promise<void>((r) => server.close(() => r())) };
}
