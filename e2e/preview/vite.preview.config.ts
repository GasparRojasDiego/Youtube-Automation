// Sirve la interfaz real de ATRIL en un navegador normal para revisarla a ojo (capturas con Playwright).
// Uso: PREVIEW_DB=/ruta/atril.db npx vite --config e2e/preview/vite.preview.config.ts
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "node:path";
import * as nfs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const here = path.dirname(new URL(import.meta.url).pathname);
const src = process.env.PREVIEW_DB ?? "/tmp/claude-0/e2e/run/atril.db";
const work = "/tmp/claude-0/preview";
nfs.mkdirSync(work, { recursive: true });
const dbFile = path.join(work, "atril.db");
if (!nfs.existsSync(dbFile) || process.env.PREVIEW_FRESH) for (const ext of ["", "-wal", "-shm"]) { try { nfs.copyFileSync(src + ext, dbFile + ext); } catch { /* opcional */ } }
const db = new DatabaseSync(dbFile);
const conv = (p: unknown[] = []) => p.map((x) => (typeof x === "boolean" ? (x ? 1 : 0) : x === undefined ? null : x)) as any[];
const ROOT = path.resolve(here, "../..");

const handlers: Record<string, (a: any) => unknown> = {
  db_query: (a) => db.prepare(a.sql).all(...conv(a.params)).map((r) => ({ ...r })),
  db_execute: (a) => { const r = db.prepare(a.sql).run(...conv(a.params)); return { changes: Number(r.changes), last_id: Number(r.lastInsertRowid) }; },
  db_batch: (a) => a.statements.map((s: any) => { const r = db.prepare(s.sql).run(...conv(s.params)); return { changes: Number(r.changes), last_id: Number(r.lastInsertRowid) }; }),
  db_script: (a) => { db.exec(a.sql); return null; },
  fs_exists: (a) => nfs.existsSync(a.path),
  fs_read_text: (a) => nfs.readFileSync(a.path, "utf8"),
  fs_write_text: (a) => { nfs.mkdirSync(path.dirname(a.path), { recursive: true }); nfs.writeFileSync(a.path, a.contents); return null; },
  fs_mkdir: (a) => { nfs.mkdirSync(a.path, { recursive: true }); return null; },
  fs_list: (a) => (nfs.existsSync(a.path) ? nfs.readdirSync(a.path).map((n) => { const f = path.join(a.path, n); const st = nfs.statSync(f); return { name: n, path: f, is_dir: st.isDirectory(), size: st.size, modified: Math.floor(st.mtimeMs / 1000) }; }) : []),
  fs_size: (a) => nfs.statSync(a.path).size,
  disk_free: () => 120 * 1024 ** 3,
  app_paths: () => ({ data: path.join(work, "data"), exe_dir: work, resources: path.join(ROOT, "src-tauri"), home: work, documents: path.join(work, "docs"), downloads: path.join(work, "Descargas") }),
  secret_get: (a) => (/google|openai|pexels/.test(a.key) ? "x" : null),
  secret_set: () => null, secret_delete: () => null,
  which: () => null,
  "plugin:event|listen": () => 0,
};

const ipc: Plugin = {
  name: "atril-preview-ipc",
  configureServer(server) {
    server.middlewares.use("/__ipc", (req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { cmd, args } = JSON.parse(body || "{}");
        try {
          const h = handlers[cmd];
          if (!h) throw new Error(`Sin simulación: ${cmd}`);
          res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ value: h(args ?? {}) ?? null }));
        } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String((e as Error).message) })); }
      });
    });
    server.middlewares.use("/__file", (req, res) => {
      const p = decodeURIComponent(new URL(req.url!, "http://x").searchParams.get("p") ?? "");
      if (!p || !nfs.existsSync(p)) { res.statusCode = 404; res.end(); return; }
      res.end(nfs.readFileSync(p));
    });
  },
};

// Con PREVIEW_STRICT=1 la página corre con la misma política de seguridad que la app (CSP y prototipos congelados)
const strict: Plugin = {
  name: "atril-preview-strict",
  transformIndexHtml: (html) => process.env.PREVIEW_STRICT
    ? html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' ws:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"><script>Object.freeze(Object.prototype);Object.freeze(Array.prototype);</script>`)
    : html,
};

export default defineConfig({
  root: ROOT,
  plugins: [react(), ipc, strict],
  resolve: {
    alias: {
      "@tauri-apps/api/core": path.join(here, "shim-core.ts"),
      "@tauri-apps/api/event": path.join(here, "shim-event.ts"),
      "@tauri-apps/api/app": path.join(here, "shim-app.ts"),
      "@tauri-apps/plugin-opener": path.join(here, "shim-plugins.ts"),
      "@tauri-apps/plugin-dialog": path.join(here, "shim-plugins.ts"),
    },
  },
  server: { port: 1430, strictPort: true },
  clearScreen: false,
});
