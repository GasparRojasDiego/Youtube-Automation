// Actualización de un clic: consulta la última versión publicada en GitHub,
// descarga el instalador y lo ejecuta en silencio; la app se vuelve a abrir sola.
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { http, fs, appPaths } from "./ipc";
import { emit } from "./bus";
import { joinPath } from "./util";
import { toast, logError } from "./events";

export const REPO = "GasparRojasDiego/Youtube-Automation";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

export interface UpdateState { available: boolean; version?: string; url?: string; notes?: string; busy: boolean; progress?: string; checkedAt?: number }
let state: UpdateState = { available: false, busy: false };
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

export async function checkForUpdate(): Promise<UpdateState> {
  const current = await appVersion();
  if (!current) return state;
  try {
    const r = await http.request({ url: `https://api.github.com/repos/${REPO}/releases/latest`, headers: { Accept: "application/vnd.github+json", "User-Agent": "ATRIL" }, timeoutS: 30 });
    if (r.status !== 200) return state;
    const rel = JSON.parse(r.body);
    const version = String(rel.tag_name ?? "").replace(/^v/, "");
    const asset = (rel.assets ?? []).find((a: any) => /_instalador_x64\.exe$/i.test(a.name)) ?? (rel.assets ?? []).find((a: any) => /setup.*\.exe$/i.test(a.name));
    set({ available: !!version && !!asset && isNewer(version, current), version, url: asset?.browser_download_url, notes: rel.body ?? "", checkedAt: Date.now() });
  } catch { /* sin conexión: se reintenta más tarde */ }
  return state;
}

/** Comprueba al iniciar y cada 6 horas. */
export function startUpdateChecks() {
  if (started) return;
  started = true;
  setTimeout(() => void checkForUpdate(), 8000);
  setInterval(() => void checkForUpdate(), 6 * 3600_000);
}

/** Instalada con el instalador (tiene desinstalador) o versión portátil/MSI. */
async function installedWithNsis(): Promise<boolean> {
  const p = await appPaths();
  return fs.exists(joinPath(p.exe_dir, "uninstall.exe"));
}

export async function installUpdate() {
  if (!state.available || !state.url || state.busy) return;
  try {
    if (!(await installedWithNsis())) {
      toast("info", "Esta copia es portátil: descarga la nueva versión desde la página.");
      await openUrl(RELEASES_URL);
      return;
    }
    set({ busy: true, progress: "Descargando…" });
    const dir = joinPath((await appPaths()).data, "actualizaciones");
    await fs.mkdir(dir);
    const file = joinPath(dir, `ATRIL_${state.version}_instalador_x64.exe`);
    await http.download(state.url, file, { "User-Agent": "ATRIL" });
    if ((await fs.size(file)) < 5_000_000) throw new Error("El instalador descargado está incompleto.");
    set({ progress: "Instalando…" });
    await invoke("update_install", { installer: file }); // la app se cierra y se vuelve a abrir actualizada
  } catch (e) {
    set({ busy: false, progress: undefined });
    await logError(e, null, "Actualización");
    toast("warn", "No se pudo actualizar.", "Puedes descargarla desde la página de ATRIL.");
  }
}
