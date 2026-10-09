// Actualización: consulta la última versión publicada en GitHub, la descarga
// mostrando el avance real, verifica su huella SHA-256 contra la que publica
// GitHub y la instala en silencio (sin ventanas de consola); ATRIL se cierra
// solo en ese último paso y el instalador la vuelve a abrir.
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { http, fs, appPaths, db } from "./ipc";
import { emit } from "./bus";
import { joinPath, safeJson } from "./util";
import { toast, logError } from "./events";

export const REPO = "GasparRojasDiego/Youtube-Automation";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

export type Phase = "idle" | "download" | "verify" | "install" | "error";
export interface UpdateState {
  available: boolean; version?: string; url?: string; size?: number; sha256?: string; notes?: string; portable?: boolean;
  busy: boolean; phase: Phase; done: number; total: number; speed: number; error?: string;
}
let state: UpdateState = { available: false, busy: false, phase: "idle", done: 0, total: 0, speed: 0 };
let started = false;

export const updateState = () => state;
const set = (p: Partial<UpdateState>) => { state = { ...state, ...p }; emit("update"); };

export async function appVersion(): Promise<string> {
  try { return await getVersion(); } catch { return ""; }
}

/** ¿`a` es más nueva que `b`? (versiones x.y.z) */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0); }
  return false;
}

const meta = async <T>(key: string, fallback: T) => safeJson<T>((await db.query<{ value: string }>("SELECT value FROM meta WHERE key=?", [key]))[0]?.value, fallback);
const setMeta = (key: string, v: unknown) => db.execute("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)", [key, JSON.stringify(v)]);

export async function checkForUpdate(): Promise<UpdateState> {
  const current = await appVersion();
  if (!current || state.busy) return state;
  try {
    const r = await http.request({ url: `https://api.github.com/repos/${REPO}/releases/latest`, headers: { Accept: "application/vnd.github+json", "User-Agent": "ATRIL" }, timeoutS: 30 });
    if (r.status !== 200) return state;
    const rel = JSON.parse(r.body);
    const version = String(rel.tag_name ?? "").replace(/^v/, "");
    const asset = (rel.assets ?? []).find((a: any) => /_instalador_x64\.exe$/i.test(a.name));
    const p = await appPaths();
    set({
      available: !!version && !!asset && isNewer(version, current), version, url: asset?.browser_download_url, size: Number(asset?.size ?? 0),
      sha256: /^sha256:[0-9a-f]{64}$/i.test(asset?.digest ?? "") ? asset.digest.slice(7).toLowerCase() : undefined,
      notes: rel.body ?? "", portable: !(await fs.exists(joinPath(p.exe_dir, "uninstall.exe"))),
    });
  } catch { /* sin conexión: se reintenta más tarde */ }
  return state;
}

/** Comprueba al iniciar y cada 6 horas; si se acaba de actualizar, mide cuánto tardó la instalación. */
export function startUpdateChecks() {
  if (started) return;
  started = true;
  void (async () => {
    const pending = await meta<{ to: string; at: number } | null>("update_pending", null);
    if (pending && pending.to === (await appVersion())) {
      await setMeta("update_install_ms", Math.min(120_000, Math.max(3000, Date.now() - pending.at)));
      await db.execute("DELETE FROM meta WHERE key='update_pending'");
      toast("success", `ATRIL se actualizó a la versión ${pending.to}`);
    }
  })().catch(() => null);
  setTimeout(() => void checkForUpdate(), 8000);
  setInterval(() => void checkForUpdate(), 6 * 3600_000);
}

/** Segundos que tarda instalar: lo medido en la última actualización o, si no hay dato, según el tamaño. */
export async function installSeconds(): Promise<number> {
  const ms = await meta<number | null>("update_install_ms", null);
  return ms ? ms / 1000 : 6 + (state.size ?? 60e6) / 25e6;
}

/**
 * Mide la velocidad real de descarga ahora mismo (los primeros ~3 MB del propio
 * instalador, separando la latencia inicial del flujo de datos) y estima el
 * tiempo total: latencia + descarga + verificación + instalación.
 */
export async function estimate(): Promise<{ speed: number; seconds: number }> {
  if (!state.url) throw new Error("No hay actualización.");
  const p = await invoke<{ bytes: number; ttfb_ms: number; body_ms: number }>("update_probe", { url: state.url });
  const speed = p.bytes / Math.max(0.02, p.body_ms / 1000);
  return { speed, seconds: p.ttfb_ms / 1000 + (state.size ?? 0) / speed + (state.size ?? 0) / 400e6 + (await installSeconds()) };
}

export async function installUpdate() {
  if (!state.available || !state.url || state.busy || state.portable) return;
  let off: (() => void) | null = null;
  try {
    set({ busy: true, phase: "download", done: 0, total: state.size ?? 0, speed: 0, error: undefined });
    const dir = joinPath((await appPaths()).data, "actualizaciones");
    await fs.mkdir(dir);
    const file = joinPath(dir, `ATRIL_${state.version}_instalador_x64.exe`);
    // Velocidad suavizada (media exponencial) para un tiempo restante estable
    let last = { t: performance.now(), b: 0 };
    off = await listen<{ done: number; total: number }>("update-progress", (e) => {
      const now = performance.now(), dt = (now - last.t) / 1000;
      if (dt < 0.25 && e.payload.done < e.payload.total) return;
      const inst = (e.payload.done - last.b) / Math.max(0.001, dt);
      last = { t: now, b: e.payload.done };
      set({ done: e.payload.done, total: e.payload.total || state.total, speed: state.speed ? state.speed * 0.7 + inst * 0.3 : inst });
    });
    const hash = await invoke<string>("update_download", { url: state.url, path: file });
    set({ phase: "verify" });
    if (state.sha256 && hash !== state.sha256) throw new Error("La huella SHA-256 del instalador no coincide con la publicada en GitHub. Se descartó por seguridad.");
    if ((await fs.size(file)) < 5_000_000) throw new Error("El instalador descargado está incompleto.");
    set({ phase: "install" });
    await setMeta("update_pending", { to: state.version, at: Date.now() });
    await new Promise((r) => setTimeout(r, 600));
    await invoke("update_install", { installer: file }); // ATRIL se cierra y el instalador la vuelve a abrir
  } catch (e) {
    set({ busy: false, phase: "error", error: e instanceof Error ? e.message : String(e) });
    await logError(e, null, "Actualización");
  } finally { off?.(); }
}
