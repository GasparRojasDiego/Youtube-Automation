// Implementación en Node del puente con el núcleo Rust (src/lib/ipc.ts), para
// probar el pipeline completo fuera de la app (Claude Code, ffmpeg y Chromium reales).
import { DatabaseSync } from "node:sqlite";
import { spawn, type ChildProcess } from "node:child_process";
import * as nfs from "node:fs";
import * as path from "node:path";

export const inTauri = false;
export type Row = Record<string, any>;

let dbh: DatabaseSync | null = null;
export function openDb(file: string) { dbh = new DatabaseSync(file); dbh.exec("PRAGMA journal_mode=WAL;"); }
const conv = (p: unknown[]) => p.map((x) => (typeof x === "boolean" ? (x ? 1 : 0) : x === undefined ? null : x)) as any[];

export const db = {
  execute: async (sql: string, params: unknown[] = []) => { const r = dbh!.prepare(sql).run(...conv(params)); return { changes: Number(r.changes), last_id: Number(r.lastInsertRowid) }; },
  query: async <T = Row>(sql: string, params: unknown[] = []) => dbh!.prepare(sql).all(...conv(params)).map((r) => ({ ...r })) as T[],
  batch: async (statements: { sql: string; params?: unknown[] }[]) => {
    dbh!.exec("BEGIN");
    try { const out = statements.map((s) => { const r = dbh!.prepare(s.sql).run(...conv(s.params ?? [])); return { changes: Number(r.changes), last_id: Number(r.lastInsertRowid) }; }); dbh!.exec("COMMIT"); return out; }
    catch (e) { dbh!.exec("ROLLBACK"); throw e; }
  },
  script: async (sql: string) => { dbh!.exec(sql); },
};

export interface DirEntry { name: string; path: string; is_dir: boolean; size: number; modified: number }
export const fs = {
  readText: async (p: string) => nfs.readFileSync(p, "utf8"),
  writeText: async (p: string, c: string) => { nfs.mkdirSync(path.dirname(p), { recursive: true }); nfs.writeFileSync(p, c); },
  writeB64: async (p: string, d: string) => { nfs.mkdirSync(path.dirname(p), { recursive: true }); const b = Buffer.from(d, "base64"); nfs.writeFileSync(p, b); return b.length; },
  readB64: async (p: string) => nfs.readFileSync(p).toString("base64"),
  exists: async (p: string) => nfs.existsSync(p),
  mkdir: async (p: string) => { nfs.mkdirSync(p, { recursive: true }); },
  remove: async (p: string) => { nfs.rmSync(p, { recursive: true, force: true }); },
  copy: async (a: string, b: string) => { nfs.mkdirSync(path.dirname(b), { recursive: true }); nfs.copyFileSync(a, b); },
  list: async (p: string): Promise<DirEntry[]> => (nfs.existsSync(p) ? nfs.readdirSync(p).map((n) => { const f = path.join(p, n); const st = nfs.statSync(f); return { name: n, path: f, is_dir: st.isDirectory(), size: st.size, modified: Math.floor(st.mtimeMs / 1000) }; }) : []),
  size: async (p: string) => nfs.statSync(p).size,
  diskFree: async (p: string) => { const s = nfs.statfsSync(p); return s.bavail * s.bsize; },
};

export interface HttpRes { status: number; headers: Record<string, string>; body: string }
export interface HttpReq { method?: string; url: string; headers?: Record<string, string>; bodyText?: string; bodyB64?: string; timeoutS?: number; response?: "text" | "base64" }
export const http = {
  request: async (_r: HttpReq): Promise<HttpRes> => { throw new Error("Red deshabilitada en la prueba"); },
  download: async (_u: string, _p: string): Promise<number> => { throw new Error("Red deshabilitada en la prueba"); },
};

type Line = { id: string; stream: string; line: string };
const lineSubs = new Set<(e: Line) => void>();
const running = new Map<string, ChildProcess>();
export interface ProcRes { code: number; stdout: string; stderr: string; timed_out: boolean }
export interface ProcReq { id: string; program: string; args?: string[]; cwd?: string; stdin?: string; env?: Record<string, string>; stream?: boolean; timeoutS?: number }

export const proc = {
  run: (r: ProcReq) => new Promise<ProcRes>((resolve) => {
    const cp = spawn(r.program, r.args ?? [], { cwd: r.cwd, env: { ...process.env, ...(r.env ?? {}) } });
    running.set(r.id, cp);
    let out = "", err = "", timedOut = false;
    const pump = (stream: "stdout" | "stderr") => {
      let buf = "";
      return (d: Buffer) => {
        const s = d.toString(); if (stream === "stdout") out += s; else err += s;
        if (!r.stream) return;
        buf += s; const lines = buf.split(/\r?\n|\r/); buf = lines.pop() ?? "";
        for (const l of lines) lineSubs.forEach((f) => f({ id: r.id, stream, line: l }));
      };
    };
    cp.stdout!.on("data", pump("stdout")); cp.stderr!.on("data", pump("stderr"));
    const t = r.timeoutS ? setTimeout(() => { timedOut = true; cp.kill("SIGKILL"); }, r.timeoutS * 1000) : null;
    cp.on("close", (code) => { if (t) clearTimeout(t); running.delete(r.id); resolve({ code: code ?? -1, stdout: out, stderr: err, timed_out: timedOut }); });
    cp.on("error", (e) => { err += String(e); });
    if (r.stdin != null) cp.stdin!.end(r.stdin); else cp.stdin!.end();
  }),
  kill: async (id: string) => { const c = running.get(id); if (c) c.kill("SIGKILL"); return !!c; },
  which: async (program: string) => {
    if (path.isAbsolute(program)) return nfs.existsSync(program) ? program : null;
    for (const d of (process.env.PATH ?? "").split(":")) { const f = path.join(d, program); if (nfs.existsSync(f)) return f; }
    return null;
  },
  spawn: async (id: string, program: string, args: string[]) => {
    const extra = /chrom/i.test(program) ? ["--no-sandbox"] : [];
    const cp = spawn(program, [...extra, ...args], { stdio: "ignore" }); running.set(id, cp); return cp.pid ?? 0;
  },
  stop: async (id: string) => { const c = running.get(id); if (c) c.kill("SIGKILL"); running.delete(id); return true; },
  onLine: async (cb: (e: Line) => void) => { lineSubs.add(cb); return () => { lineSubs.delete(cb); }; },
};

const secretStore = new Map<string, string>();
export const secrets = {
  set: async (k: string, v: string) => { secretStore.set(k, v); },
  get: async (k: string) => secretStore.get(k) ?? null,
  remove: async (k: string) => { secretStore.delete(k); },
};
export const oauth = { listen: async () => 0, wait: async () => ({}) };
export const youtubeUpload = async () => { throw new Error("no"); };
export const onUploadProgress = async () => () => {};
export const onUploadSession = async () => () => {};

export interface AppPaths { data: string; exe_dir: string; resources: string; home: string; documents: string }
let paths: AppPaths | null = null;
export function setPaths(p: AppPaths) { paths = p; }
export async function appPaths(): Promise<AppPaths> { return paths!; }
export function fileUrl(p: string) { return p; }
export async function resourcePath(...parts: string[]): Promise<string> {
  const p = await appPaths();
  const a = path.join(p.resources, "resources", ...parts);
  return nfs.existsSync(a) ? a : path.join(p.resources, ...parts);
}
