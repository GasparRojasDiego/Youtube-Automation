// Puente tipado con el núcleo Rust (src-tauri/src/*.rs).
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type Row = Record<string, any>;

export const db = {
  execute: (sql: string, params: unknown[] = []) =>
    invoke<{ changes: number; last_id: number }>("db_execute", { sql, params }),
  query: <T = Row>(sql: string, params: unknown[] = []) => invoke<T[]>("db_query", { sql, params }),
  batch: (statements: { sql: string; params?: unknown[] }[]) =>
    invoke<{ changes: number; last_id: number }[]>("db_batch", { statements }),
  script: (sql: string) => invoke<void>("db_script", { sql }),
};

export interface DirEntry { name: string; path: string; is_dir: boolean; size: number; modified: number }

export const fs = {
  readText: (path: string) => invoke<string>("fs_read_text", { path }),
  writeText: (path: string, contents: string) => invoke<void>("fs_write_text", { path, contents }),
  writeB64: (path: string, data: string) => invoke<number>("fs_write_b64", { path, data }),
  readB64: (path: string) => invoke<string>("fs_read_b64", { path }),
  exists: (path: string) => invoke<boolean>("fs_exists", { path }),
  mkdir: (path: string) => invoke<void>("fs_mkdir", { path }),
  remove: (path: string) => invoke<void>("fs_remove", { path }),
  copy: (from: string, to: string) => invoke<void>("fs_copy", { from, to }),
  list: (path: string) => invoke<DirEntry[]>("fs_list", { path }),
  size: (path: string) => invoke<number>("fs_size", { path }),
  diskFree: (path: string) => invoke<number>("disk_free", { path }),
};

export interface HttpRes { status: number; headers: Record<string, string>; body: string }
export interface HttpReq {
  method?: string; url: string; headers?: Record<string, string>;
  bodyText?: string; bodyB64?: string; timeoutS?: number; response?: "text" | "base64";
}

export const http = {
  request: (r: HttpReq) =>
    invoke<HttpRes>("http_request", {
      req: {
        method: r.method ?? "GET", url: r.url, headers: r.headers ?? {},
        body_text: r.bodyText ?? null, body_b64: r.bodyB64 ?? null,
        timeout_s: r.timeoutS ?? 120, response: r.response ?? "text",
      },
    }),
  download: (url: string, path: string, headers?: Record<string, string>) =>
    invoke<number>("http_download", { url, path, headers: headers ?? null }),
};

export interface ProcRes { code: number; stdout: string; stderr: string; timed_out: boolean }
export interface ProcReq {
  id: string; program: string; args?: string[]; cwd?: string; stdin?: string;
  env?: Record<string, string>; stream?: boolean; timeoutS?: number;
}

export const proc = {
  run: (r: ProcReq) =>
    invoke<ProcRes>("proc_run", {
      req: { id: r.id, program: r.program, args: r.args ?? [], cwd: r.cwd ?? null, stdin: r.stdin ?? null,
        env: r.env ?? {}, stream: !!r.stream, timeout_s: r.timeoutS ?? null },
    }),
  kill: (id: string) => invoke<boolean>("proc_kill", { id }),
  which: (program: string) => invoke<string | null>("which", { program }),
  spawn: (id: string, program: string, args: string[]) => invoke<number>("proc_spawn", { id, program, args }),
  stop: (id: string) => invoke<boolean>("proc_stop", { id }),
  onLine: (cb: (e: { id: string; stream: string; line: string }) => void): Promise<UnlistenFn> =>
    listen<{ id: string; stream: string; line: string }>("proc-line", (ev) => cb(ev.payload)),
};

export const media = {
  wavDuration: (path: string) => invoke<number>("wav_duration", { path }),
};

export const secrets = {
  set: (key: string, value: string) => invoke<void>("secret_set", { key, value }),
  get: (key: string) => invoke<string | null>("secret_get", { key }),
  remove: (key: string) => invoke<void>("secret_delete", { key }),
};

export const oauth = {
  listen: () => invoke<number>("oauth_listen"),
  wait: (port: number, timeoutS = 300) => invoke<Record<string, string>>("oauth_wait", { port, timeoutS }),
};

export const youtubeUpload = (id: string, filePath: string, metadataJson: string, accessToken: string, sessionUrl?: string | null) =>
  invoke<string>("youtube_upload", { id, filePath, metadataJson, accessToken, sessionUrl: sessionUrl ?? null });

export const onUploadProgress = (cb: (p: { id: string; sent: number; total: number }) => void) =>
  listen<{ id: string; sent: number; total: number }>("upload-progress", (e) => cb(e.payload));
export const onUploadSession = (cb: (p: { id: string; session: string }) => void) =>
  listen<{ id: string; session: string }>("upload-session", (e) => cb(e.payload));

export interface AppPaths { data: string; exe_dir: string; resources: string; home: string; documents: string; downloads: string }
let pathsCache: AppPaths | null = null;
export async function appPaths(): Promise<AppPaths> {
  if (!pathsCache) pathsCache = await invoke<AppPaths>("app_paths");
  return pathsCache;
}

/** URL utilizable en <img>/<video>/<audio> para un archivo local. */
export function fileUrl(path: string, bust?: number | string): string {
  if (!path) return "";
  const u = convertFileSrc(path);
  return bust ? `${u}?v=${bust}` : u;
}

/** Ruta de un recurso incluido con la app (fuentes, GSAP). */
export async function resourcePath(...parts: string[]): Promise<string> {
  const p = await appPaths();
  const sep = p.resources.includes("\\") ? "\\" : "/";
  const a = [p.resources, "resources", ...parts].join(sep);
  return (await fs.exists(a)) ? a : [p.resources, ...parts].join(sep);
}
